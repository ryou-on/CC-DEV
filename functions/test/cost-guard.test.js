'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuard, LIMITS, periodKeys } = require('../cost-guard');
const { armExpiry, expireCall, callIdFromLocation } = require('../realtime-cost');

const NOW = Date.parse('2026-10-05T01:00:00Z');
function fakeDb(service = 'miniGenerate') {
  const records = new Map([[`costControls/${service}`, { enabled: true, allowedUids: ['u1', 'u2'], expiresAtMs: NOW + 86400000, expiryQueueVerified: true }]]);
  let queue = Promise.resolve();
  function snap(path) { return { exists: records.has(path), data: () => records.get(path) }; }
  return {
    records,
    doc: path => ({ path, get: async () => snap(path), set: async value => records.set(path, value), update: async value => records.set(path, {...records.get(path), ...value}) }),
    runTransaction(fn) {
      const run = queue.then(async () => {
        const writes = [];
        const result = await fn({
          getAll: async (...refs) => refs.map(ref => snap(ref.path)),
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
const actor = { uid: 'u1', email: 'tester@example.test', service: 'miniGenerate' };
function request(headers = {}, body = {}) {
  const all = { authorization: 'Bearer test-token', 'x-firebase-appcheck': 'attested', ...headers };
  return { body, rawBody: Buffer.from(JSON.stringify(body)), get: key => all[key.toLowerCase()] };
}
function fixture(service = 'miniGenerate', overrides = {}) {
  const db = fakeDb(service);
  const guard = createGuard({ db, now: () => NOW,
    verifyIdToken: async () => ({ uid: 'u1', email_verified: true, firebase: { sign_in_provider: 'google.com' } }),
    verifyAppCheck: async () => ({}), ...overrides });
  return { db, guard };
}

test('unauthenticated, invalid and unverified accounts never reach quota storage', async () => {
  for (const [headers, overrides, code] of [
    [{authorization: undefined}, {}, 'SIGN_IN_REQUIRED'],
    [{origin: 'https://evil.example'}, {}, 'ORIGIN_DENIED'],
    [{}, {verifyIdToken: async () => { throw Error(); }}, 'INVALID_ID_TOKEN'],
    [{}, {verifyIdToken: async () => ({uid: 'anon', email_verified: false})}, 'VERIFIED_ACCOUNT_REQUIRED'],
    [{'x-firebase-appcheck': undefined}, {}, 'APP_CHECK_REQUIRED'],
    [{}, {verifyAppCheck: async () => { throw Error(); }}, 'INVALID_APP_CHECK'],
  ]) {
    const {db, guard} = fixture('miniGenerate', overrides);
    await assert.rejects(guard.authorize(request(headers), 'miniGenerate'), e => e.code === code);
    assert.equal(db.records.size, 1);
  }
});

test('oversized requests fail before token verification', async () => {
  let verified = false;
  const {guard} = fixture('realtime', {verifyIdToken: async () => {verified = true;}});
  const req = request(); req.rawBody = Buffer.alloc(65537);
  await assert.rejects(guard.authorize(req, 'realtime'), e => e.httpStatus === 413);
  assert.equal(verified, false);
});

test('valid request reserves all five quotas before paid operation', async () => {
  const {db, guard} = fixture();
  const a = await guard.authorize(request(), 'miniGenerate');
  await guard.reserve(a);
  assert.equal(db.records.size, 6);
  for (const [key, value] of db.records) if (key.startsWith('costCounters/')) assert.equal(value.count, 1);
});

test('missing, disabled, expired and unauthorized policy fail closed', async () => {
  for (const patch of [null, {enabled:false}, {expiresAtMs:NOW}, {allowedUids:[]}, {expiresAtMs:'tomorrow'}]) {
    const {db, guard} = fixture();
    const key = 'costControls/miniGenerate';
    if (patch === null) db.records.delete(key); else db.records.set(key, {...db.records.get(key), ...patch});
    await assert.rejects(guard.reserve(actor), e => [403,503].includes(e.httpStatus));
    assert.equal([...db.records.keys()].filter(k => k.startsWith('costCounters/')).length, 0);
  }
});

test('quota store failure prevents a simulated paid call', async () => {
  const {guard} = fixture('miniGenerate', {db: {doc: path => ({path}), runTransaction: async () => {throw Error('offline');}}});
  let paidCalls = 0;
  await assert.rejects(async () => {await guard.reserve(actor); paidCalls++;}, e => e.code === 'QUOTA_UNAVAILABLE');
  assert.equal(paidCalls, 0);
});

test('parallel requests do not exceed per-minute allowance', async () => {
  const {guard} = fixture();
  const results = await Promise.allSettled(Array.from({length: 25}, () => guard.reserve(actor)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.httpStatus === 429).length, 24);
});

test('global monthly cap survives changed user and daily windows', async () => {
  const {db, guard} = fixture();
  db.records.set('costCounters/miniGenerate_g_M_2026-10', {count:LIMITS.miniGenerate.globalMonth});
  await assert.rejects(guard.reserve({...actor, uid:'u2'}), e => e.httpStatus === 429);
  assert.equal([...db.records.keys()].filter(k => /_u_/.test(k)).length, 0);
});

test('malformed counters never silently reset', async () => {
  for (const n of [-1, '3', null, NaN, Infinity, 1.5]) {
    const {db, guard} = fixture();
    db.records.set('costCounters/miniGenerate_g_M_2026-10', {count:n});
    await assert.rejects(guard.reserve(actor), e => e.code === 'INVALID_QUOTA_STATE');
  }
});

test('quota periods change at Japan midnight/month boundary', () => {
  assert.equal(periodKeys(Date.parse('2026-10-31T14:59:59Z')).month, '2026-10');
  assert.equal(periodKeys(Date.parse('2026-10-31T15:00:00Z')).month, '2026-11');
});

test('realtime cannot start before shutdown queue verification', async () => {
  const {db, guard} = fixture('realtime');
  db.records.get('costControls/realtime').expiryQueueVerified = false;
  await assert.rejects(guard.reserve({...actor, service:'realtime'}), e => e.code === 'EXPIRY_QUEUE_NOT_READY');
});

test('external Location cannot turn shutdown into SSRF', () => {
  for (const url of ['https://evil.example/v1/realtime/calls/id', '/v1/realtime/calls/../../secrets', '/v1/realtime/calls/id?x=1', '']) {
    assert.throws(() => callIdFromLocation(url));
  }
  assert.equal(callIdFromLocation('/v1/realtime/calls/rtc_123'), 'rtc_123');
});

test('queue/storage failure hangs up newly created call before returning answer', async () => {
  const db = fakeDb(); let hungup = 0;
  await assert.rejects(armExpiry({location:'/v1/realtime/calls/rtc_123', uid:'u1', db, now:()=>NOW, apiKey:'fake',
    enqueue:async () => {throw Error('queue unavailable');}, fetchImpl:async (url) => {assert.ok(url.endsWith('/hangup')); hungup++; return {ok:true};}}));
  assert.equal(hungup, 1);
});

test('durable deadline is five minutes and expiration is idempotent', async () => {
  const db = fakeDb(); let queued, hangs = 0;
  const result = await armExpiry({location:'/v1/realtime/calls/rtc_123', uid:'u1', db, now:()=>NOW, apiKey:'fake', enqueue:async (data, options) => {queued={data,options};}});
  assert.equal(result.expiresAtMs, NOW+300000);
  assert.equal(queued.options.scheduleTime.getTime(), result.expiresAtMs);
  const args = {data:queued.data,db,apiKey:'fake',now:()=>NOW+300000,fetchImpl:async()=>{hangs++;return {ok:true};}};
  await expireCall(args); await expireCall(args);
  assert.equal(hangs, 1);
});

module.exports = { fakeDb, fixture, request, NOW };
