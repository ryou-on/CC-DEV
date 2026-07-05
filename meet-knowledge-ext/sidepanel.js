// content script から受け取った字幕を、埋め込んだ Web アプリへ postMessage で中継する
const APP_ORIGIN = 'https://cc-dev-ps7.web.app';
const iframe = document.getElementById('app');

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'mk-caption' && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      { type: 'mk-caption', text: msg.text, speaker: msg.speaker || '' },
      APP_ORIGIN
    );
  }
});
