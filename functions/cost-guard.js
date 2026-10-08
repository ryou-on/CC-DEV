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
});
const ORIGINS = new Set(['https://cc-dev-ps7.web.app', 'https://cc-dev-ps7.firebaseapp.com']);

class CostError extends Error {
  constructor(status, code) { super(code); this.httpStatus = status; this.code = code; }
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
    const entries = [
      [`${service}_u_${subject}_m_${keys.minute}`, limits.minute],
      [`${service}_u_${subject}_d_${keys.day}`, limits.userDay],
      [`${service}_u_${subject}_M_${keys.month}`, limits.userMonth],
      [`${service}_g_d_${keys.day}`, limits.globalDay],
      [`${service}_g_M_${keys.month}`, limits.globalMonth],
    ].map(([id, limit]) => [db.doc(`costCounters/${id}`), limit]);
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
  if (status === 429) res.set('Retry-After', '60');
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

module.exports = { createGuard, getGuard, CostError, sendCostError, periodKeys, LIMITS };
