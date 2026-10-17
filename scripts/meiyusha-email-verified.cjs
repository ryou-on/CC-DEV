#!/usr/bin/env node
'use strict';

// 本番 Firebase Auth には接続しない。ロビーへの確認依頼を表示するだけ。
const CHECKS = [
  'Firebase コンソールのプロジェクト cc-dev-ps7 を開く。',
  'Authentication → Users で meiyusha@meiyusha-estimate.app を探す。',
  'その行の「メール確認済み」がはいなら、ルール公開後も見積もりを読める。いいえなら、下の手順で確認済みにしてから、一度ログアウトしてログインし直す。',
  '確認済みにしたあとも、このリポジトリのスクリプトは Auth を変更しない。変更はロビーがコンソールか Admin SDK で行う。',
];

function main() {
  if (process.argv.includes('--apply')) {
    console.error('本番 Auth は変更しません。docs/meiyusha-email-verification.md の手順をロビーが実行してください。');
    process.exitCode = 2;
    return;
  }
  console.log(JSON.stringify({
    contactsProductionAuth: false,
    account: 'meiyusha@meiyusha-estimate.app',
    ask: 'ロビー（ユーザー）に、本番 Auth でこの共有アカウントが emailVerified かを確認してもらう。',
    checks: CHECKS,
    doc: 'docs/meiyusha-email-verification.md',
  }, null, 2));
}

if (require.main === module) main();

module.exports = { CHECKS };
