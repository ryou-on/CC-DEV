(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.fstClientHold = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function holding(map, key, now) {
    var until = map && map[key] ? map[key] : 0;
    return until > now;
  }

  function holdUntil(map, key, now, retryAfterSeconds) {
    var seconds = Number(retryAfterSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) seconds = 60;
    map[key] = now + seconds * 1000;
    return map[key];
  }

  function crowdedAnswerMessage(status, code) {
    if (status === 429 || (status === 503 && code === 'COST_GUARD_UNAVAILABLE')) {
      return '混み合っています。少し待ってもう一度送ってください';
    }
    return '';
  }

  function warnDroppedAnalytics(status, code, warn) {
    var log = warn;
    var errorCode = code;
    if (typeof code === 'function') {
      log = code;
      errorCode = '';
    }
    if (status !== 429 && !(status === 503 && errorCode === 'COST_GUARD_UNAVAILABLE')) return false;
    (log || console.warn)('混み合ったときは統計が実際より少なく出ることがある');
    return true;
  }

  return { holding: holding, holdUntil: holdUntil, crowdedAnswerMessage: crowdedAnswerMessage, warnDroppedAnalytics: warnDroppedAnalytics };
});
