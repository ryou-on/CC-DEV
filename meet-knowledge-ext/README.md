# Meet Knowledge サイドパネル（Chrome拡張）v0.1.0

Google Meet の字幕（CC）を読み取り、質問を検知して社内ナレッジをサイドパネルに即時表示する拡張。
本体ロジックは Web アプリ https://cc-dev-ps7.web.app/meet-knowledge/ を `?embed=1` で iframe 埋め込みしており、拡張側は「字幕の読み取りと中継」だけを行う薄い構成。

## インストール（開発版）

1. Chrome で `chrome://extensions` を開く
2. 右上「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ この `meet-knowledge-ext` フォルダを選択

## 使い方

1. Google Meet で会議に参加し、**字幕（CC）を ON** にする（音声認識は Meet 本体が行う）
2. ツールバーの拡張アイコンをクリック → サイドパネルが開く
3. 字幕で確定した発言が自動でアプリに流れ、質問が検知されるとナレッジ候補が表示される

## 構成

| ファイル | 役割 |
|---|---|
| manifest.json | MV3。sidePanel + meet.google.com への content script |
| background.js | アイコンクリックでサイドパネルを開く |
| content.js | Meet の字幕 DOM をポーリングし、確定行を runtime message で送信 |
| sidepanel.html / sidepanel.js | Web アプリを iframe 表示し、字幕を postMessage で中継 |

## 既知の注意点

- **Meet の字幕 DOM は予告なく変わる。** 字幕が拾えなくなったら `content.js` の `CAPTION_REGION_SELECTORS` を DevTools で調べて更新する（コンソールに `[MeetKnowledge]` プレフィックスでログが出る）
- 字幕 OFF のままだと何も流れない
- サイドパネルを開いていない間の字幕は記録されない
- 実際の Meet 会議での動作確認は未実施（要実機テスト）
