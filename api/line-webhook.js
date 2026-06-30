// api/line-webhook.js — 接收 LINE 加好友/封鎖事件，存使用者 ID

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const LINE_TOKEN    = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const WELCOME_MSG =
`🕊️ 歡迎加入全民股咕股！

我是股咕股，每天會幫你巡檢自選股，
發現有股票進入「極低估」或「泡沫區」時通知你。
沒有特別狀況時，也會發平安報告讓你安心。

📊 開始使用：
1. 到網站登入帳號
2. 把想關注的股票加入「自選組合」
3. 之後就交給我巡邏囉！

→ https://gugugu-stock.vercel.app

⚠️ 本服務僅供參考，不構成投資建議`;

async function sendWelcome(userId) {
  if (!LINE_TOKEN) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${LINE_TOKEN}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: WELCOME_MSG }],
      }),
    });
  } catch (err) {
    console.error('LINE welcome message error:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true }); // LINE 驗證用，必須回 200
    return;
  }

  try {
    const events = req.body?.events || [];

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase 環境變數未設定');
      res.status(200).json({ ok: true });
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth:     { persistSession: false },
      realtime: { transport: () => null },
    });

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      if (event.type === 'follow') {
        // 加好友：新增或重新啟用訂閱
        await supabase
          .from('line_subscribers')
          .upsert({ line_user_id: userId, active: true }, { onConflict: 'line_user_id' });
        console.log(`LINE 新訂閱: ${userId}`);
        await sendWelcome(userId);
      }

      if (event.type === 'unfollow') {
        // 封鎖/取消好友：標記為不啟用
        await supabase
          .from('line_subscribers')
          .update({ active: false })
          .eq('line_user_id', userId);
        console.log(`LINE 取消訂閱: ${userId}`);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('LINE webhook error:', err.message);
    res.status(200).json({ ok: true }); // 即使出錯也要回 200，避免 LINE 重試風暴
  }
}
