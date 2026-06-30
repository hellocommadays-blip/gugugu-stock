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
async function analyzeWithClaude(newsItems, watchlistSymbols) {
  const newsListText = newsItems
    .slice(0, 30) // 候選池上限 30 則，避免 input 過大
    .map((n, i) => `${i + 1}. ${n.title}`)
    .join('\n');

  const watchlistText = watchlistSymbols.length > 0
    ? watchlistSymbols.join('、')
    : '（無自選股）';

  const prompt = `你是財經新聞分析助理。以下是今天蒐集到的財經新聞標題清單：

${newsListText}

請完成兩件事：

**第一步：篩選**
從上面的新聞裡，挑出 5 則對台股/美股市場最重要的新聞（去除重複或不重要的）。

**第二步：分析**
針對篩出的 5 則新聞，用繁體中文寫一份簡短分析報告，格式如下：

📰 今日重點新聞（5則精選）
1. [新聞標題]
   影響：[50字內，說明這則新聞可能造成的影響鏈，例如：原油上漲→航運成本增加→相關類股承壓]

2. ...（依序列出5則）

🎯 對你自選股的影響
自選股清單：${watchlistText}

針對上面新聞，分析是否有任何一則與這些股票相關產業有關聯。如果完全無關，請直接說「今日新聞與您的自選股無直接關聯」。如果有關聯，請具體說明是哪一檔、哪則新聞、可能的影響方向。

語氣維持中性客觀，不給買賣建議，僅做資訊整理與邏輯推演。`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      system:     '你是股咕股的產業新聞分析助理，專門整理財經新聞並分析其市場影響鏈。分析客觀中立，不給買賣建議。',
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  return data?.content?.[0]?.text || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!ANTHROPIC_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY 未設定' });
    return;
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
    const { data: watchlist } = await supabase
      .from('watchlist')
      .select('symbol, name');
    const uniqueSymbols = [...new Set((watchlist || []).map(w => `${w.symbol}(${w.name || ''})`))].slice(0, 30);

    // 3. Claude 分析
    const analysis = await analyzeWithClaude(newsItems, uniqueSymbols);

    // 4. 存進 Supabase
    await supabase.from('news_analysis').insert({
      analysis,
      news_items: newsItems.slice(0, 30),
    });

    res.status(200).json({
      success:    true,
      analysis,
      newsCount:  newsItems.length,
      updatedAt:  new Date().toISOString(),
    });

  } catch (err) {
    console.error('news analysis error:', err);
    res.status(500).json({ error: err.message });
  }
}
