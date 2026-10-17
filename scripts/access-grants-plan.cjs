'use strict';

// 本番 Firestore には接続しない。付与計画と利用者案内の下書きだけを作る。
const SCOPES = new Set([
  'apps', 'tomoe-home', 'tomoe-player', 'ouchi-hamasushi', 'note-analytics',
  'meet-knowledge', 'outreach-crm', 'bombing-bay', 'hihaho-analytics',
]);
const ROLES = new Set(['reader', 'writer', 'revoke']);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,120}$/;

const SCOPE_NOTES = {
  'apps__registry': {
    app: 'app-dashboard',
    url: 'https://cc-dev-ps7.web.app/app-dashboard/',
    notice: 'アプリ一覧の閲覧と編集には、Googleログインと「アプリ台帳」の許可が必要になります。',
  },
  'tomoe-home__config': {
    app: 'tomoe-home',
    url: 'https://cc-dev-ps7.web.app/tomoe-home/',
    notice: '巴ホームの共有リストは、Googleログインと設定ID「config」の許可がないと読み書きできなくなります。端末に残っている表示用データはそのままです。',
  },
  'bombing-bay__global': {
    app: 'bombing-bay',
    url: 'https://cc-dev-ps7.web.app/bombing-bay/',
    notice: 'ランキングの送信には Googleログインと writer 許可が必要になります。対戦そのものは端末内で続けられます。',
  },
  'hihaho-analytics__global': {
    app: 'hihaho-admin',
    url: 'https://cc-dev-ps7.web.app/hihaho-admin/',
    notice: '再生回数の一覧は、hihaho編集者か reader 許可がある人だけが読めます。視聴者の再生そのものに許可は不要です。',
  },
};

function placeholderEmail(email) {
  return email.endsWith('@example.com') || email.endsWith('@example.test');
}

function scopeKey(grant) {
  return grant.collection + '__' + grant.tenant;
}

function validateGrant(grant, index) {
  const label = 'grants[' + index + ']';
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) throw Error(label + ' はオブジェクトが必要です');
  const allowed = new Set(['collection', 'tenant', 'email', 'role', 'days', 'note']);
  for (const key of Object.keys(grant)) {
    if (!allowed.has(key)) throw Error(label + ' に未知の項目があります: ' + key);
  }
  if (!SCOPES.has(grant.collection)) throw Error(label + ' の collection が許可リストにありません');
  if (typeof grant.tenant !== 'string' || !grant.tenant || grant.tenant.length > 100 || grant.tenant.includes('/') || grant.tenant.includes('__')) {
    throw Error(label + ' の tenant が不正です');
  }
  if (typeof grant.email !== 'string' || !EMAIL.test(grant.email)) throw Error(label + ' の email が不正です');
  if (!ROLES.has(grant.role)) throw Error(label + ' の role は reader / writer / revoke です');
  const days = grant.days === undefined ? 14 : grant.days;
  if (!Number.isInteger(days) || days < 1 || days > 30) throw Error(label + ' の days は 1〜30 です');
  return { ...grant, days, email: grant.email.toLowerCase() };
}

function noticeFor(key) {
  if (SCOPE_NOTES[key]) return SCOPE_NOTES[key];
  const [collection, tenant] = key.split('__');
  const dynamic = {
    'tomoe-player': '巴プレーヤーのリストを共有している人は、Googleログインとリストごとの許可が必要になります。',
    'ouchi-hamasushi': 'おうち巴寿司の同期は、各端末で Googleログインし、家族コードごとの writer 許可が必要になります。端末内に保存済みの音声は残ります。',
    'note-analytics': 'note の週次記録は、対象ユーザーIDごとの writer 許可と Googleログインが必要になります。',
    'meet-knowledge': 'チームのQ&Aは、Googleログインとチームコードごとの許可が必要になります。',
    'outreach-crm': 'リードの共有は、Googleログインとワークスペースごとの許可が必要になります。画面内のローカル保存は残ります。',
  };
  return {
    app: collection,
    url: 'https://cc-dev-ps7.web.app/' + collection + '/',
    notice: (dynamic[collection] || '共有データには Googleログインと許可が必要になります。') + ' 対象ID: ' + tenant,
  };
}

function plan(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.grants)) {
    throw Error('manifest.grants 配列が必要です');
  }
  const grants = manifest.grants.map(validateGrant);
  const byScope = new Map();
  for (const grant of grants) {
    const key = scopeKey(grant);
    if (!byScope.has(key)) byScope.set(key, []);
    const list = byScope.get(key);
    if (list.some(item => item.email === grant.email)) throw Error(key + ' に同じメールが重複しています');
    list.push(grant);
  }
  const scopes = [];
  for (const [key, items] of byScope) {
    const days = Math.min(...items.map(item => item.days));
    const info = noticeFor(key);
    scopes.push({
      scope: key,
      app: info.app,
      url: info.url,
      days,
      members: items.map(item => ({ email: item.email, role: item.role, placeholder: placeholderEmail(item.email) })),
      notice: info.notice,
    });
  }
  const blockers = [];
  if (grants.length === 0) blockers.push('付与計画が空です。利用者のメールを入れてから実行してください。');
  if (scopes.some(scope => scope.members.some(member => member.placeholder))) {
    blockers.push('example.com / example.test のメールが残っています。本番の付与対象に置き換えてください。');
  }
  return {
    dryRun: true,
    contactsProduction: false,
    readyForApply: blockers.length === 0,
    blockers,
    scopes,
    announcement: announcement(scopes),
  };
}

function announcement(scopes) {
  const lines = [
    'CC-DEV の一部アプリは、近いうちに Google アカウントでのログインと、管理者からの利用許可が必要になります。',
    '許可のないアカウントでは、共有データの閲覧や保存ができなくなります。端末の中だけに残っているデータは消えません。',
    'お手数ですが、ふだんお使いの Google アカウントで各アプリにログインできることをご確認ください。許可の追加は管理者が行います。',
    '',
  ];
  for (const scope of scopes) {
    lines.push('・' + scope.app + '（' + scope.url + '）');
    lines.push('  ' + scope.notice);
  }
  lines.push('');
  lines.push('ログインできない、または許可が必要か分からない場合は、アプリの管理者まで連絡してください。');
  return lines.join('\n');
}

const EXAMPLE = {
  grants: [
    { collection: 'apps', tenant: 'registry', email: 'operator@example.com', role: 'writer', days: 14, note: 'アプリ台帳の編集者' },
    { collection: 'tomoe-home', tenant: 'config', email: 'family@example.com', role: 'writer', days: 14 },
    { collection: 'tomoe-player', tenant: 'REPLACE_LIST_ID', email: 'family@example.com', role: 'writer', days: 14 },
    { collection: 'ouchi-hamasushi', tenant: 'default', email: 'family@example.com', role: 'writer', days: 14, note: '家族コードが default 以外なら置き換える' },
    { collection: 'note-analytics', tenant: 'REPLACE_USER_ID', email: 'writer@example.com', role: 'writer', days: 14 },
    { collection: 'meet-knowledge', tenant: 'REPLACE_TEAM', email: 'member@example.com', role: 'writer', days: 14 },
    { collection: 'outreach-crm', tenant: 'REPLACE_WORKSPACE', email: 'member@example.com', role: 'writer', days: 14 },
    { collection: 'bombing-bay', tenant: 'global', email: 'player@example.com', role: 'writer', days: 14 },
    { collection: 'hihaho-analytics', tenant: 'global', email: 'editor@example.com', role: 'reader', days: 14, note: '編集者メールはルール側でも読める' },
  ],
};

module.exports = { plan, announcement, EXAMPLE, SCOPES, placeholderEmail };
