# CC-DEV 800円停止ワークフロー（未適用）

`generate.py` は固定対象の非公開Google Cloud Workflows定義を生成する。公開アプリのデプロイゲートを迂回する仕組みではない。現在はIAM変更の承認待ちであり、クラウドでのコンパイル・dry-run・実行権限検証は未実施。Eventarcも未作成。**現時点で800円自動停止は稼働していない。**

## 固定の契約

- cc-dev-ps7プロジェクト、既存予算5629c6af-5042-4d68-926e-e76a5b0b4a26、JPY1,000の当月予算を対象。
- 固定Pub/Subトピックと予算ID、課金アカウントID、通貨、実績金額、時刻を検証。800円未満、前月分、24時間以上前、未来、不正形式の通知は停止しない。
- 既存4 HostingサイトをSITE_DISABLE。既存9 FunctionsのallUsers/allAuthenticatedUsersの呼び出し権限を削除。Firestore/Storageのクライアントアクセスをdenyに変更。
- 変更前のメタデータを`costStopBackups`にcreate-only保存。予算超過通知の再送でもバックアップを上書きしない。アプリ側の`costControls/global.enabled=false`もラッチする。
- 各停止先は独立して処理する。一部が失敗しても他を試行し、失敗はワークフロー失敗として記録。次の予算通知で再試行。自動復旧しない。
- データ削除、課金アカウントの紐付け解除、外部通知送信を行わない。

## 有効化前の作業

1. 専用アカウントへのHosting Adminと限定カスタムロール付与について明示承認を得る。既定Hosting Adminには削除権限も含まれるがコードでは使用しない。Hostingは公式仕様上カスタムロールに非対応。
2. 未公開のdeny Rulesetsを作成。`{"firestore":"projects/.../rulesets/...","storage":"projects/.../rulesets/..."}`を管理者限定の設定ファイルへ保存。
3. `python3 infrastructure/cost-stop/generate.py <設定ファイル> > <workflows.json>`。Workflows APIに専用アカウントで登録し、構文とIAMを検証。公開エンドポイントを設けない。
4. 有効通知の`dryRun:true`は`would_stop`、未達・誤ID・誤通貨・古い通知・未来・型異常は`ignored`となることを実際のWorkflows実行で確認。偽の超過通知を本番トピックにpublishしてはならない。
5. Pub/Subからのみ実行できるEventarc配送アカウントを作成し、対象WorkflowsのInvoker権限だけを付与。トピックPublisherはGoogleの予算通知アカウントのみ。
6. 最初の正規通知到着と実行結果を確認して証跡を更新する。

## 手動復旧

`costStopBackups`の同じ月の記録からHostingのversion名、RulesのrulesetName、RunのIAM bindingsを取得。最新IAMと差分確認し、etagを取得し直して必要な公開呼び出し権限のみ戻す。原因解消・予算見直し・公開前ゲート合格を確認後、Hostingに保存版を再リリース、Rulesを復旧し、最後にglobal.enabledをtrueにする。バックアップがない対象は自動復元しない。月替わりだけでは再開しない。

## 限界

Google課金通知はリアルタイムではない。通知までの超過額、Storageダウンロードトークン経由の既存URL、継続中の外部AIジョブ、保存容量などの費用は保証しない。Functions/Hostingの新規追加時には固定一覧と検証を更新する。プロバイダー側の支出制限は別途必要。
