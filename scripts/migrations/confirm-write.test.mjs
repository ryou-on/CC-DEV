// 書き込み前のプロジェクトID確認と、資格情報の表示をエミュレータだけで確かめる。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is required. Refusing to touch a real project.');
  process.exit(1);
}

const script = fileURLToPath(new URL('./fix-groups.mjs', import.meta.url));
const projectId = process.env.GCLOUD_PROJECT || 'demo-cc-dev';
const app = initializeApp({ projectId }, 'confirm-write-test');
const db = getFirestore(app);
const credDir = mkdtempSync(join(tmpdir(), 'mig-cred-'));
const credPath = join(credDir, 'prod-sa.json');
writeFileSync(credPath, JSON.stringify({
  type: 'service_account',
  project_id: 'cc-dev-ps7',
  client_email: 'migration-test@cc-dev-ps7.iam.gserviceaccount.com',
  private_key: 'not-a-real-key',
}));

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok  ', name);
  else { failed++; console.log('  NG  ', name, detail ? '- ' + detail : ''); }
}
function run(input, extraEnv = {}) {
  return spawnSync(process.execPath, [script, '--write'], {
    encoding: 'utf8',
    input,
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: credPath, ...extraEnv },
  });
}

await db.collection('groups').doc('CONFIRM1').set({
  name: '確認',
  createdBy: 'Confirm@Example.com',
  members: [{ email: 'Confirm@Example.com', role: 'owner' }],
  pins: [{ id: 'keep' }],
});

const empty = run('');
check('空の確認は拒否', empty.status === 2, empty.stderr);
check('空でも demo と本番資格情報を確認の前に出す', (() => {
  const demoAt = empty.stdout.indexOf('target is a demo- project: yes');
  const prodAt = empty.stdout.indexOf('credentials are production: yes');
  const askAt = empty.stdout.indexOf('Type the target project ID');
  return demoAt >= 0 && prodAt >= 0 && askAt > demoAt && askAt > prodAt && /cc-dev-ps7/.test(empty.stdout);
})(), empty.stdout);
const afterEmpty = (await db.collection('groups').doc('CONFIRM1').get()).data();
check('空の確認では書き込まない', afterEmpty.createdBy === 'Confirm@Example.com');

const wrong = run('cc-dev-ps7\n');
check('本番のIDを打ち間違えると拒否', wrong.status === 2 && /did not match target/.test(wrong.stderr), wrong.stderr);
check('資格情報の project_id と対象の不一致を出す', /credential project_id \(cc-dev-ps7\) does not match target/.test(wrong.stdout), wrong.stdout);
const afterWrong = (await db.collection('groups').doc('CONFIRM1').get()).data();
check('不一致では書き込まない', afterWrong.createdBy === 'Confirm@Example.com' && afterWrong.pins[0].id === 'keep');

const ok = run(projectId + '\n');
console.log(ok.stdout);
check('完全一致のときだけ書く', ok.status === 0, ok.stderr);
check('一致の表示が wrote より前', ok.stdout.indexOf('confirmation matched the target project ID') >= 0
  && ok.stdout.indexOf('confirmation matched the target project ID') < ok.stdout.indexOf('CONFIRM1: wrote'));
const fixed = (await db.collection('groups').doc('CONFIRM1').get()).data();
check('確認後にメールが小文字になる', fixed.createdBy === 'confirm@example.com' && fixed.pins[0].id === 'keep', JSON.stringify(fixed));

console.log(failed ? `confirm-write tests: ${failed} failed` : 'confirm-write tests: all passed');
process.exit(failed ? 1 : 0);
