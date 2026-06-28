// api/rate.js — 台銀匯率 proxy
// 抓台灣銀行即期匯率（USD、JPY → TWD）

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const r = await fetch('https://rate.bot.com.tw/xrt/fliste/0/l/TW', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!r.ok) throw new Error(`台銀回應 ${r.status}`);
    const text = await r.text();

    // 解析 HTML table 取出匯率
    const rates = {};

    // USD
    const usdMatch = text.match(/USD[\s\S]*?<\/tr>/);
    if (usdMatch) {
      const nums = usdMatch[0].match(/[\d.]+/g);
      if (nums && nums.length >= 4) {
        rates.USD = { buy: parseFloat(nums[2]), sell: parseFloat(nums[3]) };
      }
    }

    // JPY（每100日圓）
    const jpyMatch = text.match(/JPY[\s\S]*?<\/tr>/);
    if (jpyMatch) {
      const nums = jpyMatch[0].match(/[\d.]+/g);
      if (nums && nums.length >= 4) {
        rates.JPY = { buy: parseFloat(nums[2]) / 100, sell: parseFloat(nums[3]) / 100 };
      }
    }

    // fallback：如果解析失敗，用備用 API
    if (!rates.USD) {
      const fallback = await fetch('https://api.exchangerate-api.com/v4/latest/TWD');
      if (fallback.ok) {
        const data = await fallback.json();
        if (data.rates) {
          rates.USD = { buy: 1 / data.rates.USD, sell: 1 / data.rates.USD };
          rates.JPY = { buy: 1 / data.rates.JPY, sell: 1 / data.rates.JPY };
        }
      }
    }

    if (!rates.USD) throw new Error('無法取得匯率');

    res.status(200).json({
      success: true,
      rates,
      updatedAt: new Date().toISOString(),
      note: '台灣銀行即期匯率',
    });

  } catch (err) {
    // 最終 fallback：硬編碼近似值
    res.status(200).json({
      success: true,
      rates: {
        USD: { buy: 32.0, sell: 32.5 },
        JPY: { buy: 0.205, sell: 0.215 },
      },
      updatedAt: new Date().toISOString(),
      note: '使用預設匯率（台銀暫時無法存取）',
    });
  }
}
