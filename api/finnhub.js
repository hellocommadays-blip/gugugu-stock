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

        const price     = quote.c;  // 現價
        const prevClose = quote.pc; // 昨收

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
            currency:  market === 'JP' ? 'JPY' : 'USD',
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

      // ── 歷史走勢（近60日）────────────────────────────────
      case 'history': {
        const to   = Math.floor(Date.now() / 1000);
        const from = to - 60 * 24 * 60 * 60; // 60天前
        const r    = await fetch(`${BASE}/stock/candle?symbol=${fhSymbol}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
        const raw  = await r.json();

        if (raw?.s !== 'ok' || !raw?.t?.length) {
          res.status(200).json({ success: true, data: [], note: '無歷史資料' });
          return;
        }

        const data = raw.t.map((ts, i) => {
          const d = new Date(ts * 1000);
          return {
            date:  `${d.getMonth()+1}/${d.getDate()}`,
            price: raw.c?.[i] || null,
            open:  raw.o?.[i] || null,
            high:  raw.h?.[i] || null,
            low:   raw.l?.[i] || null,
          };
        }).filter(d => d.price);

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
