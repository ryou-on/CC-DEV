# build_preview.py — index.html を再生プレーヤー付きの1枚HTML（ロゴ埋め込み）にする
# 実行: python3 build_preview.py [出力先.html]   → Artifact など外部fetch不可の環境向け
import base64, pathlib, sys

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "preview.html"
src = (HERE / "index.html").read_text(encoding="utf-8")
js = src[src.index("<script>") + 8: src.index("// ブラウザで開いた場合")]
logo = "data:image/png;base64," + base64.b64encode((HERE / "logo-primary.png").read_bytes()).decode()
js = js.replace("src: 'logo-primary.png'", f"src: '{logo}'")
# Google Fonts の Noto Sans JP を読み込んでから描画開始
js = js.replace(
    "document.fonts ? document.fonts.ready : Promise.resolve(),",
    "document.fonts && document.fonts.load ? Promise.all([document.fonts.load('700 40px \"Noto Sans JP\"', 'あアA漢'), document.fonts.load('900 40px \"Noto Sans JP\"', 'あアA漢')]).catch(() => {}) : Promise.resolve(),",
)

CHAPTERS = [("イントロ", 0), ("01 AIフィードバック", 6), ("02 テキスト読み上げ", 20), ("03 翻訳コピー", 34),
            ("04 インタラクショングループ", 48), ("05 サムネイル管理", 62), ("まとめ", 76)]
chapters_js = "[" + ",".join(f"['{n}',{s}]" for n, s in CHAPTERS) + "]"

html = '''<title>hihaho 2026年9月アップデート</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;900&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
  /* レイアウト: 16:9のプレーヤー1枚を中央に置き、下に操作バーとチャプター一覧 */
  :root { --bg:#f1f5f7; --fg:#0b2230; --muted:#5b6d78; --line:#d3dde3; --panel:#ffffff; --brand:#043348; --brand-ink:#ffffff; --accent:#fb1a7c;
          --font-ui:"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif; --font-mono:"IBM Plex Mono",ui-monospace,monospace; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0a1a23; --fg:#e6eff4; --muted:#8ea3af; --line:#20343f; --panel:#102530; --brand:#2ed6e3; --brand-ink:#04222a; --accent:#ff4d9a; color-scheme:dark } }
  :root[data-theme="dark"] { --bg:#0a1a23; --fg:#e6eff4; --muted:#8ea3af; --line:#20343f; --panel:#102530; --brand:#2ed6e3; --brand-ink:#04222a; --accent:#ff4d9a; color-scheme:dark }
  body { background:var(--bg); color:var(--fg); font-family:var(--font-ui); padding-inline:16px; padding-block:24px; }
  .wrap { max-width:960px; margin-inline:auto; display:flex; flex-direction:column; gap:16px; }
  h1 { font-size:1.25rem; margin:0; font-weight:900; text-wrap:balance; }
  .sub { color:var(--muted); font-size:.85rem; margin:4px 0 0; }
  .stage { position:relative; aspect-ratio:16/9; max-width:100%; background:#f6f8fa; border-radius:6px; overflow:hidden; border:1px solid var(--line); cursor:pointer; }
  canvas { width:100%; height:100%; display:block; }
  .bar { display:flex; align-items:center; gap:12px; background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:10px 12px; }
  button { font:inherit; background:var(--brand); color:var(--brand-ink); border:0; border-radius:4px; padding:8px 14px; font-weight:700; cursor:pointer; min-width:84px; }
  button:focus-visible, input:focus-visible { outline:2px solid var(--fg); outline-offset:2px; }
  input[type=range] { flex:1; min-width:0; accent-color:var(--accent); }
  .time { font-family:var(--font-mono); font-size:.85rem; color:var(--muted); font-variant-numeric:tabular-nums; white-space:nowrap; }
  .scenes { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:8px; }
  .scenes button { background:var(--panel); color:var(--fg); border:1px solid var(--line); text-align:left; font-weight:500; padding:10px 12px; display:flex; flex-direction:column; gap:2px; }
  .scenes button small { font-family:var(--font-mono); color:var(--muted); font-size:.75rem; }
  .scenes button.on { border-color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent); }
  .note { color:var(--muted); font-size:.8rem; margin:0; }
</style>
<div class="wrap">
  <div>
    <h1>hihaho 2026年9月アップデート</h1>
    <p class="sub">新機能5つを文字中心でまとめた84秒のモーショングラフィック / 1920×1080 / 音声なし</p>
  </div>
  <div class="stage" id="stage"><canvas id="c" width="1920" height="1080" aria-label="hihaho 9月アップデートのプレビュー"></canvas></div>
  <div class="bar">
    <button id="play" type="button">一時停止</button>
    <input id="seek" type="range" min="0" max="84" step="0.01" value="0" aria-label="再生位置">
    <span class="time" id="time">0.0 / 84.0s</span>
  </div>
  <div class="scenes" id="scenes"></div>
  <p class="note">出典は hihaho 公式ブログ「Product Update September 2026」（2026年9月29日）。日本語の文言は原文をもとにした要約です。画面クリックでも再生・一時停止できます。</p>
</div>
<script>
''' + js + '''
/* ---------- プレーヤー（自前の時計で再生。seek(t) は純粋関数のまま） ---------- */
const SCENES = ''' + chapters_js + ''';
let cur = 0, playing = true, last = null;
const $ = id => document.getElementById(id);
SCENES.forEach(([name, start], i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'scene' + i;
  b.innerHTML = name + '<small>' + Math.floor(start / 60) + ':' + String(start % 60).padStart(2, '0') + '〜</small>';
  b.onclick = () => { cur = start; playing = true; render(); };
  $('scenes').appendChild(b);
});
function render() {
  window.seek(cur);
  $('seek').value = cur;
  $('time').textContent = cur.toFixed(1) + ' / 84.0s';
  $('play').textContent = playing ? '一時停止' : '再生';
  SCENES.forEach(([, s], i) => {
    const next = i + 1 < SCENES.length ? SCENES[i + 1][1] : 999;
    $('scene' + i).classList.toggle('on', cur >= s && cur < next);
  });
}
function tick(now) {
  if (playing) {
    if (last !== null) cur += (now - last) / 1000;
    if (cur >= DURATION) cur = 0;
    render();
  }
  last = now;
  requestAnimationFrame(tick);
}
const toggle = () => { playing = !playing; render(); };
$('play').onclick = toggle;
$('stage').onclick = toggle;
$('seek').oninput = e => { cur = parseFloat(e.target.value); playing = false; render(); };
window.READY.then(() => { render(); requestAnimationFrame(tick); });
</script>
'''
OUT.write_text(html, encoding="utf-8")
print("生成:", OUT, f"{len(html) // 1024}KB")
