'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuard } = require('../cost-guard');
const { createFstAnalyticsHandler, jstParts } = require('../fst-analytics');

const NOW = Date.parse('2026-10-15T15:30:00Z');

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
        set: async value => { records.set(path, value); },
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
    statusCode: 200, headers: {},
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
    'x-forwarded-for': '203.0.113.20',
    ...headers,
  };
  return {
    method: 'POST', body, ip: '203.0.113.20',
    rawBody: Buffer.from(JSON.stringify(body || {})),
    get: key => all[key.toLowerCase()],
  };
}

const payload = {
  appId: 'flight-strip-todo',
  version: 'v0.5.17',
  build: 'stable',
  type: 'session',
  device: 'desktop',
};

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
  const handler = createFstAnalyticsHandler({
    authorize: req => guard.authorize(req, 'fstAnalytics'),
    db,
    now: () => NOW,
    serverTimestamp: () => 'server-time',
    limits: overrides.limits,
  });
  return { db, handler };
}

function saved(db) {
  return [...db.records.entries()].filter(([key]) => key.startsWith('fst_analytics/'));
}

test('japan calendar fields come from the server clock', () => {
  assert.deepEqual(jstParts(NOW), { date: '2026-10-16', month: '2026-10', hour: 0, dow: 5 });
});

test('a verified event stores a server hash and japan time, not the raw uid or ip', async () => {
  const { db, handler } = setup();
  const res = response();
  await handler(request(payload), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { ok: true });
  const rows = saved(db);
  assert.equal(rows.length, 1);
  const row = rows[0][1];
  assert.equal(row.type, 'session');
  assert.equal(row.version, '0.5.17');
  assert.equal(row.date, '2026-10-16');
  assert.equal(row.hour, 0);
  assert.equal(row.uid, undefined);
  assert.equal(row.uidHash.length, 16);
  assert.equal(JSON.stringify(rows).includes('user-1'), false);
  assert.equal(JSON.stringify([...db.records.values()]).includes('203.0.113.20'), false);
});

test('missing App Check, a closed budget, and a client uid do not write', async () => {
  for (const [headers, records, body, code] of [
    [{ 'x-firebase-appcheck': undefined }, {}, payload, 'APP_CHECK_REQUIRED'],
    [{}, { 'costControls/global': { enabled: false } }, payload, 'SERVICE_PAUSED'],
    [{}, {}, { ...payload, uidHash: 'client-chosen' }, 'INVALID_ANALYTICS'],
    [{}, {}, { ...payload, appId: 'flight-strip-todo-dev' }, 'INVALID_ANALYTICS'],
    [{}, {}, { ...payload, device: 'tablet' }, 'INVALID_ANALYTICS'],
  ]) {
    const { db, handler } = setup({ records });
    const res = response();
    await handler(request(body, headers), res);
    assert.equal(res.body.error, code);
    assert.equal(saved(db).length, 0);
  }
});

test('unknown fields, mismatched builds, and a bad version do not write', async () => {
  const bodies = [
    { ...payload, extra: true },
    { ...payload, date: '2026-10-16' },
    { ...payload, uidHash: 'client' },
    { ...payload, appId: 'flight-strip-todo', build: 'dev' },
    { ...payload, appId: 'flight-strip-todo-dev', build: 'stable' },
    { ...payload, appId: 'other-app', build: 'stable' },
    { ...payload, type: 'deleted' },
    { ...payload, version: 'not-a-version' },
    { ...payload, device: 'tablet' },
  ];
  for (const body of bodies) {
    const { db, handler } = setup();
    const res = response();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(res.body.error, 'INVALID_ANALYTICS');
    assert.equal(saved(db).length, 0);
  }
  const { handler } = setup();
  const get = response();
  await handler({ ...request(payload), method: 'GET' }, get);
  assert.equal(get.statusCode, 405);
});

test('a closed budget returns 503 before an event is stored', async () => {
  const { db, handler } = setup({ records: { 'costControls/global': { enabled: false } } });
  const res = response();
  await handler(request(payload), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'SERVICE_PAUSED');
  assert.equal(saved(db).length, 0);
});

test('the global minute cap returns 429 for a second caller', async () => {
  const db = memoryDb({ 'costControls/global': { enabled: true } });
  let uid = 'user-a';
  const guard = createGuard({
    db,
    now: () => NOW,
    verifyIdToken: async () => ({ uid, email: 'user@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } }),
    verifyAppCheck: async () => ({}),
  });
  const handler = createFstAnalyticsHandler({
    authorize: req => guard.authorize(req, 'fstAnalytics'),
    db,
    now: () => NOW,
    serverTimestamp: () => 'server-time',
    limits: { userMinute: 30, userDay: 400, globalMinute: 1, globalDay: 50000 },
  });
  await handler(request(payload, { 'x-forwarded-for': '1.1.1.1' }), response());
  uid = 'user-b';
  const limited = response();
  await handler(request(
    { ...payload, type: 'task_created' },
    { 'x-forwarded-for': '9.9.9.9' },
  ), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, 'USAGE_LIMIT');
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(saved(db).length, 1);
  assert.equal([...db.records.keys()].some(key => key.includes('an_ip_')), false);
});

test('the per-user minute cap stops further events', async () => {
  const { db, handler } = setup({ limits: { userMinute: 2, userDay: 400, globalMinute: 2000, globalDay: 50000 } });
  await handler(request(payload), response());
  await handler(request({ appId: payload.appId, version: payload.version, build: payload.build, type: 'task_created' }), response());
  const limited = response();
  await handler(request({ ...payload, type: 'task_completed' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(saved(db).length, 2);
});
