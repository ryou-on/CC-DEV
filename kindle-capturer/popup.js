
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const maxPagesInput = document.getElementById('maxPages');
const openGuideBtn = document.getElementById('openGuideBtn');
const closeGuideBtn = document.getElementById('closeGuideBtn');
const guideUI = document.getElementById('guideUI');

// ガイド制御
openGuideBtn.onclick = () => { guideUI.style.display = 'block'; };
closeGuideBtn.onclick = () => { guideUI.style.display = 'none'; };

// Kindle解析（現在のページ数を推定して枚数に反映）
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  if (tabs[0] && tabs[0].url && tabs[0].url.includes("read.amazon.co.jp")) {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      func: () => {
        const txt = document.body.innerText;
        const pageMatch = txt.match(/(\d+)\s*\/\s*(\d+)/);
        const locMatch = txt.match(/位置No\.\s*(\d+)\s*\/\s*(\d+)/);
        if (pageMatch) return pageMatch[2];
        if (locMatch) return Math.ceil(locMatch[2] / 20); 
        return null;
      }
    }).then(res => { if (res && res[0] && res[0].result) maxPagesInput.value = res[0].result; });
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
  chrome.runtime.sendMessage({
    action: "start", tabId: tab.id, windowId: tab.windowId,
    maxPages,
    interval,
    direction: document.querySelector('input[name="dir"]:checked').value,
    bookType: document.querySelector('input[name="btype"]:checked').value
  });
  updateUI({ isRunning: true, countdown: 10, current: 0, total: maxPages });
};

stopBtn.onclick = () => {
  chrome.runtime.sendMessage({action: "stop"});
  statusDiv.innerText = "データを集計中...";
  setTimeout(() => window.close(), 1000);
};

chrome.runtime.onMessage.addListener((msg) => { if (msg.action === "updateProgress") updateUI(msg); });