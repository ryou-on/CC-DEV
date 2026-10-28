/**
 * PROPOSAL ONLY. Do not run this against production unless a person has taken a backup
 * and reviewed the dry-run. This file does not deploy rules and does not touch Hosting.
 *
 * Move viewer emails out of the publicly readable hondoko-config/sharing document
 * into hondoko-config/viewers, which only family members can read.
 *
 *   - sharing.viewers (list of emails) is lowercased, trimmed, de-duplicated
 *   - those emails are united with hondoko-config/viewers.emails
 *   - the viewers field is then removed from sharing
 *   - mode, allowComments, linkKey, and any other sharing fields stay
 *
 * Book access keeps working before this runs: rules still honor a legacy
 * sharing.viewers list, but they do not let non-members read that document.
 * Run this so guests can read mode / linkKey again without receiving emails.
 *
 * BACKUP FIRST
 *   gcloud firestore export gs://YOUR_BUCKET/hondoko-config-backup-YYYYMMDD \
 *     --project cc-dev-ps7 --collection-ids=hondoko-config
 *   Confirm the export finished before any --write.
 *
 * Dry-run (default). Prints the plan and writes nothing:
 *   GCLOUD_PROJECT=cc-dev-ps7 node scripts/migrations/fix-hondoko-viewers.mjs
 *
 * Apply, only after the dry-run looks right and the backup exists:
 *   GCLOUD_PROJECT=cc-dev-ps7 node scripts/migrations/fix-hondoko-viewers.mjs --write --i-have-a-backup
 *
 * Emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-cc-dev \
 *     node scripts/migrations/fix-hondoko-viewers.mjs --write
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const backupAck = args.has('--i-have-a-backup');
const onEmu = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (onEmu ? 'demo-cc-dev' : '');

function normEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function planViewerSplit(sharingData, existingEmails) {
  if (!sharingData || typeof sharingData !== 'object') return { action: 'unchanged' };
  if (!('viewers' in sharingData)) return { action: 'unchanged' };
  if (!Array.isArray(sharingData.viewers)) return { action: 'skip', reason: 'sharing.viewers is not a list' };
  const fromSharing = [];
  for (const raw of sharingData.viewers) {
    if (typeof raw !== 'string') return { action: 'skip', reason: 'sharing.viewers contains a non-string' };
    const email = normEmail(raw);
    if (!email || !email.includes('@')) return { action: 'skip', reason: `drop would lose invalid email "${raw}"` };
    fromSharing.push(email);
  }
  const merged = [...new Set([...(existingEmails || []).map(normEmail).filter((e) => e.includes('@')), ...fromSharing])].sort();
  return {
    action: 'update',
    emails: merged,
    removed: sharingData.viewers.slice(),
  };
}

async function main() {
  if (!projectId) {
    console.error('Set GCLOUD_PROJECT, or FIRESTORE_EMULATOR_HOST for the emulator. Nothing was written.');
    process.exit(2);
  }
  if (write && !onEmu && !backupAck) {
    console.error('Refusing to write outside the emulator without --i-have-a-backup.');
    console.error('Export a backup first (see the comment at the top of scripts/migrations/fix-hondoko-viewers.mjs).');
    process.exit(2);
  }
  console.log('fix-hondoko-viewers.mjs');
  console.log('project:', projectId);
  console.log('emulator:', onEmu ? process.env.FIRESTORE_EMULATOR_HOST : '(none — this reads a real project)');
  console.log('mode:', write ? 'write' : 'dry-run');
  console.log('Backup first: gcloud firestore export gs://YOUR_BUCKET/hondoko-config-backup-YYYYMMDD --project ' + projectId + ' --collection-ids=hondoko-config');

  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  const sharingRef = db.collection('hondoko-config').doc('sharing');
  const viewersRef = db.collection('hondoko-config').doc('viewers');
  const sharingSnap = await sharingRef.get();
  const viewersSnap = await viewersRef.get();
  if (!sharingSnap.exists) {
    console.log('hondoko-config/sharing: missing');
    console.log('summary: update=0 unchanged=1 skip=0 wrote=0 failed=0');
    console.log(write ? 'mode: write' : 'dry-run: no documents were written');
    return;
  }
  const existing = viewersSnap.exists && Array.isArray(viewersSnap.data().emails) ? viewersSnap.data().emails : [];
  const plan = planViewerSplit(sharingSnap.data(), existing);
  if (plan.action === 'unchanged') {
    console.log('hondoko-config/sharing: unchanged (no viewers field)');
    console.log('summary: update=0 unchanged=1 skip=0 wrote=0 failed=0');
    if (!write) console.log('dry-run: no documents were written');
    return;
  }
  if (plan.action === 'skip') {
    console.log('hondoko-config/sharing: SKIP ' + plan.reason);
    console.log('summary: update=0 unchanged=0 skip=1 wrote=0 failed=0');
    if (!write) console.log('dry-run: no documents were written');
    return;
  }
  console.log('hondoko-config/sharing: delete field viewers ' + JSON.stringify(plan.removed));
  console.log('hondoko-config/viewers: emails ' + JSON.stringify(plan.emails));
  if (!write) {
    console.log('summary: update=1 unchanged=0 skip=0 wrote=0 failed=0');
    console.log('dry-run: no documents were written');
    return;
  }
  await viewersRef.set({ emails: plan.emails }, { merge: true });
  await sharingRef.update({ viewers: FieldValue.delete() });
  console.log('wrote');
  console.log('summary: update=1 unchanged=0 skip=0 wrote=1 failed=0');
}

const isDirect = process.argv[1] && process.argv[1].endsWith('fix-hondoko-viewers.mjs');
if (isDirect) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
