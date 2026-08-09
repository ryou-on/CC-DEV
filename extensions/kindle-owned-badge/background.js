// ライブラリ同期をバックグラウンド（service worker）で実行する。
// read.amazon.co.jp の host_permissions があるため、タブを開かなくても
// セッションcookie付きのfetchでライブラリAPIを呼べる。
'use strict';

const SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000; // 自動同期の最短間隔: 10分
let syncing = false;

// ライブラリAPIを全ページ分たどって { asin: originType } を集める
async function fetchAllLibraryItems() {
  const items = {};
  let paginationToken = null;

  for (let page = 0; page < 400; page++) {
    const url = new URL('https://read.amazon.co.jp/kindle-library/search');
    url.searchParams.set('libraryType', 'BOOKS');
    url.searchParams.set('sortType', 'acquisition_desc');
    url.searchParams.set('querySize', '50');
    if (paginationToken) url.searchParams.set('paginationToken', paginationToken);

    const res = await fetch(url.toString(), { credentials: 'include' });
    if (!res.ok) throw new Error(`ライブラリAPIエラー: HTTP ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes('json')) {
      throw new Error('未ログインの可能性（read.amazon.co.jp にログインしてください）');
    }
    const data = await res.json();

    for (const item of data.itemsList || []) {
      if (!item.asin) continue;
      if (item.originType === 'SAMPLE') continue; // サンプルは所有扱いにしない
      items[item.asin] = item.originType || 'PURCHASE';
    }

    paginationToken = data.paginationToken || null;
    // ポップアップの進捗表示用
    chrome.storage.local.set({ syncProgress: { running: true, count: Object.keys(items).length } });
    if (!paginationToken) break;
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
  try {
    const items = await fetchAllLibraryItems();
    await chrome.storage.local.set({
      ownedItems: items,
      lastSyncAt: Date.now(),
      lastSyncError: null,
      syncProgress: { running: false, count: Object.keys(items).length }
    });
    return { status: 'ok', count: Object.keys(items).length };
  } catch (e) {
    await chrome.storage.local.set({
      lastSyncError: String(e.message || e),
      syncProgress: { running: false }
    });
    return { status: 'error', message: String(e.message || e) };
  } finally {
    syncing = false;
  }
}

// ポップアップ・content script からの同期指示を受け付ける
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'SYNC_LIBRARY') {
    syncLibrary(!!msg.force).then(sendResponse);
    return true; // 非同期応答
  }
});
