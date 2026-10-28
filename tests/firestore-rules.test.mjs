// firestore.rules 単体テスト（正当な書き込みは通り、塞いだ操作は拒否されること）
// 実行: npm i -D firebase firebase-tools @firebase/rules-unit-testing
//       npx firebase emulators:exec --only firestore --project demo-cc-dev "node tests/firestore-rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, collectionGroup, increment, serverTimestamp, query, orderBy, limit, runTransaction, arrayUnion } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-cc-dev', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')},
});
const anon = env.unauthenticatedContext().firestore();
// 本番の Google ログインと同じく email_verified を付ける
const editor = env.authenticatedContext('robby', { email: 'junpei.omote@gmail.com', email_verified: true }).firestore();
const other = env.authenticatedContext('eve', { email: 'eve@example.com', email_verified: true }).firestore();
const unverifiedEditor = env.authenticatedContext('spoof', { email: 'junpei.omote@gmail.com', email_verified: false }).firestore();
const unverifiedSpline = env.authenticatedContext('spoof2', { email: 'ceo@splineglobal.com', email_verified: false }).firestore();
const spline = env.authenticatedContext('spline', { email: 'jumpei.omote@splineglobal.com', email_verified: true }).firestore();
const pilot = env.authenticatedContext('pilot', { email: 'pilot@example.com', email_verified: true }).firestore();
const alice = env.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true }).firestore();
const friend = env.authenticatedContext('friend', { email: 'friend@example.com', email_verified: true }).firestore();
const meiyusha = env.authenticatedContext('mei', { email: 'meiyusha@meiyusha-estimate.app', email_verified: false }).firestore();
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
  await setDoc(doc(d, 'outreach-crm/acme'), { leads: [{ company: '株式会社サンプル', contactName: '山田', email: 'taro@example.com' }], updatedAt: 1 });
  await setDoc(doc(d, 'tomoe-home/config'), { apps: [{ id: 'abc-world', name: 'ワールドABC', icon: '🌍', url: 'https://example.test/', desc: '' }] });
  await setDoc(doc(d, 'tomoe-player/ABC123'), { videos: [{ id: 'vid', title: 't' }], sources: '', name: '', updatedAt: '2026-10-28T00:00:00.000Z' });
  await setDoc(doc(d, 'meiyusha-estimate/config'), { json: '{"tiers":[]}' });
  await setDoc(doc(d, 'hondoko-books/b1'), { title: '本' });
  await setDoc(doc(d, 'hondoko-config/sharing'), { mode: 'viewers', allowComments: true });
  await setDoc(doc(d, 'hondoko-config/viewers'), { emails: ['eve@example.com'] });
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
const ouchiAsset = { data: 'data:image/jpeg;base64,xx', mimeType: 'image/jpeg', size: 10, updatedAt: serverTimestamp() };
await ng('匿名では保存できない', () => setDoc(doc(anon, 'ouchi-hamasushi/default/assets/image_まぐろ'), ouchiAsset));
await ng('匿名では voice_ を削除できない', () => deleteDoc(doc(anon, 'ouchi-hamasushi/default/assets/voice_otousan_まぐろ')));
await ng('確認済みでも短い家族コードは書けない', () => setDoc(doc(other, 'ouchi-hamasushi/default/assets/image_eve'), ouchiAsset));
await ng('確認済みでも短い家族コードは削除できない', () => deleteDoc(doc(other, 'ouchi-hamasushi/default/assets/voice_otousan_まぐろ')));
await ok('編集者は短い家族コードに保存できる', () => setDoc(doc(editor, 'ouchi-hamasushi/default/assets/image_まぐろ'), ouchiAsset));
await ok('編集者は voice_ を削除できる', () => deleteDoc(doc(editor, 'ouchi-hamasushi/default/assets/voice_otousan_まぐろ')));
await ok('編集者は image_ を削除できる', () => deleteDoc(doc(editor, 'ouchi-hamasushi/default/assets/image_まぐろ')));
await ng('確認済みでも15文字の家族コードは書けない', () => setDoc(doc(other, 'ouchi-hamasushi/' + 'e'.repeat(15) + '/assets/image_x'), ouchiAsset));
await ng('確認済みでも15文字の家族コードは削除できない', () => deleteDoc(doc(other, 'ouchi-hamasushi/' + 'e'.repeat(15) + '/assets/voice_x')));
await ok('確認済みユーザーは16文字の家族コードに保存できる', () => setDoc(doc(other, 'ouchi-hamasushi/' + 'c'.repeat(16) + '/assets/image_x'), ouchiAsset));
await ok('確認済みユーザーは64文字の家族コードに保存できる', () => setDoc(doc(other, 'ouchi-hamasushi/' + 'c'.repeat(64) + '/assets/image_x'), ouchiAsset));
await ng('確認済みでも65文字の家族コードは書けない', () => setDoc(doc(other, 'ouchi-hamasushi/' + 'c'.repeat(65) + '/assets/image_x'), ouchiAsset));
await ng('不正な assetKey は削除不可', () => deleteDoc(doc(editor, 'ouchi-hamasushi/default/assets/foo')));
await ng('65文字の家族コードは削除不可', () => deleteDoc(doc(editor, 'ouchi-hamasushi/' + 'a'.repeat(65) + '/assets/voice_x')));

console.log('note-analytics');
const mine = env.authenticatedContext('robby', { email: 'junpei.omote@gmail.com', email_verified: true }).firestore();
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
const kid = env.authenticatedContext('kid-device').firestore();
const s = { uid: 'kid-device', videoId: 'abc', title: 't', startedAt: '2026-10-27T10:00:00Z', day: '2026-10-27', dow: 1, hour: 10, watchSec: 30, maxPos: 30, duration: 60, completed: false, endReason: '', endedAt: '', device: 'ipad', startReason: 'tap' };
await ng('未ログインでは視聴ログを作れない', () => setDoc(doc(anon, 'tomoe-player/ABC123/sessions/mh7x1k2q9z'), s, { merge: true }));
await ok('再生した端末は視聴ログを作れる', () => setDoc(doc(kid, 'tomoe-player/ABC123/sessions/mh7x1k2q9z'), s, { merge: true }));
await ok('同じ端末の中断クローズ(merge)可', () => setDoc(doc(kid, 'tomoe-player/ABC123/sessions/mh7x1k2q9z'), { endReason: 'abort', endedAt: 'x' }, { merge: true }));
await ok('再生した端末は自分の視聴ログを読める', () => getDoc(doc(kid, 'tomoe-player/ABC123/sessions/mh7x1k2q9z')));
await ng('未ログインは視聴ログを1件読めない', () => getDoc(doc(anon, 'tomoe-player/ABC123/sessions/mh7x1k2q9z')));
await ng('別の端末は他人の視聴ログを読めない', () => getDoc(doc(other, 'tomoe-player/ABC123/sessions/mh7x1k2q9z')));
await ng('未ログインは視聴ログを一覧できない', () => getDocs(collection(anon, 'tomoe-player/ABC123/sessions')));
await ng('再生端末は視聴ログを一覧できない', () => getDocs(collection(kid, 'tomoe-player/ABC123/sessions')));
await ok('編集者は視聴ログを一覧できる', () => getDocs(collection(editor, 'tomoe-player/ABC123/sessions')));
await ng('別の端末は視聴ログを改ざんできない', () => setDoc(doc(other, 'tomoe-player/ABC123/sessions/mh7x1k2q9z'), { ...s, uid: 'eve', title: 'hacked' }, { merge: true }));
await ng('未ログインでは視聴ログを削除できない', () => deleteDoc(doc(anon, 'tomoe-player/ABC123/sessions/lx9k2abc')));
await ng('別の端末は他人の視聴ログを削除できない', () => deleteDoc(doc(other, 'tomoe-player/ABC123/sessions/mh7x1k2q9z')));
await ok('再生した端末は自分の視聴ログを削除できる', () => deleteDoc(doc(kid, 'tomoe-player/ABC123/sessions/mh7x1k2q9z')));
await ok('編集者は uid のない既存ログを削除できる', () => deleteDoc(doc(editor, 'tomoe-player/ABC123/sessions/lx9k2abc')));
await ng('不正なID形式は削除不可', () => deleteDoc(doc(editor, 'tomoe-player/ABC123/sessions/AB$x')));

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
const meetId = '0b6c2f1e-aaaa-2222-3333-444455556666';
await ng('匿名ではナレッジを保存できない', () => setDoc(doc(anon, 'meet-knowledge/default/entries/' + meetId), e));
await ng('匿名ではナレッジを削除できない', () => deleteDoc(doc(anon, 'meet-knowledge/default/entries/0b6c2f1e-1111-2222-3333-444455556666')));
await ng('確認済みでも短いチームコードは書けない', () => setDoc(doc(other, 'meet-knowledge/default/entries/' + meetId), e));
await ok('編集者は default に保存できる', () => setDoc(doc(editor, 'meet-knowledge/default/entries/' + meetId), e));
await ok('編集者は hits を加算できる', () => updateDoc(doc(editor, 'meet-knowledge/default/entries/' + meetId), { hits: increment(1), updatedAt: 2 }));
await ok('編集者はナレッジを削除できる', () => deleteDoc(doc(editor, 'meet-knowledge/default/entries/0b6c2f1e-1111-2222-3333-444455556666')));
await ng('確認済みでも15文字のチームコードは書けない', () => setDoc(doc(other, 'meet-knowledge/' + 'e'.repeat(15) + '/entries/' + meetId), e));
await ng('確認済みでも15文字のチームコードは削除できない', () => deleteDoc(doc(other, 'meet-knowledge/' + 'e'.repeat(15) + '/entries/' + meetId)));
await ok('確認済みユーザーは16文字のチームコードに保存できる', () => setDoc(doc(other, 'meet-knowledge/' + 'd'.repeat(16) + '/entries/' + meetId), e));
await ok('確認済みユーザーは64文字のチームコードに保存できる', () => setDoc(doc(other, 'meet-knowledge/' + 'd'.repeat(64) + '/entries/' + meetId), e));
await ng('確認済みでも65文字のチームコードは書けない', () => setDoc(doc(other, 'meet-knowledge/' + 'd'.repeat(65) + '/entries/' + meetId), e));
await ng('不正なチームコードは削除不可', () => deleteDoc(doc(editor, 'meet-knowledge/bad$code/entries/x')));

console.log('その他');
await ng('未定義コレクションは不可', () => setDoc(doc(anon, 'random/x'), { a: 1 }));

console.log('H3 email_verified');
await ng('未確認の junpei メールでは apps を書けない', () => setDoc(doc(unverifiedEditor, 'apps/spoof'), { name: 'x' }));
await ng('未確認の spline メールでは playlists を書けない', () => setDoc(doc(unverifiedSpline, 'playlists/evil'), { name: 'x' }));
await ok('確認済みの spline 編集者は playlists を書ける', () => setDoc(doc(spline, 'playlists/pl-ok'), { name: 'ok' }));
await ng('未確認の junpei メールでは単価を読めない', () => getDoc(doc(unverifiedEditor, 'meiyusha-estimate/config')));
await ng('未確認の spline メールでは単価を読めない', () => getDoc(doc(unverifiedSpline, 'meiyusha-estimate/config')));
await ok('確認済み編集者は単価を読める', () => getDoc(doc(editor, 'meiyusha-estimate/config')));
await ok('明友社パスワードアカウントは未確認でも単価を読める', () => getDoc(doc(meiyusha, 'meiyusha-estimate/config')));
await ng('無関係な確認済みユーザーは単価を読めない', () => getDoc(doc(other, 'meiyusha-estimate/config')));
await ng('未確認の junpei メールではメンバー名簿を書けない', () => setDoc(doc(unverifiedEditor, 'hondoko-config/members'), { emails: ['spoof@splineglobal.com'] }));
await ok('確認済みオーナーはメンバー名簿を書ける', () => setDoc(doc(editor, 'hondoko-config/members'), { emails: ['friend@example.com'] }));
await ng('確認済みでもオーナー以外はメンバー名簿を書けない', () => setDoc(doc(other, 'hondoko-config/members'), { emails: ['eve@example.com'] }));
await ok('オーナーは閲覧者メールを書ける', () => setDoc(doc(editor, 'hondoko-config/viewers'), { emails: ['eve@example.com'] }));
await ok('オーナーは閲覧者メールを読める', () => getDoc(doc(editor, 'hondoko-config/viewers')));
await ok('家族メンバーは閲覧者メールを読める', () => getDoc(doc(friend, 'hondoko-config/viewers')));
await ng('未ログインは閲覧者メールを読めない', () => getDoc(doc(anon, 'hondoko-config/viewers')));
await ng('閲覧者本人はメール一覧を読めない', () => getDoc(doc(other, 'hondoko-config/viewers')));
await ng('無関係なユーザーは閲覧者メールを読めない', () => getDoc(doc(pilot, 'hondoko-config/viewers')));
await ng('未確認ユーザーは閲覧者メールを読めない', () => getDoc(doc(unverifiedEditor, 'hondoko-config/viewers')));
await ng('閲覧者以外は閲覧者メールを書けない', () => setDoc(doc(other, 'hondoko-config/viewers'), { emails: ['eve@example.com'] }));
await ng('共有設定に viewers は書けない', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'viewers', viewers: ['eve@example.com'], allowComments: true }));
await ng('共有設定に linkKey は書けない', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'link', allowComments: false, linkKey: 'abcdefghij1234567890AB' }));
await ok('メールの無い共有設定は未ログインで読める', () => getDoc(doc(anon, 'hondoko-config/sharing')));
await ok('確認済みオーナーは蔵書を書ける', () => setDoc(doc(editor, 'hondoko-books/b2'), { title: '追加' }));
await ng('未確認のオーナーメールでは蔵書を書けない', () => setDoc(doc(unverifiedEditor, 'hondoko-books/b3'), { title: '盗む' }));
await ok('確認済みオーナーは評価を書ける', () => setDoc(doc(editor, 'hondoko-reviews/b1_junpei'), {
  bookId: 'b1', by: 'junpei.omote@gmail.com', byName: 'ロビー', rating: 4, memo: '良い', updatedAt: serverTimestamp(),
}));
await ng('未確認の同じメールでは評価を書けない', () => setDoc(doc(unverifiedEditor, 'hondoko-reviews/b1_spoof'), {
  bookId: 'b1', by: 'junpei.omote@gmail.com', byName: '偽', rating: 1, memo: '', updatedAt: serverTimestamp(),
}));
await ok('確認済みビューワーは本を読める', () => getDoc(doc(other, 'hondoko-books/b1')));
await ng('未確認ビューワーは本を読めない', () => getDoc(doc(env.authenticatedContext('eve2', { email: 'eve@example.com', email_verified: false }).firestore(), 'hondoko-books/b1')));
await ok('確認済みビューワーはコメントを書ける', () => addDoc(collection(other, 'hondoko-comments'), {
  bookId: 'b1', text: '読んだ', by: 'eve@example.com', byName: 'Eve', createdAt: serverTimestamp(),
}));
await ok('オーナーは共有を public にできる', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'public', allowComments: false }));
await ok('public なら未ログインでも本を読める', () => getDoc(doc(anon, 'hondoko-books/b1')));
await ok('public なら未ログインでも蔵書を一覧できる', () => getDocs(collection(anon, 'hondoko-books')));
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await setDoc(doc(d, 'hondoko-config/sharing'), { mode: 'viewers', viewers: ['eve@example.com'], allowComments: true, linkKey: 'legacy' });
  await deleteDoc(doc(d, 'hondoko-config/viewers'));
});
await ng('メール入りの共有設定は未ログインで読めない', () => getDoc(doc(anon, 'hondoko-config/sharing')));
await ng('メール入りの共有設定は閲覧者本人も読めない', () => getDoc(doc(other, 'hondoko-config/sharing')));
await ok('メール入りの共有設定はオーナーが読める', () => getDoc(doc(editor, 'hondoko-config/sharing')));
await ok('旧 viewers フィールドでも確認済み閲覧者は本を読める', () => getDoc(doc(other, 'hondoko-books/b1')));
await ng('旧 viewers フィールドでも未ログインは本を読めない', () => getDoc(doc(anon, 'hondoko-books/b1')));
await ok('オーナーは共有設定からメールを外して public に戻せる', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'public', allowComments: false }));
const linkKey = 'abcdefghij1234567890AB';
const linkGuest = env.authenticatedContext('link-guest').firestore();
await ng('未ログインはリンク鍵を読めない', () => getDoc(doc(anon, 'hondoko-config/link')));
await ng('閲覧者はリンク鍵を読めない', () => getDoc(doc(other, 'hondoko-config/link')));
await ok('オーナーはリンク鍵を保存できる', () => setDoc(doc(editor, 'hondoko-config/link'), { key: linkKey }));
await ok('家族はリンク鍵を読める', () => getDoc(doc(friend, 'hondoko-config/link')));
await ng('オーナー以外はリンク鍵を書けない', () => setDoc(doc(friend, 'hondoko-config/link'), { key: linkKey }));
await ok('オーナーは共有を link にできる', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'link', allowComments: true }));
await ok('link でも鍵の無い共有設定は未ログインで読める', () => getDoc(doc(anon, 'hondoko-config/sharing')));
await ng('link では未ログインは本を読めない', () => getDoc(doc(anon, 'hondoko-books/b1')));
await ng('link では未ログインは蔵書を一覧できない', () => getDocs(collection(anon, 'hondoko-books')));
await ng('link では未ログインは棚を一覧できない', () => getDocs(collection(anon, 'hondoko-shelves')));
await ng('link では鍵を知らないログインユーザーは蔵書を一覧できない', () => getDocs(collection(other, 'hondoko-books')));
await ng('間違った鍵ではセッションを作れない', () => setDoc(doc(linkGuest, 'hondoko-link-sessions/link-guest'), { key: 'zzzzzzzzzzzzzzzzzzzzzz' }));
await ng('セッション一覧は不可', () => getDocs(collection(anon, 'hondoko-link-sessions')));
await ok('正しい鍵でセッションを作れる', () => setDoc(doc(linkGuest, 'hondoko-link-sessions/link-guest'), { key: linkKey }));
await ng('他人のセッションは読めない', () => getDoc(doc(other, 'hondoko-link-sessions/link-guest')));
await ok('セッションを持つゲストは本を読める', () => getDoc(doc(linkGuest, 'hondoko-books/b1')));
await ok('セッションを持つゲストは蔵書を一覧できる', () => getDocs(collection(linkGuest, 'hondoko-books')));
await ok('家族は link 中も蔵書を一覧できる', () => getDocs(collection(editor, 'hondoko-books')));
await ng('セッションだけではコメントできない', () => addDoc(collection(linkGuest, 'hondoko-comments'), {
  bookId: 'b1', text: '匿名', by: 'anon@example.com', byName: 'anon', createdAt: serverTimestamp(),
}));
await ok('確認済みユーザーは正しい鍵のセッションのあとコメントできる', async () => {
  await setDoc(doc(other, 'hondoko-link-sessions/eve'), { key: linkKey });
  await addDoc(collection(other, 'hondoko-comments'), {
    bookId: 'b1', text: 'リンクから', by: 'eve@example.com', byName: 'Eve', createdAt: serverTimestamp(),
  });
});
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(), 'hondoko-config/sharing'), { mode: 'link', allowComments: true, linkKey });
});
await ng('sharing に残った linkKey は未ログインで読めない', () => getDoc(doc(anon, 'hondoko-config/sharing')));
await ok('sharing に残った linkKey はオーナーが読める', () => getDoc(doc(editor, 'hondoko-config/sharing')));
await ok('オーナーは link をやめて private に戻せる', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'private', allowComments: false }));
await ng('private に戻すとセッション持ちでも本を一覧できない', () => getDocs(collection(linkGuest, 'hondoko-books')));
await ng('private に戻すと未ログインは本を一覧できない', () => getDocs(collection(anon, 'hondoko-books')));
// 本番の共有リンク。URL は /hondoko/?k=<鍵>。鍵は sharing.linkKey にだけあり、link 文書はまだ無い。
const legacyKey = 'k3j9ab2cde1f';
const legacyGuest = env.authenticatedContext('legacy-guest').firestore();
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await deleteDoc(doc(d, 'hondoko-config/link'));
  await setDoc(doc(d, 'hondoko-config/sharing'), {
    mode: 'link', allowComments: true, viewers: ['someone@example.com'], linkKey: legacyKey,
  });
  await setDoc(doc(d, 'hondoko-shelves/s1'), { name: '棚', order: 0 });
  await setDoc(doc(d, 'hondoko-photos/p1'), { path: 'x' });
  await setDoc(doc(d, 'hondoko-maps/m1'), { name: '間取り' });
});
await ng('既存リンクの鍵は未ログインから読めない', () => getDoc(doc(anon, 'hondoko-config/sharing')));
await ng('既存リンクの鍵文書が無くても未ログインは link 文書を読めない', () => getDoc(doc(anon, 'hondoko-config/link')));
await ng('既存リンクでも鍵が無い未ログインは本を一覧できない', () => getDocs(collection(anon, 'hondoko-books')));
await ng('既存リンクでも未ログインは棚を一覧できない', () => getDocs(collection(anon, 'hondoko-shelves')));
await ng('既存リンクでも未ログインは写真を一覧できない', () => getDocs(collection(anon, 'hondoko-photos')));
await ng('既存リンクでも未ログインは間取りを一覧できない', () => getDocs(collection(anon, 'hondoko-maps')));
await ng('既存リンクでも未ログインはコメントを一覧できない', () => getDocs(collection(anon, 'hondoko-comments')));
await ng('既存リンクでも未ログインは本を1件読めない', () => getDoc(doc(anon, 'hondoko-books/b1')));
await ng('既存リンクに違う鍵を出してもセッションは作れない', () => setDoc(doc(legacyGuest, 'hondoko-link-sessions/legacy-guest'), { key: 'zzzzzzzzzzzz' }));
await ng('既存リンクに空の鍵ではセッションは作れない', () => setDoc(doc(legacyGuest, 'hondoko-link-sessions/legacy-guest'), { key: '' }));
await ok('既存の ?k= と同じ鍵でセッションを作れる', () => setDoc(doc(legacyGuest, 'hondoko-link-sessions/legacy-guest'), { key: legacyKey }));
await ok('既存リンクのゲストは本を一覧できる', () => getDocs(collection(legacyGuest, 'hondoko-books')));
await ok('既存リンクのゲストは本を1件読める', () => getDoc(doc(legacyGuest, 'hondoko-books/b1')));
await ok('既存リンクのゲストは棚を一覧できる', () => getDocs(collection(legacyGuest, 'hondoko-shelves')));
await ok('既存リンクのゲストは写真を一覧できる', () => getDocs(collection(legacyGuest, 'hondoko-photos')));
await ok('既存リンクのゲストは間取りを一覧できる', () => getDocs(collection(legacyGuest, 'hondoko-maps')));
await ng('既存リンクでも鍵の無いログインユーザーは本を一覧できない', () => getDocs(collection(pilot, 'hondoko-books')));
const shortKey = 'abc1234';
const shortGuest = env.authenticatedContext('short-guest').firestore();
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await deleteDoc(doc(d, 'hondoko-config/link'));
  await setDoc(doc(d, 'hondoko-config/sharing'), { mode: 'link', allowComments: false, linkKey: shortKey });
});
await ng('7文字鍵でも未ログインは本を一覧できない', () => getDocs(collection(anon, 'hondoko-books')));
await ok('7文字の既存鍵でもセッションを作れる', () => setDoc(doc(shortGuest, 'hondoko-link-sessions/short-guest'), { key: shortKey }));
await ok('7文字の鍵で本を一覧できる', () => getDocs(collection(shortGuest, 'hondoko-books')));
const oneKey = 'a';
const oneGuest = env.authenticatedContext('one-guest').firestore();
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await deleteDoc(doc(d, 'hondoko-config/link'));
  await setDoc(doc(d, 'hondoko-config/sharing'), { mode: 'link', allowComments: false, linkKey: oneKey });
});
await ok('1文字の既存鍵でもセッションを作れる', () => setDoc(doc(oneGuest, 'hondoko-link-sessions/one-guest'), { key: oneKey }));
await ok('1文字の鍵で本を一覧できる', () => getDocs(collection(oneGuest, 'hondoko-books')));
await ng('1文字鍵でも未ログインは本を一覧できない', () => getDocs(collection(anon, 'hondoko-books')));
await ng('新しい7文字のリンク鍵は書けない', () => setDoc(doc(editor, 'hondoko-config/link'), { key: 'abc1234' }));
await ok('8文字のリンク鍵は書ける', () => setDoc(doc(editor, 'hondoko-config/link'), { key: 'a'.repeat(8) }));
await ok('128文字のリンク鍵は書ける', () => setDoc(doc(editor, 'hondoko-config/link'), { key: 'b'.repeat(128) }));
await ng('129文字のリンク鍵は書けない', () => setDoc(doc(editor, 'hondoko-config/link'), { key: 'c'.repeat(129) }));
await ng('sharing に新しい8文字の linkKey は書けない', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'link', allowComments: false, linkKey: 'a'.repeat(8) }));
await env.withSecurityRulesDisabled(async c => {
  await deleteDoc(doc(c.firestore(), 'hondoko-config/link'));
  await setDoc(doc(c.firestore(), 'hondoko-config/sharing'), { mode: 'link', allowComments: true, linkKey: 'abc1234' });
});
await ok('オーナー保存は既存の7文字鍵を同じ値で残せる', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'link', allowComments: false, linkKey: 'abc1234' }));
await ng('オーナーは既存の短鍵を別の短鍵に書き換えられない', () => setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'link', allowComments: false, linkKey: 'zzzzzzz' }));
await ng('短鍵を残したまま未ログインは本を一覧できない', () => getDocs(collection(anon, 'hondoko-books')));
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await setDoc(doc(d, 'hondoko-config/sharing'), { mode: 'viewers', allowComments: false });
  await setDoc(doc(d, 'hondoko-config/viewers'), { emails: ['Eve@Example.com'] });
});
await ng('大文字の閲覧者メールは移行前は本を読めない', () => getDoc(doc(other, 'hondoko-books/b1')));
await ok('public に戻した共有設定は未ログインで本を一覧できる', async () => {
  await setDoc(doc(editor, 'hondoko-config/sharing'), { mode: 'public', allowComments: false });
  await getDocs(collection(anon, 'hondoko-books'));
});
await ng('未確認編集者は旧 note を読めない', () => getDocs(collection(unverifiedEditor, 'note-analytics/default/snapshots')));

console.log('groups (COCO-ITTA)');
const groupBody = (email) => ({
  name: '我が家',
  createdBy: email,
  createdAt: serverTimestamp(),
  members: [{ email, role: 'owner' }],
  memberNames: ['ともえ'],
  pins: [],
  routes: [],
  routeSettings: { color: '#f6c453', weight: 4 },
});
await ok('作成者はグループを作れる', () => setDoc(doc(alice, 'groups/AB2345'), groupBody('alice@example.com')));
await ng('IDを知るだけの人はグループを読めない', () => getDoc(doc(other, 'groups/AB2345')));
await ng('未ログインはグループを読めない', () => getDoc(doc(anon, 'groups/AB2345')));
await ng('未確認ユーザーはグループを読めない', () => getDoc(doc(unverifiedEditor, 'groups/AB2345')));
await ng('グループ一覧は不可', () => getDocs(collection(other, 'groups')));
await ng('他人のグループは削除不可', () => deleteDoc(doc(other, 'groups/AB2345')));
await ng('作成者でもグループ削除は不可', () => deleteDoc(doc(alice, 'groups/AB2345')));
await ng('非メンバーはピンを上書きできない', () => updateDoc(doc(other, 'groups/AB2345'), { pins: [{ id: 'evil' }] }));
await ng('IDを知るだけでは自分を member にできない', () => updateDoc(doc(other, 'groups/AB2345'), {
  members: arrayUnion({ email: 'eve@example.com', role: 'member' }),
  lastInviteEmail: 'eve@example.com',
}));
await ng('非メンバーは自分を owner にはできない', () => updateDoc(doc(other, 'groups/AB2345'), {
  members: arrayUnion({ email: 'eve@example.com', role: 'owner' }),
  lastInviteEmail: 'eve@example.com',
}));
await ok('作成者は共有データを更新できる', () => updateDoc(doc(alice, 'groups/AB2345'), {
  pins: [{ id: 'p1', name: '公園', lat: 35.6, lng: 139.7 }],
  routes: [{ id: 'r1', points: [{ lat: 35.6, lng: 139.7 }] }],
  memberNames: ['ともえ', '父'],
  routeSettings: { color: '#88c057', weight: 4 },
}));
await ok('作成者は member を1人招待できる', () => updateDoc(doc(alice, 'groups/AB2345'), {
  members: arrayUnion({ email: 'eve@example.com', role: 'member' }),
  lastInviteEmail: 'eve@example.com',
}));
await ng('作成者は招待と同時に owner を増やせない', () => updateDoc(doc(alice, 'groups/AB2345'), {
  members: arrayUnion({ email: 'second@example.com', role: 'owner' }),
  lastInviteEmail: 'second@example.com',
}));
await ng('作成者は自分を members から外せない', () => updateDoc(doc(alice, 'groups/AB2345'), {
  members: [{ email: 'eve@example.com', role: 'owner' }],
  lastInviteEmail: 'eve@example.com',
}));
await ok('承認されたメンバーはピンを更新できる', () => updateDoc(doc(other, 'groups/AB2345'), {
  pins: [{ id: 'p2', name: '海', lat: 35.1, lng: 139.5 }],
}));
await ng('メンバーは members を書き換えられない', () => updateDoc(doc(other, 'groups/AB2345'), {
  members: [
    { email: 'alice@example.com', role: 'owner' },
    { email: 'eve@example.com', role: 'owner' },
  ],
}));
await ng('メンバーは createdBy を奪えない', () => updateDoc(doc(other, 'groups/AB2345'), { createdBy: 'eve@example.com' }));
await ok('未参加者は参加申請を作れる', () => setDoc(doc(pilot, 'groups/AB2345/joinRequests/pilot'), {
  email: 'pilot@example.com', status: 'pending', createdAt: serverTimestamp(),
}));
await ng('申請者は自分を承認できない', () => updateDoc(doc(pilot, 'groups/AB2345/joinRequests/pilot'), { status: 'approved' }));
await ng('申請者はグループを読めない', () => getDoc(doc(pilot, 'groups/AB2345')));
await ng('申請者は参加申請の一覧を読めない', () => getDocs(collection(pilot, 'groups/AB2345/joinRequests')));
await ok('作成者は参加申請を一覧できる', () => getDocs(collection(alice, 'groups/AB2345/joinRequests')));
await ok('作成者は参加申請を承認できる', () => updateDoc(doc(alice, 'groups/AB2345/joinRequests/pilot'), { status: 'approved' }));
await ok('作成者は承認した人を member に追加できる', () => updateDoc(doc(alice, 'groups/AB2345'), {
  members: arrayUnion({ email: 'pilot@example.com', role: 'member' }),
  lastInviteEmail: 'pilot@example.com',
}));
await ok('追加されたメンバーはピンを更新できる', () => updateDoc(doc(pilot, 'groups/AB2345'), {
  pins: [{ id: 'p3', name: '山', lat: 36, lng: 138 }],
}));
await ng('メンバーは他のメンバーを削除できない', () => updateDoc(doc(other, 'groups/AB2345'), {
  members: [
    { email: 'alice@example.com', role: 'owner' },
    { email: 'eve@example.com', role: 'member' },
  ],
}));
await ng('メンバーは管理者を削除できない', () => updateDoc(doc(other, 'groups/AB2345'), {
  members: [
    { email: 'eve@example.com', role: 'member' },
    { email: 'pilot@example.com', role: 'member' },
  ],
}));
await ng('作成者は自分（管理者）を削除できない', () => updateDoc(doc(alice, 'groups/AB2345'), {
  members: [
    { email: 'eve@example.com', role: 'member' },
    { email: 'pilot@example.com', role: 'member' },
  ],
}));
await ng('作成者はメンバー削除とピン更新を同時にできない', () => updateDoc(doc(alice, 'groups/AB2345'), {
  members: [
    { email: 'alice@example.com', role: 'owner' },
    { email: 'pilot@example.com', role: 'member' },
  ],
  pins: [],
}));
await ng('非メンバーはメンバーを削除できない', () => updateDoc(doc(spline, 'groups/AB2345'), {
  members: [
    { email: 'alice@example.com', role: 'owner' },
    { email: 'eve@example.com', role: 'member' },
  ],
}));
await ok('作成者はメンバーを1人削除できる', () => updateDoc(doc(alice, 'groups/AB2345'), {
  members: [
    { email: 'alice@example.com', role: 'owner' },
    { email: 'pilot@example.com', role: 'member' },
  ],
}));
await ng('外されたメンバーはグループを読めない', () => getDoc(doc(other, 'groups/AB2345')));
await ok('残ったメンバーはピンを更新できる', () => updateDoc(doc(pilot, 'groups/AB2345'), {
  pins: [{ id: 'p4', name: '川', lat: 35, lng: 139 }],
}));
await ok('メンバーは自分だけ抜けられる', () => updateDoc(doc(pilot, 'groups/AB2345'), {
  members: [{ email: 'alice@example.com', role: 'owner' }],
}));
await ng('抜けたメンバーはグループを読めない', () => getDoc(doc(pilot, 'groups/AB2345')));
await ok('抜けたあとも管理者はグループを読める', () => getDoc(doc(alice, 'groups/AB2345')));
let groupAfterLeave;
await env.withSecurityRulesDisabled(async c => {
  groupAfterLeave = (await getDoc(doc(c.firestore(), 'groups/AB2345'))).data();
});
await t('抜けたあとも管理者だけが残る', (
  groupAfterLeave.members.length === 1
  && groupAfterLeave.members[0].email === 'alice@example.com'
  && groupAfterLeave.members[0].role === 'owner'
  && groupAfterLeave.createdBy === 'alice@example.com'
) ? Promise.resolve() : Promise.reject(new Error(JSON.stringify(groupAfterLeave.members))));
await ng('存在しないグループには参加申請できない', () => setDoc(doc(other, 'groups/NOGROUP/joinRequests/eve'), {
  email: 'eve@example.com', status: 'pending', createdAt: serverTimestamp(),
}));
await ng('未確認ユーザーは参加申請できない', () => setDoc(doc(unverifiedEditor, 'groups/AB2345/joinRequests/spoof'), {
  email: 'junpei.omote@gmail.com', status: 'pending', createdAt: serverTimestamp(),
}));
await ng('他人のメールを createdBy にして作れない', () => setDoc(doc(other, 'groups/ZZ9999'), groupBody('alice@example.com')));
await ng('未確認ユーザーはグループを作れない', () => setDoc(doc(unverifiedEditor, 'groups/NO9999'), groupBody('junpei.omote@gmail.com')));

console.log('fst_*');
const sessionAnalytics = (extra = {}) => ({
  uidHash: 'cGlsb3Q',
  date: '2026-10-28',
  month: '2026-10',
  hour: 9,
  dow: 3,
  version: 'v0.5.7',
  build: 'stable',
  createdAt: serverTimestamp(),
  ...extra,
});
await ok('安定版のセッション記録を作れる', () => setDoc(doc(pilot, 'fst_analytics/2026-10-28_cGlsb3Q_1'), sessionAnalytics()));
await ok('開発版のセッション記録（device あり）を作れる', () => setDoc(doc(pilot, 'fst_analytics/2026-10-28_cGlsb3Q_2'), sessionAnalytics({ version: 'v0.10.29-dev', build: 'dev', device: 'desktop' })));
await ok('タスク作成イベントを作れる', () => addDoc(collection(pilot, 'fst_analytics'), {
  type: 'task_created', uidHash: 'cGlsb3Q', date: '2026-10-28', version: 'v0.10.29-dev', build: 'dev', createdAt: serverTimestamp(),
}));
await ok('タスク完了イベントを作れる', () => addDoc(collection(pilot, 'fst_analytics'), {
  type: 'task_completed', uidHash: 'cGlsb3Q', date: '2026-10-28', version: 'v0.10.29-dev', build: 'dev', createdAt: serverTimestamp(),
}));
await ng('計測の作成者でも一覧は読めない', () => getDocs(query(collection(pilot, 'fst_analytics'), orderBy('createdAt', 'desc'), limit(500))));
await ok('編集者は計測を一覧できる', () => getDocs(query(collection(editor, 'fst_analytics'), orderBy('createdAt', 'desc'), limit(500))));
await ng('計測の上書きは不可', () => updateDoc(doc(pilot, 'fst_analytics/2026-10-28_cGlsb3Q_1'), { version: 'hacked' }));
await ng('計測の削除は不可', () => deleteDoc(doc(editor, 'fst_analytics/2026-10-28_cGlsb3Q_1')));
await ng('未確認ユーザーは計測を書けない', () => setDoc(doc(unverifiedEditor, 'fst_analytics/x'), sessionAnalytics()));
await ng('未ログインは計測を書けない', () => setDoc(doc(anon, 'fst_analytics/x'), sessionAnalytics()));
await ng('計測に余計なフィールドは不可', () => setDoc(doc(pilot, 'fst_analytics/bad'), sessionAnalytics({ uid: 'pilot' })));
await ok('フィードバック連番をトランザクションで +1 できる', () => runTransaction(pilot, async (tx) => {
  const ref = doc(pilot, 'fst_feedback_meta/counter');
  const snap = await tx.get(ref);
  const n = (snap.exists() ? (snap.data().count || 0) : 0) + 1;
  tx.set(ref, { count: n }, { merge: true });
}));
await ok('連番の次の +1 もできる', () => updateDoc(doc(pilot, 'fst_feedback_meta/counter'), { count: 2 }));
await ng('連番を飛ばして書き換えられない', () => updateDoc(doc(pilot, 'fst_feedback_meta/counter'), { count: 99 }));
await ng('連番カウンターの一覧は不可', () => getDocs(collection(pilot, 'fst_feedback_meta')));
await ng('未ログインは連番を読めない', () => getDoc(doc(anon, 'fst_feedback_meta/counter')));
const feedback = (uid) => ({
  fbId: 'FB_0002', subject: '不具合', email: 'pilot@example.com', message: '保存できない', build: 'stable',
  uid, status: 'new', replySent: false, createdAt: serverTimestamp(),
});
await ok('本人はフィードバックを作成できる', () => setDoc(doc(pilot, 'fst_feedback/FB_0002'), feedback('pilot')));
await ok('本人は自動返信フラグだけ更新できる', () => updateDoc(doc(pilot, 'fst_feedback/FB_0002'), { replySent: true }));
await ng('本人は本文を書き換えられない', () => updateDoc(doc(pilot, 'fst_feedback/FB_0002'), { message: '改ざん' }));
await ng('他人はフィードバックを読めない', () => getDoc(doc(other, 'fst_feedback/FB_0002')));
await ng('他人はフィードバック一覧を読めない', () => getDocs(query(collection(other, 'fst_feedback'), orderBy('createdAt', 'desc'), limit(100))));
await ng('他人の uid ではフィードバックを作れない', () => setDoc(doc(other, 'fst_feedback/FB_0003'), feedback('pilot')));
await ok('編集者は受信箱を一覧できる', () => getDocs(query(collection(editor, 'fst_feedback'), orderBy('createdAt', 'desc'), limit(100))));
await ok('編集者は既読にできる', () => updateDoc(doc(editor, 'fst_feedback/FB_0002'), { status: 'read' }));
await ok('編集者は返信を保存できる', () => updateDoc(doc(editor, 'fst_feedback/FB_0002'), {
  replyText: '確認しました', repliedAt: serverTimestamp(), status: 'replied',
}));
await ok('編集者は返信済みを戻せる', () => updateDoc(doc(editor, 'fst_feedback/FB_0002'), { status: 'new', repliedAt: null }));
await ng('編集者でもフィードバックは削除できない', () => deleteDoc(doc(editor, 'fst_feedback/FB_0002')));
await ng('未確認の編集者メールでは受信箱を読めない', () => getDocs(collection(unverifiedEditor, 'fst_feedback')));
await ok('開発版のフィードバックも作成できる', () => setDoc(doc(pilot, 'fst_feedback/FB_0004'), { ...feedback('pilot'), fbId: 'FB_0004', build: 'dev' }));
await ok('10000件目のフィードバックIDも作れる', () => setDoc(doc(pilot, 'fst_feedback/FB_10000'), { ...feedback('pilot'), fbId: 'FB_10000' }));
await ok('8桁のフィードバックIDも作れる', () => setDoc(doc(pilot, 'fst_feedback/FB_12345678'), { ...feedback('pilot'), fbId: 'FB_12345678' }));
await ng('3桁のフィードバックIDは不可', () => setDoc(doc(pilot, 'fst_feedback/FB_099'), { ...feedback('pilot'), fbId: 'FB_099' }));
await ng('9桁のフィードバックIDは不可', () => setDoc(doc(pilot, 'fst_feedback/FB_123456789'), { ...feedback('pilot'), fbId: 'FB_123456789' }));

console.log('outreach-crm');
const ws = 'a'.repeat(32);
await ng('ワークスペース一覧は不可', () => getDocs(collection(anon, 'outreach-crm')));
await ng('未ログインは長いコードでも読めない', () => getDoc(doc(anon, 'outreach-crm/' + ws)));
await ng('未ログインは leads を消せない', () => setDoc(doc(anon, 'outreach-crm/' + ws), { leads: [], updatedAt: Date.now() }));
await ng('未ログインは文書を削除できない', () => deleteDoc(doc(anon, 'outreach-crm/acme')));
await ng('ログイン済みでも短いコードは読めない', () => getDoc(doc(other, 'outreach-crm/acme')));
await ng('ログイン済みでも短いコードは書けない', () => setDoc(doc(other, 'outreach-crm/acme'), { leads: [], updatedAt: Date.now() }));
await ng('23文字のコードは読めない', () => getDoc(doc(other, 'outreach-crm/' + 'b'.repeat(23))));
await ok('24文字のコードは読める', () => getDoc(doc(other, 'outreach-crm/' + 'b'.repeat(24))));
await ok('128文字のコードは読める', () => getDoc(doc(other, 'outreach-crm/' + 'b'.repeat(128))));
await ng('129文字のコードは読めない', () => getDoc(doc(other, 'outreach-crm/' + 'b'.repeat(129))));
await ok('ログイン済みは32文字のコードを読める', () => getDoc(doc(other, 'outreach-crm/' + ws)));
await ok('ログイン済みは leads を保存できる', () => setDoc(doc(other, 'outreach-crm/' + ws), {
  leads: [{ company: '株式会社サンプル', contactName: '山田太郎', email: 'taro@example.com', industry: '製造', events: [{ type: 'sent', at: 1 }] }],
  updatedAt: Date.now(),
}));
await ok('ログイン済みは空の leads で同期できる', () => setDoc(doc(other, 'outreach-crm/' + ws), { leads: [], updatedAt: Date.now() }));
await ng('leads 以外のフィールドは不可', () => setDoc(doc(other, 'outreach-crm/' + ws), { leads: [], updatedAt: Date.now(), owner: 'eve' }));
await ng('ログイン済みでも文書削除は不可', () => deleteDoc(doc(other, 'outreach-crm/' + ws)));
await ng('未確認ユーザーは長いコードでも読めない', () => getDoc(doc(unverifiedEditor, 'outreach-crm/' + ws)));

console.log('tomoe-home');
await ng('tomoe-home の一覧は不可', () => getDocs(collection(anon, 'tomoe-home')));
await ok('ホームは config を読める', () => getDoc(doc(anon, 'tomoe-home/config')));
await ng('未ログインは config を上書きできない', () => setDoc(doc(anon, 'tomoe-home/config'), { apps: [] }));
await ng('編集者以外は config を上書きできない', () => setDoc(doc(other, 'tomoe-home/config'), { apps: [] }));
await ok('編集者は apps を保存できる', () => setDoc(doc(editor, 'tomoe-home/config'), {
  apps: [{ id: 'abc-world', name: 'ワールドABC', icon: '🌍', url: 'https://cc-dev-ps7.web.app/abc-world/', desc: 'えいご' }],
}));
await ng('config 以外は書けない', () => setDoc(doc(editor, 'tomoe-home/other'), { apps: [] }));
await ng('config の削除は不可', () => deleteDoc(doc(anon, 'tomoe-home/config')));
await ng('apps 以外のフィールドは不可', () => setDoc(doc(anon, 'tomoe-home/config'), { apps: [], evil: true }));

console.log('tomoe-player リスト');
await ng('動画リストの一覧は不可', () => getDocs(collection(anon, 'tomoe-player')));
await ok('共有コードの単体取得は可', () => getDoc(doc(anon, 'tomoe-player/ABC123')));
await ok('12文字の共有コードは get できる', () => getDoc(doc(anon, 'tomoe-player/' + 'Z'.repeat(12))));
await ng('13文字の共有コードは get できない', () => getDoc(doc(anon, 'tomoe-player/' + 'Z'.repeat(13))));
await ok('未作成の共有コードも get できる', () => getDoc(doc(anon, 'tomoe-player/ZZZZZZ')));
await ng('未ログインは動画リストを上書きできない', () => setDoc(doc(anon, 'tomoe-player/ABC123'), {
  videos: [{ id: 'dQw4w9Wgxcq', title: 't' }], sources: 'https://www.youtube.com/watch?v=dQw4w9Wgxcq', name: 'ともえ', updatedAt: new Date().toISOString(),
}));
await ng('共有コードを知るだけのユーザーは動画リストを上書きできない', () => setDoc(doc(other, 'tomoe-player/ABC123'), {
  videos: [{ id: 'evil', title: 'x' }], sources: '', name: 'x', updatedAt: new Date().toISOString(),
}));
await ng('未確認の保護者メールでは動画リストを上書きできない', () => setDoc(doc(unverifiedEditor, 'tomoe-player/ABC123'), {
  videos: [{ id: 'dQw4w9Wgxcq', title: 't' }], sources: '', name: 'ともえ', updatedAt: new Date().toISOString(),
}));
await ok('保護者は動画リストを保存できる', () => setDoc(doc(editor, 'tomoe-player/ABC123'), {
  videos: [{ id: 'dQw4w9Wgxcq', title: 't' }], sources: 'https://www.youtube.com/watch?v=dQw4w9Wgxcq', name: 'ともえ', updatedAt: new Date().toISOString(),
}));
await ok('保護者はプレイヤー名だけの merge 保存ができる', () => setDoc(doc(editor, 'tomoe-player/ABC123'), { name: 'ともえちゃん' }, { merge: true }));
await ng('未ログインはプレイヤー名を保存できない', () => setDoc(doc(anon, 'tomoe-player/ABC123'), { name: 'hacked' }, { merge: true }));
await ng('動画リスト文書の削除は不可', () => deleteDoc(doc(anon, 'tomoe-player/ABC123')));
await ng('未ログインは視聴ログを一覧できない', () => getDocs(collection(anon, 'tomoe-player/ABC123/sessions')));
await ok('保護者は視聴ログを一覧できる', () => getDocs(collection(editor, 'tomoe-player/ABC123/sessions')));
await ng('存在しない家族コード一覧は不可', () => getDocs(collection(anon, 'ouchi-hamasushi')));
await ok('家族コード配下の assets 一覧は維持', () => getDocs(collection(anon, 'ouchi-hamasushi/tomoe3030/assets')));
await ng('チームコード一覧は不可', () => getDocs(collection(anon, 'meet-knowledge')));
await ok('チームの entries 一覧は維持', () => getDocs(collection(anon, 'meet-knowledge/default/entries')));
await ng('視聴ログの collection group 横断一覧は不可', () => getDocs(collectionGroup(anon, 'sessions')));
await ng('assets の collection group 横断一覧は不可', () => getDocs(collectionGroup(anon, 'assets')));
await ng('entries の collection group 横断一覧は不可', () => getDocs(collectionGroup(anon, 'entries')));

console.log(`\n結果: ${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
