
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const maxPagesInput = document.getElementById('maxPages');
const autoSaveInput = document.getElementById('autoSave');

// 「撮影後に自動でPDF保存」の前回設定を復元（チェック状態は記憶される）
chrome.storage.local.get(['setting_autoSave'], (d) => { autoSaveInput.checked = !!d.setting_autoSave; });
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
  startBtn.style.display = 'none'; stopBtn.style.display = 'block';
  if (res.isPaused) statusDiv.innerHTML = "<b style='color:#f59e0b'>一時停止中</b><br>Kindleウィンドウを最前面に！";
  else if (res.countdown > 0) statusDiv.innerHTML = "開始まで <span style='font-size:18px; font-weight:900'>" + res.countdown + "</span> 秒";
  else statusDiv.innerHTML = "撮影中: <b>" + res.current + "</b> / " + res.total;
}

startBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("read.amazon.co.jp")) {
    statusDiv.innerHTML = "<b style='color:#f59e0b'>read.amazon.co.jp を開いてから実行してください</b>";
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
  statusDiv.innerText = "データを集計中...";
  setTimeout(() => window.close(), 1000);
};

chrome.runtime.onMessage.addListener((msg) => { if (msg.action === "updateProgress") updateUI(msg); });