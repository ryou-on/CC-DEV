'use strict';

const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { getGuard, sendCostError, CostError, periodKeys } = require('./cost-guard');

const DEFAULT_LIMITS = Object.freeze({
  userHour: 5,
  userDay: 20,
  ipHour: 30,
  ipDay: 100,
});

function hashId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function clientIp(req) {
  const forwarded = req.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0].trim();
  const ip = first || req.ip || 'missing';
  return ip.slice(0, 200);
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function parseInput(body) {
  const subject = cleanText(body && body.subject, 100);
  const message = cleanText(body && body.message, 200);
  const build = body && body.build;
  const rawEmail = body && typeof body.email === 'string' ? body.email.trim() : '';
  if (!subject || !message || (build !== 'stable' && build !== 'dev')) {
    throw new CostError(400, 'INVALID_FEEDBACK');
  }
  if (rawEmail.length > 200 || (rawEmail && !/^[^\s@]+@[^\s@]+$/.test(rawEmail))) {
    throw new CostError(400, 'INVALID_FEEDBACK');
  }
  return { subject, message, build, email: rawEmail };
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
    tx.set(ref, { count: count + 1, updatedAtMs: now });
  });
}

function createFstFeedbackHandler({ authorize, db, now = Date.now, serverTimestamp, limits = DEFAULT_LIMITS }) {
  return async function fstFeedbackSubmit(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      const input = parseInput(req.body);
      await assertBudgetOpen(db);
      const at = now();
      const keys = periodKeys(at);
      const hour = Math.floor(at / 3600000);
      const user = hashId(actor.uid);
      const ip = hashId(clientIp(req));
      await consume(db, `u_${user}_h_${hour}`, limits.userHour, at);
      await consume(db, `u_${user}_d_${keys.day}`, limits.userDay, at);
      await consume(db, `ip_${ip}_h_${hour}`, limits.ipHour, at);
      await consume(db, `ip_${ip}_d_${keys.day}`, limits.ipDay, at);
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
        tx.set(counterRef, { count: n, updatedAtMs: at });
        tx.set(ref, {
          fbId,
          subject: input.subject,
          email: input.email,
          message: input.message,
          build: input.build,
          uid: actor.uid,
          status: 'unreviewed',
          replySent: false,
          createdAt: serverTimestamp(),
        });
        return { fbId };
      });
      res.set('Cache-Control', 'no-store');
      res.status(201).json({ ok: true, fbId: saved.fbId, status: 'unreviewed' });
    } catch (error) {
      sendCostError(res, error);
    }
  };
}

exports.createFstFeedbackHandler = createFstFeedbackHandler;
exports.fstFeedbackSubmit = onRequest({
  cors: ['https://cc-dev-ps7.web.app', 'https://cc-dev-ps7.firebaseapp.com'],
  timeoutSeconds: 20,
  memory: '256MiB',
}, (req, res) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  return createFstFeedbackHandler({
    authorize: request => getGuard().authorize(request, 'fstFeedback'),
    db: admin.firestore(),
    serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
  })(req, res);
});
