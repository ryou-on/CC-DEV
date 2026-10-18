# KIKAKU7 アプリ開発標準仕様書

- 文書ID: `kikaku7-app-development-standard`
- 文書バージョン: `1.1.0`
- 制定日: 2026-09-26
- 対象: CC-DEV 配下で開発・公開するすべてのWebアプリ
- 正本: 本文書、または本文書の内容を取り込んだ共通 `SKILL.md`
- 必須補助標準: `/Users/lobby/.codex/standards/kikaku7-web-application-security-standard.md`

## 1. 目的

本仕様書は、CC-DEVで開発する複数のWebアプリについて、UI、フィードバック収集、アプリ台帳、アクセス集計、変更履歴、AIを用いた開発運用、デプロイおよびセキュリティの標準を統一するものである。

各アプリが個別に同じ機能を作り直すことを避け、以下を実現する。

- 利用者がアプリの使い方と更新内容をすぐ確認できる
- 利用者の意見・不具合報告を共通の「目安箱」に集約できる
- 稼働中アプリ、バージョン、開発状況、利用状況を一元管理できる
- CodexとClaude Codeが同じ正本を参照し、台帳と変更履歴を自動更新できる
- MVPから本番運用、KPI管理、将来のスケールまで段階的に拡張できる

## 2. 適用範囲

### 2.1 対象

- GitHubリポジトリ: `ryou-on/CC-DEV`
- 技術スタック: React、Tailwind CSS、Firebase
- ホスティング: Firebase Hosting（プロジェクト: `CC-DEV`）
- 配置先: `public/<project-name>/`
- 本番URL: `https://cc-dev-ps7.web.app/<project-name>/`
- CI/CD: [GitHub Actions](https://github.com/ryou-on/CC-DEV/actions)

### 2.2 用語

- `appId`: アプリを一意に識別する、原則変更しないID
- `<project-name>`: URLおよび配置ディレクトリで使用するプロジェクト名。原則として`appId`と一致させる
- App Registry: アプリ情報、変更履歴、アクセス情報、Feedbackを管理する中央台帳
- Developer Console: App Registryの情報を閲覧・運用する管理画面
- 目安箱: 全アプリ共通の意見・要望・不具合報告フォーム
- 正本: CodexとClaude Codeの双方が参照する唯一の共通開発ルール

## 3. 基本方針

1. アプリ固有機能と共通機能を分離し、共通UI・目安箱・計測処理は再利用可能なコンポーネントまたは共通パッケージとして実装する。
2. クライアントからFirestoreへの直接書き込みは禁止する。書き込みはCloud Functions等の信頼できるサーバー処理を経由する。
3. 日時はクライアント時刻を信用せず、サーバー側で生成する。
4. バージョンはSemVerに従い、表示バージョン、App Registry、ChangeLog、リリースノートを一致させる。
5. 最初は最小構成で稼働させ、運用データに応じて認証、集計、通知、分析を段階的に拡張する。
6. 利用者向け画面に内部エラー、秘密情報、環境変数、スタックトレースを表示しない。

## 4. 全アプリ共通UI

### 4.1 共通ヘッダー

すべてのアプリに以下を表示する。

- アプリ名またはロゴ
- バージョン番号（例: `v1.2.0`）
- 目安箱を開く導線
- 必要に応じて通信状態またはログイン状態

キーボード操作、スマートフォン表示、スクリーンリーダーを考慮し、クリック可能な要素は`button`または`a`で実装する。フォーカス表示を消してはならない。

### 4.2 取扱説明書モーダル

アプリ名またはロゴのクリックで取扱説明書モーダルを開く。

必須内容は以下とする。

- アプリの目的
- 基本的な使い方
- 主な操作手順
- 注意事項
- 「ホームへ戻る」ボタン
- 「閉じる」ボタン

動作要件は以下とする。

- 「ホームへ戻る」はCC-DEVのホームへ遷移する。遷移先URLは共通設定値で管理する
- 「閉じる」、モーダル外クリック、`Escape`キーで閉じられる。ただし重要な未保存操作がある場合はモーダル外クリックを無効化してよい
- 開いた際にモーダル内へフォーカスを移し、閉じた際は起点へ戻す
- 背景のスクロールを抑止し、`role="dialog"`と適切なラベルを付与する

### 4.3 リリースノートモーダル

ヘッダーのバージョン番号クリックでリリースノートモーダルを開く。

- 新しいバージョンを上に表示する
- 各項目にバージョン、公開日、変更内容を表示する
- 変更内容は利用者が理解できる日本語で記載する
- 破壊的変更、既知の不具合、移行が必要な場合は明示する
- 閉じる操作とアクセシビリティ要件は取扱説明書モーダルと同じとする

リリースノートはコード内の定数、JSON、または中央管理データから取得できるものとする。git pushを伴う変更では、コードと同じコミット内でリリースノートを更新する。

### 4.4 デバッグ用コンソールコピーボタン

エラー発生時またはデバッグ画面に、診断情報をクリップボードへコピーするボタンを設置する。

コピー対象の推奨項目は以下とする。

- `appId`
- `version`
- 現在URL
- ブラウザおよびOSの概略
- 発生日時
- 画面名またはルート
- アプリが管理する診断ログ
- エラーコード

以下はコピーしてはならない。

- パスワード、APIキー、アクセストークン、Cookie
- 氏名、メールアドレス、電話番号などの個人情報
- フォーム入力内容や業務データの全文
- Firebase設定以外の秘密情報、内部スタックトレースのうち機密性がある情報

コピー成功・失敗をトースト等で通知し、失敗時は選択可能なテキストとして表示する。

## 5. 共通目安箱

### 5.1 目的

全アプリから送信された要望、不具合報告、改善案を中央の`Feedback`に集約し、Developer Consoleで一元管理する。

### 5.2 入力UI

必須入力は`message`のみとし、送信前に以下を明示する。

> 氏名、メールアドレス、電話番号、住所、アカウント情報などの個人情報や機密情報は入力しないでください。

必要に応じて種別（要望、不具合、質問、その他）を追加できるが、MVPでは任意とする。

### 5.3 自動付与情報

送信時に以下を付与する。

- `appId`: アプリ設定から取得
- `version`: ビルド時のバージョンから取得
- `url`: 送信画面のURL。ただしクエリ文字列やフラグメントに機密情報が含まれる可能性がある場合は除去する
- `timestamp`: サーバー受信時刻。保存時は`createdAt`として記録する

クライアントから受け取った`appId`、`version`、`url`はサーバー側でも検証し、許可されていない値を保存しない。

### 5.4 送信経路

クライアントからFirestoreへの直接書き込みを禁止する。以下のいずれかを使用する。

- Firebase Callable Function
- HTTPS Cloud Function
- Firebase App Hosting等のサーバーAPI

推奨API例:

```http
POST /api/feedback
Content-Type: application/json

{
  "appId": "sample-app",
  "version": "1.2.0",
  "url": "https://cc-dev-ps7.web.app/sample-app/",
  "message": "操作後に画面が更新されません",
  "type": "bug"
}
```

成功時は内部情報を含まない受付IDを返す。

```json
{
  "ok": true,
  "feedbackId": "generated-id"
}
```

### 5.5 入力検証

サーバー側で必ず以下を実施する。

- `message`: 前後空白を除去し、1〜2,000文字
- `appId`: Appsに登録済みの値のみ許可。推奨形式は`^[a-z0-9][a-z0-9-]{1,63}$`
- `version`: SemVer形式。最大50文字
- `url`: `https`のみ、最大2,048文字。許可ホストを制限する
- `type`: 列挙値を使用する場合は`request | bug | question | other`
- 未知のフィールドは破棄またはエラーとする
- HTMLはテキストとして保存・表示し、実行しない

### 5.6 レート制限とスパム対策

最低限、以下を実装する。

- Firebase App Checkを有効化する
- IPアドレスまたは匿名識別子単位で、例として1分5件・1日50件を上限とする
- 同一内容の短時間連続送信を拒否する
- ハニーポット項目または送信所要時間チェックを設ける
- 制限超過時はHTTP `429`相当を返す
- 必要に応じてreCAPTCHA、禁止語、類似文判定を追加する

IPアドレスを保存する場合は、生値の長期保存を避け、レート制限に必要な短命ハッシュ等に変換する。

### 5.7 ステータス

Feedbackの状態は以下の4種類に固定する。

| 値 | 表示名 | 意味 |
|---|---|---|
| `unreviewed` | 未確認 | まだ担当者が内容を確認していない |
| `reviewed` | 確認済み | 内容を確認したが着手していない |
| `in_progress` | 対応中 | 修正・回答・調査を実施している |
| `resolved` | 対応済み | 必要な対応が完了した |

新規投稿の初期値は`unreviewed`とする。状態変更は管理者のみ可能とする。

## 6. App Registry

### 6.1 コレクション構成

MVPのFirestore構成は以下を標準とする。

```text
apps/{appId}
changelog/{changeId}
analytics/{analyticsId}
feedback/{feedbackId}
```

論理名は`Apps`、`ChangeLog`、`Analytics`、`Feedback`とする。Firestoreの物理コレクション名は小文字複数形で統一する。

### 6.2 Apps

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| `appId` | string | 必須 | 一意で不変のアプリID。ドキュメントIDと一致 |
| `appName` | string | 必須 | 表示名 |
| `description` | string | 必須 | アプリの目的・概要 |
| `phase` | number | 必須 | 0〜5 |
| `version` | string | 必須 | SemVer |
| `status` | string | 必須 | `planning | development | production | maintenance | archived` |
| `developmentAI` | string | 必須 | 主に使用したAI。例: `Codex`、`Claude Code` |
| `model` | string | 必須 | 使用モデル名。判明している正式名を記録 |
| `repository` | string | 必須 | リポジトリURL |
| `productionUrl` | string/null | 任意 | 本番URL。未公開時は`null` |
| `startedAt` | Timestamp | 必須 | 開発開始日時 |
| `updatedAt` | Timestamp | 必須 | 最終更新日時 |

### 6.3 ChangeLog

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| `timestamp` | Timestamp | 必須 | サーバー側の記録日時 |
| `appId` | string | 必須 | 対象アプリID |
| `version` | string | 必須 | 対象バージョン |
| `AI` | string | 必須 | 作業したAIまたは`Human` |
| `model` | string | 必須 | 使用モデル。人手のみなら`N/A` |
| `type` | string | 必須 | `start | feature | fix | refactor | docs | phase | release | maintenance` |
| `summary` | string | 必須 | 利用者・開発者が理解できる変更概要 |
| `commit` | string/null | 任意 | GitコミットSHA。未コミット時は`null`、確定後更新 |

1回の主要変更を1レコードとして記録する。同一変更をAIが再試行した場合、成功した結果を1件にまとめる。

### 6.4 Analytics

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| `date` | string | 必須 | 集計対象日。`YYYY-MM-DD`、Asia/Tokyo基準 |
| `appId` | string | 必須 | 対象アプリID |
| `version` | string | 必須 | 計測時のバージョン |
| `views` | number | 必須 | ページ表示数。0以上の整数 |
| `visitors` | number | 必須 | 重複排除した推定訪問者数。0以上の整数 |

推奨ドキュメントIDは`<date>_<appId>_<version>`とする。`visitors`は個人を特定しない匿名識別に基づく概算値とし、定義をDeveloper Consoleに表示する。

### 6.5 Feedback

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| `feedbackId` | string | 必須 | 自動生成ID。ドキュメントIDと一致 |
| `createdAt` | Timestamp | 必須 | サーバー受信日時 |
| `appId` | string | 必須 | 送信元アプリID |
| `version` | string | 必須 | 送信元バージョン |
| `url` | string | 必須 | 送信元URL |
| `message` | string | 必須 | 1〜2,000文字の本文 |
| `status` | string | 必須 | `unreviewed | reviewed | in_progress | resolved` |

任意拡張として`type`、`updatedAt`、`resolvedAt`、`assignee`、`internalNote`を追加できる。ただし利用者向け本文と管理者用メモは分離する。

### 6.6 推奨インデックス

- Feedback: `status ASC, createdAt DESC`
- Feedback: `appId ASC, createdAt DESC`
- ChangeLog: `appId ASC, timestamp DESC`
- Analytics: `appId ASC, date ASC`
- Apps: `status ASC, updatedAt DESC`

## 7. Developer Console

Developer Consoleは管理者専用とし、Firebase Authenticationと管理者権限で保護する。

### 7.1 ダッシュボード

上部に以下のKPIカードを表示する。

- 稼働アプリ数: `status = production`のApps件数
- 今週総アクセス: 今週分Analyticsの`views`合計
- 未対応Feedback: `unreviewed`、`reviewed`、`in_progress`の合計

「今週」はAsia/Tokyoの月曜日00:00から現在までとする。

### 7.2 アプリ一覧

以下を表示し、`status`、`phase`、`appId`で絞り込めるようにする。

- アプリ名、appId、概要
- Phase、status、version
- developmentAI、model
- productionUrl、repository
- startedAt、updatedAt
- 未対応Feedback件数

### 7.3 アクセス概要と推移

- 日別の`views`と`visitors`
- 全体とアプリ別の切り替え
- 7日、30日、任意期間の切り替え
- バージョン変更時点を識別できる表示
- データ未取得とアクセス0件を区別する

### 7.4 Feedback管理

- 新しい順に一覧表示
- appId、status、期間、type（導入時）で絞り込み
- メッセージ全文、version、url、createdAtを確認
- 4種類のstatusを更新
- URLは許可ホストの検証後にのみリンク化
- CSV出力を追加する場合は個人情報確認と権限制御を行う

### 7.5 変更履歴

- 新しい順にChangeLogを表示
- appId、version、type、AIで絞り込み
- summary、commit、model、timestampを表示
- `commit`が存在する場合は対象リポジトリのコミットへリンクする

## 8. AI運用

### 8.1 共通正本

CodexとClaude Codeは、同一の`SKILL.md`または共通ルールファイルを正本として参照する。内容を各AI用ファイルへ複製する場合も、編集元は正本だけにし、自動同期または参照リンクで差分を防ぐ。

推奨配置例:

```text
docs/kikaku7-app-development-standard.md
.agents/skills/kikaku7-app-standard/SKILL.md
```

`SKILL.md`には本文書の要約だけでなく、少なくとも以下を実行手順として記載する。

- 開発開始時のApps作成
- version変更時のAppsとChangeLog更新
- Phase変更時のAppsとChangeLog更新
- 主要改善時のChangeLog追加
- リリースノート更新と整合性確認
- 検証、commit、push、deployの順序

### 8.2 自動更新トリガー

AIは以下のタイミングでApp Registryを更新する。

| タイミング | Apps | ChangeLog |
|---|---|---|
| 開発開始 | 新規作成 | `type = start`を追加 |
| version変更 | `version`と`updatedAt`を更新 | 対応する変更種別で追加 |
| Phase変更 | `phase`と`updatedAt`を更新 | `type = phase`を追加 |
| 主要改善 | 必要に応じて`updatedAt`等を更新 | `feature`、`fix`等を追加 |
| 本番公開 | `status`、`productionUrl`等を更新 | `type = release`を追加 |

更新処理は管理権限を持つサーバーAPIまたは管理用スクリプトを経由し、AIがブラウザ用Firebase認証情報だけでFirestoreへ直接書き込まない。

### 8.3 更新の原子性と再実行

- Apps更新とChangeLog追加は可能な限りFirestore TransactionまたはBatch Writeで一括処理する
- CIやAIの再実行で重複登録しないよう、`appId + version + commit + type`等の冪等キーを使用する
- commit SHAが未確定の場合は一時IDで作成し、commit後に同じレコードを更新する
- 自動更新に失敗した場合はデプロイ成功として扱わず、ログに原因を残す

## 9. 開発標準

### 9.1 技術スタック

- UI: React
- CSS: Tailwind CSS
- BaaS: Firebase
- Hosting: Firebase Hosting `CC-DEV`
- データベース: Cloud Firestore
- サーバー処理: Cloud Functions for Firebase等
- 認証: Firebase Authentication（管理画面で必須）
- CI/CD: GitHub Actions

ライブラリのバージョンはプロジェクトのロックファイルで固定し、依存関係更新時はビルドと主要動作を再検証する。

### 9.2 配置とURL

```text
public/<project-name>/
https://cc-dev-ps7.web.app/<project-name>/
```

- `<project-name>`は小文字英数字とハイフンを使用する
- SPAの場合は対象パスへのrewriteを設定する
- アセットのベースパスはサブディレクトリ配信を前提にする
- ローカル直下ではなく本番相当のサブパスでも動作確認する

### 9.3 バージョニング

SemVer `MAJOR.MINOR.PATCH`を使用する。

- MAJOR: 互換性のない変更
- MINOR: 後方互換性のある機能追加
- PATCH: 後方互換性のある不具合修正

原則として`package.json`、画面表示、Apps、ChangeLog、リリースノートのバージョンを一致させる。プレリリースは`1.2.0-alpha.1`、`1.2.0-beta.1`等を使用できる。

### 9.4 GitHub Flow

1. 最新の既定ブランチから作業ブランチを作成する
2. 小さく意味のある単位でcommitする
3. Pull Requestを作成し、CIとレビューを通す
4. 既定ブランチへマージする
5. GitHub ActionsでFirebase Hostingへデプロイする
6. 本番URLのスモークテストを行う

直接pushが許容される小規模運用でも、リリースノートとコードは同じcommitに含め、GitHub Actionsの結果を確認する。

### 9.5 Phase定義

| Phase | 名称 | 完了の目安 |
|---:|---|---|
| 0 | 企画・要件定義 | 目的、対象利用者、課題、成功指標、主要要件、非対象を文書化 |
| 1 | MVP / α | 中核ユースケースがローカルまたは限定環境で動作し、主要UIを評価可能 |
| 2 | BaaS結合 / β | Firebase連携、認証・保存・サーバー処理、テスト利用が可能 |
| 3 | 本番 | 本番公開、監視、セキュリティ、バックアップ、利用者向け説明が整備済み |
| 4 | KPI・マネタイズ・保守 | KPIを継続観測し、収益化または運用改善、定期保守を実施 |
| 5 | スケール | 性能、コスト、組織運用、多地域・多言語等の拡張に対応 |

Phaseは品質の成熟度を示す。Phase番号を上げる際は、Apps更新とChangeLog追加を同時に行う。

## 10. MVPから将来拡張

### 10.1 MVP

- 各アプリに共通ヘッダーを実装
- 取扱説明書とリリースノートのモーダルを実装
- 目安箱の送信APIと最低限の検証・レート制限を実装
- Apps、ChangeLog、Analytics、Feedbackを作成
- Developer ConsoleでKPI、一覧、Feedback、変更履歴を閲覧
- 管理者がFeedback statusを変更
- AIが管理スクリプトを介してAppsとChangeLogを更新

### 10.2 次期拡張

- Feedback担当者、タグ、優先度、内部メモ、通知
- Slack、メール、GitHub Issue等との連携
- Analyticsのリアルタイム表示、リテンション、利用機能別集計
- App Registry更新のPull Request・CI連携
- 共通UIパッケージ化と自動アップデート
- 多言語化、権限ロールの細分化、監査ログ

### 10.3 スケール時

- BigQuery等への分析データ連携
- Cloud TasksやPub/Subを用いた非同期処理
- App Registry APIのバージョニング
- データ保持期間と削除ポリシーの自動化
- 複数Firebaseプロジェクト・複数環境への対応

## 11. セキュリティとプライバシー

### 11.1 Firestore Security Rules

- ブラウザから`apps`、`changelog`、`analytics`、`feedback`への書き込みを原則拒否する
- Developer Consoleの読み書きは管理者Custom Claims等で制限する
- 公開アプリが必要とするAppsの公開情報は、公開専用APIまたは公開用ドキュメントに分離する
- Admin SDKはCloud Functions、CIの保護された実行環境、管理スクリプトでのみ使用する

概念例:

```javascript
match /{document=**} {
  allow write: if false;
}

match /feedback/{feedbackId} {
  allow read: if request.auth != null && request.auth.token.admin == true;
}
```

実際のRulesでは各コレクションの読み取り要件も明示し、上位の広い許可規則を置かない。

### 11.2 API保護

- App Checkを検証する
- CORSは本番ドメインと明示した開発元に限定する
- リクエスト本文サイズを制限する
- サーバー側スキーマ検証を行う
- レート制限とタイムアウトを設定する
- エラーレスポンスに内部情報を含めない
- 秘密情報はSecret ManagerまたはGitHub Actions Secretsで管理する

### 11.3 XSS・表示安全性

- Feedback、ChangeLog、アプリ説明をHTMLとして直接挿入しない
- Reactの通常エスケープを利用し、`dangerouslySetInnerHTML`は原則禁止する
- 外部URLはプロトコルと許可ホストを検証する
- `target="_blank"`には`rel="noopener noreferrer"`を付与する

### 11.4 個人情報と保持期間

- 目安箱では個人情報を入力しないよう明示する
- 意図せず入力された個人情報を管理者が削除・マスキングできるようにする
- 生IP、User-Agent全文等を不要に長期保存しない
- FeedbackとAnalyticsの保持期間を運用開始時に決定し、不要データを定期削除する
- バックアップ、エクスポート、ログにも同じ取り扱いを適用する

### 11.5 監査

Apps、Feedback status、管理者権限の変更は、操作者、日時、変更前後を監査ログに残すことを推奨する。監査ログは通常の利用者および一般管理者から変更できない場所に保存する。

## 12. 非機能要件

- レスポンシブ: 幅320px以上の主要画面で横スクロールなく操作できる
- アクセシビリティ: キーボードのみで主要操作ができ、モーダルに適切なフォーカス制御がある
- 性能: 通常回線で主要画面が実用上待たされないこと。大きな依存や画像は遅延読込する
- 可用性: 目安箱API障害時もアプリ本体の主要機能を阻害しない
- 観測性: Functionsのエラー率、レート制限、Feedback送信失敗を確認できる
- 日時: 保存はFirestore Timestamp、日次集計境界はAsia/Tokyoとする
- 互換性: 最新のChrome、Safari、Edgeを主対象とする

## 13. 受入条件

### 13.1 共通UI

- [ ] アプリ名またはロゴのクリックで取扱説明書モーダルが開く
- [ ] モーダルに「ホームへ戻る」と「閉じる」がある
- [ ] `Escape`、フォーカス移動、フォーカス復帰が正しく動作する
- [ ] バージョン番号のクリックで該当アプリのリリースノートが開く
- [ ] デバッグ情報を1操作でコピーでき、秘密情報・個人情報を含まない

### 13.2 目安箱

- [ ] 全アプリから同じ中央Feedbackへ送信される
- [ ] `appId`、`version`、`url`、サーバー時刻が記録される
- [ ] 個人情報を入力しないよう送信前に表示される
- [ ] Firestoreへのクライアント直接書き込みがRulesで拒否される
- [ ] サーバー側で型、長さ、列挙値、URLを検証する
- [ ] レート制限、App Check、重複・スパム対策が有効である
- [ ] 新規Feedbackが`unreviewed`で登録される
- [ ] 管理者だけが4種類のstatusを変更できる

### 13.3 App Registry / Developer Console

- [ ] Apps、ChangeLog、Analytics、Feedbackの必須項目が仕様どおり保存される
- [ ] 稼働アプリ数、今週総アクセス、未対応Feedbackが正しく集計される
- [ ] アプリ一覧、アクセス推移、Feedback、変更履歴を閲覧・絞り込みできる
- [ ] 未認証者と非管理者はDeveloper Consoleへアクセスできない
- [ ] 0件と未取得状態が画面上で区別される

### 13.4 AI運用・開発・デプロイ

- [ ] CodexとClaude Codeが同じ正本を参照する
- [ ] 開発開始、version変更、Phase変更、主要改善でAppsとChangeLogが更新される
- [ ] 再実行しても同一ChangeLogが重複しない
- [ ] 表示バージョン、Apps、ChangeLog、リリースノートが一致する
- [ ] `public/<project-name>/`から本番相当のサブパスで正常動作する
- [ ] GitHub Actionsが成功し、本番URLでスモークテストが完了する
- [ ] リリースノートがコードと同じcommitに含まれる

## 14. テスト方針

- Unit: 入力検証、SemVer検証、URL正規化、レート制限判定、集計関数
- Component: 各モーダル、目安箱、Feedback status変更、エラー表示
- Integration: FunctionsからFirestoreへの登録、Rules拒否、Apps/ChangeLog一括更新
- E2E: アプリからFeedback送信、Developer Consoleで確認・status更新
- Security: 未認証アクセス、権限昇格、XSS文字列、巨大入力、連続送信、不正URL
- Deploy smoke: 本番URL、アセット、サブルート、モーダル、送信API、Consoleログエラー

Firebase Emulator Suiteを使用し、本番データを書き換えずにRulesとFunctionsを検証する。

## 15. 推奨ファイル構成

```text
CC-DEV/
├── .github/
│   └── workflows/
│       ├── test.yml
│       └── deploy-firebase.yml
├── .agents/
│   └── skills/
│       └── kikaku7-app-standard/
│           └── SKILL.md
├── docs/
│   └── kikaku7-app-development-standard.md
├── firebase/
│   ├── firestore.rules
│   └── firestore.indexes.json
├── functions/
│   └── src/
│       ├── feedback/
│       │   ├── submitFeedback.ts
│       │   ├── validation.ts
│       │   └── rateLimit.ts
│       ├── registry/
│       │   └── updateRegistry.ts
│       └── index.ts
├── packages/
│   └── shared-app-ui/
│       └── src/
│           ├── AppHeader.tsx
│           ├── ManualModal.tsx
│           ├── ReleaseNotesModal.tsx
│           ├── FeedbackModal.tsx
│           └── DebugCopyButton.tsx
├── apps/
│   ├── developer-console/
│   └── <project-name>/
│       ├── src/
│       ├── package.json
│       └── README.md
├── public/
│   └── <project-name>/
├── firebase.json
├── package.json
└── README.md
```

既存のCC-DEV構成と異なる場合は、無理に全面移行せず、責務と命名を維持したまま段階的に合わせる。

## 16. 実装順序

1. 正本となる本文書と`SKILL.md`の配置を決める
2. Firestoreの4コレクション、Rules、Indexesを定義する
3. 目安箱Functions、検証、App Check、レート制限を実装する
4. 共通UIコンポーネントを実装する
5. 1つのアプリで共通UIと目安箱をパイロット導入する
6. Developer Consoleの認証、KPI、各一覧を実装する
7. AI用App Registry更新スクリプトと冪等処理を実装する
8. GitHub Actionsでテスト、ビルド、デプロイを自動化する
9. 残りのアプリへ順次適用する
10. Phase 3移行前にセキュリティテストと受入確認を行う

## 17. 完了の定義

本標準の導入完了とは、単に画面を実装した状態ではなく、以下をすべて満たす状態をいう。

- 受入条件に合格している
- Rules、Functions、認証、レート制限を含むセキュリティ対策が有効である
- App Registryと表示内容に不整合がない
- CIが成功し、本番URLでスモークテスト済みである
- リリースノート、ChangeLog、バージョン番号が一致している
- CodexとClaude Codeが同一の正本を参照できる

## 18. Webアプリケーションセキュリティ標準の必須適用

新規作成、改修、レビュー、デプロイを行うすべてのWebアプリ、API、管理画面、外部連携には、`kikaku7-web-application-security-standard.md`を本仕様書とあわせて必ず適用する。

- 開発開始時に、データ、主体・権限、状態・不変条件、信頼境界、Endpoint一覧を整理する
- 実装時に、認証、セッション、オブジェクト単位の認可、入力契約、Injection、XSS、CSRF、File、SSRF、API、ビジネスロジックを該当範囲で確認する
- FirebaseではRules、IAM、App Check、Functions、Storage、Hosting Headerを多層で検証する
- 正常系と負のセキュリティ回帰テストを対にして残す
- デプロイ前に、依存関係、秘密、実行権限、ログ、監視、本番相当レスポンスを確認する
- 高リスクの未確認事項、認証・認可の欠落、秘密漏えい、実行可能なInjection、公開Rulesの過剰許可がある場合はデプロイしない

利用技術の現行仕様が本書の具体例と異なる場合は、公式一次資料、標準、Security Advisoryを優先し、差分と判断理由を記録する。
