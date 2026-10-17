# 目安箱のサーバー受付と共有許可の移行資料

日付: 2026-10-15。本番への merge、deploy、Firestore Rules、Auth の変更はしていない。

## 完了した作業

- Flight Strip の目安箱を Cloud Functions に移した。投稿は `/api/fst-feedback`、状態変更は `/api/fst-feedback-update`。
- 関数は App Check、確認済みの非匿名アカウント、本文 1〜2,000 文字、appId・version・url、ハニーポット、送信までの時間、1 分 5 回・1 日 50 回、同一内容の再送拒否を行う。初期状態は `unreviewed`。状態は編集者だけが 4 値へ変える。
- クライアントからの `fst_feedback` 作成・更新・削除、カウンタ、レート制限文書への書き込みをルールで拒否した。生 IP は保存しない。
- 明友社の共有アカウントは、メール確認済みのときだけ単価を読める。本番 Auth は見ていない。手順は `docs/meiyusha-email-verification.md`。ルール側の例外は入れていない。
- accessGrants の計画スクリプト、手順、利用者向け案内を追加した。`--apply` は実行していない。例のメールでは本番へ書けない。
- Storage ルールのエミュレーター試験は残した。

## 検証

- `npm test --prefix functions` 51 件成功
- Firestore / Storage / Auth エミュレーター `tests/firestore` 27 件成功（`demo-cc-dev-cost`）
- `python3 -m unittest discover -s scripts -p 'test_*.py'` 24 件成功
- 安定版ログイン画面で v0.5.17 のリリースノート、ホームへ戻る、閉じる、Escape を確認。開発版は v0.10.30-dev。目安箱フォームはログイン後のため未操作。

## バージョン

- Flight Strip TODO 安定版: v0.5.17
- Flight Strip TODO 開発版: v0.10.30-dev

## 本番URL

未デプロイ。Actions: https://github.com/ryou-on/CC-DEV/actions
安定版: https://cc-dev-ps7.web.app/Flight_Strip_TODO/
開発版: https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/
明友社見積: https://cc-dev-ps7.web.app/meiyusha-estimate/

## 残課題・残リスク

- accessGrants の本番付与と利用者への案内送付が終わるまで main へマージしない。資料は用意済みで、実行はロビーの作業。
- `meiyusha@meiyusha-estimate.app` の emailVerified は未確認。未確認のままルールを出すと見積が読めない。
- 目安箱の Functions は未デプロイ。画面・ルール・Functions を別々に出すと送信が失敗する。
- App Check のコンソール強制は OFF。単体試験はトークン欠如を拒否するだけで、本物のトークンは未検証。
- 予算停止ラッチが閉じていると目安箱も `SERVICE_PAUSED` になる。
- 本番 URL のスモーク、Functions エミュレーター結合、ログイン後のフォーム送信は未実施。
