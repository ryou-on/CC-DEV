// 書き込み前のプロジェクトID確認と、資格情報の表示をエミュレータだけで確かめる。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

const noFlag = spawnSync(process.execPath, [script, '--write', '--i-have-a-backup'], {
  encoding: 'utf8',
  input: 'cc-dev-ps7\n',
  env: { ...process.env, FIRESTORE_EMULATOR_HOST: '', GCLOUD_PROJECT: 'cc-dev-ps7', GOOGLE_APPLICATION_CREDENTIALS: credPath },
});
check('demo- 以外は --allow-production が無いと拒否', noFlag.status === 2 && /--allow-production/.test(noFlag.stderr), noFlag.stderr);
check('拒否の時点ではグループを読んでいない', !/groups\//.test(noFlag.stdout), noFlag.stdout);

const beforeRead = spawnSync(process.execPath, [script, '--allow-production', '--i-have-a-backup'], {
  encoding: 'utf8',
  input: 'wrong\n',
  env: { ...process.env, FIRESTORE_EMULATOR_HOST: '', GCLOUD_PROJECT: 'cc-dev-ps7', GOOGLE_APPLICATION_CREDENTIALS: credPath },
});
check('本番IDの確認が違えば読む前に止まる', beforeRead.status === 2 && /No Firestore client was created/.test(beforeRead.stderr), beforeRead.stderr);
check('確認の前に groups を走査しない', !/groups\//.test(beforeRead.stdout), beforeRead.stdout);

const home = mkdtempSync(join(tmpdir(), 'adc-home-'));
const gcloud = join(home, '.config', 'gcloud');
mkdirSync(join(gcloud, 'configurations'), { recursive: true });
writeFileSync(join(gcloud, 'application_default_credentials.json'), JSON.stringify({
  type: 'authorized_user', client_id: 'c', client_secret: 's', refresh_token: 'r',
}));
writeFileSync(join(gcloud, 'active_config'), 'default\n');
writeFileSync(join(gcloud, 'configurations', 'config_default'), '[core]\nproject = cc-dev-ps7\n');
const adc = run('wrong\n', {
  HOME: home,
  GOOGLE_APPLICATION_CREDENTIALS: '',
  CLOUDSDK_CORE_PROJECT: '',
  CLOUDSDK_CONFIG: gcloud,
});
check('gcloud ADC の project を本番資格情報として出す', /credentials: authorized_user project_id=cc-dev-ps7/.test(adc.stdout) && /credentials are production: yes/.test(adc.stdout), adc.stdout);

const bare = mkdtempSync(join(tmpdir(), 'adc-bare-'));
mkdirSync(join(bare, '.config', 'gcloud'), { recursive: true });
writeFileSync(join(bare, '.config', 'gcloud', 'application_default_credentials.json'), JSON.stringify({
  type: 'authorized_user', client_id: 'c', client_secret: 's', refresh_token: 'r',
}));
const unknown = run('wrong\n', {
  HOME: bare,
  GOOGLE_APPLICATION_CREDENTIALS: '',
  CLOUDSDK_CORE_PROJECT: '',
  CLOUDSDK_CONFIG: join(bare, 'empty-gcloud'),
});
check('プロジェクトが分からない ADC は unknown', /credentials are production: unknown/.test(unknown.stdout), unknown.stdout);

const emuProd = spawnSync(process.execPath, [script, '--write'], {
  encoding: 'utf8',
  input: '',
  env: { ...process.env, GCLOUD_PROJECT: 'cc-dev-ps7', GOOGLE_APPLICATION_CREDENTIALS: credPath },
});
check('エミュレータでも demo- 以外の書き込みは --allow-production が必要', emuProd.status === 2 && /--allow-production/.test(emuProd.stderr), emuProd.stderr);

console.log(failed ? `confirm-write tests: ${failed} failed` : 'confirm-write tests: all passed');
process.exit(failed ? 1 : 0);
