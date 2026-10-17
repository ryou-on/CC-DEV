import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach, describe } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, orderBy, query,
  serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

let env;
const token = { email: 'member@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const FORMER_UID = 'uyCVvTEqAUXjK01lfcD4QfR7JiE3';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cc-dev-cost',
    firestore: { host: '127.0.0.1', port: 8087, rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const expiresAt = Timestamp.fromMillis(Date.now() + 3600000);
    for (const scope of [
      'apps__registry', 'ouchi-hamasushi__family', 'note-analytics__default', 'note-analytics__my_note_id',
      'hihaho-analytics__global', 'tomoe-home__config', 'tomoe-player__list', 'meet-knowledge__team',
      'outreach-crm__workspace', 'bombing-bay__global',
    ]) {
      await setDoc(doc(db, 'accessGrants', scope), { enabled: true, readers: ['reader'], writers: ['writer'], expiresAt });
    }
    await setDoc(doc(db, 'playlists/pl1'), { name: 'PL' });
  });
});

const writer = () => env.authenticatedContext('writer', token).firestore();
const reader = () => env.authenticatedContext('reader', token).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const stranger = () => env.authenticatedContext('stranger', token).firestore();
const adminClaim = () => env.authenticatedContext('platform-admin', { ...token, admin: true, email: 'admin@example.test' }).firestore();
const editorToken = { email: 'someone@splineglobal.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const editor = () => env.authenticatedContext('editor', editorToken).firestore();
const anonAuth = () => env.authenticatedContext('anon-user', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const unverifiedEditor = () => env.authenticatedContext('unverified-editor', {
  email: 'someone@splineglobal.com', email_verified: false, firebase: { sign_in_provider: 'google.com' },
}).firestore();
const owner = () => env.authenticatedContext('hondoko-owner', {
  email: 'junpei.omote@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' },
}).firestore();
const unverifiedOwner = () => env.authenticatedContext('hondoko-owner-unverified', {
  email: 'junpei.omote@gmail.com', email_verified: false, firebase: { sign_in_provider: 'google.com' },
}).firestore();
const joiner = () => env.authenticatedContext('joiner', {
  email: 'joiner@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' },
}).firestore();

function appData(extra = {}) {
  return {
    name: 'テストアプリ', type: 'web', version: '0.1.0', status: 'dev',
    url: 'https://cc-dev-ps7.web.app/test/', icon: '',
    env: ['Claude Code'], releaseNote: 'メモ', docs: [], updatedAt: serverTimestamp(), ...extra,
  };
}

describe('platform admin is a claim or admins collection, not a hardcoded UID', () => {
  test('former hardcoded UID cannot read or delete apps', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'apps/a1'), { name: 'テストアプリ', updatedAt: Timestamp.now() });
    });
    const db = env.authenticatedContext(FORMER_UID, token).firestore();
    await assertFails(getDoc(doc(db, 'apps/a1')));
    await assertFails(deleteDoc(doc(db, 'apps/a1')));
  });

  test('custom claim admin can read without a grant', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'apps/a1'), { name: 'テストアプリ', updatedAt: Timestamp.now() });
    });
    await assertSucceeds(getDoc(doc(adminClaim(), 'apps/a1')));
  });

  test('admins/{uid} written only by Admin SDK grants access', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'admins/collection-admin'), { enabled: true });
      await setDoc(doc(c.firestore(), 'apps/a1'), { name: 'テストアプリ', updatedAt: Timestamp.now() });
    });
    const db = env.authenticatedContext('collection-admin', token).firestore();
    await assertSucceeds(getDoc(doc(db, 'apps/a1')));
    await assertFails(setDoc(doc(writer(), 'admins/writer'), { enabled: true }));
    await assertFails(setDoc(doc(adminClaim(), 'admins/other'), { enabled: true }));
    await assertFails(setDoc(doc(adminClaim(), 'accessGrants/apps__registry'), { enabled: true, writers: ['writer'] }));
  });
});

describe('apps, note snapshots, and ouchi assets reject anonymous delete', () => {
  test('anonymous and reader cannot delete; writer can', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, 'apps/a1'), { name: 'テストアプリ', updatedAt: Timestamp.now() });
      await setDoc(doc(db, 'note-analytics/default/snapshots/20260928'), {
        weekStart: '2026-09-28', views: 1, source: 'manual', updatedAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'ouchi-hamasushi/family/assets/voice_otousan_まぐろ'), {
        data: 'data:audio/mp4;base64,QQ', mimeType: 'audio/mp4', size: 24, updatedAt: Timestamp.now(),
      });
    });
    for (const db of [anon(), reader(), stranger()]) {
      await assertFails(deleteDoc(doc(db, 'apps/a1')));
      await assertFails(deleteDoc(doc(db, 'note-analytics/default/snapshots/20260928')));
      await assertFails(deleteDoc(doc(db, 'ouchi-hamasushi/family/assets/voice_otousan_まぐろ')));
    }
    await assertSucceeds(deleteDoc(doc(writer(), 'apps/a1')));
    await assertSucceeds(deleteDoc(doc(writer(), 'note-analytics/default/snapshots/20260928')));
    await assertSucceeds(deleteDoc(doc(writer(), 'ouchi-hamasushi/family/assets/voice_otousan_まぐろ')));
  });
});

describe('apps field rules under authentication', () => {
  test('writer can add and rate; anonymous and bad fields cannot', async () => {
    await assertFails(addDoc(collection(anon(), 'apps'), appData()));
    await assertSucceeds(addDoc(collection(writer(), 'apps'), appData()));
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'apps/a1'), {
        name: 'テストアプリ', type: 'web', version: '0.1.0', status: 'dev',
        url: 'https://cc-dev-ps7.web.app/test/', icon: '', env: ['Claude Code'],
        releaseNote: 'メモ', docs: [], updatedAt: Timestamp.now(),
      });
    });
    await assertSucceeds(updateDoc(doc(writer(), 'apps/a1'), { rating: 4 }));
    await assertFails(updateDoc(doc(writer(), 'apps/a1'), { rating: 6 }));
    await assertFails(addDoc(collection(writer(), 'apps'), appData({ evil: 'x' })));
    await assertFails(addDoc(collection(writer(), 'apps'), appData({ name: '' })));
    await assertFails(getDocs(query(collection(anon(), 'apps'), orderBy('updatedAt', 'desc'))));
    await assertSucceeds(getDocs(query(collection(reader(), 'apps'), orderBy('updatedAt', 'desc'))));
  });
});

describe('note-analytics snapshots', () => {
  const save = (db, userId, snap) => setDoc(
    doc(db, 'note-analytics', userId, 'snapshots', snap.weekStart.replace(/-/g, '')),
    { ...snap, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  const manual = { weekStart: '2026-09-28', views: 1200, likes: 30, followers: 15, comments: 2, articles: 40, source: 'manual' };

  test('granted writer can save manual, screenshot, and chrome rows', async () => {
    await assertFails(save(anon(), 'default', manual));
    await assertSucceeds(save(writer(), 'default', manual));
    await assertSucceeds(save(writer(), 'default', { weekStart: '2026-09-28', views: 1300.5, likes: 31, followers: 16, comments: 3, source: 'screenshot' }));
    await assertSucceeds(save(writer(), 'my_note_id', { weekStart: '2026-10-05', views: 0, likes: 0, followers: 0, comments: 0, source: 'chrome-auto' }));
  });

  test('id mismatch, bad values, and other paths are denied', async () => {
    const ts = { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(writer(), 'note-analytics/default/snapshots/20260101'), { ...manual, ...ts }));
    await assertFails(save(writer(), 'default', { ...manual, views: -1 }));
    await assertFails(save(writer(), 'default', { ...manual, source: 'bot' }));
    await assertFails(setDoc(doc(writer(), 'note-analytics/default'), { a: 1 }));
    await assertFails(setDoc(doc(writer(), 'note-analytics/default/other/x'), { a: 1 }));
    await assertFails(deleteDoc(doc(writer(), 'note-analytics/default/snapshots/not-a-date')));
  });
});

describe('ouchi-hamasushi assets', () => {
  const voice = 'data:audio/webm;codecs=opus;base64,' + 'A'.repeat(1000);
  const setAsset = (db, family, key, dataUri, mimeType) => setDoc(
    doc(db, 'ouchi-hamasushi', family, 'assets', key),
    { data: dataUri, mimeType: mimeType || '', size: dataUri.length, updatedAt: serverTimestamp() },
  );

  test('writer can save voice and image; anonymous cannot', async () => {
    await assertFails(setAsset(anon(), 'family', 'voice_otousan_まぐろ', voice, 'audio/webm;codecs=opus'));
    await assertSucceeds(setAsset(writer(), 'family', 'voice_otousan_まぐろ', voice, 'audio/webm;codecs=opus'));
    await assertSucceeds(setAsset(writer(), 'family', 'image_avatar_okasan', 'data:image/jpeg;base64,/9j/', 'image/jpeg'));
  });

  test('bad keys, oversized data, and unauthenticated delete are denied', async () => {
    await assertFails(setAsset(writer(), 'family', 'setting_x', voice, 'audio/mp4'));
    await assertFails(setAsset(writer(), 'family', 'voice_a', 'A'.repeat(950001), 'audio/mp4'));
    await assertFails(deleteDoc(doc(anon(), 'ouchi-hamasushi/family/assets/voice_a')));
    await assertFails(deleteDoc(doc(writer(), 'ouchi-hamasushi/family/assets/setting_x')));
  });
});

describe('analytics increments require a grant and stay at +1', () => {
  const track = (db, id) => setDoc(doc(db, 'playlist_analytics', id), {
    viewCount: increment(1), lastViewed: serverTimestamp(),
  }, { merge: true });

  test('anonymous cannot increment or delete playlist analytics', async () => {
    await assertFails(track(anon(), 'pl1'));
    await assertSucceeds(track(writer(), 'pl1'));
    await assertSucceeds(track(writer(), 'pl1'));
    await assertFails(track(anon(), 'nope'));
    await assertFails(getDoc(doc(anon(), 'playlist_analytics/pl1')));
    await assertSucceeds(getDoc(doc(editor(), 'playlist_analytics/pl1')));
    await assertFails(deleteDoc(doc(anon(), 'playlist_analytics/pl1')));
    await assertSucceeds(deleteDoc(doc(editor(), 'playlist_analytics/pl1')));
  });

  const UUID = '0170e3eb-dd3a-4ce5-9d66-61697d4c47ad';
  const play = (db, playlistId, { uuid = UUID, videoId = 183584 } = {}) => {
    const data = { playCount: increment(1), lastPlayed: serverTimestamp(), videoId };
    if (playlistId) data[`playlists.${playlistId}`] = increment(1);
    return setDoc(doc(db, 'video_analytics', uuid), data, { merge: true });
  };

  test('video play counts reject anonymous writes and bad increments', async () => {
    await assertFails(play(anon(), 'pmi24uqkmswv8bbn'));
    await assertSucceeds(play(writer(), 'pmi24uqkmswv8bbn'));
    await assertSucceeds(play(writer(), 'huoz3jnumti1obfu'));
    await assertFails(setDoc(doc(writer(), 'video_analytics', UUID), {
      playCount: 999, lastPlayed: serverTimestamp(), videoId: 183584,
    }, { merge: true }));
    await assertFails(deleteDoc(doc(anon(), 'video_analytics', UUID)));
    await assertSucceeds(deleteDoc(doc(editor(), 'video_analytics', UUID)));
  });

  test('an existing document with 40 playlist keys can still increment one key', async () => {
    const uuid = '0170e3eb-dd3a-4ce5-9d66-000000000040';
    const existing = { playCount: 40, lastPlayed: Timestamp.now(), videoId: 183584 };
    for (let i = 0; i < 40; i++) existing[`playlists.pl${String(i).padStart(3, '0')}`] = 1;
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), `video_analytics/${uuid}`), existing));
    await assertSucceeds(play(writer(), 'pl000', { uuid }));
    await assertSucceeds(play(writer(), 'pl039', { uuid }));
    await assertFails(play(anon(), 'pl000', { uuid }));
  });

  test('125 playlist keys still allow one increment and a 126th new key is denied', async () => {
    const uuid = '0170e3eb-dd3a-4ce5-9d66-000000000125';
    const existing = { playCount: 125, lastPlayed: Timestamp.now(), videoId: 183584 };
    for (let i = 0; i < 125; i++) existing[`playlists.pl${String(i).padStart(3, '0')}`] = 1;
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), `video_analytics/${uuid}`), existing));
    await assertSucceeds(play(writer(), 'pl000', { uuid }));
    await assertSucceeds(play(writer(), 'pl124', { uuid }));
    await assertFails(play(writer(), 'zzzz_new', { uuid }));
  });
});

describe('shared collections stay closed to anonymous users', () => {
  test('expired grants and client edits of grants fail', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'accessGrants/meet-knowledge__team'), {
        enabled: true, readers: [], writers: ['writer'], expiresAt: Timestamp.fromMillis(1),
      });
      await setDoc(doc(c.firestore(), 'meet-knowledge/team/entries/q'), { question: 'q', answer: 'a', keywords: [] });
    });
    await assertFails(getDoc(doc(writer(), 'meet-knowledge/team/entries/q')));
    await assertFails(setDoc(doc(writer(), 'accessGrants/meet-knowledge__team'), { enabled: true, writers: ['writer'] }));
  });

  test('cost control documents stay unreadable', async () => {
    for (const path of ['costControls/global', 'costCounters/test', 'costStopBackups/test']) {
      await assertFails(getDoc(doc(adminClaim(), path)));
      await assertFails(setDoc(doc(writer(), path), { enabled: true }));
    }
  });

  test('bombing-bay create is granted-only and updates are frozen', async () => {
    const play = {
      pid: 'player', name: 'p', map: 'm', score: 0, timeSec: 1, result: 'over',
    };
    await assertFails(setDoc(doc(anon(), 'bombing-bay/global/plays/new'), play));
    await assertSucceeds(setDoc(doc(writer(), 'bombing-bay/global/plays/new'), play));
    await assertFails(updateDoc(doc(writer(), 'bombing-bay/global/plays/new'), { score: 10 }));
  });
});

describe('anonymous sign-in cannot use shared Flight Strip or coco-itta data', () => {
  const session = {
    uidHash: 'abc', date: '2026-10-15', month: '2026-10', hour: 9, dow: 4,
    version: 'v0.5.16', build: 'stable', createdAt: serverTimestamp(),
  };
  const feedback = {
    fbId: 'FB_0001', subject: '件名', email: 'member@example.test', message: '本文',
    build: 'stable', uid: 'writer', status: 'new', replySent: false, createdAt: serverTimestamp(),
  };

  test('anonymous auth is denied and a verified user can record a session', async () => {
    await assertFails(setDoc(doc(anonAuth(), 'fst_analytics/s1'), session));
    await assertFails(setDoc(doc(unverifiedEditor(), 'fst_analytics/s1'), session));
    await assertSucceeds(setDoc(doc(writer(), 'fst_analytics/s1'), session));
    await assertFails(getDoc(doc(writer(), 'fst_analytics/s1')));
    await assertFails(getDoc(doc(anonAuth(), 'fst_analytics/s1')));
    await assertSucceeds(getDoc(doc(editor(), 'fst_analytics/s1')));
    await assertFails(getDoc(doc(unverifiedEditor(), 'fst_analytics/s1')));
    await assertSucceeds(setDoc(doc(writer(), 'users/writer/tasks/t'), { title: '自分のタスク' }));
    await assertFails(setDoc(doc(anonAuth(), 'users/anon-user/tasks/t'), { title: '匿名' }));
    await assertFails(setDoc(doc(writer(), 'users/stranger/tasks/t'), { title: '他人' }));
  });

  test('clients cannot create or update feedback, the counter, or rate-limit state', async () => {
    const stored = { ...feedback, status: 'unreviewed', uid: 'writer' };
    await assertFails(setDoc(doc(anonAuth(), 'fst_feedback_meta/counter'), { count: 1 }));
    await assertFails(setDoc(doc(writer(), 'fst_feedback_meta/counter'), { count: 1 }));
    await assertFails(setDoc(doc(editor(), 'fst_feedback_meta/counter'), { count: 1 }));
    await assertFails(setDoc(doc(writer(), 'fstRateLimits/user-hour'), { count: 1 }));
    await assertFails(setDoc(doc(anonAuth(), 'fst_feedback/FB_0001'), { ...stored, uid: 'anon-user' }));
    await assertFails(setDoc(doc(writer(), 'fst_feedback/FB_0001'), stored));
    await assertFails(setDoc(doc(editor(), 'fst_feedback/FB_0001'), { ...stored, uid: 'editor' }));
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, 'fst_feedback/FB_0001'), stored);
      await setDoc(doc(db, 'fst_feedback/FB_OLD'), { ...feedback, status: 'new', uid: 'writer' });
    });
    await assertSucceeds(getDoc(doc(writer(), 'fst_feedback/FB_0001')));
    await assertFails(getDoc(doc(joiner(), 'fst_feedback/FB_0001')));
    await assertSucceeds(getDocs(query(collection(editor(), 'fst_feedback'))));
    await assertFails(getDocs(query(collection(anonAuth(), 'fst_feedback'))));
    await assertFails(getDocs(query(collection(unverifiedEditor(), 'fst_feedback'))));
    await assertFails(updateDoc(doc(writer(), 'fst_feedback/FB_0001'), { status: 'reviewed' }));
    await assertFails(updateDoc(doc(writer(), 'fst_feedback/FB_0001'), { replySent: true }));
    await assertFails(updateDoc(doc(editor(), 'fst_feedback/FB_OLD'), { status: 'unreviewed' }));
    await assertFails(updateDoc(doc(editor(), 'fst_feedback/FB_0001'), { status: 'reviewed' }));
    await assertFails(updateDoc(doc(editor(), 'fst_feedback/FB_0001'), {
      status: 'resolved', replyText: '返信',
    }));
    await assertFails(deleteDoc(doc(editor(), 'fst_feedback/FB_0001')));
    await assertFails(getDoc(doc(editor(), 'fstRateLimits/user-hour')));
  });

  test('coco-itta groups reject anonymous auth and keep join-by-id for verified users', async () => {
    const created = {
      name: '我が家', createdBy: 'member@example.test', createdAt: serverTimestamp(),
      members: [{ email: 'member@example.test', role: 'owner' }],
      memberNames: [], pins: [], routes: [], routeSettings: {},
    };
    await assertFails(setDoc(doc(anonAuth(), 'groups/FAMILY'), created));
    await assertSucceeds(setDoc(doc(writer(), 'groups/FAMILY'), created));
    await assertFails(getDocs(collection(writer(), 'groups')));
    await assertFails(getDoc(doc(anonAuth(), 'groups/FAMILY')));
    await assertSucceeds(getDoc(doc(joiner(), 'groups/FAMILY')));
    await assertFails(updateDoc(doc(joiner(), 'groups/FAMILY'), { pins: [{ id: 'p' }] }));
    await assertSucceeds(updateDoc(doc(joiner(), 'groups/FAMILY'), {
      members: [
        { email: 'member@example.test', role: 'owner' },
        { email: 'joiner@example.test', role: 'member' },
      ],
    }));
    await assertSucceeds(updateDoc(doc(joiner(), 'groups/FAMILY'), { pins: [{ id: 'p' }] }));
    await assertFails(deleteDoc(doc(joiner(), 'groups/FAMILY')));
    await assertSucceeds(deleteDoc(doc(writer(), 'groups/FAMILY')));
  });
});

describe('email checks require a verified address', () => {
  test('an unverified editor email cannot write playlists or read estimates', async () => {
    await assertFails(setDoc(doc(unverifiedEditor(), 'playlists/pl2'), { name: 'x' }));
    await assertSucceeds(setDoc(doc(editor(), 'playlists/pl2'), { name: 'x' }));
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'meiyusha-estimate/prices'), { unit: 1 });
    });
    await assertFails(getDoc(doc(unverifiedEditor(), 'meiyusha-estimate/prices')));
    await assertFails(getDoc(doc(anonAuth(), 'meiyusha-estimate/prices')));
    await assertSucceeds(getDoc(doc(editor(), 'meiyusha-estimate/prices')));
  });

  test('the shared meiyusha password account can read prices only when email_verified', async () => {
    const verifiedPassword = () => env.authenticatedContext('meiyusha-shared', {
      email: 'meiyusha@meiyusha-estimate.app',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    }).firestore();
    const unverifiedPassword = () => env.authenticatedContext('meiyusha-unverified', {
      email: 'meiyusha@meiyusha-estimate.app',
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    }).firestore();
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'meiyusha-estimate/config'), { json: '{}' });
    });
    await assertFails(getDoc(doc(unverifiedPassword(), 'meiyusha-estimate/config')));
    await assertSucceeds(getDoc(doc(verifiedPassword(), 'meiyusha-estimate/config')));
    await assertFails(setDoc(doc(verifiedPassword(), 'meiyusha-estimate/config'), { json: '{"unit":2}' }));
  });

  test('hondoko owner and member checks ignore unverified email', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, 'hondoko-config/members'), { emails: ['member@example.test'] });
      await setDoc(doc(db, 'hondoko-config/sharing'), { mode: 'private', viewers: [] });
      await setDoc(doc(db, 'hondoko-shelves/s1'), { name: '棚' });
    });
    await assertFails(getDoc(doc(unverifiedEditor(), 'hondoko-shelves/s1')));
    await assertSucceeds(getDoc(doc(writer(), 'hondoko-shelves/s1')));
    await assertFails(setDoc(doc(unverifiedOwner(), 'hondoko-config/sharing'), { mode: 'link', viewers: [] }));
    await assertSucceeds(setDoc(doc(owner(), 'hondoko-config/sharing'), { mode: 'link', viewers: [] }));
  });
});

describe('Google sign-in against the Auth emulator', () => {
  test('a verified Google user is denied until an admin record exists, then can read and delete', async () => {
    const app = initializeApp({ apiKey: 'demo', authDomain: 'localhost', projectId: 'demo-cc-dev-cost', appId: 'demo' }, 'google-e2e');
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8087);
    try {
      const signed = await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
        sub: 'google-e2e-user',
        email: 'google-user@example.test',
        email_verified: true,
      })));
      const claims = await signed.user.getIdTokenResult();
      assert.equal(claims.claims.firebase.sign_in_provider, 'google.com');
      assert.equal(signed.user.emailVerified, true);
      assert.equal(signed.user.isAnonymous, false);
      await env.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'apps/from-google'), { name: 'テストアプリ', updatedAt: Timestamp.now() });
      });
      await assertFails(getDoc(doc(db, 'apps/from-google')));
      await env.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'admins', signed.user.uid), { enabled: true });
      });
      await assertSucceeds(getDoc(doc(db, 'apps/from-google')));
      await assertSucceeds(deleteDoc(doc(db, 'apps/from-google')));
      const anonApp = initializeApp({ apiKey: 'demo', authDomain: 'localhost', projectId: 'demo-cc-dev-cost', appId: 'demo-anon' }, 'anon-e2e');
      const anonDb = getFirestore(anonApp);
      connectFirestoreEmulator(anonDb, '127.0.0.1', 8087);
      await env.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'apps/from-google'), { name: 'テストアプリ', updatedAt: Timestamp.now() });
      });
      await assertFails(getDoc(doc(anonDb, 'apps/from-google')));
      await assertFails(deleteDoc(doc(anonDb, 'apps/from-google')));
      await deleteApp(anonApp);
      await signOut(auth);
    } finally {
      await deleteApp(app);
    }
  });
});
