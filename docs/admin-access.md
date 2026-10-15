# プラットフォーム管理者の追加手順

Firestore ルールに管理者 UID は書いていません。次のどちらかを満たす確認済み Google アカウントが `isPlatformAdmin()` です。クライアントからの作成は拒否します。Admin SDK か Firebase Admin だけが設定できます。

## 方法A: カスタムクレーム（推奨）

トークンに載るため、ルール評価の追加読み取りがありません。設定後、その人は一度ログアウトしてログインし直します。

```bash
# 本番プロジェクトへの実行は、ルール公開と同じ人間の判断のあとで行う。
node -e '
const { initializeApp, applicationDefault } = require("./functions/node_modules/firebase-admin/app");
const { getAuth } = require("./functions/node_modules/firebase-admin/auth");
(async () => {
  const app = initializeApp({ credential: applicationDefault(), projectId: "cc-dev-ps7" });
  const user = await getAuth(app).getUserByEmail(process.argv[1]);
  if (!user.emailVerified) throw new Error("email is not verified");
  const claims = user.customClaims || {};
  claims.admin = true;
  await getAuth(app).setCustomUserClaims(user.uid, claims);
  console.log(JSON.stringify({ uid: user.uid, admin: true }));
})().catch((e) => { console.error(e.message); process.exit(1); });
' 'person@example.com'
```

外すときは `claims.admin = false` にして同じ API で上書きします。

## 方法B: admins コレクション

即時に効きます。トークンの再発行を待てないときに使います。ドキュメントがあることだけを見ます。

```bash
# Admin SDK で admins/{uid} を作る。ルールはクライアントの read/write を拒否する。
```

```js
await db.doc("admins/" + uid).set({
  email: user.email,
  enabled: true,
  createdAt: FieldValue.serverTimestamp(),
});
```

外すときはそのドキュメントを Admin SDK で削除します。

## 共有アプリの利用者

管理者とは別に、`scripts/manage-share-grants.cjs` が `accessGrants/{collection}__{tenant}` の readers / writers を更新します。既定は dry-run です。`--apply` は本番データへの書き込みなので、ルール公開後に人間が実行します。

hihaho の編集者判定（`@splineglobal.com` と既存の許可メール）と本ドコのオーナーメールは、プレイリストやナレッジの編集に残しています。これはプラットフォーム管理者の UID ではなく、製品の編集者条件です。どちらも `email_verified == true` かつ匿名以外のログインが必要です。未確認の同じメールアドレスは拒否します。
