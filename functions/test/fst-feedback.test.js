'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuard, rateOf, periodKeys, retryAfterSeconds } = require('../cost-guard');
const { createFstFeedbackHandler, createFstFeedbackUpdateHandler } = require('../fst-feedback');

const NOW = Date.parse('2026-10-15T01:00:00Z');

function memoryDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  function snap(path) {
    return { exists: records.has(path), data: () => records.get(path) };
  }
  return {
    records,
    doc(path) {
      return { path, get: async () => snap(path) };
    },
    runTransaction(fn) {
      const run = queue.then(async () => {
        const writes = [];
        const result = await fn({
          get: async ref => snap(ref.path),
          set: (ref, value) => writes.push([ref.path, value]),
          update: (ref, value) => writes.push([ref.path, { ...records.get(ref.path), ...value }]),
        });
        writes.forEach(([path, value]) => records.set(path, value));
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function request(body, headers = {}) {
  const all = {
    origin: 'https://cc-dev-ps7.web.app',
    authorization: 'Bearer valid',
    'x-firebase-appcheck': 'appcheck',
    'x-forwarded-for': '203.0.113.10',
    'content-type': 'application/json',
    ...headers,
  };
  return {
    method: 'POST',
    body,
    rawBody: Buffer.from(JSON.stringify(body || {})),
    ip: '203.0.113.10',
    get: key => all[key.toLowerCase()],
  };
}

const payload = {
  subject: '件名',
  email: 'user@example.test',
  message: '本文 <b>そのまま</b>',
  build: 'stable',
  appId: 'flight-strip-todo',
  version: '0.5.17',
  url: 'https://cc-dev-ps7.web.app/Flight_Strip_TODO/?token=secret#part',
  faxNumber: '',
  openedAtMs: NOW - 5000,
};

let scopeSeq = 0;

function watch(db) {
  const seen = { gets: 0, transactions: 0 };
  const origDoc = db.doc.bind(db);
  db.doc = path => {
    const ref = origDoc(path);
    const origGet = ref.get.bind(ref);
    ref.get = async () => {
      seen.gets += 1;
      return origGet();
    };
    return ref;
  };
  const origTx = db.runTransaction.bind(db);
  db.runTransaction = fn => {
    seen.transactions += 1;
    return origTx(fn);
  };
  return seen;
}

function setup(overrides = {}) {
  const clock = overrides.now || (() => NOW);
  const db = memoryDb({ 'costControls/global': { enabled: true }, ...overrides.records });
  const users = overrides.users || { valid: { uid: 'user-1', email: 'user@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
  const guard = createGuard({
    db,
    now: clock,
    verifyIdToken: async token => {
      if (!users[token]) throw Error('bad');
      return users[token];
    },
    verifyAppCheck: async token => { if (token !== 'appcheck') throw Error('bad'); },
    ...overrides.guard,
  });
  const handler = createFstFeedbackHandler({
    authorize: req => guard.authorize(req, 'fstFeedback'),
    db,
    now: clock,
    serverTimestamp: () => 'server-time',
    limits: overrides.limits,
    holdScope: overrides.holdScope || `fb${++scopeSeq}:`,
  });
  const update = createFstFeedbackUpdateHandler({
    authorize: req => guard.authorize(req, 'fstFeedback'),
    db,
    now: () => NOW,
  });
  return { db, handler, update };
}

test('a verified App Check request is stored as unreviewed and the counter stays on the server', async () => {
  const { db, handler } = setup();
  const first = response();
  await handler(request(payload), first);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.status, 'unreviewed');
  assert.equal(first.body.fbId, 'FB_0001');
  assert.equal(first.body.feedbackId, 'FB_0001');
  const saved = db.records.get('fst_feedback/FB_0001');
  assert.equal(saved.status, 'unreviewed');
  assert.equal(saved.uid, 'user-1');
  assert.equal(saved.message, '本文 <b>そのまま</b>');
  assert.equal(saved.url, 'https://cc-dev-ps7.web.app/Flight_Strip_TODO/');
  assert.equal(saved.appId, 'flight-strip-todo');
  assert.equal(saved.version, '0.5.17');
  assert.equal(db.records.get('fst_feedback_meta/counter').count, 1);
  assert.equal(JSON.stringify([...db.records.values()]).includes('203.0.113.10'), false);
  const second = response();
  await handler(request({
    ...payload,
    message: '二つ目',
    build: 'dev',
    appId: 'flight-strip-todo-dev',
    version: '0.10.30-dev',
    url: 'https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/',
  }), second);
  assert.equal(second.body.fbId, 'FB_0002');
  assert.equal(db.records.get('fst_feedback_meta/counter').count, 2);
});

test('missing App Check, anonymous auth, and a closed budget do not write feedback', async () => {
  for (const [headers, guard, records, code] of [
    [{ 'x-firebase-appcheck': undefined }, {}, {}, 'APP_CHECK_REQUIRED'],
    [{}, { verifyIdToken: async () => ({ uid: 'anon', email_verified: false, firebase: { sign_in_provider: 'anonymous' } }) }, {}, 'VERIFIED_ACCOUNT_REQUIRED'],
    [{}, {}, { 'costControls/global': { enabled: false } }, 'SERVICE_PAUSED'],
    [{}, {}, {}, null],
  ]) {
    const { db, handler } = setup({ guard, records });
    if (code === null) db.records.delete('costControls/global');
    const res = response();
    await handler(request(payload, headers), res);
    assert.equal(res.body.error, code || 'SERVICE_PAUSED');
    assert.equal([...db.records.keys()].some(key => key.startsWith('fst_feedback/')), false);
  }
});

function unsetEnv(name) {
  Reflect.deleteProperty(process.env, name);
}

test('a localhost feedback url is stored only for a demo project outside cloud run', async () => {
  const keys = ['FUNCTIONS_EMULATOR', 'FST_E2E_EMULATOR', 'K_SERVICE', 'FUNCTION_TARGET', 'K_REVISION', 'GCLOUD_PROJECT', 'GCP_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_CONFIG'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const local = { ...payload, url: 'http://127.0.0.1:4173/Flight_Strip_TODO_dev/?x=1#part' };
  try {
    for (const key of keys) unsetEnv(key);
    process.env.GCLOUD_PROJECT = 'demo-cc-dev-fst-e2e';
    const open = setup();
    const ok = response();
    await open.handler(request(local), ok);
    assert.equal(ok.statusCode, 201);
    assert.equal(open.db.records.get('fst_feedback/FB_0001').url, 'http://127.0.0.1:4173/Flight_Strip_TODO_dev/');
    for (const [key, value] of [['K_SERVICE', 'fstFeedbackSubmit'], ['FUNCTION_TARGET', 'fstFeedbackSubmit'], ['K_REVISION', 'fstFeedbackSubmit-00001-abc']]) {
      unsetEnv('K_SERVICE');
      unsetEnv('FUNCTION_TARGET');
      unsetEnv('K_REVISION');
      process.env[key] = value;
      const closed = setup();
      const denied = response();
      await closed.handler(request(local), denied);
      assert.equal(denied.statusCode, 400);
      assert.equal(denied.body.error, 'INVALID_FEEDBACK');
      assert.equal([...closed.db.records.keys()].some(id => id.startsWith('fst_feedback/')), false);
    }
    unsetEnv('K_SERVICE');
    unsetEnv('FUNCTION_TARGET');
    unsetEnv('K_REVISION');
    process.env.GCLOUD_PROJECT = 'cc-dev-ps7';
    const production = setup();
    const rejected = response();
    await production.handler(request(local), rejected);
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body.error, 'INVALID_FEEDBACK');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) unsetEnv(key);
      else process.env[key] = value;
    }
  }
});

test('unknown fields, honeypot, timing, and overlong text are rejected before a write', async () => {
  const { db, handler } = setup();
  for (const body of [
    { ...payload, status: 'resolved' },
    { ...payload, faxNumber: 'bot' },
    { ...payload, openedAtMs: NOW },
    { ...payload, message: 'あ'.repeat(2001) },
    { ...payload, url: 'http://cc-dev-ps7.web.app/Flight_Strip_TODO/' },
    { ...payload, appId: 'flight-strip-todo-dev' },
  ]) {
    const res = response();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_FEEDBACK');
  }
  assert.equal(db.records.has('fst_feedback/FB_0001'), false);
});

test('a closed budget returns 503 before feedback is stored', async () => {
  const { db, handler } = setup({ records: { 'costControls/global': { enabled: false } } });
  const res = response();
  await handler(request(payload), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'SERVICE_PAUSED');
  assert.equal(res.headers['Retry-After'], '60');
  assert.equal([...db.records.keys()].some(key => key.startsWith('fst_feedback/')), false);
  const user = [...db.records.entries()].find(([name]) => name.startsWith('fstRateLimits/u_'));
  assert.equal(user[1].dayCount, 1);
  const seen = watch(db);
  const again = response();
  await handler(request(payload), again);
  assert.equal(again.statusCode, 429);
  assert.equal(seen.gets, 0);
  assert.equal(seen.transactions, 0);
});

test('oversized text and the per-user rate limit are rejected', async () => {
  const { db, handler } = setup({ limits: { ...rateOf('fstFeedback'), userMinute: 2 } });
  const ok = response();
  await handler(request(payload), ok);
  await handler(request({ ...payload, message: '二つ目' }), response());
  const limited = response();
  await handler(request({ ...payload, message: '三つ目' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, 'USAGE_LIMIT');
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(db.records.has('fst_feedback/FB_0003'), false);
  assert.equal(ok.statusCode, 201);
});

test('the same content does not create a second feedback id', async () => {
  const { db, handler } = setup();
  await handler(request(payload), response());
  const again = response();
  await handler(request(payload), again);
  assert.equal(again.statusCode, 429);
  assert.equal(db.records.has('fst_feedback/FB_0002'), false);
  assert.equal(db.records.get('fst_feedback_meta/counter').count, 1);
  const user = [...db.records.entries()].find(([name]) => name.includes('/u_'));
  const globalDay = [...db.records.entries()].find(([name]) => name.includes('/g_d_'));
  assert.equal(user[1].dayCount, 2);
  assert.equal(globalDay[1].count, 1);
});

test('the global minute cap returns 429 across callers', async () => {
  const db = memoryDb({ 'costControls/global': { enabled: true } });
  let uid = 'user-a';
  const guard = createGuard({
    db,
    now: () => NOW,
    verifyIdToken: async () => ({ uid, email: 'user@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } }),
    verifyAppCheck: async () => ({}),
  });
  const handler = createFstFeedbackHandler({
    authorize: req => guard.authorize(req, 'fstFeedback'),
    db,
    now: () => NOW,
    serverTimestamp: () => 'server-time',
    limits: { ...rateOf('fstFeedback'), globalMinute: 1 },
    holdScope: 'feedback-global:',
  });
  await handler(request(payload, { 'x-forwarded-for': '1.1.1.1' }), response());
  uid = 'user-b';
  const limited = response();
  await handler(request(
    { ...payload, message: '別の人' },
    { 'x-forwarded-for': '9.9.9.9' },
  ), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, 'USAGE_LIMIT');
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(db.records.has('fst_feedback/FB_0002'), false);
  assert.equal([...db.records.keys()].some(key => key.includes('ip_')), false);
});

test('a rejected feedback call writes nothing and a repeat does not read', async () => {
  const limits = rateOf('fstFeedback');
  const day = periodKeys(NOW).day;
  const slot = `g_d_${day}`;
  const key = `fstRateLimits/${slot}`;
  const { db, handler } = setup({
    records: { [key]: { count: limits.globalDay, updatedAtMs: NOW } },
  });
  const seen = watch(db);
  const before = JSON.stringify([...db.records.entries()]);
  const first = response();
  await handler(request(payload), first);
  assert.equal(first.statusCode, 429);
  assert.equal(first.headers['Retry-After'], String(retryAfterSeconds(NOW, slot)));
  assert.equal(Number(first.headers['Retry-After']) > 60, true);
  assert.equal([...db.records.keys()].some(name => name.startsWith('fst_feedback/')), false);
  assert.equal(db.records.get(key).count, limits.globalDay);
  const user = [...db.records.entries()].find(([name]) => name.includes('/u_'));
  assert.equal(user[1].dayCount, 1);
  const gets = seen.gets;
  const transactions = seen.transactions;
  assert.equal(transactions, 2);
  const held = JSON.stringify([...db.records.entries()]);
  const second = response();
  await handler(request(payload), second);
  assert.equal(second.statusCode, 429);
  assert.equal(seen.gets, gets);
  assert.equal(seen.transactions, transactions);
  assert.equal(JSON.stringify([...db.records.entries()]), held);
  assert.notEqual(held, before);
});

test('only an editor can change status, and the message stays', async () => {
  const { db, handler, update } = setup({
    users: {
      valid: { uid: 'user-1', email: 'user@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } },
      editor: { uid: 'editor', email: 'junpei.omote@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } },
    },
  });
  await handler(request(payload), response());
  const denied = response();
  await update(request({ fbId: 'FB_0001', status: 'reviewed' }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(db.records.get('fst_feedback/FB_0001').status, 'unreviewed');
  const changed = response();
  await update(request({ fbId: 'FB_0001', status: 'resolved', replyText: '対応しました' }, { authorization: 'Bearer editor' }), changed);
  assert.equal(changed.statusCode, 200);
  assert.equal(db.records.get('fst_feedback/FB_0001').status, 'resolved');
  assert.equal(db.records.get('fst_feedback/FB_0001').message, payload.message);
  const old = response();
  await update(request({ fbId: 'FB_0001', status: 'replied' }, { authorization: 'Bearer editor' }), old);
  assert.equal(old.statusCode, 400);
  assert.equal(db.records.get('fst_feedback/FB_0001').status, 'resolved');
});
