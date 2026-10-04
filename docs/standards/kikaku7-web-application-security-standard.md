# KIKAKU7 Webアプリケーションセキュリティ標準

- 文書ID: `kikaku7-web-application-security-standard`
- 文書バージョン: `1.0.0`
- 制定日: 2026-10-05
- 対象: KIKAKU7で新規作成・改修・公開・運用するすべてのWebアプリ、API、管理画面、外部連携
- 位置付け: `kikaku7-app-development-standard.md`を補完する必須標準
- 参考資料: 『Webアプリケーションセキュリティ入門（出版用完全版）』、OWASP ASVS、OWASP WSTG、各技術の公式セキュリティ文書

## 1. 適用原則

1. セキュリティは実装後の確認ではなく、要件、設計、実装、テスト、配備、監視、復旧まで継続する。
2. 画面だけでなく、API、管理画面、バッチ、Webhook、アップロード、ダウンロード、外部連携を攻撃面に含める。
3. URL、ヘッダー、Cookie、フォーム、JSON、ファイル、DB保存値、外部API応答、AI出力を信頼しない入力として扱う。
4. ブラウザの表示・入力制限・非表示ボタンをセキュリティ境界にしない。最終判定は信頼できるサーバー側で行う。
5. データをSourceからSinkまで追い、別の意味へ解釈される境界を確認する。
6. 認証、認可、入力検証、出力エンコード、CSRF対策、CORS、CSPを互いの代替としない。
7. 脆弱性名だけでなく、成立条件、到達範囲、実際の影響、修正優先度で判断する。
8. 本書の具体例より、利用時点の公式文書、標準、Security Advisory、使用中バージョンの仕様を優先する。
9. セキュリティ診断は、自分が管理する環境または明示的に許可されたScopeだけで実施する。

## 2. 開発開始時に作るセキュリティ設計

実装前に最低限、次を記録する。

- 守るデータと秘密情報
- 利用者、管理者、サービスアカウント、匿名利用者などの主体
- 「誰が・どのオブジェクトへ・何を・どの状態で行えるか」の認可表
- 正常な状態遷移、不変条件、回数・時間・同時実行の制約
- HTTPエンドポイント一覧: Method、URL、入力、認証要否、必要権限、対象オブジェクト、副作用
- 信頼境界: ブラウザ、Functions/API、Firestore、外部サービス、ストレージ、AIモデル、ツール実行
- データフロー: 入力元、正規化、検証、保存、出力、ログ、削除
- 想定する誤用と攻撃面
- 必要な監査イベント、アラート、保持期間、復旧手順

要件が不明な高リスク操作は、推測で許可せずDeny by Defaultとする。

## 3. 必須実装要件

### 3.1 認証

- 識別、認証、認可を分離する。
- パスワードを平文または復号可能な形式で保存しない。利用環境で推奨されるArgon2id、scrypt、bcrypt等のパスワード向けハッシュを公式設定に従って使用する。
- ログイン、登録、メール変更、パスワードリセット、MFA・Passkey登録解除、復旧経路を同じ認証境界として設計する。
- 認証応答からアカウントの存在を不要に判別できないようにする。ただし内部ログでは原因を区別する。
- オンライン試行にレート制限、段階的遅延、監視を設ける。永久ロックで第三者が利用者を締め出せないようにする。
- リセットトークンやワンタイムコードは十分な強度、短い有効期限、単回使用、目的・利用者への紐付けを持たせる。
- 高リスク操作には最近の認証または追加認証を要求する。
- パスワード、Cookie、セッショントークン、リセットトークン、ワンタイムコードをログへ残さない。

### 3.2 セッションとCookie

- 本番Cookieへ`Secure`、`HttpOnly`、用途に合う`SameSite`を設定する。
- `Domain`は原則設定せず、`Path`とCookie名を必要最小限にする。適用可能なら安全なCookie Prefixを使う。
- 認証成功、権限変更、重要な認証境界でセッションを再生成または旧状態を破棄する。
- アイドル期限と絶対期限を区別し、ログアウト、無効化、資格情報変更、端末別失効の要件を決める。
- クライアント保存型セッションへ秘密情報を入れない。署名は暗号化ではない。
- JWTを採用しても、盗難、失効、鍵管理、期限、CSRF、XSS、Audience・Issuer検証を個別に設計する。

### 3.3 認可

- すべての入口で、Subject、Object、Action、Contextをサーバー側で確認する。
- ログイン済みであることだけでオブジェクト操作を許可しない。
- 所有者ID、組織ID、権限、価格、ロールをクライアント入力から決めない。
- IDOR/BOLAを防ぐため、検索条件自体へ所有関係・公開状態・テナント境界を含める。
- UUIDや推測困難なIDを認可の代わりにしない。
- 水平権限昇格と垂直権限昇格を別々にテストする。
- HTML、API、管理画面、旧バージョン、モバイル用Endpointなど全入口で同じ認可規則を適用する。
- 認可マトリクスを作り、未認証、本人、第三者、管理者、無効化利用者を自動テストする。

### 3.4 入力契約と検証

- サーバー側で型、必須性、長さ、範囲、形式、列挙値、組み合わせ、要素数、ネスト深度、未知フィールドを検証する。
- 未指定、空文字、`null`をAPI契約で区別する。型変換失敗を既定値へ黙って置換しない。
- 有限の選択肢はAllow Listを使う。
- 正規化、検証、無害化、出力エンコードを分離する。自由文の特殊文字を一律禁止してSQLiやXSS対策の代わりにしない。
- Unicode正規化、同名パラメータ、重複JSONキー、Booleanと整数の扱いを用途ごとに決める。
- 全項目の検証が成功するまで、保存、送信、課金、通知などの副作用を起こさない。
- 本文サイズ、配列件数、ページサイズ、処理時間、同時実行数を制限する。

### 3.5 Injection対策

- SQLはバインドパラメータを使用し、文字列連結で組み立てない。列名や並び順などパラメータ化できない部分はAllow Listで選ぶ。
- ORMを使っていても生SQL、`text()`、動的Queryの箇所をレビューする。
- HTML、属性、URL、JavaScript、CSSなど出力先の文脈に合うエンコードを行う。React等の標準エスケープを解除するAPIは原則禁止する。
- 利用者入力をテンプレートSourceとして評価しない。テンプレート名も固定またはAllow Listにする。
- OSコマンドは可能な限り呼ばず標準ライブラリへ置換する。必要時もShellを介さず、実行ファイルと引数を分け、実行ファイル、環境、作業ディレクトリ、時間、出力を制限する。
- 利用者へファイルシステムのパスを指定させない。サーバー生成IDから固定ディレクトリ内の対象へ解決し、解決後の親子関係も確認する。
- XMLではDTD・外部Entity・不要なNetwork Accessを無効化し、Parserの実際の設定をテストする。
- 信頼できないデータを任意コード実行可能な形式でデシリアライズしない。安全なデータ形式と明示Schemaを使う。

### 3.6 XSSとブラウザ境界

- 利用者入力とDB保存値を文字列として扱い、HTMLとして直接挿入しない。
- HTML Sanitizerが必要な場合は実績あるライブラリと明示Policyを使い、Sanitize後の値を再解釈しない。
- DOM XSSのSourceとSinkをレビューし、`innerHTML`、動的Script、危険なURL Schemeを避ける。
- CSPは追加防御として設定し、出力エンコードの代わりにしない。可能な限りNonce/Hash方式を使い、`unsafe-inline`や過度に広いSourceを避ける。
- 外部リンクのProtocolと必要に応じてHostを検証し、`target="_blank"`には`rel="noopener noreferrer"`を付ける。

### 3.7 CSRF、Same-Origin Policy、CORS

- 状態変更にGETを使わない。
- Cookie認証の状態変更処理へCSRFトークン等の対策を共通適用する。`SameSite`は追加防御として使う。
- Origin/Referer検証を使う場合は、完全なOriginと信頼できるProxy構成を前提にする。
- CORSを認証・認可・CSRF対策の代わりにしない。
- 許可Originは完全一致のAllow Listにし、Credential、Method、Header、公開Headerを必要最小限にする。
- 動的Origin応答には`Vary: Origin`を設定する。WildcardとCredentialを組み合わせない。

### 3.8 ファイルアップロードとダウンロード

- `accept`、拡張子、利用者のファイル名、Content-Typeを信用しない。
- 用途に必要な形式だけをAllow List化し、実データを検査する。可能なら画像等を安全な形式へ再生成する。
- 保存名はサーバー側で生成し、実行可能なWebルート外へ保存する。
- 受信バイト数、展開後サイズ、画像寸法、件数、利用者Quotaを個別に制限する。
- ZIP等では各EntryのPath、展開先、件数、圧縮率を検証する。
- 能動的内容は本体と同一Originで配信しない。配信時にも認可、Content-Type、`Content-Disposition`、`nosniff`、Cache方針を適用する。
- アップロード、置換、削除の途中失敗でDBと実体が不整合にならないようにする。

### 3.9 SSRFと外部接続

- 任意URL取得機能を避け、可能ならサービスIDや固定Endpointを指定させる。
- Scheme、Host、PortをParse後の値でAllow List検証する。
- Loopback、Private、Link-local、Metadata、IPv6、別表記、DNS再解決を考慮する。
- Redirect先を新しい接続先として再検証するか、Redirectを禁止する。
- 接続・読取Timeout、応答サイズ、Method、Header、Credential、Redirect回数を制限する。
- Network Egressを必要先だけに制限し、アプリケーション検証と多層化する。
- 外部応答をそのまま利用者へ返さず、必要項目だけを抽出する。

### 3.10 APIとMass Assignment

- 入力DTOと出力DTOを分離し、DBモデルをそのままBindまたは返却しない。
- 受理するFieldと返すFieldをAllow Listで明示する。
- オブジェクト認可と機能認可を各Endpointで行う。
- ページング、件数、処理量、Rate Limit、Timeout、冪等性を設計する。
- APIバージョンと廃止Endpointの台帳を維持し、古い入口も同じ基準で保護または停止する。
- 過剰なプロパティ、別利用者ID、過大件数、古いVersionを負のテストへ含める。

### 3.11 ビジネスロジックと競合

- 常に成立すべき不変条件と許可された状態遷移を先に定義する。
- 実行者、対象、現在状態、関連状態を、最終的に副作用を起こす処理で再確認する。
- 価格、割引、所有者、残高、権限などサーバーで計算できる値をクライアントに決めさせない。
- Transaction、条件付き更新、一意制約、外部キー、冪等キーで同時実行と再送に耐える。
- 手順省略、順序変更、再送、期限切れ、別利用者、同時実行をテストする。

### 3.12 エラー、情報漏えい、キャッシュ

- 外部応答には適切なStatus、一般化したエラーコード、問い合わせ用Request IDだけを返す。
- Stack Trace、内部Path、SQL、秘密、環境変数、不要なVersion、Debug Consoleを公開しない。
- 詳細を内部ログへ記録する場合も秘密情報と個人情報を除外する。
- HTML、JSON、JavaScript、Header、Redirect、静的ファイル、Source Map、画像Metadata、Cacheを情報流出経路として確認する。
- 認証済み・機密応答に適切な`Cache-Control`を設定する。
- API応答は返してよいFieldのAllow Listを回帰テストで固定する。

### 3.13 HTTPセキュリティヘッダー

アプリの構成と対象ブラウザに合わせて、最終レスポンスで次を確認する。

- Content Security Policy
- `frame-ancestors`等のClickjacking対策
- `X-Content-Type-Options: nosniff`
- Referrer Policy
- Permissions Policy
- HTTPS本番環境でのHSTS
- 機密性に応じたCache方針

ヘッダーを多く付けること自体を目的にせず、実際に届く値とブラウザ動作を確認する。

### 3.14 依存関係とサプライチェーン

- 直接・間接依存と導入理由を把握し、Lock FileをCommitする。
- 依存更新をReview、Build、Test、Security Auditへ通す。Version固定を更新停止にしない。
- 可能な環境では配布物Hash、SBOM、署名・Provenanceを利用する。
- Package名の取り違え、Dependency Confusion、Install Script、Source Build、CI Actionを攻撃面として扱う。
- 開発・Test用依存と本番Artifactを分離し、不要なCompiler、Shell、Test Code、秘密を本番へ含めない。
- Advisoryを受け取り、影響確認、修正、配備まで追跡する。

### 3.15 デプロイと実行環境

- 本番はTLSを使用し、信頼するHostを制限する。
- Reverse Proxy Headerは実際に信頼できるProxyの段数・送信元だけを信頼する。
- 秘密情報をSource、Image、公開Bundleへ埋め込まず、Secret Manager等で管理・Rotationする。
- Containerは非Root、最小権限、不要Capability削除、権限昇格禁止、可能ならRead-only Rootで実行する。
- Docker Socket、HostのHome、Repository、不要なCredentialをContainerへMountしない。
- CPU、Memory、PID、本文サイズ、Timeout、同時実行数を制限する。
- Local、Preview、本番の設定差を一覧化し、本番相当のCookie、CORS、Header、Rulesを配備後にも確認する。
- Schema Migration、Backup、Restore、Rollback、Health Check、外形監視を用意する。

### 3.16 ログ、監視、監査

- Logging、Monitoring、Alert、Incident Responseを別々に設計する。
- 構造化イベントへ、時刻、サービス、Actor、Action、Target、Result、検証済みRequest IDを記録する。
- 認証成功・失敗、試行制限、認可拒否、権限変更、秘密変更、重要な管理操作を監査する。
- パスワード、Token、Cookie、Authorization Header、Request/Response本文全文を保存しない。
- 利用者入力でログ形式を壊せないSerializerを使う。
- ログをアプリ本体から分離し、閲覧・変更・削除権限、保持期間、時刻同期、容量枯渇を管理する。
- 単発イベントだけでなく、頻度、対象数、連続したイベントを組み合わせてAlertする。
- 予防Controlの不備と検知Controlの不備を分けて扱う。

### 3.17 AI機能を含むアプリ

- Prompt、取得文書、Model Output、Tool Call、外部Connectorを新しい信頼境界として扱う。
- Model OutputをHTML、SQL、Shell、URL、権限判断として未検証で実行しない。
- Toolは最小権限、対象Scope、入力Schema、回数・費用上限、Timeoutを持たせる。
- 高影響操作はサーバー側Policyと必要な人間確認を経由させる。
- Prompt Injectionで秘密、別利用者データ、内部指示、外部送信が漏れないようデータと権限を分離する。
- AI生成コードも人手のコードと同じRequirement、Review、Testを通す。

## 4. Firebase / CC-DEVへの適用

- Firestore RulesはDeny by Defaultとし、認証済みであることだけで許可しない。所有者、Role、App ID、Field、状態遷移まで検証する。
- Cloud Functions等の信頼できるサーバー処理で重要な書き込みを行い、Admin SDK利用箇所を最小化する。
- Firebase AuthenticationのCustom Claimsは管理経路を保護し、Claim変更後のToken更新・失効を考慮する。
- App CheckはBot対策の一層として使用し、認証・認可・入力検証の代わりにしない。
- Firebase HostingのHeadersとRewriteを本番URLで検証する。
- Firestore、Storage、FunctionsのRules/PolicyをEmulatorで正・負の両方からテストする。
- クライアントに含まれるFirebase設定値と、秘密にすべきService Account KeyやAPI Secretを区別する。
- Secret Manager、最小権限IAM、環境別Project/Config、Audit Log、Budget Alertを利用する。

## 5. 必須テスト

### 5.1 テストの考え方

- 正常なRequestを基準として保存し、一度に一条件だけ変える。
- 攻撃が拒否されたことと、正当な機能が残ったことを対にして確認する。
- HTTP応答だけでなく、DB、Storage、通知、課金、ログ等の副作用を確認する。
- 「確認できなかった」と「存在しない」を区別する。
- 再現Requestを自動回帰テストへ変換する。

### 5.2 最低限のテスト対象

- 認証: 正常、誤資格情報、列挙差、Rate Limit、Reset Tokenの期限・再利用
- セッション: Cookie属性、認証境界、期限、Logout、失効、重要操作の再認証
- 認可: 未認証、本人、第三者、管理者、別Tenant、無効化利用者
- 入力: 境界値、型違い、未知Field、過大Body、正常な特殊文字
- Injection: SQL、HTML/DOM、Path、Shell、Template、SSRF、XML/Deserializeの各Sink
- CSRF/CORS: 状態変更、Origin違い、Credential、Preflight
- File: 偽装形式、巨大・展開後巨大、Active Content、権限、配信Header
- API: Mass Assignment、過剰応答、BOLA、Page Size、旧Version、再送
- Business Logic: 手順省略、順序変更、期限切れ、同時実行、二重送信
- Deploy: TLS、Host、Proxy、Headers、Secrets、Rules、非Root、Resource Limit、Health Check
- Logging: 必要Event、秘密非記録、改行等のLog Injection、Alert、容量障害

## 6. 診断・報告

- 診断前に対象URL、権限、禁止操作、中止条件、データ取扱いを合意する。
- 証跡は正常時と問題発生時を比較できる最小限にし、秘密情報・個人情報をMaskする。
- Findingは、ID、Status、結果を表すTitle、再現条件、最短手順、観測事実、判断、確認済み影響、原因、対策、Severity、修正確認を含める。
- 観測事実、推測、未確認事項を分ける。
- 対策は根本対策、追加防御、一時回避策に分ける。
- Severityは攻撃条件と影響で評価し、修正Priorityとは分ける。
- 報告書と診断データ自体を機密情報として保護する。

## 7. 完了の定義

次を満たさないWebアプリ変更は完了扱いにしない。

- [ ] 対象機能のデータ、主体・権限、状態・不変条件が明文化されている
- [ ] 新規・変更Endpointが台帳に反映されている
- [ ] 入力Schema、認証、オブジェクト単位の認可、出力Fieldが明示されている
- [ ] 状態変更にCSRF、再送、競合、冪等性の検討がある
- [ ] Injection、XSS、Path、File、SSRF等、到達するSinkに固有の対策がある
- [ ] 秘密、Cookie、CORS、CSP、Security Header、Cacheの設定が環境に合っている
- [ ] 依存関係、Rules/IAM、Secret、Runtime権限が最小化されている
- [ ] セキュリティイベント、監視、アラート、保持期間が必要範囲で実装されている
- [ ] 正常系と負のセキュリティ回帰テストが成功している
- [ ] Build、Lint、Test、Rules Test、Deploy Smokeにエラーがない
- [ ] 本番相当URLで最終レスポンスとブラウザ動作を確認している
- [ ] 未実装・未確認事項とResidual Riskが`summary.md`等へ明記されている

高リスクの未確認事項、認証・認可の欠落、秘密漏えい、実行可能なInjection、公開Rulesの過剰許可がある場合は、デプロイを停止する。

## 8. 継続更新

- 新しいFramework、Cloud Service、AI機能を採用するときは、公式Security DocumentationとAdvisoryを確認する。
- OWASP Top 10はリスク把握の入口、WSTGは試験方法、ASVSは要件と受入基準として使い分ける。
- 繰り返し判定できる規則はLint、Unit Test、Integration Test、CIへ移す。
- インシデント、診断結果、依存更新で得た知見を本標準と回帰テストへ反映する。
