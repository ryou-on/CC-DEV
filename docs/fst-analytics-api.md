# Flight Strip 利用統計 API

クライアントから `fst_analytics` へ書くことはルールで拒否します。記録は Cloud Functions だけが Admin SDK で行います。読み取りは確認済みの hihaho 編集者だけです。

## 守るデータ

- 種別（`session` / `task_created` / `task_completed`）、版、build、任意の端末種別
- 日本時間の日付・時・曜日。サーバー時計で付ける
- uid の SHA-256 先頭 16 桁。生の uid は保存しない
- レート制限用の短命ハッシュ。生 IP は保存しない

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

成功時は `{ "ok": true }` だけです。失敗しても画面のタスク操作は止めません。

回数は利用者 1 分 30 回、日本時間で 1 日 400 回です。同じ出口 IP の短命ハッシュは 1 分 60 回、1 日 800 回です。生 IP は保存しません。目安箱より広いのは、起動に加えてタスクの作成と完了でも送るためです。予算停止ラッチが閉じているときは記録しません。

## デプロイ順

Functions を先にデプロイし、その後に Firestore Rules と Hosting をデプロイします。対象の関数は `recordFstAnalytics`、`fstFeedbackSubmit`、`updateFstFeedback` です。Rules や Hosting を先に出すと、直書きは拒否され、画面はまだ無い `/api/fst-analytics` を呼びます。

2026-10-21 に本番へ POST した `https://cc-dev-ps7.web.app/api/fst-analytics` は 404 でした。関数は未デプロイです。`/api/fst-feedback` も 404 でした。

過去の行はクライアント時計と `v` 付き版数です。新しい行はサーバーの日本時間と、`v` を除いた版数です。同じ人の古い行とは uid ハッシュの計算が違うため、人数の系列は続きません。
