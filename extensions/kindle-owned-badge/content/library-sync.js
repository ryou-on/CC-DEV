// read.amazon.co.jp 用 content script。
// ライブラリ同期の実体は background.js（service worker）に移行済みで、
// ここでは ①ページを開いたときの自動同期トリガー ②Kindle Auto Capturer の
// キャプチャ記録（kobCapturedLog）の回収 のみを行う。
'use strict';

// 画面右下に進捗トーストを表示する
function showToast(message) {
  let toast = document.getElementById('kob-sync-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'kob-sync-toast';
    toast.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'background:#232f3e', 'color:#fff', 'padding:10px 16px',
      'border-radius:8px', 'font-size:13px', 'box-shadow:0 2px 8px rgba(0,0,0,.4)',
      'font-family:sans-serif'
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  clearTimeout(showToast.hideTimer);
  showToast.hideTimer = setTimeout(() => toast.remove(), 5000);
}

// Kindle Auto Capturer がページlocalStorageに残したキャプチャ記録（kobCapturedLog）を回収する。
// 回収後はlocalStorage側を消し、chrome.storage の capturedItems に永続化する
async function harvestCapturedLog() {
  let log;
  try {
    log = JSON.parse(localStorage.getItem('kobCapturedLog') || '[]');
  } catch (e) {
    localStorage.removeItem('kobCapturedLog');
    return;
  }
  if (!Array.isArray(log) || !log.length) return;

  const { capturedItems } = await chrome.storage.local.get(['capturedItems']);
  const items = capturedItems || {};
  let added = 0;
  for (const entry of log) {
    if (!entry || !/^[A-Z0-9]{10}$/.test(entry.asin || '')) continue;
    if (entry.asin in items) continue;
    items[entry.asin] = { title: entry.title || '', ts: entry.ts || Date.now() };
    added++;
  }
  if (added) {
    await chrome.storage.local.set({ capturedItems: items });
    showToast(`キャプチャ記録を${added}冊取り込みました`);
  }
  localStorage.removeItem('kobCapturedLog');
}

harvestCapturedLog();
setInterval(harvestCapturedLog, 5000); // キャプチャ中のセッションでも随時回収

// ページを開いたら自動同期を依頼（10分間隔制限つき。?kob_sync=1 なら強制）
chrome.runtime.sendMessage({
  type: 'SYNC_LIBRARY',
  force: new URLSearchParams(location.search).has('kob_sync')
}).then((result) => {
  if (result && result.status === 'ok') showToast(`ライブラリ同期完了: ${result.count}冊`);
  else if (result && result.status === 'error') showToast('同期失敗: ' + result.message);
}).catch(() => {});
