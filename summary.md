# 利用統計のサーバー受付と編集者判定の照合

日付: 2026-10-19。本番への merge、deploy、Firestore Rules、Auth の変更はしていない。

## 完了した作業

- Flight Strip の利用統計を Cloud Functions に移した。記録は `POST /api/fst-analytics`（`recordFstAnalytics`）。
- 関数は App Check、確認済みの非匿名アカウント、appId と build の一致、種別の限定を要求する。回数は利用者 1 分 30 回・日本時間で 1 日 400 回。uid と生 IP は保存せず、日付はサーバーの日本時間。
- クライアントからの `fst_analytics` 作成・更新・削除をルールで拒否した。読み取りは確認済みの hihaho 編集者だけ。
- 目安箱は前回のまま Functions 経由。編集者メールは `functions/editor-policy.json` を Functions が読む。Rules は JSON を import できないため、`isHihahoEditor` との一致を試験で固定した。
- 明友社のメール確認手順と accessGrants の移行資料は前回のまま。`--apply` は実行していない。

## 検証

- `npm test --prefix functions` 58 件成功
- Firestore / Storage / Auth エミュレーター `tests/firestore` 27 件成功（`demo-cc-dev-cost`）
- `python3 -m unittest discover -s scripts -p 'test_*.py'` 24 件成功
- 安定版ログイン画面で v0.5.17 のリリースノート、ホームへ戻る、閉じる、Escape を確認。開発版はバナー v0.10.30-dev と利用統計の文言を確認。統計の POST と目安箱フォームはログイン後のため未操作。

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
- 目安箱と利用統計の Functions は未デプロイ。画面・ルール・Functions を別々に出すと送信と記録が失敗する。
- App Check のコンソール強制は OFF。単体試験はトークン欠如を拒否するだけで、本物のトークンは未検証。
- 予算停止ラッチが閉じていると目安箱と利用統計も `SERVICE_PAUSED` になる。
- 過去の利用統計はクライアント時計と別方式の uid ハッシュ。新しい行とは人数の系列が続かない。
- Rules の編集者判定は大文字小文字を区別する。Functions は小文字化する。画面の ALLOW 定数、明友社、本ドコのオーナーは別一覧のまま。
- 本番 URL のスモーク、Functions エミュレーター結合、ログイン後のフォーム送信と統計 POST は未実施。
