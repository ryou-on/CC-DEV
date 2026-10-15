'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { plan, EXAMPLE } = require('../../scripts/access-grants-plan.cjs');
const { applyGuard } = require('../../scripts/access-grants-migration.cjs');

test('example manifest is a dry plan and blocks placeholder emails', () => {
  const drafted = plan(EXAMPLE);
  assert.equal(drafted.dryRun, true);
  assert.equal(drafted.contactsProduction, false);
  assert.equal(drafted.readyForApply, false);
  assert.equal(drafted.scopes.some(scope => scope.scope === 'apps__registry'), true);
  assert.match(drafted.announcement, /Google アカウント/);
  assert.match(drafted.announcement, /app-dashboard/);
  assert.throws(() => plan({ grants: [{ ...EXAMPLE.grants[0], collection: 'users' }] }), /collection/);
  assert.throws(() => plan({ grants: [{ ...EXAMPLE.grants[0], tenant: 'a/b' }] }), /tenant/);
  assert.throws(() => plan({ grants: [EXAMPLE.grants[0], EXAMPLE.grants[0]] }), /重複/);
  assert.throws(() => plan({ grants: [{ ...EXAMPLE.grants[0], days: 31 }] }), /days/);
  assert.throws(() => plan({ grants: [{ ...EXAMPLE.grants[0], uid: 'client' }] }), /未知/);
});

test('a real-looking manifest is ready and uses the shorter shared expiry', () => {
  const drafted = plan({
    grants: [
      { collection: 'ouchi-hamasushi', tenant: 'default', email: 'Family@Example.co.jp', role: 'writer', days: 14 },
      { collection: 'ouchi-hamasushi', tenant: 'default', email: 'other@example.co.jp', role: 'reader', days: 7 },
    ],
  });
  assert.equal(drafted.readyForApply, true);
  assert.equal(drafted.scopes[0].days, 7);
  assert.equal(drafted.scopes[0].members[0].email, 'family@example.co.jp');
  assert.match(drafted.announcement, /おうち巴寿司/);
});

test('apply is refused before Firebase starts', () => {
  const previous = process.env.CONFIRM_PRODUCTION_WRITE;
  delete process.env.CONFIRM_PRODUCTION_WRITE;
  assert.throws(() => applyGuard(), /本番へは書きません/);
  if (previous === undefined) delete process.env.CONFIRM_PRODUCTION_WRITE;
  else process.env.CONFIRM_PRODUCTION_WRITE = previous;
});

test('meiyusha checklist does not contact Auth, including --apply', () => {
  const script = path.join(__dirname, '../../scripts/meiyusha-email-verified.cjs');
  const shown = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(shown.status, 0);
  const body = JSON.parse(shown.stdout);
  assert.equal(body.contactsProductionAuth, false);
  assert.match(body.ask, /ロビー/);
  const refused = spawnSync(process.execPath, [script, '--apply'], { encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /本番 Auth は変更しません/);
});
