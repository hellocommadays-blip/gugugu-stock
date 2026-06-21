// api/twse.js — 台股 TWSE / MOPS proxy
// Vercel Serverless Function

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
        // 先試上市，再試上櫃
        const tryMarkets = [
          `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${stockNo}.tw&json=1&delay=0`,
          `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${stockNo}.tw&json=1&delay=0`,
        ];

        let item = null;
        for (const url of tryMarkets) {
          const r = await fetch(url, {
            headers: {
              'Referer':    'https://mis.twse.com.tw/stock/fibest.html',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            }
          });
          const raw = await r.json();
          if (raw?.msgArray?.[0]?.z && raw.msgArray[0].z !== '-') {
            item = raw.msgArray[0];
            break;
          }
        }

        // 若盤中無成交（z='-'），改用昨收
        if (!item) {
          // fallback: 用 TWSE 收盤行情
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${stockNo}&date=${today}&response=json`;
          const r   = await fetch(url);
          const raw = await r.json();
          const lastRow = raw?.data?.at(-1);
          if (!lastRow) { res.status(404).json({ error: `找不到股票 ${stockNo}` }); return; }
          data = {
            symbol:    stockNo,
            name:      raw.title?.match(/(\S+)\s+個股日成交/)?.[1] || stockNo,
            price:     parseFloat(lastRow[6].replace(/,/g, '')),
            open:      parseFloat(lastRow[3].replace(/,/g, '')),
            high:      parseFloat(lastRow[4].replace(/,/g, '')),
            low:       parseFloat(lastRow[5].replace(/,/g, '')),
            prevClose: null,
            change:    parseFloat(lastRow[7].replace(/,/g, '').replace(/[▲▼X]/g, '')),
            changePct: null,
            market:    'TW',
            currency:  'TWD',
            isDelayed: true,
          };
          break;
        }

        const price     = parseFloat(item.z) !== 0 ? parseFloat(item.z) : parseFloat(item.y);
        const prevClose = parseFloat(item.y);
        data = {
          symbol:    stockNo,
          name:      item.n,
          price:     price,
          open:      parseFloat(item.o) || null,
          high:      parseFloat(item.h) || null,
          low:       parseFloat(item.l) || null,
          prevClose: prevClose,
          change:    Math.round((price - prevClose) * 100) / 100,
          changePct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
          volume:    parseInt(item.v) || 0,
          market:    'TW',
          currency:  'TWD',
          isDelayed: false,
        };
        break;
      }

      // ── 歷史日行情（近3個月，合併兩個月資料）────────────
      case 'history': {
        const now   = new Date();
        const months = [
          new Date(now.getFullYear(), now.getMonth() - 1, 1),
          new Date(now.getFullYear(), now.getMonth(),     1),
        ];

        let allData = [];
        for (const m of months) {
          const dateStr = `${m.getFullYear()}${String(m.getMonth()+1).padStart(2,'0')}01`;
          const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${stockNo}&date=${dateStr}&response=json`;
          try {
            const r   = await fetch(url);
            const raw = await r.json();
            if (raw?.data) {
              const rows = raw.data.map(row => {
                // 民國年轉西元
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
            }
          } catch (_) { /* 某個月抓失敗就跳過 */ }
        }

        data = allData.slice(-60); // 最多60筆
        break;
      }

      // ── 三大法人（TWSE 官方，用股票代號查當日）──────────
      case 'institutional': {
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const url   = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${today}&selectType=ALLBUT0999&response=json`;
        const r     = await fetch(url);
        const raw   = await r.json();

        if (!raw?.data) { res.status(200).json({ success:true, data:null, note:'今日無法人資料' }); return; }

        // 欄位：[代號, 名稱, 外資買, 外資賣, 外資超, 投信買, 投信賣, 投信超, 自營買, 自營賣, 自營超, 自營避險買, 自營避險賣, 自營避險超, 三大法人超]
        const row = raw.data.find(d => d[0] === stockNo);
        if (!row) { res.status(200).json({ success:true, data:null, note:'查無此股票法人資料' }); return; }

        const p = s => parseInt((s||'0').replace(/,/g,'')) || 0;
        data = {
          foreign:    p(row[4]),
          investment: p(row[7]),
          dealer:     p(row[10]),
          dealerHedge:p(row[13]),
          total:      p(row[14]),
          date:       raw.date || today,
        };
        break;
      }

      // ── 融資融券（TWSE 官方）────────────────────────────
      case 'margin': {
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const url   = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${today}&selectType=ALL&response=json`;
        const r     = await fetch(url);
        const raw   = await r.json();

        if (!raw?.data) { res.status(200).json({ success:true, data:null, note:'今日無融資券資料' }); return; }

        // 欄位：[代號, 名稱, 融資買進, 融資賣出, 融資現金償還, 融資餘額, 融資限額, 融券賣出, 融券買進, 融券現券償還, 融券餘額, 融券限額, 資券相抵]
        const row = raw.data.find(d => d[0] === stockNo);
        if (!row) { res.status(200).json({ success:true, data:null, note:'查無此股票融資券資料' }); return; }

        const p = s => parseInt((s||'0').replace(/,/g,'')) || 0;
        data = {
          marginBuy:     p(row[2]),
          marginSell:    p(row[3]),
          marginBalance: p(row[5]),
          shortSell:     p(row[7]),
          shortBuy:      p(row[8]),
          shortBalance:  p(row[10]),
          offset:        p(row[12]),
          net:           p(row[2]) - p(row[7]), // 融資買-融券賣，正數偏多
        };
        break;
      }

      // ── 公司基本資料（TWSE OpenAPI）──────────────────────
      case 'company': {
        const url = `https://openapi.twse.com.tw/v1/opendata/t187ap03_L`;
        const r   = await fetch(url);
        const raw = await r.json();
        const item = raw?.find(d => d['公司代號'] === stockNo);
        if (!item) { res.status(404).json({ error: '查無公司資料' }); return; }
        data = {
          code:      item['公司代號'],
          name:      item['公司簡稱'],
          fullName:  item['公司名稱'],
          industry:  item['產業別'],
          chairman:  item['董事長'],
          ceo:       item['總經理'],
          address:   item['公司地址'],
          website:   item['網址'],
          email:     item['電子郵件信箱'],
          established: item['成立日期'],
          listed:    item['上市日期'],
        };
        break;
      }

      // ── 財務數據（TWSE OpenAPI 財報摘要）────────────────
      // TWSE OpenAPI 提供 EPS、每股淨值等基本財務
      case 'financials': {
        // 近期 EPS
        const urlEps = `https://openapi.twse.com.tw/v1/opendata/t187ap06_L`;
        const rEps   = await fetch(urlEps);
        const rawEps = await rEps.json();
        const epsRows = rawEps?.filter(d => d['公司代號'] === stockNo) || [];

        // 每股淨值
        const urlBv = `https://openapi.twse.com.tw/v1/opendata/t187ap04_L`;
        const rBv   = await fetch(urlBv);
        const rawBv = await rBv.json();
        const bvRow = rawBv?.find(d => d['公司代號'] === stockNo);

        data = {
          eps:          epsRows.map(r => ({
            year:    r['年度'],
            quarter: r['季別'],
            eps:     parseFloat(r['基本每股盈餘（元）']) || null,
          })),
          bookValue:    bvRow ? parseFloat(bvRow['每股淨值']) || null : null,
          equity:       bvRow ? parseFloat(bvRow['股東權益合計'].replace(/,/g,'')) || null : null,
          shares:       bvRow ? parseFloat(bvRow['普通股股數（千股）'].replace(/,/g,'')) || null : null,
          note: 'TWSE OpenAPI 財務摘要，調整ROE 需自行計算',
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
