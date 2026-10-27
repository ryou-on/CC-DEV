// Firestore ルールの許可・拒否テスト（アプリと同じ書き込み方で検証）
// 実行: cd tests/firestore-rules && npm install && npm test
//   （Java が必要。リポジトリ直下の firestore.rules をエミュレータで検証する）
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, addDoc, collection, increment, serverTimestamp, setLogLevel } from 'firebase/firestore';
import fs from 'fs';
setLogLevel('error');
const env = await initializeTestEnvironment({ projectId: 'demo-cc', firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const anon = env.unauthenticatedContext().firestore();
const anonUser = env.authenticatedContext('anon-uid', { firebase: { sign_in_provider: 'anonymous' } }).firestore(); // 匿名ログイン（メールなし）
const owner = env.authenticatedContext('owner', { email: 'junpei.omote@gmail.com', email_verified: true }).firestore();
const other = env.authenticatedContext('other', { email: 'someone@example.com', email_verified: true }).firestore();
let pass = 0, fail = 0;
const t = async (name, p) => { try { await p; pass++; console.log('✅', name); } catch (e) { fail++; console.log('❌', name, '-', e.message.slice(0, 120)); } };
const seed = async (path, data) => env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), path), data));

// --- app-dashboard / note-analytics: オーナーのみ ---
await t('apps: 未ログインは読めない', assertFails(getDoc(doc(anon, 'apps/a1'))));
await t('apps: 未ログインは書けない', assertFails(setDoc(doc(anon, 'apps/a1'), { name: 'x' })));
await t('apps: 他人のメールは書けない', assertFails(setDoc(doc(other, 'apps/a1'), { name: 'x' })));
await t('apps: 匿名ログインは書けない', assertFails(setDoc(doc(anonUser, 'apps/a1'), { name: 'x' })));
await t('apps: オーナーは書ける', assertSucceeds(addDoc(collection(owner, 'apps'), { name: 'x', updatedAt: serverTimestamp() })));
await t('apps: オーナーは消せる', assertSucceeds(deleteDoc(doc(owner, 'apps/a1'))));
await t('note-analytics: 未ログインは読めない', assertFails(getDoc(doc(anon, 'note-analytics/default/snapshots/w1'))));
await t('note-analytics: オーナーは読み書きできる', assertSucceeds(setDoc(doc(owner, 'note-analytics/default/snapshots/w1'), { views: 1 }, { merge: true })));
await t('note-analytics: 他人は読めない', assertFails(getDoc(doc(other, 'note-analytics/default/snapshots/w1'))));

// --- 削除は匿名ログイン必須（作成・閲覧は従来どおり未ログイン可） ---
await t('ouchi: 未ログインでも作成できる（従来どおり）', assertSucceeds(setDoc(doc(anon, 'ouchi-hamasushi/fam/assets/voice_x'), { data: 'data:audio/mpeg;base64,AA', mimeType: 'audio/mpeg', size: 10, updatedAt: serverTimestamp() })));
await t('ouchi: 未ログインは削除できない', assertFails(deleteDoc(doc(anon, 'ouchi-hamasushi/fam/assets/voice_x'))));
await t('ouchi: 匿名ログインなら削除できる', assertSucceeds(deleteDoc(doc(anonUser, 'ouchi-hamasushi/fam/assets/voice_x'))));
await t('ouchi: 他のメールでログインしても削除できる', assertSucceeds(deleteDoc(doc(other, 'ouchi-hamasushi/fam/assets/voice_y'))));
await seed('tomoe-player/L1/sessions/s1', { videoId: 'v' });
await t('tomoe sessions: 未ログインは削除できない', assertFails(deleteDoc(doc(anon, 'tomoe-player/L1/sessions/s1'))));
await t('tomoe sessions: 匿名ログインなら削除できる', assertSucceeds(deleteDoc(doc(anonUser, 'tomoe-player/L1/sessions/s1'))));
await t('meet-knowledge: 未ログインでも作成できる（従来どおり）', assertSucceeds(setDoc(doc(anon, 'meet-knowledge/T/entries/e1'), { question: 'q', answer: 'a', keywords: [] })));
await t('meet-knowledge: 未ログインは削除できない', assertFails(deleteDoc(doc(anon, 'meet-knowledge/T/entries/e1'))));
await t('meet-knowledge: 匿名ログインなら削除できる', assertSucceeds(deleteDoc(doc(anonUser, 'meet-knowledge/T/entries/e1'))));

// --- hihaho-view のカウンター: +1 だけ ---
const pv = () => ({ viewCount: increment(1), lastViewed: serverTimestamp() }); // hihaho-view と同じ書き方
await t('playlist: 初回 +1 できる', assertSucceeds(setDoc(doc(anon, 'playlist_analytics/p1'), pv(), { merge: true })));
await t('playlist: 2回目 +1 できる', assertSucceeds(setDoc(doc(anon, 'playlist_analytics/p1'), pv(), { merge: true })));
await t('playlist: 任意の値に書き換えられない', assertFails(setDoc(doc(anon, 'playlist_analytics/p1'), { viewCount: 99999, lastViewed: serverTimestamp() }, { merge: true })));
await t('playlist: +5 はできない', assertFails(setDoc(doc(anon, 'playlist_analytics/p1'), { viewCount: increment(5), lastViewed: serverTimestamp() }, { merge: true })));
await t('playlist: 余計な項目は書けない', assertFails(setDoc(doc(anon, 'playlist_analytics/p1'), { ...pv(), spam: 'x' }, { merge: true })));
await t('playlist: 削除できない', assertFails(deleteDoc(doc(anon, 'playlist_analytics/p1'))));
const vp = (pl) => { const d = { playCount: increment(1), lastPlayed: serverTimestamp(), videoId: 'abc123' }; if (pl) d[`playlists.${pl}`] = increment(1); return d; };
await t('video: 初回 +1（プレイリスト付き）できる', assertSucceeds(setDoc(doc(anon, 'video_analytics/u1'), vp('p1'), { merge: true })));
await t('video: 2回目 +1 できる', assertSucceeds(setDoc(doc(anon, 'video_analytics/u1'), vp('p1'), { merge: true })));
await t('video: プレイリストなしでも +1 できる', assertSucceeds(setDoc(doc(anon, 'video_analytics/u2'), vp(null), { merge: true })));
await t('video: 任意の値に書き換えられない', assertFails(setDoc(doc(anon, 'video_analytics/u1'), { playCount: 99999, lastPlayed: serverTimestamp(), videoId: 'abc123' }, { merge: true })));
await t('video: 大量の項目を足せない', assertFails(setDoc(doc(anon, 'video_analytics/u1'), { ...vp(null), a: 1, b: 2, c: 3, d: 4 }, { merge: true })));
await t('video: 削除できない', assertFails(deleteDoc(doc(anon, 'video_analytics/u1'))));
await t('video: 管理画面（オーナー）は読める', assertSucceeds(getDoc(doc(owner, 'video_analytics/u1'))));
console.log(`\n${pass} passed / ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
