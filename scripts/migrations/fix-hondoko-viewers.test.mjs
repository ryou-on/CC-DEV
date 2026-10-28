// エミュレータにメール入りの sharing を置き、fix-hondoko-viewers.mjs を確認する。
// 本番には繋がない。
import { spawnSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is required. Refusing to touch a real project.');
  process.exit(1);
}

const script = fileURLToPath(new URL('./fix-hondoko-viewers.mjs', import.meta.url));
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

await db.collection('hondoko-config').doc('sharing').set({
  mode: 'viewers',
  allowComments: true,
  linkKey: 'legacy-key',
  viewers: ['Eve@Example.com', 'eve@example.com'],
  keep: 1,
});
await db.collection('hondoko-config').doc('viewers').set({ emails: ['friend@example.com'] });

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: process.env });
}

const dry = run([]);
console.log(dry.stdout);
check('dry-run は成功', dry.status === 0, dry.stderr);
check('dry-run は差分を出す', /delete field viewers/.test(dry.stdout) && /eve@example.com/.test(dry.stdout));
check('dry-run は書き込まない', /dry-run: no documents were written/.test(dry.stdout));
const mid = (await db.collection('hondoko-config').doc('sharing').get()).data();
check('dry-run 後も sharing.viewers が残る', Array.isArray(mid.viewers) && mid.viewers[0] === 'Eve@Example.com');

const wet = run(['--write']);
console.log(wet.stdout);
check('--write は成功', wet.status === 0, wet.stderr);
const sharing = (await db.collection('hondoko-config').doc('sharing').get()).data();
const viewers = (await db.collection('hondoko-config').doc('viewers').get()).data();
check('sharing から viewers が消える', !('viewers' in sharing), JSON.stringify(sharing));
check('mode と linkKey は残る', sharing.mode === 'viewers' && sharing.linkKey === 'legacy-key' && sharing.allowComments === true && sharing.keep === 1);
check('閲覧者メールは小文字で統合される', JSON.stringify(viewers.emails) === JSON.stringify(['eve@example.com', 'friend@example.com']), JSON.stringify(viewers.emails));

const again = run([]);
check('2回目の dry-run は更新しない', again.status === 0 && /unchanged/.test(again.stdout), again.stdout);

console.log(failed ? `fix-hondoko-viewers tests: ${failed} failed` : 'fix-hondoko-viewers tests: all passed');
process.exit(failed ? 1 : 0);
