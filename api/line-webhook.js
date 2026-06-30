// api/line-webhook.js — 接收 LINE 加好友/封鎖事件，存使用者 ID

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

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
