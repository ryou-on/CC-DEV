// read.amazon.co.jp（Web版Kindle）のライブラリAPIから所有ASIN一覧を同期する
'use strict';

const SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000; // 自動同期の最短間隔: 10分
let syncing = false;

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

// ライブラリAPIを全ページ分たどって { asin: originType } を集める
async function fetchAllLibraryItems() {
  const items = {};
  let paginationToken = null;

  for (let page = 0; page < 400; page++) {
    const url = new URL('/kindle-library/search', location.origin);
    url.searchParams.set('libraryType', 'BOOKS');
    url.searchParams.set('sortType', 'acquisition_desc');
    url.searchParams.set('querySize', '50');
    if (paginationToken) url.searchParams.set('paginationToken', paginationToken);

    const res = await fetch(url.toString(), { credentials: 'include' });
    if (!res.ok) throw new Error(`ライブラリAPIエラー: HTTP ${res.status}`);
    const data = await res.json();

    for (const item of data.itemsList || []) {
      if (!item.asin) continue;
      if (item.originType === 'SAMPLE') continue; // サンプルは所有扱いにしない
      items[item.asin] = item.originType || 'PURCHASE';
    }

    paginationToken = data.paginationToken || null;
    if (!paginationToken) break;
    showToast(`Kindleライブラリを同期中… ${Object.keys(items).length}冊`);
  }
  return items;
}

async function syncLibrary(force) {
  if (syncing) return { status: 'busy' };

  const { lastSyncAt } = await chrome.storage.local.get(['lastSyncAt']);
  if (!force && lastSyncAt && Date.now() - lastSyncAt < SYNC_MIN_INTERVAL_MS) {
    return { status: 'skipped' };
  }

  syncing = true;
  showToast('Kindleライブラリを同期中…');
  try {
    const items = await fetchAllLibraryItems();
    await chrome.storage.local.set({
      ownedItems: items,
      lastSyncAt: Date.now(),
      lastSyncError: null
    });
    const count = Object.keys(items).length;
    showToast(`同期完了: ${count}冊`);
    return { status: 'ok', count };
  } catch (e) {
    await chrome.storage.local.set({ lastSyncError: String(e) });
    showToast('同期失敗: ' + (e.message || e));
    return { status: 'error', message: String(e) };
  } finally {
    syncing = false;
  }
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

// ポップアップからの手動同期指示を受け付ける
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'SYNC_LIBRARY') {
    syncLibrary(true).then(sendResponse);
    return true; // 非同期応答
  }
});

// ページを開いたら自動同期（?kob_sync=1 付きなら間隔制限を無視して強制同期）
syncLibrary(new URLSearchParams(location.search).has('kob_sync'));
