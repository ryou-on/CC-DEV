'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuard } = require('../cost-guard');
const { createFstFeedbackHandler } = require('../fst-feedback');

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
      return {
        path,
        get: async () => snap(path),
      };
    },
    runTransaction(fn) {
      const run = queue.then(async () => {
        const writes = [];
        const result = await fn({
          get: async ref => snap(ref.path),
          set: (ref, value) => writes.push([ref.path, value]),
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

function setup(overrides = {}) {
  const db = memoryDb({ 'costControls/global': { enabled: true }, ...overrides.records });
  const guard = createGuard({
    db,
    now: () => NOW,
    verifyIdToken: async token => {
      if (token !== 'valid') throw Error('bad');
      return { uid: 'user-1', email: 'user@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
    },
    verifyAppCheck: async token => { if (token !== 'appcheck') throw Error('bad'); },
    ...overrides.guard,
  });
  const handler = createFstFeedbackHandler({
    authorize: req => guard.authorize(req, 'fstFeedback'),
    db,
    now: () => NOW,
    serverTimestamp: () => 'server-time',
    limits: overrides.limits,
  });
  return { db, handler };
}

const payload = { subject: '件名', email: 'user@example.test', message: '本文', build: 'stable', status: 'new' };

test('a verified App Check request is stored as unreviewed and the counter stays on the server', async () => {
  const { db, handler } = setup();
  const first = response();
  await handler(request(payload), first);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.status, 'unreviewed');
  assert.equal(first.body.fbId, 'FB_0001');
  assert.equal(db.records.get('fst_feedback/FB_0001').status, 'unreviewed');
  assert.equal(db.records.get('fst_feedback/FB_0001').uid, 'user-1');
  assert.equal(db.records.get('fst_feedback_meta/counter').count, 1);
  const second = response();
  await handler(request({ ...payload, message: '二つ目', build: 'dev' }), second);
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

test('oversized text and the per-user rate limit are rejected', async () => {
  const { db, handler } = setup({ limits: { userHour: 2, userDay: 20, ipHour: 30, ipDay: 100 } });
  const bad = response();
  await handler(request({ ...payload, message: 'あ'.repeat(201) }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error, 'INVALID_FEEDBACK');
  assert.equal(db.records.has('fst_feedback/FB_0001'), false);
  const ok = response();
  await handler(request(payload), ok);
  await handler(request({ ...payload, message: '二つ目' }), response());
  const limited = response();
  await handler(request({ ...payload, message: '三つ目' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, 'USAGE_LIMIT');
  assert.equal(db.records.has('fst_feedback/FB_0003'), false);
  assert.equal(ok.statusCode, 201);
});

test('a shared IP is limited across users', async () => {
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
    limits: { userHour: 10, userDay: 20, ipHour: 2, ipDay: 100 },
  });
  await handler(request(payload), response());
  uid = 'user-b';
  await handler(request({ ...payload, message: '別の人' }), response());
  uid = 'user-c';
  const limited = response();
  await handler(request({ ...payload, message: '三人目' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(db.records.has('fst_feedback/FB_0003'), false);
});
