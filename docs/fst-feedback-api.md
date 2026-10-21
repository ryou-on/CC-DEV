# Flight Strip 目安箱 API

クライアントから `fst_feedback`、`fst_feedback_meta`、`fstRateLimits` へ書くことはルールで拒否します。受付と状態変更は Cloud Functions だけが Admin SDK で行います。

## 守るデータ

- 本文、件名、任意の返信先メール、送信者 uid、状態
- レート制限用の uid ハッシュ、分・日の回数、直近本文のハッシュ、IP の短命ハッシュ。生 IP は保存しない
- App Check トークンと ID トークンは保存しない

## 主体

| 主体 | できること |
|---|---|
| 未ログイン、匿名、メール未確認 | 何もできない |
| 確認済みの利用者 | 自分の投稿を読む。新規投稿は `unreviewed` だけ |
| hihaho 編集者（確認済みの `@splineglobal.com` または `junpei.omote@gmail.com`） | 一覧を読む。4状態へ更新する |
| 第三者 | 他人の投稿は読めない |
| クライアント | 作成、更新、削除、カウンタ、レート制限文書はすべて拒否 |

## エンドポイント

どちらも `POST`、`Content-Type: application/json`、`Authorization: Bearer`、`X-Firebase-AppCheck` が必要です。Hosting の書き換え先は `asia-northeast1` です。

| Method | URL | 認証 | 副作用 |
|---|---|---|---|
| POST | `/api/fst-feedback` | 確認済みアカウント + App Check | `fst_feedback/FB_xxxx` を `unreviewed` で作成。回数を先に記録し、その後カウンタと本文を保存する |
| POST | `/api/fst-feedback-update` | 確認済み編集者 + App Check | 状態、任意の返信文、`replySent` だけ更新 |

成功時は `{ "ok": true, "fbId": "FB_0001", "feedbackId": "FB_0001", "status": "unreviewed" }` です。失敗時は `{ "error": "コード" }` だけで、本文やスタックは返しません。`Cache-Control: no-store` です。

### 投稿の入力

受理する項目は次だけです。未知の項目、クライアント指定の `status` や `uid` は拒否します。

- `appId`: `flight-strip-todo` または `flight-strip-todo-dev`
- `version`: SemVer。先頭の `v` は付けない。最大50文字
- `url`: `https://cc-dev-ps7.web.app` または `https://cc-dev-ps7.firebaseapp.com`。クエリとフラグメントは捨てる。最大2048文字
- `subject`: 1〜200文字
- `message`: 前後空白を除いて 1〜2,000文字
- `email`: 省略か空文字可。入れる場合は200文字以内
- `type`: 省略可。`request | bug | question | other`
- `build`: `stable` または `dev`。appId と一致させる
- `openedAtMs`: フォームを開いた時刻。送信まで 1.5 秒未満、または 24 時間超は拒否
- `faxNumber`: 空のハニーポット。値があると拒否

状態の初期値はサーバーが `unreviewed` にします。`createdAt` は関数の時刻です。本番の実装は Firestore のサーバー時刻を使います。

### 更新の入力

- `feedbackId`: `FB_` と数字
- `status`: `unreviewed | reviewed | in_progress | resolved`
- `replyText`: 任意、2000文字以内
- `replySent`: 任意の真偽値

`new` と `replied` は受け付けません。既存文書の本文、uid、件名、メールは更新で書き戻せます。

## 回数

利用者ごとに 1 分 5 件、日本時間で 1 日 50 件です。同じ本文のハッシュは 10 分間再送できません。超過は HTTP 429 です。回数の記録に失敗した投稿は保存しません。

有料 API の `costControls` 許可 UID には入れません。目安箱を、課金対象の許可リストと同じ条件にすると、通常の利用者が送れなくなるためです。

## 画面

安定版 `v0.5.17` と開発版 `v0.10.30-dev`、開発版の分析画面は、各 HTML の `submitFstFeedback` / `updateFstFeedback` から上記 API を呼びます。送信前に、個人情報を本文へ書かない案内を出します。返信先メールは任意です。件名は既存の受信箱と返信テンプレートが使うため、標準の必須項目（本文）に加えて必須にしています。

予算停止ラッチ `costControls/global.enabled` が true でないときも送信と状態変更を拒否します。目安箱は有料 API の許可 UID 一覧には入れません。通常の確認済み利用者が送れなくなるためです。

受信箱の状態変更も同じ更新 API です。古い `new` / `replied` は表示上だけ未確認 / 対応済みとして扱います。

## デプロイ順

Functions を先にデプロイし、その後に Firestore Rules と Hosting をデプロイします。対象は `fstFeedbackSubmit`、`updateFstFeedback`、`recordFstAnalytics`、`recordFstDevAdmin`、`recordFstSurvey`、`submitFstSurveyAnswer` です。main の Hosting と Rules のワークフローは、デプロイ前にこの6つが本番で ACTIVE かを確認し、無ければ止めます。確認には `cloudfunctions.functions.get` が必要です。Hosting 用のサービスアカウント `FIREBASE_SERVICE_ACCOUNT_CC_DEV_PS7` にこの権限が無いと、毎回 403 で Hosting と Rules のデプロイが止まります。マージ前にリリースブランチから手動で出します。

```bash
npm ci --prefix functions
npx firebase-tools deploy --only functions:fstFeedbackSubmit,functions:updateFstFeedback,functions:recordFstAnalytics,functions:recordFstDevAdmin,functions:recordFstSurvey,functions:submitFstSurveyAnswer --project cc-dev-ps7
```

ゲートは `state == ACTIVE` と `updateTime` があることを見ます。ログには `updateTime` と、アップロードされた zip の `sourceGeneration` を出します。この generation はリポジトリのファイルハッシュではないので、git の SHA とは照合しません。SHA まで自動で見るには、デプロイ時にその値を関数の環境変数へ入れる必要があります。

この PR では本番へ出していません。2026-10-21 時点の `https://cc-dev-ps7.web.app/api/fst-feedback` と `/api/fst-analytics` はどちらも 404 です。Rules や画面を先に出すと、直書きは拒否され、送信先がありません。
