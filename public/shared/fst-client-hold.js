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

  function crowdedAnswerMessage(status) {
    return status === 429 ? '混み合っています。少し待ってもう一度送ってください' : '';
  }

  function warnDroppedAnalytics(status, warn) {
    if (status !== 429) return false;
    (warn || console.warn)('混み合ったときは統計が実際より少なく出ることがある');
    return true;
  }

  return { holding: holding, holdUntil: holdUntil, crowdedAnswerMessage: crowdedAnswerMessage, warnDroppedAnalytics: warnDroppedAnalytics };
});
