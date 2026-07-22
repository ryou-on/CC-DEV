
let isRunning = false; let isPaused = false; let countdown = 0;
let currentTabId = null; let currentWindowId = null; let currentConfig = null; let currentCount = 0;
let savedCount = 0; // ストレージへ保存済みの枚数（画像はメモリに溜めず1枚ずつ保存する）

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start") {
    isRunning = true; isPaused = false; savedCount = 0;
    currentTabId = request.tabId; currentWindowId = request.windowId;
    currentConfig = request; currentCount = 0;
    startCaptureWorkflow();
  } else if (request.action === "stop") { isRunning = false; }
  else if (request.action === "getStatus") {
    sendResponse({ isRunning, isPaused, countdown, current: currentCount, total: currentConfig ? currentConfig.maxPages : 0 });
    return true;
  }
});

// dataURL を 32x32 グレースケール署名に変換（Service Worker では OffscreenCanvas を使用）
const SIG_W = 32, SIG_H = 32;
const DUP_DIFF = 3; // 1画素あたりの平均差分がこれ未満なら「同じページ」とみなす
async function getSignature(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const oc = new OffscreenCanvas(SIG_W, SIG_H);
  const ctx = oc.getContext('2d');
  ctx.drawImage(bmp, 0, 0, SIG_W, SIG_H);
  if (bmp.close) bmp.close();
  const d = ctx.getImageData(0, 0, SIG_W, SIG_H).data;
  const g = new Uint8Array(SIG_W * SIG_H);
  for (let i = 0; i < g.length; i++) {
    g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
  }
  return g;
}
function meanAbsDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// 撮影の瞬間だけページ送りボタン（›）を透明化する。
// 常時隠すとページ送りが効かなくなるため、キャプチャ直前ON→直後OFFで運用する。
async function setNavHidden(hidden) {
  // リーダーUI（上端の書名バー・下端のページ番号/進捗バー）も撮影の瞬間だけ透明化する。
  // 文章（リフロー）の本ではこれらが常時表示され、写り込むとページ枠検出がバラつく
  // （「読書速度を学習中…」は出たり消えたりする）。クラス名はリーダー更新で変わるため、
  // 「画面の上10%/下12%の帯に収まる小さめの要素」を位置ベースで特定して隠す。
  // 本文テキスト行の誤マークを防ぐため、トップフレーム以外では fixed/absolute のみ対象
  const inject = (allFrames) =>
    chrome.scripting.executeScript({
      target: { tabId: currentTabId, allFrames },
      args: [hidden],
      func: (h) => {
        const ID = 'capturer-hide-nav';
        const MARK = 'data-capturer-chrome';
        let st = document.getElementById(ID);
        if (h) {
          try {
            let isTopFrame = true;
            try { isTopFrame = window === window.top; } catch (e2) { isTopFrame = false; }
            const vh = innerHeight;
            const els = document.body ? document.body.getElementsByTagName('*') : [];
            for (const el of els) {
              if (el.id === 'capturer-progress' || el.tagName === 'IFRAME' || el.hasAttribute(MARK)) continue;
              const r = el.getBoundingClientRect();
              if (r.width < 24 || r.height < 8 || r.height > vh * 0.15) continue;
              const inTop = r.top >= -2 && r.bottom <= vh * 0.10;
              const inBottom = r.top >= vh * 0.88 && r.bottom <= vh + 2;
              if (!inTop && !inBottom) continue;
              if (!isTopFrame) {
                const pos = getComputedStyle(el).position;
                if (pos !== 'fixed' && pos !== 'absolute') continue;
              }
              if (el.querySelector('iframe,canvas,video')) continue; // 本文レンダラは巻き込まない
              el.setAttribute(MARK, '1');
            }
          } catch (e2) {}
          if (!st) {
            st = document.createElement('style');
            st.id = ID;
            st.textContent =
              ".kw-button-next, .kw-button-previous, .kg-next-button, .kg-prev-button," +
              " [class*='chevron' i], [aria-label*='ページ'] button, [aria-label*='Page'] button," +
              " #kindleReader_header, #kindleReader_footer," + // 旧リーダーのヘッダー/フッター
              " #capturer-progress," + // 進捗ピルも撮影の瞬間だけ隠す（写り込み防止）
              " [" + MARK + "]" +
              " { opacity: 0 !important; }";
            document.documentElement.appendChild(st);
          }
        } else {
          if (st) st.remove();
          try {
            document.querySelectorAll('[' + MARK + ']').forEach((el) => el.removeAttribute(MARK));
          } catch (e2) {}
        }
      }
    });
  try {
    try { await inject(true); }
    catch (e) { await inject(false); }
  } catch (e) {}
}

// リーダーが表示しているページ位置（例: 33/136）を読み取る。
// シークバー（input[type=range]）の value/max が最も確実。無ければ
// フッター等の「N / M」表記をテキストから拾う（リフロー本は位置No.になる）
async function readPageIndicator() {
  const inject = (allFrames) =>
    chrome.scripting.executeScript({
      target: { tabId: currentTabId, allFrames },
      func: () => {
        const sliders = document.querySelectorAll('input[type="range"]');
        for (const s of sliders) {
          const v = parseInt(s.value, 10), m = parseInt(s.max, 10);
          if (m > 1 && v >= 0 && v <= m) return { cur: v, max: m };
        }
        const t = document.body ? document.body.innerText : '';
        const m = t.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) {
          const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
          if (b > 1 && a <= b) return { cur: a, max: b };
        }
        return null;
      }
    });
  try {
    let results = null;
    try { results = await inject(true); }
    catch (e) { results = await inject(false); }
    for (const r of results || []) if (r && r.result) return r.result;
  } catch (e) {}
  return null;
}

// 撮影中の進捗ピル（画面右下）。撮影の瞬間は setNavHidden が透明化する
async function updateProgressOverlay(text) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      args: [text],
      func: (t) => {
        const ID = 'capturer-progress';
        let el = document.getElementById(ID);
        if (!el) {
          el = document.createElement('div');
          el.id = ID;
          el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483646;' +
            'background:rgba(15,23,42,0.88);color:#fff;font:bold 13px/1.2 sans-serif;' +
            'padding:9px 16px;border-radius:999px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,0.4);';
          document.documentElement.appendChild(el);
        }
        el.textContent = t;
      }
    });
  } catch (e) {}
}

function removeProgressOverlay() {
  chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: () => { const el = document.getElementById('capturer-progress'); if (el) el.remove(); }
  }).catch(() => {});
}

// ページがウィンドウからはみ出して「切れ」ていないかを全コンテンツ種で確認する。
// はみ出していると元キャプチャの時点で本文が欠け、後から復元できない。
// (1) 固定レイアウト: 大きな画像/canvasがビューポート外にはみ出す
// (2) リフロー本: 文書やコンテンツ要素が横方向にオーバーフローする（テキストが切れる）
// 雑誌・マンガ・一部の本はiframe内に描画されるため全フレームを調べる
async function checkPageOverflow() {
  const inject = (allFrames) =>
    chrome.scripting.executeScript({
      target: { tabId: currentTabId, allFrames },
      func: () => {
        const vw = window.innerWidth, vh = window.innerHeight;
        if (vw < 50 || vh < 50) return false;
        // 誤検知でループが止まらないよう、しきい値はビューポートの1.5%（最低8px）
        const M = Math.max(8, Math.round(vw * 0.015));

        // 画面内に見えている面積（ビューポートとの交差面積）
        const visArea = (b) => {
          const w = Math.min(b.right, vw) - Math.max(b.left, 0);
          const h = Math.min(b.bottom, vh) - Math.max(b.top, 0);
          return (w > 0 && h > 0) ? w * h : 0;
        };

        // (1) 大きな画像/canvas（固定レイアウトのページ）のはみ出し。
        // コミック等は前後ページを画面外に先読みするため、「画面内に見えている
        // 面積」が最大のものだけを判定対象にする（画面外の先読みページで誤検知しない）
        let best = null, bestV = 0;
        document.querySelectorAll('img, canvas').forEach(el => {
          const b = el.getBoundingClientRect();
          const v = visArea(b);
          if (v > bestV) { bestV = v; best = b; }
        });
        const isFixedLayout = best && bestV > vw * vh * 0.15;
        if (isFixedLayout) {
          if (best.left < -M || best.top < -M || best.right > vw + M || best.bottom > vh + M) return true;
        }

        // (1b) 背景画像(background-image)で描画されるページ（表紙等）のはみ出し。
        // img/canvasを使わないリーダーがあるため。こちらも見えているもののみ対象
        const divs = document.querySelectorAll('div, section');
        for (let i = 0; i < divs.length; i++) {
          const el = divs[i];
          const b = el.getBoundingClientRect();
          if (visArea(b) < vw * vh * 0.15) continue;
          const bg = getComputedStyle(el).backgroundImage;
          if (!bg || bg === 'none') continue;
          if (b.left < -M || b.top < -M || b.right > vw + M || b.bottom > vh + M) return true;
        }

        // 固定レイアウトのフレームでは、ページ画像自体の位置チェック(1)(1b)が
        // すべて。リーダー内部の先読みコンテナやスクロール仮想化が scrollWidth を
        // 広げるため、リフロー本用の(2)(3)を適用すると誤検知で撮影が止まる
        if (isFixedLayout) return false;

        // (2) 文書全体の横オーバーフロー（リフロー本のテキストはみ出し）
        const de = document.documentElement;
        if (de && de.scrollWidth > vw + M) return true;
        if (document.body && document.body.scrollWidth > vw + M) return true;

        // (3) テキストを含む要素が、ビューポートに一部見えている状態で
        // 左右にはみ出して切れているか。画面外メニュー（TOC等）は
        // ビューポートと交差しないので誤検知しない
        const els = document.querySelectorAll('div, section, article, main, p, header, h1, h2, h3');
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          const b = el.getBoundingClientRect();
          if (b.width < vw * 0.15) continue;                          // 十分に大きい要素のみ
          if (b.right <= M || b.left >= vw - M || b.bottom <= 0 || b.top >= vh) continue; // 画面内に見えているもののみ
          if (!(el.textContent && el.textContent.trim().length > 10)) continue;
          if (b.left < -M || b.right > vw + M) return true;           // 端で切れている
        }
        return false;
      }
    });
  let results = null;
  try { results = await inject(true); }
  catch (e) {
    try { results = await inject(false); } catch (e2) { return false; }
  }
  return (results || []).some(r => r && r.result === true);
}

async function checkFocus() {
  try {
    const win = await chrome.windows.get(currentWindowId);
    if (!win.focused) return false;
    const [tab] = await chrome.tabs.query({ active: true, windowId: currentWindowId });
    return tab && tab.id === currentTabId;
  } catch (e) { return false; }
}

// 本のタイトル・著者名をページ情報から取得（iframe対策で全フレームを走査。
// 権限外フレームで失敗した場合はメインフレームのみで再試行）
async function fetchBookMeta() {
  const inject = (allFrames) =>
    chrome.scripting.executeScript({
      target: { tabId: currentTabId, allFrames },
      func: () => {
        // 「Kindle」等の汎用名そのものは除外（完全一致のみ）
        const GENERIC = /^(amazon|kindle|amazon\s*kindle|kindle\s*(cloud\s*)?(reader|web\s*reader)|クラウドリーダー)$/i;
        function clean(t) {
          if (!t) return "";
          t = String(t).replace(/\s+/g, ' ').trim();
          t = t.replace(/^\s*(amazon\s*)?kindle\s*[:：]\s*/i, ''); // 先頭の「Kindle: 」等
          for (let k = 0; k < 3; k++) { // 末尾の「 - Kindle...」「｜Amazon...」等を繰り返し除去
            const n = t.replace(/\s*[-|｜:：]\s*(amazon|kindle|クラウドリーダー)[^-|｜:：]*$/i, '').trim();
            if (n === t) break;
            t = n;
          }
          return t.trim();
        }
        const cands = [];
        const push = (v) => { const c = clean(v); if (c && c.length >= 2 && !GENERIC.test(c)) cands.push(c); };
        push(document.title);
        try { push(document.querySelector('meta[property="og:title"]')?.content); } catch (e) {}
        ['[data-testid*="title" i]', '[class*="book-title" i]', '[class*="bookTitle"]',
         '.kw-header-title', 'header [class*="title" i]', 'h1'].forEach(s => {
          try { const el = document.querySelector(s); if (el) push(el.textContent); } catch (e) {}
        });
        // 著者名の候補も収集
        const authors = [];
        const pushA = (v) => {
          if (!v) return;
          const a = String(v).replace(/\s+/g, ' ').trim();
          if (a && a.length >= 2 && a.length <= 40 && !GENERIC.test(a)) authors.push(a);
        };
        try { pushA(document.querySelector('meta[name="author"]')?.content); } catch (e) {}
        ['[data-testid*="author" i]', '[class*="author" i]'].forEach(s => {
          try { const el = document.querySelector(s); if (el) pushA(el.textContent); } catch (e) {}
        });
        return {
          title: cands.length ? cands[0].slice(0, 120) : "",
          author: authors.length ? authors[0].slice(0, 60) : ""
        };
      }
    });
  let results = null;
  try { results = await inject(true); }
  catch (e) {
    try { results = await inject(false); } catch (e2) { return { title: "", author: "" }; }
  }
  // メインフレーム優先で最初の非空を採用
  const hits = (results || []).filter(r => r && r.result);
  hits.sort((a, b) => (a.frameId || 0) - (b.frameId || 0));
  const title = (hits.find(h => h.result.title) || {}).result?.title || "";
  const author = (hits.find(h => h.result.author) || {}).result?.author || "";
  return { title, author };
}

// 著者名を「開いているタブのタブ名」から推定する。
// Amazonの商品ページ等はタブ名が「書名｜著者名｜…」形式のため、
// 撮影中の本のタイトルを含むタブを探して著者部分を取り出す（tabs権限を利用）。
async function fetchAuthorFromTabs(title) {
  if (!title) return "";
  try {
    // 巻数・空白を除いた基準文字列（例:「すみ香る君へ２」→「すみ香る君へ」）
    const base = title.replace(/[\s　]*[0-9０-９]+[\s　]*$/, '').replace(/[\s　]+/g, '');
    if (base.length < 2) return "";
    const NG = /amazon|kindle|マンガ|コミック|電子書籍|ストア|\.co\.jp|楽天|honto|読み放題/i;
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      // Amazon系のタブに限定（他サイトのタブ名との偶然一致による誤検出を防ぐ）
      if (!t.url || !/amazon\.(co\.jp|com)/.test(t.url)) continue;
      const tt = t.title || '';
      if (!tt.replace(/[\s　]+/g, '').includes(base)) continue;
      const parts = tt.split(/[｜|]/).map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      // タイトルを含むセグメントの「次」を著者候補とする
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i].replace(/[\s　]+/g, '').includes(base)) {
          const cand = parts[i + 1];
          if (cand && cand.length >= 2 && cand.length <= 40 && !NG.test(cand)) return cand;
        }
      }
    }
  } catch (e) {}
  return "";
}

// 本のタイプ（文章リフロー / 固定レイアウト）をページ構造から自動判定する。
// リフロー本は「位置No.」表示があり、固定レイアウト本は大きな画像/canvasでページを描画する
async function detectBookType() {
  const inject = (allFrames) =>
    chrome.scripting.executeScript({
      target: { tabId: currentTabId, allFrames },
      func: () => {
        const txt = document.body ? (document.body.innerText || '') : '';
        if (/位置No/.test(txt)) return 'text';
        // 「章に残った1分」等の読書残り時間表示はリフロー（文章）本にしか出ない
        if (/章に残った|読み終(わ|え)るまで|残り\s*\d+\s*分|min(s|utes)?\s+left/i.test(txt)) return 'text';
        // リフロー本は本文がDOMテキストとして大量に存在する（固定レイアウトは画像のみ）。
        // ページ番号表示のリフロー本（位置No.が出ない）もこれで拾える
        if (txt.replace(/\s+/g, '').length >= 600) return 'text';
        let best = 0;
        document.querySelectorAll('img, canvas').forEach(el => {
          const r = el.getBoundingClientRect();
          const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
          const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
          if (w * h > best) best = w * h;
        });
        if (best > innerWidth * innerHeight * 0.5) return 'fixed';
        return null;
      }
    });
  let results = null;
  try { results = await inject(true); }
  catch (e) { try { results = await inject(false); } catch (e2) { return null; } }
  const hits = (results || []).filter(r => r && r.result);
  if (hits.some(h => h.result === 'text')) return 'text'; // リフローの証拠を最優先
  hits.sort((a, b) => (a.frameId || 0) - (b.frameId || 0));
  return hits.length ? hits[0].result : null;
}

async function startCaptureWorkflow() {
  // --- 本のタイトル・著者名をページ情報から取得（UIを隠す前に実行） ---
  const meta = await fetchBookMeta();
  currentConfig.title = meta.title;
  currentConfig.author = meta.author || await fetchAuthorFromTabs(meta.title);

  // --- 本のタイプ判定（「自動」選択時のみ。固定レイアウトの白黒/カラー判定はviewer側で行う） ---
  if (!currentConfig.bookType || currentConfig.bookType === 'auto') {
    currentConfig.detectedType = await detectBookType();
  }

  // 撮影中に写り込むKindleのUI（ナビバー・フッター等）を非表示に。
  // ※ページ送りボタン（.kw-button-next 等）はクリックしてページを送るため、
  //   絶対に隠さない（隠すとページめくりが止まる）。
  const hideCSS = ".kg-gui-container, .kw-nav-bar, .kw-footer, .kw-page-indicator, .kw-seeker { display: none !important; }";
  try { await chrome.scripting.insertCSS({ target: { tabId: currentTabId }, css: hideCSS }); } catch(e) {}

  await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: () => {
      const over = document.createElement('div'); over.id = 'capturer-overlay';
      over.style = "position:fixed; inset:0; z-index:999999; background:rgba(0,0,0,0.6); color:white; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none; font-family:sans-serif;";
      over.innerHTML = "<div id='capturer-timer' style='font-size:120px; font-weight:900;'>10</div><div id='capturer-sub' style='font-size:20px; text-align:center; max-width:80%;'>準備中：ページ全体が見えているか確認</div>";
      document.body.appendChild(over);
    }
  });

  countdown = 10;
  let ovfWait = 0; // はみ出し待機の回数（無限に待たず、一定時間で撮影を開始する）
  while (countdown > 0) {
    if (!isRunning) break;
    chrome.runtime.sendMessage({action: "updateProgress", isRunning, countdown}).catch(()=>{});
    // ページのはみ出しを毎秒チェックし、はみ出し中は警告を表示。
    // ただし直せないはみ出し（リーダーが表紙を大きく描画する等）で
    // 永久に始まらないと本末転倒なので、約10秒待ったら警告付きで開始する
    const overflow = await checkPageOverflow();
    const forced = overflow && ovfWait >= 10;
    await chrome.scripting.executeScript({ target: { tabId: currentTabId }, args: [countdown, overflow, forced], func: (c, ovf, f) => {
        const t = document.getElementById('capturer-timer'); if (t) t.innerText = c;
        const s = document.getElementById('capturer-sub');
        if (s) {
          if (ovf && !f) {
            s.innerText = "⚠ ページが画面からはみ出しています！このままだと文字が欠けます。ウィンドウの幅を広げてください（直らない場合は10秒後にそのまま開始します）";
            s.style.color = "#fbbf24";
          } else if (f) {
            s.innerText = "⚠ はみ出したまま開始します（端が切れたページは後で差し替えできます）";
            s.style.color = "#fbbf24";
          } else {
            s.innerText = "準備中：ページ全体が見えているか確認";
            s.style.color = "white";
          }
        }
    } });
    await new Promise(r => setTimeout(r, 1000));
    if (!overflow || forced) countdown--;
    else ovfWait++;
  }
  
  await chrome.scripting.executeScript({ target: { tabId: currentTabId }, func: () => { document.getElementById('capturer-overlay')?.remove(); } });
  countdown = 0; if (!isRunning) return;

  // 読み込み途中のページ（表紙の未描画など）を撮らないよう、
  // 画面が安定する（連続キャプチャの差分が収まる）まで待つ。最大約8秒
  try {
    let prevSig = null;
    for (let s = 0; s < 10; s++) {
      if (!isRunning) break;
      const shot = await chrome.tabs.captureVisibleTab(currentWindowId, { format: 'jpeg', quality: 50 });
      const sig = await getSignature(shot);
      if (prevSig && meanAbsDiff(sig, prevSig) < 2) break; // 安定した
      prevSig = sig;
      chrome.action.setBadgeText({ text: "..." });
      await new Promise(r => setTimeout(r, 800));
    }
    chrome.action.setBadgeText({ text: "" });
  } catch (e) {}

  let failStreak = 0;
  let lastSig = null;   // 直前に保存したページの署名
  let dupStreak = 0;    // 同一ページが連続した回数
  let dirSwitched = false; // 開き方向の自動修正を行ったか（1回だけ）
  for (let i = 0; i < currentConfig.maxPages; i++) {
    if (!isRunning) break;
    while (true) {
      if (!isRunning) break;
      if (await checkFocus()) { isPaused = false; break; }
      isPaused = true; chrome.action.setBadgeText({text: "WAIT"});
      chrome.runtime.sendMessage({action: "updateProgress", isRunning, isPaused, current: currentCount, total: currentConfig.maxPages}).catch(()=>{});
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!isRunning) break;

    // 各ページ撮影前に「ページがウィンドウからはみ出して切れていないか」を確認。
    // はみ出し中は待つが、直せないはみ出し（リーダーの描画仕様等）で撮影全体が
    // 止まらないよう、約10秒待っても直らなければ警告した上でそのまま撮影する
    let ovfTries = 0;
    while (isRunning && ovfTries < 8 && await checkPageOverflow()) {
      ovfTries++;
      chrome.action.setBadgeText({ text: "はみ出" });
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTabId },
          func: () => {
            let o = document.getElementById('capturer-overflow');
            if (!o) {
              o = document.createElement('div');
              o.id = 'capturer-overflow';
              o.style = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#f59e0b;color:#000;font-weight:700;font-size:15px;text-align:center;padding:10px;font-family:sans-serif;pointer-events:none;";
              o.textContent = "⚠ ページが画面からはみ出しています。ウィンドウ幅を広げる/文字サイズを小さくしてください（直らない場合は約10秒後にそのまま撮影を続行します）";
              document.documentElement.appendChild(o);
            }
          }
        });
      } catch (e) {}
      chrome.runtime.sendMessage({ action: "updateProgress", isRunning, isPaused: true, current: currentCount, total: currentConfig.maxPages }).catch(() => {});
      await new Promise(r => setTimeout(r, 1200));
    }
    try { await chrome.scripting.executeScript({ target: { tabId: currentTabId }, func: () => { document.getElementById('capturer-overflow')?.remove(); } }); } catch (e) {}
    if (!isRunning) break;

    await new Promise(r => setTimeout(r, 500));
    try {
      // 撮影の瞬間だけ矢印（›）を透明化（再描画待ちを少し入れる）
      await setNavHidden(true);
      await new Promise(r => setTimeout(r, 120));

      // キャプチャは一時的に失敗する（タブドラッグ中等）ため最大3回リトライ
      let dataUrl = null;
      let capErr = null; // 失敗理由を記録して、打ち切り時に必ずユーザーへ見せる
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!isRunning) break;
        try {
          dataUrl = await chrome.tabs.captureVisibleTab(currentWindowId, { format: 'jpeg', quality: 95 });
          if (dataUrl) break;
        } catch (err) {
          capErr = err;
          await new Promise(r => setTimeout(r, 700));
        }
      }

      // 撮影が終わったら即復帰（ページ送りボタンを見える状態に戻す）
      await setNavHidden(false);
      if (!dataUrl) {
        // このページはキャプチャできなかった。ページ送りせず次ループで再試行
        failStreak++;
        if (failStreak >= 5) {
          // 連続失敗で打ち切り。理由を残す（0枚終了時のバナーにも表示される）
          await recordCaptureError("キャプチャ", capErr || new Error("captureVisibleTab が空を返しました"), savedCount);
          break;
        }
        i--;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      failStreak = 0;

      // --- 重複検知 & 完了判定 ---
      let sig = null;
      try { sig = await getSignature(dataUrl); } catch (e) { sig = null; }
      if (sig && lastSig && meanAbsDiff(sig, lastSig) < DUP_DIFF) {
        // 直前と同じページ = ページ送りが効いていない
        dupStreak++;
        // 撮影の序盤（1〜2枚目）でページが進まない場合は、
        // 「開き方向（右開き/左開き）の設定ミス」の可能性が高いので、
        // 反対方向へ1回だけ自動切替して再試行する。
        // ※本の終端（撮影後半）では切替えない（逆走して戻り撮影する事故を防ぐ）
        if (!dirSwitched && dupStreak >= 2 && savedCount <= 2) {
          dirSwitched = true;
          currentConfig.direction = currentConfig.direction === 'rtl' ? 'ltr' : 'rtl';
          dupStreak = 0;
          const dirName = currentConfig.direction === 'rtl' ? '右開き' : '左開き';
          console.log("開き方向を自動修正:", dirName);
          showCaptureNotice("ページが進まないため、開き方向を「" + dirName + "」に自動修正して続行します。");
          await updateProgressOverlay("↔ 開き方向を「" + dirName + "」に自動修正");
        } else if (dupStreak >= 3) {
          break; // 3回連続で同じ→終端とみなし自動停止
        } else {
          chrome.action.setBadgeText({text: "END?"});
          chrome.action.setBadgeBackgroundColor({color: "#f59e0b"});
        }
        // 重複は保存しない。ページ送りだけ行い、同じ枚数を撮り直す
        i--;
      } else {
        dupStreak = 0;
        if (sig) lastSig = sig;
        // 撮り溜めずに1枚ずつ即ストレージへ保存する。
        // 全ページをメモリに抱えると、ページ数の多い本（200ページ超）で
        // Service Worker がメモリ不足で落ち、保存もエラー通知も行われない
        // まま黙って終わる（＝編集画面が開かない）事故になるため
        try {
          if (savedCount === 0) await cleanupOldCapture(); // 最初の1枚が撮れた時点で前回の本を掃除
          await chrome.storage.local.set({ ['img_' + savedCount]: dataUrl });
          savedCount++;
        } catch (e) {
          await recordCaptureError("画像書き込み", e, savedCount);
          chrome.action.setBadgeText({ text: "ERR" });
          chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
          showCaptureNotice("ページの保存に失敗したため撮影を中断しました（" + savedCount + "枚目）。エラー詳細は編集画面にも表示されます。");
          isRunning = false;
          break;
        }
        currentCount = savedCount;
        chrome.action.setBadgeText({text: currentCount.toString()});
        chrome.action.setBadgeBackgroundColor({color: "#6366f1"});
        chrome.runtime.sendMessage({action: "updateProgress", isRunning, isPaused, countdown: 0, current: currentCount, total: currentConfig.maxPages}).catch(()=>{});
      }

      // 進捗表示: リーダー自身のページ表記（33/136等）を読み取り、
      // 撮影枚数と残りページの目安を画面右下のピルに表示する
      try {
        const pi = await readPageIndicator();
        let ptxt = "📷 " + currentCount + "枚";
        if (pi) {
          ptxt += "｜" + pi.cur + "/" + pi.max;
          const remain = pi.max - pi.cur;
          if (remain > 0) ptxt += "（残り約" + remain + "）";
          else ptxt += "（まもなく完了）";
        }
        await updateProgressOverlay(ptxt);
      } catch (e) {}

      // ページ送り。コミック等はリーダーがiframe内に描画され、メインフレームへの
      // キー送出やクリックが届かないため、全フレームに対して実行する
      const flip = (allFrames) =>
        chrome.scripting.executeScript({
          target: { tabId: currentTabId, allFrames },
          args: [currentConfig.direction],
          func: (dir) => {
            const isRTL = dir === 'rtl';
            const key = isRTL ? 'ArrowLeft' : 'ArrowRight';
            const kc = isRTL ? 37 : 39;
            // 旧リーダー(kw/kg)＋新リーダー(kr-chevron)。RTL本（右開き）は左側が「次」
            const selectors = isRTL
              ? ['.kw-button-previous', '.kg-prev-button', '.kr-chevron-container-left',
                 '[aria-label*="前のページ"]', '[aria-label*="Previous page" i]',
                 '[data-testid*="prev" i]']
              : ['.kw-button-next', '.kg-next-button', '.kr-chevron-container-right',
                 '[aria-label*="次のページ"]', '[aria-label*="Next page" i]',
                 '[data-testid*="next" i]'];
            // 合成clickだけでは反応しないリーダーがあるため、pointer/mouseの一連を送る
            const fire = (el, x, y) => {
              const base = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
              try { el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerId: 1, isPrimary: true, pointerType: 'mouse' }, base))); } catch (e) {}
              el.dispatchEvent(new MouseEvent('mousedown', base));
              try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerId: 1, isPrimary: true, pointerType: 'mouse' }, base))); } catch (e) {}
              el.dispatchEvent(new MouseEvent('mouseup', base));
              el.dispatchEvent(new MouseEvent('click', base));
            };
            let done = false;
            for (const s of selectors) {
              try {
                const b = document.querySelector(s);
                if (b && b.offsetParent !== null) {
                  const r = b.getBoundingClientRect();
                  fire(b, r.left + r.width / 2, r.top + r.height / 2);
                  done = true; break;
                }
              } catch (e) {}
            }
            // タップゾーン送出: トップフレーム、または「リーダー本体を描画しているフレーム」
            // （フレームの半分以上を占める canvas/img があるフレーム）のみ。多重送り防止。
            const isReaderFrame = () => {
              if (window === window.top) return true;
              const vw = window.innerWidth, vh = window.innerHeight;
              if (vw < 200 || vh < 200) return false;
              for (const el of document.querySelectorAll('canvas, img')) {
                const r = el.getBoundingClientRect();
                if (r.width > vw * 0.5 && r.height > vh * 0.5) return true;
              }
              return false;
            };
            if (!done && isReaderFrame()) {
              const x = isRTL ? 30 : window.innerWidth - 30;
              const y = window.innerHeight / 2;
              const el = document.elementFromPoint(x, y) || document.body;
              fire(el, x, y);
            }
            const kev = (type) => new KeyboardEvent(type, { key, code: key, keyCode: kc, which: kc, bubbles: true, cancelable: true });
            const tgt = document.activeElement || document.body || document;
            tgt.dispatchEvent(kev('keydown'));
            tgt.dispatchEvent(kev('keyup'));
            return done;
          }
        });
      try { await flip(true); }
      catch (e) { await flip(false); } // 権限外フレームで失敗したらメインフレームのみで再試行
      await new Promise(r => setTimeout(r, currentConfig.interval));
    } catch (e) {
      // ページ送り等で例外。連続しなければ続行、続くようなら打ち切る
      await setNavHidden(false); // 例外時も透明のまま残さない
      failStreak++;
      if (failStreak >= 5) break;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  await setNavHidden(false); // 撮影終了時のクリーンアップ
  removeProgressOverlay();   // 進捗ピルを片付ける

  // 撮影後の後処理はどこで例外が起きても必ずユーザーに結果を見せる。
  // （以前はタイトル/著者の取得で例外が出ると、保存も編集画面も実行されずに
  //  黙って終わり「編集画面が開かない」状態になっていた）
  let endedOk = false;
  try {
    if (savedCount > 0) {
      // タイトル・著者の取得は失敗しても撮影データの保存を妨げない
      try {
        if (!currentConfig.title) {
          const m = await fetchBookMeta();
          currentConfig.title = m.title;
          if (!currentConfig.author) currentConfig.author = m.author;
        }
        if (!currentConfig.author) currentConfig.author = await fetchAuthorFromTabs(currentConfig.title);
      } catch (e) {
        console.error("タイトル/著者の取得に失敗（保存は続行）:", e);
      }
      const res = await finalizeCaptureStorage(savedCount, currentConfig);
      if (res.ok) {
        endedOk = true;
        chrome.tabs.create({ url: 'viewer.html' });
      } else {
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
        showCaptureNotice("撮影データの確定に失敗しました（" + savedCount + "枚）［" + res.err + "］エラー詳細は編集画面にも表示されます。");
      }
    } else {
      // 1枚も撮れなかった: 何もしないと「前回の本」が編集画面に出て紛らわしいので通知する
      // （前回の本のデータは最初の1枚を保存する時まで消さないので、この場合は無傷で残る）
      chrome.action.setBadgeText({ text: "0枚" });
      chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
      // この実行中にエラーが記録されていれば、汎用メッセージで上書きせず理由を明示する
      let reason = "本の終端で開始した・開き方向〔右開き/左開き〕が逆・ページが表示されていない等";
      try {
        const d = await chrome.storage.local.get(['lastCaptureError']);
        if (d.lastCaptureError && Date.now() - d.lastCaptureError.time < 10 * 60 * 1000) {
          reason = d.lastCaptureError.msg;
        }
      } catch (e) {}
      showCaptureNotice("1枚も撮影できませんでした［" + reason + "］編集画面のデータは前回撮影した本のままです。");
    }
  } catch (e) {
    console.error("撮影後の処理でエラー:", e);
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    await recordCaptureError("後処理", e, savedCount);
    showCaptureNotice("撮影後の処理でエラーが発生しました。エラー詳細は編集画面にも表示されます。");
  }
  try { await chrome.scripting.removeCSS({ target: { tabId: currentTabId }, css: hideCSS }); } catch(e) {}
  isRunning = false; isPaused = false;
  // バッジは成功時のみ消す（ERR/0枚の表示を残して原因を確認できるように）
  if (endedOk) chrome.action.setBadgeText({ text: "" });
}

// ===== 撮影データの保存（ストリーミング方式） =====
// 画像は撮影ループ内で1枚ずつ img_N キーへ即保存する（メモリに溜めない）。
// 最初の1枚を保存する直前に前回の本のデータを掃除し、
// 撮影完了時に capMeta（メタ情報）を書いて「確定」する。
// 編集画面は capMeta があれば分割形式を読み、無ければ旧形式にフォールバックする

// 前回の本のデータを掃除する（旧一括形式キー＋分割キー。
// 過去にクラッシュして capMeta 無しで残った img_ キーの残骸も併せて消す）
async function cleanupOldCapture() {
  const prev = await chrome.storage.local.get(['capMeta']);
  const oldCount = (prev.capMeta && prev.capMeta.count) || 0;
  const rm = ['capturedImages', 'importedFlags', 'capMeta'];
  for (let i = 0; i < Math.max(oldCount, 500); i++) rm.push('img_' + i);
  await chrome.storage.local.remove(rm);
}

// 失敗の詳細（段階・エラー・ストレージ使用量）を永続化する。
// バナーは消えてしまうが、編集画面がこれを読んで表示するので後から確認できる
async function recordCaptureError(stage, e, count) {
  const msg = stage + ": " + String((e && e.message) || e);
  console.error("撮影データの保存に失敗:", msg);
  try {
    let used = -1;
    try { used = await chrome.storage.local.getBytesInUse(null); } catch (e2) {}
    await chrome.storage.local.set({
      lastCaptureError: { msg, time: Date.now(), count, bytesInUse: used }
    });
  } catch (e3) {}
  return msg;
}

// 撮影完了時: メタ情報を書き込み、読み戻し検証してデータを「確定」する
async function finalizeCaptureStorage(count, config) {
  try {
    await chrome.storage.local.set({
      capMeta: { count, capturedAt: Date.now(), title: config.title || '' },
      config
    });
    const check = await chrome.storage.local.get(['capMeta', 'img_0', 'img_' + (count - 1)]);
    if (!check.capMeta || check.capMeta.count !== count ||
        !check['img_0'] || !check['img_' + (count - 1)]) {
      const err = await recordCaptureError("読み戻し検証", new Error("capMeta/画像キーが読み戻せません"), count);
      return { ok: false, err };
    }
  } catch (e) {
    const err = await recordCaptureError("メタ書き込み", e, count);
    return { ok: false, err };
  }
  try { await chrome.storage.local.remove(['lastCaptureError']); } catch (e) {}
  return { ok: true };
}

// キャプチャ対象タブに通知バナーを表示する（アラートよりも邪魔しない）
async function showCaptureNotice(msg) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      args: [msg],
      func: (m) => {
        const ID = 'capturer-notice';
        let el = document.getElementById(ID);
        if (!el) {
          el = document.createElement('div');
          el.id = ID;
          el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#dc2626;color:#fff;font:14px/1.6 sans-serif;padding:10px 16px;text-align:center;';
          document.documentElement.appendChild(el);
        }
        el.textContent = "⚠ " + m;
        setTimeout(() => { el.remove(); }, 60000);
      }
    });
  } catch (e) {}
}