'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuard, LIMITS, periodKeys, rateOf, retryAfterSeconds, clearFstHolds, sweepFstHolds, rememberFstHold, rejectIfFstHeld, FST_HOLD_MAX, debugAppCheckAccepted, browserOrigins, e2eEmulatorEnabled } = require('../cost-guard');
const { armExpiry, expireCall, callIdFromLocation } = require('../realtime-cost');

const NOW = Date.parse('2026-10-05T01:00:00Z');
function fakeDb(service = 'miniGenerate') {
  const records = new Map([[`costControls/${service}`, { enabled: true, allowedUids: ['u1', 'u2'], expiresAtMs: NOW + 86400000, expiryQueueVerified: true }]]);
  records.set("costControls/global", {enabled:true});
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

test('flight strip global caps live only in cost-guard limits', () => {
  assert.deepEqual(rateOf('fstFeedback'), { userMinute: 5, userDay: 50, globalMinute: 10, globalDay: 200 });
  assert.deepEqual(rateOf('fstAnalytics'), { userMinute: 30, userDay: 400, globalMinute: 60, globalDay: 2000 });
  assert.deepEqual(rateOf('fstDevAdmin'), { userMinute: 10, userDay: 100, globalMinute: 20, globalDay: 500 });
  assert.deepEqual(rateOf('fstSurveyCreate'), { userMinute: 10, userDay: 100, globalMinute: 10, globalDay: 250 });
  assert.deepEqual(rateOf('fstSurveySetActive'), { userMinute: 10, userDay: 100, globalMinute: 10, globalDay: 250 });
  assert.deepEqual(rateOf('fstSurveyAnswer'), { userMinute: 5, userDay: 30, globalMinute: 60, globalDay: 500 });
  for (const name of ['fstFeedback', 'fstAnalytics', 'fstDevAdmin', 'fstSurveyCreate', 'fstSurveySetActive', 'fstSurveyAnswer']) {
    assert.equal(Object.hasOwn(LIMITS[name], 'globalMonth'), false);
  }
  assert.equal(LIMITS.fstSurveyCreate.globalDay + LIMITS.fstSurveySetActive.globalDay, 500);
  assert.equal(LIMITS.fstFeedback.globalMinute < 300, true);
  assert.equal(LIMITS.fstAnalytics.globalMinute < 2000, true);
});

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
    assert.equal(db.records.size, 2);
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
  assert.equal(db.records.size, 7);
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

// A budget stop remains latched across quota windows until an administrator restores it.
test('a flight strip reserve does not write an unused monthly global counter', async () => {
  for (const service of ['fstFeedback', 'fstAnalytics', 'fstDevAdmin', 'fstSurveyCreate', 'fstSurveySetActive', 'fstSurveyAnswer']) {
    const { db, guard } = fixture(service);
    await guard.reserve({ uid: 'u1', service });
    const counters = [...db.records.keys()].filter(key => key.startsWith('costCounters/'));
    assert.equal(counters.length, 4);
    assert.equal(counters.some(key => key.includes('_g_M_')), false);
  }
});

test('the app check debug token is accepted only inside the emulator e2e flag and never when K_SERVICE is set', () => {
  const saved = {
    FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR,
    FST_E2E_EMULATOR: process.env.FST_E2E_EMULATOR,
    FST_APPCHECK_DEBUG_TOKEN: process.env.FST_APPCHECK_DEBUG_TOKEN,
    K_SERVICE: process.env.K_SERVICE,
  };
  delete process.env.FUNCTIONS_EMULATOR;
  delete process.env.FST_E2E_EMULATOR;
  delete process.env.FST_APPCHECK_DEBUG_TOKEN;
  delete process.env.K_SERVICE;
  assert.equal(e2eEmulatorEnabled(), false);
  assert.equal(debugAppCheckAccepted('debug-token'), false);
  process.env.FST_APPCHECK_DEBUG_TOKEN = 'debug-token';
  assert.equal(debugAppCheckAccepted('debug-token'), false);
  process.env.FUNCTIONS_EMULATOR = 'true';
  assert.equal(debugAppCheckAccepted('debug-token'), false);
  assert.equal(browserOrigins().includes('http://127.0.0.1:4173'), false);
  process.env.FST_E2E_EMULATOR = '1';
  assert.equal(e2eEmulatorEnabled(), true);
  assert.equal(debugAppCheckAccepted('debug-token'), true);
  assert.equal(debugAppCheckAccepted('other'), false);
  assert.equal(browserOrigins().includes('http://127.0.0.1:4173'), true);
  assert.equal(browserOrigins().includes('http://localhost:4173'), true);
  process.env.K_SERVICE = 'fstFeedbackSubmit';
  assert.equal(e2eEmulatorEnabled(), false);
  assert.equal(debugAppCheckAccepted('debug-token'), false);
  assert.equal(browserOrigins().includes('http://127.0.0.1:4173'), false);
  assert.equal(browserOrigins().includes('http://localhost:4173'), false);
  for (const [key, value] of Object.entries(saved)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

test('retry-after waits until the blocked window opens', () => {
  const minute = retryAfterSeconds(NOW, 'an_g_m_1');
  const day = retryAfterSeconds(NOW, 'an_g_d_2026-10');
  assert.equal(minute, 60);
  assert.equal(day, 50400);
  assert.equal(day > minute, true);
});

test('expired holds are swept and the map stays capped', () => {
  clearFstHolds();
  const now = 1_700_000_000_000;
  rememberFstHold('sweep', 'old', now, 1);
  rememberFstHold('sweep', 'fresh', now, 60);
  rememberFstHold('other', 'keep', now, 1);
  sweepFstHolds(now + 1000, 'sweep');
  assert.doesNotThrow(() => rejectIfFstHeld('sweep', 'old', now + 1000));
  assert.throws(() => rejectIfFstHeld('sweep', 'fresh', now + 1000), error => error.httpStatus === 429);
  assert.throws(() => rejectIfFstHeld('other', 'keep', now + 500), error => error.httpStatus === 429);
  clearFstHolds();
  for (let i = 0; i < FST_HOLD_MAX; i += 1) rememberFstHold('cap', `k${i}`, now, 60);
  rememberFstHold('cap', 'overflow', now, 60);
  assert.doesNotThrow(() => rejectIfFstHeld('cap', 'k0', now));
  assert.throws(() => rejectIfFstHeld('cap', 'overflow', now), error => error.httpStatus === 429);
  assert.throws(() => rejectIfFstHeld('cap', `k${FST_HOLD_MAX - 1}`, now), error => error.httpStatus === 429);
  clearFstHolds();
});

test('budget stop blocks every paid service before counter writes, including malformed latch', async () => {
  for (const service of Object.keys(LIMITS)) {
    for (const value of [undefined, false, null, 'true']) {
      const {db, guard}=fixture(service);
      if(value===undefined)db.records.delete('costControls/global');
      else db.records.set('costControls/global',{enabled:value});
      let calls=0;
      await assert.rejects(async()=>{await guard.reserve({...actor,service});calls++;},e=>e.code==='SERVICE_PAUSED');
      assert.equal(calls,0);
      assert.equal([...db.records.keys()].filter(k=>k.startsWith('costCounters/')).length,0);
    }
  }
});
