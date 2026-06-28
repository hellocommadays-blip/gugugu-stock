import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { createClient } from "@supabase/supabase-js";
import { STOCK_LIST, SCREENER_US_DEDUP } from "./stockList.js";

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
  bg:        "#FFF8F3",   // 奶油白
  surface:   "#FFFFFF",   // 純白
  surface2:  "#FFF3EE",   // 粉橘白
  border:    "#F0DDD6",   // 淡粉
  navy:      "#3D2B2B",   // 深咖啡
  navyMid:   "#6B4444",   // 次標題
  muted:     "#9B7B78",   // 玫瑰灰
  faint:     "#C4A49F",   // 粉米
  accent:    "#F4845F",   // 珊瑚橘
  accentDark:"#D45F3C",   // 深珊瑚
  up:        "#E85D5D",   // 上漲玫瑰紅
  down:      "#5BAD8F",   // 下跌薄荷綠
  z0: "#5BAD8F", // 極低估（薄荷綠）
  z1: "#85C88A", // 低估（嫩綠）
  z2: "#F4C06F", // 合理（奶黃）
  z3: "#F4A460", // 偏高（杏橘）
  z4: "#E85D5D", // 高估（玫瑰紅）
  z5: "#C94040", // 泡沫（深玫瑰）
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
// STOCK_LIST 從 stockList.js 匯入

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
async function fetchStock(sym, forceMarket=null) {
  const market = forceMarket || detectMarket(sym);

  if (market === "TW") {
    const [priceRes, finRes, epsRes, histRes, instRes, marginRes, companyRes] = await Promise.all([
      fetch(`/api/twse?type=price&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=financials&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=eps&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=history&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=institutional&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=margin&stockNo=${sym}`).then(r=>r.json()),
      fetch(`/api/twse?type=company&stockNo=${sym}`).then(r=>r.json()).catch(()=>null),
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
    const company = (companyRes?.success && companyRes?.data) ? companyRes.data : null;
    const industry = company?.industry || null;
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
      inst, margin, industry,
    };

  } else {
    const isJP = sym.endsWith(".T") || market === "JP";
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
      currency: mkt==="JP" ? "USD" : (q.currency || "USD"),  // 日股ADR以USD計價 isETF: false,
      price: q.price, change: q.change, changePct: q.changePct,
      open: q.open, high: q.high, low: q.low, prevClose: q.prevClose,
      pe: fin?.pe||null, pb: fin?.pb||null, dividendYield: fin?.dividendYield||null,
      roe: fin?.roe||null, adjustedROE: fin?.adjustedROE||null,
      adjustedEquityPerShare: fin?.adjustedEquityPerShare||null,
      support, target, momentum: q.change, history,
      inst: null, margin: null,
      industry: q.industry || null,
      isADR: q.isADR || false,
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
// AI 巡檢元件
// ============================================================
function AIAnalysis({ stock, bm, zone }) {
  const [loading,  setLoading]  = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [error,    setError]    = useState("");
  const [done,     setDone]     = useState(false);

  if (!stock || stock.isETF) return null;

  async function runAnalysis() {
    setLoading(true); setAnalysis(""); setError(""); setDone(false);

    const prompt = `請用繁體中文，以朋友的語氣分析這支股票，輸出三點白話重點（每點50字以內）：

股票：${stock.name}（${stock.symbol}）
市場：${stock.market === 'TW' ? '台股' : stock.market === 'US' ? '美股' : '日股'}
產業：${stock.industry || '未知'}
現價：${stock.price}
估值區間：${zone?.zone || '無法計算'}（×${zone?.ratio?.toFixed(2) || 'N/A'}）
基準值：${bm ? bm.toFixed(2) : '無法計算'}
調整ROE：${stock.adjustedROE ? stock.adjustedROE.toFixed(2) + '%' : '無資料'}
本益比PE：${stock.pe ? stock.pe + '×' : '無資料'}
股價淨值比PB：${stock.pb ? stock.pb + '×' : '無資料'}
殖利率：${stock.dividendYield ? stock.dividendYield + '%' : '無資料'}

格式：
1. 💰 估值狀況：（說明現在貴不貴）
2. 📊 財務健康：（解讀ROE/殖利率/PE）
3. ⚠️ 注意事項：（投資人應該留意什麼）

不要給買賣建議，只分析現況。`;

    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock, bm, zone }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || "API 錯誤");

      setAnalysis(data.analysis);
      setDone(true);
    } catch (err) {
      setError("AI 巡檢暫時無法使用：" + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <SectionLabel>AI ANALYSIS · 股咕股 AI 巡檢</SectionLabel>

      {!analysis && !loading && !error && (
        <button onClick={runAnalysis}
          style={{ width:"100%", padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,#6D28D9,#4A9EFF)`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>
          🤖 開始 AI 巡檢
        </button>
      )}

      {loading && (
        <div style={{ textAlign:"center", padding:"20px 0", color:C.muted }}>
          <div style={{ fontSize:24, marginBottom:8 }}>🤖</div>
          <div style={{ fontSize:14 }}>AI 巡檢中⋯</div>
        </div>
      )}

      {analysis && (
        <div>
          <div style={{ fontSize:14, color:C.navy, lineHeight:1.8, marginBottom:12 }}>
            {analysis.split('\n').map((line, i) => {
              // **text** → <strong>
              const parts = line.split(/\*\*([^*]+)\*\*/g);
              return (
                <div key={i} style={{ marginBottom: line === '' ? 8 : 0 }}>
                  {parts.map((p, j) => j % 2 === 1
                    ? <strong key={j}>{p}</strong>
                    : <span key={j}>{p}</span>
                  )}
                </div>
              );
            })}
            {!done && <span style={{ opacity:0.5 }}>▌</span>}
          </div>
          {done && (
            <button onClick={()=>{ setAnalysis(""); setDone(false); }} 
              style={{ fontSize:12, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, padding:"4px 12px", cursor:"pointer" }}>
              重新分析
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ color:C.down, fontSize:13, padding:"8px 0" }}>{error}</div>
      )}

      <div style={{ fontSize:11, color:C.faint, marginTop:8 }}>
        ⚠️ AI 分析僅供參考，不構成投資建議
      </div>
    </Card>
  );
}

// ============================================================
// 股票查詢頁
// ============================================================
function StockPage({ initialQuery='', initialMarket=null, rates={}, onQueryUsed, onAddWatchlist }) {
  const [query, setQuery]     = useState(initialQuery);
  const [sugg,  setSugg]      = useState([]);
  const [stock, setStock]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // 跨頁籤查詢觸發
  useEffect(() => {
    if (initialQuery) {
      search(initialQuery, initialMarket);
      onQueryUsed && onQueryUsed();
    }
  }, [initialQuery]);

  function onInput(val) {
    setQuery(val);
    if (!val) { setSugg([]); return; }
    const q = val.toLowerCase();
    setSugg(STOCK_LIST.filter(s =>
      s.sym.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.industry && s.industry.toLowerCase().includes(q))
    ).slice(0, 8));
  }

  function select(item) {
    const sym = item.sym;
    setQuery(sym); setSugg([]);
    // 日股傳入 market=JP，讓 fetchStock 知道是日股
    searchWithMarket(sym, item.market);
  }

  async function searchWithMarket(sym, market=null) {
    if (!sym) return;
    setSugg([]);
    setLoading(true); setError(""); setStock(null);
    try {
      const data = await fetchStock(sym, market);
      setStock(data);
    } catch(err) {
      setError(`找不到「${sym}」：${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function search(s, forceMarket=null) {
    const sym = (s||query).trim().toUpperCase();
    if (!sym) return;
    // 從 STOCK_LIST 找看有沒有對應的 market
    const found = STOCK_LIST.find(i => i.sym === sym);
    await searchWithMarket(sym, forceMarket || found?.market || null);
  }

  const bm   = stock ? calcBenchmark({ adjustedEquityPerShare:stock.adjustedEquityPerShare, adjustedROE:stock.adjustedROE/100 }) : null;
  const zone = stock ? calcZone(stock.price, bm) : null;
  const cs   = stock ? CS[stock.currency] : "";

  return (
    <div>
      <div style={{ position:"relative", marginBottom:24 }}>
        <div style={{ display:"flex", gap:8 }}>
          <input value={query} onChange={e=>onInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="輸入代號或名稱（2330、台積電、TSLA、TM=Toyota）"
            style={{ flex:1, padding:"12px 16px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface, color:C.navy, fontSize:15, outline:"none" }} />
          <button onClick={()=>search()} style={{ padding:"12px 20px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>查詢</button>
        </div>
        {sugg.length>0 && (
          <div style={{ position:"absolute", top:"100%", left:0, right:60, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, marginTop:4, zIndex:100, overflow:"hidden", boxShadow:`0 8px 24px ${C.navy}18` }}>
            {sugg.map(s=>(
              <div key={s.sym} onClick={()=>select(s)}
                style={{ padding:"10px 16px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${C.border}` }}
                onMouseEnter={e=>e.currentTarget.style.background=C.surface2}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div>
                  <span style={{ color:C.navy }}><b>{s.sym}</b> · {s.name}</span>
                  {s.industry && <span style={{ fontSize:11, color:C.faint, marginLeft:6 }}>｜{s.industry}</span>}
                </div>
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
                  {stock.industry && <span style={{ fontSize:14, color:C.muted }}>｜{stock.industry}</span>}
                  <Tag color={C.navyMid}>{ML[stock.market]} · {stock.symbol}</Tag>
                  {stock.isETF && <Tag color="#B45309">ETF</Tag>}
                  {stock.market==="JP" && stock.isADR && <Tag color="#7C3AED">ADR</Tag>}
                </div>
                <div style={{ fontSize:34, fontWeight:900, color:C.navy, fontFamily:"monospace", letterSpacing:-1 }}>{cs}{fmt(stock.price)}</div>
                {stock.market==='US' && rates?.USD?.sell && (
                  <div style={{ fontSize:16, color:C.navy, marginTop:2, fontFamily:"monospace" }}>NT${fmt(stock.price * rates.USD.sell)}</div>
                )}
                <div style={{ fontSize:15, marginTop:4, color:stock.change>=0?C.up:C.down, fontWeight:600 }}>
                  {stock.change>=0?"▲":"▼"} {Math.abs(stock.change).toFixed(2)} ({fmtPct(stock.changePct)})
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
                {zone && !stock.isETF && (
                  <div style={{ background:zone.color+"14", border:`2px solid ${zone.color}`, borderRadius:12, padding:"12px 16px", textAlign:"center", minWidth:100 }}>
                    <div style={{ fontSize:13, color:C.navy, marginBottom:2 }}>目前估值</div>
                    <div style={{ fontSize:17, fontWeight:800, color:zone.color }}>{zone.zone}</div>
                    <div style={{ fontSize:12, color:C.faint, marginTop:2 }}>×{fmt(zone.ratio)}</div>
                  </div>
                )}
                {onAddWatchlist && (
                  <button onClick={()=>onAddWatchlist(stock)}
                    style={{ padding:"8px 14px", borderRadius:10, border:`1.5px solid ${C.accent}`, background:"transparent", color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                    ⭐ 加入自選
                  </button>
                )}
              </div>
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
              {stock.isADR && (
                <div style={{ background:"#F5F3FF", border:"1px solid #DDD6FE", borderRadius:10, padding:"8px 12px", marginBottom:12, fontSize:12, color:"#6D28D9" }}>
                  ⚠️ 日股ADR財務數據以美元計，基準值僅供參考，無法與日圓股價直接比較。
                </div>
              )}
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

          {/* AI 巡檢 */}
          <AIAnalysis stock={stock} bm={bm} zone={zone} />

          <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"4px 0 12px" }}>
            <span className="desktop-notice">
          🕊️「股咕股」溫馨提示：本工具僅為個人開發之數據整合與指標分析統計，<br/>並非提供任何形式的投資買賣建議。市場有風險，投資需謹慎，盈虧請用戶自負。
        </span>
        <span className="mobile-notice">
          本工具僅供參考，不構成投資建議。<br/>市場有風險，盈虧請用戶自負。
        </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 選股頁（台股 + 美股 + 日股）
// ============================================================
function ScreenerPage({ onSelectStock, user, rates={} }) {
  const [market,       setMarket]       = useState("TW"); // TW | US | JP
  const [selectedZone, setSelectedZone] = useState("全部");
  const [results,      setResults]      = useState([]);
  const [allResults,   setAllResults]   = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [ran,          setRan]          = useState(false);
  const [dataDate,     setDataDate]     = useState("");
  const [sortBy,       setSortBy]       = useState("zone");
  // 美/日股掃描進度
  const [scanProgress, setScanProgress] = useState({ done:0, total:0 });
  const [scanLog,      setScanLog]      = useState("");

  const zones     = ["全部","極低估區","低估區","合理區","偏高區","高估區","泡沫區"];
  const zoneColor = { "極低估區":C.z0,"低估區":C.z1,"合理區":C.z2,"偏高區":C.z3,"高估區":C.z4,"泡沫區":C.z5 };
  const zoneOrder = { "極低估區":0,"低估區":1,"合理區":2,"偏高區":3,"高估區":4,"泡沫區":5 };

  // 市場切換時重置結果
  function switchMarket(m) {
    setMarket(m);
    setRan(false);
    setResults([]);
    setAllResults([]);
    setSelectedZone("全部");
    setSortBy("zone");
    setScanProgress({ done:0, total:0 });
    setScanLog("");
  }

  // ── 台股掃描（TWSE API）──────────────────────────────────
  async function runTW() {
    setLoading(true); setRan(true);
    try {
      const r    = await fetch('/api/twse?type=screener');
      const data = await r.json();
      if (data.success) {
        setAllResults(data.data || []);
        setDataDate(data.date || "");
        filterAndSort(data.data || [], selectedZone, sortBy);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── 美/日股掃描（Finnhub，逐批控速）────────────────────────
  async function runForeign(stockList, mkt) {
    setLoading(true); setRan(true);
    setScanProgress({ done:0, total:stockList.length });
    setScanLog("");

    const BATCH     = 5;   // 每批 5 檔同時查
    const DELAY_MS  = 500; // 批次間等 0.5 秒（Yahoo 無限速，Finnhub quote ~60req/min）
    const collected = [];

    for (let i = 0; i < stockList.length; i += BATCH) {
      const batch = stockList.slice(i, i + BATCH);
      setScanLog(`掃描中：${batch.map(s=>s.sym).join("、")}`);

      const batchResults = await Promise.all(batch.map(async (s) => {
        try {
          const safeFetch = async (url) => {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 9000);
              const r = await fetch(url, { signal: controller.signal });
              clearTimeout(timer);
              if (!r.ok) return null;
              return r.json().catch(() => null);
            } catch (_) { return null; }
          };
          // quote + financials 用 Finnhub（精選支援清單）
          // 日股ADR 在美掛牌，用 market=US 查
          const fhMkt = mkt === 'JP' ? 'US' : mkt;
          const [quoteRes, finRes] = await Promise.all([
            safeFetch(`/api/finnhub?symbol=${s.sym}&market=${fhMkt}&type=quote`),
            safeFetch(`/api/finnhub?symbol=${s.sym}&market=${fhMkt}&type=financials`),
          ]);
          if (!quoteRes?.success) return null;
          const q   = quoteRes.data;
          const fin = finRes?.success ? finRes.data : null;

          const adjustedROE            = fin?.adjustedROE            || fin?.roe            || null;
          const adjustedEquityPerShare = fin?.adjustedEquityPerShare || fin?.bookValue      || null;
          const bm  = (adjustedEquityPerShare && adjustedROE)
            ? adjustedEquityPerShare * (adjustedROE / 100) * 10
            : null;
          const zoneInfo = bm ? calcZone(q.price, bm) : null;

          return {
            symbol:   s.sym,
            name:     q.name || s.name,
            industry: s.industry || q.industry || "—",
            market:   mkt,
            price:    q.price,
            changePct:q.changePct,
            pe:       fin?.pe                   || null,
            pb:       fin?.pb                   || null,
            divYield: fin?.dividendYield        || null,
            adjustedROE,
            adjustedEquityPerShare,
            bm,
            zone:     zoneInfo?.zone  || "—",
            ratio:    zoneInfo?.ratio || null,
          };
        } catch(_) { return null; }
      }));

      batchResults.forEach(r => r && collected.push(r));
      setScanProgress(p => ({ ...p, done: Math.min(i + BATCH, stockList.length) }));

      // 即時更新結果（邊掃邊顯示）
      const sorted = sortItems([...collected], sortBy);
      setAllResults([...collected]);
      setResults(selectedZone === "全部" ? sorted : sorted.filter(s=>s.zone===selectedZone));

      if (i + BATCH < stockList.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    setScanLog("");
    setLoading(false);
  }

  async function run() {
    setSelectedZone("全部");
    if (market === "TW") {
      runTW();
    } else {
      runUS();
    }
  }

  // ── 美股選股：從 Supabase stocks_cache 讀取 ─────────────
  async function runUS() {
    setLoading(true); setRan(true); setScanLog("");
    try {
      const { data, error } = await supabase
        .from('stocks_cache')
        .select('*')
        .eq('market', 'US')
        .order('symbol');
      if (error) throw new Error(error.message);
      if (!data?.length) {
        setScanLog("資料庫無快取，改為即時掃描...");
        setLoading(false);
        runForeign(SCREENER_US_DEDUP, "US");
        return;
      }
      const mapped = data.map(s => ({
        symbol:    s.symbol,
        name:      s.name,
        industry:  s.industry || "—",
        market:    'US',
        price:     s.price,
        changePct: s.change_pct,
        pe:        s.pe,
        pb:        s.pb,
        divYield:  s.div_yield,
        adjustedROE:            s.roe,
        adjustedEquityPerShare: s.bps,
        bm:        s.bm,
        zone:      s.zone || "—",
        ratio:     s.ratio,
      }));
      if (data[0]?.updated_at) {
        const d = new Date(data[0].updated_at);
        d.setHours(d.getHours() + 8);
        setDataDate(d.toISOString().slice(0,10).replace(/-/g,'/'));
      }
      setAllResults(mapped);
      filterAndSort(mapped, selectedZone, sortBy);
    } catch (err) {
      setScanLog("讀取失敗，改為即時掃描...");
      runForeign(SCREENER_US_DEDUP, "US");
    } finally {
      setLoading(false);
    }
  }

  function sortItems(data, sort) {
    return [...data].sort((a, b) => {
      if (sort === "zone")     return (zoneOrder[a.zone] || 0) - (zoneOrder[b.zone] || 0);
      if (sort === "pe")       return (a.pe || 999) - (b.pe || 999);
      if (sort === "pb")       return (a.pb || 999) - (b.pb || 999);
      if (sort === "divYield") return (b.divYield || 0) - (a.divYield || 0);
      if (sort === "changePct")return (b.changePct || 0) - (a.changePct || 0);
      return 0;
    });
  }

  function filterAndSort(data, zone, sort) {
    let filtered = zone === "全部" ? data : data.filter(s => s.zone === zone);
    setResults(sortItems(filtered, sort));
  }

  function onZoneChange(z) {
    setSelectedZone(z);
    filterAndSort(allResults, z, sortBy);
  }

  function onSortChange(s) {
    setSortBy(s);
    filterAndSort(allResults, selectedZone, s);
  }

  const isTW    = market === "TW";
  const scanPct = scanProgress.total > 0
    ? Math.round((scanProgress.done / scanProgress.total) * 100)
    : 0;

  // 市場對應的貨幣符號
  const mktCS = { TW:"NT$", US:"$", JP:"¥" };
  const cs = mktCS[market];

  return (
    <div>
      <Card style={{ marginBottom:16 }}>
        {/* 市場切換 */}
        <div style={{ marginBottom:16 }}>
          <SectionLabel>選擇市場</SectionLabel>
          <div style={{ display:"flex", gap:8 }}>
            {[["TW","🇹🇼 台股"],["US","🇺🇸 美股"]].map(([m, label]) => (
              <button key={m} onClick={()=>switchMarket(m)}
                style={{ flex:1, padding:"10px 8px", borderRadius:12, border:`2px solid ${market===m?C.accent:C.border}`, background:market===m?C.accent+"14":"transparent", color:market===m?C.accent:C.muted, fontWeight:market===m?700:400, fontSize:13, cursor:"pointer" }}>
                {label}
              </button>
            ))}
          </div>
          {market !== "TW" && (
            <div style={{ fontSize:11, color:C.faint, marginTop:8, lineHeight:1.6 }}>
              {market === "US"
                ? `⚡ 美股資料每日自動更新，共 ${allResults.length > 0 ? allResults.length : "100+"} 檔，即點即看。`
                : null
              }
            </div>
          )}
        </div>

        {/* 估值區間篩選 */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:13, color:C.navy, marginBottom:8, fontWeight:600 }}>估值區間</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {zones.map(z=>{
              const active = selectedZone===z;
              const col    = zoneColor[z]||C.accent;
              return (
                <button key={z} onClick={()=>onZoneChange(z)}
                  style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${active?col:C.border}`, background:active?col+"18":"transparent", color:active?col:C.muted, fontSize:12, cursor:"pointer", fontWeight:active?700:400 }}>
                  {z}
                </button>
              );
            })}
          </div>
        </div>

        {/* 排序 */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:13, color:C.navy, marginBottom:8, fontWeight:600 }}>排序方式</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {[["zone","估值區間"],["pe","本益比↑"],["pb","淨值比↑"],["divYield","殖利率↓"],["changePct","漲跌幅↓"]].map(([val,label])=>(
              <button key={val} onClick={()=>onSortChange(val)}
                style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${sortBy===val?C.accent:C.border}`, background:sortBy===val?C.accent+"18":"transparent", color:sortBy===val?C.accent:C.muted, fontSize:12, cursor:"pointer", fontWeight:sortBy===val?700:400 }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={run} disabled={loading}
          style={{ width:"100%", padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", opacity:loading?0.7:1 }}>
          {loading
            ? (market==="TW" ? "掃描台股中⋯" : "讀取中⋯")
            : `執行選股 · ${market==="TW"?"台股上市":"美股精選"}`
          }
        </button>

        {/* 美/日股進度條 */}
        {loading && market !== "TW" && scanProgress.total > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ height:6, borderRadius:3, background:C.border, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${scanPct}%`, background:`linear-gradient(90deg,${C.accentDark},${C.accent})`, transition:"width 0.5s ease", borderRadius:3 }} />
            </div>
            {scanLog && (
              <div style={{ fontSize:11, color:C.faint, marginTop:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {scanLog}
              </div>
            )}
          </div>
        )}
      </Card>

      {ran && (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
            <span style={{ fontSize:14, fontWeight:700, color:C.navy }}>
              {loading && market!=="TW"
                ? `已找到 ${results.length} 檔（掃描中⋯）`
                : `篩選結果 ${results.length} 檔`
              }
            </span>
            <div style={{ fontSize:11, color:C.faint, display:"flex", gap:8, alignItems:"center" }}>
              {dataDate && <span>資料日期：{dataDate}</span>}
              {market === "US" && <span>⚠️ 估值基準值為近似值</span>}
              {market === "TW" && <span>⚠️ 基準值為近似值</span>}
            </div>
          </div>

          {results.length === 0 && !loading ? (
            <div style={{ padding:32, textAlign:"center", color:C.muted }}>
              {ran ? "目前無符合條件的股票" : "點擊「執行選股」開始掃描"}
            </div>
          ) : (
            <div>
              {/* 表頭 */}
              <div style={{ display:"grid", gridTemplateColumns:"60px 1fr 80px 90px 44px 54px 70px", gap:10, padding:"8px 14px", background:C.surface2, fontSize:11, color:C.muted, fontWeight:600 }}>
                <span>代號</span>
                <span>名稱／產業</span>
                <span style={{ textAlign:"right" }}>現價</span>
                <span style={{ textAlign:"right" }}>台幣</span>
                <span style={{ textAlign:"right" }}>PE</span>
                <span style={{ textAlign:"right" }}>殖利率</span>
                <span style={{ textAlign:"right" }}>估值區間</span>
              </div>
              {results.slice(0, 150).map(s=>{
                const sym = s.symbol || s.sym;
                const displayCS = s.market === "TW" ? "NT$" : "$";
                return (
                  <div key={sym}
                    onClick={()=>onSelectStock&&onSelectStock(sym, s.market||market)}
                    style={{ display:"grid", gridTemplateColumns:"60px 1fr 80px 90px 44px 54px 70px", gap:10, padding:"10px 14px", borderBottom:`1px solid ${C.surface2}`, alignItems:"center", cursor:"pointer" }}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surface2}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>{sym}</span>
                    <div style={{ overflow:"hidden" }}>
                      <div style={{ fontSize:12, color:C.navy, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</div>
                      {s.industry && s.industry !== "—" && <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{s.industry}</div>}
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.navy, fontFamily:"monospace" }}>
                        {s.price ? `${displayCS}${fmt(s.price)}` : "—"}
                      </div>
                      {s.changePct != null && (
                        <div style={{ fontSize:10, color:s.changePct>=0?C.up:C.down }}>{fmtPct(s.changePct)}</div>
                      )}
                    </div>
                    <div style={{ textAlign:"right", fontSize:13, color:C.navy, fontFamily:"monospace" }}>
                      {s.market === 'US' && s.price && rates?.USD?.sell
                        ? `NT$${fmt(s.price*rates.USD.sell)}`
                        : "—"}
                    </div>
                    <span style={{ fontSize:12, color:C.muted, textAlign:"right" }}>{s.pe ? fmt(s.pe,1) : "—"}</span>
                    <span style={{ fontSize:12, color:C.muted, textAlign:"right" }}>{(s.divYield||s.dividendYield) ? `${fmt(s.divYield||s.dividendYield,1)}%` : "—"}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:zoneColor[s.zone]||C.muted, textAlign:"right" }}>
                      {s.zone !== "—" ? s.zone : <span style={{ color:C.faint }}>無資料</span>}
                    </span>
                  </div>
                );
              })}
              {results.length > 150 && (
                <div style={{ padding:"12px 16px", textAlign:"center", fontSize:12, color:C.muted }}>
                  顯示前 150 筆，共 {results.length} 筆
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ============================================================
// 自選清單頁
// ============================================================
function WatchlistPage({ user, rates={}, onSelectStock }) {
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [addSym,  setAddSym]  = useState("");
  const [prices,  setPrices]  = useState({});

  useEffect(() => {
    if (!user) {
      const saved = localStorage.getItem("gugugu_watchlist");
      if (saved) setList(JSON.parse(saved));
      return;
    }
    loadList();
  }, [user]);

  useEffect(() => {
    if (list.length === 0) return;
    async function fetchPrices() {
      const newPrices = {};
      await Promise.all(list.map(async item => {
        try {
          const market = detectMarket(item.symbol);
          if (market === "TW") {
            const r = await fetch(`/api/twse?type=price&stockNo=${item.symbol}`);
            const d = await r.json();
            if (d.success) {
              newPrices[item.symbol] = { price: d.data.price, change: d.data.change, changePct: d.data.changePct, name: d.data.name };
            }
          } else {
            const r = await fetch(`/api/finnhub?symbol=${item.symbol}&market=US&type=quote`);
            const d = await r.json();
            if (d.success) {
              newPrices[item.symbol] = { price: d.data.price, change: d.data.change, changePct: d.data.changePct, name: d.data.name };
            }
          }
        } catch (_) {}
      }));
      setPrices(newPrices);
    }
    fetchPrices();
  }, [list.length]);

  async function loadList() {
    setLoading(true);
    const { data } = await supabase.from("watchlist").select("*").order("created_at", { ascending: true });
    if (data) setList(data.map(r => ({ symbol: r.symbol, market: r.market, name: r.name })));
    setLoading(false);
  }

  async function addToList() {
    if (!addSym) return;
    const sym = addSym.trim().toUpperCase();
    if (list.find(i => i.symbol === sym)) { setAddSym(""); return; }
    const market = detectMarket(sym);

    // 抓名稱
    let name = sym;
    try {
      if (market === "TW") {
        const r = await fetch(`/api/twse?type=price&stockNo=${sym}`);
        const d = await r.json();
        if (d.success) name = d.data.name || sym;
      } else {
        const r = await fetch(`/api/finnhub?symbol=${sym}&market=US&type=quote`);
        const d = await r.json();
        if (d.success) name = d.data.name || sym;
      }
    } catch (_) {}

    const newItem = { symbol: sym, market, name };
    if (user) {
      await supabase.from("watchlist").insert({ user_id: user.id, symbol: sym, market, name });
      loadList();
    } else {
      const newList = [...list, newItem];
      setList(newList);
      localStorage.setItem("gugugu_watchlist", JSON.stringify(newList));
    }
    setAddSym("");
  }

  async function removeFromList(sym) {
    if (user) {
      await supabase.from("watchlist").delete().eq("user_id", user.id).eq("symbol", sym);
      loadList();
    } else {
      const newList = list.filter(i => i.symbol !== sym);
      setList(newList);
      localStorage.setItem("gugugu_watchlist", JSON.stringify(newList));
    }
  }

  const inputStyle = { flex:1, padding:"10px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.surface, color:C.navy, fontSize:14, outline:"none" };

  return (
    <div>
      {!user && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:12, padding:"12px 16px", color:"#92400E", fontSize:13, marginBottom:16 }}>
          📌 未登入狀態，資料儲存在此裝置。登入後可跨裝置同步。
        </div>
      )}

      <Card style={{ marginBottom:16 }}>
        <SectionLabel>WATCHLIST · 自選清單</SectionLabel>
        <div style={{ display:"flex", gap:8 }}>
          <input value={addSym} onChange={e=>setAddSym(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addToList()}
            placeholder="輸入代號（2330、TSLA）"
            style={inputStyle} />
          <button onClick={addToList}
            style={{ padding:"10px 16px", borderRadius:10, border:"none", background:`linear-gradient(135deg,${C.accentDark},${C.accent})`, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>
            加入
          </button>
        </div>
      </Card>

      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:C.muted }}><div style={{ fontSize:32 }}>🕊️</div><div>載入中⋯</div></div>
      ) : list.length === 0 ? (
        <Card><div style={{ textAlign:"center", padding:32, color:C.muted }}>還沒有自選股票，輸入代號開始新增</div></Card>
      ) : (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 96px 104px 72px 44px", gap:12, padding:"8px 16px", background:C.surface2, fontSize:11, color:C.muted, fontWeight:600 }}>
            <span>代號</span><span>名稱／產業</span><span style={{ textAlign:"right" }}>現價</span><span style={{ textAlign:"right" }}>台幣</span><span style={{ textAlign:"right" }}>漲跌</span><span></span>
          </div>
          {list.map(item => {
            const p = prices[item.symbol];
            const name = p?.name || item.name || item.symbol;
            const market = item.market || detectMarket(item.symbol);
            const cs = market === "US" ? "$" : market === "JP" ? "¥" : "NT$";
            return (
              <div key={item.symbol}
                style={{ display:"grid", gridTemplateColumns:"80px 1fr 96px 104px 72px 44px", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.surface2}`, alignItems:"center" }}
                onMouseEnter={e=>e.currentTarget.style.background=C.surface2}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span onClick={()=>onSelectStock&&onSelectStock(item.symbol)}
                  style={{ fontSize:13, fontWeight:700, color:C.accent, cursor:"pointer" }}>{item.symbol}</span>
                <div onClick={()=>onSelectStock&&onSelectStock(item.symbol)} style={{ cursor:"pointer", overflow:"hidden" }}>
                  <div style={{ fontSize:13, color:C.navy, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                  {(() => { const found = STOCK_LIST.find(s=>s.sym===item.symbol); return found?.industry ? <div style={{ fontSize:11, color:C.navyMid, marginTop:1 }}>{found.industry}</div> : null; })()}
                </div>
                <div style={{ textAlign:"right", fontSize:13, fontWeight:700, color:C.navy, fontFamily:"monospace" }}>
                  {p ? `${cs}${fmt(p.price)}` : "—"}
                </div>
                <div style={{ textAlign:"right", fontSize:13, color:C.navy, fontFamily:"monospace" }}>
                  {market==='US' && p?.price && rates?.USD?.sell
                    ? `NT$${fmt(p.price*rates.USD.sell)}`
                    : "—"}
                </div>
                <span style={{ fontSize:12, textAlign:"right", color:p?.changePct>=0?C.up:C.down, fontFamily:"monospace" }}>
                  {p ? fmtPct(p.changePct) : "—"}
                </span>
                <span style={{ textAlign:"right" }}>
                  <button onClick={()=>removeFromList(item.symbol)}
                    style={{ fontSize:12, color:C.faint, background:"transparent", border:"none", cursor:"pointer" }}>刪除</button>
                </span>
              </div>
            );
          })}
        </Card>
      )}

      <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"16px 0" }}>
        🕊️「股咕股」溫馨提示：本工具僅為個人開發之數據整合與指標分析統計，並非提供任何形式的投資買賣建議。
      </div>
    </div>
  );
}

// ============================================================
// 持倉管理頁（接 Supabase）
// ============================================================
function PortfolioPage({ user, rates={} }) {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [addForm, setAddForm]   = useState({ symbol:"", shares:"", cost:"", date:"" });
  const [lotForm, setLotForm]   = useState({ shares:"", cost:"", date:"" });
  const [showAdd, setShowAdd]   = useState(false);
  const [showLotId, setShowLotId] = useState(null);
  const [editLotKey, setEditLotKey] = useState(null);
  const [expandedLots, setExpandedLots] = useState({});
  const [editForm, setEditForm]   = useState({ shares:"", cost:"", date:"" });
  const [prices, setPrices]     = useState({});

  const [dividends, setDividends] = useState({});
  const [showDivSym, setShowDivSym] = useState(null);
  const [divForm, setDivForm]   = useState({ exDate:"", cashDiv:"", shares:"", note:"" });
  const [showDivInput, setShowDivInput] = useState(null);

  // 載入持倉
  useEffect(() => {
    if (!user) {
      const saved = localStorage.getItem("gugugu_holdings");
      if (saved) setHoldings(JSON.parse(saved));
      return;
    }
    loadHoldings();
  }, [user]);

  // 持倉載入後，拉配息記錄
  useEffect(() => {
    if (holdings.length > 0) {
      const syms = [...new Set(holdings.map(h=>h.symbol))];
      loadDividends(syms);
    }
  }, [holdings.length]);

  // 載入配息記錄（Supabase）
  async function loadDividends(syms) {
    if (!user || !syms?.length) return;
    const { data } = await supabase
      .from('dividends')
      .select('*')
      .eq('user_id', user.id)
      .in('symbol', syms)
      .order('ex_date', { ascending: false });
    if (!data) return;
    const grouped = {};
    data.forEach(d => {
      if (!grouped[d.symbol]) grouped[d.symbol] = [];
      grouped[d.symbol].push(d);
    });
    setDividends(grouped);
  }

  // 新增配息記錄
  async function addDividend(symbol, market) {
    if (!divForm.exDate || !divForm.cashDiv) return;
    const shares = parseFloat(divForm.shares) || 0;
    const cashDiv = parseFloat(divForm.cashDiv) || 0;
    const record = {
      user_id: user?.id,
      symbol, market,
      ex_date:  divForm.exDate,
      amount:   cashDiv,
      shares:   shares,
      total:    shares * cashDiv,
      note:     divForm.note || null,
    };
    if (user) {
      await supabase.from('dividends').insert(record);
      loadDividends([symbol]);
    }
    setDivForm({ exDate:"", cashDiv:"", shares:"", note:"" });
    setShowDivInput(null);
  }

  // 刪除配息記錄
  async function deleteDividend(id, symbol) {
    if (!user) return;
    await supabase.from('dividends').delete().eq('id', id);
    loadDividends([symbol]);
  }

  // 從 FinMind 拉歷史配息（台股）
  async function fetchFinMindDividends(symbol) {
    try {
      const r = await fetch(`/api/finmind?type=dividend&symbol=${symbol}`);
      const d = await r.json();
      if (!d.success || !d.data?.length) return;
      // 批次 upsert 到 Supabase
      const records = d.data.map(div => ({
        user_id: user.id,
        symbol,
        market:   'TW',
        ex_date:  div.exDate,
        pay_date: div.payDate || null,
        amount:   div.cashDiv,
        shares:   null,
        total:    null,
        note:     `FinMind 自動匯入（${div.year}）`,
      })).filter(r => r.ex_date);
      if (records.length) {
        await supabase.from('dividends').upsert(records, { onConflict: 'user_id,symbol,ex_date', ignoreDuplicates: true });
        loadDividends([symbol]);
      }
    } catch(_) {}
  }

  // 載入完持倉後：抓即時價格 + 自動修正名稱
  useEffect(() => {
    if (holdings.length === 0) return;
    async function fetchPricesAndFixNames() {
      const newPrices = {};
      await Promise.all(holdings.map(async h => {
        try {
          const market = detectMarket(h.symbol);
          let stockName = null;
          let price = 0;

          if (market === "TW") {
            const r = await fetch(`/api/twse?type=price&stockNo=${h.symbol}`);
            const data = await r.json();
            if (data.success) {
              price = data.data.price;
              stockName = data.data.name;
            }
          } else {
            const r = await fetch(`/api/finnhub?symbol=${h.symbol}&market=US&type=quote`);
            const data = await r.json();
            if (data.success) {
              price = data.data.price;
              stockName = data.data.name;
            }
          }

          newPrices[h.symbol] = price;

          // 如果名稱等於代號（舊資料），自動更新到 Supabase
          if (stockName && stockName !== h.symbol && h.name === h.symbol && user) {
            await supabase
              .from("holdings")
              .update({ name: stockName })
              .eq("user_id", user.id)
              .eq("symbol", h.symbol);
          }
        } catch (_) {}
      }));
      setPrices(newPrices);
      // 如果有名稱被修正，重新載入
      if (user) loadHoldings();
    }
    fetchPricesAndFixNames();
  }, [holdings.length]);

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

    // 先抓股票名稱
    let stockName = sym;
    try {
      if (market === "TW") {
        const r = await fetch(`/api/twse?type=price&stockNo=${sym}`);
        const d = await r.json();
        if (d.success) stockName = d.data.name || sym;
      } else {
        const r = await fetch(`/api/finnhub?symbol=${sym}&market=US&type=quote`);
        const d = await r.json();
        if (d.success) stockName = d.data.name || sym;
      }
    } catch (_) {}

    if (user) {
      const { error } = await supabase.from("holdings").insert({
        user_id: user.id, symbol: sym, market, name: stockName, shares: lot.shares, cost: lot.cost, date: lot.date
      });
      if (!error) { loadHoldings(); }
    } else {
      const existing = holdings.find(h => h.symbol === sym);
      let newHoldings;
      if (existing) {
        newHoldings = holdings.map(h => h.symbol === sym ? { ...h, lots: [...h.lots, lot] } : h);
      } else {
        newHoldings = [...holdings, { id: sym, symbol: sym, market, name: stockName, lots: [lot] }];
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

  async function updateLot(symbol, market, lotId, lotIndex, form) {
    const shares = +form.shares;
    const cost   = +form.cost;
    const date   = form.date;
    if (!shares || !cost) return;
    if (user && lotId) {
      await supabase.from("holdings").update({ shares, cost, date }).eq("id", lotId);
      loadHoldings();
    } else {
      const newHoldings = holdings.map(h => {
        if (h.symbol !== symbol) return h;
        const newLots = h.lots.map((l,i) => i === lotIndex ? { ...l, shares, cost, date } : l);
        return { ...h, lots: newLots };
      });
      setHoldings(newHoldings);
      saveLocal(newHoldings);
    }
    setEditLotKey(null);
  }

  async function deleteLot(symbol, lotId, lotIndex) {
    if (user && lotId) {
      await supabase.from("holdings").delete().eq("id", lotId);
      loadHoldings();
    } else {
      const newHoldings = holdings.map(h => {
        if (h.symbol !== symbol) return h;
        return { ...h, lots: h.lots.filter((_,i) => i !== lotIndex) };
      });
      setHoldings(newHoldings.filter(h => h.lots.length > 0));
      saveLocal(newHoldings.filter(h => h.lots.length > 0));
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
        {/* 美股持倉換算台幣 */}
        {calced.some(h=>h.market==='US') && (
          <div style={{ fontSize:12, color:C.muted, marginBottom:12, padding:"8px 12px", background:C.surface2, borderRadius:8 }}>
            💱 匯率換算（台銀即期賣出）：
            {calced.filter(h=>h.market==='US').map(h=>(
              <span key={h.symbol} style={{ marginLeft:8 }}>
                {h.symbol} {h.cs}{fmt(h.currentVal)} ≈ NT${fmt(h.currentVal*(rates.USD?.sell||32.5))}
              </span>
            ))}
          </div>
        )}
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
                {h.name && h.name !== h.symbol && (
                  <span style={{ fontSize:14, color:C.muted }}>{h.name}</span>
                )}
                <Tag color={C.navyMid}>{ML[h.market]||"台股"}</Tag>
                {(() => { const found = STOCK_LIST.find(s=>s.sym===h.symbol); return found?.industry ? <Tag color={C.faint}>{found.industry}</Tag> : null; })()}
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

          <InnerBox style={{ marginBottom:10 }}>
            {/* 標題列：點擊展開/收合 */}
            <div onClick={()=>setExpandedLots(v=>({...v,[h.symbol]:!v[h.symbol]}))}
              style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", userSelect:"none" }}>
              <div style={{ fontSize:13, color:C.navy }}>
                分批明細
                <span style={{ fontSize:11, color:C.muted, marginLeft:6 }}>（{h.lots.length} 批）</span>
              </div>
              <span style={{ fontSize:12, color:C.muted }}>{expandedLots[h.symbol] ? "▲ 收合" : "▼ 展開"}</span>
            </div>

            {expandedLots[h.symbol] && (
              <div style={{ marginTop:8 }}>
                {/* 表頭 */}
                <div style={{ display:"grid", gridTemplateColumns:"36px 110px 1fr 110px 90px", gap:8, padding:"4px 0", borderBottom:`1px solid ${C.border}`, fontSize:11, color:C.faint, fontWeight:600 }}>
                  <span>批次</span><span>日期</span><span style={{textAlign:"right"}}>股數</span><span style={{textAlign:"right"}}>成本</span><span></span>
                </div>
                {h.lots.map((l,i)=>{
                  const key = `${h.symbol}-${i}`;
                  const isEditing = editLotKey === key;
                  return (
                    <div key={i} style={{ borderBottom:i<h.lots.length-1?`1px solid ${C.border}`:"none" }}>
                      {isEditing ? (
                        <div style={{ padding:"8px 0", display:"flex", flexDirection:"column", gap:6 }}>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                            <input value={editForm.shares} onChange={e=>setEditForm(f=>({...f,shares:e.target.value}))}
                              placeholder="股數" type="number" style={{ ...inputStyle, padding:"6px 10px", fontSize:12 }} />
                            <input value={editForm.cost} onChange={e=>setEditForm(f=>({...f,cost:e.target.value}))}
                              placeholder="成本" type="number" style={{ ...inputStyle, padding:"6px 10px", fontSize:12 }} />
                            <input value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))}
                              type="date" style={{ ...inputStyle, padding:"6px 10px", fontSize:12 }} />
                          </div>
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={()=>updateLot(h.symbol, h.market, l.id, i, editForm)}
                              style={{ flex:1, padding:"6px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>儲存</button>
                            <button onClick={()=>setEditLotKey(null)}
                              style={{ flex:1, padding:"6px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:12, cursor:"pointer" }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:"grid", gridTemplateColumns:"36px 110px 1fr 110px 90px", gap:8, padding:"7px 0", alignItems:"center", fontSize:12, color:C.muted }}>
                          <span style={{ fontWeight:600, color:C.navy }}>#{i+1}</span>
                          <span>{l.date}</span>
                          <span style={{ textAlign:"right" }}>{l.shares.toLocaleString()}</span>
                          <span style={{ textAlign:"right", fontFamily:"monospace" }}>{h.cs}{fmt(l.cost)}</span>
                          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                            <button onClick={()=>{ setEditLotKey(key); setEditForm({ shares:String(l.shares), cost:String(l.cost), date:l.date||"" }); }}
                              style={{ fontSize:11, color:C.accent, background:"transparent", border:"none", cursor:"pointer" }}>編輯</button>
                            <button onClick={()=>{ if(window.confirm(`確定刪除第${i+1}批？`)) deleteLot(h.symbol, l.id, i); }}
                              style={{ fontSize:11, color:C.faint, background:"transparent", border:"none", cursor:"pointer" }}>刪除</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </InnerBox>

          {/* 配息記錄 */}
          <div style={{ marginBottom:8 }}>
            <div onClick={()=>setShowDivSym(v=>v===h.symbol?null:h.symbol)}
              style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:C.surface2, borderRadius:8, cursor:"pointer", marginBottom:4 }}>
              <div style={{ fontSize:13, color:C.navy }}>
                💰 配息記錄
                {dividends[h.symbol]?.length > 0 && (
                  <span style={{ fontSize:11, color:C.muted, marginLeft:6 }}>
                    （共 {dividends[h.symbol].length} 筆 · 累計 NT${fmt(dividends[h.symbol].reduce((a,d)=>a+(d.total||0),0))}）
                  </span>
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {h.market==='TW' && user && (
                  <button onClick={e=>{ e.stopPropagation(); fetchFinMindDividends(h.symbol); }}
                    style={{ fontSize:11, color:C.accent, background:"transparent", border:`1px solid ${C.accent}44`, borderRadius:6, padding:"2px 8px", cursor:"pointer" }}>
                    自動匯入
                  </button>
                )}
                <span style={{ fontSize:12, color:C.muted }}>{showDivSym===h.symbol?"▲":"▼"}</span>
              </div>
            </div>

            {showDivSym===h.symbol && (
              <InnerBox>
                {dividends[h.symbol]?.length > 0 ? (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"100px 70px 60px 1fr 50px", gap:6, fontSize:11, color:C.faint, fontWeight:600, padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                      <span>除息日</span><span style={{textAlign:"right"}}>現金股利</span><span style={{textAlign:"right"}}>股數</span><span style={{textAlign:"right"}}>合計</span><span></span>
                    </div>
                    {dividends[h.symbol].map(d=>(
                      <div key={d.id} style={{ display:"grid", gridTemplateColumns:"100px 70px 60px 1fr 50px", gap:6, fontSize:12, color:C.muted, padding:"6px 0", borderBottom:`1px solid ${C.border}`, alignItems:"center" }}>
                        <span>{d.ex_date}</span>
                        <span style={{textAlign:"right"}}>{h.cs}{fmt(d.amount,2)}</span>
                        <span style={{textAlign:"right"}}>{d.shares||"—"}</span>
                        <span style={{textAlign:"right", fontFamily:"monospace"}}>{d.total ? `${h.cs}${fmt(d.total)}` : "—"}</span>
                        <button onClick={()=>deleteDividend(d.id, h.symbol)}
                          style={{ fontSize:11, color:C.faint, background:"transparent", border:"none", cursor:"pointer", textAlign:"right" }}>刪除</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:C.faint, padding:"8px 0" }}>尚無配息記錄</div>
                )}

                {showDivInput===h.symbol ? (
                  <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                      <input value={divForm.exDate} onChange={e=>setDivForm(f=>({...f,exDate:e.target.value}))}
                        type="date" placeholder="除息日" style={{ ...inputStyle, padding:"6px 10px", fontSize:12 }} />
                      <input value={divForm.cashDiv} onChange={e=>setDivForm(f=>({...f,cashDiv:e.target.value}))}
                        type="number" placeholder="現金股利/股" style={{ ...inputStyle, padding:"6px 10px", fontSize:12 }} />
                      <input value={divForm.shares} onChange={e=>setDivForm(f=>({...f,shares:e.target.value}))}
                        type="number" placeholder="持有股數" style={{ ...inputStyle, padding:"6px 10px", fontSize:12 }} />
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>addDividend(h.symbol, h.market)}
                        style={{ flex:1, padding:"6px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>新增</button>
                      <button onClick={()=>setShowDivInput(null)}
                        style={{ flex:1, padding:"6px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:12, cursor:"pointer" }}>取消</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={()=>setShowDivInput(h.symbol)}
                    style={{ fontSize:12, color:C.accent, background:"transparent", border:`1px dashed ${C.accent}66`, borderRadius:8, padding:"6px 12px", cursor:"pointer", width:"100%", marginTop:4 }}>
                    + 新增配息記錄
                  </button>
                )}
              </InnerBox>
            )}
          </div>

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
        <span className="desktop-notice">
          🕊️「股咕股」溫馨提示：本工具僅為個人開發之數據整合與指標分析統計，<br/>並非提供任何形式的投資買賣建議。市場有風險，投資需謹慎，盈虧請用戶自負。
        </span>
        <span className="mobile-notice">
          本工具僅供參考，不構成投資建議。<br/>市場有風險，盈虧請用戶自負。
        </span>
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
  const [tab,         setTab]       = useState("stock");
  const [showLogin,   setShowLogin] = useState(false);
  const [user,        setUser]      = useState(null);
  const [stockQuery,  setStockQuery] = useState(""); // 跨頁籤查詢
  const [stockMarket, setStockMarket] = useState(null); // 跨頁籤查詢市場
  const [rates, setRates] = useState({ USD:{ sell:32.5 }, JPY:{ sell:0.21 } });

  // 抓匯率（啟動時一次）
  useEffect(() => {
    fetch('/api/rate').then(r=>r.json()).then(d=>{ if(d.success) setRates(d.rates); }).catch(()=>{});
  }, []);

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
    { id:"watchlist", label:"⭐ 自選組合" },
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
        {tab==="stock"     && <StockPage initialQuery={stockQuery} initialMarket={stockMarket} rates={rates} onQueryUsed={()=>{ setStockQuery(""); setStockMarket(null); }} onAddWatchlist={async(stock)=>{
          if (!stock) return;
          const sym = stock.symbol; const market = stock.market || "TW"; const name = stock.name || sym;
          if (user) {
            const { data: existing } = await supabase.from("watchlist").select("id").eq("user_id", user.id).eq("symbol", sym).single();
            if (!existing) await supabase.from("watchlist").insert({ user_id: user.id, symbol: sym, market, name });
          } else {
            const saved = localStorage.getItem("gugugu_watchlist");
            const list = saved ? JSON.parse(saved) : [];
            if (!list.find(i=>i.symbol===sym)) { list.push({ symbol:sym, market, name }); localStorage.setItem("gugugu_watchlist", JSON.stringify(list)); }
          }
          alert(`已將 ${name}（${sym}）加入自選組合`);
        }} />}
        {tab==="screener"  && <ScreenerPage onSelectStock={(sym, mkt)=>{ setStockQuery(sym); setStockMarket(mkt||null); setTab("stock"); }} user={user} rates={rates} />}
        {tab==="watchlist" && <WatchlistPage user={user} rates={rates} onSelectStock={sym=>{ setStockQuery(sym); setTab("stock"); }} />}
        {tab==="portfolio" && <PortfolioPage user={user} rates={rates} />}
      </div>
    </div>
  );
}
