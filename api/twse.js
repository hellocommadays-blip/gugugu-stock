// api/twse.js — 台股 TWSE proxy

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { type, stockNo } = req.query;
  if (!stockNo) { res.status(400).json({ error: 'stockNo 必填' }); return; }

  try {
    let data;

    switch (type) {

      // ── 即時報價（TWSE MIS）──────────────────────────────
      case 'price': {
        const tryMarkets = [
          `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${stockNo}.tw&json=1&delay=0`,
          `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${stockNo}.tw&json=1&delay=0`,
        ];

        let item = null;
        for (const url of tryMarkets) {
          const r = await fetch(url, {
            headers: {
              'Referer':    'https://mis.twse.com.tw/stock/fibest.html',
              'User-Agent': 'Mozilla/5.0',
            }
          });
          const raw = await r.json();
          if (raw?.msgArray?.[0]?.n) {
            item = raw.msgArray[0];
            break;
          }
        }

        if (!item) { res.status(404).json({ error: `找不到股票 ${stockNo}` }); return; }

        const price     = parseFloat(item.z) > 0 ? parseFloat(item.z) : parseFloat(item.y);
        const prevClose = parseFloat(item.y);
        data = {
          symbol:    stockNo,
          name:      item.n,
          price,
          open:      parseFloat(item.o) || null,
          high:      parseFloat(item.h) || null,
          low:       parseFloat(item.l) || null,
          prevClose,
          change:    Math.round((price - prevClose) * 100) / 100,
          changePct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
          volume:    parseInt(item.v) || 0,
          market:    'TW',
          currency:  'TWD',
          isDelayed: false,
        };
        break;
      }

      // ── 歷史日行情（近2個月）────────────────────────────
      case 'history': {
        const now    = new Date();
        const months = [
          new Date(now.getFullYear(), now.getMonth() - 1, 1),
          new Date(now.getFullYear(), now.getMonth(),     1),
        ];

        let allData = [];
        for (const m of months) {
          const dateStr = `${m.getFullYear()}${String(m.getMonth()+1).padStart(2,'0')}01`;
          // 先試上市，再試上櫃
          const urls = [
            `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${stockNo}&date=${dateStr}&response=json`,
            `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${String(m.getFullYear()-1911)}/${String(m.getMonth()+1).padStart(2,'0')}&stkno=${stockNo}&s=0,asc,0&o=json`,
          ];
          for (const url of urls) {
            try {
              const r   = await fetch(url);
              const raw = await r.json();
              // TWSE 格式
              if (raw?.data?.length) {
                const rows = raw.data.map(row => {
                  const parts = row[0].split('/');
                  const year  = parseInt(parts[0]) + 1911;
                  const d     = new Date(year, parseInt(parts[1])-1, parseInt(parts[2]));
                  return {
                    date:  `${d.getMonth()+1}/${d.getDate()}`,
                    price: parseFloat(row[6].replace(/,/g, '')) || null,
                    open:  parseFloat(row[3].replace(/,/g, '')) || null,
                    high:  parseFloat(row[4].replace(/,/g, '')) || null,
                    low:   parseFloat(row[5].replace(/,/g, '')) || null,
                  };
                }).filter(r => r.price);
                allData = [...allData, ...rows];
                break;
              }
            } catch (_) {}
          }
        }
        data = allData.slice(-60);
        break;
      }

      // ── 財務數據（TWSE 每日本益比、殖利率、股價淨值比）──
      case 'financials': {
        // BWIBBU_d：每日收盤後更新，往回找最近交易日（跳過週末）
        let raw = null;
        for (let i = 1; i <= 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          const dateStr = d.toISOString().slice(0,10).replace(/-/g,'');
          const r = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${dateStr}&selectType=ALL&response=json`);
          raw = await r.json();
          if (raw?.data?.length) break;
          raw = null;
        }

        if (!raw?.data) {
          res.status(200).json({ success:true, data:null, note:'近期無財務資料' });
          return;
        }

        // 欄位：[代號, 名稱, 殖利率, 股利年度, 本益比, 股價淨值比, 財報年/季]
        const row = raw.data.find(d => d[0] === stockNo);
        if (!row) {
          res.status(200).json({ success:true, data:null, note:'查無此股票財務資料' });
          return;
        }

        data = {
          dividendYield: parseFloat(row[2]) || null,
          pe:            parseFloat(row[4]) || null,
          pb:            parseFloat(row[5]) || null,
        };
        break;
      }

      // ── 三大法人 ──────────────────────────────────────────
      case 'institutional': {
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const url   = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${today}&selectType=ALLBUT0999&response=json`;
        const r     = await fetch(url);
        const raw   = await r.json();
        if (!raw?.data) { res.status(200).json({ success:true, data:null }); return; }
        const row = raw.data.find(d => d[0] === stockNo);
        if (!row)  { res.status(200).json({ success:true, data:null }); return; }
        const p = s => parseInt((s||'0').replace(/,/g,'')) || 0;
        data = {
          foreign:    p(row[4]),
          investment: p(row[7]),
          dealer:     p(row[10]),
          total:      p(row[14]),
          date:       raw.date || today,
        };
        break;
      }

      // ── 融資融券 ──────────────────────────────────────────
      case 'margin': {
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const url   = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${today}&selectType=ALL&response=json`;
        const r     = await fetch(url);
        const raw   = await r.json();
        if (!raw?.data) { res.status(200).json({ success:true, data:null }); return; }
        const row = raw.data.find(d => d[0] === stockNo);
        if (!row)  { res.status(200).json({ success:true, data:null }); return; }
        const p = s => parseInt((s||'0').replace(/,/g,'')) || 0;
        data = {
          marginBuy:     p(row[2]),
          marginSell:    p(row[3]),
          marginBalance: p(row[5]),
          shortSell:     p(row[7]),
          shortBuy:      p(row[8]),
          shortBalance:  p(row[10]),
          net:           p(row[2]) - p(row[7]),
        };
        break;
      }

      // ── 每股盈餘 + 每股淨值（用來算基準值）────────────────
      // 使用 goodinfo.tw 或 statementdog 的公開資料
      // 改用 TWSE 每日行情附帶的本益比反推 EPS
      case 'eps': {
        // 策略：用 BWIBBU_d 的 PE × 收盤價 反推 EPS
        // 再用 PB × 收盤價 反推每股淨值
        // 然後算出調整ROE = EPS / 每股淨值

        // 先抓今日報價
        const priceUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${stockNo}.tw&json=1&delay=0`;
        const priceR   = await fetch(priceUrl, {
          headers: { 'Referer': 'https://mis.twse.com.tw/stock/fibest.html', 'User-Agent': 'Mozilla/5.0' }
        });
        const priceRaw = await priceR.json();
        const item     = priceRaw?.msgArray?.[0];
        const currentPrice = item ? (parseFloat(item.z) > 0 ? parseFloat(item.z) : parseFloat(item.y)) : null;

        // 再抓 BWIBBU_d
        let finRaw = null;
        for (let i = 1; i <= 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          const dateStr = d.toISOString().slice(0,10).replace(/-/g,'');
          const r = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${dateStr}&selectType=ALL&response=json`);
          finRaw = await r.json();
          if (finRaw?.data?.length) break;
          finRaw = null;
        }

        const row = finRaw?.data?.find(d => d[0] === stockNo);
        if (!row || !currentPrice) {
          res.status(200).json({ success: true, data: null, note: '查無財務資料' });
          return;
        }

        // BWIBBU_d 欄位：[代號, 名稱, 殖利率, 股利年度, 本益比, 股價淨值比, 財報年/季]
        // row[4]=本益比, row[5]=股價淨值比
        // 注意：台積電 PE≈32, PB≈10，用 PB 反推每股淨值較準確
        const pe = parseFloat(row[4]) || null;  // 本益比
        const pb = parseFloat(row[5]) || null;  // 股價淨值比

        // 反推：EPS = 股價 / PE，每股淨值 = 股價 / PB
        const eps       = (pe && currentPrice && pe < 200) ? currentPrice / pe : null;
        const bookValue = (pb && currentPrice && pb < 50)  ? currentPrice / pb : null;

        // 調整ROE ≈ EPS / 每股淨值（近似值，非精確財報數字）
        const adjustedROE = (eps && bookValue) ? (eps / bookValue) * 100 : null;

        data = {
          eps,
          bookValue,
          adjustedROE,
          adjustedEquityPerShare: bookValue,
          benchmark: bookValue && adjustedROE ? bookValue * (adjustedROE / 100) * 10 : null,
          note: '基於 PE/PB 反推，為近似值',
        };
        break;
      }

      // ── Debug：看 BWIBBU_d 原始欄位 ─────────────────────
      case 'rawbwibbu': {
        let raw = null;
        for (let i = 1; i <= 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          const dateStr = d.toISOString().slice(0,10).replace(/-/g,'');
          const r = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${dateStr}&selectType=ALL&response=json`);
          raw = await r.json();
          if (raw?.data?.length) break;
          raw = null;
        }
        const row = raw?.data?.find(d => d[0] === stockNo);
        if (!row) { res.status(404).json({ error: '查無資料' }); return; }
        // 回傳所有欄位和標題
        data = {
          fields:  raw.fields || [],
          row:     row,
          indexed: Object.fromEntries(row.map((v,i) => [i, v])),
        };
        break;
      }

      // ── 公司基本資料 ──────────────────────────────────────
      case 'company': {
        const url = `https://openapi.twse.com.tw/v1/opendata/t187ap03_L`;
        const r   = await fetch(url);
        const raw = await r.json();
        const item = raw?.find(d => d['公司代號'] === stockNo);
        if (!item) { res.status(404).json({ error: '查無公司資料' }); return; }
        data = {
          code:     item['公司代號'],
          name:     item['公司簡稱'],
          industry: item['產業別'],
          chairman: item['董事長'],
          website:  item['網址'],
          listed:   item['上市日期'],
        };
        break;
      }

      default:
        res.status(400).json({ error: `未知 type: ${type}` });
        return;
    }

    res.status(200).json({ success: true, data });

  } catch (err) {
    console.error(`TWSE proxy error [${type}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
}
