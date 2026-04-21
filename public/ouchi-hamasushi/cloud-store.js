// ===== おうち巴寿司 クラウドストレージ（Firestore） =====
// 家族コード方式: 同じコードを入れた端末間で音声・画像を共有
// - Firestore パス: ouchi-hamasushi/{familyCode}/assets/{assetKey}
// - localStorage は Firestore のローカルキャッシュとして動作
// - 既存の localStorage.getItem('voice_...') 呼び出しは無変更で動く

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, deleteDoc,
  collection, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPlsAhtxbJBihy-EAHck9P7XbuMdzV0ds",
  authDomain: "cc-dev-ps7.firebaseapp.com",
  projectId: "cc-dev-ps7",
  storageBucket: "cc-dev-ps7.firebasestorage.app",
  messagingSenderId: "1029579090333",
  appId: "1:1029579090333:web:c699eb13e9279f467f2774"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// このファミリーのデフォルト家族コード。新しいブラウザでプレイヤーを開くと
// 自動的にこのコードで接続される → 全端末で同じ録音データが鳴る
const DEFAULT_FAMILY_CODE = 'tomoe3030';
const FAMILY_KEY = 'setting_familyCode';
const MAX_DATA_SIZE = 900 * 1024; // 900KB (Firestore 1MB 制限に余裕)

// 家族コードの決定優先順位:
//   1. URLパラメータ ?family=xxx が最優先（共有URL用）
//   2. localStorage に保存済みならそれ
//   3. デフォルト (tomoe3030)
function getFamilyCode() {
  // URLパラメータが指定されていれば最優先 + localStorage にも保存
  try {
    const url = new URL(window.location.href);
    const urlCode = (url.searchParams.get('family') || '').trim();
    if (urlCode) {
      localStorage.setItem(FAMILY_KEY, urlCode);
      return urlCode;
    }
  } catch (e) { /* 無視 */ }
  // localStorage > デフォルト
  return localStorage.getItem(FAMILY_KEY) || DEFAULT_FAMILY_CODE;
}

function setFamilyCode(code) {
  const clean = (code || '').trim() || DEFAULT_FAMILY_CODE;
  localStorage.setItem(FAMILY_KEY, clean);
  return clean;
}

let currentUnsubscribe = null;
let currentCode = null;
let currentOnUpdate = null;
let currentOnError = null;

// インメモリキャッシュ。シークレットモード等で localStorage が動かない場合の
// フォールバック用。onSnapshot 受信時に必ずここへも書き込む
const memCache = {};

// 永続層（localStorage）→ メモリキャッシュの順で値を取得
function getAsset(key) {
  try {
    const ls = localStorage.getItem(key);
    if (ls) return ls;
  } catch (e) { /* quota/privacy で失敗する可能性 */ }
  return memCache[key] || null;
}

// familyCode の assets コレクションを監視。
// onUpdate(info) は初回接続時(empty含む)と変更時に呼ばれる
//   info: { firstLoad: bool, changes: number, totalDocs: number }
// onError(err) は permission-denied などエラー時に呼ばれる
function subscribe(familyCode, onUpdate, onError) {
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  currentCode = familyCode;
  currentOnUpdate = onUpdate;
  currentOnError = onError;

  let firstLoad = true;
  const col = collection(db, 'ouchi-hamasushi', familyCode, 'assets');
  currentUnsubscribe = onSnapshot(col, (snap) => {
    let changes = 0;
    snap.docChanges().forEach(change => {
      const key = change.doc.id;
      if (change.type === 'removed') {
        delete memCache[key];
        try { localStorage.removeItem(key); } catch (e) {}
        changes++;
      } else {
        const data = change.doc.data();
        if (data && typeof data.data === 'string') {
          // まずメモリキャッシュに必ず保存（インコグニト等で localStorage が使えなくても動く）
          memCache[key] = data.data;
          try { localStorage.setItem(key, data.data); } catch (e) {
            console.warn('[cloudStore] localStorage write failed (memCache only):', key, e && e.name);
          }
          changes++;
        }
      }
    });
    // 空のスナップショット・初回接続でも onUpdate を呼んで UI 側に成功を通知
    if (typeof currentOnUpdate === 'function') {
      currentOnUpdate({ firstLoad, changes, totalDocs: snap.size });
    }
    firstLoad = false;
  }, (err) => {
    console.error('[cloudStore] subscribe error:', err && err.code, err && err.message);
    if (typeof currentOnError === 'function') {
      currentOnError(err);
    }
  });

  return currentUnsubscribe;
}

// 家族コード切替: ローカルキャッシュをクリアしてから再サブスクライブ
// (古いコードのデータが残っているのを防ぐ)
function wipeLocalAssets() {
  const keys = Object.keys(localStorage)
    .filter(k => k.startsWith('voice_') || k.startsWith('image_'));
  keys.forEach(k => localStorage.removeItem(k));
  // memCache もクリア
  Object.keys(memCache)
    .filter(k => k.startsWith('voice_') || k.startsWith('image_'))
    .forEach(k => delete memCache[k]);
  return keys.length;
}

async function setAsset(familyCode, assetKey, dataUri, mimeType) {
  if (!dataUri || typeof dataUri !== 'string') {
    throw new Error('データが空です');
  }
  if (dataUri.length > MAX_DATA_SIZE) {
    const kb = Math.round(dataUri.length / 1024);
    throw new Error(`ファイルが大きすぎます (${kb}KB, 上限 ${MAX_DATA_SIZE / 1024}KB)`);
  }
  // ローカル即時反映（ネット失敗しても再生はできる）
  try { localStorage.setItem(assetKey, dataUri); } catch (e) { /* quota 超過は許容 */ }
  // クラウド保存
  const ref = doc(db, 'ouchi-hamasushi', familyCode, 'assets', assetKey);
  await setDoc(ref, {
    data: dataUri,
    mimeType: mimeType || '',
    size: dataUri.length,
    updatedAt: serverTimestamp(),
  });
}

async function removeAsset(familyCode, assetKey) {
  localStorage.removeItem(assetKey);
  const ref = doc(db, 'ouchi-hamasushi', familyCode, 'assets', assetKey);
  await deleteDoc(ref);
}

// 非モジュールスクリプトから使えるよう window に公開
window.cloudStore = {
  getFamilyCode,
  setFamilyCode,
  subscribe,
  wipeLocalAssets,
  setAsset,
  removeAsset,
  getAsset,      // localStorage → memCache の順で値を取得
  memCache,      // デバッグ用に露出
  MAX_DATA_SIZE,
};
window.dispatchEvent(new Event('cloud-store-ready'));
console.log('[cloudStore] 準備完了 familyCode=' + getFamilyCode());
