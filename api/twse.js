// api/twse.js — 台股 TWSE proxy

// 取得台灣時間日期字串（UTC+8）
function getTWDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(d.getHours() + 8); // UTC → UTC+8
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0,10).replace(/-/g,'');
}

// 往回找最近交易日（跳過週末）
function getLastTradingDates(count = 3) {
  const dates = [];
  let d = new Date();
  d.setHours(d.getHours() + 8);
  while (dates.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(d.toISOString().slice(0,10).replace(/-/g,''));
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

        // 正確欄位：[0]代號 [1]名稱 [2]收盤價 [3]殖利率 [4]股利年度 [5]本益比 [6]股價淨值比 [7]財報年季
        const row = raw.data.find(d => d[0] === stockNo);
        if (!row) {
          res.status(200).json({ success:true, data:null, note:'查無此股票財務資料' });
          return;
        }

        data = {
          dividendYield: parseFloat(row[3]) || null,  // 殖利率
          pe:            parseFloat(row[5]) || null,  // 本益比
          pb:            parseFloat(row[6]) || null,  // 股價淨值比
        };
        break;
      }

      // ── 三大法人 ──────────────────────────────────────────
      case 'institutional': {
        // 往回找最近3個交易日，找到有資料的為止
        const tradingDates = getLastTradingDates(3);
        let raw = null;
        for (const dateStr of tradingDates) {
          const url = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${dateStr}&selectType=ALLBUT0999&response=json`;
          const r   = await fetch(url);
          raw = await r.json();
          if (raw?.data?.length) break;
          raw = null;
        }
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
        // 往回找最近3個交易日
        const tradingDates = getLastTradingDates(3);
        let raw = null;
        for (const dateStr of tradingDates) {
          const url = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${dateStr}&selectType=ALL&response=json`;
          const r   = await fetch(url);
          raw = await r.json();
          if (raw?.data?.length) break;
          raw = null;
        }
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

      // ── 每股盈餘 + 每股淨值（FinMind 精確財報版）──────────
      case 'eps': {
        const FINMIND_TOKEN = process.env.FINMIND_API_TOKEN;

        if (!FINMIND_TOKEN) {
          res.status(500).json({ error: 'FINMIND_API_TOKEN 未設定' });
          return;
        }

        try {
          // FinMind API：抓近5季財務報表
          const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockFinancialStatements&data_id=${stockNo}&start_date=2024-01-01&token=${FINMIND_TOKEN}`;
          const r   = await fetch(url);
          const raw = await r.json();

          if (!raw?.data?.length) {
            throw new Error('FinMind 無資料');
          }

          // 過濾出需要的欄位（使用正確的英文欄位名）
          const allData = raw.data;

          // 近4季稅後淨利
          const netIncomeRows = allData
            .filter(d => d.type === 'IncomeAfterTaxes')
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 4);

          // 近4季母公司權益
          const equityRows = allData
            .filter(d => d.type === 'EquityAttributableToOwnersOfParent')
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 4);

          // 直接用 EPS 欄位（近4季）
          const epsRows = allData
            .filter(d => d.type === 'EPS')
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 4);

          if (netIncomeRows.length === 0 && epsRows.length === 0) {
            const types = [...new Set(allData.map(d => d.type))];
            res.status(200).json({ success: true, data: null, note: '找不到財報欄位', availableTypes: types });
            return;
          }

          // 近4季淨利加總
          const eps4sum        = netIncomeRows.reduce((a, d) => a + (d.value || 0), 0);
          // 近4季EPS加總（備用）
          const eps4sumFallback = epsRows.reduce((a, d) => a + (d.value || 0), 0);

          const latestEquity   = equityRows[0]?.value || null;
          const earliestEquity = equityRows[equityRows.length - 1]?.value || null;

          // 調整ROE = 近4季淨利 / 最早季母公司權益
          const adjustedROE = (eps4sum && earliestEquity)
            ? (eps4sum / earliestEquity) * 100
            : null;

          // 每股調整淨值：需要流通在外股數
          // 用 PE/PB 反推每股淨值作為調整每股淨值
          let bookValue = null;
          const tradingDates = getLastTradingDates(3);
          for (const dateStr of tradingDates) {
            const r2 = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${dateStr}&selectType=ALL&response=json`);
            const raw2 = await r2.json();
            if (raw2?.data?.length) {
              const row2 = raw2.data.find(d => d[0] === stockNo);
              if (row2) {
                const currentPrice = parseFloat(row2[2].replace(/,/g,''));
                const pb = parseFloat(row2[6]);
                if (pb && currentPrice) { bookValue = currentPrice / pb; break; }
              }
            }
          }

          // 基準值 = 每股淨值 × 調整ROE × 10
          const benchmark = (bookValue && adjustedROE)
            ? bookValue * (adjustedROE / 100) * 10
            : null;

          data = {
            eps4sum,
            eps4sumEPS: eps4sumFallback,
            latestEquity,
            earliestEquity,
            adjustedROE,
            adjustedEquityPerShare: bookValue,
            benchmark,
            source: 'finmind',
            quarters: netIncomeRows.map(d => ({ date: d.date, netIncome: d.value })),
          };

        } catch (err) {
          // Fallback: PE/PB 反推
          const priceUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${stockNo}.tw&json=1&delay=0`;
          const priceR = await fetch(priceUrl, { headers: { 'Referer': 'https://mis.twse.com.tw/stock/fibest.html', 'User-Agent': 'Mozilla/5.0' } });
          const priceRaw = await priceR.json();
          const item = priceRaw?.msgArray?.[0];
          const currentPrice = item ? (parseFloat(item.z) > 0 ? parseFloat(item.z) : parseFloat(item.y)) : null;

          let finRaw = null;
          for (let i = 1; i <= 7; i++) {
            const d = new Date(); d.setHours(d.getHours() + 8); d.setDate(d.getDate() - i);
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const dateStr = d.toISOString().slice(0,10).replace(/-/g,'');
            const r = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${dateStr}&selectType=ALL&response=json`);
            finRaw = await r.json();
            if (finRaw?.data?.length) break;
            finRaw = null;
          }

          const row = finRaw?.data?.find(d => d[0] === stockNo);
          const pe = row ? parseFloat(row[5]) : null;
          const pb = row ? parseFloat(row[6]) : null;
          const eps = (pe && currentPrice) ? currentPrice / pe : null;
          const bookValue = (pb && currentPrice) ? currentPrice / pb : null;
          const adjustedROE = (eps && bookValue) ? (eps / bookValue) * 100 : null;

          data = {
            eps4sum: eps,
            adjustedROE,
            adjustedEquityPerShare: bookValue,
            benchmark: bookValue && adjustedROE ? bookValue * (adjustedROE / 100) * 10 : null,
            source: 'fallback_pePb',
            error: err.message,
          };
        }
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
