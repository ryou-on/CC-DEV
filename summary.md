# 目安箱のサーバー登録と公開前検査

日付: 2026-10-15。本番への merge と deploy はしていない。

## 完了した作業

- Flight Strip の目安箱を、クライアントの Firestore 直書きから `fstFeedbackSubmit`（`/api/fst-feedback`）に移した。
- 関数は App Check、確認済みの非匿名アカウント、入力長、ユーザーと IP の回数制限、`costControls/global.enabled` を要求する。状態は `unreviewed`。カウンタはサーバーだけが増やす。
- `fst_feedback` の作成・削除と、編集者以外の更新をルールで拒否した。返信と状態変更は確認済みの編集者だけ。
- 明友社の共有パスワードアカウントは、メール確認済みのときだけ単価を読める。本番 Auth は変更していない。手順は `docs/meiyusha-estimate-auth.md`。
- Storage ルールのエミュレーター試験を追加し、CI のエミュレーター起動に storage を含めた。

## 検証

- `python3 -m unittest discover -s scripts -p 'test_*.py'` 24 件成功
- `npm test --prefix functions` 44 件成功
- Firestore / Storage / Auth エミュレーター `tests/firestore` 27 件成功（プロジェクト ID は `demo-cc-dev-cost`）

## バージョン

- Flight Strip 安定版 v0.5.17
- Flight Strip 開発版 v0.10.30-dev（v0.6.0-dev の日付と変更も更新）

## 本番URL

未デプロイ。本番は https://cc-dev-ps7.web.app/ 。GitHub Actions は https://github.com/ryou-on/CC-DEV/actions 。

## 残課題

- 本番の課金停止書き込み、App Check 強制、ルール公開、共有許可の付与は人間が行う。
- 目安箱は `costControls/global.enabled` が true でないと送れない。サイトキー未設定でも送れない。
- ルール公開前に `meiyusha@meiyusha-estimate.app` を Auth コンソールでメール確認済みにする。
- Hosting のプレビューは、リポジトリ変数 `ALLOW_HOSTING_PREVIEW=true` を人間が付けるまで作らない。
