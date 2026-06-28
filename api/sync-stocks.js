// api/sync-stocks.js — 美股批次同步到 Supabase
// Cron Job 每天美股收盤後執行，把財務數據存進 stocks_cache

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const FINNHUB_KEY   = process.env.FINNHUB_API_KEY;
const BASE          = 'https://finnhub.io/api/v1';

// 完整美股清單（Finnhub 免費版實測支援）
const US_STOCKS = [
  { sym:"AAPL",  name:"Apple",              industry:"Technology"     },
  { sym:"MSFT",  name:"Microsoft",          industry:"Technology"     },
  { sym:"NVDA",  name:"Nvidia",             industry:"Semiconductors" },
  { sym:"GOOGL", name:"Alphabet",           industry:"Technology"     },
  { sym:"META",  name:"Meta Platforms",     industry:"Technology"     },
  { sym:"AMZN",  name:"Amazon",             industry:"E-Commerce"     },
  { sym:"TSLA",  name:"Tesla",              industry:"Automobiles"    },
  { sym:"NFLX",  name:"Netflix",            industry:"Entertainment"  },
  { sym:"AMD",   name:"AMD",                industry:"Semiconductors" },
  { sym:"INTC",  name:"Intel",              industry:"Semiconductors" },
  { sym:"QCOM",  name:"Qualcomm",           industry:"Semiconductors" },
  { sym:"AVGO",  name:"Broadcom",           industry:"Semiconductors" },
  { sym:"TSM",   name:"TSMC ADR",           industry:"Semiconductors" },
  { sym:"AMAT",  name:"Applied Materials",  industry:"Semiconductors" },
  { sym:"LRCX",  name:"Lam Research",       industry:"Semiconductors" },
  { sym:"KLAC",  name:"KLA Corp",           industry:"Semiconductors" },
  { sym:"MCHP",  name:"Microchip Tech",     industry:"Semiconductors" },
  { sym:"MRVL",  name:"Marvell Tech",       industry:"Semiconductors" },
  { sym:"ON",    name:"ON Semiconductor",   industry:"Semiconductors" },
  { sym:"TXN",   name:"Texas Instruments",  industry:"Semiconductors" },
  { sym:"ARM",   name:"Arm Holdings",       industry:"Semiconductors" },
  { sym:"CRM",   name:"Salesforce",         industry:"Technology"     },
  { sym:"ORCL",  name:"Oracle",             industry:"Technology"     },
  { sym:"IBM",   name:"IBM",                industry:"Technology"     },
  { sym:"ADBE",  name:"Adobe",              industry:"Technology"     },
  { sym:"SHOP",  name:"Shopify",            industry:"Technology"     },
  { sym:"CRWD",  name:"CrowdStrike",        industry:"Cybersecurity"  },
  { sym:"NET",   name:"Cloudflare",         industry:"Technology"     },
  { sym:"SMCI",  name:"Super Micro",        industry:"Technology"     },
  { sym:"DELL",  name:"Dell Technologies",  industry:"Technology"     },
  { sym:"HPQ",   name:"HP Inc.",            industry:"Technology"     },
  { sym:"V",     name:"Visa",               industry:"Finance"        },
  { sym:"MA",    name:"Mastercard",         industry:"Finance"        },
  { sym:"AXP",   name:"American Express",   industry:"Finance"        },
  { sym:"USB",   name:"U.S. Bancorp",       industry:"Banking"        },
  { sym:"PNC",   name:"PNC Financial",      industry:"Banking"        },
  { sym:"COIN",  name:"Coinbase",           industry:"Fintech"        },
];

function calcZone(price, bm) {
  if (!bm || bm === 0) return null;
  const r = price / bm;
  if (r < 0.85) return { zone: '極低估區', ratio: r };
  if (r < 1.00) return { zone: '低估區',   ratio: r };
  if (r < 1.15) return { zone: '合理區',   ratio: r };
  if (r < 1.30) return { zone: '偏高區',   ratio: r };
  if (r < 2.00) return { zone: '高估區',   ratio: r };
  return               { zone: '泡沫區',   ratio: r };
}

async function fetchWithTimeout(url, ms = 8000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!FINNHUB_KEY)  return res.status(500).json({ error: 'FINNHUB_API_KEY 未設定' });
  if (!SUPABASE_URL) return res.status(500).json({ error: 'SUPABASE_URL 未設定' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth:     { persistSession: false },
    realtime: { transport: () => null },  // 停用 WebSocket
  });
  const results  = [];
  const errors   = [];

  // 批次處理，每批 3 檔，間隔 1.2 秒（Finnhub 免費版 60 req/min）
  const BATCH = 3;
  const DELAY = 1200;

  for (let i = 0; i < US_STOCKS.length; i += BATCH) {
    const batch = US_STOCKS.slice(i, i + BATCH);

    await Promise.all(batch.map(async (s) => {
      try {
        const [qr, fr] = await Promise.all([
          fetchWithTimeout(`${BASE}/quote?symbol=${s.sym}&token=${FINNHUB_KEY}`),
          fetchWithTimeout(`${BASE}/stock/metric?symbol=${s.sym}&metric=all&token=${FINNHUB_KEY}`),
        ]);

        if (!qr.ok || !fr.ok) {
          errors.push(`${s.sym}: HTTP ${qr.status}/${fr.status}`);
          return;
        }

        const quote  = await qr.json();
        const metric = await fr.json();
        const m      = metric?.metric || {};

        const price     = quote.c || quote.pc || 0;
        if (!price) { errors.push(`${s.sym}: no price`); return; }

        const bps = m['bookValuePerShareAnnual'] || m['bookValuePerShareQuarterly'] || null;
        const eps = m['epsNormalizedAnnual']     || m['epsTTM']                     || null;
        const roe = (bps && eps) ? (eps / bps) * 100
                  : m['roeTTM'] || m['roeAnnual'] || null;
        const bm  = (bps && roe) ? bps * (roe / 100) * 10 : null;
        const zoneInfo = bm ? calcZone(price, bm) : null;

        results.push({
          symbol:     s.sym,
          name:       quote.name || s.name,
          market:     'US',
          industry:   s.industry,
          price,
          change_pct: quote.pc ? Math.round(((price - quote.pc) / quote.pc) * 10000) / 100 : null,
          pe:         m['peNormalizedAnnual'] || m['peTTM']       || null,
          pb:         m['pbAnnual']           || m['pbQuarterly'] || null,
          div_yield:  m['dividendYieldIndicatedAnnual']           || null,
          roe,
          bps,
          bm,
          zone:       zoneInfo?.zone  || null,
          ratio:      zoneInfo?.ratio || null,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        errors.push(`${s.sym}: ${err.message}`);
      }
    }));

    if (i + BATCH < US_STOCKS.length) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }

  // Upsert 到 Supabase
  if (results.length > 0) {
    const { error: dbErr } = await supabase
      .from('stocks_cache')
      .upsert(results, { onConflict: 'symbol' });

    if (dbErr) {
      return res.status(500).json({ error: dbErr.message, synced: results.length });
    }
  }

  return res.status(200).json({
    success:  true,
    synced:   results.length,
    errors:   errors.length,
    errorLog: errors,
    updatedAt: new Date().toISOString(),
  });
}
