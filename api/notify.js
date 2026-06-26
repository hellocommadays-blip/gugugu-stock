// api/notify.js — 股咕股雷達通報
// 掃描 Supabase watchlist，發現估值異動時通知 Telegram

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_ANON_KEY;
const TG_TOKEN        = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID      = process.env.TELEGRAM_CHAT_ID;

// 估值區間
function calcZone(price, bm) {
  if (!bm || bm === 0) return null;
  const r = price / bm;
  if (r < 0.85) return { zone:'極低估區', emoji:'🟢', r };
  if (r < 1.00) return { zone:'低估區',   emoji:'💚', r };
  if (r < 1.15) return { zone:'合理區',   emoji:'🟡', r };
  if (r < 1.30) return { zone:'偏高區',   emoji:'🟠', r };
  if (r < 2.00) return { zone:'高估區',   emoji:'🔴', r };
  return               { zone:'泡沫區',   emoji:'💥', r };
}

// 需要通知的區間（極低估 or 泡沫）
function shouldNotify(zone) {
  return zone === '極低估區' || zone === '低估區' || zone === '泡沫區';
}

// 抓台股即時報價 + 基準值
async function fetchTWStock(sym) {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://gugugu-stock.vercel.app';

    const [priceRes, epsRes] = await Promise.all([
      fetch(`${base}/api/twse?type=price&stockNo=${sym}`).then(r=>r.json()),
      fetch(`${base}/api/twse?type=eps&stockNo=${sym}`).then(r=>r.json()),
    ]);

    if (!priceRes.success) return null;

    const price = priceRes.data.price;
    const name  = priceRes.data.name;
    const eps   = epsRes.success ? epsRes.data : null;
    const bm    = (eps?.adjustedEquityPerShare && eps?.adjustedROE)
      ? eps.adjustedEquityPerShare * (eps.adjustedROE / 100) * 10
      : null;

    return { sym, name, price, bm, market: 'TW', currency: 'NT$' };
  } catch { return null; }
}

// 抓美股即時報價 + 基準值
async function fetchUSStock(sym) {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://gugugu-stock.vercel.app';

    const [quoteRes, finRes] = await Promise.all([
      fetch(`${base}/api/finnhub?symbol=${sym}&market=US&type=quote`).then(r=>r.json()),
      fetch(`${base}/api/finnhub?symbol=${sym}&market=US&type=financials`).then(r=>r.json()),
    ]);

    if (!quoteRes.success) return null;

    const q   = quoteRes.data;
    const fin = finRes.success ? finRes.data : null;
    const bm  = (fin?.adjustedEquityPerShare && fin?.adjustedROE)
      ? fin.adjustedEquityPerShare * (fin.adjustedROE / 100) * 10
      : null;

    return { sym, name: q.name, price: q.price, bm, market: 'US', currency: '$' };
  } catch { return null; }
}

// 發送 Telegram 訊息
async function sendTelegram(msg) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    TG_CHAT_ID,
      text:       msg,
      parse_mode: 'HTML',
    }),
  });
}

export default async function handler(req, res) {
  // 安全驗證（暫時關閉，測試用）
  // const authHeader = req.headers['authorization'];
  // const secret     = process.env.CRON_SECRET;
  // if (secret && authHeader !== `Bearer ${secret}`) {
  //   res.status(401).json({ error: 'Unauthorized' });
  //   return;
  // }

  if (!TG_TOKEN || !TG_CHAT_ID) {
    res.status(500).json({ error: 'Telegram 未設定' });
    return;
  }

  try {
    // 從 Supabase 取得所有用戶的自選清單
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: watchlist } = await supabase
      .from('watchlist')
      .select('symbol, market, name, user_id');

    if (!watchlist?.length) {
      res.status(200).json({ message: '自選清單為空' });
      return;
    }

    // 去重（同一支股票只查一次）
    const unique = [...new Map(watchlist.map(w => [w.symbol, w])).values()];

    const alerts = [];

    for (const item of unique) {
      const isUS = item.market === 'US' || !/^\d{4,6}$/.test(item.symbol);
      const data = isUS
        ? await fetchUSStock(item.symbol)
        : await fetchTWStock(item.symbol);

      if (!data?.price || !data?.bm) continue;

      const zone = calcZone(data.price, data.bm);
      if (!zone || !shouldNotify(zone.zone)) continue;

      alerts.push({
        ...data,
        zone: zone.zone,
        emoji: zone.emoji,
        ratio: zone.r,
      });

      // 避免打太快
      await new Promise(r => setTimeout(r, 300));
    }

    if (alerts.length === 0) {
      // 每天發一則「平安報告」
      const now = new Date();
      now.setHours(now.getHours() + 8);
      const dateStr = `${now.getMonth()+1}/${now.getDate()}`;
      await sendTelegram(
        `🕊️ <b>股咕股雷達 ${dateStr}</b>\n\n` +
        `✅ 自選清單 ${unique.length} 檔巡檢完畢\n` +
        `目前無需特別關注的標的，持續監控中。\n\n` +
        `<a href="https://gugugu-stock.vercel.app">→ 前往股咕股</a>`
      );
    } else {
      // 發送警示訊息
      const now = new Date();
      now.setHours(now.getHours() + 8);
      const dateStr = `${now.getMonth()+1}/${now.getDate()}`;

      let msg = `🕊️ <b>股咕股雷達通報 ${dateStr}</b>\n`;
      msg += `發現 ${alerts.length} 檔需要注意：\n\n`;

      for (const a of alerts) {
        msg += `${a.emoji} <b>${a.name}（${a.symbol}）</b>\n`;
        msg += `　現價：${a.currency}${a.price.toLocaleString()}\n`;
        msg += `　基準值：${a.currency}${a.bm.toFixed(2)}\n`;
        msg += `　估值：<b>${a.zone}</b>（×${a.ratio.toFixed(2)}）\n\n`;
      }

      msg += `<a href="https://gugugu-stock.vercel.app">→ 前往股咕股查看</a>`;
      await sendTelegram(msg);
    }

    res.status(200).json({
      success: true,
      scanned: unique.length,
      alerts:  alerts.length,
    });

  } catch (err) {
    console.error('notify error:', err);
    res.status(500).json({ error: err.message });
  }
}
