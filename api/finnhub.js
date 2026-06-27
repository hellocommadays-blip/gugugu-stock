// api/finnhub.js — 美股 / 日股 Finnhub proxy

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

// 加 timeout 的 fetch（預設 8 秒，避免 Vercel 10s limit 超時）
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!FINNHUB_KEY) {
    res.status(500).json({ error: 'FINNHUB_API_KEY 未設定' });
    return;
  }

  const { symbol, market, type } = req.query;
  if (!symbol) { res.status(400).json({ error: 'symbol 必填' }); return; }
  if (!market) { res.status(400).json({ error: 'market 必填（US 或 JP）' }); return; }

  // 日股加 .T 後綴
  const fhSymbol = symbol.toUpperCase(); // ADR 代號不需要 .T

  try {
    switch (type) {

      // ── 即時報價 ─────────────────────────────────────────
      case 'quote': {
        // 日股：用 ADR 代號透過 Finnhub 查詢（Twelve Data/Finnhub 免費版不支援東証）
        // 使用者輸入 ADR 代號（TM、SONY、HMC 等），market=JP 代表是日股ADR
        if (market === 'JP') {
          const [quoteRes, profileRes] = await Promise.all([
            fetchWithTimeout(`${BASE}/quote?symbol=${symbol}&token=${FINNHUB_KEY}`),
            fetchWithTimeout(`${BASE}/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`),
          ]);
          const quote   = await quoteRes.json();
          const profile = await profileRes.json();

          if (!quote?.c || quote.c === 0) {
            res.status(404).json({ error: `找不到日股ADR「${symbol}」，請使用ADR代號（TM=Toyota、SONY=Sony、HMC=Honda）` });
            return;
          }

          const price     = quote.c;
          const prevClose = quote.pc;

          res.status(200).json({
            success: true,
            data: {
              symbol,
              name:      profile?.name || symbol,
              price,
              prevClose,
              open:      quote.o || null,
              high:      quote.h || null,
              low:       quote.l || null,
              change:    Math.round((price - prevClose) * 100) / 100,
              changePct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
              currency:  'USD',  // ADR 以美元計價
              market:    'JP',
              industry:  profile?.finnhubIndustry || '',
              logo:      profile?.logo || '',
              isADR:     true,
            }
          });
          return;
        }

        // 美股：Finnhub
        const [quoteRes, profileRes] = await Promise.all([
          fetchWithTimeout(`${BASE}/quote?symbol=${fhSymbol}&token=${FINNHUB_KEY}`),
          fetchWithTimeout(`${BASE}/stock/profile2?symbol=${fhSymbol}&token=${FINNHUB_KEY}`),
        ]);
        const quote   = await quoteRes.json();
        const profile = await profileRes.json();

        if (!quote?.c || quote.c === 0) {
          res.status(404).json({ error: `找不到 ${symbol}，請確認代號` });
          return;
        }

        const price     = quote.c;
        const prevClose = quote.pc;

        res.status(200).json({
          success: true,
          data: {
            symbol,
            name:      profile?.name || symbol,
            price,
            prevClose,
            open:      quote.o  || null,
            high:      quote.h  || null,
            low:       quote.l  || null,
            change:    Math.round((price - prevClose) * 100) / 100,
            changePct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
            currency:  'USD',
            market,
            industry:  profile?.finnhubIndustry || '',
            logo:      profile?.logo || '',
          }
        });
        return;
      }

      // ── 財務數據（基本指標）──────────────────────────────
      case 'financials': {
        const r   = await fetchWithTimeout(`${BASE}/stock/metric?symbol=${fhSymbol}&metric=all&token=${FINNHUB_KEY}`);
        const raw = await r.json();
        const m   = raw?.metric || {};

        // 取得每股淨值和 EPS 來算基準值
        const bookValue = m['bookValuePerShareAnnual']     || m['bookValuePerShareQuarterly'] || null;
        const epsAnnual = m['epsNormalizedAnnual']         || m['epsTTM']                     || null;
        const roe       = m['roeTTM']                      || m['roeAnnual']                  || null;

        // 調整ROE = EPS / 每股淨值
        const adjustedROE = (epsAnnual && bookValue) ? (epsAnnual / bookValue) * 100 : (roe || null);
        const adjustedEquityPerShare = bookValue;

        res.status(200).json({
          success: true,
          data: {
            pe:                   m['peNormalizedAnnual']  || m['peTTM']          || null,
            pb:                   m['pbAnnual']            || m['pbQuarterly']    || null,
            dividendYield:        m['dividendYieldIndicatedAnnual']               || null,
            roe:                  roe,
            eps:                  epsAnnual,
            bookValue,
            adjustedROE,
            adjustedEquityPerShare,
          }
        });
        return;
      }

      // ── 歷史走勢（近60日）— Alpha Vantage ──────────────
      case 'history': {
        const AV_KEY = process.env.ALPHAVANTAGE_API_KEY;
        const TD_KEY = process.env.TWELVEDATA_API_KEY;

        // 日股 ADR：用 Alpha Vantage 抓歷史（ADR 在美股掛牌，AV 支援）
        if (market === 'JP') {
          if (!AV_KEY) {
            res.status(200).json({ success: true, data: [], note: 'ALPHAVANTAGE_API_KEY 未設定' });
            return;
          }
          const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol.toUpperCase()}&outputsize=compact&apikey=${AV_KEY}`;
          const r   = await fetch(url);
          const raw = await r.json();

          const timeSeries = raw?.['Time Series (Daily)'];
          if (!timeSeries) {
            res.status(200).json({ success: true, data: [], note: '無歷史資料' });
            return;
          }

          const data = Object.entries(timeSeries)
            .slice(0, 60)
            .reverse()
            .map(([dateStr, values]) => {
              const d = new Date(dateStr);
              return {
                date:  `${d.getMonth()+1}/${d.getDate()}`,
                price: parseFloat(values['4. close'])  || null,
                open:  parseFloat(values['1. open'])   || null,
                high:  parseFloat(values['2. high'])   || null,
                low:   parseFloat(values['3. low'])    || null,
              };
            })
            .filter(d => d.price);

          res.status(200).json({ success: true, data });
          return;
        }

        // 美股：Alpha Vantage 歷史
        if (!AV_KEY) {
          res.status(500).json({ error: 'ALPHAVANTAGE_API_KEY 未設定' });
          return;
        }

        const avSymbol = symbol.toUpperCase();
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${avSymbol}&outputsize=compact&apikey=${AV_KEY}`;
        const r   = await fetch(url);
        const raw = await r.json();

        const timeSeries = raw?.['Time Series (Daily)'];
        if (!timeSeries) {
          res.status(200).json({ success: true, data: [], note: '無歷史資料' });
          return;
        }

        const data = Object.entries(timeSeries)
          .slice(0, 60)
          .reverse()
          .map(([dateStr, values]) => {
            const d = new Date(dateStr);
            return {
              date:  `${d.getMonth()+1}/${d.getDate()}`,
              price: parseFloat(values['4. close'])  || null,
              open:  parseFloat(values['1. open'])   || null,
              high:  parseFloat(values['2. high'])   || null,
              low:   parseFloat(values['3. low'])    || null,
            };
          })
          .filter(d => d.price);

        res.status(200).json({ success: true, data });
        return;
      }



      default:
        res.status(400).json({ error: `未知 type: ${type}` });
    }

  } catch (err) {
    console.error(`Finnhub proxy error [${type}/${symbol}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
}
