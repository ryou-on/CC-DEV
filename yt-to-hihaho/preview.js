/* ─────────────────────────────────────────
   YT → hihaho Tab  /  preview.js（sandbox page）
   editor.html から postMessage で受け取ったタブHTMLを
   1920×1080 の実寸iframeに書き込み、ウィンドウに合わせて縮小表示する。
   sandbox指定によりインラインscript（タブの開閉JS）が動作する。
   ───────────────────────────────────────── */

const stage = document.getElementById('stage');
const frame = document.getElementById('frame');
const bg = document.getElementById('bg');

function fit() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080) * 0.97;
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fit);
fit();

window.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'render') return;
  if (d.videoId) {
    bg.src = `https://i.ytimg.com/vi/${d.videoId}/maxresdefault.jpg`;
    bg.hidden = false;
  }
  // srcdoc なら opaque origin でも確実に描画できる（sandbox CSPの unsafe-inline でタブ内JSも動作）
  frame.srcdoc = d.html || '';
});

// 準備完了を親（editor）へ通知 → 初回レンダリングを受け取る
window.parent.postMessage({ type: 'preview-ready' }, '*');
