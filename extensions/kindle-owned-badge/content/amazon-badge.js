// Amazon.co.jp の商品サムネイル（検索結果・カルーセル・商品詳細）に所有バッジを重ねる
'use strict';

// 所有ASIN → originType のマップ（chrome.storage から読み込み）
let ownedMap = {};

// 商品リンクからASINを抜き出す正規表現
const ASIN_REGEX = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?&%]|$)/;

// レンタル系（Kindle Unlimited等）として扱う originType
const RENTAL_TYPES = new Set(['KINDLE_UNLIMITED', 'COMICS_UNLIMITED', 'PRIME', 'KOLL']);

function extractAsin(href) {
  if (!href) return null;
  const match = href.match(ASIN_REGEX);
  return match ? match[1] : null;
}

function createBadge(originType) {
  const badge = document.createElement('span');
  const isRental = RENTAL_TYPES.has(originType);
  badge.className = 'kob-badge ' + (isRental ? 'kob-rental' : 'kob-purchase');
  badge.textContent = '済';
  badge.title = isRental ? 'Kindle Unlimitedで利用済み' : '購入済み';
  return badge;
}

// 画像の直近の親にバッジを載せる（重複防止つき）
function attachBadge(img, asin) {
  const host = img.parentElement;
  if (!host || host.querySelector(':scope > .kob-badge')) return;
  if (getComputedStyle(host).position === 'static') {
    host.classList.add('kob-badge-host');
  }
  host.appendChild(createBadge(ownedMap[asin]));
}

function scan() {
  if (!Object.keys(ownedMap).length) return;

  // 1) ASIN付きリンク配下の画像（カルーセル・おすすめ枠など）
  for (const anchor of document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
    const asin = extractAsin(anchor.getAttribute('href'));
    if (!asin || !(asin in ownedMap)) continue;
    const img = anchor.querySelector('img');
    if (img) attachBadge(img, asin);
  }

  // 2) data-asin 要素（検索結果など）
  for (const el of document.querySelectorAll('[data-asin]')) {
    const asin = el.getAttribute('data-asin');
    if (!asin || !(asin in ownedMap)) continue;
    const img = el.querySelector('img');
    if (img) attachBadge(img, asin);
  }

  // 3) 商品詳細ページのメイン画像
  const detailAsin = extractAsin(location.pathname);
  if (detailAsin && detailAsin in ownedMap) {
    const mainImg = document.querySelector('#imgTagWrapperId img, #landingImage, #ebooksImgBlkFront');
    if (mainImg) attachBadge(mainImg, detailAsin);
  }
}

// 動的に追加される要素（遅延ロードのカルーセル等）に対応
let scanTimer = null;
const observer = new MutationObserver(() => {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    observer.disconnect(); // 自分のバッジ追加で再発火しないよう一時停止
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  }, 600);
});

chrome.storage.local.get(['ownedItems']).then(({ ownedItems }) => {
  ownedMap = ownedItems || {};
  scan();
  observer.observe(document.body, { childList: true, subtree: true });
});

// 同期が走ったら即座にバッジを反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.ownedItems) {
    ownedMap = changes.ownedItems.newValue || {};
    scan();
  }
});
