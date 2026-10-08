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

## 回数の初期上限

| サービス | 利用者/日 | 利用者/月 | 全体/日 | 全体/月 |
| --- | ---: | ---: | ---: | ---: |
| 通訳（両アプリ合算） | 12 | 40 | 20 | 80 |
| mini-me生成 | 2 | 6 | 3 | 10 |
| mini-me進捗確認 | 600 | 1800 | 1800 | 6000 |
| Anthropicプロキシ | 20 | 100 | 40 | 200 |
| 本ドコAI解析（全モード合算） | 10 | 40 | 20 | 80 |

日付は日本時間。失敗も1回に数えます。これらは仮の保守的な回数制限であり、円建て予算ではありません。並行トランザクションの再試行や認証、拒否時のFunctions/DB読み取りにも費用は発生し得ます。

## 本番有効化の前提（未確認）

1. 月額予算・停止閾値・通知先を決定し、Firebase/GCPと各AIプロバイダーの課金設定を確認する。予算通知の遅延を考慮し、通知だけを停止機構にしない。
2. App CheckのreCAPTCHA Enterpriseを各Firebase Web Appへ登録し、許可ドメインを設定。公開サイトキーを `public/shared/cost-access-config.json` に設定する（空欄のままではAI機能は動かない）。hondokoと共通ログインは異なるappIdなので両方を確認する。
3. Googleログインを確認し、使用を許可するUIDを管理者が決める。クライアントからcostControls / costCounters / costRealtimeCallsを変更できないRulesを維持する（現状は末尾の拒否規則で拒否）。既存mini-meタスクにはownerUidがないため、管理者が所有者を確認して移行するまで閲覧拒否される。
4. Realtimeのprivateタスク関数をデプロイするためCloud Tasks API、enqueue権限、タスク呼び出しサービスアカウントのInvoker権限を最小権限で設定。切断・再試行・失敗通知をステージングで実証する。`expiryQueueVerified` は実証後だけtrueにする。
5. サーバー管理経路で `costControls/realtime`、`miniGenerate`、`anthropicProxy`、`hondokoAnalyze` を作成。各文書は `{enabled:false, allowedUids:[], expiresAtMs:0}` から開始。試験成功後にUID、有効期限（試作は14日以内）を入れて有効化。miniStatusはminiGenerateの許可設定を共有する。停止時はenabled:false。
6. 既存の匿名Firestore共有の設計を解消する。現状の `/apps`、`/note-analytics`、分析ログなどの公開書き込みはこの変更では未修正。おうち巴寿司の大容量Firestore購読も移行が必要。ログイン・所有者/家族単位の権限と既存データの移行を合わせて設計し、Rulesをエミュレーターで検証する。
7. 大量リクエストをFunctions/Firestoreまで到達させないエッジ対策と、公開静的ファイルの転送対策を確認する。robots.txtだけでは強制停止できない。
8. 本番と一致するランタイム・ステージングで認証/App Check/実クォータ/停止予約を実証し、cost-safety.jsonに予算と検証証跡・ソースハッシュ・期限を記録。残存検出事項がある限り公開不可。

## 限界

Cloud Tasksの実行遅延・IAM障害・OpenAI停止API障害があれば5分ぴったりの切断は保証できません。予約後の失敗監視とサービス停止手順が必要です。通訳クライアントはセッション設定を変更可能なので、max_output_tokensだけで総使用量は制限できません。SDKやHTTPのタイムアウトも、上流で既に受理された処理の課金を取り消しません。

Firestoreの設定変更は新しい呼び出しを止めますが、既に始まった3D生成等は停止しません。全アプリ横断の金額上限、公開読み取り・拒否リクエストの費用まではこのコードだけで保証しません。

## 検証方法

`npm ci --ignore-scripts --prefix functions`、`npm test --prefix functions`、`python3 -m unittest discover -s scripts -p test_cost_guard.py -v`、`npm ci --ignore-scripts --prefix hondoko-src`、`npm run build --prefix hondoko-src`。

テストは外部AIをモックして拒否時の呼び出し0回・競合時上限・DB障害・期限切れ・タスク予約失敗を検証します。本番の認証・課金を伴う通話は実行していません。ブラウザで変更対象の説明/更新履歴を開閉し、初期表示の有料API通信を遮断・計数して確認します。

公式仕様: [App Check](https://firebase.google.com/docs/app-check/custom-resource-backend)、[Cloud Tasks](https://firebase.google.com/docs/functions/task-functions)、[Realtime WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)、[Realtime hangup](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup)。
