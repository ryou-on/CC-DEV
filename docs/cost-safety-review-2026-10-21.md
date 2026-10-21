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

- `cost_guard.py` と単体テストを導入し、全Firebase predeployとデプロイWorkflowへ必須ゲートを追加。
- Firestoreの無条件公開書き込み7件を解消。管理データは許可済みGoogleアカウントへ限定し、共有コードだけで行える削除と分析の直接書き込みを拒否。
- `miniMeGenerate` のクォータ記録失敗を503でfail closedに変更。有料プロバイダが呼ばれない拒否試験を追加。
- 毎回異なるURLを生成する4件の取得を、固定URLとHTTPキャッシュ再検証へ変更。
- Firebase Admin / Functions依存を安全版へ更新し、Admin SDK v14のモジュールAPIへ移行。
- `npm audit` 0件、Functionsテスト13件、コストガードテスト15件の成功を確認。

## 未確認・公開停止条件

- 月額予算と停止閾値の入力が逆転しており、`stopThreshold < monthlyBudget` を満たす確定値がない。
- Cloud Billing予算通知と自動停止の実設定証跡がない。
- App Check、認証・認可、全体／利用者別クォータ、同時実行上限を全HTTP Functionsで実機確認できていない。
- Firestore公開読み取り、全件取得、リアルタイム購読、公開大容量ファイルの上限・転送量を実機確認できていない。
- 外部プロバイダ呼び出しのtimeout／retry上限を全Functionsで確認できていない。
- Firestore EmulatorによるRules拒否試験が未実施。

上記が完了し、`cost-safety.json` に期限付き証跡と最終ソースSHA256を記録するまでデプロイしない。
