'use strict';

const crypto = require('node:crypto');

// Count caps are deliberately conservative. They are NOT monetary spend caps.
// A service also needs an enabled, expiring server-only costControls document.
const LIMITS = Object.freeze({
  realtime: { minute: 2, userDay: 12, userMonth: 40, globalDay: 20, globalMonth: 80, bytes: 65536 },
  miniGenerate: { minute: 1, userDay: 2, userMonth: 6, globalDay: 3, globalMonth: 10, bytes: 8_400_000 },
  miniStatus: { minute: 15, userDay: 600, userMonth: 1800, globalDay: 1800, globalMonth: 6000, bytes: 1024 },
  anthropicProxy: { minute: 3, userDay: 20, userMonth: 100, globalDay: 40, globalMonth: 200, bytes: 2_000_000 },
  hondokoAnalyze: { minute: 2, userDay: 10, userMonth: 40, globalDay: 20, globalMonth: 80, bytes: 8_000_000 },
  // Suggestion box. authorize() uses the byte cap. The handler checks the budget latch
  // itself and does not call reserve(), so ordinary verified users are not UID-allowlisted.
  // globalDay 200 and globalMinute 10 are the only global caps. Handlers read them via rateOf().
  // Flight Strip rows have no globalMonth. Handlers do not call reserve(), and an unused
  // monthly counter would add a write on every accepted call.
  fstFeedback: { minute: 5, globalMinute: 10, userDay: 50, userMonth: 100, globalDay: 200, bytes: 16384 },
  // Usage events. authorize() uses the byte cap only. Not on the paid-API UID allowlist.
  fstAnalytics: { minute: 30, globalMinute: 60, userDay: 400, userMonth: 4000, globalDay: 2000, bytes: 4096 },
  // Broadcast and force-update. Survey create and setActive have their own rows so they do not share a counter.
  fstDevAdmin: { minute: 10, globalMinute: 20, userDay: 100, userMonth: 1000, globalDay: 500, bytes: 8192 },
  // Together these two daily caps equal the old shared survey-admin cap of 500.
  // Giving each 500 would push the capped writes over the Firestore free tier.
  // 内海課長は 250 と 250 の分割を承認済み。50 と 50 ではない。
  fstSurveyCreate: { minute: 10, globalMinute: 10, userDay: 100, userMonth: 1000, globalDay: 250, bytes: 8192 },
  fstSurveySetActive: { minute: 10, globalMinute: 10, userDay: 100, userMonth: 1000, globalDay: 250, bytes: 8192 },
  fstSurveyAnswer: { minute: 5, globalMinute: 60, userDay: 30, userMonth: 300, globalDay: 500, bytes: 8192 },
});
const ORIGINS = new Set(['https://cc-dev-ps7.web.app', 'https://cc-dev-ps7.firebaseapp.com']);

class CostError extends Error {
  constructor(status, code) { super(code); this.httpStatus = status; this.code = code; }
}

function rateOf(service) {
  const row = LIMITS[service];
  if (!row || !Number.isSafeInteger(row.minute) || !Number.isSafeInteger(row.globalMinute)
      || !Number.isSafeInteger(row.userDay) || !Number.isSafeInteger(row.globalDay)) {
    throw new CostError(503, 'UNKNOWN_SERVICE');
  }
  return {
    userMinute: row.minute,
    userDay: row.userDay,
    globalMinute: row.globalMinute,
    globalDay: row.globalDay,
  };
}

function periodKeys(now) {
  const jst = new Date(now + 9 * 60 * 60 * 1000).toISOString();
  return { minute: Math.floor(now / 60000), day: jst.slice(0, 10), month: jst.slice(0, 7) };
}

function count(snapshot) {
  if (!snapshot.exists) return 0;
  const n = snapshot.data()?.count;
  if (!Number.isSafeInteger(n) || n < 0) throw new CostError(503, 'INVALID_QUOTA_STATE');
  return n;
}

// Minute slots wait until the next minute. Day slots wait until the next 00:00 in Japan.
// A caller who keeps going after the cap would otherwise read on every retry.
function retryAfterSeconds(now, slotId) {
  const id = String(slotId);
  if (id.includes('_d_')) {
    const shifted = now + 9 * 60 * 60 * 1000;
    const dayStart = Math.floor(shifted / 86400000) * 86400000;
    const nextMidnightUtc = dayStart + 86400000 - 9 * 60 * 60 * 1000;
    return Math.max(1, Math.ceil((nextMidnightUtc - now) / 1000));
  }
  const nextMinute = (Math.floor(now / 60000) + 1) * 60000;
  return Math.max(1, Math.ceil((nextMinute - now) / 1000));
}

const fstHoldScopes = new Map();
const FST_HOLD_MAX = 1000;

function holdsFor(scope) {
  const id = String(scope || '');
  let map = fstHoldScopes.get(id);
  if (!map) {
    map = new Map();
    fstHoldScopes.set(id, map);
  }
  return map;
}

function clearFstHolds() {
  fstHoldScopes.clear();
}

function sweepFstHolds(now, scope) {
  const map = holdsFor(scope);
  for (const [key, until] of map) {
    if (until <= now) map.delete(key);
  }
}

function fstHoldRemaining(scope, key, now) {
  const map = holdsFor(scope);
  sweepFstHolds(now, scope);
  const until = map.get(key);
  if (until == null) return 0;
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function rememberFstHold(scope, key, now, seconds) {
  const map = holdsFor(scope);
  sweepFstHolds(now, scope);
  const wait = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 60;
  if (!map.has(key) && map.size >= FST_HOLD_MAX) {
    map.delete(map.keys().next().value);
  }
  map.set(key, now + wait * 1000);
}

function rejectIfFstHeld(scope, key, now) {
  const wait = fstHoldRemaining(scope, key, now);
  if (wait <= 0) return;
  const err = new CostError(429, 'USAGE_LIMIT');
  err.retryAfter = wait;
  throw err;
}

function holdFstRejection(scope, key, now, error) {
  if (error instanceof CostError && error.httpStatus === 429) {
    rememberFstHold(scope, key, now, error.retryAfter);
  }
  throw error;
}

// One document holds both the minute and the day attempt counts. Read it before the
// heavy transaction. At the cap, write nothing and let the caller enter the wait.
async function consumeUserAttempt(db, id, limits, now) {
  const keys = periodKeys(now);
  const minute = Math.floor(now / 60000);
  const ref = db.doc(`fstRateLimits/${id}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (data && (!Number.isSafeInteger(data.minuteCount) || data.minuteCount < 0
        || !Number.isSafeInteger(data.dayCount) || data.dayCount < 0)) {
      throw new CostError(503, 'INVALID_QUOTA_STATE');
    }
    const minuteCount = data && data.minute === minute ? data.minuteCount : 0;
    const dayCount = data && data.day === keys.day ? data.dayCount : 0;
    if (minuteCount >= limits.userMinute || dayCount >= limits.userDay) {
      const err = new CostError(429, 'USAGE_LIMIT');
      err.retryAfter = dayCount >= limits.userDay
        ? retryAfterSeconds(now, `${id}_d_${keys.day}`)
        : retryAfterSeconds(now, `${id}_m_${minute}`);
      throw err;
    }
    tx.set(ref, {
      minute,
      minuteCount: minuteCount + 1,
      day: keys.day,
      dayCount: dayCount + 1,
      updatedAtMs: now,
      expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
    });
  });
}

// Read every global counter, then decide. A rejection writes nothing in this transaction.
// Acceptance writes the global counters and the handler payload together. All reads happen before any set.
async function reserveFst(db, slots, now, write) {
  return db.runTransaction(async tx => {
    const refs = slots.map(slot => db.doc(`fstRateLimits/${slot.id}`));
    const snaps = [];
    for (const ref of refs) snaps.push(await tx.get(ref));
    const counts = snaps.map(count);
    let blocked = -1;
    let retry = 0;
    counts.forEach((n, i) => {
      if (n < slots[i].limit) return;
      const wait = retryAfterSeconds(now, slots[i].id);
      if (wait >= retry) {
        retry = wait;
        blocked = i;
      }
    });
    if (blocked >= 0) {
      const err = new CostError(429, 'USAGE_LIMIT');
      err.retryAfter = retry;
      throw err;
    }
    const extra = write ? await write(tx) : undefined;
    const expiresAt = new Date(now + 3 * 24 * 60 * 60 * 1000);
    refs.forEach((ref, i) => {
      tx.set(ref, { count: counts[i] + 1, updatedAtMs: now, expiresAt });
    });
    return extra;
  });
}

function createGuard({ db, verifyIdToken, verifyAppCheck, now = Date.now }) {
  async function authorize(req, service) {
    const limits = LIMITS[service];
    if (!limits) throw new CostError(503, 'UNKNOWN_SERVICE');
    const size = Buffer.isBuffer(req.rawBody) ? req.rawBody.length : Buffer.byteLength(JSON.stringify(req.body || {}));
    if (size > limits.bytes) throw new CostError(413, 'BODY_TOO_LARGE');
    const origin = req.get('origin');
    if (origin && !ORIGINS.has(origin)) throw new CostError(403, 'ORIGIN_DENIED');
    const bearer = req.get('authorization') || '';
    if (!/^Bearer [^\s]{1,8192}$/.test(bearer)) throw new CostError(401, 'SIGN_IN_REQUIRED');
    let user;
    try { user = await verifyIdToken(bearer.slice(7)); }
    catch { throw new CostError(401, 'INVALID_ID_TOKEN'); }
    if (!user?.uid || user.email_verified !== true || user.firebase?.sign_in_provider === 'anonymous') {
      throw new CostError(403, 'VERIFIED_ACCOUNT_REQUIRED');
    }
    const attestation = req.get('x-firebase-appcheck');
    if (!attestation || attestation.length > 8192) throw new CostError(403, 'APP_CHECK_REQUIRED');
    try { await verifyAppCheck(attestation); }
    catch { throw new CostError(403, 'INVALID_APP_CHECK'); }
    return { uid: user.uid, email: String(user.email || '').toLowerCase(), service };
  }

  async function reserve(actor) {
    const limits = LIMITS[actor.service];
    if (!limits || !actor.uid) throw new CostError(403, 'INVALID_ACTOR');
    const at = now();
    const keys = periodKeys(at);
    const subject = crypto.createHash('sha256').update(actor.uid).digest('hex');
    const service = actor.service;
    const scope = service === 'miniStatus' ? 'miniGenerate' : service;
    const policyRef = db.doc(`costControls/${scope}`);
    const pairs = [
      [`${service}_u_${subject}_m_${keys.minute}`, limits.minute],
      [`${service}_u_${subject}_d_${keys.day}`, limits.userDay],
      [`${service}_u_${subject}_M_${keys.month}`, limits.userMonth],
      [`${service}_g_d_${keys.day}`, limits.globalDay],
    ];
    if (Number.isSafeInteger(limits.globalMonth)) {
      pairs.push([`${service}_g_M_${keys.month}`, limits.globalMonth]);
    }
    const entries = pairs.map(([id, limit]) => [db.doc(`costCounters/${id}`), limit]);
    try {
      await db.runTransaction(async tx => {
        // Every read precedes every write; parallel requests cannot exceed a cap.
        const [global, config, ...snapshots] = await tx.getAll(db.doc("costControls/global"), policyRef, ...entries.map(e => e[0]));
        if (!global.exists || global.data()?.enabled !== true) throw new CostError(503, "SERVICE_PAUSED");
        const p = config.data();
        if (!config.exists || p?.enabled !== true || !Number.isSafeInteger(p.expiresAtMs) || p.expiresAtMs <= at) {
          throw new CostError(503, 'SERVICE_PAUSED');
        }
        if (!Array.isArray(p.allowedUids) || !p.allowedUids.includes(actor.uid)) {
          throw new CostError(403, 'ACCOUNT_NOT_ALLOWED');
        }
        if (service === 'realtime' && p.expiryQueueVerified !== true) {
          throw new CostError(503, 'EXPIRY_QUEUE_NOT_READY');
        }
        const counts = snapshots.map(count);
        if (counts.some((n, i) => n >= entries[i][1])) throw new CostError(429, 'USAGE_LIMIT');
        entries.forEach(([ref], i) => tx.set(ref, {
          count: counts[i] + 1,
          updatedAtMs: at,
          // Set a TTL policy on expiresAt. TTL deletion is maintenance, not quota enforcement.
          expiresAt: new Date(at + 65 * 24 * 60 * 60 * 1000),
        }));
      });
    } catch (e) {
      if (e instanceof CostError) throw e;
      // Unknown transaction outcomes are never refunded or allowed through.
      throw new CostError(503, 'QUOTA_UNAVAILABLE');
    }
  }
  return { authorize, reserve };
}

function sendCostError(res, error) {
  const status = error instanceof CostError ? error.httpStatus : 503;
  const code = error instanceof CostError ? error.code : 'COST_GUARD_UNAVAILABLE';
  res.set('Cache-Control', 'no-store');
  if (status === 429 || status === 503) {
    const retry = error instanceof CostError && Number.isSafeInteger(error.retryAfter) && error.retryAfter > 0
      ? error.retryAfter
      : 60;
    res.set('Retry-After', String(retry));
  }
  return res.status(status).json({ error: code });
}

let singleton;
function getGuard() {
  if (!singleton) {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp();
    singleton = createGuard({
      db: admin.firestore(),
      verifyIdToken: token => admin.auth().verifyIdToken(token, true),
      verifyAppCheck: token => admin.appCheck().verifyToken(token),
    });
  }
  return singleton;
}

module.exports = {
  createGuard, getGuard, CostError, sendCostError, periodKeys, rateOf, LIMITS,
  retryAfterSeconds, reserveFst, consumeUserAttempt, clearFstHolds, rejectIfFstHeld, holdFstRejection,
  sweepFstHolds, rememberFstHold, FST_HOLD_MAX,
};
