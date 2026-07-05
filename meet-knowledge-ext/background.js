// ツールバーアイコンのクリックでサイドパネルを開く
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(err => console.error('sidePanel設定失敗:', err));
