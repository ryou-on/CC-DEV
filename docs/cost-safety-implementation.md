# 課金リスク改善（2026-10-05）

この変更は実装・検証用です。本番環境へは未反映です。初期設定では有料処理を停止します。

## 実装

- 5つのHTTP関数（realtimeToken / interpreterCall / miniMeGenerate / anthropicProxy / hondokoAnalyze）でFirebase IDトークン、確認済みアカウント、App Checkを要求。
- 管理者専用 `costControls/{service}` の許可UID・有効期限・enabledを検証。設定なし・期限切れ・DB障害は拒否。
- 同じFirestoreトランザクションで利用者の分/日/月と全体の日/月の5枠を予約。外部APIの失敗・タイムアウトでも枠を戻さず、未知の結果で再課金しない。クライアントへの自動再試行も抑制。
- サービス単位のモデル・入力量・出力量・外部APIタイムアウトを制限。Functionsの同時起動数も縮小。
- RealtimeはSDP返却前にCloud Tasksへ5分後のサーバー切断を予約。予約失敗時は直ちにhangupを試み、SDPを返さない。ブラウザにも停止タイマーを実装。
- mini-meは初期表示の疎通APIを削除。生成結果を所有者に限定。進捗ポーリングは10秒ごとで、完成後の外部問い合わせ・タスク更新を省略。確認エラーではポーリング停止。
- 公開ナレッジJSONのDate.nowキャッシュ破棄を削除。静的HTMLに共有キャッシュ300秒、KB JSONに3600秒を設定。個人データ/APIは共有キャッシュしない。
- assetServeはGET/HEAD限定、Storageメタデータ照会を1回に減らしETag/304とCDNキャッシュを追加。
- 全6対象のFirebase predeploy、公開CIに検査を接続。未確認のまま検査を通す例外は追加していない。
- Flight Strip の目安箱は有料APIではない。`submitFstFeedback` / `updateFstFeedback` が App Check と確認済みアカウントを要求し、クライアントの Firestore 直書きは拒否する。回数は利用者あたり1分5件・1日50件で、失敗時は保存しない。詳細は `docs/fst-feedback-api.md`。

## 回数の初期上限

| サービス | 利用者/日 | 利用者/月 | 全体/日 | 全体/月 |
| --- | ---: | ---: | ---: | ---: |
| 通訳（両アプリ合算） | 12 | 40 | 20 | 80 |
| mini-me生成 | 2 | 6 | 3 | 10 |
| mini-me進捗確認 | 600 | 1800 | 1800 | 6000 |
| Anthropicプロキシ | 20 | 100 | 40 | 200 |
| 本ドコAI解析（全モード合算） | 10 | 40 | 20 | 80 |

目安箱 `fstFeedbackSubmit`（`/api/fst-feedback`）と `updateFstFeedback`（`/api/fst-feedback-update`）は有料 API を呼ばない。`authorize()` のバイト上限（16384）と App Check・確認済みアカウントだけを使い、`reserve()` は呼ばない。そのため `costControls/fstFeedback` の許可 UID は不要。送信と状態変更の直前に `costControls/global.enabled === true` を読む。文書がない、または false なら `SERVICE_PAUSED` で拒否する（予算 800 円の停止ラッチと同じゲート）。回数は `fstRateLimits` にサーバーだけが書く。数値の正本は `functions/cost-guard.js` の `LIMITS` で、ハンドラは `rateOf()` で読む。利用者は 1 分 5 回・日本時間で 1 日 50 回、同じ内容は 10 分再送不可。全体は 1 分 10 回・1 日 200 回。IP は数えない。状態変更は編集者のみで、クライアントからの作成・更新・削除はルールで拒否する。利用者の上限は成功ではなく試した回数である。重い処理の前に利用者の文書を1つだけ読み、分と日をその1文書で数える。409、404、400、同じ内容の再送も1回として数える。上限に達していたら待ちに入れて、重い処理はしない。全体のカウンターは通ったときだけ、重いトランザクションの中で書く。

利用統計 `recordFstAnalytics`（`/api/fst-analytics`）も有料 API を呼ばず、`reserve()` は呼ばない。確認済みアカウントと App Check が必要で、`costControls/global.enabled` が true でないと拒否する。回数は利用者 1 分 30 回・1 日 400 回。全体は 1 分 60 回・1 日 2,000 回。数値は `LIMITS.fstAnalytics` だけに置く。目安箱の 1 分 5 回より広いのは、タスク作成と完了のたびに記録するため。日付・時刻はサーバーの日本時間、利用者識別子は uid のハッシュだけ。生 uid は保存しない。IP は数えない。クライアントからの作成・更新・削除はルールで拒否する。429 と、503 の `COST_GUARD_UNAVAILABLE` のときは `console.warn` を出し、その操作は集計に入れない。`SERVICE_PAUSED` は別である。混み合ったときは統計が実際より少なく出ることがある。上限で断ったあとの待ちは、1台のインスタンスの中だけで効く。対象6関数の maxInstances は 1。429 と 503 は Retry-After を返し、画面はその秒数だけ送信ボタンを止める。

開発版の告知・強制更新（`recordFstDevAdmin`、`/api/fst-admin`）とアンケートの作成・公開（`recordFstSurvey`、`/api/fst-survey`）は編集者だけが書けます。回答（`submitFstSurveyAnswer`、`/api/fst-survey-answer`）は確認済みアカウントが書けます。回答の `uidHash` は認証 uid の SHA-256 先頭16桁で、クライアントが指定した値は未知の項目として拒否します。文書 ID は `{surveyId}_{uidHash}` です。同じ人が二度目を送ると 409 で、先の回答は残ります。`btoa` 方式は使いません。クライアントからの作成・更新・削除はルールで拒否します。読み取りは、告知とアンケートが確認済みアカウント、回答が編集者だけです。

アンケート ID は、内海課長の指示で、既存の文書を別 ID へ移さない。Firestore の自動 ID（英数字20文字）と、新しい `SV_` 付き ID の両方を受けます。使える文字は英数字、`_`、`-` で、長さは1文字から128文字です。`/` や予約名 `__*__` は拒否します。選択式の回答は保存済みの選択肢と一致する必要があります。強制更新の `minVersion` は SemVer で、前後の空白を除いて40文字までです。先頭の `v` は外して保存します。

IP ごとの上限は置きません。Firebase Hosting の書き換えは、関数へ元のパスとクエリを渡すことだけを文書化しており、利用者本人の IP を信頼できるヘッダとしては書いていません。Cloud Functions のヘッダ説明は `X-Forwarded-For` の先頭を「おおむねクライアント」としていますが、その先頭は呼び出し側が付けられます。末尾は Hosting の出口になり、利用者全員で同じ枠を共有します。回数は利用者ごとと全体上限です。根拠は [Cloud Functions のヘッダ](https://docs.cloud.google.com/functions/docs/reference/headers)、[Hosting から Functions への書き換え](https://firebase.google.com/docs/hosting/functions)、[Hosting の rewrite 設定](https://firebase.google.com/docs/hosting/full-config#rewrite-functions) です。書き換えが関数へ渡すと書かれているのは、元のパスとクエリだけです。告知と強制更新の全体上限は 1 分 20 回・1 日 500 回です。アンケートの作成と公開切替は別枠で、それぞれ 1 分 10 回・1 日 250 回です。回答は 1 分 60 回・1 日 500 回です。同じ回答の再送は、全体の枠を消費する前に 409 になります。利用者の枠は1回消費します。

デプロイ順は Functions を先、その後に Firestore Rules と Hosting です。手動デプロイの前に `npm ci --prefix functions` を実行します。デプロイ時に関数はラベル `fst-rev` へ、対象ソースの SHA-256 先頭32桁を書きます。`firebase-hosting-merge.yml` と `firebase-rules-deploy.yml` は、6関数が本番で ACTIVE であり、`updateTime` があり、`fst-rev` が今のチェックアウトと一致するかを確認します。古い版のラベルでは止まります。Hosting 用サービスアカウントに `cloudfunctions.functions.get` が無いと 403 で毎回止まります。zip の中身そのものは比較しません。API が返す generation はリポジトリのファイルハッシュではなく、zip の取得には別の権限が要るためです。本番の `/api/fst-analytics` は 2026-10-21 時点で 404 です。この作業では関数をデプロイしていません。

編集者判定の正本は `functions/editor-policy.json`。Functions と Rules はどちらもメールの前後空白を除いて小文字比較します。同じケースを両方に流す試験は `functions/editor-policy-cases.json` とエミュレーターです。

日付は日本時間。失敗も1回に数えます。これらは仮の保守的な回数制限であり、円建て予算ではありません。並行トランザクションの再試行や認証、拒否時のFunctions/DB読み取りにも費用は発生し得ます。

## 本番有効化の前提（未確認）

1. 月額予算・停止閾値・通知先を決定し、Firebase/GCPと各AIプロバイダーの課金設定を確認する。予算通知の遅延を考慮し、通知だけを停止機構にしない。
2. App CheckのreCAPTCHA Enterpriseを各Firebase Web Appへ登録し、許可ドメインを設定。公開サイトキーを `public/shared/cost-access-config.json` に設定する（空欄のままではAI機能は動かない）。hondokoと共通ログインは異なるappIdなので両方を確認する。
3. Googleログインを確認し、使用を許可するUIDを管理者が決める。クライアントからcostControls / costCounters / costRealtimeCallsを変更できないRulesを維持する（現状は末尾の拒否規則で拒否）。既存mini-meタスクにはownerUidがないため、管理者が所有者を確認して移行するまで閲覧拒否される。
4. Realtimeのprivateタスク関数をデプロイするためCloud Tasks API、enqueue権限、タスク呼び出しサービスアカウントのInvoker権限を最小権限で設定。切断・再試行・失敗通知をステージングで実証する。`expiryQueueVerified` は実証後だけtrueにする。
5. サーバー管理経路で `costControls/realtime`、`miniGenerate`、`anthropicProxy`、`hondokoAnalyze` を作成。各文書は `{enabled:false, allowedUids:[], expiresAtMs:0}` から開始。試験成功後にUID、有効期限（試作は14日以内）を入れて有効化。miniStatusはminiGenerateの許可設定を共有する。停止時はenabled:false。
6. 既存の匿名Firestore共有は、このブランチのルールで認証と accessGrants に限定した。`apps`、note-analytics の snapshots、おうち巴寿司の assets の削除は未ログインでは拒否する。影響と案内は `docs/anonymous-user-impact.md`。本番ルールは未公開。
7. 大量リクエストをFunctions/Firestoreまで到達させないエッジ対策と、公開静的ファイルの転送対策を確認する。robots.txtだけでは強制停止できない。
8. 本番と一致するランタイム・ステージングで認証/App Check/実クォータ/停止予約を実証し、cost-safety.jsonに予算と検証証跡・ソースハッシュ・期限を記録。残存検出事項がある限り公開不可。

## 限界

Cloud Tasksの実行遅延・IAM障害・OpenAI停止API障害があれば5分ぴったりの切断は保証できません。予約後の失敗監視とサービス停止手順が必要です。通訳クライアントはセッション設定を変更可能なので、max_output_tokensだけで総使用量は制限できません。SDKやHTTPのタイムアウトも、上流で既に受理された処理の課金を取り消しません。

Firestoreの設定変更は新しい呼び出しを止めますが、既に始まった3D生成等は停止しません。全アプリ横断の金額上限、公開読み取り・拒否リクエストの費用まではこのコードだけで保証しません。

## 検証方法

`npm ci --ignore-scripts --prefix functions`、`npm test --prefix functions`、`python3 -m unittest discover -s scripts -p test_cost_guard.py -v`、`npm ci --ignore-scripts --prefix hondoko-src`、`npm run build --prefix hondoko-src`。

テストは外部AIをモックして拒否時の呼び出し0回・競合時上限・DB障害・期限切れ・タスク予約失敗を検証します。本番の認証・課金を伴う通話は実行していません。ブラウザで変更対象の説明/更新履歴を開閉し、初期表示の有料API通信を遮断・計数して確認します。

公式仕様: [App Check](https://firebase.google.com/docs/app-check/custom-resource-backend)、[Cloud Tasks](https://firebase.google.com/docs/functions/task-functions)、[Realtime WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)、[Realtime hangup](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup)。
