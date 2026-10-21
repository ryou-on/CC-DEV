# 告知とアンケートを Functions 経由にし、デプロイ前に関数の稼働を確認する

日付: 2026-10-21。本番への merge、deploy、Firestore Rules、Auth の変更はしていない。関数の手動デプロイもしていない。

## 完了した作業

- main の #8（`3e60280`）は既に両ブランチへ merge 済み。force push はしていない。
- 編集者メールは Functions と Rules の両方で、前後の空白を除いて小文字比較する。
- 開発版の告知、強制更新、アンケートの作成と公開、アンケート回答はクライアント直書きをやめ、Functions だけが書く。Rules は作成・更新・削除を拒否する。
- 回答の uidHash は認証 uid の SHA-256 先頭16桁。`btoa` 方式は廃止した。クライアントが uidHash を送ると未知の項目として拒否し、文書は作らない。他人のハッシュで上書きできない。二度目は 409 で、先の回答が残る。
- `firebase-hosting-merge.yml` と `firebase-rules-deploy.yml` は、デプロイ前に次の6関数が本番で ACTIVE かを確認し、無ければ止める。依頼の3つに、告知とアンケートの3つを足した。Rules が直書きを拒否したあと、送信先が無い状態で画面を出さないため。
  - `fstFeedbackSubmit`、`updateFstFeedback`、`recordFstAnalytics`
  - `recordFstDevAdmin`、`recordFstSurvey`、`submitFstSurveyAnswer`
- 自動の Functions デプロイ対象は `miniMeGenerate` のまま。6関数はマージ前に人間が対象ブランチから出す。

## IP 上限

生 IP は保存しない。短命ハッシュだけを数える。

- 利用統計: 1 分 60 回、日本時間で 1 日 800 回
- 目安箱: 1 分 30 回、日本時間で 1 日 100 回
- 告知とアンケート管理: 1 分 20 回、1 日 200 回
- アンケート回答: 1 分 20 回、1 日 100 回

利用者ごとの上限は別で、利用統計は 1 分 30 回・1 日 400 回、目安箱は 1 分 5 回・1 日 50 回、告知とアンケート管理は 1 分 10 回・1 日 100 回、回答は 1 分 5 回・1 日 30 回。

## CI

対象は `tests`（Cost safety tests）と `build_and_preview`（Deploy to Firebase Hosting on PR）の両方。Firestore rules test は PR #4 だけ。

前の先端は緑だった。PR #3 `2c6cb3e` は run 39525322285（tests）と 39525322201（build_and_preview）。PR #4 `37224fe` は run 39525323861（tests）、39525323982（build_and_preview）、39525323991（test）。その前の赤は main #8 を含まない検査ハッシュが原因。この summary を書いた時点では、告知とアンケートのコミットの CI はまだ走っていない。結果は完了報告に書く。summary には走ったあとの run ID を追記しない。追記すると検査ハッシュが変わり、もう一度 CI が必要になるため。

## 検証

- `npm test --prefix functions` 63 件成功
- Firestore / Storage / Auth エミュレーター `tests/firestore` 30 件成功（`demo-cc-dev-cost`）
- `python3 -m unittest discover -s scripts -p 'test_*.py'` 27 件成功
- 本番の関数稼働確認スクリプトは、テストでは偽の応答だけを使い、本番 API は呼んでいない
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
- 6関数は未デプロイ。このまま main へ入れると Hosting と Rules のデプロイはゲートで止まる。止まるのは意図した動作。先に対象ブランチから手動デプロイする。
- App Check のコンソール強制は OFF。本物のトークンは未検証。
- 予算停止ラッチが閉じていると目安箱、利用統計、告知、アンケートも `SERVICE_PAUSED` になる。
- 過去の利用統計は別方式の uid ハッシュ。人数の系列は続かない。アンケート回答も `btoa` の識別子とは結び付かない。
- 告知とアンケートの読み取りは、Flight Strip 以外の確認済みアカウントにも開く。回答の読み取りは編集者だけ。
- 画面の ALLOW 定数、明友社、本ドコのオーナーは編集者正本とは別一覧のまま。
- 本番スモーク、ログイン後の告知とアンケート送信は未実施。開発版の画面は Google ログインと未デプロイの API が必要。
