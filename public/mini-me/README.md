# ちいさなじぶん— セットアップ手順書

> サービス名「ちいさなじぶん」は正式名称です（2026-07-29 確定）。
> 運営: 株式会社企画7課
> 本番URL: https://cc-dev-ps7.web.app/mini-me/

写真をアップロード → AIが3Dモデル化 → Webで3Dプレビュー → サイズ/オプション選択 → Stripe決済 → 3Dプリント・発送。

サーバー側の実装は `functions/mini-me.js`。エクスポートは以下の3つ。

| 関数 | 役割 | エンドポイント（デフォルト） |
|---|---|---|
| `miniMeGenerate` | 3D生成プロバイダ（Meshy / Tripo）へのプロキシ | `https://asia-northeast1-cc-dev-ps7.cloudfunctions.net/miniMeGenerate` |
| `miniMeCheckout` | Stripe Checkout Session 作成 | `https://asia-northeast1-cc-dev-ps7.cloudfunctions.net/miniMeCheckout` |
| `miniMeWebhook` | Stripe webhook 受信 → Firestore に注文保存 | `https://asia-northeast1-cc-dev-ps7.cloudfunctions.net/miniMeWebhook` |

`functions/index.js` への結線（親エージェント作業・未実施）:

```js
const miniMe = require('./mini-me');
exports.miniMeGenerate = miniMe.miniMeGenerate;
exports.miniMeCheckout = miniMe.miniMeCheckout;
exports.miniMeWebhook  = miniMe.miniMeWebhook;
```

---

## 1. 環境変数（Firebase Functions v2 Secrets）

APIキーはすべて Secret Manager 管理。**クライアントには一切出さない**（レスポンスにもログにも含めない実装になっている）。

> ⚠️ **デプロイ前の必須手順**: `functions/package.json` に `stripe` を追加してあるので、
> **`npm install` を実行して `package-lock.json` を再生成し、lock も一緒にコミットすること**。
> Firebase の 2nd gen デプロイはビルド時に lock があると `npm ci` を実行するため、
> package.json と lock が不整合だと
> `npm ci can only install packages when your package.json and package-lock.json are in sync` で**ビルドごと失敗**する。
> これは codebase 単位のビルドなので、mini-me だけでなく既存の
> `anthropicProxy` / `realtimeToken` / `interpreterCall` / `assetServe` のデプロイも巻き添えで止まる。
> （2026-07-29 時点で lock 更新済み・`npm ci --dry-run` で同期を確認済み）

```bash
cd "/Users/lobby/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/functions"
npm install
npm ci --dry-run   # package.json と package-lock.json が同期していることの確認
npm test           # priceOrder() の単体テスト
firebase functions:secrets:set MESHY_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Tripo に切り替える場合のみ追加。

```bash
firebase functions:secrets:set TRIPO_API_KEY
```

確認・削除。

```bash
firebase functions:secrets:access MESHY_API_KEY
firebase functions:secrets:destroy MESHY_API_KEY
```

シークレット設定後は**必ず再デプロイ**（値の変更は新リビジョンにしか反映されない）。

```bash
firebase deploy --only functions:miniMeGenerate,functions:miniMeCheckout,functions:miniMeWebhook
```

### 生成プロバイダの切り替え

`MODEL_PROVIDER`（既定 `meshy`）で切り替える。シークレットではないので `functions/.env` または `.env.<projectId>` に置く。

```
# functions/.env
MODEL_PROVIDER=meshy
```

`mini-me.js` の `PROVIDERS = { meshy, tripo }` が共通インターフェース（`isConfigured / createTask / getTask`）を実装しているので、Tripo 側の**要確認**箇所を埋めれば `MODEL_PROVIDER=tripo` で差し替わる。

---

## 2. Meshy 側の設定

> ⚠️ **この節の数値・仕様はすべて未検証（2026-07時点の推定）**。
> 実キーでのレスポンス取得・公式ページのスクリーンショットのいずれも取れていない。
> 出典URLと確認日を各項目に埋めるまで、**事業判断の根拠に使わないこと**。
> 価格・プラン名は外部SaaS都合で頻繁に変わる。

### APIキー取得
1. https://www.meshy.ai/ でサインアップ
2. **API access は Pro プラン以上が必要**（Free プランでは API 利用不可）— 出典URL・確認日: **未取得（要検証）**
3. Settings → API Keys からキーを発行 → 上記 `firebase functions:secrets:set MESHY_API_KEY` に貼る

### 使用API（**要検証**・実レスポンス未取得・2026-07時点）
- 作成: `POST https://api.meshy.ai/openapi/v1/image-to-3d` → `{ "result": "<task_id>" }`
- 取得: `GET  https://api.meshy.ai/openapi/v1/image-to-3d/:id`
- 認証: `Authorization: Bearer <API_KEY>`
- ステータス: `PENDING` / `IN_PROGRESS` / `SUCCEEDED` / `FAILED` / `CANCELED`
- 画像入力: `image_url` に公開URL または base64 データURI（`data:image/jpeg;base64,...`）
- 本実装は base64 データURI を使用（画像を公開ストレージに置かずに済むためプライバシー面で有利）

**送信しているフィールド（実装の現状）**
`image_url` / `topology` / `target_polycount` / `should_remesh` / `should_texture` / `enable_pbr` / `moderation` のみ。

**あえて送っていないフィールド**（受理を確認できるまで送らない。未知フィールドが1つでも拒否されると全生成が 502 で死ぬため）:

| フィールド | 状況 |
|---|---|
| `pose_mode: ''` | 空文字を enum 値として送る形になっており **400 になる可能性が高い**。明示値が判明するまで送らない |
| `texture_resolution: '2k'` | テクスチャ生成タスク側のパラメータの疑い。image-to-3d での受理が未確認 |
| `ai_model: 'latest'` | enum の実値が未確認。未指定なら API 既定モデルが使われる |
| `target_formats: ['glb','stl']` | image-to-3d での受理が未確認。**未指定時に `model_urls.stl` が返るかも要確認**（返らない場合 `printUrl` が null になる＝3Dプリント用STLが取れない） |

公開前に下記を1回実行し、実レスポンスを `functions/mini-me.js` の Meshy セクションのコメントに**確認日つきで**貼ること。

```bash
curl -s -X POST https://api.meshy.ai/openapi/v1/image-to-3d \
  -H "Authorization: Bearer $MESHY_API_KEY" -H 'Content-Type: application/json' \
  -d '{"image_url":"data:image/jpeg;base64,...."}'
```

4xx が返った場合はリトライ不能な設定ミスなので、Cloud Logging に
`[mini-me] meshy create rejected (config error)` として**送信フィールド名のみ**（画像本体・APIキーは出さない）が残る。

### 料金体系（**未検証**・2026-07時点の推定／出典URL・確認日は未取得）

サブスクリプション（すべて**推定**。要出典）:

| プラン | 月額(USD) | 月あたりクレジット | API利用 | 出典URL / 確認日 |
|---|---|---|---|---|
| Free | $0（推定） | 100（推定） | 不可（推定） | 未取得 |
| Pro | $20（年払い $240/年）（推定） | 1,000（推定） | 可（推定） | 未取得 |
| Studio | $60（年払い $576/年）（推定） | **要確認** | 可（推定） | 未取得 |
| Enterprise | 個別見積 | 個別 | 可 | 未取得 |

Image to 3D のクレジット消費（**推定**。docs.meshy.ai/en/api/pricing を参照した記憶に基づくもので、実ページ未確認）:

| モデル | テクスチャなし | テクスチャあり | 8Kテクスチャ | 出典URL / 確認日 |
|---|---|---|---|---|
| Meshy-6 / Low Poly (Meshy T1) | 20（推定） | 30（推定） | 35（推定） | 未取得 |
| Smart Topology (Meshy T2) | 5（推定） | 15（推定） | 20（推定） | 未取得 |
| その他 | 5（推定） | 15（推定） | — | 未取得 |

### 1体あたりの生成コスト目安（推定・上記が未検証なので試算全体が未検証）

本実装は `should_texture:true`（`ai_model` / `texture_resolution` は未指定＝API既定）で、**30クレジット/体**を想定（推定）。

- Pro $20 / 1,000クレジット = **$0.02/クレジット（推定）**
- 30クレジット × $0.02 = **$0.60/体 ≈ ¥90/体（$1=¥150換算・推定）**
- 失敗・作り直しを見込んで実効 **¥150〜¥250/体（推定）**

S プラン ¥7,800 に対して生成AIコストは原価の 2〜3% 程度（推定）。**原価の主体は3Dプリント出力と送料**であり、AI生成コストはボトルネックにならない（推定）。

> **要確認**: API 専用のプリペイド枠（"pay-before-you-go"）の単価表が公式に見当たらない。Pro のサブスク枠を API 用に消費する前提で試算している。ボリュームが出る前に Meshy 側に単価と同時実行数上限（Pro は同時10タスク・推定）を確認すること。
> **この試算は価格表（S ¥7,800 等）の妥当性の根拠になっているため、実額が判明するまで対外資料に載せないこと。**

---

## 3. Stripe 側の設定

### 3-1. テストモードのキー取得
1. https://dashboard.stripe.com/test/apikeys を開く（右上が **テストモード** になっていること）
2. **シークレットキー**（`sk_test_...`）をコピー
3. `firebase functions:secrets:set STRIPE_SECRET_KEY` に貼る
4. 公開可能キー（`pk_test_...`）は本実装では**不要**（Checkout はサーバーで Session を作りリダイレクトするだけなので、クライアントに Stripe の鍵は一切置かない）

### 3-2. Webhook エンドポイントの登録
1. https://dashboard.stripe.com/test/webhooks → 「エンドポイントを追加」
2. エンドポイントURL:
   ```
   https://asia-northeast1-cc-dev-ps7.cloudfunctions.net/miniMeWebhook
   ```
   （Hosting rewrite を設定する場合は `https://cc-dev-ps7.web.app/api/mini-me/webhook` 等でも可）
3. リッスンするイベント: 下記3つ
   - **`checkout.session.completed`**
   - **`checkout.session.async_payment_succeeded`**
   - **`checkout.session.async_payment_failed`**

   Checkout Session は `payment_method_types: ['card']` を明示しているので後払い系（コンビニ払い・銀行振込）は使われず、通常 `async_*` は発火しない。将来ダッシュボードで後払いを解禁したときに未入金の注文を取りこぼさないための保険として購読しておく。
4. 作成後に表示される **署名シークレット（`whsec_...`）** をコピー
5. `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET` に貼る → 再デプロイ

### 3-3. ローカルでの webhook テスト

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to http://127.0.0.1:5001/cc-dev-ps7/asia-northeast1/miniMeWebhook
stripe trigger checkout.session.completed
```

`stripe listen` が表示する `whsec_...` をローカルの `functions/.secret.local` に書く。

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxx
MESHY_API_KEY=msy_xxxxxxxx
```

### 3-4. テストカード
- 成功: `4242 4242 4242 4242` / 任意の未来日 / 任意のCVC
- 認証必要（3Dセキュア）: `4000 0027 6000 3184`
- 残高不足で失敗: `4000 0000 0000 9995`

### 3-5. 本番移行時
- ライブモードのキー（`sk_live_...`）と**ライブ用の webhook 署名シークレット**を取り直す（テスト用とは別物）
- 特定商取引法に基づく表記・返品ポリシーのページを用意する（Stripe の審査対象）

---

## 4. 価格ロジック（サーバー側の唯一の正）

クライアントから送られた金額は**一切信用しない**。`mini-me.js` の `PLANS` / `OPTIONS` 定数から引き直して Checkout Session を作る。

| プラン | サイズ | 価格（税込） |
|---|---|---|
| `S` | 40mm | ¥7,800 |
| `M` | 65mm | ¥12,800 |
| `L` | 100mm | ¥19,800 |

オプション: `base` 台座 +¥1,200 / `waterproof` 防水コーティング +¥1,500
送料: 全国一律 ¥800（**小計 ¥15,000 以上で無料**）
追加ポーズ割引: 2体目以降 **20%OFF**。**割引対象は本体価格のみで、オプション代（台座・防水）は割引しない**。

**JPY はゼロ decimal 通貨**なので `unit_amount` は円額そのまま（×100 しない）。`shipping_rate_data.fixed_amount.amount` も同様。

### 割引の割当ルール（クライアント入力に依存させない）

`priceOrder()` は 1体ずつに展開したあと **本体価格の降順でソート**してから「先頭の1体だけ満額、残りは20%OFF」を適用する。
これをしないと `items:[{S},{L}]` と `items:[{L},{S}]` で小計が ¥23,640 / ¥26,040 と変わり、**無認証の公開エンドポイントで割引の割当をクライアントが操作できてしまう**。
現行実装は**常に最も高い1体が満額**になる。

### 表示額と請求額の一致（クライアント側の計算をやめる）

`miniMeCheckout` は `{ quote: true, items: [...] }` を POST すると **Stripe セッションを作らず金額だけ返す**見積モードを持つ。
フロント（`public/mini-me/index.html`）はこの値をそのまま表示し、通信できないとき・デモモードのときだけローカル計算にフォールバックする。
ローカル計算式（`calc()`）はサーバーと**完全に同じ**（割引は本体のみ・1体あたりの割引額を `Math.round` してから体数を掛ける）。
金額表示と実請求の乖離は景表法・特商法上そのまま出せないため、**価格ロジックを2箇所に書くときは必ず `functions/test/mini-me.price.test.js` の一致テストを更新すること**。

```bash
cd functions && npm test     # node --test（追加パッケージ不要）
```

検算例（`functions/test/mini-me.price.test.js` で自動検証済み）:

| 注文 | 内訳 | 小計 | 送料 | 合計 |
|---|---|---|---|---|
| M×1 | 12,800 | ¥12,800 | ¥800 | ¥13,600 |
| S×1 + 台座 + 防水 | 7,800+1,200+1,500 | ¥10,500 | ¥800 | ¥11,300 |
| M×3 | 12,800 + 10,240×2 | ¥33,280 | ¥0 | ¥33,280 |
| L×1 + (S+台座)×2 | 19,800 + 7,440×2 | ¥34,680 | ¥0 | ¥34,680 |
| **S×2 + 台座 + 防水** | (7,800+2,700) + (6,240+2,700) | **¥19,440** | ¥0 | **¥19,440** |
| **L×2 + 台座 + 防水** | (19,800+2,700) + (15,840+2,700) | **¥41,040** | ¥0 | **¥41,040** |
| **S×5 + 台座 + 防水** | (7,800+2,700) + (6,240+2,700)×4 | **¥46,260** | ¥0 | **¥46,260** |

太字の3行が「オプション付き複数体」のケース。オプション代を割引に含めるとここで表示額と請求額がズレる（過去にズレていた箇所）。

### 実店舗バック
`shopCode` を Checkout Session の `metadata` に格納 → webhook で `mini-me/orders/items/{sessionId}` に `shopCode` と `shopKickback` を保存する。
バックは **税抜売上の15%**（税込小計 ÷ 1.1 × 0.15、消費税10%前提・推定）。

---

## 5. API 仕様（フロント側から見た形）

### `miniMeGenerate`

```
POST  body { imageBase64: string, mimeType: 'image/png'|'image/jpeg'|'image/webp' }
      → 200 { taskId }
      → 400 形式不正 / 403 Origin不正 / 413 6MB超 / 429 レート超過 / 503 APIキー未設定
GET   ?taskId=mm_xxxx
      → 200 { status:'PENDING'|'IN_PROGRESS'|'SUCCEEDED'|'FAILED', progress, modelUrl, thumbnailUrl, error }
      → 404 タスクなし / 503 APIキー未設定
GET   ?taskId=__ping__   （疎通確認）
      → 200 { status:'PENDING', progress:0 }   キー設定済み
      → 503 { error, demo:true }               キー未設定 → クライアントはデモモードへ
```

ステータスはプロバイダ固有名を出さず4値に正規化して返す。Meshy の `CANCELED` は `FAILED` に丸める。

**画像サイズの実効上限は6MB**（デコード後）。10MB にしてはいけない：functions-framework の JSON ボディパーサ上限が 10MB（推定）なので、デコード後10MBの画像は base64 で約13.3MB ＋ JSONラッパとなり、**ハンドラに到達する前にフレームワークが HTML の 413 を返す**（レスポンスがJSONでないためクライアントはエラー内容を表示できない）。
クライアント側は送信前に**長辺1600px / JPEG品質0.85**へ自動縮小するので、通常のスマホ写真がこの上限に当たることはない（HEIC等の非対応形式もJPEGへ変換して送る）。

**POST は `Origin` ヘッダ必須**（Fetch仕様上、GET/HEAD 以外は同一オリジンでも `Origin` が付く）。`curl` で直接叩きたい場合のみ `functions/.env` に `MINI_ME_ALLOW_NO_ORIGIN=1` を置く（**本番では絶対に立てない**）。

### `miniMeCheckout`

```
POST  body {
        items: [{ plan:'S'|'M'|'L', options:['base','waterproof'], qty:number }],
        customer: { email? },
        shopCode?: string,   // 実店舗コード（英数 _ - のみ・40文字まで）
        taskId?:   string
      }
      → 200 { url }   ← このURLへ location.href で遷移
      → 400 プラン/数量不正 / 503 Stripe未設定

POST  body { quote: true, items: [...] }      ← 見積のみ（Stripeセッションは作らない）
      → 200 { subtotal, shipping, total, qty, bodyTotal, optionTotal, discountTotal }
      → 400 プラン/数量不正
```

見積モードは Stripe シークレット不要で応答する（金額計算だけのため）。フロントはこの値を表示に使う。

`success_url` = `https://cc-dev-ps7.web.app/mini-me/?checkout=success`
`cancel_url`  = `https://cc-dev-ps7.web.app/mini-me/?checkout=cancel`

### Firestore スキーマ

Firestore はドキュメントパスが偶数セグメントである必要があるため、`items` を1段挟んでいる。

- 生成タスク: `mini-me/tasks/items/{taskId}`
  `{ createdAt, status, meshyTaskId, provider, progress, modelUrl?, printUrl?, orderedSessionId? }`
  ※ 状態更新は GET ハンドラ内で **await して**書き込む。Cloud Run(2nd gen) はレスポンス送出後に CPU 割当が絞られるため、await しないと `modelUrl` / `printUrl` が永続化されず、決済後に成果物URLを辿れなくなる
- 注文: `mini-me/orders/items/{sessionId}`
  `{ sessionId, createdAt, paymentStatus, paid, amountTotal, customer{email,name,phone,address}, taskId, shopCode, shopKickback, items, subtotal, shipping, paymentIntentId, fulfillment }`
  `fulfillment`: `awaiting_payment` / `payment_failed` → `pending` → `printing` → `shipped`
  **未入金（`payment_status !== 'paid'`）の注文は `pending` にしない**（＝印刷・発送フローに流さない）。`shopKickback` も入金確定時のみ計上する
- レート制限カウンタ: `mini-me/ratelimit/items/{YYYYMMDD_ip_<sha256先頭32>}` / `{YYYYMMDD_global}`
  `{ count, day, updatedAt }`（TTLポリシーを `updatedAt` に設定して自動削除するのが望ましい）

Firestore セキュリティルールは**クライアントからの直接読み書きを全面禁止**にすること（書き込みは Functions の Admin SDK のみ）。

```
match /mini-me/{document=**} { allow read, write: if false; }
```

---

## 6. ローカル確認方法

```bash
cd "/Users/lobby/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
firebase emulators:start --only functions,hosting,firestore
```

- フロント: http://127.0.0.1:5000/mini-me/
- Functions: http://127.0.0.1:5001/cc-dev-ps7/asia-northeast1/miniMeGenerate

疎通確認。

```bash
curl -i "http://127.0.0.1:5001/cc-dev-ps7/asia-northeast1/miniMeGenerate?taskId=__ping__"
```

`200` ならキー設定済み、`503` ならデモモードへフォールバックする想定。

### デモモード

`https://cc-dev-ps7.web.app/mini-me/?demo=1` でフロントは API を叩かず、同梱のサンプル3Dモデル・ダミー進捗・ダミー決済完了画面で一連のフローを再現する。
`?demo=1` を付けなくても、`__ping__` が 503 を返した場合はクライアント側が自動でデモモードへ入る（＝キー未設定でもデモは動く）。

---

## 7. セキュリティ上の設計（実装済み）

- APIキーはすべて Secret Manager 管理。**レスポンス・エラーメッセージ・ログのいずれにも含めない**。上流のエラー本文は `safeErrorMessage()` で24文字以上の英数字列を `***` にマスクし200文字で打ち切ってから返す
- CORS は `ALLOWED_ORIGINS` の許可リスト方式。`Access-Control-Allow-Origin: *` は使わない。`Origin` ヘッダが許可外の場合は 403
- **実費が発生する `miniMeGenerate` の POST は `Origin` を必須**にしている（`Origin` 無しの `curl` は 403）。GET（状態取得）はブラウザが `Origin` を付けないので従来どおり寛容
- **生成の日次レート制限**（Firestore カウンタ）: IP単位 既定10回/日（`MINI_ME_RATE_PER_IP`）、サービス全体 既定200回/日（`MINI_ME_RATE_GLOBAL`）。超過は 429。カウンタ書き込み自体が失敗した場合はリクエストを通す（可用性優先）ので、**Cloud Billing の予算アラートと Meshy 残クレジット監視も併用すること**
- **価格は完全にサーバー計算**。クライアントの送信値は `plan` / `options` / `qty` の識別子のみ参照し、金額フィールドは一切読まない。割引の割当も本体価格降順に固定してあり、`items` の並び順で総額が変わらない
- **上限チェックは1体ずつ展開する前に実行**（`items.length` / 各 `qty` / 累積数）。展開後にチェックすると `qty: 1e9` のような入力で配列を作り切る前に OOM で落ちる
- Webhook は `req.rawBody` で署名検証。検証失敗は 400 で即返す。さらに `payment_status` を検証し、未入金は `fulfillment: 'awaiting_payment'` として発送フローに流さない
- Checkout Session は `payment_method_types: ['card']` を明示（後払い系による `payment_status: 'unpaid'` の completed イベントを排除）
- 画像は **6MB 上限**（base64 長でチェック、超過は JSON の 413）、MIME は PNG/JPEG/WebP のみ許可。クライアント側で長辺1600px/JPEGへ自動縮小してから送信
- クライアントに返す `taskId` は自前発行（`mm_` + UUID）。プロバイダのタスクIDは Firestore 内に留め外へ出さない
- Meshy 側の `moderation: true` を有効化（不適切画像の自動ブロック）
- 1注文あたり最大50体で打ち止め（金額・処理量の暴走防止）

---

## 8. 未実装・要対応チェックリスト

### 必須（公開前）
- [ ] `functions/index.js` に3関数を結線する（親エージェント担当）
- [x] **デプロイのブロッカー**: `cd functions && npm install` で `package-lock.json` を再生成し**lockもコミット**する。lock と package.json が不整合だと `npm ci` が失敗し、**mini-me だけでなく既存の全functionのデプロイが止まる**（2026-07-29 実行済み・`npm ci --dry-run` で同期確認済み）
- [ ] 4つのシークレット設定 + デプロイ
- [ ] **課金保護**（下記いずれか＋予算アラートは必須）
  - [x] Firestore カウンタによる日次レート制限（IP単位／全体）— 実装済み
  - [ ] **Firebase App Check（Recaptcha Enterprise）を `miniMeGenerate` に必須化** — 未実装。レート制限だけではボットの分散IPを止められないため、公開前に入れること
  - [ ] Cloud Billing 予算アラート＋Meshy 残クレジット監視
- [ ] **Meshy API の実レスポンス確認**（§2 の curl を実行し、送信フィールドが受理されることを確認）。未確認のまま公開すると全生成が 502 で死ぬ可能性がある
- [ ] `functions/.env` に `MINI_ME_ALLOW_NO_ORIGIN` が入っていないことを確認（デバッグ用の逃げ道）
- [ ] Firestore ルールで `mini-me/**` をクライアントから遮断
- [ ] Stripe webhook エンドポイント登録（テスト→本番でそれぞれ）
- [ ] 特定商取引法に基づく表記／プライバシーポリシー／返品・キャンセルポリシーのページ
- [ ] 顔写真を扱うためのプライバシー同意フロー（**未成年の被写体は保護者同意が必須**）と保管期間・削除ポリシーの明記

### 実装が残っている機能
- [ ] **生成モデルの永続化** — Meshy の `model_urls` は期限切れになる（`expires_at` あり）。決済完了時に glb / stl を Cloud Storage へコピーする Function が未実装。現状は URL をそのまま返しているだけ
- [ ] **決済後の製造フロー** — `fulfillment: 'pending'` を書くだけ。印刷キュー・発送管理・ステータス通知メールは未実装
- [ ] **注文確認メール** — Stripe の自動レシートのみ。独自メールは未実装
- [ ] **App Check** — 未導入（→ 上の「必須（公開前）」へ移動済み）。レート制限とOrigin必須は入れたが、これだけでは分散IPのボットは止まらない
- [ ] **Tripo プロバイダ** — スタブ。画像アップロード方式・ステータス文字列・出力フィールドが**要確認**（コード内に `要確認` コメントあり）。STL 出力の可否も未確認
- [ ] **在庫・納期表示** — 未実装

### 要確認事項
- [ ] **§2 の料金表・クレジット消費表すべて**（出典URLと確認日を埋める。現状すべて未検証の推定値。価格表の妥当性の根拠になっているため優先度高）
- [ ] **§2 の使用API仕様**（実レスポンスを取得してコードのコメントに確認日つきで貼る）
- [ ] Meshy の API 専用単価（プリペイド枠の有無と単価）／同時実行数上限
- [ ] Meshy Studio プランのクレジット数
- [ ] `target_formats` 未指定時に `model_urls.stl` が返るか（返らないなら3Dプリント用データの取得方法を別途確保する必要がある）
- [ ] 生成した3Dモデルの商用利用権（Pro 以上で private asset ownership とあるが、**顧客への納品物としての権利関係を規約で確認すること**）
- [ ] 3Dプリント外注先の単価・リードタイム（S/M/L 各サイズ）→ 現行価格表の粗利計算はこれ次第
- [ ] 防水コーティングの実仕様（水槽内・常時水中での安全性、アクアリウム生体への影響）
