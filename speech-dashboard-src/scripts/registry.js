import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { admin } from '../server/store.js';
import { APP, RELEASE_NOTES } from '../src/meta.js';
// Run using ADC or an authorized deployment identity, never from the browser.
admin(); const db = getFirestore();
const app = db.doc(`apps/${APP.id}`), log = db.doc(`changelog/${APP.id}_${APP.version}_start`);
await db.runTransaction(async tx => {
  const current = await tx.get(app);
  tx.set(app, { appId: APP.id, appName: APP.name, description: 'Zoom参加者別録音の発話量と発話内容を分析', phase: 1, version: APP.version, status: 'development', developmentAI: 'Codex', model: 'GPT-6', repository: 'https://github.com/ryou-on/CC-DEV', productionUrl: null, startedAt: current.data()?.startedAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  tx.set(log, { appId: APP.id, version: APP.version, type: 'start', AI: 'Codex', model: 'GPT-6', summary: RELEASE_NOTES[0].changes.join('。'), commit: process.env.GIT_COMMIT || null, timestamp: FieldValue.serverTimestamp() });
});
console.log(`Registry updated: ${APP.id} ${APP.version}`);
