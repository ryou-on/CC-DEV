# IP ごとの上限をやめ、全体の上限を残す

日付: 2026-10-21。本番への merge、deploy、Firestore Rules、Auth の変更はしていない。force push もしていない。

## 決めたこと

IP ごとの上限はやめた。Firebase Hosting の書き換えを経由しても、利用者本人の IP を信頼できる形では取れない。

- [Cloud Functions のヘッダ](https://docs.cloud.google.com/functions/docs/reference/headers) は、`X-Forwarded-For` を `clientIp, proxy1Ip, proxy2Ip` と書き、先頭をおおむねクライアントとしている。先頭は呼び出し側が付けられる。
- [Hosting から Functions への書き換え](https://firebase.google.com/docs/hosting/functions) と [rewrite の設定](https://firebase.google.com/docs/hosting/full-config#rewrite-functions) は、関数へ渡すものとして元のパスとクエリだけを書いている。信頼できるクライアント IP のヘッダは無い。
- 末尾のアドレスは Hosting の出口になり、利用者全員で同じ枠になる。以前の IP 上限はその共有枠としては小さすぎた。

残したのは、利用者ごとの上限、App Check、確認済みアカウント、予算停止ラッチ、そして十分に大きい全体上限である。

- 利用統計: 利用者 1 分 30 回・1 日 400 回。全体 1 分 2,000 回・1 日 50,000 回
- 目安箱: 利用者 1 分 5 件・1 日 50 件。全体 1 分 300 件・1 日 5,000 件
- 告知とアンケート管理: 利用者 1 分 10 回・1 日 100 回。全体 1 分 200 回・1 日 2,000 回
- アンケート回答: 利用者 1 分 5 回・1 日 30 回。全体 1 分 500 回・1 日 10,000 回

`functions/client-ip.js` は削除した。

## 完了した作業

- `fst-rev` の対象に `functions/index.js`、`functions/package.json`、`functions/package-lock.json` を加えた。
- 開発版の現行は v0.10.31-dev のまま。v0.10.30-dev の日付は 2026-10-15、内容はフィードバックと利用統計の4項目へ戻した。安定版は v0.5.17 のまま。
- 本体が空の 403 でも、ゲートは `cloudfunctions.functions.get` が足りないと出して止まる。
- 手動デプロイの前に `npm ci --prefix functions` を実行する。

## サービスアカウントと版の照合

Hosting と Rules のゲートは `functions.get` を呼ぶ。Hosting 用の `FIREBASE_SERVICE_ACCOUNT_CC_DEV_PS7` に `cloudfunctions.functions.get` が無いと 403 で毎回止まる。応答が空でも同じ文言を出す。

関数はデプロイ時にラベル `fst-rev` へ、対象ソースの SHA-256 先頭32桁を書く。対象はハンドラに加え、`index.js`、`package.json`、`package-lock.json` である。ゲートは本番のラベルが、今のチェックアウトから計算した値と一致し、`state` が ACTIVE で `updateTime` があることを要求する。

照合できない部分: API が返す zip の generation はリポジトリのファイルハッシュではない。zip には依存モジュールが入るため、ソースファイルのハッシュとバイト比較できない。コンソールでラベルだけを期待値へ書き換えると、中身が古くてもこの確認は通る。

## CI

対象は `tests` と `build_and_preview`。Firestore rules test は PR #4 だけ。この summary を書いた時点では、この修正の CI はまだ走っていない。走ったあとの run ID は summary に追記しない。

## 検証

- `npm test --prefix functions` 74 件成功
- `python3 -m unittest discover -s scripts -p 'test_*.py'` 33 件成功
- Firestore / Storage のルールファイルは今回変えていない。直前のエミュレーター試験は 30 件成功
- 本番 API は呼んでいない

## バージョン

- Flight Strip TODO 安定版: v0.5.17
- Flight Strip TODO 開発版: v0.10.31-dev

## 本番URL

未デプロイ。Actions: https://github.com/ryou-on/CC-DEV/actions
安定版: https://cc-dev-ps7.web.app/Flight_Strip_TODO/
開発版: https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/
明友社見積: https://cc-dev-ps7.web.app/meiyusha-estimate/

## 残課題・残リスク

- accessGrants の本番付与と利用者への案内送付が終わるまで main へマージしない。
- `meiyusha@meiyusha-estimate.app` の emailVerified は未確認。
- 6関数は未デプロイ。ラベル `fst-rev` が無いうちは、Hosting と Rules のゲートは止まる。
- `cloudfunctions.functions.get` が無いサービスアカウントでは 403 で止まる。
- ラベルだけを手で期待値に合わせると、zip の中身が古くてもゲートは通る。
- 過去の利用統計は別方式の uid ハッシュ。人数の系列は続かない。アンケート回答も `btoa` の識別子とは結び付かない。
- 告知とアンケートの読み取りは、Flight Strip 以外の確認済みアカウントにも開く。回答の読み取りは編集者だけ。
- 画面の ALLOW 定数、明友社、本ドコのオーナーは編集者正本とは別一覧のまま。
- 予算停止ラッチが閉じていると目安箱、利用統計、告知、アンケートも `SERVICE_PAUSED` になる。
- App Check のコンソール強制は OFF。
- ログイン後の告知とアンケート送信は未実施。
