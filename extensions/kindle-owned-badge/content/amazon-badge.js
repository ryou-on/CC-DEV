// Amazon.co.jp の商品サムネイル（検索結果・カルーセル・商品詳細）に所有バッジを重ねる
// Kindleストア系ページは Shadow DOM（web components）で構築されているため、
// shadow root を再帰的にたどってスキャンする。CSSはshadow root内に届かないので全てインラインで指定する。
'use strict';

// 所有ASIN → originType のマップ（ライブラリ同期 + 商品ページから収集した履歴のマージ）
let ownedMap = {};

// ライブラリ同期が優先（履歴でKU利用→その後購入した場合はPURCHASEで上書き）
function rebuildOwnedMap(data) {
  ownedMap = Object.assign({}, data.kuHistoryItems || {}, data.ownedItems || {});
}

// 商品リンクからASINを抜き出す正規表現
const ASIN_REGEX = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?&%]|$)/;

// レンタル系（Kindle Unlimited等）として扱う originType
const RENTAL_TYPES = new Set(['KINDLE_UNLIMITED', 'COMICS_UNLIMITED', 'PRIME', 'KOLL']);

const BADGE_BASE_STYLE = [
  'position:absolute', 'top:0', 'right:0', 'z-index:50',
  'padding:3px 7px', 'font-size:15px', 'font-weight:700', 'line-height:1.4',
  'color:#fff', 'border-radius:0 0 0 4px',
  'box-shadow:0 1px 3px rgba(0,0,0,.35)', 'pointer-events:none',
  'font-family:"Hiragino Sans","Yu Gothic",sans-serif'
].join(';');

function extractAsin(url) {
  if (!url) return null;
  const match = url.match(ASIN_REGEX);
  return match ? match[1] : null;
}

function createBadge(originType) {
  const badge = document.createElement('span');
  const isRental = RENTAL_TYPES.has(originType);
  badge.className = 'kob-badge';
  badge.textContent = '済';
  badge.title = isRental ? 'Kindle Unlimitedで利用済み' : '購入済み';
  badge.style.cssText = BADGE_BASE_STYLE + ';background:' + (isRental ? '#007185' : '#cc0c39');
  return badge;
}

// host要素の右上にバッジを載せる（重複防止つき）
function attachBadge(host, asin) {
  if (!host || host.querySelector(':scope > .kob-badge')) return;
  const style = getComputedStyle(host);
  if (style.position === 'static') host.style.position = 'relative';
  if (style.display === 'inline') host.style.display = 'inline-block';
  host.appendChild(createBadge(ownedMap[asin]));
}

// document と全shadow rootを再帰的に列挙する
function* iterRoots(root) {
  yield root;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) yield* iterRoots(el.shadowRoot);
  }
}

// 1つのroot（documentまたはshadow root）内をスキャンする
function scanRoot(root) {
  // 1) ASIN付きリンク（カルーセル・おすすめ枠・Kindleストアのweb components）
  for (const anchor of root.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
    const asin = extractAsin(anchor.href || anchor.getAttribute('href'));
    if (!asin || !(asin in ownedMap)) continue;
    const img = anchor.querySelector('img');
    if (img) {
      attachBadge(img.parentElement, asin);
    } else if (anchor.offsetWidth >= 50 && anchor.offsetHeight >= 50) {
      // 書影がさらに内側のshadow root（<bds-book-cover-image>等）にある場合はアンカー自体に付ける
      attachBadge(anchor, asin);
    }
  }

  // 2) data-asin 要素（検索結果など）
  for (const el of root.querySelectorAll('[data-asin]')) {
    const asin = el.getAttribute('data-asin');
    if (!asin || !(asin in ownedMap)) continue;
    const img = el.querySelector('img');
    if (img) attachBadge(img.parentElement, asin);
  }
}

function scanAll() {
  if (!Object.keys(ownedMap).length) return;

  for (const root of iterRoots(document)) scanRoot(root);

  // 商品詳細ページのメイン画像
  const detailAsin = extractAsin(location.pathname);
  if (detailAsin && detailAsin in ownedMap) {
    const mainImg = document.querySelector('#imgTagWrapperId img, #landingImage, #ebooksImgBlkFront');
    if (mainImg) attachBadge(mainImg.parentElement, detailAsin);
  }
}

// 商品ページの「Kindle Unlimitedで〇月〇日に利用しました」バナー（#booksInstantOrderUpdate）から
// 利用履歴を収集する。返却済みKU本の一覧を取れるAPIが存在しないため、
// 商品ページを開いたタイミングで記録して以後のバッジ表示に使う。
async function collectFromInstantOrderUpdate() {
  const banner = document.querySelector('#booksInstantOrderUpdate');
  if (!banner) return;
  const asin = extractAsin(location.pathname) || extractAsin(location.href);
  if (!asin) return;

  const text = banner.textContent || '';
  let originType = null;
  if (/Kindle Unlimitedで.*利用しました/.test(text)) originType = 'KINDLE_UNLIMITED';
  else if (/購入(?:しました|済み)|お買い上げ/.test(text)) originType = 'PURCHASE';
  if (!originType) return;

  const { kuHistoryItems } = await chrome.storage.local.get(['kuHistoryItems']);
  const history = kuHistoryItems || {};
  if (history[asin] === originType) return;
  history[asin] = originType;
  await chrome.storage.local.set({ kuHistoryItems: history });
}

// 動的追加への追従:
// - MutationObserver: 通常DOMの変化（検索結果の絞り込み等）
// - setInterval: shadow root内の変化はObserverでは拾えないため定期再スキャン
let scanTimer = null;
const observer = new MutationObserver(() => {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    observer.disconnect(); // 自分のバッジ追加で再発火しないよう一時停止
    scanAll();
    observer.observe(document.body, { childList: true, subtree: true });
  }, 600);
});

chrome.storage.local.get(['ownedItems', 'kuHistoryItems']).then((data) => {
  rebuildOwnedMap(data);
  scanAll();
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(() => {
    if (!document.hidden) scanAll();
  }, 3000);
  // バナーは初期HTMLに含まれるが、念のため少し遅らせて再チェック
  collectFromInstantOrderUpdate();
  setTimeout(collectFromInstantOrderUpdate, 2500);
});

// 同期・履歴収集が走ったら即座にバッジを反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.ownedItems || changes.kuHistoryItems) {
    chrome.storage.local.get(['ownedItems', 'kuHistoryItems']).then((data) => {
      rebuildOwnedMap(data);
      scanAll();
    });
  }
});
