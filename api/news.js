
// api/news.js — 產業新聞分析
// 抓 Google News RSS → 篩選重點新聞 → Claude 分析影響鏈 + 對照自選股

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;

// Google News RSS 來源（穩定、免費、不需要 API Key）
const RSS_SOURCES = [
  { name: '台股財經', url: 'https://news.google.com/rss/search?q=%E5%8F%B0%E8%82%A1%20when:1d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant' },
  { name: '國際財經', url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=zh-TW&gl=TW&ceid=TW:zh-Hant' },
  { name: '美股動態', url: 'https://news.google.com/rss/search?q=%E7%BE%8E%E8%82%A1%20when:1d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant' },
];

// 簡易 XML 解析（不依賴外部套件）
function parseRSSItems(xml, sourceName) {
  const items = [];
  const itemBlocks = xml.split('<item>').slice(1);

  for (const block of itemBlocks.slice(0, 15)) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch  = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubMatch   = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (!titleMatch) continue;

    let title = titleMatch[1].trim();
    // 移除 CDATA 包裹
    title = title.replace(/<!\[CDATA\[/, '').replace(/\]\]>/, '');
    // Google News 標題格式通常是 "標題 - 來源"，去掉來源
    title = title.replace(/\s*-\s*[^-]+$/, '').trim();

    const link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[/, '').replace(/\]\]>/, '').trim() : '';
    const pubDate = pubMatch ? pubMatch[1].trim() : '';

    if (title.length > 8) {
      items.push({ title, link, pubDate, source: sourceName });
    }
  }

  return items;
}

async function fetchAllNews() {
  const allItems = [];

  await Promise.all(RSS_SOURCES.map(async (src) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) return;
      const xml = await r.text();
      const items = parseRSSItems(xml, src.name);
      allItems.push(...items);
    } catch (err) {
      console.error(`RSS fetch error [${src.name}]:`, err.message);
    }
  }));

  return allItems;
}

// 用 Claude 從候選新聞中篩出 5 則最重要的，並做分析
// newsItems: 已抓下來的候選新聞（含真實 title/link/source），Claude 只需回傳「選中的編號」
// watchlistItems: [{ symbol, name }, ...]（所有用戶自選股聯集，去重）
async function analyzeWithClaude(newsItems, watchlistItems) {
  const candidatePool = newsItems.slice(0, 30); // 候選池上限 30 則，避免 input 過大
  const newsListText = candidatePool
    .map((n, i) => `${i + 1}. ${n.title}`)
    .join('\n');

  const watchlistText = watchlistItems.length > 0
    ? watchlistItems.map(w => `${w.symbol}(${w.name || ''})`).join('、')
    : '（無自選股）';

  const prompt = `你是財經新聞分析助理。以下是今天蒐集到的財經新聞候選清單（前面的編號僅供你選擇時對應使用）：

${newsListText}

請完成兩件事：

**第一件事：重點新聞**
從上面的候選清單中，挑出 5 則對台股/美股市場最重要的新聞（去除重複或不重要的），並針對每則用繁體中文寫一句 50 字內的分析，說明可能造成的影響鏈（例如：原油上漲→航運成本增加→相關類股承壓）。

**第二件事：自選股結構化分析**
以下是目前所有用戶的自選股聯集清單（共 ${watchlistItems.length} 檔）：
${watchlistText}

針對清單中「每一檔」，用繁體中文寫 50 字內的說明：今日新聞是否與它相關，若相關說明影響方向；若完全無關請填「今日無直接相關新聞」。

**輸出格式（非常重要）**

只能輸出一個 JSON 物件，不要加任何額外文字、不要用 Markdown code block 包起來、不要有前後綴，嚴格符合以下結構：

{"topNews":[{"newsIndex":對應候選清單的編號(數字),"impact":"50字內中文說明"}],"stockImpacts":[{"symbol":"股票代號","name":"股票名稱","impact":"50字內中文說明"}]}

規則：
- topNews 必須恰好 5 筆，newsIndex 必須是候選清單裡真實存在的編號，依重要性排序
- stockImpacts 必須逐一列出清單中的每一檔，不能省略、不能新增清單以外的股票，symbol 請直接使用上面清單提供的代號
- 語氣中性客觀，不給買賣建議
- 絕對不要在 JSON 前後加任何說明文字或 Markdown 符號`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1600,
      system:     '你是股咕股的產業新聞分析助理，專門整理財經新聞並分析其市場影響鏈。分析客觀中立，不給買賣建議。只回傳嚴格合法的 JSON，不加任何其他文字。',
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const rawText = data?.content?.[0]?.text || '';

  // 保險：去掉可能誤加的 ```json 包裹，並抓出第一個 { 到最後一個 } 之間的內容
  let jsonPart = rawText.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  const firstBrace = jsonPart.indexOf('{');
  const lastBrace  = jsonPart.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonPart = jsonPart.slice(firstBrace, lastBrace + 1);
  }

  let topNews = [];
  let stockImpacts = [];

  try {
    const parsed = JSON.parse(jsonPart);

    // topNews：把 newsIndex 對應回真正抓到的新聞（拿到真實 title/link/source）
    if (Array.isArray(parsed.topNews)) {
      topNews = parsed.topNews
        .map(n => {
          const idx = Number(n.newsIndex) - 1;
          const original = candidatePool[idx];
          if (!original) return null;
          return {
            title:  original.title,
            link:   original.link || '',
            source: original.source || '',
            impact: n.impact || '',
          };
        })
        .filter(Boolean);
    }

    if (Array.isArray(parsed.stockImpacts)) {
      stockImpacts = parsed.stockImpacts;
    }
  } catch (err) {
    console.error('Claude JSON parse error:', err.message, '\nraw:', jsonPart.slice(0, 300));
  }

  return { topNews, stockImpacts };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!ANTHROPIC_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY 未設定' });
    return;
  }

  // 防護：非 latest 查詢時，需要 Cron Secret 或來自 Vercel Cron 才能觸發真正的分析
  // 避免任何人直接打 /api/news 造成 token 濫用
  if (!req.query.latest) {
    const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
    const cronSecret    = process.env.NEWS_CRON_SECRET;
    const providedSecret = req.query.secret || req.headers['x-cron-secret'];
    const isManualAuth  = !!cronSecret && providedSecret === cronSecret;

    if (!isVercelCron && !isManualAuth) {
      // debug 用：不會洩漏實際密鑰內容，只回傳長度與是否相符，方便排查環境變數問題
      res.status(403).json({
        error: '此端點僅供系統排程觸發，請使用 ?latest=1 查詢最新結果',
        debug: {
          hasEnvSecret:      !!cronSecret,
          envSecretLength:   cronSecret ? cronSecret.length : 0,
          hasProvidedSecret: !!providedSecret,
          providedLength:    providedSecret ? providedSecret.length : 0,
          matches:           isManualAuth,
        },
      });
      return;
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth:     { persistSession: false },
    realtime: { transport: () => null },
  });

  try {
    // ── GET ?latest=1：讀取最新一筆分析（給前端「產業動態」頁用）──
    if (req.query.latest) {
      const { data, error } = await supabase
        .from('news_analysis')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        res.status(200).json({ success: true, data: null });
        return;
      }
      res.status(200).json({ success: true, data });
      return;
    }

    // ── 預設行為：執行一次完整分析（給 Cron 觸發用）──────────

    // 1. 抓所有候選新聞
    const newsItems = await fetchAllNews();
    if (newsItems.length === 0) {
      res.status(200).json({ success: false, error: '無法取得新聞資料' });
      return;
    }

    // 2. 抓所有用戶的自選股（去重），給 Claude 做關聯分析
    const { data: watchlist, error: wlError } = await supabase
      .from('watchlist')
      .select('symbol, name');
    console.log('watchlist count:', watchlist?.length, 'error:', wlError?.message);

    const uniqueMap = new Map();
    (watchlist || []).forEach(w => {
      if (w.symbol && !uniqueMap.has(w.symbol)) {
        uniqueMap.set(w.symbol, { symbol: w.symbol, name: w.name || '' });
      }
    });
    const uniqueWatchlist = [...uniqueMap.values()].slice(0, 30);
    console.log('uniqueWatchlist:', uniqueWatchlist);

    // 3. Claude 分析（回傳「重點新聞 JSON（含真實連結）」+「自選股結構化 JSON」）
    const { topNews, stockImpacts } = await analyzeWithClaude(newsItems, uniqueWatchlist);

    // 4. 存進 Supabase
    await supabase.from('news_analysis').insert({
      top_news:      topNews,
      stock_impacts: stockImpacts,
      news_items:    newsItems.slice(0, 30),
    });

    res.status(200).json({
      success:      true,
      topNews,
      stockImpacts,
      newsCount:    newsItems.length,
      updatedAt:    new Date().toISOString(),
    });

  } catch (err) {
    console.error('news analysis error:', err);
    res.status(500).json({ error: err.message });
  }
}
