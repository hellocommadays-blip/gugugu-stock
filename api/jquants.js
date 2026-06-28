// api/jquants.js — 日股 J-Quants V2 proxy
// V2 API Key 認証 + V2 endpoint + V2 field names

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
      case 'price': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        const dates = getRecentTradingDates(7);
        let q = null, usedDate = null;

        for (const date of dates) {
          try {
            const data  = await jFetch(`/equities/bars/daily?code=${code}&date=${date}`);
            // V2: data.daily_quotes array
            const items = data?.daily_quotes ?? [];
            if (items.length > 0) { q = items[0]; usedDate = date; break; }
          } catch (_) { continue; }
        }

        if (!q) {
          res.status(404).json({ error: `找不到 ${code} 的報價` });
          return;
        }

        // V2 field names（AdjustmentClose 是除權息調整後收盤）
        const price     = q.AdjustmentClose ?? q.Close ?? 0;
        const prevClose = q.PreviousClose   ?? price;
        const change    = Math.round((price - prevClose) * 100) / 100;
        const changePct = prevClose ? Math.round((change / prevClose) * 10000) / 100 : 0;

        res.status(200).json({
          success: true,
          data: {
            code, price, prevClose,
            open:      q.AdjustmentOpen  ?? q.Open   ?? null,
            high:      q.AdjustmentHigh  ?? q.High   ?? null,
            low:       q.AdjustmentLow   ?? q.Low    ?? null,
            volume:    q.Volume          ?? null,
            change, changePct, currency: 'JPY', date: usedDate,
          },
        });
        return;
      }

      // ── 財務資料 ─────────────────────────────────────────
      case 'financials': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        const data  = await jFetch(`/fins/summary?code=${code}`);
        // V2: data.fins_summary array
        const stmts = data?.fins_summary ?? data?.statements ?? data?.data ?? [];
        if (!stmts.length) {
          res.status(200).json({ success: true, data: null, note: '無財務資料' });
          return;
        }

        // 取最新年報
        const annual = stmts
          .filter(s => (s.TypeOfDocument ?? '').includes('Annual') || (s.TypeOfDocument ?? '').includes('FY'))
          .sort((a, b) => (b.CurrentPeriodEndDate ?? '').localeCompare(a.CurrentPeriodEndDate ?? ''))[0]
          ?? stmts[stmts.length - 1];

        const netIncome = parseFloat(annual.NetIncome)  || 0;
        const equity    = parseFloat(annual.Equity)     || 0;
        const shares    = parseFloat(
          annual.NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock
        ) || 0;
        const eps = parseFloat(annual.EarningsPerShare) || null;
        const bps = shares > 0 ? equity / shares : null;
        const roe = equity > 0 ? (netIncome / equity) * 100 : null;

        res.status(200).json({
          success: true,
          data: { roe, adjustedROE: roe, adjustedEquityPerShare: bps, eps, bookValue: bps, pe: null, pb: null, dividendYield: null },
        });
        return;
      }

      // ── 歷史走勢（近60日）────────────────────────────────
      case 'history': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        const to   = getJPDate(0);
        const from = getJPDate(-90);
        const data = await jFetch(`/equities/bars/daily?code=${code}&from=${from}&to=${to}`);
        const quotes = (data?.daily_quotes ?? []).filter(q => q.AdjustmentClose ?? q.Close);

        const history = quotes.slice(-60).map(q => {
          const ds = String(q.Date).replace(/-/g, '');
          const d  = new Date(`${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`);
          return {
            date:  `${d.getMonth()+1}/${d.getDate()}`,
            price: q.AdjustmentClose ?? q.Close,
            open:  q.AdjustmentOpen  ?? q.Open  ?? null,
            high:  q.AdjustmentHigh  ?? q.High  ?? null,
            low:   q.AdjustmentLow   ?? q.Low   ?? null,
          };
        });

        res.status(200).json({ success: true, data: history });
        return;
      }

      // ── 上市清單 ─────────────────────────────────────────
      case 'listed': {
        const data  = await jFetch('/equities/master');
        const items = data?.master ?? data?.info ?? data?.data ?? [];
        // V2 field names: CoName, CoNameEn, S33Nm, MktNm
        const listed = items.map(i => ({
          code:     i.Code,
          name:     i.CoName     ?? '',
          nameEn:   i.CoNameEn   ?? '',
          industry: i.S33Nm      ?? i.S17Nm ?? '',
          market:   i.MktNm      ?? '',
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
