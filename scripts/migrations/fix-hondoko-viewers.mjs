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
 *   - mode, allowComments, and any other sharing fields stay
 *   - sharing.linkKey is copied unchanged onto hondoko-config/link and then removed
 *     from sharing, in the same transaction. Production keys are the 12-character
 *     values already in ?k= links. The script does not generate a replacement.
 *   - a key shorter than 8 characters, or one that is not url-safe, is left in
 *     place and printed as NEEDS MANUAL ATTENTION
 *   - if hondoko-config/link already holds a different key, sharing.linkKey is
 *     left in place and printed as NEEDS MANUAL ATTENTION
 *
 * Existing /hondoko/?k= links keep working BEFORE this script runs: rules compare
 * the URL key with sharing.linkKey via get(), and that document is not readable
 * by anonymous clients while linkKey is still on it. Run the script so guests can
 * read mode and allowComments again without receiving the key. The ?k= value
 * itself does not change.
 *
 * Writes run inside one transaction (viewers doc, link doc, sharing field deletes).
 * --write asks you to type the target project ID and writes only on an exact match.
 * Before the prompt it prints whether the target is a demo- project and whether
 * the credentials on disk are production ones.
 *
 * Book access for viewer-list guests keeps working before this runs: rules still
 * honor a legacy sharing.viewers list, but they do not let non-members read that
 * document. Link guests keep opening /hondoko/?k=<existing key> either way.
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
import { confirmProjectWrite, describeTarget } from './confirm-write.mjs';

// Production links are https://cc-dev-ps7.web.app/hondoko/?k=<key>
// where key is Math.random().toString(36).slice(2, 10) + the same .slice(2, 6):
// usually 12 characters from [0-9a-z], stored on hondoko-config/sharing.linkKey.
// Moving that string onto hondoko-config/link does not change the URL.
// Rules accept the old field via get() until this script runs, so existing links
// keep opening before the write. This script does not invent a new key.
const USABLE_KEY = /^[A-Za-z0-9_-]{8,128}$/;

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const backupAck = args.has('--i-have-a-backup');
const onEmu = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (onEmu ? 'demo-cc-dev' : '');

function normEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function planViewerSplit(sharingData, existingEmails, existingLinkKey) {
  if (!sharingData || typeof sharingData !== 'object') return { action: 'unchanged', manual: [] };
  const manual = [];
  let emails = null;
  let removed = null;
  if ('viewers' in sharingData) {
    if (!Array.isArray(sharingData.viewers)) {
      manual.push('sharing.viewers is not a list');
    } else {
      const fromSharing = [];
      for (const raw of sharingData.viewers) {
        if (typeof raw !== 'string') {
          manual.push('sharing.viewers contains a non-string');
          fromSharing.length = 0;
          break;
        }
        const email = normEmail(raw);
        if (!email || !email.includes('@')) {
          manual.push(`invalid viewer email "${raw}"`);
          fromSharing.length = 0;
          break;
        }
        fromSharing.push(email);
      }
      if (!manual.some((m) => m.startsWith('sharing.viewers') || m.startsWith('invalid viewer'))) {
        emails = [...new Set([...(existingEmails || []).map(normEmail).filter((e) => e.includes('@')), ...fromSharing])].sort();
        removed = sharingData.viewers.slice();
      }
    }
  }
  let linkKey = null;
  if ('linkKey' in sharingData) {
    if (typeof sharingData.linkKey === 'string' && USABLE_KEY.test(sharingData.linkKey)) {
      if (existingLinkKey && existingLinkKey !== sharingData.linkKey) {
        manual.push(`hondoko-config/link already has a different key (${existingLinkKey}); leaving sharing.linkKey in place so the handed-out ?k= link keeps matching`);
      } else {
        linkKey = sharingData.linkKey;
      }
    } else {
      manual.push('linkKey cannot be moved unchanged (not 8-128 url-safe characters); the handed-out ?k= value was left on sharing');
    }
  } else if (sharingData.mode === 'link' && !existingLinkKey) {
    manual.push('mode is link but no key is stored');
  }
  if (!emails && !linkKey) {
    if (manual.length) return { action: 'manual', reason: manual.join('; '), manual };
    return { action: 'unchanged', manual };
  }
  return { action: 'update', emails, removed, linkKey, manual };
}

export async function writeHondokoInTransaction(db) {
  const sharingRef = db.collection('hondoko-config').doc('sharing');
  const viewersRef = db.collection('hondoko-config').doc('viewers');
  const linkRef = db.collection('hondoko-config').doc('link');
  return db.runTransaction(async (tx) => {
    const sharingSnap = await tx.get(sharingRef);
    const viewersSnap = await tx.get(viewersRef);
    const linkSnap = await tx.get(linkRef);
    if (!sharingSnap.exists) return { action: 'unchanged', manual: [] };
    const existing = viewersSnap.exists && Array.isArray(viewersSnap.data().emails) ? viewersSnap.data().emails : [];
    const existingLinkKey = linkSnap.exists && typeof linkSnap.data().key === 'string' ? linkSnap.data().key : '';
    const plan = planViewerSplit(sharingSnap.data(), existing, existingLinkKey);
    if (plan.action !== 'update') return plan;
    if (plan.emails) tx.set(viewersRef, { emails: plan.emails }, { merge: true });
    if (plan.linkKey) tx.set(linkRef, { key: plan.linkKey }, { merge: true });
    const del = {};
    if (plan.removed) del.viewers = FieldValue.delete();
    if (plan.linkKey) del.linkKey = FieldValue.delete();
    if (Object.keys(del).length) tx.update(sharingRef, del);
    return plan;
  });
}

async function main() {
  if (!projectId) {
    console.error('Set GCLOUD_PROJECT, or FIRESTORE_EMULATOR_HOST for the emulator. Nothing was written.');
    process.exit(2);
  }
  if (write && !onEmu && !backupAck) {
    console.log(describeTarget(projectId).text);
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
  const linkRef = db.collection('hondoko-config').doc('link');
  const sharingSnap = await sharingRef.get();
  const viewersSnap = await viewersRef.get();
  const linkSnap = await linkRef.get();
  if (!sharingSnap.exists) {
    console.log('hondoko-config/sharing: missing');
    console.log('summary: update=0 unchanged=1 manual=0 wrote=0 failed=0');
    console.log(write ? 'No documents to write.' : 'dry-run: no documents were written');
    return;
  }
  const existing = viewersSnap.exists && Array.isArray(viewersSnap.data().emails) ? viewersSnap.data().emails : [];
  const existingLinkKey = linkSnap.exists && typeof linkSnap.data().key === 'string' ? linkSnap.data().key : '';
  const plan = planViewerSplit(sharingSnap.data(), existing, existingLinkKey);
  for (const note of plan.manual || []) console.log('hondoko-config/sharing: NEEDS MANUAL ATTENTION: ' + note);
  if (plan.action === 'unchanged') {
    console.log('hondoko-config/sharing: unchanged (no viewers field)');
    console.log(`summary: update=0 unchanged=1 manual=${(plan.manual || []).length} wrote=0 failed=0`);
    if (!write) console.log('dry-run: no documents were written');
    return;
  }
  if (plan.action === 'manual') {
    console.log('summary: update=0 unchanged=0 manual=1 wrote=0 failed=0');
    if (!write) console.log('dry-run: no documents were written');
    return;
  }
  if (plan.removed) console.log('hondoko-config/sharing: delete field viewers ' + JSON.stringify(plan.removed));
  if (plan.emails) console.log('hondoko-config/viewers: emails ' + JSON.stringify(plan.emails));
  if (plan.linkKey) console.log('hondoko-config/link: key ' + plan.linkKey);
  if (!write) {
    console.log(`summary: update=1 unchanged=0 manual=${(plan.manual || []).length} wrote=0 failed=0`);
    console.log('dry-run: no documents were written');
    return;
  }
  const ok = await confirmProjectWrite(projectId);
  if (!ok) process.exit(2);
  const applied = await writeHondokoInTransaction(db);
  if (applied.action !== 'update') {
    console.log('transaction found nothing to write: ' + applied.action);
    console.log('summary: update=0 unchanged=1 manual=0 wrote=0 failed=0');
    return;
  }
  console.log('wrote');
  console.log(`summary: update=1 unchanged=0 manual=${(applied.manual || []).length} wrote=1 failed=0`);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('fix-hondoko-viewers.mjs');
if (isDirect) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
