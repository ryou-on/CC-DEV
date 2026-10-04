# 作業記録（2026-10-05 追記）

## 完了した作業
- 本番の既存月額予算を1,000円へ更新、500/800/1,000円の実績通知とPub/Sub接続を設定・APIで再確認。
- App Checkを既存4 Webアプリに登録。ドメイン制限されたreCAPTCHA Enterpriseキーを設定。
- 匿名Firestore共有の権限移行を実装（本番未適用）。既存データパス維持、Googleログイン・期限・reader/writer分離。管理用grantスクリプトを追加。
- 共有アプリの認証UIとApp Check初期化、匿名解析書き込み停止、使い方・リリースノートを更新。
- 有料APIの全体停止ラッチを追加。欠落・不正な設定も停止。
- Firestore14件・Functions40件・公開前チェッカー15件の試験、および対象12画面のブラウザー検証。

## URL
- ドラフトPR: https://github.com/ryou-on/CC-DEV/pull/3
- Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番: https://cc-dev-ps7.web.app/ （アプリコード・Rulesの今回の変更は未デプロイ）

## バージョン
Flight Strip安定版v0.5.15、開発版v0.6.0-devエントリ更新。App Dashboard/ともえホーム/Meet Knowledge/Outreach CRM v0.2.0、ともえプレイヤーv0.10.0、視聴ダッシュボードv0.8.0、note分析v0.4.0、Bombing Bay v0.4.0、おうち巴寿司v1.5.0、hihaho-view v1.5.1。

## 残課題・注意
- 800円自動停止はIAM権限付与が自動承認審査で拒否され、明示承認待ち。ワークフロー案は未コンパイル・未稼働。
- App Check登録は完了したが強制適用はOFF。既存アプリ・拡張の互換性と実トークンの検証が必要。
- 本番Firestoreルールには匿名アクセスが残る。公開ゲート未合格のため、権限移行コード・クライアント変更はPRで保管し未公開。
- 公開前検査を無効化したり、未確認事項を確認済みに変更していない。
- 課金通知に遅延があり、800円/1,000円の厳密な請求上限は保証できない。
- 詳細と復旧方針: docs/cloud-controls-status.md、infrastructure/cost-stop/README.md。
