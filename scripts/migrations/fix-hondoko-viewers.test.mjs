// エミュレータにメール入りの sharing を置き、fix-hondoko-viewers.mjs を確認する。
// 本番には繋がない。
import { spawnSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { writeHondokoInTransaction } from './fix-hondoko-viewers.mjs';

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

await db.collection('hondoko-config').doc('link').delete().catch(() => {});
const handedOut = 'k3j9ab2cde1f';
await db.collection('hondoko-config').doc('sharing').set({
  mode: 'link',
  allowComments: true,
  linkKey: handedOut,
  viewers: ['Eve@Example.com', 'eve@example.com'],
  keep: 1,
});
await db.collection('hondoko-config').doc('viewers').set({ emails: ['friend@example.com'] });

function run(args, input) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: process.env, input });
}

const dry = run([]);
console.log(dry.stdout);
check('dry-run は成功', dry.status === 0, dry.stderr);
check('dry-run は差分を出す', /delete field viewers/.test(dry.stdout) && /eve@example.com/.test(dry.stdout));
check('dry-run は書き込まない', /dry-run: no documents were written/.test(dry.stdout));
const mid = (await db.collection('hondoko-config').doc('sharing').get()).data();
check('dry-run 後も sharing.viewers が残る', Array.isArray(mid.viewers) && mid.viewers[0] === 'Eve@Example.com');

const refusedWrite = run(['--write'], 'Demo-cc-dev\n');
check('大文字違いのプロジェクトIDは拒否', refusedWrite.status === 2, refusedWrite.stderr);
check('確認の前に demo 判定を出す', refusedWrite.stdout.indexOf('target is a demo- project: yes') >= 0 && refusedWrite.stdout.indexOf('target is a demo- project: yes') < refusedWrite.stdout.indexOf('Type the target project ID'));
const midKey = (await db.collection('hondoko-config').doc('sharing').get()).data();
check('拒否後も配り済みの linkKey が残る', midKey.linkKey === handedOut);

const wet = run(['--write'], projectId + '\n');
console.log(wet.stdout);
check('--write は成功', wet.status === 0, wet.stderr);
check('一致した確認のあとで書く', wet.stdout.indexOf('confirmation matched the target project ID') < wet.stdout.indexOf('wrote'));
const sharing = (await db.collection('hondoko-config').doc('sharing').get()).data();
const viewers = (await db.collection('hondoko-config').doc('viewers').get()).data();
const link = (await db.collection('hondoko-config').doc('link').get()).data();
check('sharing から viewers が消える', !('viewers' in sharing), JSON.stringify(sharing));
check('配り済みの12文字鍵は文字列を変えずに link 文書へ移す', !('linkKey' in sharing) && link.key === handedOut, JSON.stringify({ sharing, link }));
check('mode と allowComments は残る', sharing.mode === 'link' && sharing.allowComments === true && sharing.keep === 1);
check('閲覧者メールは小文字で統合される', JSON.stringify(viewers.emails) === JSON.stringify(['eve@example.com', 'friend@example.com']), JSON.stringify(viewers.emails));

const again = run([]);
check('2回目の dry-run は更新しない', again.status === 0 && /unchanged/.test(again.stdout), again.stdout);

await db.collection('hondoko-config').doc('sharing').set({
  mode: 'link', allowComments: false, linkKey: 'no', keep: 9,
});
const weak = run([]);
check('短すぎる linkKey は手作業として出す', weak.status === 0 && /NEEDS MANUAL ATTENTION: linkKey cannot be moved unchanged/.test(weak.stdout), weak.stdout);
const weakDoc = (await db.collection('hondoko-config').doc('sharing').get()).data();
check('短すぎる linkKey は消さない', weakDoc.linkKey === 'no' && weakDoc.keep === 9);

await db.collection('hondoko-config').doc('sharing').set({
  mode: 'viewers', allowComments: true, viewers: ['Late@Example.com'], keep: 3,
});
await db.collection('hondoko-config').doc('viewers').set({ emails: ['already@example.com'], other: 'stay' });
const applied = await writeHondokoInTransaction(db);
check('トランザクション書き込みが更新になる', applied.action === 'update');
const lateViewers = (await db.collection('hondoko-config').doc('viewers').get()).data();
const lateSharing = (await db.collection('hondoko-config').doc('sharing').get()).data();
check('トランザクションは読み直したメールを統合し他フィールドを残す', JSON.stringify(lateViewers.emails) === JSON.stringify(['already@example.com', 'late@example.com']) && lateViewers.other === 'stay' && !('viewers' in lateSharing) && lateSharing.keep === 3, JSON.stringify({ lateViewers, lateSharing }));

console.log(failed ? `fix-hondoko-viewers tests: ${failed} failed` : 'fix-hondoko-viewers tests: all passed');
process.exit(failed ? 1 : 0);
