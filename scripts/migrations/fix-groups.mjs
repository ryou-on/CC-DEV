/**
 * PROPOSAL ONLY. Do not run this against production unless a person has taken a backup
 * and reviewed the dry-run. This file does not deploy rules and does not touch Hosting.
 *
 * Normalize groups/{id} so the documents match firestore.rules:
 *   - empty createdBy  -> the only member whose role is "owner" (email lowercased)
 *   - member entries   -> { email, role } only (extra keys removed)
 *   - emails           -> trim + lowercase (createdBy, members[].email, lastInviteEmail)
 *
 * Pins, routes, names, and who is a member are left as they are.
 * A document is skipped (printed, not written) when createdBy is empty and there
 * is not exactly one owner, or when the same email would end up with two roles.
 *
 * BACKUP FIRST
 *   gcloud firestore export gs://YOUR_BUCKET/groups-backup-YYYYMMDD \
 *     --project cc-dev-ps7 --collection-ids=groups
 *   Confirm the export finished before any --write.
 *
 * Dry-run (default). Prints the plan and writes nothing:
 *   GCLOUD_PROJECT=cc-dev-ps7 node scripts/migrations/fix-groups.mjs
 *
 * Apply, only after the dry-run looks right and the backup exists:
 *   GCLOUD_PROJECT=cc-dev-ps7 node scripts/migrations/fix-groups.mjs --write --i-have-a-backup
 *
 * Emulator (safe to write; no backup flag required):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-cc-dev \
 *     node scripts/migrations/fix-groups.mjs --write
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const backupAck = args.has('--i-have-a-backup');
const onEmu = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (onEmu ? 'demo-cc-dev' : '');

function emailOf(value) {
  return String(value || '').trim().toLowerCase();
}

function sameMembers(current, next) {
  if (!Array.isArray(current) || current.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) {
    const raw = current[i];
    if (!raw || raw.email !== next[i].email || raw.role !== next[i].role) return false;
    if (Object.keys(raw).some((k) => k !== 'email' && k !== 'role')) return false;
  }
  return true;
}

export function planGroupUpdate(id, data) {
  const notes = [];
  if (!data || typeof data !== 'object') return { id, action: 'skip', reason: 'document is empty' };
  if (!Array.isArray(data.members)) return { id, action: 'skip', reason: 'members is not a list' };

  const byEmail = new Map();
  for (const raw of data.members) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { id, action: 'skip', reason: 'a member entry is not a map' };
    }
    const email = emailOf(raw.email);
    if (!email || !email.includes('@')) return { id, action: 'skip', reason: 'a member email is empty' };
    if (raw.role !== 'owner' && raw.role !== 'member') {
      return { id, action: 'skip', reason: `role of ${email} is not owner or member` };
    }
    const prev = byEmail.get(email);
    if (prev && prev !== raw.role) return { id, action: 'skip', reason: `${email} has both owner and member` };
    const extra = Object.keys(raw).filter((k) => k !== 'email' && k !== 'role');
    if (extra.length) notes.push(`members ${email}: drop keys ${extra.join(',')}`);
    if (raw.email !== email) notes.push(`members ${raw.email} -> ${email}`);
    byEmail.set(email, raw.role);
  }
  const members = [...byEmail].map(([email, role]) => ({ email, role }));
  if (members.length !== data.members.length) notes.push(`members ${data.members.length} -> ${members.length}`);

  let createdBy = '';
  if (data.createdBy == null || data.createdBy === '') {
    const owners = members.filter((m) => m.role === 'owner');
    if (owners.length !== 1) {
      return { id, action: 'skip', reason: `empty createdBy and owner count is ${owners.length}`, notes };
    }
    createdBy = owners[0].email;
    notes.push(`createdBy (empty) -> ${createdBy}`);
  } else if (typeof data.createdBy !== 'string') {
    return { id, action: 'skip', reason: 'createdBy is not a string', notes };
  } else {
    createdBy = emailOf(data.createdBy);
    if (!createdBy || !createdBy.includes('@')) return { id, action: 'skip', reason: 'createdBy is not an email', notes };
    if (data.createdBy !== createdBy) notes.push(`createdBy ${data.createdBy} -> ${createdBy}`);
  }

  const patch = {};
  if (data.createdBy !== createdBy) patch.createdBy = createdBy;
  if (!sameMembers(data.members, members)) patch.members = members;
  if (typeof data.lastInviteEmail === 'string') {
    const next = emailOf(data.lastInviteEmail);
    if (next && next !== data.lastInviteEmail) {
      patch.lastInviteEmail = next;
      notes.push(`lastInviteEmail ${data.lastInviteEmail} -> ${next}`);
    }
  }
  if (!Object.keys(patch).length) return { id, action: 'unchanged' };
  return { id, action: 'update', patch, notes };
}

async function main() {
  if (!projectId) {
    console.error('Set GCLOUD_PROJECT, or FIRESTORE_EMULATOR_HOST for the emulator. Nothing was written.');
    process.exit(2);
  }
  if (write && !onEmu && !backupAck) {
    console.error('Refusing to write outside the emulator without --i-have-a-backup.');
    console.error('Export a backup first (see the comment at the top of scripts/migrations/fix-groups.mjs).');
    process.exit(2);
  }
  console.log('fix-groups.mjs');
  console.log('project:', projectId);
  console.log('emulator:', onEmu ? process.env.FIRESTORE_EMULATOR_HOST : '(none — this reads a real project)');
  console.log('mode:', write ? 'write' : 'dry-run');
  console.log('Backup first: gcloud firestore export gs://YOUR_BUCKET/groups-backup-YYYYMMDD --project ' + projectId + ' --collection-ids=groups');

  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  const snap = await db.collection('groups').get();
  const counts = { update: 0, unchanged: 0, skip: 0, wrote: 0, failed: 0 };
  for (const doc of snap.docs) {
    const plan = planGroupUpdate(doc.id, doc.data());
    if (plan.action === 'unchanged') {
      counts.unchanged++;
      continue;
    }
    if (plan.action === 'skip') {
      counts.skip++;
      console.log(`groups/${doc.id}: SKIP ${plan.reason}`);
      continue;
    }
    counts.update++;
    console.log(`groups/${doc.id}: update`);
    for (const note of plan.notes) console.log('  - ' + note);
    console.log('  patch ' + JSON.stringify(plan.patch));
    if (write) {
      try {
        await db.collection('groups').doc(doc.id).update(plan.patch);
        counts.wrote++;
        console.log('  wrote');
      } catch (e) {
        counts.failed++;
        console.log('  FAILED ' + e.message);
      }
    }
  }
  console.log(`summary: update=${counts.update} unchanged=${counts.unchanged} skip=${counts.skip} wrote=${counts.wrote} failed=${counts.failed}`);
  if (!write) console.log('dry-run: no documents were written');
  if (counts.failed) process.exit(1);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('fix-groups.mjs');
if (isDirect) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
