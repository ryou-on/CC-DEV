'use strict';

const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { getGuard, sendCostError, CostError, periodKeys } = require('./cost-guard');
const { sourceRev } = require('./fst-rev');

// Hosting の書き換えでは利用者本人の IP を信頼できないため、IP ごとの枠は置かない。
// 利用者ごと 1 分 30 回・1 日 400 回。全体は 1 分 2,000 回・1 日 50,000 回。
const LIMITS = Object.freeze({ userMinute: 30, userDay: 400, globalMinute: 2000, globalDay: 50000 });
const APPS = Object.freeze({
  'flight-strip-todo': 'stable',
  'flight-strip-todo-dev': 'dev',
});
const TYPES = new Set(['session', 'task_created', 'task_completed']);
const DEVICES = new Set(['mobile', 'desktop']);
const FIELDS = new Set(['appId', 'version', 'build', 'type', 'device']);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,20})?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function hashId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function jstParts(now) {
  const shifted = new Date(now + 9 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return {
    date: iso.slice(0, 10),
    month: iso.slice(0, 7),
    hour: shifted.getUTCHours(),
    dow: shifted.getUTCDay(),
  };
}

function parseInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CostError(400, 'INVALID_ANALYTICS');
  for (const key of Object.keys(body)) {
    if (!FIELDS.has(key)) throw new CostError(400, 'INVALID_ANALYTICS');
  }
  const appId = body.appId;
  const build = body.build;
  const version = typeof body.version === 'string' ? body.version.replace(/^v/, '') : '';
  const type = body.type;
  if (APPS[appId] !== build || !TYPES.has(type)) throw new CostError(400, 'INVALID_ANALYTICS');
  if (version.length > 40 || !SEMVER.test(version)) throw new CostError(400, 'INVALID_ANALYTICS');
  const input = { appId, build, version, type };
  if (Object.prototype.hasOwnProperty.call(body, 'device')) {
    if (!DEVICES.has(body.device)) throw new CostError(400, 'INVALID_ANALYTICS');
    input.device = body.device;
  }
  return input;
}

async function assertBudgetOpen(db) {
  const global = await db.doc('costControls/global').get();
  if (!global.exists || global.data()?.enabled !== true) throw new CostError(503, 'SERVICE_PAUSED');
}

async function consume(db, id, limit, now) {
  const ref = db.doc(`fstRateLimits/${id}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const count = data && Number.isSafeInteger(data.count) && data.count >= 0 ? data.count : (data ? null : 0);
    if (count === null) throw new CostError(503, 'INVALID_QUOTA_STATE');
    if (count >= limit) throw new CostError(429, 'USAGE_LIMIT');
    tx.set(ref, { count: count + 1, updatedAtMs: now, expiresAt: new Date(now + 3 * DAY_MS) });
  });
}

function createFstAnalyticsHandler({ authorize, db, now = Date.now, serverTimestamp, limits = LIMITS }) {
  return async function record(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      const input = parseInput(req.body);
      await assertBudgetOpen(db);
      const at = now();
      const keys = periodKeys(at);
      const minute = Math.floor(at / 60000);
      const user = hashId(actor.uid);
      await consume(db, `an_u_${user}_m_${minute}`, limits.userMinute, at);
      await consume(db, `an_u_${user}_d_${keys.day}`, limits.userDay, at);
      await consume(db, `an_g_m_${minute}`, limits.globalMinute, at);
      await consume(db, `an_g_d_${keys.day}`, limits.globalDay, at);
      const id = `AN_${hashId(actor.uid + '\0' + at + '\0' + Math.random()).slice(0, 16)}`;
      const when = jstParts(at);
      const row = {
        uidHash: user.slice(0, 16),
        date: when.date,
        month: when.month,
        hour: when.hour,
        dow: when.dow,
        version: input.version,
        build: input.build,
        appId: input.appId,
        type: input.type,
        createdAt: serverTimestamp(),
      };
      if (input.device) row.device = input.device;
      await db.doc(`fst_analytics/${id}`).set(row);
      res.set('Cache-Control', 'no-store');
      res.status(201).json({ ok: true });
    } catch (error) {
      sendCostError(res, error);
    }
  };
}

const REQUEST_OPTIONS = {
  region: 'asia-northeast1',
  cors: ['https://cc-dev-ps7.web.app', 'https://cc-dev-ps7.firebaseapp.com'],
  timeoutSeconds: 20,
  memory: '256MiB',
  maxInstances: 2,
  concurrency: 8,
  labels: { 'fst-rev': sourceRev() },
};

exports.createFstAnalyticsHandler = createFstAnalyticsHandler;
exports.jstParts = jstParts;
exports.recordFstAnalytics = onRequest(REQUEST_OPTIONS, (req, res) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  return createFstAnalyticsHandler({
    authorize: request => getGuard().authorize(request, 'fstAnalytics'),
    db: admin.firestore(),
    serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
  })(req, res);
});
