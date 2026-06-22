import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// Supabase 客戶端
// ============================================================
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ============================================================
// 色票系統
// ============================================================
const C = {
  bg:        "#F0F6FF",
  surface:   "#FFFFFF",
  surface2:  "#EAF2FF",
  border:    "#C9DDF7",
  navy:      "#1E3A5F",
  navyMid:   "#2D5282",
  muted:     "#6B87A8",
  faint:     "#A8C2DC",
  accent:    "#4A9EFF",
  accentDark:"#1A6FCC",
  up:        "#DC2626",   // 上漲紅（台灣習慣）
  down:      "#16A34A",   // 下跌綠（台灣習慣）
  z0: "#0D9488",
  z1: "#16A34A",
  z2: "#CA8A04",
  z3: "#EA580C",
  z4: "#DC2626",
  z5: "#9B1C1C",
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
// Mock 資料（自動補全用）
// ============================================================
const SUGGEST_LIST = [
  { sym:"2330", name:"台積電",  market:"TW" },
  { sym:"2317", name:"鴻海",    market:"TW" },
  { sym:"2454", name:"聯發科",  market:"TW" },
  { sym:"2881", name:"富邦金",  market:"TW" },
  { sym:"2882", name:"國泰金",  market:"TW" },
  { sym:"00878",name:"國泰永續高股息", market:"TW" },
  { sym:"00919",name:"群益台灣精選高息", market:"TW" },
  { sym:"TSLA", name:"Tesla",   market:"US" },
  { sym:"AAPL", name:"Apple",   market:"US" },
  { sym:"NVDA", name:"Nvidia",  market:"US" },
  { sym:"KO",   name:"Coca-Cola", market:"US" },
  { sym:"DIS",  name:"Disney",  market:"US" },
  { sym:"7203", name:"Toyota",  market:"JP" },
];

const CS = { TWD:"NT$", USD:"$", JPY:"¥" };
const ML = { TW:"台股", US:"美股", JP:"日股" };

// ============================================================
// 市場判斷
// ============================================================
function detectMarket(sym) {
  if (/^\d{4,6}$/.test(sym)) return "TW";
  return "US";
}

// ============================================================
// 真實 API 呼叫
// ============================================================
async function fetchStock(sym) {
  const market = detectMarket(sym);

  if (market === "TW") {
    const [priceRes, finRes, epsRes, histRes, instRes, marginRes] = await Promise.all([
      fetch(`/api/twse?type=price&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=financials&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=eps&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=history&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=institutional&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=margin&stockNo=${sym}`).then(r=>r.json()),
    ]);

    if (!priceRes.success) throw new Error(priceRes.error || "查無此股票");

    const price   = priceRes.data;
    const fin     = (finRes.success && finRes.data)    ? finRes.data    : null;
    const eps     = (epsRes.success && epsRes.data)    ? epsRes.data    : null;
    const history = histRes.success ? histRes.data : [];
    const inst    = (instRes.success && instRes.data)  ? instRes.data   : null;
    const margin  = (marginRes.success && marginRes.data) ? marginRes.data : null;

    const pe            = fin?.pe            || null;
    const pb            = fin?.pb            || null;
    const dividendYield = fin?.dividendYield || null;
    const adjustedROE            = eps?.adjustedROE            || null;
    const adjustedEquityPerShare = eps?.adjustedEquityPerShare || null;
    const isETF = sym.length >= 5 || sym.startsWith("0");
    const recentPrices = history.slice(-20).map(h=>h.price).filter(Boolean);
    const support = recentPrices.length ? Math.min(...recentPrices) : price.low;
    const target  = recentPrices.length ? Math.max(...recentPrices) * 1.05 : price.high;

    return {
      symbol: sym, name: price.name, market: "TW", currency: "TWD", isETF,
      price: price.price, change: price.change, changePct: price.changePct,
      open: price.open, high: price.high, low: price.low, prevClose: price.prevClose,
      pe, pb, dividendYield,
      roe: adjustedROE, adjustedROE, adjustedEquityPerShare,
      support, target, momentum: price.change,
      history: history.map(h=>({ date:h.date, price:h.price })),
      inst, margin,
    };

  } else {
    const isJP = sym.endsWith(".T");
    const cleanSym = isJP ? sym.replace(".T","") : sym;
    const mkt = isJP ? "JP" : "US";

    const [quoteRes, finRes, histRes] = await Promise.all([
      fetch(`/api/finnhub?symbol=${cleanSym}&market=${mkt}&type=quote`).then(r=>r.json()),
      fetch(`/api/finnhub?symbol=${cleanSym}&market=${mkt}&type=financials`).then(r=>r.json()),
      fetch(`/api/finnhub?symbol=${cleanSym}&market=${mkt}&type=history`).then(r=>r.json()),
    ]);

    if (!quoteRes.success) throw new Error(quoteRes.error || "查無此股票");

    const q   = quoteRes.data;
    const fin = (finRes.success && finRes.data) ? finRes.data : null;
    const history = histRes.success ? histRes.data : [];
    const recentPrices = history.slice(-20).map(h=>h.price).filter(Boolean);
    const support = recentPrices.length ? Math.min(...recentPrices) : q.low;
    const target  = recentPrices.length ? Math.max(...recentPrices) * 1.05 : q.high;

    return {
      symbol: cleanSym, name: q.name, market: mkt,
      currency: q.currency || (mkt==="JP"?"JPY":"USD"), isETF: false,
      price: q.price, change: q.change, changePct: q.changePct,
      open: q.open, high: q.high, low: q.low, prevClose: q.prevClose,
      pe: fin?.pe||null, pb: fin?.pb||null, dividendYield: fin?.dividendYield||null,
      roe: fin?.roe||null, adjustedROE: fin?.adjustedROE||null,
      adjustedEquityPerShare: fin?.adjustedEquityPerShare||null,
      support, target, momentum: q.change, history,
      inst: null, margin: null,
    };
  }
}

// ============================================================
// 工具函數
// ============================================================
function fmt(n, d=2) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("zh-TW", { minimumFractionDigits:d, maximumFractionDigits:d });
}
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
  return <div style={{ background:C.surface, borderRadius:16, padding:20, border:`1px solid ${C.border}`, boxShadow:"0 2px 12px #1E3A5F0A", ...style }}>{children}</div>;
}
function SectionLabel({ children }) {
  return <div style={{ fontSize:13, color:C.muted, fontWeight:700, letterSpacing:1.5, marginBottom:12 }}>{children}</div>;
}
function InnerBox({ children, style={} }) {
  return <div style={{ background:C.surface2, borderRadius:10, padding:"10px 12px", ...style }}>{children}</div>;
}
function Tag({ children, color=C.accent }) {
  return <span style={{ fontSize:11, color, background:color+"18", padding:"2px 8px", borderRadius:6, fontWeight:600 }}>{children}</span>;
}

// ============================================================
// 估值色條
// ============================================================
function ValuationBar({ price, benchmark }) {
  if (!benchmark) return null;
  const ratio = price / benchmark;
  const pct = Math.min((Math.min(ratio, 2.5) / 2.5) * 100, 100);
  return (
    <div style={{ marginTop:20 }}>
      <div style={{ position:"relative", height:8, borderRadius:4, background:`linear-gradient(to right,${C.z0},${C.z1},${C.z2},${C.z3},${C.z4},${C.z5})`, overflow:"visible" }}>
        <div style={{ position:"absolute", left:`${pct}%`, top:"50%", transform:"translate(-50%,-50%)", width:16, height:16, borderRadius:"50%", background:C.surface, border:`3px solid ${C.navy}`, boxShadow:`0 0 0 2px ${C.surface}`, zIndex:2 }} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:12, color:C.muted }}>
        {["極低估","低估","合理","偏高","高估","泡沫"].map(l=><span key={l}>{l}</span>)}
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
          <XAxis dataKey="date" tick={{ fontSize:11, fill:C.muted }} interval={11} />
          <YAxis domain={[minP,maxP]} tick={{ fontSize:11, fill:C.muted }} width={62}
            tickFormatter={v=>{
              if (v>=1000000) return `${currSym}${(v/1000000).toFixed(1)}M`;
              if (v>=1000)    return `${currSym}${(v/1000).toFixed(1)}K`;
              if (v>=100)     return `${currSym}${Math.round(v)}`;
              return `${currSym}${v.toFixed(2)}`;
            }} />
          <Tooltip contentStyle={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.navy }}
            labelStyle={{ color:C.muted }} formatter={v=>[`${currSym}${fmt(v)}`,"價格"]} />
          {support && <ReferenceLine y={support} stroke={C.up} strokeDasharray="4 2" label={{ value:"支撐", fill:C.up, fontSize:10, position:"right" }} />}
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
  const [query, setQuery]     = useState("");
  const [sugg,  setSugg]      = useState([]);
  const [stock, setStock]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  function onInput(val) {
    setQuery(val);
    if (!val) { setSugg([]); return; }
    const q = val.toLowerCase();
    setSugg(SUGGEST_LIST.filter(s=>s.sym.toLowerCase().includes(q)||s.name.toLowerCase().includes(q)).slice(0,6));
  }

  function select(sym) { setQuery(sym); setSugg([]); search(sym); }

  async function search(s) {
    const sym = (s||query).trim().toUpperCase();
    if (!sym) return;
    setSugg([]); // 清除自動補全
    setLoading(true); setError(""); setStock(null);
    try {
      const data = await fetchStock(sym);
      setStock(data);
    } catch(err) {
      setError(`找不到「${sym}」：${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const bm   = stock ? calcBenchmark({ adjustedEquityPerShare:stock.adjustedEquityPerShare, adjustedROE:stock.adjustedROE/100 }) : null;
  const zone = stock ? calcZone(stock.price, bm) : null;
  const cs   = stock ? CS[stock.currency] : "";

  return (
    <div>
      <div style={{ position:"relative", marginBottom:24 }}>
        <div style={{ display:"flex", gap:8 }}>
          <input value={query} onChange={e=>onInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="輸入代號或名稱（2330、台積電、TSLA）"
            style={{ flex:1, padding:"12px 16px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface, color:C.navy, fontSize:15, outline:"none" }} />
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

      {loading && <div style={{ textAlign:"center", color:C.muted, padding:48 }}><div style={{ fontSize:40, marginBottom:10 }}>🕊️</div><div style={{ fontSize:15 }}>股咕股分析中⋯</div></div>}
      {error && <div style={{ background:"#FEF2F2", border:`1px solid ${C.down}44`, borderRadius:12, padding:16, color:C.down, fontSize:14 }}>{error}</div>}

      {stock && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
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
                <div style={{ fontSize:34, fontWeight:900, color:C.navy, fontFamily:"monospace", letterSpacing:-1 }}>{cs}{fmt(stock.price)}</div>
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
                <InnerBox><div style={{ fontSize:13, color:C.navy }}>基準值</div><div style={{ fontSize:16, fontWeight:800, color:C.navy, fontFamily:"monospace" }}>{cs}{fmt(bm)}</div></InnerBox>
                <InnerBox><div style={{ fontSize:13, color:C.navy }}>調整ROE</div><div style={{ fontSize:16, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>{fmt(stock.adjustedROE)}%</div></InnerBox>
              </div>
              {[
                { label:"極低估區", color:C.z0, lo:0,       hi:bm*0.85, mult:"× 0.85 以下" },
                { label:"低估區",   color:C.z1, lo:bm*0.85, hi:bm*1.00, mult:"× 0.85 ～ 1.0" },
                { label:"合理區",   color:C.z2, lo:bm*1.00, hi:bm*1.15, mult:"× 1.0 ～ 1.15" },
                { label:"偏高區",   color:C.z3, lo:bm*1.15, hi:bm*1.30, mult:"× 1.15 ～ 1.3" },
                { label:"高估區",   color:C.z4, lo:bm*1.30, hi:bm*2.00, mult:"× 1.3 ～ 2.0" },
                { label:"泡沫區",   color:C.z5, lo:bm*2.00, hi:null,     mult:"× 2.0 以上" },
              ].map(z=>{
                const isCurr = zone && zone.zone===z.label;
                const range  = z.hi ? `${cs}${fmt(z.lo)} ～ ${cs}${fmt(z.hi)}` : `${cs}${fmt(z.lo)} ～ 無限`;
                return (
                  <div key={z.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius:10, marginBottom:6, background:isCurr?z.color+"14":C.surface2, border:`1.5px solid ${isCurr?z.color:C.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:14, fontWeight:isCurr?800:600, color:z.color }}>{z.label}{isCurr?" ← 目前":""}</span>
                      <span style={{ fontSize:12, color:C.faint }}>{z.mult}</span>
                    </div>
                    <span style={{ fontSize:13, color:C.muted, fontFamily:"monospace" }}>{range}</span>
                  </div>
                );
              })}
            </Card>
          )}

          {/* 價格訊號 */}
          <Card>
            <SectionLabel>SIGNALS · 價格訊號</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>支撐</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.up, fontFamily:"monospace" }}>{cs}{fmt(stock.support)}</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>距支撐 {fmt(((stock.price-stock.support)/stock.price)*100)}%</div>
              </InnerBox>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>目標</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.accent, fontFamily:"monospace" }}>{cs}{fmt(stock.target)}</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>距目標 {fmt(((stock.target-stock.price)/stock.price)*100)}%</div>
              </InnerBox>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>動能</div>
                <div style={{ fontSize:15, fontWeight:700, color:stock.momentum>=0?C.up:C.down, fontFamily:"monospace" }}>{cs}{fmt(stock.momentum)}</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>單日動能</div>
              </InnerBox>
              <InnerBox>
                <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>距基準值</div>
                <div style={{ fontSize:15, fontWeight:700, color:bm?C.navy:C.faint, fontFamily:"monospace" }}>
                  {bm ? `${stock.price>bm?"+":""}${fmt(((stock.price-bm)/bm)*100)}%` : "—"}
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>相對基準值</div>
              </InnerBox>
            </div>
          </Card>

          {/* K線圖 */}
          <Card><KLineChart history={stock.history} support={stock.support} target={stock.target} currSym={cs} /></Card>

          {/* 三大法人 */}
          {stock.inst && (
            <Card>
              <SectionLabel>INSTITUTIONAL · 三大法人（最新交易日）</SectionLabel>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:13, color:C.muted, marginBottom:4 }}>合計買賣超（股）</div>
                <div style={{ fontSize:28, fontWeight:900, color:stock.inst.total>=0?C.up:C.down, fontFamily:"monospace" }}>
                  {stock.inst.total>=0?"+":""}{stock.inst.total.toLocaleString()}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {[["外資",stock.inst.foreign],["投信",stock.inst.investment],["自營商",stock.inst.dealer]].map(([label,val])=>(
                  <InnerBox key={label}>
                    <div style={{ fontSize:13, color:C.navy, marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:val>=0?C.up:C.down, fontFamily:"monospace" }}>
                      {val>=0?"+":""}{val?.toLocaleString()||"—"}
                    </div>
                  </InnerBox>
                ))}
              </div>
              <div style={{ fontSize:12, color:C.faint, marginTop:8 }}>資料日期：{stock.inst.date||"—"}</div>
            </Card>
          )}

          {/* 融資融券 */}
          {stock.margin && (
            <Card>
              <SectionLabel>MARGIN · 融資融券（最新交易日）</SectionLabel>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:13, color:C.muted, marginBottom:4 }}>資券差（正數偏多）</div>
                <div style={{ fontSize:28, fontWeight:900, color:stock.margin.net>=0?C.up:C.down, fontFamily:"monospace" }}>
                  {stock.margin.net>=0?"+":""}{stock.margin.net?.toLocaleString()}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  ["融資買進（張）", stock.margin.marginBuy],
                  ["融資賣出（張）", stock.margin.marginSell],
                  ["融資餘額（張）", stock.margin.marginBalance],
                  ["融券賣出（張）", stock.margin.shortSell],
                  ["融券買進（張）", stock.margin.shortBuy],
                  ["融券餘額（張）", stock.margin.shortBalance],
                ].map(([label,val])=>(
                  <InnerBox key={label}>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:C.navy, fontFamily:"monospace" }}>{val?.toLocaleString()||"—"}</div>
                  </InnerBox>
                ))}
              </div>
            </Card>
          )}

          {/* 財務健康 */}
          <Card>
            <SectionLabel>FINANCIALS · 財務健康</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                ["本益比 P/E",     stock.pe                    ? `${fmt(stock.pe)}×`            : "—"],
                ["股價淨值比 P/B", stock.pb                    ? `${fmt(stock.pb)}×`            : "—"],
                ["殖利率",         stock.dividendYield!=null   ? `${fmt(stock.dividendYield)}%` : "—"],
                ["ROE",            stock.roe                   ? `${fmt(stock.roe)}%`           : "—"],
                ["調整ROE",        stock.adjustedROE           ? `${fmt(stock.adjustedROE)}%`   : "—"],
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
// 選股頁（台股，Mock 資料）
// ============================================================
function ScreenerPage() {
  const [selectedZone, setSelectedZone] = useState("全部");
  const [results, setResults] = useState([]);
  const [ran, setRan] = useState(false);
  const zones = ["全部","極低估區","低估區","合理區","偏高區","高估區","泡沫區"];
  const zoneColor = { "極低估區":C.z0,"低估區":C.z1,"合理區":C.z2,"偏高區":C.z3,"高估區":C.z4,"泡沫區":C.z5 };

  function run() {
    setResults([]); setRan(true);
  }

  return (
    <div>
      <Card style={{ marginBottom:16 }}>
        <SectionLabel>篩選條件 · 台股</SectionLabel>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
          {zones.map(z=>{
            const active = selectedZone===z;
            const col = zoneColor[z]||C.accent;
            return <button key={z} onClick={()=>setSelectedZone(z)} style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${active?col:C.border}`, background:active?col+"18":"transparent", color:active?col:C.muted, fontSize:13, cursor:"pointer", fontWeight:active?700:400 }}>{z}</button>;
          })}
        </div>
        <button onClick={run} style={{ width:"100%", padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>執行選股</button>
      </Card>
      {ran && (
        <Card>
          <div style={{ textAlign:"center", padding:32, color:C.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🕊️</div>
            <div style={{ fontSize:15, fontWeight:600, color:C.navy, marginBottom:8 }}>選股功能開發中</div>
            <div style={{ fontSize:13 }}>即將接入全市場真實資料，敬請期待！</div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// 持倉管理頁（接 Supabase）
// ============================================================
function PortfolioPage({ user }) {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [addForm, setAddForm]   = useState({ symbol:"", shares:"", cost:"", date:"" });
  const [lotForm, setLotForm]   = useState({ shares:"", cost:"", date:"" });
  const [showAdd, setShowAdd]   = useState(false);
  const [showLotId, setShowLotId] = useState(null);
  const [prices, setPrices]     = useState({});

  // 載入持倉
  useEffect(() => {
    if (!user) {
      const saved = localStorage.getItem("gugugu_holdings");
      if (saved) setHoldings(JSON.parse(saved));
      return;
    }
    loadHoldings();
  }, [user]);

  // 載入完持倉後，抓每支股票即時價格
  useEffect(() => {
    if (holdings.length === 0) return;
    async function fetchPrices() {
      const newPrices = {};
      await Promise.all(holdings.map(async h => {
        try {
          const market = detectMarket(h.symbol);
          if (market === "TW") {
            const r = await fetch(`/api/twse?type=price&stockNo=${h.symbol}`);
            const data = await r.json();
            if (data.success) newPrices[h.symbol] = data.data.price;
          } else {
            const r = await fetch(`/api/finnhub?symbol=${h.symbol}&market=US&type=quote`);
            const data = await r.json();
            if (data.success) newPrices[h.symbol] = data.data.price;
          }
        } catch (_) {}
      }));
      setPrices(newPrices);
    }
    fetchPrices();
  }, [holdings]);

  async function loadHoldings() {
    setLoading(true);
    const { data } = await supabase
      .from("holdings")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) {
      // 轉換格式：每個 symbol 的多批次合併
      const grouped = {};
      data.forEach(row => {
        if (!grouped[row.symbol]) {
          grouped[row.symbol] = { id: row.symbol, symbol: row.symbol, market: row.market, name: row.name, lots: [] };
        }
        grouped[row.symbol].lots.push({ id: row.id, shares: row.shares, cost: row.cost, date: row.date });
      });
      setHoldings(Object.values(grouped));
    }
    setLoading(false);
  }

  function saveLocal(newHoldings) {
    localStorage.setItem("gugugu_holdings", JSON.stringify(newHoldings));
  }

  async function addHolding() {
    if (!addForm.symbol || !addForm.shares || !addForm.cost) return;
    const sym = addForm.symbol.toUpperCase();
    const market = detectMarket(sym);
    const lot = { shares: +addForm.shares, cost: +addForm.cost, date: addForm.date || new Date().toISOString().slice(0,10) };

    if (user) {
      const { error } = await supabase.from("holdings").insert({
        user_id: user.id, symbol: sym, market, name: sym, shares: lot.shares, cost: lot.cost, date: lot.date
      });
      if (!error) { loadHoldings(); }
    } else {
      const existing = holdings.find(h => h.symbol === sym);
      let newHoldings;
      if (existing) {
        newHoldings = holdings.map(h => h.symbol === sym ? { ...h, lots: [...h.lots, lot] } : h);
      } else {
        newHoldings = [...holdings, { id: sym, symbol: sym, market, name: sym, lots: [lot] }];
      }
      setHoldings(newHoldings);
      saveLocal(newHoldings);
    }
    setAddForm({ symbol:"", shares:"", cost:"", date:"" });
    setShowAdd(false);
  }

  async function addLot(symbol, market) {
    if (!lotForm.shares || !lotForm.cost) return;
    const lot = { shares: +lotForm.shares, cost: +lotForm.cost, date: lotForm.date || new Date().toISOString().slice(0,10) };

    if (user) {
      const { error } = await supabase.from("holdings").insert({
        user_id: user.id, symbol, market, name: symbol, shares: lot.shares, cost: lot.cost, date: lot.date
      });
      if (!error) { loadHoldings(); }
    } else {
      const newHoldings = holdings.map(h => h.symbol === symbol ? { ...h, lots: [...h.lots, lot] } : h);
      setHoldings(newHoldings);
      saveLocal(newHoldings);
    }
    setLotForm({ shares:"", cost:"", date:"" });
    setShowLotId(null);
  }

  async function deleteHolding(symbol) {
    if (user) {
      await supabase.from("holdings").delete().eq("user_id", user.id).eq("symbol", symbol);
      loadHoldings();
    } else {
      const newHoldings = holdings.filter(h => h.symbol !== symbol);
      setHoldings(newHoldings);
      saveLocal(newHoldings);
    }
  }

  // 計算損益（用即時價格）
  const calced = holdings.map(h => {
    const currentPrice = prices[h.symbol] || 0;
    const totalShares = h.lots.reduce((a,l)=>a+l.shares, 0);
    const totalCost   = h.lots.reduce((a,l)=>a+l.shares*l.cost, 0);
    const avgCost     = totalCost / totalShares;
    const currentVal  = totalShares * currentPrice;
    const pnl         = currentVal - totalCost;
    const pnlPct      = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const cs = CS[h.market] || "NT$";
    return { ...h, currentPrice, totalShares, totalCost, avgCost, currentVal, pnl, pnlPct, cs };
  });

  const totVal  = calced.reduce((a,h)=>a+h.currentVal, 0);
  const totCost = calced.reduce((a,h)=>a+h.totalCost,  0);
  const totPnl  = totVal - totCost;
  const totPct  = totCost > 0 ? (totPnl/totCost)*100 : 0;

  const inputStyle = { width:"100%", padding:"10px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.surface, color:C.navy, fontSize:14, outline:"none", boxSizing:"border-box" };

  if (loading) return <div style={{ textAlign:"center", padding:48, color:C.muted }}><div style={{ fontSize:40 }}>🕊️</div><div>載入持倉中⋯</div></div>;

  return (
    <div>
      {!user && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:12, padding:"12px 16px", color:"#92400E", fontSize:13, marginBottom:16 }}>
          📌 未登入狀態，資料儲存在此裝置。登入後可跨裝置同步。
        </div>
      )}

      {/* 總覽 */}
      <Card style={{ background:`linear-gradient(135deg,#EAF2FF,#F0F6FF)`, marginBottom:16 }}>
        <SectionLabel>OVERVIEW · 總持倉概覽</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          {[
            ["總市值",     fmtShort(totVal),   C.navy],
            ["總成本",     fmtShort(totCost),  C.navy],
            ["未實現損益", fmtShort(totPnl),   totPnl>=0?C.up:C.down],
            ["總報酬率",   fmtPct(totPct),     totPct>=0?C.up:C.down],
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
      {calced.length === 0 && (
        <Card><div style={{ textAlign:"center", padding:32, color:C.muted }}>還沒有持股，點上方「新增持股」開始記錄</div></Card>
      )}
      {calced.map(h=>(
        <Card key={h.symbol} style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                <span style={{ fontSize:16, fontWeight:800, color:C.navy }}>{h.symbol}</span>
                <span style={{ fontSize:14, color:C.muted }}>{h.name}</span>
                <Tag color={C.navyMid}>{ML[h.market]||"台股"}</Tag>
              </div>
              <div style={{ fontSize:12, color:C.muted }}>{h.totalShares.toLocaleString()} 股 · 均價 {h.cs}{fmt(h.avgCost)} · {h.lots.length} 批</div>
            </div>
            <button onClick={()=>deleteHolding(h.symbol)} style={{ fontSize:12, color:C.faint, background:"transparent", border:"none", cursor:"pointer" }}>刪除</button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
            {[
              ["現價",   `${h.cs}${fmt(h.currentPrice)}`, C.navy],
              ["損益",   fmtShort(h.pnl),  h.pnl>=0?C.up:C.down],
              ["報酬率", fmtPct(h.pnlPct), h.pnlPct>=0?C.up:C.down],
            ].map(([label,val,color])=>(
              <InnerBox key={label}>
                <div style={{ fontSize:13, color:C.navy }}>{label}</div>
                <div style={{ fontSize:14, fontWeight:700, color, fontFamily:"monospace" }}>{val}</div>
              </InnerBox>
            ))}
          </div>

          {h.lots.length > 1 && (
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

          <button onClick={()=>setShowLotId(v=>v===h.symbol?null:h.symbol)}
            style={{ width:"100%", padding:"8px", borderRadius:10, border:`1px dashed ${C.accent}88`, background:"transparent", color:C.accent, fontSize:13, cursor:"pointer" }}>
            {showLotId===h.symbol?"✕ 取消":"+ 加碼記錄（新增批次）"}
          </button>
          {showLotId===h.symbol && (
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
              <input value={lotForm.shares} onChange={e=>setLotForm(f=>({...f,shares:e.target.value}))} placeholder="股數" type="number" style={inputStyle} />
              <input value={lotForm.cost}   onChange={e=>setLotForm(f=>({...f,cost:e.target.value}))}   placeholder="買入成本價" type="number" style={inputStyle} />
              <input value={lotForm.date}   onChange={e=>setLotForm(f=>({...f,date:e.target.value}))}   type="date" style={inputStyle} />
              <button onClick={()=>addLot(h.symbol, h.market)} style={{ padding:"8px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontWeight:700, cursor:"pointer" }}>確認加碼</button>
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
// 登入 Modal（接 Supabase）
// ============================================================
function LoginModal({ onClose, onLogin }) {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");

  async function sendMagicLink() {
    if (!email) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) { setError(error.message); }
    else { setSent(true); }
    setLoading(false);
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
  }

  const inputStyle = { width:"100%", padding:"12px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface2, color:C.navy, fontSize:15, outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ position:"fixed", inset:0, background:"#1E3A5F88", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.surface, borderRadius:20, padding:28, border:`1px solid ${C.border}`, width:"100%", maxWidth:360, boxShadow:`0 20px 60px ${C.navy}33` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.navy }}>🕊️ 登入帳號</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.muted, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        {sent ? (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📧</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.navy, marginBottom:8 }}>確認信已寄出！</div>
            <div style={{ fontSize:13, color:C.muted }}>請查看 {email} 的信箱，點擊登入連結完成登入。</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <input value={email} onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&sendMagicLink()}
              placeholder="電子郵件" style={inputStyle} />
            {error && <div style={{ fontSize:12, color:C.down }}>{error}</div>}
            <button onClick={sendMagicLink} disabled={loading}
              style={{ padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", opacity:loading?0.7:1 }}>
              {loading ? "傳送中⋯" : "發送登入連結"}
            </button>
            <div style={{ textAlign:"center", color:C.muted, fontSize:12 }}>或</div>
            <button onClick={signInWithGoogle}
              style={{ padding:"12px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface2, color:C.navy, fontWeight:600, fontSize:14, cursor:"pointer" }}>
              🔵 使用 Google 登入
            </button>
            <div style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:4 }}>
              登入後可跨裝置同步持倉資料
            </div>
          </div>
        )}
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
  const [user,      setUser]      = useState(null);

  // 監聽登入狀態
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) setShowLogin(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  const tabs = [
    { id:"stock",     label:"🔍 股票" },
    { id:"screener",  label:"📊 選股" },
    { id:"portfolio", label:"💼 持倉" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.navy, fontFamily:"'Inter','Noto Sans TC',sans-serif" }}>
      {showLogin && <LoginModal onClose={()=>setShowLogin(false)} onLogin={setUser} />}

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 16px", position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 12px #1E3A5F0A" }}>
        <div style={{ maxWidth:960, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:26 }}>🕊️</span>
              <div>
                <div style={{ fontSize:18, fontWeight:900, background:`linear-gradient(90deg,${C.accentDark},${C.accent})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>全民股咕股</div>
                <div style={{ fontSize:12, color:C.muted }}>台美日股 AI 巡檢助理</div>
              </div>
            </div>
            {user ? (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:C.muted }}>{user.email?.split("@")[0]}</span>
                <button onClick={signOut} style={{ padding:"7px 14px", borderRadius:20, border:`1.5px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:13, cursor:"pointer" }}>登出</button>
              </div>
            ) : (
              <button onClick={()=>setShowLogin(true)} style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${C.accent}`, background:"transparent", color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer" }}>登入</button>
            )}
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
      <div style={{ maxWidth:960, margin:"0 auto", padding:"18px 14px 40px" }}>
        {tab==="stock"     && <StockPage />}
        {tab==="screener"  && <ScreenerPage />}
        {tab==="portfolio" && <PortfolioPage user={user} />}
      </div>
    </div>
  );
}
