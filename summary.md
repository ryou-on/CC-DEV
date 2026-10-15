# 課金事故対策と Firestore ルールの公開前仕上げ

日付: 2026-10-15。本番への merge と deploy はしていない。

## 完了した作業

- PR #3 のブランチで、Firestore を認証必須に統一し、PR #4 のフィールド検証とルール試験を取り込んだ。
- `apps`、note-analytics の snapshots、ouchi-hamasushi の assets から、誰でも削除できる条件を除いた。
- 管理者 UID の直書きをやめ、カスタムクレーム `admin` と `admins/{uid}` にした。手順は `docs/admin-access.md`。
- 公開前検査のキャッシュ破棄エラーを修正し、要確認 53 件に根拠を記録した。
- 予算 1,000 円の停止判定をローカルで模擬した。800 円以上で停止、799 円では停止しない。
- Auth エミュレーターで Google ログインから Firestore の許可・拒否まで確認した。

## 検証

- `python3 -m unittest discover -s scripts -p 'test_*.py'` 23 件成功
- `npm test --prefix functions` 40 件成功
- Firestore / Auth エミュレーター `tests/firestore` 17 件成功（プロジェクト ID は `demo-cc-dev-cost`）

## 本番URL

未デプロイ。本番は https://cc-dev-ps7.web.app/ 。GitHub Actions は https://github.com/ryou-on/CC-DEV/actions 。

## 残課題

- 本番の課金停止書き込み、App Check 強制、ルール公開、共有許可の付与は人間が行う。
- 未ログイン利用者への案内は `docs/anonymous-user-impact.md`。
- Hosting のプレビューは、リポジトリ変数 `ALLOW_HOSTING_PREVIEW=true` を人間が付けるまで作らない。
