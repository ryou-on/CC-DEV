# build_preview.py — 完成した MP4（BGM・効果音つき）を再生する確認用ページ preview.html を作る（日英切替・章ジャンプ）
# 実行: python3 build_preview.py [出力先.html]
# preview.html は同じフォルダの hihaho-intro-{ja,en}.mp4 を相対パスで読み込む。Artifact では files で MP4 を一緒に公開する。
import pathlib, sys

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "preview.html"

html = '''<title>What is hihaho? / hihahoとは？</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;900&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
  /* レイアウト: 言語切替 → 16:9の動画 → 章ジャンプ一覧 */
  :root { --bg:#f1f5f7; --fg:#0b2230; --muted:#5b6d78; --line:#d3dde3; --panel:#ffffff; --brand:#043348; --brand-ink:#ffffff; --accent:#fb1a7c;
          --font-ui:"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif; --font-mono:"IBM Plex Mono",ui-monospace,monospace; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0a1a23; --fg:#e6eff4; --muted:#8ea3af; --line:#20343f; --panel:#102530; --brand:#2ed6e3; --brand-ink:#04222a; --accent:#ff4d9a; color-scheme:dark } }
  :root[data-theme="dark"] { --bg:#0a1a23; --fg:#e6eff4; --muted:#8ea3af; --line:#20343f; --panel:#102530; --brand:#2ed6e3; --brand-ink:#04222a; --accent:#ff4d9a; color-scheme:dark }
  body { background:var(--bg); color:var(--fg); font-family:var(--font-ui); padding-inline:16px; padding-block:24px; }
  .wrap { max-width:960px; margin-inline:auto; display:flex; flex-direction:column; gap:16px; }
  .head { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:12px; }
  h1 { font-size:1.25rem; margin:0; font-weight:900; text-wrap:balance; }
  .sub { color:var(--muted); font-size:.85rem; margin:4px 0 0; }
  .lang { display:flex; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
  button { font:inherit; background:var(--panel); color:var(--fg); border:0; padding:8px 14px; font-weight:500; cursor:pointer; }
  .lang button { min-width:96px; border-radius:0; }
  .lang button[aria-pressed="true"] { background:var(--brand); color:var(--brand-ink); font-weight:700; }
  button:focus-visible, video:focus-visible { outline:2px solid var(--fg); outline-offset:2px; }
  video { width:100%; aspect-ratio:16/9; background:#f6f8fa; border:1px solid var(--line); border-radius:6px; display:block; }
  .scenes { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:8px; }
  .scenes button { border:1px solid var(--line); text-align:left; padding:10px 12px; display:flex; flex-direction:column; gap:2px; border-radius:4px; }
  .scenes button small { font-family:var(--font-mono); color:var(--muted); font-size:.75rem; font-variant-numeric:tabular-nums; }
  .scenes button.on { border-color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent); }
  .note { color:var(--muted); font-size:.8rem; margin:0; }
</style>
<div class="wrap">
  <div class="head">
    <div>
      <h1 id="title"></h1>
      <p class="sub" id="sub"></p>
    </div>
    <div class="lang" role="group" aria-label="Language">
      <button id="lang-ja" type="button" aria-pressed="true">日本語</button>
      <button id="lang-en" type="button" aria-pressed="false">English</button>
    </div>
  </div>
  <video id="v" controls playsinline preload="metadata" src="hihaho-intro-ja.mp4"></video>
  <div class="scenes" id="scenes"></div>
  <p class="note" id="note"></p>
</div>
<script>
const UI = {
  ja: { title: 'hihahoとは？（ひはほとは）', sub: 'インタラクティブ動画プラットフォーム hihaho の概要を5つのポイントで解説する129秒の動画 / 1920×1080', file: 'hihaho-intro-ja.mp4',
        note: '音が出ます。再生ボタンを押すとBGMと効果音が流れます。出典は hihahoナレッジベース『サービス資料5.0』。導入社数などの数値は資料掲載時点のものです。',
        scenes: [['イントロ', 0], ['全体像', 6], ['1 触れる動画とは', 11], ['2 16種類の機能', 33], ['3 4ステップ', 55], ['4 使える場面', 77], ['5 日本での導入', 99], ['まとめ', 121]] },
  en: { title: 'What is hihaho? / hihahoとは？', sub: 'A 129-second explainer of the five highlights, with music and sound effects / 1920×1080', file: 'hihaho-intro-en.mp4',
        note: 'This video has sound. Press play to hear the music and sound effects. Source: hihaho service guide 5.0 (knowledge base). Figures are as of the guide.',
        scenes: [['Intro', 0], ['Overview', 6], ['1 Interactive video', 11], ['2 16 interactions', 33], ['3 Four steps', 55], ['4 Where it works', 77], ['5 In Japan', 99], ['Recap', 121]] },
};
let LANG = 'ja';
const $ = id => document.getElementById(id), v = $('v');
function buildScenes() {
  $('scenes').innerHTML = '';
  UI[LANG].scenes.forEach(([name, start], i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'scene' + i;
    b.innerHTML = name + '<small>' + Math.floor(start / 60) + ':' + String(start % 60).padStart(2, '0') + '</small>';
    b.onclick = () => { v.currentTime = start; v.play().catch(() => {}); };
    $('scenes').appendChild(b);
  });
}
function mark() {
  const sc = UI[LANG].scenes;
  sc.forEach(([, s], i) => {
    const next = i + 1 < sc.length ? sc[i + 1][1] : 1e9;
    $('scene' + i).classList.toggle('on', v.currentTime >= s && v.currentTime < next);
  });
}
function applyLang(l) {
  const t = v.currentTime, wasPlaying = !v.paused;
  LANG = l; document.documentElement.lang = l;
  $('title').textContent = UI[l].title; $('sub').textContent = UI[l].sub; $('note').textContent = UI[l].note;
  $('lang-ja').setAttribute('aria-pressed', l === 'ja'); $('lang-en').setAttribute('aria-pressed', l === 'en');
  if (!v.src.endsWith(UI[l].file)) {
    v.src = UI[l].file;
    v.addEventListener('loadedmetadata', () => { v.currentTime = t; if (wasPlaying) v.play().catch(() => {}); }, { once: true });
  }
  buildScenes(); mark();
}
v.addEventListener('timeupdate', mark);
$('lang-ja').onclick = () => applyLang('ja');
$('lang-en').onclick = () => applyLang('en');
applyLang('ja');
</script>
'''
OUT.write_text(html, encoding="utf-8")
print("生成:", OUT)
