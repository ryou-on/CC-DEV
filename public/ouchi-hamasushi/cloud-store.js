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

const DEFAULT_FAMILY_CODE = 'default';
const FAMILY_KEY = 'setting_familyCode';
const MAX_DATA_SIZE = 900 * 1024; // 900KB (Firestore 1MB 制限に余裕)

function getFamilyCode() {
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

// familyCode の assets コレクションを監視。変更があれば localStorage に反映し onUpdate() を呼ぶ
function subscribe(familyCode, onUpdate) {
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  currentCode = familyCode;
  currentOnUpdate = onUpdate;

  const col = collection(db, 'ouchi-hamasushi', familyCode, 'assets');
  currentUnsubscribe = onSnapshot(col, (snap) => {
    let changed = false;
    snap.docChanges().forEach(change => {
      const key = change.doc.id;
      try {
        if (change.type === 'removed') {
          localStorage.removeItem(key);
          changed = true;
        } else {
          const data = change.doc.data();
          if (data && typeof data.data === 'string') {
            localStorage.setItem(key, data.data);
            changed = true;
          }
        }
      } catch (e) {
        console.warn('[cloudStore] localStorage write failed:', key, e);
      }
    });
    if (changed && typeof currentOnUpdate === 'function') {
      currentOnUpdate();
    }
  }, (err) => {
    console.error('[cloudStore] subscribe error:', err);
  });

  return currentUnsubscribe;
}

// 家族コード切替: ローカルキャッシュをクリアしてから再サブスクライブ
// (古いコードのデータが残っているのを防ぐ)
function wipeLocalAssets() {
  const keys = Object.keys(localStorage)
    .filter(k => k.startsWith('voice_') || k.startsWith('image_'));
  keys.forEach(k => localStorage.removeItem(k));
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
  MAX_DATA_SIZE,
};
window.dispatchEvent(new Event('cloud-store-ready'));
console.log('[cloudStore] 準備完了 familyCode=' + getFamilyCode());
