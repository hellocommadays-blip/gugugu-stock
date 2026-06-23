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
        // 日股：Twelve Data（JPX 交易所）
        if (market === 'JP') {
          const TD_KEY = process.env.TWELVEDATA_API_KEY;
          if (!TD_KEY) {
            res.status(500).json({ error: 'TWELVEDATA_API_KEY 未設定' });
            return;
          }

          const url = `https://api.twelvedata.com/quote?symbol=${symbol}&mic_code=XJPX&apikey=${TD_KEY}`;
          const r   = await fetch(url);
          const q   = await r.json();

          if (q?.status === 'error' || !q?.close) {
            res.status(404).json({ error: `找不到日股 ${symbol}，請確認代號（範例：7203）` });
            return;
          }

          const price     = parseFloat(q.close);
          const prevClose = parseFloat(q.previous_close);
          const change    = parseFloat(q.change);
          const changePct = parseFloat(q.percent_change);

          res.status(200).json({
            success: true,
            data: {
              symbol,
              name:      q.name || symbol,
              price,
              prevClose,
              open:      parseFloat(q.open)  || null,
              high:      parseFloat(q.high)  || null,
              low:       parseFloat(q.low)   || null,
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
        const TD_KEY = process.env.TWELVEDATA_API_KEY;

        // 日股：Twelve Data 歷史
        if (market === 'JP' && TD_KEY) {
          const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&mic_code=XJPX&interval=1day&outputsize=60&apikey=${TD_KEY}`;
          const r   = await fetch(url);
          const raw = await r.json();

          if (raw?.status === 'error' || !raw?.values?.length) {
            res.status(200).json({ success: true, data: [], note: '無歷史資料' });
            return;
          }

          const data = [...raw.values].reverse().map(v => {
            const d = new Date(v.datetime);
            return {
              date:  `${d.getMonth()+1}/${d.getDate()}`,
              price: parseFloat(v.close) || null,
              open:  parseFloat(v.open)  || null,
              high:  parseFloat(v.high)  || null,
              low:   parseFloat(v.low)   || null,
            };
          }).filter(d => d.price);

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

      // ── 日股 debug ──────────────────────────────────────
      case 'jptest': {
        const TD_KEY = process.env.TWELVEDATA_API_KEY;
        const results = {};

        const tests = [
          { label:'TSE',     url:`https://api.twelvedata.com/quote?symbol=7203&exchange=TSE&apikey=${TD_KEY}` },
          { label:'TYO',     url:`https://api.twelvedata.com/quote?symbol=7203&exchange=TYO&apikey=${TD_KEY}` },
          { label:'dot_T',   url:`https://api.twelvedata.com/quote?symbol=7203.T&apikey=${TD_KEY}` },
          { label:'japan',   url:`https://api.twelvedata.com/quote?symbol=7203&country=Japan&apikey=${TD_KEY}` },
          { label:'stocks',  url:`https://api.twelvedata.com/stocks?country=Japan&symbol=7203&apikey=${TD_KEY}` },
        ];

        for (const t of tests) {
          try {
            const r = await fetch(t.url);
            const d = await r.json();
            results[t.label] = d?.close ? 'OK: ' + d.close :
                               d?.status === 'error' ? 'ERR: ' + d.message :
                               'RAW: ' + JSON.stringify(d).slice(0,150);
          } catch(e) {
            results[t.label] = 'FETCH_ERR: ' + e.message;
          }
        }

        res.status(200).json({ success: true, data: results });
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
