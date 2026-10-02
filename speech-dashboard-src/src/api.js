import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from 'firebase/app-check';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const cloud = !!import.meta.env.VITE_FIREBASE_API_KEY;
let auth, check;
if (cloud) {
  const app = initializeApp({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID });
  auth = getAuth(app);
  if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) check = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
export const watchUser = callback => auth ? onAuthStateChanged(auth, callback) : () => {};
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
export async function request(path, options = {}) {
  const headers = {};
  if (cloud) {
    if (!auth.currentUser) throw new Error('AUTH_REQUIRED');
    if (!check) throw new Error('APPCHECK_NOT_CONFIGURED');
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    headers['X-Firebase-AppCheck'] = (await getToken(check, false)).token;
  }
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response;
  try { response = await fetch(`${API_BASE}/api/speech${path}`, { ...options, headers, signal: AbortSignal.timeout(900000) }); }
  catch { throw new Error('SERVER_UNAVAILABLE'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('SERVER_UNAVAILABLE'); }
  if (!response.ok) throw new Error(data.code || 'SERVER_ERROR');
  return data;
}
export const MESSAGES = { AUTH_REQUIRED: 'ログインが必要です。', ANALYST_REQUIRED: '分析者の権限が必要です。', APPCHECK_NOT_CONFIGURED: '接続設定が未完了です。', SERVER_UNAVAILABLE: 'サーバーに接続できません。READMEの起動手順をご確認ください。', INVALID_METADATA: '参加者・分類・区間を確認してください。区間は12時間以内です。', INVALID_AUDIO: '対応する音声ファイルを選んでください。', INVALID_DURATION: '分析区間が録音の範囲外、または12時間を超えています。開始秒を確認してください。終了秒を空欄にすると録音末尾まで分析します。', FILE_TOO_LARGE: '音声ファイルの上限は512MBです。', BUSY: '別の分析を処理中です。少し待って再試行してください。', RATE_LIMIT: '処理回数の上限です。時間をおいて再試行してください。', PROCESSING_FAILED: '音声処理または保存に失敗しました。診断情報をコピーできます。', INVALID_FEEDBACK: '本文を確認し、少し待って送信してください。', DUPLICATE_FEEDBACK: '同じ内容は受付済みです。', TOO_MANY_UTTERANCES: '発言数が多すぎます。短い区間に分けてください。' };
