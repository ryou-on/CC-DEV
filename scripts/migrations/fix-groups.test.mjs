// エミュレータに壊れた groups を置き、fix-groups.mjs の dry-run と --write だけを確認する。
// 本番には繋がない。実行は npm run test:rules（firebase emulators:exec）から。
import { spawnSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';

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

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: process.env });
}

const dry = run([]);
console.log(dry.stdout);
check('dry-run は成功', dry.status === 0, dry.stderr);
check('dry-run は書き込まないと出る', /dry-run: no documents were written/.test(dry.stdout));
check('dry-run は MIGRATE1 の差分を出す', /groups\/MIGRATE1: update/.test(dry.stdout) && /Alice@Example.com/.test(dry.stdout));
check('dry-run は管理者不明を skip', /groups\/MIGRATE0: SKIP/.test(dry.stdout));
const mid = (await db.collection('groups').doc('MIGRATE1').get()).data();
check('dry-run 後も createdBy は空のまま', mid.createdBy === '');
check('dry-run 後も余分なキーが残る', mid.members[0].nickname === 'A' && mid.pins[0].id === 'keep-me');

const wet = run(['--write']);
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
check('skip した文書は空の createdBy のまま', skipped.createdBy === '' && skipped.members[0].note === 'x');

const again = run([]);
check('2回目の dry-run は成功', again.status === 0, again.stderr);
check('2回目は MIGRATE1 を更新対象にしない', !/groups\/MIGRATE1: update/.test(again.stdout), again.stdout);

console.log(failed ? `fix-groups tests: ${failed} failed` : 'fix-groups tests: all passed');
process.exit(failed ? 1 : 0);
