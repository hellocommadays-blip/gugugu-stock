// api/jquants.js — 日股 J-Quants proxy
// 覆蓋東証全市場，免費版支援：報價、財務、上市清單
// 認證：Refresh Token（長效）→ ID Token（24小時）

const REFRESH_TOKEN = process.env.JQUANTS_REFRESH_TOKEN;
const BASE = 'https://api.jquants.com/v1';

// ── ID Token 快取（Vercel Serverless 同實例有效）────────────
let cachedIdToken = null;
let cachedIdTokenExpiry = 0;

async function getIdToken() {
  const now = Date.now();
  if (cachedIdToken && now < cachedIdTokenExpiry) return cachedIdToken;

  // 用 Refresh Token 換 ID Token
  const r = await fetch(`${BASE}/token/auth_refresh?refreshtoken=${REFRESH_TOKEN}`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error(`J-Quants auth failed: ${r.status}`);
  const data = await r.json();
  const token = data?.idToken;
  if (!token) throw new Error('J-Quants: idToken 為空');

  cachedIdToken = token;
  cachedIdTokenExpiry = now + 23 * 60 * 60 * 1000; // 23 小時
  return token;
}

async function jFetch(path) {
  const idToken = await getIdToken();
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`J-Quants ${path} failed ${r.status}: ${text}`);
  }
  return r.json();
}

// 取得日本時間日期（UTC+9）
function getJPDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(d.getHours() + 9);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// 最近交易日（往回找，跳週末；J-Quants 假日需自行過濾）
function getRecentDates(count = 5) {
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

  if (!REFRESH_TOKEN) {
    res.status(500).json({ error: 'JQUANTS_REFRESH_TOKEN 未設定' });
    return;
  }

  const { type, code } = req.query;

  try {
    switch (type) {

      // ── 即時/日收報價 ─────────────────────────────────────
      case 'price': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        // 嘗試最近幾個交易日，取最新有資料的一天
        const dates = getRecentDates(5);
        let priceData = null;
        let usedDate = null;

        for (const date of dates) {
          try {
            const data = await jFetch(`/prices/daily_quotes?code=${code}&date=${date}`);
            const items = data?.daily_quotes;
            if (items?.length > 0) {
              priceData = items[0];
              usedDate = date;
              break;
            }
          } catch (_) { continue; }
        }

        if (!priceData) {
          res.status(404).json({ error: `找不到 ${code} 的報價` });
          return;
        }

        const price     = priceData.Close   || priceData.AdjustmentClose || 0;
        const prevClose = priceData.PreviousClose || price;
        const change    = Math.round((price - prevClose) * 100) / 100;
        const changePct = prevClose ? Math.round((change / prevClose) * 10000) / 100 : 0;

        res.status(200).json({
          success: true,
          data: {
            code,
            price,
            prevClose,
            open:      priceData.Open   || null,
            high:      priceData.High   || null,
            low:       priceData.Low    || null,
            volume:    priceData.Volume || null,
            change,
            changePct,
            currency:  'JPY',
            date:      usedDate,
          }
        });
        return;
      }

      // ── 財務資料（年報）──────────────────────────────────────
      case 'financials': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        const data = await jFetch(`/fins/statements?code=${code}`);
        const stmts = data?.statements;
        if (!stmts?.length) {
          res.status(200).json({ success: true, data: null, note: '無財務資料' });
          return;
        }

        // 取最新一筆年報（TypeOfDocument 包含 'Annual'）
        const annual = stmts
          .filter(s => s.TypeOfDocument?.includes('Annual') || s.TypeOfDocument?.includes('FY'))
          .sort((a, b) => b.CurrentPeriodEndDate?.localeCompare(a.CurrentPeriodEndDate))
          [0] || stmts[stmts.length - 1];

        // ROE = 純利 / 淨資產
        const netIncome   = parseFloat(annual.NetIncome)              || 0;
        const equity      = parseFloat(annual.Equity)                 || 0;
        const shares      = parseFloat(annual.NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock) || 0;
        const eps         = parseFloat(annual.EarningsPerShare)       || null;
        const bps         = shares > 0 ? equity / shares : null;  // 每股淨值（JPY）
        const roe         = equity > 0 ? (netIncome / equity) * 100 : null;
        const divPerShare = parseFloat(annual.DividendPayable)        || null;

        res.status(200).json({
          success: true,
          data: {
            roe,
            adjustedROE:            roe,
            adjustedEquityPerShare: bps,
            eps,
            bookValue:              bps,
            dividendYield:          null, // 需要配合股價計算，由前端處理
            pe:                     null, // 同上
            pb:                     null,
            netIncome,
            equity,
            shares,
          }
        });
        return;
      }

      // ── 歷史走勢（近60日）────────────────────────────────────
      case 'history': {
        if (!code) { res.status(400).json({ error: 'code 必填' }); return; }

        // 取 3 個月前到今天
        const toDate   = getJPDate(0);
        const fromDate = getJPDate(-90);
        const data     = await jFetch(`/prices/daily_quotes?code=${code}&from=${fromDate}&to=${toDate}`);
        const quotes   = data?.daily_quotes || [];

        const history = quotes
          .filter(q => q.Close)
          .slice(-60)
          .map(q => {
            const d = new Date(q.Date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
            return {
              date:  `${d.getMonth() + 1}/${d.getDate()}`,
              price: q.AdjustmentClose || q.Close,
              open:  q.Open  || null,
              high:  q.High  || null,
              low:   q.Low   || null,
            };
          });

        res.status(200).json({ success: true, data: history });
        return;
      }

      // ── 上市清單（選股用）────────────────────────────────────
      case 'listed': {
        const data = await jFetch('/listed/info');
        const items = data?.info || [];

        // 過濾：只要東証主板（Prime / Standard / Growth）
        const listed = items
          .filter(i => i.MarketCode && i.MarketCode !== '0000')
          .map(i => ({
            code:     i.Code,
            name:     i.CompanyName,
            nameEn:   i.CompanyNameEnglish || '',
            industry: i.Sector33CodeName   || i.Sector17CodeName || '',
            market:   i.MarketCodeName     || '',
          }));

        res.status(200).json({ success: true, count: listed.length, data: listed });
        return;
      }

      // ── 選股（掃描日經225 or 全市場）─────────────────────────
      case 'screener': {
        // 傳入 codes=7203,6758,... 批次查
        const codesParam = req.query.codes;
        if (!codesParam) { res.status(400).json({ error: 'codes 必填' }); return; }

        const codes  = codesParam.split(',').map(c => c.trim()).filter(Boolean);
        const dates  = getRecentDates(5);

        // 找最近有資料的日期
        let latestDate = null;
        for (const date of dates) {
          try {
            const test = await jFetch(`/prices/daily_quotes?code=${codes[0]}&date=${date}`);
            if (test?.daily_quotes?.length > 0) { latestDate = date; break; }
          } catch (_) { continue; }
        }

        if (!latestDate) {
          res.status(200).json({ success: true, data: [], note: '無法取得報價日期' });
          return;
        }

        // 批次抓報價
        const results = [];
        for (const code of codes) {
          try {
            const [priceData, finData] = await Promise.all([
              jFetch(`/prices/daily_quotes?code=${code}&date=${latestDate}`),
              jFetch(`/fins/statements?code=${code}`),
            ]);

            const q = priceData?.daily_quotes?.[0];
            if (!q?.Close) continue;

            const price = q.Close || 0;
            const stmts = finData?.statements || [];
            const annual = stmts
              .filter(s => s.TypeOfDocument?.includes('Annual') || s.TypeOfDocument?.includes('FY'))
              .sort((a, b) => b.CurrentPeriodEndDate?.localeCompare(a.CurrentPeriodEndDate))[0];

            let bm = null, zone = null, ratio = null, roe = null, bps = null;
            if (annual) {
              const netIncome = parseFloat(annual.NetIncome) || 0;
              const equity    = parseFloat(annual.Equity)    || 0;
              const shares    = parseFloat(annual.NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock) || 0;
              roe = equity > 0 ? (netIncome / equity) * 100 : null;
              bps = shares > 0 ? equity / shares : null;
              bm  = (bps && roe) ? bps * (roe / 100) * 10 : null;

              if (bm && price) {
                const r = price / bm;
                ratio = r;
                if      (r < 0.85) zone = '極低估區';
                else if (r < 1.00) zone = '低估區';
                else if (r < 1.15) zone = '合理區';
                else if (r < 1.30) zone = '偏高區';
                else if (r < 2.00) zone = '高估區';
                else               zone = '泡沫區';
              }
            }

            results.push({
              code,
              price,
              changePct: q.PreviousClose
                ? Math.round(((price - q.PreviousClose) / q.PreviousClose) * 10000) / 100
                : null,
              bm, zone, ratio,
              adjustedROE: roe,
              adjustedEquityPerShare: bps,
              currency: 'JPY',
            });
          } catch (_) { continue; }
        }

        res.status(200).json({ success: true, date: latestDate, data: results });
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
