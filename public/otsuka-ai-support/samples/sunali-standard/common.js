// ベンガルビストロ スナリ（スタンダード）共通スクリプト

// ページフェードイン
document.body.classList.add('ready');

// ヘッダー（スクロール状態）+ ヒーローパララックス
const hd = document.getElementById('hd');
const heroBg = document.getElementById('heroBg');
addEventListener('scroll', () => {
  const y = scrollY;
  hd.classList.toggle('scrolled', y > 60);
  if (heroBg && y < innerHeight) heroBg.style.transform = `translateY(${y * .18}px) scale(${1 + y * .0001})`;
}, { passive: true });

// スクロールリビール
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: .18 });
document.querySelectorAll('.rv').forEach(el => io.observe(el));

// 数字カウントアップ
const cio = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const target = Number(e.target.dataset.count);
    const unit = e.target.querySelector('small').outerHTML;
    const t0 = performance.now();
    (function tick(t) {
      const p = Math.min((t - t0) / 1600, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      e.target.innerHTML = Math.round(target * eased) + unit;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  });
}, { threshold: .6 });
document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));
