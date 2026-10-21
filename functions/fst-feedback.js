'use strict';

const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { getGuard, sendCostError, CostError, periodKeys } = require('./cost-guard');
const { clientIp } = require('./client-ip');
const { sourceRev } = require('./fst-rev');
const { isEditorEmail } = require('./editor-policy');

const DEFAULT_LIMITS = Object.freeze({
  userMinute: 5,
  userDay: 50,
  ipMinute: 30,
  ipDay: 100,
});
const APPS = Object.freeze({
  'flight-strip-todo': 'stable',
  'flight-strip-todo-dev': 'dev',
});
const TYPES = new Set(['request', 'bug', 'question', 'other']);
const STATUSES = new Set(['unreviewed', 'reviewed', 'in_progress', 'resolved']);
const HOSTS = new Set(['cc-dev-ps7.web.app', 'cc-dev-ps7.firebaseapp.com']);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,20})?$/;
const SUBMIT_FIELDS = new Set(['subject', 'email', 'message', 'build', 'appId', 'version', 'url', 'type', 'faxNumber', 'openedAtMs']);
const UPDATE_FIELDS = new Set(['fbId', 'status', 'replyText', 'replySent']);
const DAY_MS = 24 * 60 * 60 * 1000;

function hashId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function cleanUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) return null;
  url.search = '';
  url.hash = '';
  const out = url.toString();
  return out.length <= 2048 ? out : null;
}

function rejectUnknown(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CostError(400, 'INVALID_FEEDBACK');
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new CostError(400, 'INVALID_FEEDBACK');
  }
}

function parseInput(body, now) {
  rejectUnknown(body, SUBMIT_FIELDS);
  if (body.faxNumber != null && body.faxNumber !== '') throw new CostError(400, 'INVALID_FEEDBACK');
  const openedAtMs = body.openedAtMs;
  if (!Number.isSafeInteger(openedAtMs)) throw new CostError(400, 'INVALID_FEEDBACK');
  const elapsed = now - openedAtMs;
  if (elapsed < 1500 || elapsed > DAY_MS) throw new CostError(400, 'INVALID_FEEDBACK');
  const subject = cleanText(body.subject, 200);
  const message = cleanText(body.message, 2000);
  const build = body.build;
  const appId = body.appId;
  const version = typeof body.version === 'string' ? body.version : '';
  const url = cleanUrl(body.url);
  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  if (!subject || !message || APPS[appId] !== build || !url) throw new CostError(400, 'INVALID_FEEDBACK');
  if (version.length > 50 || !SEMVER.test(version)) throw new CostError(400, 'INVALID_FEEDBACK');
  if (rawEmail.length > 200 || (rawEmail && !/^[^\s@]+@[^\s@]+$/.test(rawEmail))) {
    throw new CostError(400, 'INVALID_FEEDBACK');
  }
  let type = null;
  if (Object.prototype.hasOwnProperty.call(body, 'type')) {
    if (!TYPES.has(body.type)) throw new CostError(400, 'INVALID_FEEDBACK');
    type = body.type;
  }
  return { subject, message, build, appId, version, url, email: rawEmail, type };
}

function parseUpdate(body) {
  rejectUnknown(body, UPDATE_FIELDS);
  if (typeof body.fbId !== 'string' || !/^FB_\d{4,}$/.test(body.fbId)) throw new CostError(400, 'INVALID_FEEDBACK');
  if (!STATUSES.has(body.status)) throw new CostError(400, 'INVALID_FEEDBACK');
  const patch = { fbId: body.fbId, status: body.status };
  if (Object.prototype.hasOwnProperty.call(body, 'replyText')) {
    if (typeof body.replyText !== 'string' || body.replyText.length > 2000) throw new CostError(400, 'INVALID_FEEDBACK');
    patch.replyText = body.replyText;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'replySent')) {
    if (typeof body.replySent !== 'boolean') throw new CostError(400, 'INVALID_FEEDBACK');
    patch.replySent = body.replySent;
  }
  return patch;
}

function isEditor(actor) {
  return isEditorEmail(actor.email);
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
    tx.set(ref, {
      count: count + 1,
      updatedAtMs: now,
      expiresAt: new Date(now + 3 * DAY_MS),
    });
  });
}

async function rejectDuplicate(db, id, now) {
  const ref = db.doc(`fstRateLimits/${id}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (data && Number.isSafeInteger(data.updatedAtMs) && now - data.updatedAtMs < 10 * 60 * 1000) {
      throw new CostError(429, 'USAGE_LIMIT');
    }
    if (data && !Number.isSafeInteger(data.updatedAtMs)) throw new CostError(503, 'INVALID_QUOTA_STATE');
    tx.set(ref, { count: 1, updatedAtMs: now, expiresAt: new Date(now + 3 * DAY_MS) });
  });
}

function createFstFeedbackHandler({ authorize, db, now = Date.now, serverTimestamp, limits = DEFAULT_LIMITS }) {
  return async function fstFeedbackSubmit(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      const at = now();
      const input = parseInput(req.body, at);
      await assertBudgetOpen(db);
      const keys = periodKeys(at);
      const minute = Math.floor(at / 60000);
      const user = hashId(actor.uid);
      const ip = hashId(clientIp(req));
      await consume(db, `u_${user}_m_${minute}`, limits.userMinute, at);
      await consume(db, `u_${user}_d_${keys.day}`, limits.userDay, at);
      await consume(db, `ip_${ip}_m_${minute}`, limits.ipMinute, at);
      await consume(db, `ip_${ip}_d_${keys.day}`, limits.ipDay, at);
      const content = hashId(`${input.appId}\0${input.subject}\0${input.message}`);
      await rejectDuplicate(db, `dup_${user}_${content}`, at);
      const saved = await db.runTransaction(async tx => {
        const counterRef = db.doc('fst_feedback_meta/counter');
        const counter = await tx.get(counterRef);
        const current = counter.exists ? counter.data()?.count : 0;
        if (counter.exists && (!Number.isSafeInteger(current) || current < 0)) {
          throw new CostError(503, 'INVALID_QUOTA_STATE');
        }
        const n = (Number.isSafeInteger(current) ? current : 0) + 1;
        const fbId = `FB_${String(n).padStart(4, '0')}`;
        const ref = db.doc(`fst_feedback/${fbId}`);
        const row = {
          fbId,
          feedbackId: fbId,
          subject: input.subject,
          email: input.email,
          message: input.message,
          build: input.build,
          appId: input.appId,
          version: input.version,
          url: input.url,
          uid: actor.uid,
          status: 'unreviewed',
          replySent: false,
          createdAt: serverTimestamp(),
        };
        if (input.type) row.type = input.type;
        tx.set(counterRef, { count: n, updatedAtMs: at });
        tx.set(ref, row);
        return { fbId };
      });
      res.set('Cache-Control', 'no-store');
      res.status(201).json({ ok: true, fbId: saved.fbId, feedbackId: saved.fbId, status: 'unreviewed' });
    } catch (error) {
      sendCostError(res, error);
    }
  };
}

function createFstFeedbackUpdateHandler({ authorize, db, now = Date.now }) {
  return async function fstFeedbackUpdate(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      if (!isEditor(actor)) throw new CostError(403, 'EDITOR_REQUIRED');
      const input = parseUpdate(req.body || {});
      await assertBudgetOpen(db);
      const at = now();
      await db.runTransaction(async tx => {
        const ref = db.doc(`fst_feedback/${input.fbId}`);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new CostError(404, 'NOT_FOUND');
        const current = snap.data() || {};
        const patch = { status: input.status, updatedAtMs: at };
        if (Object.prototype.hasOwnProperty.call(input, 'replyText')) patch.replyText = input.replyText;
        if (Object.prototype.hasOwnProperty.call(input, 'replySent')) patch.replySent = input.replySent;
        tx.update(ref, patch);
        if (current.uid == null || current.message == null) throw new CostError(503, 'INVALID_QUOTA_STATE');
      });
      res.set('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, fbId: input.fbId, feedbackId: input.fbId, status: input.status });
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

function productionHandler(factory) {
  return (req, res) => {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp();
    return factory({
      authorize: request => getGuard().authorize(request, 'fstFeedback'),
      db: admin.firestore(),
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    })(req, res);
  };
}

exports.createFstFeedbackHandler = createFstFeedbackHandler;
exports.createFstFeedbackUpdateHandler = createFstFeedbackUpdateHandler;
exports.parseInput = parseInput;
exports.fstFeedbackSubmit = onRequest(REQUEST_OPTIONS, productionHandler(createFstFeedbackHandler));
exports.updateFstFeedback = onRequest(REQUEST_OPTIONS, productionHandler(createFstFeedbackUpdateHandler));
