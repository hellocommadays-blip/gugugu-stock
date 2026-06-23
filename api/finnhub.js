// api/finnhub.js — 美股 / 日股 Finnhub proxy

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

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
  const fhSymbol = market === 'JP' ? `${symbol}.T` : symbol.toUpperCase();

  try {
    switch (type) {

      // ── 即時報價 ─────────────────────────────────────────
      case 'quote': {
        // 日股：改用 Alpha Vantage（Finnhub 免費版不支援日股）
        if (market === 'JP') {
          const AV_KEY  = process.env.ALPHAVANTAGE_API_KEY;
          const avSym   = `${symbol}.T`;
          const url     = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${avSym}&apikey=${AV_KEY}`;
          const r       = await fetch(url);
          const raw     = await r.json();
          const q       = raw?.['Global Quote'];

          if (!q || !q['05. price']) {
            res.status(404).json({ error: `找不到日股 ${symbol}，請確認代號（格式：7203）` });
            return;
          }

          const price     = parseFloat(q['05. price']);
          const prevClose = parseFloat(q['08. previous close']);
          const change    = parseFloat(q['09. change']);
          const changePct = parseFloat(q['10. change percent']?.replace('%',''));

          res.status(200).json({
            success: true,
            data: {
              symbol,
              name:      symbol, // Alpha Vantage 不提供日文名稱
              price,
              prevClose,
              open:      parseFloat(q['02. open'])  || null,
              high:      parseFloat(q['03. high'])  || null,
              low:       parseFloat(q['04. low'])   || null,
              change:    Math.round(change * 100) / 100,
              changePct: Math.round(changePct * 100) / 100,
              currency:  'JPY',
              market:    'JP',
              industry:  '',
              logo:      '',
            }
          });
          return;
        }

        // 美股：Finnhub
        const [quoteRes, profileRes] = await Promise.all([
          fetch(`${BASE}/quote?symbol=${fhSymbol}&token=${FINNHUB_KEY}`),
          fetch(`${BASE}/stock/profile2?symbol=${fhSymbol}&token=${FINNHUB_KEY}`),
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
        const r   = await fetch(`${BASE}/stock/metric?symbol=${fhSymbol}&metric=all&token=${FINNHUB_KEY}`);
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
        if (!AV_KEY) {
          res.status(500).json({ error: 'ALPHAVANTAGE_API_KEY 未設定' });
          return;
        }

        // Alpha Vantage TIME_SERIES_DAILY
        const avSymbol = market === 'JP' ? `${symbol}.TYO` : symbol.toUpperCase();
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${avSymbol}&outputsize=compact&apikey=${AV_KEY}`;
        const r   = await fetch(url);
        const raw = await r.json();

        const timeSeries = raw?.['Time Series (Daily)'];
        if (!timeSeries) {
          res.status(200).json({ success: true, data: [], note: '無歷史資料' });
          return;
        }

        // 取最近60筆，轉成我們的格式
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
