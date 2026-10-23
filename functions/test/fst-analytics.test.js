'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuard, rateOf, periodKeys, retryAfterSeconds } = require('../cost-guard');
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
  const guard = createGuard({
    db,
    now: clock,
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
    now: clock,
    serverTimestamp: () => 'server-time',
    limits: overrides.limits,
    holdScope: overrides.holdScope || `an${++scopeSeq}:`,
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
  assert.equal(res.headers['Retry-After'], '60');
  assert.equal(saved(db).length, 0);
});

test('a paused budget consumes one user attempt and then stops reading', async () => {
  const { db, handler } = setup({
    records: { 'costControls/global': { enabled: false } },
    holdScope: 'paused-reads:',
  });
  const seen = watch(db);
  const first = response();
  await handler(request(payload), first);
  assert.equal(first.statusCode, 503);
  assert.equal(first.body.error, 'SERVICE_PAUSED');
  assert.equal(first.headers['Retry-After'], '60');
  assert.equal(saved(db).length, 0);
  const user = [...db.records.entries()].find(([name]) => name.includes('/an_u_'));
  assert.equal(user[1].dayCount, 1);
  assert.equal(user[1].minuteCount, 1);
  const gets = seen.gets;
  const transactions = seen.transactions;
  assert.equal(gets > 0, true);
  for (let i = 0; i < 50; i += 1) {
    const again = response();
    await handler(request(payload), again);
    assert.equal(again.statusCode, 429);
    assert.equal(again.headers['Retry-After'], '60');
  }
  assert.equal(seen.gets, gets);
  assert.equal(seen.transactions, transactions);
  assert.equal(saved(db).length, 0);
  assert.equal(user[1].dayCount, 1);
});

test('a guard failure returns 503 with Retry-After', async () => {
  const { db, handler } = setup();
  const orig = db.doc.bind(db);
  db.doc = path => {
    const ref = orig(path);
    ref.get = async () => { throw new Error('firestore down'); };
    return ref;
  };
  const res = response();
  await handler(request(payload), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'COST_GUARD_UNAVAILABLE');
  assert.equal(res.headers['Retry-After'], '60');
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
    limits: { ...rateOf('fstAnalytics'), globalMinute: 1 },
    holdScope: 'analytics-global:',
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
  const { db, handler } = setup({ limits: { ...rateOf('fstAnalytics'), userMinute: 2 } });
  await handler(request(payload), response());
  await handler(request({ appId: payload.appId, version: payload.version, build: payload.build, type: 'task_created' }), response());
  const limited = response();
  await handler(request({ ...payload, type: 'task_completed' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(saved(db).length, 2);
});

test('a rejected analytics call writes nothing and a repeat does not read until the window opens', async () => {
  const limits = rateOf('fstAnalytics');
  const day = periodKeys(NOW).day;
  const slot = `an_g_d_${day}`;
  const key = `fstRateLimits/${slot}`;
  let clock = NOW;
  const { db, handler } = setup({
    records: { [key]: { count: limits.globalDay, updatedAtMs: NOW } },
    now: () => clock,
  });
  const seen = watch(db);
  const before = JSON.stringify([...db.records.entries()]);
  const first = response();
  await handler(request(payload), first);
  assert.equal(first.statusCode, 429);
  assert.equal(first.body.error, 'USAGE_LIMIT');
  assert.equal(first.headers['Retry-After'], String(retryAfterSeconds(NOW, slot)));
  assert.equal(Number(first.headers['Retry-After']) > 60, true);
  assert.equal(saved(db).length, 0);
  assert.equal(db.records.get(key).count, limits.globalDay);
  const user = [...db.records.entries()].find(([name]) => name.includes('an_u_') && !name.includes('_m_') && !name.includes('_d_'));
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
  clock = NOW + retryAfterSeconds(NOW, slot) * 1000;
  const third = response();
  await handler(request(payload), third);
  assert.equal(third.statusCode, 201);
  assert.equal(seen.transactions, transactions + 2);
  assert.equal(db.records.get(key).count, limits.globalDay);
  assert.equal(saved(db).length, 1);
  assert.notEqual(JSON.stringify([...db.records.entries()]), held);
  assert.notEqual(JSON.stringify([...db.records.entries()]), before);
});
