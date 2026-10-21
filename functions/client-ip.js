'use strict';

// Cloud Functions（第2世代）は Cloud Run の前段が、接続してきた相手の
// アドレスを X-Forwarded-For の末尾へ足す。先頭は呼び出し側が付けられる。
// Firebase Hosting 経由のときは、その末尾は Hosting の出口であり、
// ブラウザが書いた値ではない。利用者ごとの上限は別にある。
function clientIp(req) {
  const raw = req && typeof req.get === 'function' ? req.get('x-forwarded-for') : '';
  const parts = String(raw || '').split(',').map(part => part.trim()).filter(Boolean);
  const observed = parts.length ? parts[parts.length - 1] : ((req && req.ip) || 'missing');
  return String(observed).slice(0, 200);
}

module.exports = { clientIp };
