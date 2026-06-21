import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ============================================================
// 色票系統 — 淺藍 + 海軍藍
// ============================================================
const C = {
  bg:        "#F0F6FF",   // 頁面背景
  surface:   "#FFFFFF",   // 卡片
  surface2:  "#EAF2FF",   // 卡片內層
  border:    "#C9DDF7",   // 邊框
  navy:      "#1E3A5F",   // 主文字
  navyMid:   "#2D5282",   // 次標題
  muted:     "#6B87A8",   // 灰字
  faint:     "#A8C2DC",   // 更淡
  accent:    "#4A9EFF",   // 天空藍 accent
  accentDark:"#1A6FCC",   // 深藍按鈕
  up:        "#16A34A",   // 上漲綠
  down:      "#DC2626",   // 下跌紅
  // 估值區間色
  z0: "#0D9488", // 極低估
  z1: "#16A34A", // 低估
  z2: "#CA8A04", // 合理
  z3: "#EA580C", // 偏高
  z4: "#DC2626", // 高估
  z5: "#9B1C1C", // 泡沫
};

// ============================================================
// 估值計算
// ============================================================
function calcBenchmark({ adjustedEquityPerShare, adjustedROE }) {
  if (!adjustedEquityPerShare || !adjustedROE) return null;
  return adjustedEquityPerShare * adjustedROE * 10;
}

function calcZone(price, benchmark) {
  if (!benchmark || benchmark === 0) return null;
  const ratio = price / benchmark;
  if (ratio < 0.85) return { zone: "極低估區", color: C.z0, ratio };
  if (ratio < 1.00) return { zone: "低估區",   color: C.z1, ratio };
  if (ratio < 1.15) return { zone: "合理區",   color: C.z2, ratio };
  if (ratio < 1.30) return { zone: "偏高區",   color: C.z3, ratio };
  if (ratio < 2.00) return { zone: "高估區",   color: C.z4, ratio };
  return               { zone: "泡沫區",   color: C.z5, ratio };
}

// ============================================================
// Mock 資料
// ============================================================
function genHistory(currentPrice, days, vol) {
  const data = []; let price = currentPrice * 0.85;
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    price = price * (1 + (Math.random() - 0.48) * vol / 100);
    if (i === 0) price = currentPrice;
    data.push({ date: `${d.getMonth()+1}/${d.getDate()}`, price: Math.round(price * 100) / 100 });
  }
  return data;
}

const MOCK_DATA = {
  "2330": { name:"台積電",  market:"TW", currency:"TWD", isETF:false, price:2410,  change:25,   changePct:1.05,  open:2395,  high:2415,  low:2385,  prevClose:2385, pe:32.4,  pb:10.61, dividendYield:0.91, roe:42.26, adjustedROE:41.63, adjustedEquityPerShare:228.61, support:2385,  target:2447.5, momentum:25,  history:genHistory(2410,  60, 0.4) },
  "2317": { name:"鴻海",    market:"TW", currency:"TWD", isETF:false, price:268.5, change:-3.5, changePct:-1.29, open:270.5, high:271.5, low:268.5, prevClose:272,  pe:null,  pb:null,  dividendYield:null, roe:12.01, adjustedROE:11.94, adjustedEquityPerShare:null,   support:251.5, target:294,    momentum:17,  history:genHistory(268.5, 60, 0.8) },
  "2454": { name:"聯發科",  market:"TW", currency:"TWD", isETF:false, price:4390,  change:15,   changePct:0.34,  open:4535,  high:4590,  low:4375,  prevClose:null, pe:69.96, pb:17.95, dividendYield:1.22, roe:25.83, adjustedROE:22.86, adjustedEquityPerShare:265.19, support:4375,  target:4412.5, momentum:15,  history:genHistory(4390,  60, 1.2) },
  "00878":{ name:"國泰永續高股息", market:"TW", currency:"TWD", isETF:true,  price:22.5,  change:0.1,  changePct:0.45,  open:22.4,  high:22.6,  low:22.3,  prevClose:22.4, pe:null, pb:null, dividendYield:6.2, roe:null, adjustedROE:null, adjustedEquityPerShare:null, support:21.8, target:23.2, momentum:0.1, history:genHistory(22.5, 60, 0.3) },
  "00919":{ name:"群益台灣精選高息", market:"TW", currency:"TWD", isETF:true, price:23.8,  change:0.2,  changePct:0.85,  open:23.6,  high:23.9,  low:23.5,  prevClose:23.6, pe:null, pb:null, dividendYield:7.1, roe:null, adjustedROE:null, adjustedEquityPerShare:null, support:23.0, target:24.5, momentum:0.2, history:genHistory(23.8, 60, 0.3) },
  "TSLA": { name:"Tesla",   market:"US", currency:"USD", isETF:false, price:248.5, change:3.2,  changePct:1.31,  open:245.3, high:250.1, low:244.8, prevClose:245.3,pe:68.2,  pb:12.4,  dividendYield:0,    roe:18.1,  adjustedROE:17.5,  adjustedEquityPerShare:18.2,   support:240,   target:265,    momentum:3.2, history:genHistory(248.5, 60, 1.5) },
  "KO":   { name:"Coca-Cola",market:"US",currency:"USD", isETF:false, price:71.2,  change:0.4,  changePct:0.56,  open:70.8,  high:71.5,  low:70.6,  prevClose:70.8, pe:26.8,  pb:10.2,  dividendYield:3.1,  roe:38.5,  adjustedROE:37.2,  adjustedEquityPerShare:4.8,    support:69.5,  target:74,     momentum:0.4, history:genHistory(71.2,  60, 0.5) },
  "DIS":  { name:"Disney",  market:"US", currency:"USD", isETF:false, price:109.3, change:-1.1, changePct:-1.0,  open:110.4, high:111.2, low:108.9, prevClose:110.4,pe:38.2,  pb:1.9,   dividendYield:0.9,  roe:5.2,   adjustedROE:5.0,   adjustedEquityPerShare:55.2,   support:105,   target:118,    momentum:-1.1,history:genHistory(109.3, 60, 1.0) },
  "7203": { name:"Toyota",  market:"JP", currency:"JPY", isETF:false, price:3285,  change:45,   changePct:1.39,  open:3240,  high:3295,  low:3235,  prevClose:3240, pe:8.9,   pb:1.1,   dividendYield:3.2,  roe:12.5,  adjustedROE:12.1,  adjustedEquityPerShare:2820,   support:3150,  target:3450,   momentum:45,  history:genHistory(3285,  60, 1.8) },
};

const CS = { TWD:"NT$", USD:"$", JPY:"¥" };
const ML = { TW:"台股", US:"美股", JP:"日股" };

// 判斷市場：4碼數字=台股，純英文=美股，需用戶指定或帶市場前綴
function detectMarket(sym) {
  if (/^\d{4,6}$/.test(sym)) return "TW";   // 台股：2330, 00878
  return "US";                                  // 預設美股；日股需輸入 7203.T 或選市場
}

// ============================================================
// 真實 API 呼叫
// ============================================================
async function fetchStock(sym) {
  const market = detectMarket(sym);

  if (market === "TW") {
    // 台股：同時抓報價 + 財務 + 歷史
    const [priceRes, finRes, epsRes, histRes] = await Promise.all([
      fetch(`/api/twse?type=price&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=financials&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=eps&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=history&stockNo=${sym}`).then(r=>r.json()),
    ]);

    if (!priceRes.success) throw new Error(priceRes.error || "查無此股票");

    const price   = priceRes.data;
    const fin     = (finRes.success && finRes.data) ? finRes.data : null;
    const eps     = (epsRes.success && epsRes.data)  ? epsRes.data  : null;
    const history = histRes.success ? histRes.data : [];

    // BWIBBU_d 提供 PE、PB、殖利率
    const pe            = fin?.pe            || null;
    const pb            = fin?.pb            || null;
    const dividendYield = fin?.dividendYield || null;

    // EPS API 提供基準值計算所需數據
    const adjustedROE            = eps?.adjustedROE            || null;
    const adjustedEquityPerShare = eps?.adjustedEquityPerShare || null;

    // 判斷 ETF（股票代號5碼以上或以0開頭）
    const isETF = sym.length >= 5 || sym.startsWith("0");

    // 計算支撐目標（用最近歷史最低/最高近似）
    const recentPrices = history.slice(-20).map(h=>h.price).filter(Boolean);
    const support = recentPrices.length ? Math.min(...recentPrices) : price.low;
    const target  = recentPrices.length ? Math.max(...recentPrices) * 1.05 : price.high;

    return {
      symbol: sym,
      name:   price.name,
      market: "TW",
      currency: "TWD",
      isETF,
      price:     price.price,
      change:    price.change,
      changePct: price.changePct,
      open:      price.open,
      high:      price.high,
      low:       price.low,
      prevClose: price.prevClose,
      pe,
      pb,
      dividendYield,
      roe:             adjustedROE,
      adjustedROE:     adjustedROE,
      adjustedEquityPerShare,
      support,
      target,
      momentum: price.change,
      history:  history.map(h=>({ date:h.date, price:h.price })),
    };

  } else {
    // 美股/日股：Yahoo Finance
    const isJP = sym.endsWith(".T");
    const cleanSym = isJP ? sym.replace(".T","") : sym;
    const mkt = isJP ? "JP" : "US";

    const [quoteRes, finRes, histRes] = await Promise.all([
      fetch(`/api/yahoo?symbol=${cleanSym}&market=${mkt}&type=quote`).then(r=>r.json()),
      fetch(`/api/yahoo?symbol=${cleanSym}&market=${mkt}&type=financials`).then(r=>r.json()),
      fetch(`/api/yahoo?symbol=${cleanSym}&market=${mkt}&type=history`).then(r=>r.json()),
    ]);

    if (!quoteRes.success) throw new Error(quoteRes.error || "查無此股票");

    const q   = quoteRes.data;
    const fin = finRes.success ? finRes.data : null;
    const history = histRes.success ? histRes.data : [];

    const recentPrices = history.slice(-20).map(h=>h.price).filter(Boolean);
    const support = recentPrices.length ? Math.min(...recentPrices) : q.low;
    const target  = recentPrices.length ? Math.max(...recentPrices) * 1.05 : q.high;

    return {
      symbol: cleanSym,
      name:   q.name,
      market: mkt,
      currency: q.currency || (mkt==="JP"?"JPY":"USD"),
      isETF: false,
      price:     q.price,
      change:    q.change,
      changePct: q.changePct,
      open:      q.open,
      high:      q.high,
      low:       q.low,
      prevClose: q.prevClose,
      pe:             fin?.pe             || null,
      pb:             fin?.pb             || null,
      dividendYield:  fin?.dividendYield  || null,
      roe:            fin?.roe            || null,
      adjustedROE:    fin?.adjustedROE    || null,
      adjustedEquityPerShare: fin?.adjustedEquityPerShare || null,
      support,
      target,
      momentum: q.change,
      history,
    };
  }
}

function fmt(n, d=2) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("zh-TW", { minimumFractionDigits:d, maximumFractionDigits:d });
}
// 大數字縮寫：超過1萬用「萬」，超過1億用「億」
function fmtShort(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 100000000) return `${sign}${(abs/100000000).toFixed(2)}億`;
  if (abs >= 10000)     return `${sign}${(abs/10000).toFixed(1)}萬`;
  return `${sign}${fmt(abs)}`;
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return `${n>0?"+":""}${fmt(n)}%`;
}

// ============================================================
// 共用元件
// ============================================================
function Card({ children, style={} }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 2px 12px #1E3A5F0A", ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 13, color: C.muted, fontWeight: 700, letterSpacing: 1.5, marginBottom: 12 }}>{children}</div>;
}

function InnerBox({ children, style={} }) {
  return <div style={{ background: C.surface2, borderRadius: 10, padding: "10px 12px", ...style }}>{children}</div>;
}

function Tag({ children, color=C.accent }) {
  return <span style={{ fontSize: 11, color, background: color+"18", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{children}</span>;
}

// ============================================================
// 估值色條
// ============================================================
function ValuationBar({ price, benchmark }) {
  if (!benchmark) return null;
  const ratio = price / benchmark;
  const pct = Math.min((Math.min(ratio, 2.5) / 2.5) * 100, 100);
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: `linear-gradient(to right,${C.z0},${C.z1},${C.z2},${C.z3},${C.z4},${C.z5})`, overflow: "visible" }}>
        <div style={{ position:"absolute", left:`${pct}%`, top:"50%", transform:"translate(-50%,-50%)", width:16, height:16, borderRadius:"50%", background:C.surface, border:`3px solid ${C.navy}`, boxShadow:`0 0 0 2px ${C.surface}`, zIndex:2 }} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:10, color:C.faint }}>
        {["極低估","低估","合理","偏高","高估","泡沫"].map(l => <span key={l}>{l}</span>)}
      </div>
    </div>
  );
}

// ============================================================
// K線圖
// ============================================================
function KLineChart({ history, support, target, currSym }) {
  if (!history?.length) return null;
  const minP = Math.min(...history.map(h=>h.price))*0.98;
  const maxP = Math.max(...history.map(h=>h.price))*1.02;
  return (
    <div>
      <SectionLabel>DAILY K · 歷史走勢（近60日）</SectionLabel>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={history} margin={{ top:4, right:8, left:0, bottom:0 }}>
          <XAxis dataKey="date" tick={{ fontSize:10, fill:C.faint }} interval={11} />
          <YAxis domain={[minP,maxP]} tick={{ fontSize:10, fill:C.faint }} width={55}
            tickFormatter={v=>`${currSym}${v>=1000?(v/1000).toFixed(1)+"K":v}`} />
          <Tooltip contentStyle={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.navy }}
            labelStyle={{ color:C.muted }} formatter={v=>[`${currSym}${fmt(v)}`,"價格"]} />
          {support && <ReferenceLine y={support} stroke={C.up}   strokeDasharray="4 2" label={{ value:"支撐", fill:C.up,   fontSize:10, position:"right" }} />}
          {target  && <ReferenceLine y={target}  stroke={C.accent} strokeDasharray="4 2" label={{ value:"目標", fill:C.accent, fontSize:10, position:"right" }} />}
          <Line type="monotone" dataKey="price" stroke={C.accent} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// 股票查詢頁
// ============================================================
function StockPage() {
  const [query, setQuery]   = useState("");
  const [sugg,  setSugg]    = useState([]);
  const [stock, setStock]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const all = Object.entries(MOCK_DATA).map(([sym,d])=>({ sym, name:d.name, market:d.market }));

  function onInput(val) {
    setQuery(val);
    if (!val) { setSugg([]); return; }
    const q = val.toLowerCase();
    setSugg(all.filter(s=>s.sym.toLowerCase().includes(q)||s.name.toLowerCase().includes(q)).slice(0,6));
  }

  function select(sym) { setQuery(sym); setSugg([]); search(sym); }

  async function search(s) {
    const sym = (s||query).trim().toUpperCase();
    if (!sym) return;
    setLoading(true); setError(""); setStock(null);
    try {
      const data = await fetchStock(sym);
      setStock(data);
    } catch(err) {
      setError(`找不到「${sym}」：${err.message}（台股：2330，美股：TSLA，日股：7203.T）`);
    } finally {
      setLoading(false);
    }
  }

  const bm   = stock ? calcBenchmark({ adjustedEquityPerShare:stock.adjustedEquityPerShare, adjustedROE:stock.adjustedROE/100 }) : null;
  const zone = stock ? calcZone(stock.price, bm) : null;
  const cs   = stock ? CS[stock.currency] : "";

  const inputBase = { flex:1, padding:"12px 16px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface, color:C.navy, fontSize:15, outline:"none" };

  return (
    <div>
      {/* 搜尋 */}
      <div style={{ position:"relative", marginBottom:24 }}>
        <div style={{ display:"flex", gap:8 }}>
          <input value={query} onChange={e=>onInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="輸入代號或名稱（2330、台積電、TSLA、7203）" style={inputBase} />
          <button onClick={()=>search()} style={{ padding:"12px 20px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>查詢</button>
        </div>
        {sugg.length>0 && (
          <div style={{ position:"absolute", top:"100%", left:0, right:60, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, marginTop:4, zIndex:100, overflow:"hidden", boxShadow:`0 8px 24px ${C.navy}18` }}>
            {sugg.map(s=>(
              <div key={s.sym} onClick={()=>select(s.sym)}
                style={{ padding:"10px 16px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${C.border}` }}
                onMouseEnter={e=>e.currentTarget.style.background=C.surface2}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{ color:C.navy }}><b>{s.sym}</b> · {s.name}</span>
                <Tag>{ML[s.market]}</Tag>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign:"center", color:C.muted, padding:48 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🕊️</div>
          <div style={{ fontSize:15 }}>股咕股分析中⋯</div>
        </div>
      )}

      {error && <div style={{ background:"#FEF2F2", border:`1px solid ${C.down}44`, borderRadius:12, padding:16, color:C.down, fontSize:14 }}>{error}</div>}

      {stock && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* ETF 警示 */}
          {stock.isETF && (
            <div style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:12, padding:"12px 16px", color:"#92400E", fontSize:13 }}>
              📌 <b>{stock.name}</b> 為 ETF，無法計算估值基準值，以下僅顯示報價與配息資訊。
            </div>
          )}

          {/* 報價卡 */}
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:16 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                  <span style={{ fontSize:20, fontWeight:800, color:C.navy }}>{stock.name}</span>
                  <Tag color={C.navyMid}>{ML[stock.market]} · {stock.symbol}</Tag>
                  {stock.isETF && <Tag color="#B45309">ETF</Tag>}
                </div>
                <div style={{ fontSize:34, fontWeight:900, color:C.navy, fontFamily:"monospace", letterSpacing:-1 }}>
                  {cs}{fmt(stock.price)}
                </div>
                <div style={{ fontSize:15, marginTop:4, color:stock.change>=0?C.up:C.down, fontWeight:600 }}>
                  {stock.change>=0?"▲":"▼"} {Math.abs(stock.change).toFixed(2)} ({fmtPct(stock.changePct)})
                </div>
              </div>
              {zone && !stock.isETF && (
                <div style={{ background:zone.color+"14", border:`2px solid ${zone.color}`, borderRadius:12, padding:"12px 16px", textAlign:"center", minWidth:100 }}>
                  <div style={{ fontSize:13, color:C.navy, marginBottom:2 }}>目前估值</div>
                  <div style={{ fontSize:17, fontWeight:800, color:zone.color }}>{zone.zone}</div>
                  <div style={{ fontSize:12, color:C.faint, marginTop:2 }}>×{fmt(zone.ratio)}</div>
                </div>
              )}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[["開盤",stock.open],["昨收",stock.prevClose],["最高",stock.high],["最低",stock.low]].map(([label,val])=>(
                <InnerBox key={label}>
                  <div style={{ fontSize:13, color:C.navy, marginBottom:2 }}>{label}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:C.navy, fontFamily:"monospace" }}>{val!=null?`${cs}${fmt(val)}`:"—"}</div>
                </InnerBox>
              ))}
            </div>

            {bm && !stock.isETF && <ValuationBar price={stock.price} benchmark={bm} />}
          </Card>

          {/* 基準值區間 */}
          {bm && !stock.isETF && (
            <Card>
              <SectionLabel>PRICE BANDS · 價格基準值</SectionLabel>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                <InnerBox>
                  <div style={{ fontSize:13, color:C.navy }}>基準值</div>
                  <div style={{ fontSize:16, fontWeight:800, color:C.navy, fontFamily:"monospace" }}>{cs}{fmt(bm)}</div>
                </InnerBox>
                <InnerBox>
                  <div style={{ fontSize:13, color:C.navy }}>調整ROE</div>
                  <div style={{ fontSize:16, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>{fmt(stock.adjustedROE)}%</div>
                </InnerBox>
              </div>
              {[
                { label:"極低估區", color:C.z0, lo:0,       hi:bm*0.85 },
                { label:"低估區",   color:C.z1, lo:bm*0.85, hi:bm*1.00 },
                { label:"合理區",   color:C.z2, lo:bm*1.00, hi:bm*1.15 },
                { label:"偏高區",   color:C.z3, lo:bm*1.15, hi:bm*1.30 },
                { label:"高估區",   color:C.z4, lo:bm*1.30, hi:bm*2.00 },
                { label:"泡沫區",   color:C.z5, lo:bm*2.00, hi:null     },
              ].map(z=>{
                const isCurr = zone && zone.zone===z.label;
                const range  = z.hi ? `${cs}${fmt(z.lo)} ～ ${cs}${fmt(z.hi)}` : `${cs}${fmt(z.lo)} ～ 無限`;
                return (
                  <div key={z.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", borderRadius:10, marginBottom:6, background:isCurr?z.color+"14":C.surface2, border:`1.5px solid ${isCurr?z.color:C.border}` }}>
                    <span style={{ fontSize:13, fontWeight:isCurr?800:500, color:z.color }}>{z.label}{isCurr?" ← 目前":""}</span>
                    <span style={{ fontSize:12, color:C.muted, fontFamily:"monospace" }}>{range}</span>
                  </div>
                );
              })}
            </Card>
          )}

          {/* 價格訊號 — 2x2 避免截斷 */}
          <Card>
            <SectionLabel>SIGNALS · 價格訊號</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>支撐</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.up, fontFamily:"monospace" }}>{cs}{fmt(stock.support)}</div>
                <div style={{ fontSize:10, color:C.faint, marginTop:2 }}>距支撐 {fmt(((stock.price-stock.support)/stock.price)*100)}%</div>
              </InnerBox>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>目標</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.accent, fontFamily:"monospace" }}>{cs}{fmt(stock.target)}</div>
                <div style={{ fontSize:10, color:C.faint, marginTop:2 }}>距目標 {fmt(((stock.target-stock.price)/stock.price)*100)}%</div>
              </InnerBox>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>動能</div>
                <div style={{ fontSize:15, fontWeight:700, color:stock.momentum>=0?C.up:C.down, fontFamily:"monospace" }}>{cs}{fmt(stock.momentum)}</div>
                <div style={{ fontSize:10, color:C.faint, marginTop:2 }}>單日動能</div>
              </InnerBox>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>距基準值</div>
                <div style={{ fontSize:15, fontWeight:700, color:bm?C.navy:C.faint, fontFamily:"monospace" }}>
                  {bm ? `${stock.price>bm?"+":""}${fmt(((stock.price-bm)/bm)*100)}%` : "—"}
                </div>
                <div style={{ fontSize:10, color:C.faint, marginTop:2 }}>相對基準值</div>
              </InnerBox>
            </div>
          </Card>

          {/* K線圖 */}
          <Card>
            <KLineChart history={stock.history} support={stock.support} target={stock.target} currSym={cs} />
          </Card>

          {/* 財務健康 */}
          <Card>
            <SectionLabel>FINANCIALS · 財務健康</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                ["本益比 P/E",     stock.pe                    ? `${fmt(stock.pe)}×`               : "—"],
                ["股價淨值比 P/B", stock.pb                    ? `${fmt(stock.pb)}×`               : "—"],
                ["殖利率",         stock.dividendYield!=null   ? `${fmt(stock.dividendYield)}%`    : "—"],
                ["ROE",            stock.roe                   ? `${fmt(stock.roe)}%`              : "—"],
                ["調整ROE",        stock.adjustedROE           ? `${fmt(stock.adjustedROE)}%`      : "—"],
                ["每股調整淨值",   stock.adjustedEquityPerShare? `${cs}${fmt(stock.adjustedEquityPerShare)}` : "—"],
              ].map(([label,val])=>(
                <InnerBox key={label}>
                  <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:C.navy, fontFamily:"monospace" }}>{val}</div>
                </InnerBox>
              ))}
            </div>
          </Card>

          <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"4px 0 12px" }}>
            🕊️「股咕股」溫馨提示：本工具僅為個人開發之數據整合與指標分析統計，並非提供任何形式的投資買賣建議。市場有風險，投資需謹慎，「股咕股」只負責啼叫報時，盈虧請用戶自負。
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 選股頁
// ============================================================
function ScreenerPage() {
  const [selectedZone, setSelectedZone] = useState("全部");
  const [results, setResults]           = useState([]);
  const [ran, setRan]                   = useState(false);

  const zones = ["全部","極低估區","低估區","合理區","偏高區","高估區","泡沫區"];
  const zoneColor = { "極低估區":C.z0,"低估區":C.z1,"合理區":C.z2,"偏高區":C.z3,"高估區":C.z4,"泡沫區":C.z5 };

  function run() {
    const list = Object.entries(MOCK_DATA)
      .filter(([,d])=>d.market==="TW")
      .map(([sym,d])=>{
        const bm = calcBenchmark({ adjustedEquityPerShare:d.adjustedEquityPerShare, adjustedROE:d.adjustedROE/100 });
        const z  = calcZone(d.price, bm);
        return { symbol:sym, ...d, benchmark:bm, zoneInfo:z };
      })
      .filter(s=>selectedZone==="全部"||(s.zoneInfo&&s.zoneInfo.zone===selectedZone));
    setResults(list); setRan(true);
  }

  return (
    <div>
      <Card style={{ marginBottom:16 }}>
        <SectionLabel>篩選條件 · 台股</SectionLabel>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
          {zones.map(z=>{
            const active = selectedZone===z;
            const col    = zoneColor[z]||C.accent;
            return (
              <button key={z} onClick={()=>setSelectedZone(z)} style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${active?col:C.border}`, background:active?col+"18":"transparent", color:active?col:C.muted, fontSize:13, cursor:"pointer", fontWeight:active?700:400 }}>
                {z}
              </button>
            );
          })}
        </div>
        <button onClick={run} style={{ width:"100%", padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>
          執行選股
        </button>
      </Card>

      {ran && (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:14, fontWeight:700, color:C.navy }}>篩選結果</span>
            <span style={{ fontSize:13, color:C.muted }}>{results.length} 檔</span>
          </div>
          {results.length===0
            ? <div style={{ padding:32, textAlign:"center", color:C.muted }}>目前無符合條件的股票</div>
            : results.map(s=>(
                <div key={s.symbol} style={{ padding:"14px 20px", borderBottom:`1px solid ${C.surface2}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontWeight:700, color:C.navy }}>{s.symbol} · {s.name} {s.isETF&&<Tag color="#B45309">ETF</Tag>}</div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>
                      {s.benchmark?`基準值 NT$${fmt(s.benchmark)} · ROE ${fmt(s.adjustedROE)}%`:"ETF — 無基準值"}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"monospace", fontWeight:700, color:C.navy }}>NT${fmt(s.price)}</div>
                    {s.zoneInfo
                      ? <div style={{ fontSize:12, color:s.zoneInfo.color, fontWeight:700, marginTop:2 }}>{s.zoneInfo.zone}</div>
                      : <div style={{ fontSize:12, color:"#B45309", marginTop:2 }}>無法計算</div>
                    }
                  </div>
                </div>
              ))
          }
        </Card>
      )}
    </div>
  );
}

// ============================================================
// 持倉管理頁
// ============================================================
function PortfolioPage() {
  const [holdings, setHoldings] = useState([
    { id:1, symbol:"2330",  lots:[{ shares:1000,  cost:955,    date:"2024-01-15" }] },
    { id:2, symbol:"2317",  lots:[{ shares:42000, cost:191.21, date:"2024-03-10" }] },
    { id:3, symbol:"TSLA",  lots:[{ shares:10,    cost:200,    date:"2024-06-01" }] },
    { id:4, symbol:"00878", lots:[{ shares:5000,  cost:21.6,   date:"2024-02-20" }] },
  ]);
  const [addForm,    setAddForm]    = useState({ symbol:"", shares:"", cost:"", date:"" });
  const [lotForm,    setLotForm]    = useState({ shares:"", cost:"", date:"" });
  const [showAdd,    setShowAdd]    = useState(false);
  const [showLotId,  setShowLotId]  = useState(null);

  function addHolding() {
    if (!addForm.symbol||!addForm.shares||!addForm.cost) return;
    const sym = addForm.symbol.toUpperCase();
    if (!MOCK_DATA[sym]) { alert("找不到此股票代號"); return; }
    setHoldings(h=>[...h,{ id:Date.now(), symbol:sym, lots:[{ shares:+addForm.shares, cost:+addForm.cost, date:addForm.date||new Date().toISOString().slice(0,10) }] }]);
    setAddForm({ symbol:"", shares:"", cost:"", date:"" }); setShowAdd(false);
  }

  function addLot(id) {
    if (!lotForm.shares||!lotForm.cost) return;
    setHoldings(h=>h.map(hh=>hh.id===id?{ ...hh, lots:[...hh.lots,{ shares:+lotForm.shares, cost:+lotForm.cost, date:lotForm.date||new Date().toISOString().slice(0,10) }] }:hh));
    setLotForm({ shares:"", cost:"", date:"" }); setShowLotId(null);
  }

  const calced = holdings.map(h=>{
    const d = MOCK_DATA[h.symbol]; if (!d) return null;
    const totalShares = h.lots.reduce((a,l)=>a+l.shares, 0);
    const totalCost   = h.lots.reduce((a,l)=>a+l.shares*l.cost, 0);
    const avgCost     = totalCost/totalShares;
    const currentVal  = totalShares*d.price;
    const pnl         = currentVal-totalCost;
    const pnlPct      = (pnl/totalCost)*100;
    const bm          = calcBenchmark({ adjustedEquityPerShare:d.adjustedEquityPerShare, adjustedROE:d.adjustedROE/100 });
    const zone        = calcZone(d.price,bm);
    const suggest     = d.isETF?"ETF 無法計算":!zone?"—":
      ["極低估區","低估區","合理區"].includes(zone.zone)?"✅ 可考慮加碼":
      zone.zone==="偏高區"?"⚠️ 偏高，謹慎加碼":"🚫 不建議加碼";
    return { ...h, d, totalShares, totalCost, avgCost, currentVal, pnl, pnlPct, bm, zone, suggest, cs:CS[d.currency] };
  }).filter(Boolean);

  const totVal  = calced.reduce((a,h)=>a+h.currentVal, 0);
  const totCost = calced.reduce((a,h)=>a+h.totalCost,  0);
  const totPnl  = totVal-totCost;
  const totPct  = (totPnl/totCost)*100;

  const inputStyle = { width:"100%", padding:"10px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.surface, color:C.navy, fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div>
      {/* 總覽 */}
      <Card style={{ background:`linear-gradient(135deg,#EAF2FF,#F0F6FF)`, marginBottom:16 }}>
        <SectionLabel>OVERVIEW · 總持倉概覽</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          {[
            ["總市值",   fmtShort(totVal),   C.navy],
            ["總成本",   fmtShort(totCost),  C.navy],
            ["未實現損益", fmtShort(totPnl), totPnl>=0?C.up:C.down],
            ["總報酬率",  fmtPct(totPct), totPct>=0?C.up:C.down],
          ].map(([label,val,color])=>(
            <InnerBox key={label} style={{ background:"#fff" }}>
              <div style={{ fontSize:13, color:C.navy }}>{label}</div>
              <div style={{ fontSize:17, fontWeight:800, color, fontFamily:"monospace" }}>{val}</div>
            </InnerBox>
          ))}
        </div>
        <button onClick={()=>setShowAdd(v=>!v)} style={{ width:"100%", padding:"10px", borderRadius:10, border:`1.5px dashed ${C.accent}`, background:"transparent", color:C.accent, fontWeight:700, fontSize:14, cursor:"pointer" }}>
          {showAdd?"✕ 取消":"+ 新增持股"}
        </button>
        {showAdd && (
          <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:8 }}>
            <input value={addForm.symbol} onChange={e=>setAddForm(f=>({...f,symbol:e.target.value}))} placeholder="股票代號（2330、TSLA）" style={inputStyle} />
            <input value={addForm.shares} onChange={e=>setAddForm(f=>({...f,shares:e.target.value}))} placeholder="股數" type="number" style={inputStyle} />
            <input value={addForm.cost}   onChange={e=>setAddForm(f=>({...f,cost:e.target.value}))}   placeholder="買入成本價" type="number" style={inputStyle} />
            <input value={addForm.date}   onChange={e=>setAddForm(f=>({...f,date:e.target.value}))}   type="date" style={inputStyle} />
            <button onClick={addHolding} style={{ padding:"10px", borderRadius:10, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, cursor:"pointer" }}>確認新增</button>
          </div>
        )}
      </Card>

      {/* 持倉列表 */}
      {calced.map(h=>(
        <Card key={h.id} style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                <span style={{ fontSize:16, fontWeight:800, color:C.navy }}>{h.symbol}</span>
                <span style={{ fontSize:14, color:C.muted }}>{h.d.name}</span>
                <Tag color={C.navyMid}>{ML[h.d.market]}</Tag>
                {h.d.isETF&&<Tag color="#B45309">ETF</Tag>}
              </div>
              <div style={{ fontSize:12, color:C.muted }}>
                {h.totalShares.toLocaleString()} 股 · 均價 {h.cs}{fmt(h.avgCost)} · {h.lots.length} 批
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
              {h.zone&&!h.d.isETF&&(
                <span style={{ fontSize:12, color:h.zone.color, fontWeight:700, background:h.zone.color+"14", padding:"4px 10px", borderRadius:8 }}>{h.zone.zone}</span>
              )}
              <button onClick={()=>setHoldings(hh=>hh.filter(x=>x.id!==h.id))} style={{ fontSize:12, color:C.muted, background:"transparent", border:"none", cursor:"pointer" }}>刪除</button>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
            {[
              ["現價",   `${h.cs}${fmt(h.d.price)}`, C.navy],
              ["損益",   `${fmtShort(h.pnl)}`,  h.pnl>=0?C.up:C.down],
              ["報酬率", fmtPct(h.pnlPct),  h.pnlPct>=0?C.up:C.down],
            ].map(([label,val,color])=>(
              <InnerBox key={label}>
                <div style={{ fontSize:13, color:C.navy }}>{label}</div>
                <div style={{ fontSize:16, fontWeight:700, color, fontFamily:"monospace" }}>{val}</div>
              </InnerBox>
            ))}
          </div>

          {h.lots.length>1 && (
            <InnerBox style={{ marginBottom:10 }}>
              <div style={{ fontSize:13, color:C.navy, marginBottom:6 }}>分批明細</div>
              {h.lots.map((l,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.muted, padding:"3px 0", borderBottom:i<h.lots.length-1?`1px solid ${C.border}`:"none" }}>
                  <span>第{i+1}批 · {l.date}</span>
                  <span>{l.shares.toLocaleString()} 股 @ {h.cs}{fmt(l.cost)}</span>
                </div>
              ))}
            </InnerBox>
          )}

          <InnerBox style={{ marginBottom:8, fontSize:13, color:C.navy }}>
            加碼建議：<strong>{h.suggest}</strong>
            {h.zone&&!h.d.isETF&&<span style={{ color:C.muted }}> · 基準值 {h.cs}{fmt(h.bm)}</span>}
          </InnerBox>

          <button onClick={()=>setShowLotId(v=>v===h.id?null:h.id)}
            style={{ width:"100%", padding:"8px", borderRadius:10, border:`1px dashed ${C.accent}88`, background:"transparent", color:C.accent, fontSize:13, cursor:"pointer" }}>
            {showLotId===h.id?"✕ 取消":"+ 加碼記錄（新增批次）"}
          </button>
          {showLotId===h.id && (
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
              <input value={lotForm.shares} onChange={e=>setLotForm(f=>({...f,shares:e.target.value}))} placeholder="股數" type="number" style={inputStyle} />
              <input value={lotForm.cost}   onChange={e=>setLotForm(f=>({...f,cost:e.target.value}))}   placeholder="買入成本價" type="number" style={inputStyle} />
              <input value={lotForm.date}   onChange={e=>setLotForm(f=>({...f,date:e.target.value}))}   type="date" style={inputStyle} />
              <button onClick={()=>addLot(h.id)} style={{ padding:"8px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontWeight:700, cursor:"pointer" }}>確認加碼</button>
            </div>
          )}
        </Card>
      ))}

      <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"4px 0 16px" }}>
        🕊️「股咕股」溫馨提示：本工具僅為個人開發之數據整合與指標分析統計，並非提供任何形式的投資買賣建議。市場有風險，投資需謹慎，「股咕股」只負責啼叫報時，盈虧請用戶自負。
      </div>
    </div>
  );
}

// ============================================================
// 登入 Modal
// ============================================================
function LoginModal({ onClose }) {
  const [email, setEmail] = useState("");
  const inputStyle = { width:"100%", padding:"12px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface2, color:C.navy, fontSize:15, outline:"none", boxSizing:"border-box" };
  return (
    <div style={{ position:"fixed", inset:0, background:"#1E3A5F88", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.surface, borderRadius:20, padding:28, border:`1px solid ${C.border}`, width:"100%", maxWidth:360, boxShadow:`0 20px 60px ${C.navy}33` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.navy }}>🕊️ 登入帳號</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.muted, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="電子郵件" style={inputStyle} />
          <button style={{ padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>
            發送登入連結
          </button>
          <div style={{ textAlign:"center", color:C.muted, fontSize:12 }}>或</div>
          <button style={{ padding:"12px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface2, color:C.navy, fontWeight:600, fontSize:14, cursor:"pointer" }}>
            🔵 使用 Google 登入
          </button>
          <div style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:4 }}>
            登入後可跨裝置同步持倉資料
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主應用
// ============================================================
export default function App() {
  const [tab,       setTab]       = useState("stock");
  const [showLogin, setShowLogin] = useState(false);

  const tabs = [
    { id:"stock",     label:"🔍 股票" },
    { id:"screener",  label:"📊 選股" },
    { id:"portfolio", label:"💼 持倉" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.navy, fontFamily:"'Inter','Noto Sans TC',sans-serif" }}>
      {showLogin && <LoginModal onClose={()=>setShowLogin(false)} />}

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 16px", position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px #1E3A5F0A" }}>
        <div style={{ maxWidth:680, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:26 }}>🕊️</span>
              <div>
                <div style={{ fontSize:18, fontWeight:900, background:`linear-gradient(90deg,${C.accentDark},${C.accent})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                  全民股咕股
                </div>
                <div style={{ fontSize:10, color:C.faint }}>台美日股 AI 巡檢助理</div>
              </div>
            </div>
            <button onClick={()=>setShowLogin(true)} style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${C.accent}`, background:"transparent", color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              登入
            </button>
          </div>
          <div style={{ display:"flex", gap:2 }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, padding:"8px 4px", borderRadius:8, border:"none", background:tab===t.id?C.accent+"18":"transparent", color:tab===t.id?C.accent:C.muted, fontWeight:tab===t.id?700:400, fontSize:13, cursor:"pointer", borderBottom:`2px solid ${tab===t.id?C.accent:"transparent"}` }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:680, margin:"0 auto", padding:"18px 14px 40px" }}>
        {tab==="stock"     && <StockPage />}
        {tab==="screener"  && <ScreenerPage />}
        {tab==="portfolio" && <PortfolioPage />}
      </div>
    </div>
  );
}
