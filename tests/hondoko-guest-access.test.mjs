// クライアントの判定だけ。Firestore には繋がない。
import { decideGuestAccess, planSharingSave } from '../hondoko-src/src/lib/guestAccess.mjs';

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok  ', name);
  else { failed++; console.log('  NG  ', name, detail ? '- ' + detail : ''); }
}

const handed = 'k3j9ab2cde1f';
const savedViewers = planSharingSave({
  mode: 'viewers',
  allowComments: true,
  existingSharingLinkKey: handed,
});
check('viewers へ保存しても旧 linkKey を link 文書へ先に書く', savedViewers.writeLinkKeyFirst === handed && !('linkKey' in savedViewers.sharing), JSON.stringify(savedViewers));
check('sharing の上書きには mode と allowComments だけ', JSON.stringify(savedViewers.sharing) === JSON.stringify({ mode: 'viewers', allowComments: true }));

const backToLink = planSharingSave({
  mode: 'link',
  allowComments: true,
  linkDocKey: handed,
});
check('link に戻しても同じ鍵を使う', backToLink.writeLinkKeyFirst === handed);

const short = planSharingSave({
  mode: 'public',
  allowComments: false,
  existingSharingLinkKey: 'abc1234',
});
check('7文字の鍵も保存で捨てない', short.writeLinkKeyFirst === 'abc1234');

const minted = planSharingSave({ mode: 'link', allowComments: false });
check('鍵が一度もない link 保存は呼び出し側が新しい鍵を作る', minted.writeLinkKeyFirst === null);

check('public に余分な ?k= があっても probe に進む', decideGuestAccess({ sessionOpened: false, sharingMode: null, base: 'probe' }) === 'probe');
check('public で sharing が読めていれば viewer', decideGuestAccess({ sessionOpened: false, sharingMode: 'public', base: 'viewer' }) === 'viewer');
check('link でセッションが拒否されたら閉じる', decideGuestAccess({ sessionOpened: false, sharingMode: 'link', base: 'probe' }) === 'denied');
check('正しい鍵のセッションは viewer', decideGuestAccess({ sessionOpened: true, sharingMode: 'link', base: 'denied' }) === 'viewer');

console.log(failed ? `hondoko guest access: ${failed} failed` : 'hondoko guest access: all passed');
process.exit(failed ? 1 : 0);
