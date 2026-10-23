'use strict';

const crypto = require('node:crypto');
const admin = require('../../functions/node_modules/firebase-admin');

const projectId = 'demo-cc-dev-fst-e2e';
const email = process.env.FST_E2E_EMAIL || 'e2e-fst@example.test';
const password = 'e2e-password-1';

async function main() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  if (!admin.apps.length) admin.initializeApp({ projectId });
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await admin.auth().createUser({ email, password, emailVerified: true });
  }
  if (user.emailVerified !== true) {
    user = await admin.auth().updateUser(user.uid, { emailVerified: true, password });
  }
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const day = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const hash = crypto.createHash('sha256').update(user.uid).digest('hex').slice(0, 32);
  const mode = process.env.FST_E2E_SEED || 'cap';
  const paused = mode === 'paused';
  await admin.firestore().doc('costControls/global').set({ enabled: !paused });
  await admin.firestore().doc(`fstRateLimits/u_${hash}`).set({
    minute,
    minuteCount: paused ? 0 : 5,
    day,
    dayCount: paused ? 0 : 5,
    updatedAtMs: now,
  });
  console.log(JSON.stringify({ uid: user.uid, minute, day, mode, projectId }));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
