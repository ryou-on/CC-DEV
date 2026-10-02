# 発話分析ダッシュボード v0.1.0

Zoomの参加者別ローカル録音を、発話量と発言内容から振り返るPhase 1 MVPです。

## すぐに動かす（APIキー不要）

Node.js 22.12以上、npm、FFmpeg/ffprobeが必要です。まずこのREADMEがあるディレクトリで実行します。

```bash
npm ci
cp .env.example .env
npm run server
```

別のターミナルで同じディレクトリに移動して実行します。

```bash
npm run dev
```

http://127.0.0.1:5173/speech-dashboard/ を開きます。最初は架空データによるサンプル画面です。「実録音」は別のデータ集合です。

MacでFFmpeg未導入の場合:

```bash
brew install ffmpeg
```

実音声はAPIキーがなくても非無音区間から発話量を推定し、`.local-data/recordings.json`へ保存します。文字起こしと分類は「未分析」になります。音声入力を架空の文字起こしで埋める処理はありません。再起動後も「実録音」から結果を読み込めます。

## APIを接続する

`.env`のサーバー専用値に設定し、サーバーを再起動してください。

```dotenv
APP_MODE=local
OPENAI_API_KEY=ここにOpenAIのキー
JEV_API_KEY=ここにTypeSafeのキー
JEV_MODEL=jev-latest
```

キーに`VITE_`接頭辞を付けないでください。`.env`はGit/コンテナへ入りません。キーの入力欄はブラウザに設けていません。秘密情報はサーバーでのみ読みます。

- OpenAI: `whisper-1` / `verbose_json` / segmentタイムスタンプ。300秒のPCMチャンクへ分割。
- Jev: `https://api.typesafe.ai/v1/systemone`。Choice（9分類）、Score（0〜4）、Noul（質問確率）を同時に送信。
- 部分失敗: 発話量と取得できた文字起こしを保存し、未取得の分析はnull。部分完了の区間を再アップロードすると同じ結果IDで再処理します。完了済みの同一入力は再課金しません。
- `jev-latest`の解決後モデル名とルーブリック版を保存。評価を再現したい運用ではJEV_MODELを提供元の固定モデルIDへ変更してください。

## 取り込み手順と定義

1. Zoomで参加者別に保存した音声をドロップ。1ファイル20MB、最大20区間をキューへ追加できます。
2. ファイルごとに参加者IDを修正。日をまたいでも同一人物は同じIDにします。
3. Day / セッションID / MainまたはRoom / Room名を指定。全体会→ブレイクアウトの切替は「区間を追加」で同じファイルを分けます。
4. 開始秒・終了秒は**元音声上**の位置。1区間は10分以内。終了空欄は音声末尾。
5. 表示時刻は「元音声の秒数＋補正秒」。例えば録音100秒がワーク開始0秒なら補正は`-100`。
6. Mainの重複録音は代表1本のみ選択。異なる録音機の自動重複統合は未実装です。
7. 「分析して保存」。API設定に応じて完了/部分完了を表示。処理中はブラウザを開いておいてください。

発話時間はFFmpeg非無音区間の合計（-35dB、無音0.35秒）。0.7秒以内の間隔をつないだものを1発言と数え、間の無音自体は発話秒数に加えません。発話率は選択日・ルームにおける**全参加者の発話時間**が分母です。参加者だけを絞っても分母は変わりません。同時発話はそれぞれに計上します。平均は総発話秒数÷回数。音声のない参加者は録音を取り込むまで集計対象になりません。

雑音、相づち、エコー、Zoom側の音声処理により誤差が出ます。文字起こしの区間は最大重複の発言に1度だけ割り当てるため、境界をまたぐ長い文では分割が不正確な場合があります。Jevの結果は要確認の推定で、主体性は人物評価ではありません。原音再生や手動修正は次期機能です。

## 構成

```text
SPEC.md                    Phase 1仕様・受入条件
src/App.jsx                React画面（主画面を集約）
src/metrics.js             集計・タイムラインの純粋関数
src/api.js                 Firebase認証・App Check・サーバー通信
src/meta.js                バージョン・リリースノートの正本
server/app.js              認証・アップロード・検証・目安箱API
server/pipeline.js         FFmpeg・文字起こし・分類パイプライン
server/providers.js        OpenAI / Jevの固定エンドポイントと応答検証
server/store.js            ローカル / Firestore保存
scripts/registry.js        Apps・ChangeLogの管理者用一括更新
deploy/                    Hosting rewrite・Rulesの結合用例
public/speech-dashboard/   ビルド済み公開ファイル（サーバーコードは含めない）
tests/                     集計・API・実FFmpeg・ブラウザテスト
```

## ローカル検証

```bash
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

ブラウザテストはビルド済みサイトの`/speech-dashboard/`を使用し、4173/8080番ポートでサーバーを自動起動します。既存サーバーがあると再利用するため、異なる設定のサーバーは停止してください。APIテストは一時ディレクトリのみを使用。UIテストの疑似アップロードはテスト内でAPIを置換し、本番や通常のローカル保存先へ書きません。スクリーンショットは`test-results/`へ出ます。

```bash
npm run preview
```

ビルド後の http://127.0.0.1:4173/speech-dashboard/ でも画面を確認できます。録音を処理する場合は8080番のサーバーも起動してください。

## CC-DEVへ配置

このディレクトリをリポジトリの`speech-dashboard-src/`として置き、生成した`public/speech-dashboard/`の中身だけをリポジトリの`public/speech-dashboard/`へコピーします。SPEC・README・server・`.env`はpublicの外に置きます。用意した作業ブランチは`feat/speech-dashboard-mvp`です。

CC-DEVルートからの再ビルド:

```bash
npm --prefix speech-dashboard-src ci
npm --prefix speech-dashboard-src run build
mkdir -p public/speech-dashboard
rsync -a --delete speech-dashboard-src/public/speech-dashboard/ public/speech-dashboard/
```

アプリ内の画面切替はURLルーティングを使わず、サブパス内で完結します。必要なら`deploy/hosting-rewrites.json`のSPA行を既存`firebase.json`のmainターゲットへ追加してください。既存設定を丸ごと置換しないでください。

## Cloud Run / Firebase結合（未デプロイ）

1. Firebase AuthのGoogleログインを有効化し、許可ユーザーへ`speechAnalyst: true`カスタムクレームを管理者環境で付与。既存クレームは保持してください。
2. WebアプリをApp Check（reCAPTCHA v3）へ登録。VITE_FIREBASE_* と VITE_RECAPTCHA_SITE_KEY を`.env`へ設定。
3. OpenAI/JevのキーをSecret Managerに登録。Cloud Run専用サービスアカウントに対象Secretのアクセス権、Firestoreの必要権限、Firebase Authのトークン失効検証に必要な参照権限を付与。
4. DockerfileでビルドしCloud Runへデプロイ。`APP_MODE=cloud`必須。`K_SERVICE`環境でlocal指定なら起動を拒否します。
5. **VITE_API_BASE_URLへ実際のCloud Run HTTPS URLを設定してフロントを再ビルド**。Firebase Hosting経由のAPIは60秒制限のため使いません。許可Originは`https://cc-dev-ps7.web.app`のみ。本番プレビュー別ホストを使う場合は明示的に追加してください。
6. Firestore Rulesを既存ルールへ慎重に統合。`deploy/firestore.rules`は参考例で、既存CC-DEV全体の置換用ではありません。既存包括allowはdenyより優先するため、実ルールを監査してから結合テスト。
7. `speechLimits.expiresAt`・`speechVisits.expiresAt`にTTL設定。前者はレート制限、後者は日別訪問者重複除外用。
8. 管理用ADC認証下で`npm run registry`を実行。未公開なのでproductionUrlはnull。台帳更新成功を確認してから公開段階へ進みます。

Cloud Run作成例（サービスアカウントとSecretは先に作成）:

```bash
gcloud run deploy speech-dashboard-api \
  --project cc-dev-ps7 \
  --region asia-northeast1 \
  --source . \
  --service-account speech-dashboard-api@cc-dev-ps7.iam.gserviceaccount.com \
  --set-env-vars APP_MODE=cloud,GOOGLE_CLOUD_PROJECT=cc-dev-ps7 \
  --set-secrets OPENAI_API_KEY=speech-openai-key:latest,JEV_API_KEY=speech-jev-key:latest \
  --timeout 900 --concurrency 1 --max-instances 1 --memory 1Gi --cpu 1 \
  --allow-unauthenticated
```

Cloud RunのIAM入口はブラウザ接続用に公開しますが、アプリAPIではFirebase IDトークン・分析者権限・App Checkを必須にしています。healthのみ公開。ローカル認証省略モードを外部公開しないでください。サービス全体の最大インスタンス数も1に制限し、段階的トラフィック移行で複数リビジョンを同時稼働させないでください。

本格運用の前にStorage直送＋Cloud Tasks等によるジョブ実行・分散ロック・再開を実装します。Phase 1は単一インスタンス内のロックで直列処理し、完了済み入力のハッシュを照合します。再起動・複数リビジョン間での厳密な一度限りの課金は保証しません。

録音原本は一時領域のみ、結果は所有者単位で保存。共有閲覧・結果削除のUIは未実装です。検証終了後の保存結果は管理者が該当所有者パスを確認して削除してください。書き込みはすべてサーバー経由です。

## GitHub Flow / SemVer

作業ブランチ → commit → PR → CI → review → main merge → Hostingデプロイ。今回はローカル検証までで、push・PR・本番公開は未実施です。機能追加はminor、修正はpatch。`package.json`、`src/meta.js`、Registryを同じ版にそろえ、リリースノートをコードと同じコミットに入れます。Flight_Stripのコードは本変更の対象外です。

## 公式仕様

- [OpenAI文字起こし](https://developers.openai.com/api/docs/guides/speech-to-text)
- [TypeSafe API Quick start](https://docs.typesafe.ai/introduction/quickstart)
- [Choice](https://docs.typesafe.ai/primitives/choice) / [Score](https://docs.typesafe.ai/primitives/score)
- [Firebase HostingのCloud Run連携と60秒制限](https://firebase.google.com/docs/hosting/cloud-run)

外部APIの課金実行、本番認証、Firestore、Registry、Cloud Runデプロイは実キー・認証設定後の結合検証が必要です。


## タイムテーブルとの照合（追加設計）

実運用は「同日Mainの共通クラウド原本＋1日に複数回開催する4部屋のBO」としてSPEC.md §11へ追記しました。予定表を基準に開催回・部屋ごとの録画を関連付け、Mainの同じ原本は各予定から区間参照します。

この追加設計のインポート・自動区間候補・予定表画面はまだ実装していません。実タイムテーブルの列構成を確認してから取り込み方式を確定します。v0.1.0の画面とAPIの制限は変わりません。混合音声の個人別分析には話者分離・氏名確認の追加が必要です。
