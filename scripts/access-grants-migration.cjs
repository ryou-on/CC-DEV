#!/usr/bin/env node
'use strict';

// 既定は計画の表示だけ。本番の Auth / Firestore には接続しない。
// --apply はロビーが CONFIRM_PRODUCTION_WRITE=access-grants を付けたときだけ。
const fs = require('node:fs');
const { plan, EXAMPLE } = require('./access-grants-plan.cjs');

function applyGuard() {
  if (process.env.CONFIRM_PRODUCTION_WRITE !== 'access-grants') {
    throw Error('本番へは書きません。ロビーが手順を確認したあと、CONFIRM_PRODUCTION_WRITE=access-grants を付けて --apply してください。');
  }
}

async function applyManifest(manifest) {
  applyGuard();
  const drafted = plan(manifest);
  if (!drafted.readyForApply) throw Error(drafted.blockers.join(' '));
  const { initializeApp, applicationDefault } = require('../functions/node_modules/firebase-admin/app');
  const { getAuth } = require('../functions/node_modules/firebase-admin/auth');
  const { getFirestore, Timestamp } = require('../functions/node_modules/firebase-admin/firestore');
  const app = initializeApp({ credential: applicationDefault(), projectId: 'cc-dev-ps7' });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const byScope = new Map();
  for (const scope of drafted.scopes) {
    byScope.set(scope.scope, scope);
  }
  for (const scope of byScope.values()) {
    const resolved = [];
    for (const member of scope.members) {
      const user = await auth.getUserByEmail(member.email);
      if (user.disabled || !user.emailVerified || !user.providerData.some(item => item.providerId === 'google.com')) {
        throw Error('確認済みで有効な Google アカウントが必要です: ' + member.email);
      }
      resolved.push({ uid: user.uid, role: member.role });
    }
    const ref = db.doc('accessGrants/' + scope.scope);
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const old = snapshot.data() || {};
      const active = old.enabled === true && old.expiresAt?.toMillis() > Date.now();
      let readers = (active ? old.readers || [] : []).slice();
      let writers = (active ? old.writers || [] : []).slice();
      for (const member of resolved) {
        readers = readers.filter(uid => uid !== member.uid);
        writers = writers.filter(uid => uid !== member.uid);
        if (member.role === 'reader') readers.push(member.uid);
        if (member.role === 'writer') writers.push(member.uid);
      }
      if (readers.length + writers.length > 50) throw Error('1つの許可は50人までです: ' + scope.scope);
      const requested = Date.now() + scope.days * 86400000;
      const expiresAt = Timestamp.fromMillis(active ? Math.min(old.expiresAt.toMillis(), requested) : requested);
      tx.set(ref, { enabled: true, readers, writers, expiresAt, updatedAt: Timestamp.now() });
    });
    console.log(JSON.stringify({ applied: true, scope: scope.scope, members: resolved.length }));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const manifestFlag = args.indexOf('--manifest');
  const manifest = manifestFlag === -1 ? EXAMPLE : JSON.parse(fs.readFileSync(args[manifestFlag + 1], 'utf8'));
  const drafted = plan(manifest);
  console.log(JSON.stringify({
    dryRun: !apply,
    contactsProduction: false,
    readyForApply: drafted.readyForApply,
    blockers: drafted.blockers,
    scopes: drafted.scopes,
  }, null, 2));
  console.log('\n----- 利用者向け案内 -----\n');
  console.log(drafted.announcement);
  if (!apply) {
    console.log('\n本番の Auth と Firestore は参照していません。付与は docs/access-grants-migration.md の手順でロビーが行います。');
    return;
  }
  await applyManifest(manifest);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { applyGuard, applyManifest };
