// api/yahoo.js — 美股 / 日股 Yahoo Finance proxy
// market 參數：'US' 或 'JP'（前端必須傳，不猜測）

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { symbol, market, type } = req.query;
  if (!symbol) { res.status(400).json({ error: 'symbol 必填' }); return; }
  if (!market) { res.status(400).json({ error: 'market 必填（US 或 JP）' }); return; }

  // 日股加 .T 後綴，美股直接用
  const yfSymbol = market === 'JP' ? `${symbol}.T` : symbol.toUpperCase();

  const YF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    switch (type) {

      // ── 即時報價 ─────────────────────────────────────────
      case 'quote': {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?interval=1d&range=1d`;
        const r   = await fetch(url, { headers: YF_HEADERS });

        if (!r.ok) {
          // fallback: 試 query2
          const r2  = await fetch(
            `https://query2.finance.yahoo.com/v8/finance/chart/${yfSymbol}?interval=1d&range=1d`,
            { headers: YF_HEADERS }
          );
          if (!r2.ok) { res.status(404).json({ error: `找不到 ${symbol}，請確認代號` }); return; }
          const raw2 = await r2.json();
          const meta2 = raw2?.chart?.result?.[0]?.meta;
          if (!meta2) { res.status(404).json({ error: `找不到 ${symbol}` }); return; }
          res.status(200).json({ success: true, data: buildQuote(symbol, market, meta2) });
          return;
        }

        const raw  = await r.json();
        const meta = raw?.chart?.result?.[0]?.meta;
        if (!meta) { res.status(404).json({ error: `找不到 ${symbol}` }); return; }

        res.status(200).json({ success: true, data: buildQuote(symbol, market, meta) });
        return;
      }

      // ── 歷史走勢（近60日）────────────────────────────────
      case 'history': {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?interval=1d&range=3mo`;
        const r   = await fetch(url, { headers: YF_HEADERS });
        if (!r.ok) { res.status(500).json({ error: 'Yahoo Finance 暫時無法存取' }); return; }

        const raw    = await r.json();
        const result = raw?.chart?.result?.[0];
        if (!result) { res.status(404).json({ error: '無歷史資料' }); return; }

        const timestamps = result.timestamp || [];
        const quote      = result.indicators?.quote?.[0] || {};

        const data = timestamps.map((ts, i) => {
          const d = new Date(ts * 1000);
          const price = quote.close?.[i];
          if (!price) return null;
          return {
            date:  `${d.getMonth()+1}/${d.getDate()}`,
            price: Math.round(price * 100) / 100,
          };
        }).filter(Boolean).slice(-60);

        res.status(200).json({ success: true, data });
        return;
      }

      // ── 財務數據（P/E、P/B、ROE、殖利率、每股淨值）───────
      case 'financials': {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yfSymbol}?modules=summaryDetail,defaultKeyStatistics,financialData`;
        const r   = await fetch(url, { headers: YF_HEADERS });
        if (!r.ok) { res.status(200).json({ success: true, data: null, note: 'Yahoo 財務資料暫時無法取得' }); return; }

        const raw     = await r.json();
        const summary = raw?.quoteSummary?.result?.[0];
        if (!summary) { res.status(200).json({ success: true, data: null, note: '無財務資料' }); return; }

        const sd = summary.summaryDetail          || {};
        const ks = summary.defaultKeyStatistics   || {};
        const fd = summary.financialData          || {};

        res.status(200).json({
          success: true,
          data: {
            pe:                   sd.trailingPE?.raw              || null,
            pb:                   ks.priceToBook?.raw             || null,
            dividendYield:        sd.dividendYield?.raw != null   ? sd.dividendYield.raw * 100 : null,
            roe:                  fd.returnOnEquity?.raw != null  ? fd.returnOnEquity.raw * 100 : null,
            adjustedROE:          fd.returnOnEquity?.raw != null  ? fd.returnOnEquity.raw * 100 : null,
            adjustedEquityPerShare: ks.bookValue?.raw             || null,
            eps:                  ks.trailingEps?.raw             || null,
            bookValue:            ks.bookValue?.raw               || null,
            totalEquity:          fd.totalStockholderEquity?.raw  || null,
            sharesOutstanding:    ks.sharesOutstanding?.raw       || null,
          }
        });
        return;
      }

      default:
        res.status(400).json({ error: `未知 type: ${type}` });
    }

  } catch (err) {
    console.error(`Yahoo proxy error [${type}/${symbol}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
}

function buildQuote(symbol, market, meta) {
  const price     = meta.regularMarketPrice     || 0;
  const prevClose = meta.chartPreviousClose     || meta.previousClose || price;
  return {
    symbol,
    name:      meta.shortName || meta.longName || symbol,
    price,
    prevClose,
    open:      meta.regularMarketOpen          || null,
    high:      meta.regularMarketDayHigh       || null,
    low:       meta.regularMarketDayLow        || null,
    change:    Math.round((price - prevClose) * 100) / 100,
    changePct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
    currency:  meta.currency                   || (market === 'JP' ? 'JPY' : 'USD'),
    market,
    exchangeName: meta.exchangeName            || '',
  };
}
