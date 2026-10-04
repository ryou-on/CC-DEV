# CC-DEV 予算・共有権限・App Check 移行状況

確認日: 2026-10-05。対象: cc-dev-ps7 (1029579090333)。この文書は設定済みと準備段階を区別する。

## 本番に反映済み

- 既存のプロジェクト専用Google Cloud月次予算をJPY500から**JPY1,000**へ更新。対象は同じ課金アカウントの他プロジェクトを含まない。
- 実績50%/80%/100%（500円・800円・1,000円）で通知。既定の課金IAM通知先を維持し、プロジェクトOwner向け通知を追加。
- `cc-dev-budget-alerts` Pub/Subトピックを作成して予算に接続。Googleの`billing-budget-alert@system.gserviceaccount.com`だけがトピック固有のPublisher。
- reCAPTCHA EnterpriseのSCOREサイトキーを作成。cc-dev-ps7.web.app / cc-dev-ps7.firebaseapp.com に限定。既存4 WebアプリをApp Checkに登録、トークンTTL1時間。キーは公開用サイトキーであり秘密鍵ではない。

## 未適用（稼働中の保護と混同しない）

- **800円自動停止は未稼働。** 専用サービスアカウントへのHosting Admin・Run IAM変更・Rules更新権限の永続付与が、自動承認審査に拒否された。ユーザーに具体的な対象・復旧案を提示し、明示承認を依頼中。予算通知だけでは止まらない。
- **App Check強制適用はOFF。** App Check対応クライアントの公開・正常トークンの実測・Chrome拡張や他の既存アプリの移行前に全体強制すると、正当な利用を遮断するため。4アプリ登録は強制適用完了を意味しない。
- **Firestore本番ルールは未更新。** 2026-10-05の再取得で、作業前のRulesetが稼働していることを確認。匿名共有のリスクは本番には残る。
- アプリ変更・Functions変更はドラフトPR #3に保存。公開前の課金検査が未合格のためHosting/Functions/Rulesは未デプロイ。

## 共有権限の修正コード

次の既存パスを維持し、データのコピー・削除を行わずにアクセスを限定する。

| 共有機能 | 権限の単位 |
|---|---|
| apps | apps__registry |
| tomoe-home | tomoe-home__設定ID |
| tomoe-player と sessions | tomoe-player__リストID |
| ouchi-hamasushi 音声・画像 | ouchi-hamasushi__家族コード |
| note-analytics | note-analytics__旧ユーザーID |
| meet-knowledge | meet-knowledge__チームコード |
| outreach-crm | outreach-crm__ワークスペースコード |
| bombing-bay | bombing-bay__global |
| playlist_analytics / video_analytics | hihaho-analytics__global |

管理者UIDは既存Firebaseアカウントを照合済み。その他は本人確認済みGoogleアカウント、期限内の`accessGrants`、readers/writersを照合する。共有コードだけのアクセス、匿名Firebaseアカウント、未確認メール、別スコープの利用、クライアントからの権限改変は拒否。追加の利用者指定がないため、初期状態は管理者のみ。

`node scripts/manage-share-grants.cjs <collection> <tenant> <Google email> <reader|writer|revoke> [days]` はADCによる管理者用のdry-run。内容確認後に`--apply`。既存の期限を無断で延長しない。稼働中クライアントの端末内キャッシュはこの移行で削除しないので、共有端末の既存保存データは別途扱う。

各対象画面はGoogleログイン後に共有DBへ接続。hihaho-viewの匿名解析書き込みは停止し、公開動画閲覧を維持する。ローカル専用のゲーム・CRM機能は継続利用できる。

有料APIの`costControls/global`を全体停止ラッチとして同じトランザクションで確認。存在しない/無効/不正な状態では実行しない。本番有効化時にはサービス別設定に加えてこの管理者専用ドキュメントが必要。

## 検証

- Firestoreエミュレーター14テスト: 12種類の保存先で匿名・他ユーザー・未確認アカウントを拒否、所有者/reader/writerの権限分離、期限切れ/他スコープ/権限改変/コスト設定改変の拒否。
- Functions40テスト: 全サービスの予算停止ラッチ（欠落・不正値も停止）を追加。
- 公開前チェッカー15テスト。
- 変更対象12画面のChrome操作: 使い方のHome/Close・リリースノート・Escape、ログイン前の共有DB通信抑止。外部DB/有料APIはモックで遮断。App Check実トークン・Googleログイン成功・本番停止は未検証。
- 共通モーダル変更の既存8画面（Flight安定版・開発版を含む）もChromeで再確認済み。
- 残る公開前監査: エラー1件（既存ウィジェットの毎回キャッシュ破棄）・要確認53件。これらを解消してから公開する。
- 新規テストSDKの依存監査: 0 vulnerabilities（gRPCの修正版を明示）。

## 次の適用順序

1. 停止専用IAMの承認後、非公開Workflowsを登録し、拒否試験・dry-run・IAM確認・Eventarcの配送確認を実施。実停止は試験しない。
2. 共有先を指定して管理者側でgrantを設定。クライアントとルールを一緒に公開するため、残る公開前検査を解消する。
3. 他のFirebase利用アプリとChrome拡張にもApp Check対応を追加し、正当な通信の計測を確認してからサービスごとに強制適用。
4. 停止・復旧・利用期限の証拠を`cost-safety.json`へ反映。未確認の項目を確認済みにしない。

## 限界

800円は停止判定の閾値であって請求の厳密な上限ではない。Google課金集計・予算通知には数時間の遅延があり、転送費や保存料、実行中の外部AI処理の費用が残り得る。外部AI事業者の支払上限は別途必要。

参考: https://cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications
参考: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
参考: https://firebase.google.com/docs/projects/iam/permissions
