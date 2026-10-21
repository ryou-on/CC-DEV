# Flight Strip 利用統計 API

クライアントから `fst_analytics` へ書くことはルールで拒否します。記録は Cloud Functions だけが Admin SDK で行います。読み取りは確認済みの hihaho 編集者だけです。

## 守るデータ

- 種別（`session` / `task_created` / `task_completed`）、版、build、任意の端末種別
- 日本時間の日付・時・曜日。サーバー時計で付ける
- uid の SHA-256 先頭 16 桁。生の uid は保存しない
- レート制限用の利用者ハッシュと全体の回数。IP は数えない

## 主体

| 主体 | できること |
|---|---|
| 未ログイン、匿名、メール未確認 | 何もできない |
| 確認済みの利用者 | 自分の操作を 1 件記録する。回数の上限あり |
| hihaho 編集者 | 一覧を読む。ブラウザからの作成・更新・削除はできない |
| クライアント | 作成、更新、削除は拒否 |

## エンドポイント

`POST /api/fst-analytics`。`Authorization: Bearer` と `X-Firebase-AppCheck` が必要です。Hosting の書き換え先は `asia-northeast1` の `recordFstAnalytics` です。

受理する項目は `appId`、`version`、`build`、`type`、任意の `device` だけです。`uidHash` や日付をクライアントが指定すると拒否します。`appId` は `flight-strip-todo` または `flight-strip-todo-dev` で、`build` の `stable` / `dev` と一致させます。

成功時は `{ "ok": true }` だけです。失敗しても画面のタスク操作は止めません。429 のときは画面が `console.warn` を出し、その操作は集計に入りません。混み合ったときは統計が実際より少なく出ることがある。

回数は利用者 1 分 30 回、日本時間で 1 日 400 回です。全体は 1 分 60 回、1 日 2,000 回です。数値の正本は `functions/cost-guard.js` の `LIMITS.fstAnalytics` です。IP ごとの枠はありません。Hosting の書き換えでは利用者本人の IP を信頼できる形で取れないためです。根拠は [Cloud Functions のヘッダ](https://docs.cloud.google.com/functions/docs/reference/headers)、[Hosting から Functions への書き換え](https://firebase.google.com/docs/hosting/functions)、[Hosting の rewrite 設定](https://firebase.google.com/docs/hosting/full-config#rewrite-functions) です。書き換えが関数へ渡すと書かれているのは、元のパスとクエリだけです。目安箱より広いのは、起動に加えてタスクの作成と完了でも送るためです。予算停止ラッチが閉じているときは記録しません。

## デプロイ順

Functions を先にデプロイし、その後に Firestore Rules と Hosting をデプロイします。対象は `recordFstAnalytics`、`fstFeedbackSubmit`、`updateFstFeedback`、`recordFstDevAdmin`、`recordFstSurvey`、`submitFstSurveyAnswer` です。先に `npm ci --prefix functions` を実行します。`firebase-hosting-merge.yml` と `firebase-rules-deploy.yml` は、この6つが本番で ACTIVE でなければデプロイを止めます。Hosting 用サービスアカウントに `cloudfunctions.functions.get` が無いと、その確認は 403 になり、毎回デプロイが止まります。Rules や Hosting を先に出すと、直書きは拒否され、画面はまだ無い `/api/fst-analytics` を呼びます。回数は利用者ごとと全体だけを数えます。IP は使いません。

2026-10-21 に本番へ POST した `https://cc-dev-ps7.web.app/api/fst-analytics` は 404 でした。関数は未デプロイです。`/api/fst-feedback` も 404 でした。

過去の行はクライアント時計と `v` 付き版数です。新しい行はサーバーの日本時間と、`v` を除いた版数です。同じ人の古い行とは uid ハッシュの計算が違うため、人数の系列は続きません。
