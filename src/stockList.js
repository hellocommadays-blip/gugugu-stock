// stockList.js — 靜態股票清單（搜尋自動補全用）
// 選股用的完整清單在下方 SCREENER_US / SCREENER_JP 匯出

export const STOCK_LIST = [
  // ── 台股：半導體 ────────────────────────────────────────
  { sym:"2330", name:"台積電",     industry:"半導體業",   market:"TW" },
  { sym:"2303", name:"聯電",       industry:"半導體業",   market:"TW" },
  { sym:"2344", name:"華邦電",     industry:"半導體業",   market:"TW" },
  { sym:"2408", name:"南亞科",     industry:"半導體業",   market:"TW" },
  { sym:"2454", name:"聯發科",     industry:"半導體業",   market:"TW" },
  { sym:"3711", name:"日月光投控", industry:"半導體業",   market:"TW" },
  { sym:"6770", name:"力積電",     industry:"半導體業",   market:"TW" },
  { sym:"3661", name:"世芯-KY",    industry:"半導體業",   market:"TW" },
  { sym:"3034", name:"聯詠",       industry:"半導體業",   market:"TW" },
  { sym:"2379", name:"瑞昱",       industry:"半導體業",   market:"TW" },
  { sym:"6415", name:"矽力-KY",    industry:"半導體業",   market:"TW" },
  { sym:"4968", name:"立積",       industry:"半導體業",   market:"TW" },
  { sym:"3443", name:"創意",       industry:"半導體業",   market:"TW" },
  { sym:"6533", name:"嘉澤",       industry:"半導體業",   market:"TW" },
  { sym:"8046", name:"南電",       industry:"半導體業",   market:"TW" },

  // ── 台股：電腦及週邊設備 ────────────────────────────────
  { sym:"2317", name:"鴻海",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"2382", name:"廣達",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"2357", name:"華碩",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"2353", name:"宏碁",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"2324", name:"仁寶",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"2356", name:"英業達",     industry:"電腦及週邊設備業", market:"TW" },
  { sym:"4938", name:"和碩",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"6669", name:"緯穎",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"3231", name:"緯創",       industry:"電腦及週邊設備業", market:"TW" },

  // ── 台股：電子零組件 ────────────────────────────────────
  { sym:"2308", name:"台達電",     industry:"電子零組件業", market:"TW" },
  { sym:"2327", name:"國巨",       industry:"電子零組件業", market:"TW" },
  { sym:"2360", name:"致茂",       industry:"電子零組件業", market:"TW" },
  { sym:"3017", name:"奇鋐",       industry:"電子零組件業", market:"TW" },
  { sym:"2301", name:"光寶科",     industry:"電子零組件業", market:"TW" },
  { sym:"2395", name:"研華",       industry:"電子零組件業", market:"TW" },
  { sym:"3005", name:"神基",       industry:"電腦及週邊設備業", market:"TW" },
  { sym:"2365", name:"昆盈",       industry:"電子零組件業", market:"TW" },
  { sym:"2492", name:"華新科",     industry:"電子零組件業", market:"TW" },

  // ── 台股：光電 ──────────────────────────────────────────
  { sym:"3008", name:"大立光",     industry:"光電業",     market:"TW" },
  { sym:"2383", name:"台光電",     industry:"光電業",     market:"TW" },
  { sym:"3406", name:"玉晶光",     industry:"光電業",     market:"TW" },
  { sym:"2409", name:"友達",       industry:"光電業",     market:"TW" },
  { sym:"3481", name:"群創",       industry:"光電業",     market:"TW" },

  // ── 台股：通信網路 ──────────────────────────────────────
  { sym:"2412", name:"中華電",     industry:"通信網路業", market:"TW" },
  { sym:"3045", name:"台灣大",     industry:"通信網路業", market:"TW" },
  { sym:"4904", name:"遠傳",       industry:"通信網路業", market:"TW" },
  { sym:"2345", name:"智邦",       industry:"通信網路業", market:"TW" },

  // ── 台股：金融保險 ──────────────────────────────────────
  { sym:"2881", name:"富邦金",     industry:"金融保險業", market:"TW" },
  { sym:"2882", name:"國泰金",     industry:"金融保險業", market:"TW" },
  { sym:"2886", name:"兆豐金",     industry:"金融保險業", market:"TW" },
  { sym:"2891", name:"中信金",     industry:"金融保險業", market:"TW" },
  { sym:"2884", name:"玉山金",     industry:"金融保險業", market:"TW" },
  { sym:"2892", name:"第一金",     industry:"金融保險業", market:"TW" },
  { sym:"2880", name:"華南金",     industry:"金融保險業", market:"TW" },
  { sym:"2883", name:"凱基金",     industry:"金融保險業", market:"TW" },
  { sym:"2885", name:"元大金",     industry:"金融保險業", market:"TW" },
  { sym:"2887", name:"台新新光金", industry:"金融保險業", market:"TW" },
  { sym:"2890", name:"永豐金",     industry:"金融保險業", market:"TW" },
  { sym:"2889", name:"國票金",     industry:"金融保險業", market:"TW" },
  { sym:"5876", name:"上海商銀",   industry:"金融保險業", market:"TW" },
  { sym:"5880", name:"合庫金",     industry:"金融保險業", market:"TW" },
  { sym:"5871", name:"中租-KY",    industry:"金融保險業", market:"TW" },
  { sym:"2855", name:"統一證",     industry:"金融保險業", market:"TW" },

  // ── 台股：航運 ──────────────────────────────────────────
  { sym:"2603", name:"長榮",       industry:"航運業",     market:"TW" },
  { sym:"2609", name:"陽明",       industry:"航運業",     market:"TW" },
  { sym:"2615", name:"萬海",       industry:"航運業",     market:"TW" },
  { sym:"2618", name:"長榮航",     industry:"航運業",     market:"TW" },
  { sym:"2610", name:"華航",       industry:"航運業",     market:"TW" },
  { sym:"2605", name:"新興",       industry:"航運業",     market:"TW" },
  { sym:"2633", name:"台灣高鐵",   industry:"航運業",     market:"TW" },
  { sym:"2637", name:"慧洋-KY",    industry:"航運業",     market:"TW" },

  // ── 台股：塑膠石化 ──────────────────────────────────────
  { sym:"1301", name:"台塑",       industry:"塑膠工業",   market:"TW" },
  { sym:"1303", name:"南亞",       industry:"塑膠工業",   market:"TW" },
  { sym:"1326", name:"台化",       industry:"塑膠工業",   market:"TW" },
  { sym:"6505", name:"台塑化",     industry:"油電燃氣業", market:"TW" },

  // ── 台股：鋼鐵 ──────────────────────────────────────────
  { sym:"2002", name:"中鋼",       industry:"鋼鐵工業",   market:"TW" },
  { sym:"2006", name:"東和鋼鐵",   industry:"鋼鐵工業",   market:"TW" },
  { sym:"2015", name:"豐興",       industry:"鋼鐵工業",   market:"TW" },
  { sym:"2031", name:"新光鋼",     industry:"鋼鐵工業",   market:"TW" },

  // ── 台股：汽車 ──────────────────────────────────────────
  { sym:"2207", name:"和泰車",     industry:"汽車工業",   market:"TW" },
  { sym:"2201", name:"裕隆",       industry:"汽車工業",   market:"TW" },
  { sym:"2204", name:"中華",       industry:"汽車工業",   market:"TW" },
  { sym:"2206", name:"三陽工業",   industry:"汽車工業",   market:"TW" },

  // ── 台股：食品 ──────────────────────────────────────────
  { sym:"1216", name:"統一",       industry:"食品工業",   market:"TW" },
  { sym:"1210", name:"大成",       industry:"食品工業",   market:"TW" },
  { sym:"1215", name:"卜蜂",       industry:"食品工業",   market:"TW" },
  { sym:"2912", name:"統一超",     industry:"貿易百貨",   market:"TW" },
  { sym:"1229", name:"聯華",       industry:"食品工業",   market:"TW" },

  // ── 台股：建材營造 ──────────────────────────────────────
  { sym:"2542", name:"興富發",     industry:"建材營造",   market:"TW" },
  { sym:"2548", name:"華固",       industry:"建材營造",   market:"TW" },
  { sym:"2535", name:"達欣工",     industry:"建材營造",   market:"TW" },
  { sym:"9933", name:"中鼎",       industry:"建材營造",   market:"TW" },
  { sym:"2597", name:"潤弘",       industry:"建材營造",   market:"TW" },

  // ── 台股：觀光餐旅 ──────────────────────────────────────
  { sym:"2707", name:"晶華",       industry:"觀光餐旅",   market:"TW" },
  { sym:"2727", name:"王品",       industry:"觀光餐旅",   market:"TW" },
  { sym:"2731", name:"雄獅",       industry:"觀光餐旅",   market:"TW" },
  { sym:"2753", name:"八方雲集",   industry:"觀光餐旅",   market:"TW" },

  // ── 台股：生技醫療 ──────────────────────────────────────
  { sym:"6446", name:"藥華藥",     industry:"生技醫療業", market:"TW" },
  { sym:"4723", name:"晟德",       industry:"生技醫療業", market:"TW" },
  { sym:"1789", name:"神隆",       industry:"生技醫療業", market:"TW" },
  { sym:"4174", name:"浩鼎",       industry:"生技醫療業", market:"TW" },

  // ── 台股：其他 ──────────────────────────────────────────
  { sym:"1102", name:"亞泥",       industry:"水泥工業",   market:"TW" },
  { sym:"1722", name:"台肥",       industry:"化學工業",   market:"TW" },
  { sym:"9917", name:"中保科",     industry:"其他",       market:"TW" },
  { sym:"9914", name:"美利達",     industry:"其他",       market:"TW" },
  { sym:"9921", name:"巨大",       industry:"其他",       market:"TW" },

  // ── 台股：ETF ───────────────────────────────────────────
  { sym:"0050",  name:"元大台灣50",         industry:"ETF", market:"TW" },
  { sym:"0056",  name:"元大高股息",         industry:"ETF", market:"TW" },
  { sym:"00878", name:"國泰永續高股息",     industry:"ETF", market:"TW" },
  { sym:"00919", name:"群益台灣精選高息",   industry:"ETF", market:"TW" },
  { sym:"00929", name:"復華台灣科技優息",   industry:"ETF", market:"TW" },
  { sym:"00940", name:"元大台灣價值高息",   industry:"ETF", market:"TW" },
  { sym:"00918", name:"大華優利高填息30",   industry:"ETF", market:"TW" },
  { sym:"00915", name:"凱基優選高股息30",   industry:"ETF", market:"TW" },
  { sym:"006208", name:"富邦台50",          industry:"ETF", market:"TW" },
  { sym:"00881", name:"國泰台灣5G+",        industry:"ETF", market:"TW" },
  { sym:"00858", name:"永豐美國500大",      industry:"ETF", market:"TW" },
  { sym:"00757", name:"統一FANG+",          industry:"ETF", market:"TW" },

  // ── 美股：科技 ──────────────────────────────────────────
  { sym:"AAPL",  name:"Apple",              industry:"Technology",      market:"US" },
  { sym:"MSFT",  name:"Microsoft",          industry:"Technology",      market:"US" },
  { sym:"NVDA",  name:"Nvidia",             industry:"Semiconductors",  market:"US" },
  { sym:"GOOGL", name:"Alphabet",           industry:"Technology",      market:"US" },
  { sym:"META",  name:"Meta Platforms",     industry:"Technology",      market:"US" },
  { sym:"AMZN",  name:"Amazon",             industry:"E-Commerce",      market:"US" },
  { sym:"TSLA",  name:"Tesla",              industry:"Automobiles",     market:"US" },
  { sym:"NFLX",  name:"Netflix",            industry:"Entertainment",   market:"US" },
  { sym:"AMD",   name:"AMD",                industry:"Semiconductors",  market:"US" },
  { sym:"INTC",  name:"Intel",              industry:"Semiconductors",  market:"US" },
  { sym:"QCOM",  name:"Qualcomm",           industry:"Semiconductors",  market:"US" },
  { sym:"AVGO",  name:"Broadcom",           industry:"Semiconductors",  market:"US" },
  { sym:"CRM",   name:"Salesforce",         industry:"Technology",      market:"US" },
  { sym:"ORCL",  name:"Oracle",             industry:"Technology",      market:"US" },
  { sym:"IBM",   name:"IBM",                industry:"Technology",      market:"US" },
  { sym:"ADBE",  name:"Adobe",              industry:"Technology",      market:"US" },
  { sym:"NOW",   name:"ServiceNow",         industry:"Technology",      market:"US" },
  { sym:"PLTR",  name:"Palantir",           industry:"Technology",      market:"US" },
  { sym:"SNOW",  name:"Snowflake",          industry:"Technology",      market:"US" },
  { sym:"UBER",  name:"Uber",               industry:"Technology",      market:"US" },
  { sym:"ABNB",  name:"Airbnb",             industry:"Technology",      market:"US" },
  { sym:"SHOP",  name:"Shopify",            industry:"Technology",      market:"US" },
  { sym:"SQ",    name:"Block (Square)",     industry:"Fintech",         market:"US" },
  { sym:"PYPL",  name:"PayPal",             industry:"Fintech",         market:"US" },
  { sym:"COIN",  name:"Coinbase",           industry:"Fintech",         market:"US" },

  // ── 美股：金融 ──────────────────────────────────────────
  { sym:"JPM",   name:"JPMorgan Chase",     industry:"Banking",         market:"US" },
  { sym:"BAC",   name:"Bank of America",    industry:"Banking",         market:"US" },
  { sym:"WFC",   name:"Wells Fargo",        industry:"Banking",         market:"US" },
  { sym:"GS",    name:"Goldman Sachs",      industry:"Finance",         market:"US" },
  { sym:"MS",    name:"Morgan Stanley",     industry:"Finance",         market:"US" },
  { sym:"V",     name:"Visa",               industry:"Finance",         market:"US" },
  { sym:"MA",    name:"Mastercard",         industry:"Finance",         market:"US" },
  { sym:"BRK.B", name:"Berkshire Hathaway", industry:"Finance",         market:"US" },
  { sym:"AXP",   name:"American Express",   industry:"Finance",         market:"US" },
  { sym:"BLK",   name:"BlackRock",          industry:"Finance",         market:"US" },
  { sym:"SCHW",  name:"Charles Schwab",     industry:"Finance",         market:"US" },
  { sym:"C",     name:"Citigroup",          industry:"Banking",         market:"US" },
  { sym:"USB",   name:"U.S. Bancorp",       industry:"Banking",         market:"US" },
  { sym:"PNC",   name:"PNC Financial",      industry:"Banking",         market:"US" },

  // ── 美股：消費/零售 ─────────────────────────────────────
  { sym:"KO",    name:"Coca-Cola",          industry:"Beverages",       market:"US" },
  { sym:"PEP",   name:"PepsiCo",            industry:"Beverages",       market:"US" },
  { sym:"MCD",   name:"McDonald's",         industry:"Restaurants",     market:"US" },
  { sym:"SBUX",  name:"Starbucks",          industry:"Restaurants",     market:"US" },
  { sym:"WMT",   name:"Walmart",            industry:"Retail",          market:"US" },
  { sym:"TGT",   name:"Target",             industry:"Retail",          market:"US" },
  { sym:"COST",  name:"Costco",             industry:"Retail",          market:"US" },
  { sym:"NKE",   name:"Nike",               industry:"Apparel",         market:"US" },
  { sym:"DIS",   name:"Disney",             industry:"Entertainment",   market:"US" },
  { sym:"HD",    name:"Home Depot",         industry:"Retail",          market:"US" },
  { sym:"LOW",   name:"Lowe's",             industry:"Retail",          market:"US" },

  // ── 美股：醫療/能源 ─────────────────────────────────────
  { sym:"JNJ",   name:"Johnson & Johnson",  industry:"Healthcare",      market:"US" },
  { sym:"PFE",   name:"Pfizer",             industry:"Pharmaceuticals", market:"US" },
  { sym:"UNH",   name:"UnitedHealth",       industry:"Healthcare",      market:"US" },
  { sym:"XOM",   name:"ExxonMobil",         industry:"Energy",          market:"US" },
  { sym:"CVX",   name:"Chevron",            industry:"Energy",          market:"US" },
  { sym:"TSMC",  name:"TSMC ADR",           industry:"Semiconductors",  market:"US" },
  { sym:"MRK",   name:"Merck",              industry:"Pharmaceuticals", market:"US" },
  { sym:"ABBV",  name:"AbbVie",             industry:"Pharmaceuticals", market:"US" },
  { sym:"LLY",   name:"Eli Lilly",          industry:"Pharmaceuticals", market:"US" },
  { sym:"TMO",   name:"Thermo Fisher",      industry:"Healthcare",      market:"US" },

  // ── 美股：工業/其他 ─────────────────────────────────────

  // ── 日股（用 ADR 代號查詢）───────────────────────────────
  { sym:"TM",    name:"Toyota / トヨタ",         industry:"自動車",    market:"JP" },
  { sym:"SONY",  name:"Sony / ソニー",           industry:"電機",      market:"JP" },
  { sym:"SFTBY", name:"SoftBank / ソフトバンク", industry:"通信",      market:"JP" },
  { sym:"MUFG",  name:"三菱UFJ / MUFG",          industry:"金融",      market:"JP" },
  { sym:"HMC",   name:"Honda / ホンダ",           industry:"自動車",    market:"JP" },
  { sym:"NTDOY", name:"Nintendo / 任天堂",        industry:"ゲーム",    market:"JP" },
  { sym:"KYCCF", name:"Kyocera / 京セラ",         industry:"電機",      market:"JP" },
  { sym:"FANUY", name:"Fanuc / ファナック",        industry:"機械",      market:"JP" },
  { sym:"TOELY", name:"Tokyo Electron / 東京エレク", industry:"半導体", market:"JP" },
  { sym:"SMFG",  name:"三井住友 / SMFG",          industry:"金融",      market:"JP" },
  { sym:"MFG",   name:"みずほ / Mizuho",          industry:"金融",      market:"JP" },
  { sym:"DSNKY", name:"Daikin / ダイキン",         industry:"機械",      market:"JP" },
  { sym:"NNDNY", name:"Nidec / ニデック",          industry:"電機",      market:"JP" },
  { sym:"HTHIY", name:"Hitachi / 日立",            industry:"電機",      market:"JP" },
  { sym:"MSBHY", name:"Mitsubishi / 三菱電機",     industry:"電機",      market:"JP" },
];

// ============================================================
// 選股用靜態清單（美股）
// S&P 500 核心成分股 + 熱門科技股，共約 120 檔
// Finnhub 免費版每分鐘 60 次，前端批次控速
// ============================================================
export const SCREENER_US = [
  // ── 科技/半導體 ──────────────────────────────────────
  { sym:"AAPL  ", name:"Apple",                 industry:"Technology" },
  { sym:"MSFT  ", name:"Microsoft",             industry:"Technology" },
  { sym:"NVDA  ", name:"Nvidia",                industry:"Semiconductors" },
  { sym:"GOOGL ", name:"Alphabet",              industry:"Technology" },
  { sym:"META  ", name:"Meta Platforms",        industry:"Technology" },
  { sym:"AMZN  ", name:"Amazon",                industry:"E-Commerce" },
  { sym:"TSLA  ", name:"Tesla",                 industry:"Automobiles" },
  { sym:"NFLX  ", name:"Netflix",               industry:"Entertainment" },
  { sym:"AMD   ", name:"AMD",                   industry:"Semiconductors" },
  { sym:"INTC  ", name:"Intel",                 industry:"Semiconductors" },
  { sym:"QCOM  ", name:"Qualcomm",              industry:"Semiconductors" },
  { sym:"AVGO  ", name:"Broadcom",              industry:"Semiconductors" },
  { sym:"TSM   ", name:"TSMC ADR",              industry:"Semiconductors" },
  { sym:"AMAT  ", name:"Applied Materials",     industry:"Semiconductors" },
  { sym:"LRCX  ", name:"Lam Research",          industry:"Semiconductors" },
  { sym:"KLAC  ", name:"KLA Corp",              industry:"Semiconductors" },
  { sym:"MCHP  ", name:"Microchip Tech",        industry:"Semiconductors" },
  { sym:"MRVL  ", name:"Marvell Tech",          industry:"Semiconductors" },
  { sym:"ON    ", name:"ON Semiconductor",      industry:"Semiconductors" },
  { sym:"TXN   ", name:"Texas Instruments",     industry:"Semiconductors" },
  { sym:"ARM   ", name:"Arm Holdings",          industry:"Semiconductors" },
  { sym:"CRM   ", name:"Salesforce",            industry:"Technology" },
  { sym:"ORCL  ", name:"Oracle",                industry:"Technology" },
  { sym:"IBM   ", name:"IBM",                   industry:"Technology" },
  { sym:"ADBE  ", name:"Adobe",                 industry:"Technology" },
  { sym:"SHOP  ", name:"Shopify",               industry:"Technology" },
  { sym:"CRWD  ", name:"CrowdStrike",           industry:"Cybersecurity" },
  { sym:"NET   ", name:"Cloudflare",            industry:"Technology" },
  { sym:"SMCI  ", name:"Super Micro",           industry:"Technology" },
  { sym:"DELL  ", name:"Dell Technologies",     industry:"Technology" },
  { sym:"HPQ   ", name:"HP Inc.",               industry:"Technology" },
  { sym:"V     ", name:"Visa",                  industry:"Finance" },
  { sym:"MA    ", name:"Mastercard",            industry:"Finance" },
  { sym:"AXP   ", name:"American Express",      industry:"Finance" },
  { sym:"USB   ", name:"U.S. Bancorp",          industry:"Banking" },
  { sym:"PNC   ", name:"PNC Financial",         industry:"Banking" },
  { sym:"COIN  ", name:"Coinbase",              industry:"Fintech" },
];
// 去重（AMZN/NFLX 在兩個分類都出現）
export const SCREENER_US_DEDUP = SCREENER_US.filter(
  (s, i, arr) => arr.findIndex(x => x.sym === s.sym) === i
);

// ============================================================
// 選股用靜態清單（日股 ADR — 日經225 主要成分的 ADR）
// 共約 35 檔，用 Finnhub 美股報價
// ============================================================
export const SCREENER_JP = [
  // ── 日股 ADR（Finnhub 實測支援）────────────────────
  { sym:"TM    ", name:"Toyota / トヨタ",                industry:"自動車" },
  { sym:"HMC   ", name:"Honda / ホンダ",                 industry:"自動車" },
  { sym:"SONY  ", name:"Sony / ソニー",                  industry:"電機" },
  { sym:"MUFG  ", name:"三菱UFJ / MUFG",                industry:"金融" },
  { sym:"SMFG  ", name:"三井住友 / SMFG",                 industry:"金融" },
  { sym:"MFG   ", name:"みずほ / Mizuho",                industry:"金融" },
  { sym:"NTDOY ", name:"Nintendo / 任天堂",              industry:"ゲーム" },
  { sym:"SFTBY ", name:"SoftBank / ソフトバンク",           industry:"通信" },
];
