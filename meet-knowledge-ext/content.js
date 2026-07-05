// Google Meet の字幕（CC）を読み取り、確定した行をサイドパネルへ送る
// 使い方: Meet 側で「字幕」を ON にしておくこと（音声認識は Meet 本体が行う）
// 注意: Meet の DOM 構造は予告なく変わるため、CAPTION_REGION_SELECTORS を随時更新する

(() => {
  const CAPTION_REGION_SELECTORS = [
    'div[jsname="dsyhDe"]',              // 字幕スクロール領域（2024〜）
    '.a4cQT',                            // 旧字幕コンテナ
    'div[aria-label="字幕"]',
    'div[aria-label="Captions"]',
  ];
  const SPEAKER_SELECTORS = ['.NWpY1d', '.KcIKyf', '.zs7s8d'];
  const STABLE_MS = 1500;   // この時間テキストが変化しなければ「確定」とみなす
  const POLL_MS = 500;

  let region = null;
  let lastText = '';        // 前回ポーリング時の字幕全文
  let lastChangeAt = 0;
  let sentText = '';        // 送信済みの字幕全文（差分送信用）

  function log(...args) { console.log('[MeetKnowledge]', ...args); }

  function findRegion() {
    for (const sel of CAPTION_REGION_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function currentSpeaker() {
    for (const sel of SPEAKER_SELECTORS) {
      const els = region.querySelectorAll(sel);
      if (els.length) return els[els.length - 1].textContent.trim();
    }
    return '';
  }

  function send(text, speaker) {
    const t = text.trim();
    if (!t) return;
    chrome.runtime.sendMessage({ type: 'mk-caption', text: t, speaker }).catch(() => {
      // サイドパネルが開いていない場合は受信者不在エラーになる（無視してよい）
    });
    log('送信:', speaker ? `${speaker}: ` : '', t.slice(0, 60));
  }

  function poll() {
    if (!region || !document.contains(region)) {
      region = findRegion();
      if (region) log('字幕領域を検出しました');
      return;
    }
    const text = region.innerText.replace(/\s+/g, ' ').trim();
    const now = Date.now();

    if (text !== lastText) {
      lastText = text;
      lastChangeAt = now;
      return;
    }
    // テキストが STABLE_MS 変化していなければ確定として送信
    if (text && now - lastChangeAt >= STABLE_MS && text !== sentText) {
      let out = text;
      // 前回送信分の続き（末尾に追記された）なら差分のみ送る
      if (sentText && text.startsWith(sentText)) {
        out = text.slice(sentText.length);
      }
      send(out, currentSpeaker());
      sentText = text;
    }
    // 字幕が流れてコンテナが入れ替わった場合のリセット
    if (!text) { sentText = ''; lastText = ''; }
  }

  setInterval(poll, POLL_MS);
  log('content script 起動（Meet側で字幕をONにしてください）');
})();
