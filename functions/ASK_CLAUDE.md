# askClaude — Claude API 呼び出し Function（プロモーションクレジット運用）

storyboard-maker（コンテメーカー）の AI 機能用。API キーはこの Function の中（Secret Manager）にだけ置き、
フロントエンド・GitHub・ビルド成果物には一切含めない。

- エンドポイント: `https://asia-northeast1-cc-dev-ps7.cloudfunctions.net/askClaude`
- ソース: `functions/ask-claude.js`（テスト: `functions/test/ask-claude.test.js`）
- 利用アプリ: `public/storyboard-maker/`

---

## 1. 初回セットアップ（ロビーが Mac で実行）

```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"

# ① ロビー's Individual Org で発行したキーを登録（対話式・単独で実行）
npx firebase functions:secrets:set ANTHROPIC_API_KEY_PROMO

# ② askClaude だけをデプロイ
npx firebase deploy --only functions:askClaude --project cc-dev-ps7
```

GitHub Actions から出す場合は「Deploy Cloud Functions (mini-me)」を **Run workflow** で手動実行し、
`targets` に `functions:askClaude` を入れる（`.github/workflows/firebase-functions-deploy.yml`）。
SA に `secretmanager.admin` 等が無いと失敗するので、その場合は ② のローカル実行を使う。

> 既存の `ANTHROPIC_API_KEY`（hondoko 用）とは別の Secret。hondoko には影響しない。

---

## 2. セキュリティ構成

| 項目 | 実装 |
|---|---|
| APIキー | Secret Manager `ANTHROPIC_API_KEY_PROMO`。`defineSecret` で askClaude にのみバインド |
| 認証 | Firebase ID トークンをサーバーで検証 + メール許可リスト（`junpei.omote@gmail.com`、メール確認済みのみ） |
| CORS | `cc-dev-ps7.web.app` / `cc-dev-ps7.firebaseapp.com` / localhost のみ |
| 入力上限 | AI変換 6,000字、AIラフ 2,000字（サーバーで検証） |
| レート制限 | 1ユーザー1日あたり: AI変換 20回 / AIラフ標準 60回 / AIラフ軽量 200回（JST 日付で集計） |
| モデル指定 | クライアントからは選べない（タスク名 → モデル・max_tokens・システムプロンプトをサーバー側で固定） |
| ログ | APIキー・メール・入力本文は出さない。ユーザーは uid の SHA-256 先頭16桁のみ |
| エラー | ユーザーには日本語の定型文のみ返す（内部詳細は Cloud Logging にステータスとリクエストIDだけ） |
| スケール | `maxInstances: 5`（暴走時の同時実行を制限） |

App Check は未導入（Auth + 許可リストで要件を満たすため）。公開範囲を広げる時に追加する。

---

## 3. API 呼び出し仕様

| タスク | モデル | max_tokens | 用途 |
|---|---|---|---|
| `convert` | claude-sonnet-5-5 | 6,000 | 脚本 → 字コンテ JSON |
| `rough` | claude-sonnet-5-5 | 3,000 | カット → SVG ラフ（標準） |
| `roughLite` | claude-haiku-5-5 | 3,000 | カット → SVG ラフ（軽量） |
| （予備） | claude-opus-5-5 | — | 高難度用。現状は未使用 |

- **思考オフ**: 単純な生成タスクなので Sonnet は `thinking: between_tools`、Haiku は `disabled` にして出力トークンを節約
- **プロンプトキャッシュ**: system を「固定部分（`cache_control: ephemeral`）＋可変部分（作品名・viewBox）」に分割。
  Sonnet 5.5 / Haiku 5.5 の最小キャッシュ長は 512 トークン。効いているかは Cloud Logging の `cacheRead` で確認
- **Batch API**: 「AIラフ一括 → バッチ生成」で使用（標準の半額・最大50カット/回）。結果はフロントが30秒ごとに確認
- **リトライ**: SDK の `maxRetries: 3`（429 / 529 / 5xx / 接続エラーをジッタ付き指数バックオフで最大3回）
- **拒否時**: Sonnet 5.5 はサーバー側フォールバック（`fallbacks: "default"`）を有効化。拒否された場合は日本語メッセージを返す
- **ストリーミング**: NDJSON（`{"type":"text"}` → `{"type":"done"}` / `{"type":"error"}`）

### 使用量の記録

毎回 `usage`（input / output / cache read / cache write）を記録する。

- Cloud Logging: `event: "claude_usage"` の JSON ログ
- Firestore（Admin SDK のみ書き込み・クライアントからは読めない）
  - `claude-usage/{uidHash}_{YYYY-MM-DD}` … ユーザー別の日次回数・トークン・概算コスト
  - `claude-usage-daily/{YYYY-MM-DD}` … 全体の日次集計（モデル別内訳つき）
  - `claude-batches/{batchId}` … バッチの所有者と使用量の記録済みフラグ

---

## 4. 概算コスト（1ドル = 150円で換算）

単価（USD / 100万トークン）: Sonnet 5.5 入力 $2・出力 $10 ／ Haiku 5.5 入力 $0.10・出力 $0.50 ／ Opus 5.5 入力 $4・出力 $20。Batch は半額。

| 処理 | 想定トークン（入力 / 出力） | 1回あたり | $100 で使える回数 |
|---|---|---|---|
| AI変換（約3,000字の脚本 → 20カット） | 3,500 / 2,500 | 約 $0.032（約4.8円） | 約3,100回 |
| AIラフ 標準（Sonnet） | 900 / 1,800 | 約 $0.020（約3.0円） | 約5,000カット |
| AIラフ 標準・バッチ | 900 / 1,800 | 約 $0.010（約1.5円） | 約10,000カット |
| AIラフ 軽量（Haiku） | 900 / 1,800 | 約 $0.001（約0.15円） | 約100,000カット |

- 1日の上限まで全部使った場合の最大値: 20×$0.032 + 60×$0.020 + 200×$0.001 ≈ **$2.0/日**
- 想定利用例（1日に AI変換3回 + ラフ30カットをバッチで）: 約 $0.40/日 ≈ 60円/日 → 月 約$12

---

## 5. クレジット・支出管理（Anthropic Console）

1. **支出上限**: Console → Settings → Limits → Spend limits で **月 $20** を設定してから公開する
2. **自動リロード**: Billing → Auto-reload は**オフのまま**にする（公開後の運用方針が決まってから再検討）
3. プロモーションクレジット $100 の期限は **2026-11-15 (UTC)**。上限まで使っても期限内に使い切れない計算なので、普段どおり使ってよい

### 2026-11-15 の切り替え日に確認すること

1. Console → Billing でクレジット残高と「Promotional credits」の残り・失効額を確認
2. Console → Usage でモデル別の消費を確認し、`claude-usage-daily` の合計と大きくずれていないか見る
   （Firestore コンソール: `https://console.firebase.google.com/project/cc-dev-ps7/firestore/data/~2Fclaude-usage-daily`）
3. 以降は購入クレジットから引かれる。支出上限 $20/月が設定されているか再確認
4. 自動リロード（残高 $5 未満で $15 補充）を使うかを決める。使わない場合、残高が尽きると AI 機能は
   「AIの利用残高が不足しています」と表示して止まる（アプリ自体は動く）

---

## 6. テスト

```bash
cd functions && npm test   # 入力検証・パラメータ組み立て・コスト計算・エラーメッセージ
```
