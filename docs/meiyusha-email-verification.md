# 明友社共有アカウントのメール確認（ロビーへの依頼）

この文書は手順の提案です。作成時点で、エージェントは本番 Firebase Auth のユーザー一覧を見ていません。`emailVerified` の変更もしていません。確認と変更はロビーが行ってください。

## なぜ詰まるか

`firestore.rules` の `verifiedAccount()` は、`email_verified == true` かつ匿名以外のログインを要求します。明友社の見積もり（`meiyusha-estimate`）は、次のメールだけが読めます。

- `meiyusha@meiyusha-estimate.app`
- `@splineglobal.com`
- `junpei.omote@gmail.com`

画面 `public/meiyusha-estimate/index.html` は `signInWithEmailAndPassword` です。共有アカウントの Auth ユーザーが未確認のままだと、パスワードが合っていてもルール公開後に単価を読めません。書き込みは従来どおり拒否です。

エミュレーターでは、確認済みのパスワードログインは読め、未確認の同じメールは読めないことを `tests/firestore/rules.test.mjs` で確認しています。これは本番ユーザーの状態を証明しません。

## ロビーに依頼する確認

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト `cc-dev-ps7` を開く。
2. Authentication → Users で `meiyusha@meiyusha-estimate.app` を探す。
3. 次をメモする。アカウントの有無、無効化されていないか、プロバイダがパスワードか、**メール確認済み**か。
4. 結果を PR #3 に残す。エージェントは代わりに本番を開きません。

ローカルでは次のコマンドが確認項目を表示します。ネットワークには出ません。`--apply` を付けても Auth は変更せず終了します。

```bash
node scripts/meiyusha-email-verified.cjs
```

## 推奨: メール確認済みにする

ルールは変えません。共有アカウントを確認済みにしてから、見積もり画面で一度ログアウトし、同じ ID とパスワードでログインし直します。ID トークンは再ログインまで古い `email_verified` のままです。

どちらか一方で足ります。

### コンソール

Authentication → Users → 対象ユーザー → メール確認を完了させる。コンソールにその操作が無い場合は、下の Admin SDK を使います。確認メールを送る場合は、そのアドレスの受信箱を開ける人にリンクを開いてもらいます。

### Admin SDK（ロビーが実行するスニペット）

サービスアカウントの鍵はリポジトリに置かないでください。Application Default Credentials で、ルール公開の判断と同じ人が実行します。

```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
node -e '
const { initializeApp, applicationDefault } = require("./functions/node_modules/firebase-admin/app");
const { getAuth } = require("./functions/node_modules/firebase-admin/auth");
(async () => {
  const app = initializeApp({ credential: applicationDefault(), projectId: "cc-dev-ps7" });
  const user = await getAuth(app).getUserByEmail("meiyusha@meiyusha-estimate.app");
  console.log(JSON.stringify({
    uid: user.uid,
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    providers: user.providerData.map(item => item.providerId),
  }));
  if (user.disabled) throw new Error("disabled account");
  if (!user.emailVerified) {
    await getAuth(app).updateUser(user.uid, { emailVerified: true });
    console.log(JSON.stringify({ updated: true, emailVerified: true }));
  }
})().catch(error => { console.error(error.message); process.exit(1); });
'
```

先に `updateUser` の行を外して、表示だけ実行するのが安全です。表示結果を見てから、確認済みへの更新を足してください。

## ルール側の代替（今回は採用しない）

未確認の `meiyusha@meiyusha-estimate.app` だけ `email_verified` を免除する案です。パスワードを知っていればルール公開直後から読めます。

採用しない理由:

- 開発標準とセキュリティ標準は、認証境界で確認済みであることをサーバー側の条件にします。
- 同じ免除を編集者メールへ広げる圧力が生まれ、未確認トークンを許す入口が残ります。
- 共有アカウントは管理者が受信箱を確認できる前提なので、確認済みにする方が権限モデルを崩しません。

本番でアカウントが無く、確認メールも受け取れない場合だけ、この代替を別 PR で再検討してください。そのときも匿名ログインは許しません。

## 公開順序

1. ロビーが本番 Auth の確認結果を残す。
2. 未確認なら、上記の手順で確認済みにする。
3. 見積もり画面で再ログインし、単価が読めることを人が確認する。
4. そのあとで、このルールを含む PR をマージする判断をする。

ルールの本番公開は、この PR では行っていません。
