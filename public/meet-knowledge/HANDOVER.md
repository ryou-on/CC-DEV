# HANDOVER.md - Meet Knowledge（会議同伴ナレッジサイドバー）

## 基本情報
- バージョン: v0.1.0
- フェーズ: Phase 1（MVP・検索ファースト）
- 最終更新: 2026-07-06

## コンセプト
オンライン商談中に聞かれた質問をリアルタイムに検知し、社内ナレッジ（Q&A・用語集）から適合回答をサイドバーに即時表示。未回答の質問はその場で回答を登録してナレッジ化し、次回の会議から即答できる「会議同伴型ナレッジOS」のMVP。

## 技術スタック
- Frontend: 単一HTML（Vanilla JS / ES Modules）
- 音声認識: Web Speech API（ja-JP, continuous + interimResults, onendで自動再起動）
- 質問検知: 日本語ルールベース（文末表現・疑問詞・依頼表現の正規表現）
- 検索: バイグラムDice係数 × 0.75 ＋ キーワード一致ブースト（+0.25/語, 上限0.5）。閾値0.18、上位3件表示
- Backend: Firebase Firestore（`cc-dev-ps7`、onSnapshotリアルタイム同期、localStorageキャッシュ併用）
- Hosting: Firebase Hosting（GitHub Actions自動デプロイ）

## ファイル構成
```
public/meet-knowledge/
├── index.html        # アプリ本体（?embed=1 でサイドパネル用埋め込みモード）
└── HANDOVER.md

meet-knowledge-ext/    # Chrome拡張（リポジトリルート・ホスティング対象外）
├── manifest.json      # MV3 / sidePanel / meet.google.com content script
├── background.js
├── content.js         # Meet字幕DOMのポーリング読み取り→確定行を送信
├── sidepanel.html/js  # Webアプリをiframe表示し字幕をpostMessage中継
└── README.md
```

## データ構造
- Firestore: `meet-knowledge/{teamCode}/entries/{entryId}`
  - `question` (string ≤500) / `answer` (string ≤5000) / `keywords` (list ≤20) / `category` / `createdAt` / `updatedAt` / `hits` / `source` (manual|meeting|import)
- チームコードを知っている人同士で共有（ouchi-hamasushiの家族コード方式と同じ）。localStorage `mk_teamCode`
- firestore.rules に上記パスのバリデーション付きルールを追加済み・デプロイ済み（2026-07-06）

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/meet-knowledge/

## 進捗チェックリスト
- [x] リアルタイム文字起こし（Web Speech API・自動再起動）
- [x] 質問検知（ルールベース・複文分割・重複スキップ）
- [x] ナレッジ検索・関連度表示・コピー・使用回数記録
- [x] 未ヒット質問のその場登録（会議中ナレッジ化ループ）
- [x] ナレッジ管理（登録・編集・削除・検索・JSONエクスポート/インポート）
- [x] Firestoreチーム共有＋オフラインキャッシュ
- [x] Chrome拡張の雛形（字幕読み取り→サイドパネル中継）
- [ ] 実際のGoogle Meet会議での拡張の実機テスト（字幕DOMセレクタ確認）
- [ ] ナレッジ未ヒット時のClaude生成補完（Phase 2）
- [ ] 会議ログのFirestore保存・会議後レビュー画面（Phase 2）

## 既知の問題・注意事項
- Web Speech APIはChrome推奨。マイク入力ベースのため、相手の声を拾うにはMeet音声をスピーカー出力するか、拡張（Meet字幕読み取り）を使う
- 話者分離はWebアプリ単体では不可（拡張経由ならMeet字幕の話者名を利用）
- Meetの字幕DOMセレクタ（content.js の `CAPTION_REGION_SELECTORS`）は実機で要確認・変更されやすい
- ローカルの firebase-tools 15.18.0 は Node v25 で `deploy` サブコマンドが無出力で失敗する。ルールデプロイは `npx -y firebase-tools@latest deploy --only firestore:rules` を使うこと
- チーム `default` に動作確認用のサンプルナレッジ3件（料金・セキュリティ・オンプレ）が登録済み

## 次のステップ
1. 実際のMeet会議で拡張の字幕読み取りを実機テスト（セレクタ調整）
2. パイロット運用（営業チーム）→ 質問検知精度・関連度閾値のチューニング
3. Phase 2: 未ヒット時のClaude API回答生成（Cloudflare Workerプロキシ、ai-meeting方式）
