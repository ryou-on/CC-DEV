// ポップアップ: 同期状況の表示と手動同期のトリガー
'use strict';

const RENTAL_TYPES = new Set(['KINDLE_UNLIMITED', 'COMICS_UNLIMITED', 'PRIME', 'KOLL']);
const READER_URL = 'https://read.amazon.co.jp/kindle-library?kob_sync=1';

function setStatus(text, isError) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = isError ? 'error' : '';
}

async function refreshStats() {
  const { ownedItems, kuHistoryItems, capturedItems, lastSyncAt, lastSyncError } =
    await chrome.storage.local.get(['ownedItems', 'kuHistoryItems', 'capturedItems', 'lastSyncAt', 'lastSyncError']);

  // ライブラリ同期と商品ページ収集履歴をマージ（同期側優先、バッジ表示と同じロジック）
  const merged = Object.assign({}, kuHistoryItems || {}, ownedItems || {});
  const types = Object.values(merged);
  const rentalCount = types.filter((t) => RENTAL_TYPES.has(t)).length;
  const captured = capturedItems || {};
  const totalCount = Object.keys(Object.assign({}, merged, captured)).length;

  document.getElementById('totalCount').textContent = totalCount;
  document.getElementById('purchaseCount').textContent = types.length - rentalCount;
  document.getElementById('rentalCount').textContent = rentalCount;
  document.getElementById('capturedCount').textContent = Object.keys(captured).length;
  document.getElementById('historyCount').textContent = Object.keys(kuHistoryItems || {}).length;
  document.getElementById('lastSync').textContent = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString('ja-JP')
    : '未同期';

  if (lastSyncError) setStatus('前回同期エラー: ' + lastSyncError, true);
}

document.getElementById('syncBtn').addEventListener('click', async () => {
  setStatus('同期中…');
  // 同期はbackground(service worker)が直接APIを叩く（タブを開く必要なし）
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_LIBRARY', force: true });
    if (result && result.status === 'ok') {
      setStatus(`同期完了: ${result.count}冊`);
    } else if (result && result.status === 'busy') {
      setStatus('同期中です…');
    } else if (result && result.status === 'error') {
      setStatus('同期失敗: ' + result.message, true);
      // 未ログイン時だけWeb版Kindleを開いてログインしてもらう
      if (/ログイン/.test(result.message)) chrome.tabs.create({ url: READER_URL });
    } else {
      setStatus('');
    }
  } catch (e) {
    setStatus('同期失敗: ' + (e.message || e), true);
  }
});

// デバッグ用: 状態一式をクリップボードへコピー
document.getElementById('debugBtn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['ownedItems', 'kuHistoryItems', 'capturedItems', 'lastSyncAt', 'lastSyncError']);
  const debugInfo = {
    version: chrome.runtime.getManifest().version,
    syncedCount: Object.keys(data.ownedItems || {}).length,
    kuHistoryCount: Object.keys(data.kuHistoryItems || {}).length,
    capturedCount: Object.keys(data.capturedItems || {}).length,
    sampleCaptured: Object.entries(data.capturedItems || {}).slice(0, 5),
    lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt).toISOString() : null,
    lastSyncError: data.lastSyncError || null,
    sampleAsins: Object.entries(data.ownedItems || {}).slice(0, 5),
    sampleKuHistory: Object.entries(data.kuHistoryItems || {}).slice(0, 5)
  };
  await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
  setStatus('デバッグ情報をコピーしました');
});

// 同期の進行に合わせて表示を更新
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.syncProgress && changes.syncProgress.newValue && changes.syncProgress.newValue.running) {
    setStatus(`同期中… ${changes.syncProgress.newValue.count || 0}冊`);
  }
  refreshStats();
});

refreshStats();
