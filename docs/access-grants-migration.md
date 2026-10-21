# accessGrants の移行手順

**この手順の本番実行が終わるまで、PR #3 と PR #4 は main へマージしません。** main への push は Hosting と Firestore ルールを本番へ出します。許可が空のままルールだけ公開すると、プラットフォーム管理者以外は共有データを読めません。

このリポジトリの計画コマンドは本番 Auth と本番 Firestore に接続しません。付与はロビーが `--apply` を明示したときだけです。エージェントは `--apply` を実行していません。

## 対象

| scope | アプリ | 本番URL | 案内 |
|---|---|---|---|
| `apps__registry` | app-dashboard | https://cc-dev-ps7.web.app/app-dashboard/ | 編集者に writer |
| `tomoe-home__config` | tomoe-home | https://cc-dev-ps7.web.app/tomoe-home/ | 共有している家庭に writer |
| `tomoe-player__{リストID}` | tomoe-player | https://cc-dev-ps7.web.app/tomoe-player/ | リストごとの reader または writer |
| `ouchi-hamasushi__{家族コード}` | ouchi-hamasushi | https://cc-dev-ps7.web.app/ouchi-hamasushi/ | 各端末の Google アカウントに writer。既定コードは `default` |
| `note-analytics__{userId}` | note-analytics | https://cc-dev-ps7.web.app/note-analytics/ | 記録する userId ごとに writer |
| `meet-knowledge__{チームコード}` | meet-knowledge | https://cc-dev-ps7.web.app/meet-knowledge/ | チームごとに writer |
| `outreach-crm__{ワークスペース}` | outreach-crm | https://cc-dev-ps7.web.app/outreach-crm/ | ワークスペースごとに writer |
| `bombing-bay__global` | bombing-bay | https://cc-dev-ps7.web.app/bombing-bay/ | ランキングを残す人に writer |
| `hihaho-analytics__global` | hihaho-admin | https://cc-dev-ps7.web.app/hihaho-admin/ | 編集者以外で回数を見る人に reader |

hihaho の公開再生、公開KB、本ドコの共有リンク閲覧は、この許可がなくても続きます。Flight Strip の目安箱は accessGrants ではなく Cloud Functions です。手順は `docs/fst-feedback-api.md` です。

## 計画だけ出す

```bash
node scripts/access-grants-migration.cjs --manifest scripts/access-grants-manifest.example.json
```

例のメールは `@example.com` です。計画は `readyForApply: false` になり、本番へは書けません。`REPLACE_*` の tenant とメールを、実際の利用者に置き換えた JSON を別ファイルに作ります。そのファイルは個人情報を含むのでコミットしません。

同じ scope に同じメールを二度書くと計画が失敗します。日数は 1〜30 で、同じ scope の中では一番短い日数を共通の期限にします。アカウントは確認済みで有効な Google ログインだけを `--apply` が受け付けます。

## ロビーが本番へ入れる

ルール公開より先に許可文書を作っておきます。Admin SDK はルールを通りません。

```bash
CONFIRM_PRODUCTION_WRITE=access-grants node scripts/access-grants-migration.cjs --manifest /安全な場所/grants.json --apply
```

環境変数が無い `--apply` は、Firebase を初期化する前に止まります。プレースホルダのメールが残っている計画も止まります。

1件だけ足すときは、既存の `scripts/manage-share-grants.cjs` も使えます。こちらも既定は dry-run で、`--apply` は本番へ書きます。

## マージしてよい条件

次がすべて揃うまで Draft のままにします。

1. 上の表の、実際に使っている scope について、許可する Google アカウントが `accessGrants` に入っている。
2. `docs/access-grants-announcement.md` の案内を、対象の利用者へ送った。
3. 明友社の共有アカウントは `docs/meiyusha-email-verification.md` のとおり、ロビーが本番 Auth を確認した。
4. デプロイ順は Functions を先、その後に Firestore Rules と Hosting です。先に出す関数は `fstFeedbackSubmit`、`updateFstFeedback`、`recordFstAnalytics` です。Rules や Hosting を先に出すと、直書きは拒否され、画面は未デプロイの `/api/fst-analytics`（2026-10-21 時点で本番は 404）を呼びます。

この PR の作業では、1〜3 の本番操作はしていません。
