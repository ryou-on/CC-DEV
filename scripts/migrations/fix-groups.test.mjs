// エミュレータに壊れた groups を置き、fix-groups.mjs の dry-run と --write だけを確認する。
// 本番には繋がない。実行は npm run test:rules（firebase emulators:exec）から。
import { spawnSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { writeGroupInTransaction } from './fix-groups.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is required. Refusing to touch a real project.');
  process.exit(1);
}

const script = fileURLToPath(new URL('./fix-groups.mjs', import.meta.url));
const projectId = process.env.GCLOUD_PROJECT || 'demo-cc-dev';
const app = initializeApp({ projectId });
const db = getFirestore(app);
let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok  ', name);
  else { failed++; console.log('  NG  ', name, detail ? '- ' + detail : ''); }
}

const refused = spawnSync(process.execPath, [script, '--write'], {
  encoding: 'utf8',
  env: { ...process.env, FIRESTORE_EMULATOR_HOST: '', GCLOUD_PROJECT: 'cc-dev-ps7' },
});
check('エミュレータ外の --write はバックアップ確認が無いと拒否', refused.status === 2, refused.stderr || refused.stdout);

await db.collection('groups').doc('MIGRATE1').set({
  name: '壊れたグループ',
  createdBy: '',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  members: [
    { email: 'Alice@Example.com', role: 'owner', nickname: 'A' },
    { email: 'Eve@Example.com', role: 'member', extra: true },
  ],
  lastInviteEmail: 'Eve@Example.com',
  pins: [{ id: 'keep-me' }],
});
await db.collection('groups').doc('MIGRATE2').set({
  name: '正常',
  createdBy: 'ok@example.com',
  members: [{ email: 'ok@example.com', role: 'owner' }],
  pins: [{ id: 'ok' }],
});
await db.collection('groups').doc('MIGRATE0').set({
  name: '管理者がいない',
  createdBy: '',
  members: [{ email: 'A@Example.com', role: 'member', note: 'x' }],
});
await db.collection('groups').doc('MIGRATE_NOOWNER').set({
  name: 'owner枠がない',
  createdBy: 'alice@example.com',
  members: [{ email: 'Alice@Example.com', role: 'member' }],
  pins: [{ id: 'stay' }],
});
await db.collection('groups').doc('MIGRATE_NOROLE').set({
  name: 'roleがない',
  createdBy: 'bob@example.com',
  members: [{ email: 'bob@example.com', nickname: 'b' }],
  pins: [{ id: 'stay2' }],
});

function run(args, input) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: process.env, input });
}

const dry = run([]);
console.log(dry.stdout);
check('dry-run は成功', dry.status === 0, dry.stderr);
check('dry-run は書き込まないと出る', /dry-run: no documents were written/.test(dry.stdout));
check('dry-run は MIGRATE1 の差分を出す', /groups\/MIGRATE1: update/.test(dry.stdout) && /Alice@Example.com/.test(dry.stdout));
check('dry-run は管理者不明を手作業として出す', /groups\/MIGRATE0: NEEDS MANUAL ATTENTION/.test(dry.stdout));
check('owner枠が無い文書は unchanged にしない', /groups\/MIGRATE_NOOWNER: NEEDS MANUAL ATTENTION: no owner in members/.test(dry.stdout));
check('role が無い文書は unchanged にしない', /groups\/MIGRATE_NOROLE: NEEDS MANUAL ATTENTION: role missing/.test(dry.stdout));
check('手作業の文書を update 扱いしない', !/groups\/MIGRATE_NOOWNER: update/.test(dry.stdout) && !/groups\/MIGRATE_NOROLE: update/.test(dry.stdout));
const mid = (await db.collection('groups').doc('MIGRATE1').get()).data();
check('dry-run 後も createdBy は空のまま', mid.createdBy === '');
check('dry-run 後も余分なキーが残る', mid.members[0].nickname === 'A' && mid.pins[0].id === 'keep-me');

const refusedWrite = run(['--write'], 'not-the-project\n');
check('違うプロジェクトIDは拒否', refusedWrite.status === 2, refusedWrite.stderr);
check('確認の前に demo 判定を出す', /target is a demo- project: yes/.test(refusedWrite.stdout));
check('拒否の文言がある', /did not match target/.test(refusedWrite.stderr));
const afterRefuse = (await db.collection('groups').doc('MIGRATE1').get()).data();
check('拒否後はまだ書き込んでいない', afterRefuse.createdBy === '');

const wet = run(['--write'], projectId + '\n');
console.log(wet.stdout);
check('--write は成功', wet.status === 0, wet.stderr);
check('--write は wrote を出す', /groups\/MIGRATE1: update[\s\S]*wrote/.test(wet.stdout));
const fixed = (await db.collection('groups').doc('MIGRATE1').get()).data();
check('createdBy が owner の小文字メールになる', fixed.createdBy === 'alice@example.com', JSON.stringify(fixed.createdBy));
check('members は email と role だけ', JSON.stringify(fixed.members) === JSON.stringify([
  { email: 'alice@example.com', role: 'owner' },
  { email: 'eve@example.com', role: 'member' },
]), JSON.stringify(fixed.members));
check('lastInviteEmail が小文字になる', fixed.lastInviteEmail === 'eve@example.com');
check('pins は残る', fixed.pins[0].id === 'keep-me' && fixed.name === '壊れたグループ');
const clean = (await db.collection('groups').doc('MIGRATE2').get()).data();
check('正常な文書は変わらない', clean.createdBy === 'ok@example.com' && clean.pins[0].id === 'ok');
const skipped = (await db.collection('groups').doc('MIGRATE0').get()).data();
check('手作業の文書は空の createdBy のまま', skipped.createdBy === '' && skipped.members[0].note === 'x');
const noOwner = (await db.collection('groups').doc('MIGRATE_NOOWNER').get()).data();
check('owner枠が無い文書は書き換わらない', noOwner.createdBy === 'alice@example.com' && noOwner.members[0].email === 'Alice@Example.com' && noOwner.pins[0].id === 'stay');
const noRole = (await db.collection('groups').doc('MIGRATE_NOROLE').get()).data();
check('role が無い文書は書き換わらない', noRole.members[0].nickname === 'b' && noRole.pins[0].id === 'stay2');
await db.collection('groups').doc('MIGRATE_RACE').set({
  createdBy: 'A@example.com',
  members: [
    { email: 'A@example.com', role: 'owner', extra: 1 },
    { email: 'new@example.com', role: 'member' },
  ],
  pins: [{ id: 'p' }],
});
await writeGroupInTransaction(db, 'MIGRATE_RACE');
const raced = (await db.collection('groups').doc('MIGRATE_RACE').get()).data();
check('トランザクションは最新の members を正規化する', JSON.stringify(raced.members) === JSON.stringify([
  { email: 'a@example.com', role: 'owner' },
  { email: 'new@example.com', role: 'member' },
]) && raced.createdBy === 'a@example.com' && raced.pins[0].id === 'p', JSON.stringify(raced.members));

const again = run([]);
check('2回目の dry-run は成功', again.status === 0, again.stderr);
check('2回目は MIGRATE1 を更新対象にしない', !/groups\/MIGRATE1: update/.test(again.stdout), again.stdout);

console.log(failed ? `fix-groups tests: ${failed} failed` : 'fix-groups tests: all passed');
process.exit(failed ? 1 : 0);
