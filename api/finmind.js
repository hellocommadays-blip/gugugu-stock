// api/finmind.js — FinMind 股利資料 proxy

const TOKEN = process.env.FINMIND_API_TOKEN;
const BASE  = 'https://api.finmindtrade.com/api/v4/data';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!TOKEN) {
    res.status(500).json({ error: 'FINMIND_API_TOKEN 未設定' });
    return;
  }

  const { type, symbol } = req.query;
  if (!symbol) { res.status(400).json({ error: 'symbol 必填' }); return; }

  try {
    switch (type) {

      // ── 歷史股利（現金股利 + 股票股利）────────────────────
      case 'dividend': {
        const url = `${BASE}?dataset=TaiwanStockDividend&data_id=${symbol}&start_date=2020-01-01`;
        const r   = await fetch(url, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
        if (!r.ok) throw new Error(`FinMind ${r.status}`);
        const raw  = await r.json();
        const data = raw?.data || [];

        // 整理格式
        const dividends = data
          .filter(d => d.CashEarningsDistribution > 0 || d.StockEarningsDistribution > 0)
          .map(d => ({
            symbol,
            exDate:      d.ExDividendTradingDate || d.AnnouncementDate || '',
            payDate:     d.CashDividendPayDate   || '',
            cashDiv:     parseFloat(d.CashEarningsDistribution)  || 0,  // 現金股利（元/股）
            stockDiv:    parseFloat(d.StockEarningsDistribution) || 0,  // 股票股利（元/股）
            year:        d.year || '',
          }))
          .sort((a, b) => b.exDate.localeCompare(a.exDate))
          .slice(0, 20); // 最近 20 筆

        res.status(200).json({ success: true, data: dividends });
        return;
      }

      // ── 除權息參考價 ────────────────────────────────────────
      case 'exright': {
        const url = `${BASE}?dataset=TaiwanStockDividendResult&data_id=${symbol}&start_date=2020-01-01`;
        const r   = await fetch(url, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
        if (!r.ok) throw new Error(`FinMind ${r.status}`);
        const raw  = await r.json();
        const data = (raw?.data || [])
          .sort((a, b) => b.date?.localeCompare(a.date))
          .slice(0, 10)
          .map(d => ({
            date:        d.date,
            symbol:      d.stock_id,
            refPrice:    parseFloat(d.reference_price) || null,  // 除權息參考價
            cashDiv:     parseFloat(d.cash_dividend)   || 0,
            stockDiv:    parseFloat(d.stock_dividend)  || 0,
          }));

        res.status(200).json({ success: true, data });
        return;
      }

      default:
        res.status(400).json({ error: `未知 type: ${type}` });
    }

  } catch (err) {
    console.error('FinMind error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
