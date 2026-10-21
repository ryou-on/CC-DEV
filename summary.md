# 検査ハッシュの更新と編集者判定の揃え

日付: 2026-10-21。本番への merge、deploy、Firestore Rules、Auth の変更はしていない。

## 完了した作業

- main の #8（`3e60280`、Hosting から cm-generator と sylavids-cm を外す）を merge し、検査ハッシュを取り直した。force push はしていない。
- 編集者メールは Functions と Rules の両方で、前後の空白を除いて小文字比較する。同じ 13 件を両方に流して結果を比較する。
- 利用統計の否定ケース（未知の項目、appId と build の不一致、不正な版、IP の分上限）を追加した。
- 開発版の `fst_admin`、`fst_surveys`、`fst_survey_answers` は全拒否をやめ、確認済みアカウントの読み取りと編集者の書き込みに限った。回答の作成は確認済み利用者、読み取りは編集者、更新と削除は拒否。
- デプロイ順は Functions を先、その後に Rules と Hosting。手順は `docs/fst-analytics-api.md` と `docs/access-grants-migration.md`。

## IP 上限

生 IP は保存しない。短命ハッシュだけを数える。

- 利用統計: 1 分 60 回、日本時間で 1 日 800 回
- 目安箱: 1 分 30 回、日本時間で 1 日 100 回

利用者ごとの上限は別で、利用統計は 1 分 30 回・1 日 400 回、目安箱は 1 分 5 回・1 日 50 回。

## CI

対象は `tests`（Cost safety tests）と `build_and_preview`（Deploy to Firebase Hosting on PR）の両方。Firestore rules test は PR #4 だけ。

直前の先端は赤だった。PR #3 は run 39190922113（tests）と 39190922110（build_and_preview）。PR #4 は run 39190978521（tests）と 39190978494（build_and_preview）。原因は main の #8 を含まない検査ハッシュで、PR のマージ結果に対する `cost_guard --check` が BLOCKED になったこと。このブランチは main を merge してハッシュを更新した。push 後の両ジョブが緑であることを完了条件にする。

## 検証

- `npm test --prefix functions` 58 件成功
- Firestore / Storage / Auth エミュレーター `tests/firestore` 30 件成功（`demo-cc-dev-cost`）
- `python3 -m unittest discover -s scripts -p 'test_*.py'` 24 件成功
- 2026-10-21 に本番 `POST /api/fst-analytics` と `POST /api/fst-feedback` はどちらも 404

## バージョン

- Flight Strip TODO 安定版: v0.5.17
- Flight Strip TODO 開発版: v0.10.30-dev

## 本番URL

未デプロイ。Actions: https://github.com/ryou-on/CC-DEV/actions
安定版: https://cc-dev-ps7.web.app/Flight_Strip_TODO/
開発版: https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/
明友社見積: https://cc-dev-ps7.web.app/meiyusha-estimate/

## 残課題・残リスク

- accessGrants の本番付与と利用者への案内送付が終わるまで main へマージしない。
- `meiyusha@meiyusha-estimate.app` の emailVerified は未確認。
- 目安箱と利用統計の Functions は未デプロイ。本番の `/api/fst-analytics` は 404。Functions を先に出し、その後に Rules と Hosting を出す。
- App Check のコンソール強制は OFF。本物のトークンは未検証。
- 予算停止ラッチが閉じていると目安箱と利用統計も `SERVICE_PAUSED` になる。
- 過去の利用統計は別方式の uid ハッシュ。人数の系列は続かない。
- アンケート回答の uidHash はクライアント生成で、Auth の uid とはルールで結び付かない。確認済み利用者は他人のハッシュで新規回答を作れる。既存回答の更新と削除は拒否し、読み取りは編集者だけ。
- 告知の読み取りは、Flight Strip 以外の確認済みアカウントにも開く。
- 画面の ALLOW 定数、明友社、本ドコのオーナーは編集者正本とは別一覧のまま。
- 本番スモーク、Functions エミュレーター結合、ログイン後の送信は未実施。
