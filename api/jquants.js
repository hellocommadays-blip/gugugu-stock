// api/jquants.js — 日股 J-Quants V2 proxy
// V2 API：x-api-key 認證 + 新 endpoint 路徑

const API_KEY = process.env.JQUANTS_API_KEY;
const BASE    = 'https://api.jquants.com/v2';

async function jFetch(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': API_KEY },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`J-Quants ${path} ${r.status}: ${text}`);
  }
  return r.json();
}

function getJPDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(d.getHours() + 9);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function getRecentTradingDates(count = 7) {
  const dates = [];
  let d = new Date();
  d.setHours(d.getHours() + 9);
  while (dates.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!API_KEY) {
    res.status(500).json({ error: 'JQUANTS_API_KEY 未設定' });
    return;
  }

  const { type, code } = req.query;

  try {
    switch (type) {

      // ── 報價（最近交易日）────────────────────────────────
      // V2 endpoint: /equities/bars/daily
      case 'price': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        const dates = getRecentTradingDates(7);
        let q = null, usedDate = null;

        for (const date of dates) {
          try {
            const data = await jFetch(`/equities/bars/daily?code=${code}&date=${date}`);
            const items = data?.daily_quotes ?? data?.bars ?? data?.data;
            if (items?.length > 0) {
              q = items[0];
              usedDate = date;
              break;
            }
          } catch (_) { continue; }
        }

        if (!q) {
          res.status(404).json({ error: `找不到 ${code} 的報價` });
          return;
        }

        const price     = q.Close ?? q.AdjustmentClose ?? 0;
        const prevClose = q.PreviousClose ?? price;
        const change    = Math.round((price - prevClose) * 100) / 100;
        const changePct = prevClose ? Math.round((change / prevClose) * 10000) / 100 : 0;

        res.status(200).json({
          success: true,
          data: { code, price, prevClose, open: q.Open ?? null, high: q.High ?? null, low: q.Low ?? null, volume: q.Volume ?? null, change, changePct, currency: 'JPY', date: usedDate },
        });
        return;
      }

      // ── 財務資料 ─────────────────────────────────────────
      // V2 endpoint: /fins/summary
      case 'financials': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        const data  = await jFetch(`/fins/summary?code=${code}`);
        const stmts = data?.summary ?? data?.statements ?? data?.data ?? [];
        if (!stmts.length) {
          res.status(200).json({ success: true, data: null, note: '無財務資料' });
          return;
        }

        const annual = stmts
          .filter(s => (s.TypeOfDocument ?? '').includes('Annual') || (s.TypeOfDocument ?? '').includes('FY'))
          .sort((a, b) => (b.CurrentPeriodEndDate ?? '').localeCompare(a.CurrentPeriodEndDate ?? ''))[0]
          ?? stmts[stmts.length - 1];

        const netIncome = parseFloat(annual.NetIncome)  || 0;
        const equity    = parseFloat(annual.Equity)     || 0;
        const shares    = parseFloat(annual.NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock) || 0;
        const eps       = parseFloat(annual.EarningsPerShare) || null;
        const bps       = shares > 0 ? equity / shares : null;
        const roe       = equity > 0 ? (netIncome / equity) * 100 : null;

        res.status(200).json({
          success: true,
          data: { roe, adjustedROE: roe, adjustedEquityPerShare: bps, eps, bookValue: bps, pe: null, pb: null, dividendYield: null },
        });
        return;
      }

      // ── 歷史走勢（近60日）────────────────────────────────
      // V2 endpoint: /equities/bars/daily
      case 'history': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        const to   = getJPDate(0);
        const from = getJPDate(-90);
        const data = await jFetch(`/equities/bars/daily?code=${code}&from=${from}&to=${to}`);
        const quotes = (data?.daily_quotes ?? data?.bars ?? data?.data ?? []).filter(q => q.Close);

        const history = quotes.slice(-60).map(q => {
          const dateStr = String(q.Date);
          const d = new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
          return { date: `${d.getMonth()+1}/${d.getDate()}`, price: q.AdjustmentClose ?? q.Close, open: q.Open ?? null, high: q.High ?? null, low: q.Low ?? null };
        });

        res.status(200).json({ success: true, data: history });
        return;
      }

      // ── 上市清單 ─────────────────────────────────────────
      // V2 endpoint: /equities/master
      case 'listed': {
        const data  = await jFetch('/equities/master');
        const items = data?.master ?? data?.info ?? data?.data ?? [];
        const listed = items.map(i => ({
          code: i.Code, name: i.CompanyName, nameEn: i.CompanyNameEnglish ?? '',
          industry: i.Sector33CodeName ?? '', market: i.MarketCodeName ?? '',
        }));
        res.status(200).json({ success: true, count: listed.length, data: listed });
        return;
      }

      default:
        res.status(400).json({ error: `未知 type: ${type}` });
    }

  } catch (err) {
    console.error('J-Quants error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
