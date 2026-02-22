import { useState, useRef, useCallback, useEffect } from "react";

const TYPES = [
  { type: "quiz", icon: "❓", label: "クイズ", desc: "選択式クイズ" },
  { type: "cta_button", icon: "🔗", label: "CTAボタン", desc: "リンク付きボタン" },
  { type: "branch", icon: "🔀", label: "分岐", desc: "2択ジャンプ" },
  { type: "poll", icon: "📊", label: "投票", desc: "アンケート" },
  { type: "hotspot", icon: "👆", label: "ホットスポット", desc: "クリック領域" },
  { type: "text_overlay", icon: "💬", label: "テキスト", desc: "オーバーレイ表示" },
];
const DEFAULTS = {
  quiz: { question: "ここにクイズの質問を入力", choices: [{ id: "a", text: "選択肢A", is_correct: true }, { id: "b", text: "選択肢B", is_correct: false }, { id: "c", text: "選択肢C", is_correct: false }], feedback: { correct: "正解！🎉", incorrect: "残念…もう一度！" } },
  cta_button: { label: "今すぐ申し込む", url: "https://example.com" },
  branch: { question: "どちらに興味がありますか？", options: [{ id: "opt_a", text: "オプションA", jump_to_sec: 30 }, { id: "opt_b", text: "オプションB", jump_to_sec: 60 }] },
  poll: { question: "この動画は役に立ちましたか？", choices: [{ id: "p1", text: "とても役立った" }, { id: "p2", text: "まあまあ" }, { id: "p3", text: "あまり役立たなかった" }], show_results: true },
  hotspot: { regions: [{ id: "hs_1", shape: "rect", coords: { x: 35, y: 35, width: 30, height: 30 }, action: { type: "url", value: "https://example.com" }, tooltip: "詳細はこちら" }] },
  text_overlay: { text: "💡 ポイント：ここが重要です", duration_sec: 5 },
};

function getYtId(input) {
  if (!input) return null;
  var c = input.replace(/<[^>]*>/g, " ").trim();
  var u = (c.match(/https?:\/\/[^\s"'<>]+/) || [])[0] || c;
  u = u.replace(/["'].*$/, "");
  var m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function fmt(s) { return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }
function dlf(t, n) { try { var b = new Blob([t], { type: "application/json" }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = n; document.body.appendChild(a); a.click(); setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(u); }, 200); } catch {} }
function cpx(t, cb) { try { navigator.clipboard.writeText(t).then(cb); } catch { window.prompt("コピー:", t.substring(0, 500)); } }
function ytPost(iframe, func) { if (!iframe || !iframe.contentWindow) return; try { iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: func, args: [] }), "*"); } catch {} }

var CSS = `@keyframes fadeIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`;

/* ─── Interaction Overlay ─── */
function InteractionOverlay({ interaction, onDismiss }) {
  const [ans, setAns] = useState(null);
  const [pv, setPv] = useState(null);
  useEffect(function () { setAns(null); setPv(null); }, [interaction]);
  if (!interaction) return null;
  var t = interaction.type, c = interaction.content;
  var done = function () { setAns(null); setPv(null); onDismiss(); };
  var qa = function (ch) { setAns(ch.is_correct ? "y" : "n"); setTimeout(done, 2200); };
  var vote = function (id) { var v = {}; c.choices.forEach(function (ch) { v[ch.id] = Math.floor(Math.random() * 40) + 5; }); v[id] += 20; setPv(v); setTimeout(done, 3000); };
  var G = { position: "absolute", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(8,8,24,0.92)", backdropFilter: "blur(8px)", animation: "fadeIn 0.3s ease" };

  if (t === "quiz") return (<div style={G}><div style={{ maxWidth: 480, width: "85%", textAlign: "center" }}>
    <div style={{ fontSize: 11, color: "#7c6cf0", fontWeight: 700, marginBottom: 8 }}>❓ クイズ</div>
    <p style={{ fontSize: 19, fontWeight: 700, color: "#fff", margin: "0 0 20px" }}>{c.question}</p>
    {!ans ? c.choices.map(function (ch) { return <button key={ch.id} onClick={function () { qa(ch); }} style={OB}>{ch.text}</button>; }) : (
      <div style={{ padding: 18, borderRadius: 12, background: ans === "y" ? "rgba(80,200,120,0.12)" : "rgba(255,70,70,0.12)", border: "2px solid " + (ans === "y" ? "#50c878" : "#ff4444"), color: ans === "y" ? "#50c878" : "#ff4444", fontSize: 17, fontWeight: 700 }}>
        {ans === "y" ? c.feedback.correct : c.feedback.incorrect}</div>)}</div></div>);
  if (t === "cta_button") return (<div style={G}><button onClick={done} style={{ padding: "16px 48px", borderRadius: 14, border: "none", fontSize: 17, fontWeight: 700, background: "linear-gradient(135deg,#7c6cf0,#e06caa)", color: "#fff", cursor: "pointer", boxShadow: "0 4px 24px rgba(124,108,240,0.5)" }}>{c.label}</button></div>);
  if (t === "branch") return (<div style={G}><div style={{ maxWidth: 480, width: "85%", textAlign: "center" }}>
    <div style={{ fontSize: 11, color: "#e06caa", fontWeight: 700, marginBottom: 8 }}>🔀 分岐</div>
    <p style={{ fontSize: 19, fontWeight: 700, color: "#fff", margin: "0 0 20px" }}>{c.question}</p>
    {c.options.map(function (o) { return <button key={o.id} onClick={done} style={OB}>{o.text}<span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>→ {fmt(o.jump_to_sec)}</span></button>; })}</div></div>);
  if (t === "poll") {
    var tot = pv ? Object.values(pv).reduce(function (a, b) { return a + b; }, 0) : 0;
    return (<div style={G}><div style={{ maxWidth: 480, width: "85%", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#50c878", fontWeight: 700, marginBottom: 8 }}>📊 投票</div>
      <p style={{ fontSize: 19, fontWeight: 700, color: "#fff", margin: "0 0 20px" }}>{c.question}</p>
      {!pv ? c.choices.map(function (ch) { return <button key={ch.id} onClick={function () { vote(ch.id); }} style={OB}>{ch.text}</button>; }) : c.choices.map(function (ch) {
        var p = tot > 0 ? Math.round((pv[ch.id] / tot) * 100) : 0;
        return (<div key={ch.id} style={{ marginBottom: 10, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#e0e0ff", marginBottom: 3 }}><span>{ch.text}</span><span style={{ color: "#7c6cf0", fontWeight: 700 }}>{p}%</span></div>
          <div style={{ height: 8, borderRadius: 4, background: "#1a1a3a", overflow: "hidden" }}><div style={{ width: p + "%", height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#7c6cf0,#e06caa)", transition: "width 0.8s" }} /></div>
        </div>);
      })}</div></div>);
  }
  if (t === "text_overlay") return (<div style={{ position: "absolute", bottom: "14%", left: "50%", transform: "translateX(-50%)", zIndex: 50, background: "rgba(8,8,24,0.9)", backdropFilter: "blur(6px)", padding: "16px 32px", borderRadius: 14, border: "1px solid #3a3a6a", color: "#fff", fontSize: 18, fontWeight: 600, boxShadow: "0 6px 30px rgba(0,0,0,0.5)", animation: "fadeIn 0.3s ease" }}>{c.text}</div>);
  if (t === "hotspot") { var r = c.regions[0]; return (<div onClick={done} style={{ position: "absolute", left: r.coords.x + "%", top: r.coords.y + "%", width: r.coords.width + "%", height: r.coords.height + "%", zIndex: 50, border: "3px dashed #7c6cf0", borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(124,108,240,0.18)", animation: "fadeIn 0.3s ease" }}><span style={{ background: "#7c6cf0", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}>{r.tooltip}</span></div>); }
  return null;
}

/* ─── Preview ─── */
function PreviewScreen({ data, onBack }) {
  var vid = getYtId(data.videoUrl);
  var interaction = data.interaction;
  var triggerTime = data.triggerTime || 30;
  var pauseVideo = data.pauseVideo !== false;
  var videoDuration = data.videoDuration || 180;
  var meta = interaction ? TYPES.find(function (x) { return x.type === interaction.type; }) : null;
  const iframeRef = useRef(null);
  const [showOL, setShowOL] = useState(false);
  const [fired, setFired] = useState(false);
  const [ct, setCt] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const startRef = useRef(0);
  const offsetRef = useRef(0);
  var stopTimer = function () { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  var startTimer = function () { stopTimer(); startRef.current = Date.now(); timerRef.current = setInterval(function () { var el = offsetRef.current + (Date.now() - startRef.current) / 1000; if (el >= videoDuration) { el = videoDuration; stopTimer(); } setCt(el); }, 200); };
  useEffect(function () { offsetRef.current = 0; startTimer(); return stopTimer; }, []);
  useEffect(function () { if (interaction && !fired && ct >= triggerTime) { setFired(true); setShowOL(true); if (pauseVideo) { ytPost(iframeRef.current, "pauseVideo"); offsetRef.current = ct; stopTimer(); setPaused(true); } } }, [ct, triggerTime, interaction, fired, pauseVideo]);
  var dismissOL = function () { setShowOL(false); if (paused) { ytPost(iframeRef.current, "playVideo"); setPaused(false); startTimer(); } };
  var pPct = videoDuration > 0 ? Math.min((ct / videoDuration) * 100, 100) : 0;
  var mPct = videoDuration > 0 ? (triggerTime / videoDuration) * 100 : 0;
  var iframeSrc = vid ? "https://www.youtube.com/embed/" + vid + "?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1&origin=" + encodeURIComponent(window.location.origin) : "";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#08081a", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "'DM Sans','Noto Sans JP',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{CSS}</style>
      <header style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a3a", background: "#0c0c20", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onBack && <button onClick={onBack} style={{ background: "#1a1a3a", border: "1px solid #2a2a5a", borderRadius: 8, padding: "6px 14px", color: "#e0e0ff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>← 編集に戻る</button>}
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#7c6cf0,#e06caa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>1+</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#e0e0ff" }}>{data.videoTitle || "プレビュー"}</span>
        </div>
        {meta && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", background: "#1a1a3a", padding: "5px 12px", borderRadius: 8, border: "1px solid #2a2a5a" }}>{meta.icon} {meta.label} <span style={{ color: "#7c6cf0", fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>@ {fmt(triggerTime)}</span></div>}
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 960, aspectRatio: "16/9", borderRadius: 16, position: "relative", background: "#000", boxShadow: "0 8px 60px rgba(0,0,0,0.6)", border: "1px solid #2a2a4a", overflow: "hidden" }}>
          {vid ? <iframe ref={iframeRef} src={iframeSrc} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", zIndex: 1 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <div style={{ position: "absolute", inset: 0, background: "#0a0a2a", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 56, opacity: 0.3 }}>🎥</div></div>}
          {showOL && <InteractionOverlay interaction={interaction} onDismiss={dismissOL} />}
        </div>
      </div>
      <div style={{ padding: "10px 24px 14px", borderTop: "1px solid #1a1a3a", background: "#0c0c20", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#7c6cf0", fontWeight: 600 }}>{fmt(ct)}<span style={{ color: "#555" }}> / {fmt(videoDuration)}</span></span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: showOL ? "#e06caa" : fired ? "#50c878" : "#555", fontWeight: showOL || fired ? 600 : 400 }}>
            {showOL ? (paused ? "⏸ 動画一時停止中" : "🟣 インタラクション表示中") : fired ? "✓ 発火済み" : ""}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "#1a1a3a", position: "relative" }}>
          <div style={{ width: pPct + "%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#7c6cf0,#e06caa)", transition: "width 0.2s linear" }} />
          {interaction && <div style={{ position: "absolute", left: mPct + "%", top: -5, width: 16, height: 16, borderRadius: "50%", transform: "translateX(-50%)", background: showOL ? "#e06caa" : fired ? "#50c878" : "#7c6cf0", border: "2px solid #0c0c20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, transition: "all 0.3s" }}>{meta ? meta.icon : ""}</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Card ─── */
function Card({ type, icon, label, desc, isActive }) {
  return (
    <div draggable onDragStart={function (e) { e.dataTransfer.setData("itype", type); e.dataTransfer.effectAllowed = "copy"; }}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: isActive ? "#252550" : "#1e1e3a", border: isActive ? "2px solid #7c6cf0" : "1px solid #3a3a6a", cursor: "grab", transition: "all 0.2s", userSelect: "none" }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13, color: "#e0e0ff" }}>{label}</div><div style={{ fontSize: 11, color: "#777", marginTop: 1 }}>{desc}</div></div>
      {isActive && <span style={{ fontSize: 9, color: "#7c6cf0", fontWeight: 700, background: "#7c6cf020", padding: "2px 6px", borderRadius: 6 }}>ON</span>}
    </div>
  );
}

/* ─── Editors ─── */
function QuizEd({ content: c, onChange }) {
  var u = function (k, v) { onChange({ ...c, [k]: v }); };
  var uc = function (i, k, v) { var ch = c.choices.map(function (x) { return { ...x }; }); ch[i][k] = v; if (k === "is_correct" && v) ch.forEach(function (x, j) { if (j !== i) x.is_correct = false; }); u("choices", ch); };
  return (<div style={eC}><label style={Lb}>質問文</label><input style={Ip} value={c.question} onChange={function (e) { u("question", e.target.value); }} /><label style={Lb}>選択肢</label>{c.choices.map(function (ch, i) { return <div key={ch.id} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={ch.is_correct} onChange={function () { uc(i, "is_correct", true); }} style={{ accentColor: "#7c6cf0" }} /><input style={{ ...Ip, flex: 1 }} value={ch.text} onChange={function (e) { uc(i, "text", e.target.value); }} /></div>; })}<label style={Lb}>正解FB</label><input style={Ip} value={c.feedback.correct} onChange={function (e) { u("feedback", { ...c.feedback, correct: e.target.value }); }} /><label style={Lb}>不正解FB</label><input style={Ip} value={c.feedback.incorrect} onChange={function (e) { u("feedback", { ...c.feedback, incorrect: e.target.value }); }} /></div>);
}
function CTAEd({ content: c, onChange }) { return (<div style={eC}><label style={Lb}>ラベル</label><input style={Ip} value={c.label} onChange={function (e) { onChange({ ...c, label: e.target.value }); }} /><label style={Lb}>URL</label><input style={Ip} value={c.url} onChange={function (e) { onChange({ ...c, url: e.target.value }); }} /></div>); }
function BranchEd({ content: c, onChange }) { return (<div style={eC}><label style={Lb}>質問</label><input style={Ip} value={c.question} onChange={function (e) { onChange({ ...c, question: e.target.value }); }} />{c.options.map(function (o, i) { return <div key={o.id} style={{ display: "flex", gap: 6 }}><input style={{ ...Ip, flex: 1 }} value={o.text} onChange={function (e) { var ops = c.options.map(function (x) { return { ...x }; }); ops[i].text = e.target.value; onChange({ ...c, options: ops }); }} /><input style={{ ...Ip, width: 60 }} type="number" value={o.jump_to_sec} onChange={function (e) { var ops = c.options.map(function (x) { return { ...x }; }); ops[i].jump_to_sec = Number(e.target.value); onChange({ ...c, options: ops }); }} /><span style={{ color: "#777", fontSize: 11, alignSelf: "center" }}>秒</span></div>; })}</div>); }
function PollEd({ content: c, onChange }) { return (<div style={eC}><label style={Lb}>質問</label><input style={Ip} value={c.question} onChange={function (e) { onChange({ ...c, question: e.target.value }); }} />{c.choices.map(function (ch, i) { return <input key={ch.id} style={Ip} value={ch.text} onChange={function (e) { var chs = c.choices.map(function (x) { return { ...x }; }); chs[i].text = e.target.value; onChange({ ...c, choices: chs }); }} />; })}</div>); }
function TextEd({ content: c, onChange }) { return (<div style={eC}><label style={Lb}>テキスト</label><textarea style={{ ...Ip, minHeight: 60, resize: "vertical" }} value={c.text} onChange={function (e) { onChange({ ...c, text: e.target.value }); }} /><label style={Lb}>表示秒数</label><input style={Ip} type="number" value={c.duration_sec} onChange={function (e) { onChange({ ...c, duration_sec: Number(e.target.value) }); }} /></div>); }
function HotEd({ content: c, onChange }) { var r = c.regions[0]; return (<div style={eC}><label style={Lb}>ツールチップ</label><input style={Ip} value={r.tooltip} onChange={function (e) { onChange({ ...c, regions: [{ ...r, tooltip: e.target.value }] }); }} /><label style={Lb}>URL</label><input style={Ip} value={r.action.value} onChange={function (e) { onChange({ ...c, regions: [{ ...r, action: { ...r.action, value: e.target.value } }] }); }} /></div>); }
var EDS = { quiz: QuizEd, cta_button: CTAEd, branch: BranchEd, poll: PollEd, hotspot: HotEd, text_overlay: TextEd };

/* ═══ MAIN ═══ */
export default function App() {
  const [videoUrl, setVideoUrl] = useState("");
  const [inter, setInter] = useState(null);
  const [trigTime, setTrigTime] = useState(30);
  const [pauseVid, setPauseVid] = useState(true);
  const [dur, setDur] = useState(180);
  const [dropHL, setDropHL] = useState(false);
  const [tlDrop, setTlDrop] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [title, setTitle] = useState("マイ動画プロジェクト");
  const [mode, setMode] = useState("editor");
  const [copied, setCopied] = useState(false);
  const tlRef = useRef(null);
  var vid = getYtId(videoUrl);

  var handleDrop = useCallback(function (e, fromTl) {
    e.preventDefault(); setDropHL(false); setTlDrop(false);
    var type = e.dataTransfer.getData("itype"); if (!type) return;
    if (fromTl && tlRef.current) { var r = tlRef.current.getBoundingClientRect(); setTrigTime(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur)); }
    setInter({ type: type, content: JSON.parse(JSON.stringify(DEFAULTS[type])) });
  }, [dur]);

  // JSON config (プレイヤー互換形式)
  var configJson = function () {
    return { videoUrl: videoUrl, videoTitle: title, videoDuration: dur, triggerTime: trigTime, pauseVideo: pauseVid, interaction: inter };
  };
  // ファイル名 (タイトルからslug生成)
  var slug = function () { return (title || "config").replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, "-").replace(/-+/g, "-").substring(0, 30); };

  var meta = inter ? TYPES.find(function (x) { return x.type === inter.type; }) : null;
  var Ed = inter ? EDS[inter.type] : null;

  if (mode === "preview") return <PreviewScreen data={configJson()} onBack={function () { setMode("editor"); }} />;

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c1d", color: "#e0e0ff", fontFamily: "'DM Sans','Noto Sans JP',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{CSS}</style>

      <header style={{ padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a3a", background: "#0e0e22" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#7c6cf0,#e06caa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>1+</div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>ワン＋インタラクション</span>
          <span style={{ fontSize: 10, background: "#7c6cf020", color: "#7c6cf0", padding: "2px 8px", borderRadius: 20, fontWeight: 600, border: "1px solid #7c6cf040" }}>FREE</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {inter && (<>
            <button onClick={function () { setMode("preview"); }} style={{ ...HB, background: "linear-gradient(135deg,#7c6cf0,#e06caa)", color: "#fff", border: "none" }}>▶ プレビュー</button>
            <button onClick={function () { setShowExp(true); }} style={HB}>📦 共有 / JSON出力</button>
          </>)}
        </div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 57px)" }}>
        {/* Left */}
        <aside style={{ width: 220, padding: 16, borderRight: "1px solid #1a1a3a", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", background: "#0e0e22" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", marginBottom: 4 }}>インタラクション</div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>ドラッグで追加・入れ替え →</div>
          {TYPES.map(function (t) { return <Card key={t.type} type={t.type} icon={t.icon} label={t.label} desc={t.desc} isActive={inter && inter.type === t.type} />; })}
          {inter && <button onClick={function () { setInter(null); }} style={{ marginTop: 12, padding: "8px", border: "1px solid #ff4466", background: "transparent", color: "#ff4466", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🗑 クリア</button>}
          <div style={{ flex: 1 }} />
          <div style={{ padding: 12, borderRadius: 10, border: "1px solid #2a2a4a", fontSize: 11, color: "#999" }}>💡 別カードをドロップで入れ替え</div>
        </aside>

        {/* Center */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #1a1a3a", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "#777", fontSize: 12 }}>🎬</span>
            <input style={{ flex: 1, ...UI }} placeholder="YouTube URL（埋め込みコードもOK）" value={videoUrl} onChange={function (e) { setVideoUrl(e.target.value); }} />
            {vid && <span style={{ fontSize: 11, color: "#50c878", flexShrink: 0, fontFamily: "'JetBrains Mono'" }}>✓ {vid}</span>}
            <input style={{ width: 170, ...UI }} placeholder="プロジェクト名" value={title} onChange={function (e) { setTitle(e.target.value); }} />
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onDragOver={function (e) { e.preventDefault(); setDropHL(true); }} onDragLeave={function () { setDropHL(false); }}
            onDrop={function (e) { handleDrop(e, false); }}>
            <div style={{ width: "100%", maxWidth: 800, aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", position: "relative", border: dropHL ? "3px dashed #7c6cf0" : "1px solid #2a2a4a", background: "#0a0a1a", boxShadow: dropHL ? "0 0 40px rgba(124,108,240,0.3)" : "0 4px 30px rgba(0,0,0,0.4)", transition: "all 0.3s" }}>
              {vid ? <iframe src={"https://www.youtube.com/embed/" + vid + "?rel=0&modestbranding=1&enablejsapi=1"} style={{ width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : (
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div style={{ fontSize: 48, opacity: 0.3 }}>🎥</div>
                  <div style={{ color: "#555", fontSize: 14 }}>YouTube URLを入力</div>
                </div>
              )}
              {dropHL && <div style={{ position: "absolute", inset: 0, background: "rgba(124,108,240,0.12)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}><div style={{ padding: "14px 28px", borderRadius: 12, background: "rgba(124,108,240,0.9)", color: "#fff", fontWeight: 700, fontSize: 15 }}>{inter ? "🔄 入れ替え" : "ここにドロップ"}</div></div>}
              {inter && <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(124,108,240,0.9)", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, color: "#fff", zIndex: 5 }}>{meta.icon} {meta.label} @ {fmt(trigTime)}</div>}
            </div>
          </div>
          {/* Timeline */}
          <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #1a1a3a" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#777", fontWeight: 600 }}>タイムライン</span>
              <input type="number" min={10} max={600} value={dur} onChange={function (e) { setDur(Math.max(10, Number(e.target.value))); }} style={{ width: 60, background: "#1a1a3a", border: "1px solid #2a2a5a", borderRadius: 6, padding: "3px 8px", color: "#e0e0ff", fontSize: 11, textAlign: "center" }} />
              <span style={{ fontSize: 11, color: "#555" }}>秒</span>
            </div>
            <div ref={tlRef} style={{ height: 48, background: tlDrop ? "#1a1a4a" : "#12122a", borderRadius: 10, position: "relative", cursor: "pointer", border: tlDrop ? "2px dashed #7c6cf0" : "1px solid #2a2a4a", overflow: "hidden" }}
              onDragOver={function (e) { e.preventDefault(); setTlDrop(true); }} onDragLeave={function () { setTlDrop(false); }}
              onDrop={function (e) { handleDrop(e, true); }}
              onClick={function (e) { if (!inter || !tlRef.current) return; var r = tlRef.current.getBoundingClientRect(); setTrigTime(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur)); }}>
              {Array.from({ length: Math.min(Math.floor(dur / 30) + 1, 20) }, function (_, i) { return i * 30; }).map(function (t) {
                return <div key={t} style={{ position: "absolute", left: ((t / dur) * 100) + "%", top: 0, bottom: 0, borderLeft: "1px solid #2a2a4a", display: "flex", alignItems: "flex-end", paddingLeft: 4, paddingBottom: 2 }}><span style={{ fontSize: 9, color: "#555" }}>{fmt(t)}</span></div>;
              })}
              {inter && <div draggable onDragStart={function (e) { e.dataTransfer.setData("itype", inter.type); e.dataTransfer.effectAllowed = "move"; }} style={{ position: "absolute", left: "calc(" + ((trigTime / dur) * 100) + "% - 16px)", top: 4, width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#7c6cf0,#e06caa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "grab", zIndex: 2, boxShadow: "0 2px 12px rgba(124,108,240,0.5)", transition: "left 0.15s ease" }}>{meta.icon}</div>}
              {!inter && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 12, pointerEvents: "none" }}>← ドラッグ＆ドロップ</div>}
            </div>
          </div>
        </main>

        {/* Right */}
        <aside style={{ width: 280, borderLeft: "1px solid #1a1a3a", overflowY: "auto", background: "#0e0e22" }}>
          {inter ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 12, borderBottom: "1px solid #1a1a3a" }}>
                <span style={{ fontSize: 20 }}>{meta.icon}</span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>{meta.label}</div><div style={{ fontSize: 11, color: "#777" }}>{meta.desc}</div></div>
              </div>
              <label style={Lb}>表示タイミング</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={0} max={dur} value={trigTime} onChange={function (e) { setTrigTime(Number(e.target.value)); }} style={{ flex: 1, accentColor: "#7c6cf0" }} />
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#7c6cf0", minWidth: 40 }}>{fmt(trigTime)}</span>
              </div>
              <label style={{ ...Lb, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={pauseVid} onChange={function (e) { setPauseVid(e.target.checked); }} style={{ accentColor: "#7c6cf0" }} /> 動画を一時停止
              </label>
              <div style={{ borderTop: "1px solid #1a1a3a", paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#777", marginBottom: 10, textTransform: "uppercase" }}>コンテンツ設定</div>
                {Ed && <Ed content={inter.content} onChange={function (nc) { setInter({ ...inter, content: nc }); }} />}
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", gap: 12 }}>
              <div style={{ fontSize: 40, opacity: 0.3 }}>✨</div>
              <div style={{ color: "#555", fontSize: 13 }}>左からドラッグ＆ドロップ</div>
            </div>
          )}
        </aside>
      </div>

      {/* Export / Share Modal */}
      {showExp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={function () { setShowExp(false); }}>
          <div onClick={function (e) { e.stopPropagation(); }} style={{ background: "#14142a", border: "1px solid #2a2a5a", borderRadius: 16, padding: 24, width: "90%", maxWidth: 600, maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>📦 共有 / JSON出力</span>
              <button onClick={function () { setShowExp(false); }} style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            {/* 使い方ガイド */}
            <div style={{ padding: 14, borderRadius: 10, background: "#0a0a1a", border: "1px solid #2a2a4a", fontSize: 12, color: "#aaa" }}>
              <div style={{ fontWeight: 700, color: "#e0e0ff", marginBottom: 8, fontSize: 13 }}>🚀 デプロイ手順</div>
              <div style={{ lineHeight: 1.8 }}>
                ① 下のJSONを <code style={{ background: "#1a1a3a", padding: "2px 6px", borderRadius: 4, color: "#7c6cf0" }}>configs/{slug()}.json</code> として保存<br/>
                ② CC-DEVの <code style={{ background: "#1a1a3a", padding: "2px 6px", borderRadius: 4, color: "#7c6cf0" }}>public/oneplus/configs/</code> に配置<br/>
                ③ 共有URL:
              </div>
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "#1a1a3a", fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#a0a0ff", wordBreak: "break-all" }}>
                cc-dev-ps7.web.app/oneplus/?config=configs/{slug()}.json
              </div>
            </div>

            {/* JSON */}
            <pre style={{ flex: 1, overflowY: "auto", background: "#0a0a1a", padding: 16, borderRadius: 10, fontSize: 11, fontFamily: "'JetBrains Mono'", color: "#a0a0ff", border: "1px solid #2a2a4a", whiteSpace: "pre-wrap", margin: 0, maxHeight: 260 }}>{JSON.stringify(configJson(), null, 2)}</pre>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function () { cpx(JSON.stringify(configJson(), null, 2), function () { setCopied(true); setTimeout(function () { setCopied(false); }, 2000); }); }} style={{ ...HB, flex: 1, fontSize: 13, background: copied ? "#50c878" : "#1a1a3a", color: copied ? "#fff" : "#e0e0ff" }}>{copied ? "✅ コピー済み" : "📋 JSONコピー"}</button>
              <button onClick={function () { dlf(JSON.stringify(configJson(), null, 2), slug() + ".json"); }} style={{ ...HB, flex: 1, background: "#7c6cf0", color: "#fff", border: "1px solid #7c6cf0", fontSize: 13 }}>💾 JSONダウンロード</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

var Lb = { fontSize: 11, fontWeight: 600, color: "#888" };
var Ip = { background: "#1a1a3a", border: "1px solid #2a2a5a", borderRadius: 8, padding: "8px 10px", color: "#e0e0ff", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
var UI = { background: "#1a1a3a", border: "1px solid #2a2a5a", borderRadius: 8, padding: "8px 12px", color: "#e0e0ff", fontSize: 13, outline: "none" };
var HB = { padding: "6px 14px", borderRadius: 8, border: "1px solid #3a3a6a", background: "#1a1a3a", color: "#e0e0ff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
var OB = { display: "block", width: "100%", padding: "14px 20px", marginBottom: 10, borderRadius: 12, border: "1px solid #3a3a6a", background: "#1a1a3a", color: "#e0e0ff", fontSize: 15, cursor: "pointer", textAlign: "left" };
var eC = { display: "flex", flexDirection: "column", gap: 10 };
