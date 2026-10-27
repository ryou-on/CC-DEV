// firestore.rules 単体テスト（正常操作は通り、不正操作は拒否されること）
// 実行: npm i -D firebase-tools @firebase/rules-unit-testing firebase（リポジトリ外の作業ディレクトリ推奨）
//       npx firebase emulators:exec --only firestore --project demo-cc-dev "node tests/firestore-rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, increment, serverTimestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-cc-dev', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')},
});
const anon = env.unauthenticatedContext().firestore();
const editor = env.authenticatedContext('robby', { email: 'junpei.omote@gmail.com' }).firestore();
const other = env.authenticatedContext('eve', { email: 'eve@example.com' }).firestore();
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  NG  ', name, '-', e.message.split('\n')[0]); } }
const ok = (n, f) => t(n, assertSucceeds(f()));
const ng = (n, f) => t(n, assertFails(f()));

// 事前データ
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await setDoc(doc(d, 'apps/a1'), { name: 'x', rating: 0 });
  await setDoc(doc(d, 'playlists/pl1'), { name: 'PL' });
  await setDoc(doc(d, 'playlist_analytics/pl1'), { viewCount: 5 });
  await setDoc(doc(d, 'video_analytics/v1'), { playCount: 3, videoId: 'vid', 'playlists.old': 1 });
  await setDoc(doc(d, 'ouchi-hamasushi/default/assets/voice_otousan_まぐろ'), { data: 'x', mimeType: '', size: 1 });
  await setDoc(doc(d, 'tomoe-player/ABC123/sessions/lx9k2abc'), { videoId: 'v' });
  await setDoc(doc(d, 'meet-knowledge/default/entries/0b6c2f1e-1111-2222-3333-444455556666'), { question: 'q' });
  await setDoc(doc(d, 'note-analytics/default/snapshots/20260420'), { weekStart: '2026-04-20', views: 1, likes: 0, followers: 0, comments: 0, source: 'manual' });
});

console.log('apps (app-dashboard)');
await ok('匿名で読める', () => getDocs(collection(anon, 'apps')));
await ng('匿名で追加不可', () => addDoc(collection(anon, 'apps'), { name: 'evil' }));
await ng('匿名で更新(評価)不可', () => updateDoc(doc(anon, 'apps/a1'), { rating: 5 }));
await ng('匿名で削除不可', () => deleteDoc(doc(anon, 'apps/a1')));
await ng('編集者以外のGoogleアカウントは不可', () => updateDoc(doc(other, 'apps/a1'), { rating: 5 }));
await ok('編集者は追加可', () => addDoc(collection(editor, 'apps'), { name: 'new', updatedAt: serverTimestamp() }));
await ok('編集者は評価可', () => updateDoc(doc(editor, 'apps/a1'), { rating: 4 }));
await ok('編集者は削除可', () => deleteDoc(doc(editor, 'apps/a1')));

console.log('ouchi-hamasushi');
await ok('匿名で保存可', () => setDoc(doc(anon, 'ouchi-hamasushi/default/assets/image_まぐろ'), { data: 'data:image/jpeg;base64,xx', mimeType: 'image/jpeg', size: 10, updatedAt: serverTimestamp() }));
await ok('匿名で voice_ 削除可', () => deleteDoc(doc(anon, 'ouchi-hamasushi/default/assets/voice_otousan_まぐろ')));
await ok('匿名で image_ 削除可', () => deleteDoc(doc(anon, 'ouchi-hamasushi/default/assets/image_まぐろ')));
await ng('不正な assetKey は削除不可', () => deleteDoc(doc(anon, 'ouchi-hamasushi/default/assets/foo')));
await ng('65文字超の家族コードは削除不可', () => deleteDoc(doc(anon, 'ouchi-hamasushi/' + 'a'.repeat(65) + '/assets/voice_x')));

console.log('note-analytics');
const mine = env.authenticatedContext('robby', { email: 'junpei.omote@gmail.com' }).firestore();
const snap = { weekStart: '2026-04-27', views: 10, likes: 1, followers: 2, comments: 0, source: 'manual', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
await ok('本人は自分の uid に保存可', () => setDoc(doc(mine, 'note-analytics/robby/snapshots/20260427'), snap, { merge: true }));
await ok('本人は読める', () => getDocs(collection(mine, 'note-analytics/robby/snapshots')));
await ok('本人は削除可', () => deleteDoc(doc(mine, 'note-analytics/robby/snapshots/20260427')));
await ng('匿名は読めない', () => getDocs(collection(anon, 'note-analytics/default/snapshots')));
await ng('匿名は書けない', () => setDoc(doc(anon, 'note-analytics/default/snapshots/20260427'), snap));
await ng('匿名は削除不可', () => deleteDoc(doc(anon, 'note-analytics/default/snapshots/20260420')));
await ng('他人の uid には書けない', () => setDoc(doc(other, 'note-analytics/robby/snapshots/20260427'), snap));
await ng('他人の uid は読めない', () => getDocs(collection(other, 'note-analytics/robby/snapshots')));
await ng('余計なフィールドは不可', () => setDoc(doc(mine, 'note-analytics/robby/snapshots/20260427'), { ...snap, evil: 'x' }));
await ng('snapshots 以外のパスは不可', () => setDoc(doc(mine, 'note-analytics/robby/other/x'), snap));
await ok('編集者は旧データを読める（移行用）', () => getDocs(collection(editor, 'note-analytics/default/snapshots')));
await ng('編集者も旧データは書き換え不可', () => setDoc(doc(editor, 'note-analytics/default/snapshots/20260420'), snap));

console.log('tomoe-player sessions');
const s = { videoId: 'abc', title: 't', startedAt: '2026-10-27T10:00:00Z', day: '2026-10-27', dow: 1, hour: 10, watchSec: 30, maxPos: 30, duration: 60, completed: false, endReason: '', endedAt: '', device: 'ipad', startReason: 'tap' };
await ok('匿名で視聴ログ作成可', () => setDoc(doc(anon, 'tomoe-player/ABC123/sessions/mh7x1k2q9z'), s, { merge: true }));
await ok('中断クローズ(merge)可', () => setDoc(doc(anon, 'tomoe-player/ABC123/sessions/mh7x1k2q9z'), { endReason: 'abort', endedAt: 'x' }, { merge: true }));
await ok('保護者は削除可', () => deleteDoc(doc(anon, 'tomoe-player/ABC123/sessions/lx9k2abc')));
await ng('不正なID形式は削除不可', () => deleteDoc(doc(anon, 'tomoe-player/ABC123/sessions/AB$x')));

console.log('playlist_analytics');
await ok('表示カウント +1 可', () => setDoc(doc(anon, 'playlist_analytics/pl1'), { viewCount: increment(1), lastViewed: serverTimestamp() }, { merge: true }));
await ng('任意値の上書き不可', () => setDoc(doc(anon, 'playlist_analytics/pl1'), { viewCount: 99999, lastViewed: serverTimestamp() }, { merge: true }));
await ng('余計なフィールド不可', () => setDoc(doc(anon, 'playlist_analytics/pl1'), { viewCount: increment(1), lastViewed: serverTimestamp(), x: 1 }, { merge: true }));
await ng('存在しないプレイリストは不可', () => setDoc(doc(anon, 'playlist_analytics/nope'), { viewCount: increment(1), lastViewed: serverTimestamp() }, { merge: true }));
await ng('匿名で削除不可', () => deleteDoc(doc(anon, 'playlist_analytics/pl1')));
await ok('編集者は削除可', () => deleteDoc(doc(editor, 'playlist_analytics/pl1')));
await ok('削除後の初回作成(=1)可', () => setDoc(doc(anon, 'playlist_analytics/pl1'), { viewCount: increment(1), lastViewed: serverTimestamp() }, { merge: true }));

console.log('video_analytics');
const vplay = (pl) => ({ playCount: increment(1), lastPlayed: serverTimestamp(), videoId: 'vid', playlists: { [pl]: increment(1) } });
await ok('再生カウント +1（既存・旧ドットキーあり）', () => setDoc(doc(anon, 'video_analytics/v1'), vplay('pl1'), { merge: true }));
await ok('新規動画の初回作成', () => setDoc(doc(anon, 'video_analytics/v2'), vplay('pl1'), { merge: true }));
await ok('2回目（playlists 加算）', () => setDoc(doc(anon, 'video_analytics/v2'), vplay('pl1'), { merge: true }));
await ok('videoId なし・プレイリストなし', () => setDoc(doc(anon, 'video_analytics/v3'), { playCount: increment(1), lastPlayed: serverTimestamp() }, { merge: true }));
let r; await env.withSecurityRulesDisabled(async c => { r = (await getDoc(doc(c.firestore(), 'video_analytics/v2'))).data(); });
await t('playlists がネストで加算される', r.playlists?.pl1 === 2 && r.playCount === 2 ? Promise.resolve() : Promise.reject(new Error(JSON.stringify(r))));
await ng('任意値の上書き不可', () => setDoc(doc(anon, 'video_analytics/v1'), { playCount: 0, lastPlayed: serverTimestamp() }, { merge: true }));
await ng('余計なフィールド不可', () => setDoc(doc(anon, 'video_analytics/v1'), { playCount: increment(1), lastPlayed: serverTimestamp(), spam: 'x' }, { merge: true }));
await ng('playlists を一度に複数改ざん不可', () => setDoc(doc(anon, 'video_analytics/v1'), { playCount: increment(1), lastPlayed: serverTimestamp(), playlists: { a: 1, b: 1 } }, { merge: true }));
await ng('匿名で削除不可', () => deleteDoc(doc(anon, 'video_analytics/v1')));

console.log('meet-knowledge');
const e = { question: 'q', answer: 'a', keywords: [], category: '', createdAt: 1, updatedAt: 1, hits: 0, source: 'manual' };
await ok('匿名で保存可', () => setDoc(doc(anon, 'meet-knowledge/default/entries/0b6c2f1e-aaaa-2222-3333-444455556666'), e));
await ok('hits 加算可', () => updateDoc(doc(anon, 'meet-knowledge/default/entries/0b6c2f1e-aaaa-2222-3333-444455556666'), { hits: increment(1), updatedAt: 2 }));
await ok('匿名で削除可', () => deleteDoc(doc(anon, 'meet-knowledge/default/entries/0b6c2f1e-1111-2222-3333-444455556666')));
await ng('不正なチームコードは削除不可', () => deleteDoc(doc(anon, 'meet-knowledge/bad$code/entries/x')));

console.log('その他');
await ng('未定義コレクションは不可', () => setDoc(doc(anon, 'random/x'), { a: 1 }));

console.log(`\n結果: ${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
