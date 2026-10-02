import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
export function admin() { if (!getApps().length) initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'cc-dev-ps7' }); }
export function createStore(mode, dataDirectory = resolve('.local-data')) {
  if (mode === 'cloud') {
    admin(); const db = getFirestore();
    return {
      async list(uid) { const snapshot = await db.collection(`speechUsers/${uid}/recordings`).get(); return snapshot.docs.map(d => d.data()); },
      async put(uid, data) { await db.doc(`speechUsers/${uid}/recordings/${data.id}`).set({ ...data, updatedAt: FieldValue.serverTimestamp() }); },
      async feedback(uid, data) { const ref = db.collection('feedback').doc(); await ref.set({ ...data, feedbackId: ref.id, createdAt: FieldValue.serverTimestamp(), status: 'unreviewed' }); return ref.id; },
      async limit(uid, category, cap, period) {
        const bucket = Math.floor(Date.now() / period), ref = db.doc(`speechLimits/${uid}_${category}_${bucket}`);
        return db.runTransaction(async tx => { const snap = await tx.get(ref), count = snap.data()?.count || 0; if (count >= cap) return false; tx.set(ref, { count: count + 1, expiresAt: new Date(Date.now() + period * 2) }); return true; });
      },
      async analytics(uid) {
        const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }), id = `${day}_speech-dashboard_0.1.0`;
        const seen = db.doc(`speechVisits/${id}_${uid}`), ref = db.doc(`analytics/${id}`);
        await db.runTransaction(async tx => { const visit = await tx.get(seen); tx.set(ref, { date: day, appId: 'speech-dashboard', version: '0.1.0', views: FieldValue.increment(1), visitors: FieldValue.increment(visit.exists ? 0 : 1) }, { merge: true }); tx.set(seen, { expiresAt: new Date(Date.now() + 172800000) }); });
      }
    };
  }
  const limits = new Map();
  const file = join(dataDirectory, 'recordings.json');
  async function list() { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } }
  return {
    list,
    async put(uid, data) { await mkdir(dataDirectory, { recursive: true, mode: 0o700 }); const records = (await list()).filter(r => r.id !== data.id); records.push(data); const temp = `${file}.tmp`; await writeFile(temp, JSON.stringify(records), { mode: 0o600 }); await rename(temp, file); },
    async feedback(uid, data) { await mkdir(dataDirectory, { recursive: true, mode: 0o700 }); const id = randomUUID(); await writeFile(join(dataDirectory, `feedback-${id}.json`), JSON.stringify({ ...data, feedbackId: id, status: 'unreviewed', createdAt: new Date().toISOString() }), { mode: 0o600 }); return id; },
    async limit(uid, category, cap, period) { const bucket = Math.floor(Date.now() / period), key = `${uid}:${category}:${bucket}`; for (const [k, v] of limits) if (v.expires < Date.now()) limits.delete(k); const item = limits.get(key) || { count: 0, expires: Date.now() + period }; item.count++; limits.set(key, item); return item.count <= cap; },
    async analytics() { /* Local previews are deliberately not counted as production visits. */ }
  };
}
