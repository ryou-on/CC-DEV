# CC-DEV 800円停止ワークフロー（稼働設定済み）

`generate.py` は固定対象の非公開Google Cloud Workflows定義を生成する。公開アプリのデプロイゲートを迂回する仕組みではない。2026-10-05にユーザー承認を受けて専用IAM・予算通知・Eventarc・Workflowsを接続した。**800円到達時の実停止は意図的に試験していない。**

## 固定の契約

- cc-dev-ps7プロジェクト、既存予算5629c6af-5042-4d68-926e-e76a5b0b4a26、JPY1,000の当月予算を対象。
- 固定Pub/Subトピックと予算ID、課金アカウントID、通貨、実績金額、時刻を検証。800円未満、前月分、24時間以上前、未来、不正形式の通知は停止しない。
- 既存4 HostingサイトをSITE_DISABLE。既存9 FunctionsのallUsers/allAuthenticatedUsersの呼び出し権限を削除。Firestore/Storageのクライアントアクセスをdenyに変更。
- 変更前のメタデータを`costStopBackups`にcreate-only保存。予算超過通知の再送でもバックアップを上書きしない。アプリ側の`costControls/global.enabled=false`もラッチする。
- 各停止先は独立して処理する。一部が失敗しても他を試行し、失敗はワークフロー失敗として記録。次の予算通知で再試行。自動復旧しない。
- データ削除、課金アカウントの紐付け解除、外部通知送信を行わない。

## 稼働中の設定と検証

1. Workflows `asia-northeast1/cc-dev-budget-stop` revision `000002-525` はACTIVE。実行主体は `cc-dev-cost-stop@cc-dev-ps7.iam.gserviceaccount.com`。Hosting Adminと、Rulesリリース更新・Cloud Run IAM更新・Firestoreバックアップ保存だけのカスタムロールを付与。Hosting Adminには削除権限も含まれるがコードでは使用しない。Hostingは公式仕様上カスタムロールに非対応。
2. 未公開のdeny Rulesetsは `deny-rulesets.json` に記録。通常のFirestore/Storageリリースは変更していない。
3. Eventarcトリガー `asia-northeast1/cc-dev-budget-stop` は `cc-dev-budget-alerts` トピックからこのWorkflowsへ配送。配送アカウント `cc-dev-budget-trigger@cc-dev-ps7.iam.gserviceaccount.com` にInvokerを付与。予算通知アカウントにトピックPublisherを付与。
4. 800円の手動 `dryRun:true` が `would_stop`。799円、誤予算ID・課金アカウント・通貨・送信元、古い通知、前月分は `ignored`（計8ケース）。さらに本番Pub/Subトピックへ799円の模擬通知を1件送信し、Eventarc経由の実行 `8ae7bbb4-ea16-4228-a715-49d266a34fd6` が `SUCCEEDED / ignored`。この試験でサイトは停止していない。
5. 同じ実行主体の一時的な読み取り専用Workflowsで、4 Hostingサイト、9 Cloud Runサービス、Firestore/Storageリリースの計15件のGETがすべて成功。一時Workflowsは削除済み。
6. 実際の予算通知が届き800円以上で処理された際は、その実行結果と全停止先を照合する。実停止パスの成功を事前に断定しない。予算通知は遅延・重複・順序逆転があり得る。

再生成時は `python3 infrastructure/cost-stop/generate.py infrastructure/cost-stop/deny-rulesets.json` を使う。予算ID・課金アカウントID・対象サイト/サービスを変更した場合は検証条件と一覧を同時に更新する。権限・トリガー等のクラウド設定はソース生成だけでは再作成されない。

## 手動復旧

`costStopBackups`の同じ月の記録からHostingのversion名、RulesのrulesetName、RunのIAM bindingsを取得。最新IAMと差分確認し、etagを取得し直して必要な公開呼び出し権限のみ戻す。原因解消・予算見直し・公開前ゲート合格を確認後、Hostingに保存版を再リリース、Rulesを復旧し、最後にglobal.enabledをtrueにする。バックアップがない対象は自動復元しない。月替わりだけでは再開しない。

## 限界

Google課金通知はリアルタイムではない。通知までの超過額、Storageダウンロードトークン経由の既存URL、継続中の外部AIジョブ、保存容量などの費用は保証しない。Functions/Hostingの新規追加時には固定一覧と検証を更新する。プロバイダー側の支出制限は別途必要。
