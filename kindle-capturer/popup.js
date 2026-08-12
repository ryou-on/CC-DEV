
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const maxPagesInput = document.getElementById('maxPages');
const autoSaveInput = document.getElementById('autoSave');
let lastStatus = null; // 直近の進捗状態（言語切替時のステータス再描画用）

// ===== 多言語対応（v5.32.0） =====
const I18N = {
  ja: {
    langBtn: 'EN',
    guideBtn: '使い方',
    guideTitle: '使い方',
    closeGuide: '閉じる',
    lblDir: '方向', optRtl: '右開き', optLtr: '左開き',
    lblType: '本のタイプ', optAuto: '自動', optText: '文章', optManga: 'マンガ', optMag: '雑誌',
    lblPages: '枚数', lblSec: '秒',
    autoSave: '撮影後に自動でPDF保存（全自動）',
    start: '撮影開始 (AI最適化)', stop: '停止して編集へ',
    idle: '待機中...',
    paused: "<b style='color:#f59e0b'>一時停止中</b><br>Kindleウィンドウを最前面に！",
    countdown: (n) => "開始まで <span style='font-size:18px; font-weight:900'>" + n + "</span> 秒",
    capturing: (c, t) => "撮影中: <b>" + c + "</b> / " + t,
    needKindle: "<b style='color:#f59e0b'>read.amazon.co.jp を開いてから実行してください</b>",
    collecting: 'データを集計中...',
    noticeTitle: 'ご利用上の注意',
    guideBody:
      '<b>📷 撮影の手順:</b><br>' +
      '1. read.amazon.co.jp で対象の本を開く。<br>' +
      '2. 文章の本: Kindle設定を「サイズ 5 / 行間 中 / 余白 狭」にし、ブラウザ幅を細長く（A4縦比率）。<br>' +
      '&nbsp;&nbsp;マンガ・雑誌: ページ全体が見える幅にする（狭いと文字が欠け、撮影前に警告が出ます）。<br>' +
      '3. 方向・本のタイプ・枚数・間隔を設定して「撮影開始」→ 10秒後に自動撮影開始。<br>' +
      '4. 撮影中はKindleウィンドウを最前面に保つ（外れると一時停止、戻すと再開）。<br>' +
      '5. 完了後、編集画面が自動で開き余白カットが適用されます。<br>' +
      '6. 不要ページを削除・調整し「保存」→ タイトル/著者を確認して PDF 出力。<br><br>' +
      '<b>⌨️ 編集ショートカット:</b><br>' +
      'j/k: 移動, x: 選択, y: 削除, Ctrl+Z: Undo<br><br>' +
      '<b>📕 タイトル自動入力:</b><br>' +
      '撮影開始時にKindleのページ情報から本のタイトルを自動取得し、保存時にタイトル欄へ自動入力されます（修正可）。',
  },
  en: {
    langBtn: '日本語',
    guideBtn: 'Guide',
    guideTitle: 'How to use',
    closeGuide: 'Close',
    lblDir: 'Direction', optRtl: 'Right-open', optLtr: 'Left-open',
    lblType: 'Book type', optAuto: 'Auto', optText: 'Text', optManga: 'Manga', optMag: 'Magazine',
    lblPages: 'Pages', lblSec: 'Sec',
    autoSave: 'Auto-save PDF after capture (fully automatic)',
    start: 'Start Capture (AI optimized)', stop: 'Stop & Edit',
    idle: 'Idle...',
    paused: "<b style='color:#f59e0b'>Paused</b><br>Bring the Kindle window to the front!",
    countdown: (n) => "Starting in <span style='font-size:18px; font-weight:900'>" + n + "</span> s",
    capturing: (c, t) => "Capturing: <b>" + c + "</b> / " + t,
    needKindle: "<b style='color:#f59e0b'>Open read.amazon.co.jp first, then try again</b>",
    collecting: 'Collecting data...',
    noticeTitle: 'Notice',
    guideBody:
      '<b>📷 Capture steps:</b><br>' +
      '1. Open the book at read.amazon.co.jp.<br>' +
      '2. Text books: set Kindle to "Font size 5 / Line spacing Medium / Margins Narrow" and make the browser window tall and narrow (A4 portrait ratio).<br>' +
      '&nbsp;&nbsp;Manga / magazines: make the window wide enough to show the whole page (if too narrow, text gets cut off — a warning appears before capture).<br>' +
      '3. Set direction, book type, pages and interval, then press "Start Capture" — capture begins after a 10-second countdown.<br>' +
      '4. Keep the Kindle window in the foreground during capture (capture pauses when it loses focus and resumes when restored).<br>' +
      '5. When finished, the editor opens automatically with margin-crop applied.<br>' +
      '6. Delete or adjust unwanted pages, press "Save", confirm title/author, and export the PDF.<br><br>' +
      '<b>⌨️ Editor shortcuts:</b><br>' +
      'j/k: move, x: select, y: delete, Ctrl+Z: undo<br><br>' +
      '<b>📕 Auto title:</b><br>' +
      'The book title is fetched from the Kindle page when capture starts and pre-filled in the save dialog (editable).',
  }
};

let lang = 'ja';
const t = (key) => I18N[lang][key];

function applyLang() {
  document.getElementById('langBtn').textContent = t('langBtn');
  document.getElementById('openGuideBtn').textContent = t('guideBtn');
  document.getElementById('guideTitle').textContent = t('guideTitle');
  document.getElementById('closeGuideBtn').textContent = t('closeGuide');
  document.getElementById('guideBody').innerHTML = t('guideBody');
  document.getElementById('lblDir').textContent = t('lblDir');
  document.getElementById('optRtl').textContent = t('optRtl');
  document.getElementById('optLtr').textContent = t('optLtr');
  document.getElementById('lblType').textContent = t('lblType');
  document.getElementById('optAuto').textContent = t('optAuto');
  document.getElementById('optText').textContent = t('optText');
  document.getElementById('optManga').textContent = t('optManga');
  document.getElementById('optMag').textContent = t('optMag');
  document.getElementById('lblPages').textContent = t('lblPages');
  document.getElementById('lblSec').textContent = t('lblSec');
  document.getElementById('lblAutoSaveText').textContent = t('autoSave');
  document.getElementById('noticeTitle').textContent = t('noticeTitle');
  startBtn.textContent = t('start');
  stopBtn.textContent = t('stop');
  if (lastStatus) updateUI(lastStatus);
  else statusDiv.innerHTML = t('idle');
}

document.getElementById('langBtn').onclick = () => {
  lang = (lang === 'ja') ? 'en' : 'ja';
  chrome.storage.local.set({ setting_lang: lang });
  applyLang();
};

// ===== 初回起動時の個人利用注意（v5.32.0） =====
const noticeUI = document.getElementById('noticeUI');
document.getElementById('noticeOkBtn').onclick = () => {
  if (document.getElementById('noticeDontShow').checked) {
    chrome.storage.local.set({ setting_noticeDismissed: true });
  }
  noticeUI.style.display = 'none';
};

// 言語設定・注意表示フラグ・自動保存設定をまとめて復元
chrome.storage.local.get(['setting_autoSave', 'setting_lang', 'setting_noticeDismissed'], (d) => {
  autoSaveInput.checked = !!d.setting_autoSave;
  if (d.setting_lang === 'en') lang = 'en';
  applyLang();
  if (!d.setting_noticeDismissed) noticeUI.style.display = 'block';
});

const openGuideBtn = document.getElementById('openGuideBtn');
const closeGuideBtn = document.getElementById('closeGuideBtn');
const guideUI = document.getElementById('guideUI');

// ガイド制御
openGuideBtn.onclick = () => { guideUI.style.display = 'block'; };
closeGuideBtn.onclick = () => { guideUI.style.display = 'none'; };

// Kindle解析（総ページ数を推定して枚数に反映）。
// 確実な情報源（ページスライダーの最大値・「位置No. N/M」）だけを使う。
// 表紙の号数表記（例「6/20-27」）を総ページ数と誤読しないよう、
// 素の「数字/数字」テキストは根拠に使わない（既定値100のままにする）。
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  if (tabs[0] && tabs[0].url && tabs[0].url.includes("read.amazon.co.jp")) {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id, allFrames: true},
      func: () => {
        // ① ページスライダー（input[type=range]）の最大値が最も確実
        for (const s of document.querySelectorAll('input[type="range"]')) {
          const m = parseInt(s.max, 10);
          if (m > 1) return m + 1; // 0始まりのことがあるので+1
        }
        // ② リフロー本の「位置No. N/M」→ 20位置≒1ページ換算
        const txt = document.body ? document.body.innerText : '';
        const loc = txt.match(/位置No\.\s*[\d,]+\s*\/\s*([\d,]+)/);
        if (loc) return Math.ceil(parseInt(loc[1].replace(/,/g, ''), 10) / 20);
        // ③ 「N / M ページ」と明示されている場合のみ採用（日付誤読を防ぐ）
        const pg = txt.match(/(\d+)\s*\/\s*(\d+)\s*ページ/);
        if (pg) return parseInt(pg[2], 10);
        return null; // 確証なし → 既定値のまま（雑誌でも余裕を持って撮り終端で自動停止）
      }
    }).then(res => {
      const vals = (res || []).map(r => r && r.result).filter(v => v && v > 1);
      if (vals.length) maxPagesInput.value = Math.max.apply(null, vals);
    }).catch(() => {});
  }
});

chrome.runtime.sendMessage({action: "getStatus"}, (res) => { if (res && res.isRunning) updateUI(res); });

function updateUI(res) {
  lastStatus = res;
  startBtn.style.display = 'none'; stopBtn.style.display = 'block';
  if (res.isPaused) statusDiv.innerHTML = t('paused');
  else if (res.countdown > 0) statusDiv.innerHTML = t('countdown')(res.countdown);
  else statusDiv.innerHTML = t('capturing')(res.current, res.total);
}

startBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("read.amazon.co.jp")) {
    statusDiv.innerHTML = t('needKindle');
    return;
  }
  const maxPages = Math.max(1, parseInt(maxPagesInput.value, 10) || 1);
  const interval = Math.max(1, parseFloat(document.getElementById('interval').value) || 4.5) * 1000;
  chrome.storage.local.set({ setting_autoSave: autoSaveInput.checked });
  chrome.runtime.sendMessage({
    action: "start", tabId: tab.id, windowId: tab.windowId,
    maxPages,
    interval,
    direction: document.querySelector('input[name="dir"]:checked').value,
    bookType: document.querySelector('input[name="btype"]:checked').value,
    autoSave: autoSaveInput.checked
  });
  updateUI({ isRunning: true, countdown: 10, current: 0, total: maxPages });
};

stopBtn.onclick = () => {
  chrome.runtime.sendMessage({action: "stop"});
  statusDiv.innerText = t('collecting');
  setTimeout(() => window.close(), 1000);
};

chrome.runtime.onMessage.addListener((msg) => { if (msg.action === "updateProgress") updateUI(msg); });
