// firestore.rules の Emulator テスト
// 認証なしで書き込めるコレクションについて「本番クライアントと同じ書き込みは通る / それ以外は弾く」を確認する。
// 実行: cd tests/firestore-rules && npm ci && npm test   （Java 11+ が必要）
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDocs, increment, orderBy, query,
  serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';

let env;
let anon;
let editor;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cc-dev-rules',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  anon = env.unauthenticatedContext().firestore();
  editor = env.authenticatedContext('editor', { email: 'someone@splineglobal.com' }).firestore();
});

const seed = (path, data) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

// ---------------------------------------------------------------------------
// app-dashboard: /apps/{id}
// ---------------------------------------------------------------------------
describe('apps (app-dashboard)', () => {
  // submitForm() が組み立てる data
  const formData = () => ({
    name: 'テストアプリ', type: 'web', version: '0.1.0', status: 'dev',
    url: 'https://cc-dev-ps7.web.app/test/', icon: '',
    env: ['Claude Code', 'Firebase'], releaseNote: 'メモ',
    docs: [{ label: '仕様', url: 'https://docs.google.com/x', type: 'gdoc' }],
  });

  test('addDoc（新規追加）は通る', async () => {
    await assertSucceeds(addDoc(collection(anon, 'apps'), { ...formData(), updatedAt: serverTimestamp() }));
  });

  test('updateDoc（編集保存）は通る', async () => {
    await seed('apps/a1', { ...formData(), updatedAt: Timestamp.now() });
    await assertSucceeds(updateDoc(doc(anon, 'apps/a1'), { ...formData(), name: '改名', updatedAt: serverTimestamp() }));
  });

  test('レーティング更新は通る（icon/rating の無い既存ドキュメントでも）', async () => {
    const { icon, ...legacy } = formData();
    await seed('apps/a1', { ...legacy, updatedAt: Timestamp.now() });
    await assertSucceeds(updateDoc(doc(anon, 'apps/a1'), { rating: 4 }));
    await assertSucceeds(updateDoc(doc(anon, 'apps/a1'), { rating: 0 }));
  });

  test('一覧取得・削除は通る', async () => {
    await seed('apps/a1', { ...formData(), updatedAt: Timestamp.now() });
    await assertSucceeds(getDocs(query(collection(anon, 'apps'), orderBy('updatedAt', 'desc'))));
    await assertSucceeds(deleteDoc(doc(anon, 'apps/a1')));
  });

  test('想定外フィールド・型違い・過大サイズ・任意時刻は弾く', async () => {
    const c = collection(anon, 'apps');
    await assertFails(addDoc(c, { ...formData(), updatedAt: serverTimestamp(), evil: 'x' }));
    await assertFails(addDoc(c, { ...formData(), updatedAt: serverTimestamp(), name: '' }));
    await assertFails(addDoc(c, { ...formData(), updatedAt: serverTimestamp(), name: 'x'.repeat(201) }));
    await assertFails(addDoc(c, { ...formData(), updatedAt: serverTimestamp(), releaseNote: 'x'.repeat(50001) }));
    await assertFails(addDoc(c, { ...formData(), updatedAt: serverTimestamp(), env: 'Firebase' }));
    await assertFails(addDoc(c, { ...formData(), updatedAt: Timestamp.fromMillis(0) }));
    await assertFails(addDoc(c, formData())); // updatedAt 無し
    await seed('apps/a1', { ...formData(), updatedAt: Timestamp.now() });
    await assertFails(updateDoc(doc(anon, 'apps/a1'), { rating: 6 }));
    await assertFails(updateDoc(doc(anon, 'apps/a1'), { rating: 2.5 }));
  });
});

// ---------------------------------------------------------------------------
// note-analytics: /note-analytics/{userId}/snapshots/{YYYYMMDD}
// ---------------------------------------------------------------------------
describe('note-analytics', () => {
  // saveSnapshot(): docId = weekStart のハイフン除去、set(merge) で createdAt/updatedAt を毎回付ける
  const save = (db, userId, snap) => setDoc(
    doc(db, 'note-analytics', userId, 'snapshots', snap.weekStart.replace(/-/g, '')),
    { ...snap, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  const manual = { weekStart: '2026-09-28', views: 1200, likes: 30, followers: 15, comments: 2, articles: 40, source: 'manual' };
  const ocr = { weekStart: '2026-09-28', views: 1300.5, likes: 31, followers: 16, comments: 3, source: 'screenshot' };
  const chrome = { weekStart: '2026-10-05', views: 0, likes: 0, followers: 0, comments: 0, source: 'chrome-auto' };

  test('手動入力・OCR・Chrome自動取得の保存（新規・上書き）は通る', async () => {
    await assertSucceeds(save(anon, 'default', manual));
    await assertSucceeds(save(anon, 'default', ocr));
    await assertSucceeds(save(anon, 'my_note_id', chrome));
  });

  test('一覧取得・削除は通る', async () => {
    await assertSucceeds(save(anon, 'default', manual));
    await assertSucceeds(getDocs(query(collection(anon, 'note-analytics', 'default', 'snapshots'), orderBy('weekStart', 'asc'))));
    await assertSucceeds(deleteDoc(doc(anon, 'note-analytics/default/snapshots/20260928')));
  });

  test('docId と weekStart の不一致・不正値・想定外フィールドは弾く', async () => {
    const ref = doc(anon, 'note-analytics/default/snapshots/20260101');
    const ts = { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(setDoc(ref, { ...manual, ...ts }));
    await assertFails(save(anon, 'default', { ...manual, views: -1 }));
    await assertFails(save(anon, 'default', { ...manual, views: '1200' }));
    await assertFails(save(anon, 'default', { ...manual, source: 'bot' }));
    await assertFails(save(anon, 'default', { ...manual, payload: 'x' }));
    await assertFails(save(anon, 'x'.repeat(101), manual));
  });

  test('snapshots 以外のパスには書き込めない', async () => {
    await assertFails(setDoc(doc(anon, 'note-analytics/default'), { a: 1 }));
    await assertFails(setDoc(doc(anon, 'note-analytics/default/other/x'), { a: 1 }));
    await assertFails(setDoc(doc(anon, 'note-analytics/default/snapshots/abc'), { ...manual }));
  });
});

// ---------------------------------------------------------------------------
// hihaho-view: /playlist_analytics/{id}, /video_analytics/{uuid}
// ---------------------------------------------------------------------------
describe('playlist_analytics (hihaho-view)', () => {
  // trackPlaylistView()
  const track = (db, id) => setDoc(doc(db, 'playlist_analytics', id), {
    viewCount: increment(1), lastViewed: serverTimestamp(),
  }, { merge: true });

  test('存在するプレイリストの表示カウントは初回・2回目とも通る', async () => {
    await seed('playlists/pl1', { name: 'PL' });
    await assertSucceeds(track(anon, 'pl1'));
    await assertSucceeds(track(anon, 'pl1'));
  });

  test('存在しないプレイリストの作成・+1 以外・想定外フィールド・削除は弾く', async () => {
    await assertFails(track(anon, 'nope'));
    await seed('playlists/pl1', { name: 'PL' });
    await seed('playlist_analytics/pl1', { viewCount: 5, lastViewed: Timestamp.now() });
    const ref = doc(anon, 'playlist_analytics/pl1');
    await assertFails(setDoc(ref, { viewCount: 1000, lastViewed: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(ref, { viewCount: increment(2), lastViewed: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(ref, { viewCount: increment(1), lastViewed: Timestamp.fromMillis(0) }, { merge: true }));
    await assertFails(setDoc(ref, { viewCount: increment(1), lastViewed: serverTimestamp(), x: 1 }, { merge: true }));
    await assertFails(deleteDoc(ref));
  });

  test('編集者は削除できる', async () => {
    await seed('playlist_analytics/pl1', { viewCount: 5, lastViewed: Timestamp.now() });
    await assertSucceeds(deleteDoc(doc(editor, 'playlist_analytics/pl1')));
  });
});

describe('video_analytics (hihaho-view)', () => {
  const UUID = '0170e3eb-dd3a-4ce5-9d66-61697d4c47ad';
  // trackVideoPlay(): set() はドット入りキーをパス解釈せず 'playlists.<id>' というフィールド名になる
  const play = (db, playlistId, { uuid = UUID, videoId = 183584 } = {}) => {
    const data = { playCount: increment(1), lastPlayed: serverTimestamp(), videoId };
    if (playlistId) data[`playlists.${playlistId}`] = increment(1);
    return setDoc(doc(db, 'video_analytics', uuid), data, { merge: true });
  };

  test('初回・2回目・別プレイリスト・プレイリスト無しの再生は通る', async () => {
    await assertSucceeds(play(anon, 'pmi24uqkmswv8bbn'));
    await assertSucceeds(play(anon, 'pmi24uqkmswv8bbn'));
    await assertSucceeds(play(anon, 'huoz3jnumti1obfu'));
    await assertSucceeds(play(anon, null));
  });

  test('多数のプレイリストキー（最大 125 個）を持つ既存ドキュメントでも +1 できる', async () => {
    for (const n of [40, 125]) {
      const uuid = `0170e3eb-dd3a-4ce5-9d66-${String(n).padStart(12, '0')}`;
      const existing = { playCount: n, lastPlayed: Timestamp.now(), videoId: 183584 };
      for (let i = 0; i < n; i++) existing[`playlists.pl${String(i).padStart(3, '0')}`] = 1;
      await seed(`video_analytics/${uuid}`, existing);
      const last = `pl${String(n - 1).padStart(3, '0')}`;
      await assertSucceeds(play(anon, 'pl000', { uuid }));
      await assertSucceeds(play(anon, last, { uuid }));
      await assertFails(setDoc(doc(anon, 'video_analytics', uuid), {
        playCount: increment(1), lastPlayed: serverTimestamp(), videoId: 183584, [`playlists.${last}`]: increment(2),
      }, { merge: true }));
      if (n === 40) await assertSucceeds(play(anon, 'zzzz_new', { uuid }));
      else await assertFails(play(anon, 'zzzz_new', { uuid })); // 128 キー上限
    }
  });

  test('+1 以外・任意時刻・videoId 書き換え・不正キー・複数プレイリスト同時・削除は弾く', async () => {
    await seed(`video_analytics/${UUID}`, {
      playCount: 4, lastPlayed: Timestamp.now(), videoId: 183584, 'playlists.pl1': 4,
    });
    const ref = doc(anon, 'video_analytics', UUID);
    const base = { lastPlayed: serverTimestamp(), videoId: 183584 };
    await assertFails(setDoc(ref, { ...base, playCount: 999 }, { merge: true }));
    await assertFails(setDoc(ref, { ...base, playCount: increment(2) }, { merge: true }));
    await assertFails(setDoc(ref, { ...base, playCount: increment(1), lastPlayed: Timestamp.fromMillis(0) }, { merge: true }));
    await assertFails(setDoc(ref, { ...base, playCount: increment(1), 'playlists.pl1': 999 }, { merge: true }));
    await assertFails(setDoc(ref, { ...base, playCount: increment(1), 'playlists.pl1': 'x' }, { merge: true }));
    await assertFails(setDoc(ref, { ...base, playCount: increment(1), 'playlists.a': increment(1), 'playlists.b': increment(1) }, { merge: true }));
    await assertFails(setDoc(ref, { ...base, playCount: increment(1), evil: increment(1) }, { merge: true }));
    await assertFails(play(anon, 'pl1', { videoId: 1 }));
    await assertFails(play(anon, 'pl1', { uuid: 'not a uuid!' }));
    await assertFails(deleteDoc(ref));
    await assertSucceeds(deleteDoc(doc(editor, 'video_analytics', UUID)));
  });
});

// ---------------------------------------------------------------------------
// ouchi-hamasushi: /ouchi-hamasushi/{familyCode}/assets/{assetKey}
// ---------------------------------------------------------------------------
describe('ouchi-hamasushi', () => {
  // cloud-store.js setAsset()
  const setAsset = (db, familyCode, assetKey, dataUri, mimeType) => setDoc(
    doc(db, 'ouchi-hamasushi', familyCode, 'assets', assetKey),
    { data: dataUri, mimeType: mimeType || '', size: dataUri.length, updatedAt: serverTimestamp() },
  );
  const voice = 'data:audio/webm;codecs=opus;base64,' + 'A'.repeat(1000);

  test('録音・画像の保存/上書き/購読/削除は通る', async () => {
    await assertSucceeds(setAsset(anon, 'tomoe3030', 'voice_otousan_まぐろ', voice, 'audio/webm;codecs=opus'));
    await assertSucceeds(setAsset(anon, 'tomoe3030', 'voice_otousan_まぐろ', voice + 'B', 'audio/mp4'));
    await assertSucceeds(setAsset(anon, 'tomoe3030', 'image_avatar_okasan', 'data:image/jpeg;base64,/9j/', 'image/jpeg'));
    await assertSucceeds(setAsset(anon, 'tomoe3030', 'voice_okasan_confirm', voice, undefined));
    // 900KB（クライアント上限）ちょうど
    await assertSucceeds(setAsset(anon, 'tomoe3030', 'voice_big', 'data:audio/mp4;base64,' + 'A'.repeat(900 * 1024 - 22), 'audio/mp4'));
    await assertSucceeds(getDocs(collection(anon, 'ouchi-hamasushi', 'tomoe3030', 'assets')));
    await assertSucceeds(deleteDoc(doc(anon, 'ouchi-hamasushi/tomoe3030/assets/voice_otousan_まぐろ')));
  });

  test('想定外キー・フィールド・サイズ超過・任意時刻は弾く', async () => {
    await assertFails(setAsset(anon, 'tomoe3030', 'setting_x', voice, 'audio/mp4'));
    await assertFails(setAsset(anon, 'x'.repeat(65), 'voice_a', voice, 'audio/mp4'));
    await assertFails(setAsset(anon, 'tomoe3030', 'voice_a', 'A'.repeat(950001), 'audio/mp4'));
    await assertFails(setAsset(anon, 'tomoe3030', 'voice_a', '', 'audio/mp4'));
    const ref = doc(anon, 'ouchi-hamasushi/tomoe3030/assets/voice_a');
    await assertFails(setDoc(ref, { data: voice, mimeType: '', size: 1, updatedAt: serverTimestamp(), x: 1 }));
    await assertFails(setDoc(ref, { data: voice, mimeType: '', size: 1 }));
    await assertFails(setDoc(ref, { data: voice, mimeType: '', size: 1, updatedAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(ref, { data: voice, mimeType: 'x'.repeat(101), size: 1, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(anon, 'ouchi-hamasushi/tomoe3030/assets/setting_x')));
  });
});
