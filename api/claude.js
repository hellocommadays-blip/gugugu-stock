// api/claude.js — Claude API proxy（避免前端暴露 API Key）

import { createClient } from '@supabase/supabase-js';

const DAILY_LIMIT = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY 未設定' });
    return;
  }

  // ── 驗證用戶身份 + 使用次數限制 ─────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: '請先登入才能使用 AI 巡檢' });
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );

  // 用 token 取得用戶
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    res.status(401).json({ error: '登入已過期，請重新登入' });
    return;
  }

  // 查今天已使用次數
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', `${today}T00:00:00+00:00`);

  if (count >= DAILY_LIMIT) {
    res.status(429).json({ error: `今日 AI 巡檢已達上限（${DAILY_LIMIT} 次），明天再來！` });
    return;
  }

  try {
    const { stock, bm, zone } = req.body;
    if (!stock) { res.status(400).json({ error: 'stock 必填' }); return; }

    const prompt = `請用繁體中文，以朋友的語氣分析這支股票，輸出三點白話重點（每點50字以內）：

股票：${stock.name}（${stock.symbol}）
市場：${stock.market === 'TW' ? '台股' : stock.market === 'US' ? '美股' : '日股'}
產業：${stock.industry || '未知'}
現價：${stock.price}
估值區間：${zone?.zone || '無法計算'}（×${zone?.ratio?.toFixed(2) || 'N/A'}）
基準值：${bm ? bm.toFixed(2) : '無法計算'}
調整ROE：${stock.adjustedROE ? stock.adjustedROE.toFixed(2) + '%' : '無資料'}
本益比PE：${stock.pe ? stock.pe + '×' : '無資料'}
股價淨值比PB：${stock.pb ? stock.pb + '×' : '無資料'}
殖利率：${stock.dividendYield ? stock.dividendYield + '%' : '無資料'}

格式：
1. 💰 估值狀況：（說明現在貴不貴）
2. 📊 財務健康：（解讀ROE/殖利率/PE）
3. ⚠️ 注意事項：（投資人應該留意什麼）

不要給買賣建議，只分析現況。`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1000,
        system:     '你是股咕股的 AI 巡檢助理，專門用白話文分析台美日股票。分析客觀，不給買賣建議，語氣像朋友聊天。',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data?.content?.[0]?.text || '';

    // 記錄使用次數
    await supabase.from('ai_usage').insert({ user_id: user.id, symbol: stock?.symbol });
    res.status(200).json({ success: true, analysis: text, remaining: DAILY_LIMIT - count - 1 });

  } catch (err) {
    console.error('Claude proxy error:', err);
    res.status(500).json({ error: err.message });
  }
}
