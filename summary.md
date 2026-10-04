# 課金リスク改善 — 2026-10-05

- 5つの有料HTTP関数に認証・App Check・許可UID・期限・原子的な日次/月次利用枠・障害時停止を実装。
- 通訳のサーバー切断予約、mini-meの所有者確認・ポーリング抑制、公開JSON/HTMLのキャッシュ改善を実装。
- 全Firebase公開経路に課金検査を追加。共通開発ルールとリリースノートを更新。
- 検証: Functions 39テスト（Node 20/24）、公開検査15テスト成功。本ドコのビルド成功。9画面の使い方・リリースノート開閉をChromeで確認。外部APIはモックし、有料試験は実施していない。
- 実装ブランチ: fix/cost-risk-guards。mainへの統合・Firebaseデプロイなし。本番リスクは未解消。
- バージョン: 通訳 v0.2.0、Duo/mini-me/note Analytics v0.3.0、本ドコ v1.22.0、公開/社内KB v0.2.1、Flight安定版 v0.5.14。Flight開発版は指定された v0.6.0-dev の履歴を更新。
- デプロイURL: なし（既存本番 https://cc-dev-ps7.web.app/ には未反映）。
- 残課題: 匿名Firestore共有の権限・データ移行、金額予算/停止/エッジ防御、App Check本番設定、許可UID、Cloud TasksのIAMと切断実証。初期設定は有料機能停止。
- 依存関係: Functionsの互換更新でcritical/highを解消したがmoderate 10件が残る。本ドコのnpm auditにはFirebase経由のhigh 4件が残る（ブラウザ配信への影響は未精査）。破壊的な自動更新は行っていない。
- 詳細: docs/cost-safety-implementation.md、docs/cost-safety-ui-results.json。回数・時間制限は円建て請求額の保証ではない。
