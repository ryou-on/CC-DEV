# CC-DEV 公開前コスト・セキュリティレビュー（2026-10-21）

## 対象

- Firebase project: `cc-dev-ps7`
- Hosting targets: `main`, `ps7-corporate`, `lobby-personal`
- Firestore / Storage Rules
- Cloud Functions（`functions/`）
- Hosting配下の全公開アプリ（`public/`）

## データと信頼境界

- ブラウザからFirestoreへ直接接続するアプリがあり、公開読み取り、共有コード型データ、分析カウンターを扱う。
- `miniMeGenerate` はブラウザからHosting rewrite経由で呼ばれ、Meshyの有料APIへ接続する。
- `anthropicProxy`、`interpreterCall`、`hondokoAnalyze` などはサーバー側シークレットを使うHTTP Functionsである。
- GitHub ActionsとFirebase CLIがHosting、Rules、Functionsを公開する経路である。
- 共有コード、Origin/CORS、URLの非公開性は認証・認可の代替として扱わない。

## 実施済み

- 月額予算をUSD 15（2026-10-20 ECBレート換算で2,372円）、自動停止閾値をUSD 5相当（791円）に確定。
- Cloud Billing予算 `5629c6af-5042-4d68-926e-e76a5b0b4a26` を2,372円へ更新し、791円・50%・80%・100%通知、Pub/Sub通知、project recipientsをAPIで確認。
- 自動停止Workflow `cc-dev-budget-stop` revision `000003-35a` を791円停止へ更新。正常なドライランが`would_stop`、閾値未満・24時間超過通知・不正イベントが`ignored`になることを確認。本番停止は実行していない。
- `cost_guard.py` と単体テストを導入し、全Firebase predeployとデプロイWorkflowへ必須ゲートを追加。
- Firestoreの無条件公開書き込み7件を解消。管理データは許可済みGoogleアカウントへ限定し、共有コードだけで行える削除と分析の直接書き込みを拒否。
- `miniMeGenerate` のクォータ記録失敗を503でfail closedに変更。有料プロバイダが呼ばれない拒否試験を追加。
- 毎回異なるURLを生成する4件の取得を、固定URLとHTTPキャッシュ再検証へ変更。
- Firebase Admin / Functions依存を安全版へ更新し、Admin SDK v14のモジュールAPIへ移行。
- `npm audit` 0件、Functionsテスト13件、コストガードテスト15件の成功を確認。

## 未確認・公開停止条件

- App Check、認証・認可、全体／利用者別クォータ、同時実行上限を全HTTP Functionsで実機確認できていない。
- Firestore公開読み取り、全件取得、リアルタイム購読、公開大容量ファイルの上限・転送量を実機確認できていない。
- 外部プロバイダ呼び出しのtimeout／retry上限を全Functionsで確認できていない。
- Firestore EmulatorによるRules拒否試験が未実施。

上記が完了し、`cost-safety.json` に期限付き証跡と最終ソースSHA256を記録するまでデプロイしない。
