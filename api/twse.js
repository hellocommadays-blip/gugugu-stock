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

// TWSE 產業分類代碼 → 中文名稱（screener、industrype、eps 共用）
const INDUSTRY_MAP = {
  '01':'水泥工業','02':'食品工業','03':'塑膠工業','04':'紡織纖維',
  '05':'電機機械','06':'電器電纜','07':'化學生技醫療','08':'玻璃陶瓷',
  '09':'造紙工業','10':'鋼鐵工業','11':'橡膠工業','12':'汽車工業',
  '13':'電子工業','14':'建材營造','15':'航運業','16':'觀光餐旅',
  '17':'金融保險','18':'貿易百貨','19':'綜合','20':'其他',
  '21':'化學工業','22':'生技醫療業','23':'油電燃氣業','24':'半導體業',
  '25':'電腦及週邊設備業','26':'光電業','27':'通信網路業','28':'電子零組件業',
  '29':'電子通路業','30':'資訊服務業','31':'其他電子業','32':'文化創意業',
  '33':'農業科技業','34':'電子商務','35':'綠能環保','36':'數位雲端',
  '37':'運動休閒','38':'居家生活','80':'管理股票','90':'存託憑證',
};

// 抓全市場 PE/PB（BWIBBU_d）+ 公司產業分類（t187ap03_L）
// screener、industrype、eps 共用，避免重複實作抓取邏輯
async function fetchMarketPEPB() {
  const tradingDates = getLastTradingDates(3);
  let raw = null;
  for (const dateStr of tradingDates) {
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${dateStr}&selectType=ALL&response=json`;
    const r   = await fetch(url);
    raw = await r.json();
    if (raw?.data?.length) break;
    raw = null;
  }
  if (!raw?.data) return { rows: [], industryMap: {}, date: null };

  const companyRes   = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L');
  const companyRaw   = await companyRes.json().catch(() => []);
  const industryMap  = {};
  if (Array.isArray(companyRaw)) {
    companyRaw.forEach(c => {
      const code = c['公司代號'];
      const ind  = c['產業別'];
      if (code) industryMap[code] = INDUSTRY_MAP[ind] || ind || '';
    });
  }

  return { rows: raw.data, industryMap, date: raw.date || null };
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 依產業分組，算出每個產業目前的 PE 中位數
// 回傳 { industries: { 產業名稱: { medianPE, sampleSize } }, industryMap, date }
async function computeIndustryMedianPE() {
  const { rows, industryMap, date } = await fetchMarketPEPB();

  const byIndustry = {};
  rows.forEach(row => {
    const symbol = row[0];
    const pe     = parseFloat(row[5]);
    // 排除虧損股（PE 為負或 0）與缺資料的股票，避免拉歪中位數
    if (!symbol || !pe || pe <= 0) return;
    const industry = industryMap[symbol] || '其他';
    if (!byIndustry[industry]) byIndustry[industry] = [];
    byIndustry[industry].push(pe);
  });

  const industries = {};
  Object.entries(byIndustry).forEach(([industry, peList]) => {
    industries[industry] = {
      medianPE:   Math.round(median(peList) * 100) / 100,
      sampleSize: peList.length,
    };
  });

  return { industries, industryMap, date };
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { type, stockNo } = req.query;
  // screener、industrype 不需要 stockNo
  if (!stockNo && type !== 'screener' && type !== 'industrype') { res.status(400).json({ error: 'stockNo 必填' }); return; }

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

          // 損益表資料
          const incomeData = raw.data;

          // 近4季「歸屬母公司淨利」（損益表的 EquityAttributableToOwnersOfParent）
          const netIncomeRows = incomeData
            .filter(d => d.type === 'EquityAttributableToOwnersOfParent')
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 4);

          // 近4季 EPS
          const epsRows = incomeData
            .filter(d => d.type === 'EPS')
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 4);

          if (netIncomeRows.length === 0) {
            res.status(200).json({ success: true, data: null, note: '找不到淨利欄位' });
            return;
          }

          // 近4季淨利加總
          const netIncome4sum = netIncomeRows.reduce((a, d) => a + (d.value || 0), 0);
          const eps4sum       = epsRows.reduce((a, d) => a + (d.value || 0), 0);

          // 抓資產負債表：母公司權益 + 其他權益
          const earliestDate = netIncomeRows[netIncomeRows.length - 1]?.date?.slice(0, 7);
          const latestDate   = netIncomeRows[0]?.date?.slice(0, 7);
          // 固定從 2024-01-01 抓，確保能取到近4季前一季的資產負債表
          const balanceUrl   = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockBalanceSheet&data_id=${stockNo}&start_date=2024-01-01&token=${FINMIND_TOKEN}`;
          const balanceR     = await fetch(balanceUrl);
          const balanceRaw   = await balanceR.json();
          const balanceData  = balanceRaw?.data || [];

          // 找出近4季淨利中最早那季的日期，用那季的資產負債表
          const earliestIncomeDate = netIncomeRows[netIncomeRows.length - 1]?.date;
          const latestIncomeDate   = netIncomeRows[0]?.date;

          const balanceByDate = {};
          balanceData.forEach(d => {
            if (!balanceByDate[d.date]) balanceByDate[d.date] = {};
            balanceByDate[d.date][d.type] = d.value;
          });

          // 調整ROE分母：用「近4季最早季淨利的前一季」資產負債表
          // 例：近4季 = 2025Q2~2026Q1，最早 = 2025Q2（2025-06-30）
          // 前一季 = 2025Q1（2025-03-31）
          const allBalDates = Object.keys(balanceByDate).sort();
          const denomDate   = allBalDates.filter(d => d < earliestIncomeDate).pop()
                           || allBalDates[0];
          const earliestBal = balanceByDate[denomDate] || {};
          const latestBal   = balanceByDate[allBalDates[allBalDates.length - 1]] || {};

          console.log('earliestIncomeDate:', earliestIncomeDate);
          console.log('denomDate:', denomDate);
          console.log('allBalDates:', allBalDates);

          // 調整ROE 分母 = 最早季母公司權益 + 最早季其他權益
          const earliestEquity      = earliestBal['EquityAttributableToOwnersOfParent'] || null;
          const earliestOtherEquity = earliestBal['OtherEquityInterest'] || null;
          const adjustedROEDenom    = earliestEquity && earliestOtherEquity
            ? earliestEquity + earliestOtherEquity
            : earliestEquity;

          // 最新季每股調整淨值 = (最新季母公司權益 + 最新季其他權益) / 流通在外張數
          const latestEquity      = latestBal['EquityAttributableToOwnersOfParent'] || null;
          const latestOtherEquity = latestBal['OtherEquityInterest'] || null;

          // 流通在外張數：用 PB 反推
          let sharesThousand = null;
          let bookValuePerShare = null;
          const tradingDates = getLastTradingDates(3);
          for (const dateStr of tradingDates) {
            const r2   = await fetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${dateStr}&selectType=ALL&response=json`);
            const raw2 = await r2.json();
            if (raw2?.data?.length) {
              const row2 = raw2.data.find(d => d[0] === stockNo);
              if (row2) {
                const cp = parseFloat(row2[2].replace(/,/g,''));
                const pb = parseFloat(row2[6]);
                if (pb && cp) {
                  bookValuePerShare = cp / pb;
                  // 反推流通在外張數（千股）
                  if (latestEquity) sharesThousand = latestEquity / bookValuePerShare / 1000;
                  break;
                }
              }
            }
          }

          // 每股調整淨值 = (最新季母公司權益 + 其他權益) / 流通在外張數
          const adjustedEquityTotal = (latestEquity && latestOtherEquity)
            ? latestEquity + latestOtherEquity
            : latestEquity;
          const adjustedEquityPerShare = (adjustedEquityTotal && sharesThousand)
            ? adjustedEquityTotal / (sharesThousand * 1000)
            : bookValuePerShare;

          // 調整ROE = 近4季母公司淨利 / (最早季母公司權益 + 其他權益)
          const adjustedROE = (netIncome4sum && adjustedROEDenom)
            ? (netIncome4sum / adjustedROEDenom) * 100
            : null;

          // 基準值 = 每股調整淨值 × 調整ROE × 10
          const benchmark = (adjustedEquityPerShare && adjustedROE)
            ? adjustedEquityPerShare * (adjustedROE / 100) * 10
            : null;

          data = {
            netIncome4sum,
            eps4sum,
            earliestEquity,
            earliestOtherEquity,
            adjustedROEDenom,
            latestEquity,
            latestOtherEquity,
            adjustedEquityPerShare,
            adjustedROE,
            benchmark,
            source: 'finmind_precise',
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

        // ── 新增：EPS × 產業中位數PE 估值法（跟原本的 BPS×ROE×10 並存，先不取代）──
        // 用「同產業其他股票現在實際交易的PE中位數」當基準，取代原本拍腦袋訂的固定倍數 10。
        // 打站內的 industrype endpoint（走 CDN 快取，一天只會真正重新計算一次），
        // 不要直接呼叫 computeIndustryMedianPE()——那樣等於每次查個股都重新掃一次全市場，
        // 這個 eps endpoint 本身已經疊了好幾個外部 API 呼叫，不該再疊一次全市場掃描。
        // 這段獨立包一層 try/catch：就算產業中位數查詢失敗，也不能影響上面已經算好的 benchmark。
        try {
          const base = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'https://gugugu-stock.vercel.app';
          const indRes  = await fetch(`${base}/api/twse?type=industrype`);
          const indData = await indRes.json();

          const industries   = indData?.industries || {};
          // industrype 不回傳 industryMap（避免回應太肥），這裡另外查這支股票自己的產業別
          const compRes  = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L');
          const compRaw  = await compRes.json().catch(() => []);
          const compItem = Array.isArray(compRaw) ? compRaw.find(c => c['公司代號'] === stockNo) : null;
          const stockIndustry = compItem ? (INDUSTRY_MAP[compItem['產業別']] || compItem['產業別'] || null) : null;
          const industryStat  = stockIndustry ? industries[stockIndustry] : null;

          data.industryName       = stockIndustry;
          data.industryMedianPE   = industryStat ? industryStat.medianPE   : null;
          data.industrySampleSize = industryStat ? industryStat.sampleSize : null;
          data.benchmarkByPE = (data.eps4sum > 0 && industryStat?.medianPE)
            ? Math.round(data.eps4sum * industryStat.medianPE * 100) / 100
            : null;
        } catch (industryErr) {
          console.error('industry median PE lookup error:', industryErr.message);
          data.industryName       = null;
          data.industryMedianPE   = null;
          data.industrySampleSize = null;
          data.benchmarkByPE      = null;
        }

        break;
      }

            // ── Debug：看 FinMind 原始資料 ──────────────────────
      case 'rawfinmind': {
        const FINMIND_TOKEN = process.env.FINMIND_API_TOKEN;
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockFinancialStatements&data_id=${stockNo}&start_date=2024-01-01&token=${FINMIND_TOKEN}`;
        const r   = await fetch(url);
        const raw = await r.json();
        // 只回傳 EquityAttributableToOwnersOfParent 和 IncomeAfterTaxes
        const filtered = raw?.data?.filter(d =>
          ['EquityAttributableToOwnersOfParent','IncomeAfterTaxes','EPS'].includes(d.type)
        ).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20);
        data = { filtered, total: raw?.data?.length };
        break;
      }

      // ── Debug：看 FinMind 資產負債表 ───────────────────
      case 'rawbalance': {
        const FINMIND_TOKEN = process.env.FINMIND_API_TOKEN;
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockBalanceSheet&data_id=${stockNo}&start_date=2024-01-01&token=${FINMIND_TOKEN}`;
        const r   = await fetch(url);
        const raw = await r.json();
        // 找所有日期的母公司權益和其他權益
        const equity = (raw?.data||[]).filter(d =>
          d.type === 'EquityAttributableToOwnersOfParent' || d.type === 'OtherEquityInterest'
        ).sort((a,b)=>a.date.localeCompare(b.date));
        const dates = [...new Set((raw?.data||[]).map(d=>d.date))].sort();
        data = { dates, equity, total: raw?.data?.length };
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
        const industryCode = item['產業別'];
        data = {
          code:     item['公司代號'],
          name:     item['公司簡稱'],
          industry: INDUSTRY_MAP[industryCode] || industryCode,
          industryCode,
          chairman: item['董事長'],
          website:  item['網址'],
          listed:   item['上市日期'],
        };
        break;
      }

      // ── 全市場選股（BWIBBU_d 近似基準值）────────────────
      case 'screener': {
        const { rows, industryMap, date } = await fetchMarketPEPB();

        if (!rows.length) {
          res.status(200).json({ success: true, data: [], note: '無市場資料' });
          return;
        }

        // 計算每支股票的近似基準值
        const results = rows
          .filter(row => row[0] && row[5] && row[6])
          .map(row => {
            const symbol   = row[0];
            const name     = row[1];
            const price    = parseFloat(row[2]?.replace(/,/g,'')) || 0;
            const divYield = parseFloat(row[3]) || null;
            const pe       = parseFloat(row[5]) || null;
            const pb       = parseFloat(row[6]) || null;
            const industry = industryMap[symbol] || '';

            if (!pe || !pb || price === 0) return null;

            const eps       = price / pe;
            const bookValue = price / pb;
            const approxROE = (eps / bookValue) * 100;
            const benchmark = bookValue * (approxROE / 100) * 10;
            const ratio     = price / benchmark;

            let zone = '';
            if      (ratio < 0.85) zone = '極低估區';
            else if (ratio < 1.00) zone = '低估區';
            else if (ratio < 1.15) zone = '合理區';
            else if (ratio < 1.30) zone = '偏高區';
            else if (ratio < 2.00) zone = '高估區';
            else                   zone = '泡沫區';

            return {
              symbol, name, industry, price,
              change: null, changePct: null,
              pe, pb, divYield,
              benchmark: Math.round(benchmark * 100) / 100,
              ratio:     Math.round(ratio * 100) / 100,
              zone,
            };
          })
          .filter(Boolean);

        res.status(200).json({ success: true, data: results, date });
        return;
      }

      // ── 產業本益比中位數（給「EPS × 產業中位數PE」估值法用）──
      case 'industrype': {
        const { industries, date } = await computeIndustryMedianPE();
        // 一天更新一次即可（TWSE 資料本來就是收盤後才更新），交給 CDN 快取，
        // 避免每次查詢個股都要重新掃一次全市場
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        res.status(200).json({ success: true, industries, date });
        return;
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
