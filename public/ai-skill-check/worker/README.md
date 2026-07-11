# ai-skill-proxy Worker — Stripe決済検証つきClaude APIプロキシ

`https://ai-skill-proxy.junpei-omote.workers.dev` のソース。
従来のClaude APIリレー（POST /）に加えて、Stripe Checkout の決済検証エンドポイント（GET /verify-session）を追加している。

## エンドポイント

| メソッド/パス | 役割 |
|---|---|
| `POST /` | Claude APIリレー（SSEストリーミング対応・従来動作） |
| `GET /verify-session?session_id=cs_...` | Stripeに照会し `payment_status==='paid'` かつ 金額500円/JPY一致なら `{"paid":true}` |

レスポンス例: `{"paid":false,"reason":"unpaid"}`（200=確定判定 / 502・503=一時エラーでフロントは再試行を促す）

## デプロイ手順（切替はこの順番で）

### ① Worker をデプロイ

```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/public/ai-skill-check/worker"
npx wrangler login
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler deploy
```

- `STRIPE_SECRET_KEY` は Stripe ダッシュボード（kurosaki.ps7@gmail.com）→ 開発者 → APIキー で作成。
  **「制限付きキー」で Checkout Sessions＝読み取り のみを許可したキー（rk_live_...）を推奨**（漏洩時の被害を最小化）。
- 既存Workerを上書きするため、Claude APIキーがシークレット `CLAUDE_API_KEY` として登録済みならそのまま引き継がれる。
  デプロイ後にAIコメント生成が500エラーになる場合は旧コードにキーが直書きだったケースなので
  `npx wrangler secret put CLAUDE_API_KEY` で登録し直す。

デプロイ後の動作確認:

```bash
curl "https://ai-skill-proxy.junpei-omote.workers.dev/verify-session?session_id=cs_test_dummy12345"
```

→ `{"paid":false,"reason":"not_found"}` が返ればOK（`not_configured` ならシークレット未設定）。

### ② Stripe の成功URLを変更

Stripe ダッシュボード → 商品 → Payment Links（¥500詳細レポート）→ 編集 → 確認ページ →
「特定のページにリダイレクト」に以下を設定:

```
https://cc-dev-ps7.web.app/ai-skill-check/?session_id={CHECKOUT_SESSION_ID}
```

`{CHECKOUT_SESSION_ID}` はStripeが実際のセッションIDに置換するプレースホルダ（このまま入力する）。

### ③ フロントエンドをデプロイ（mainへマージ）

`public/ai-skill-check/index.html` v0.4.0 は新旧どちらの成功URLでも動くため、①②の前後どちらでも安全。

## 有料化するとき（無料キャンペーン終了）

`public/ai-skill-check/index.html` の `FREE_REPORT_MODE` を `false` にするだけ。
「今だけ無料」ボタンの非表示と、検証不能な旧 `?payment=success` クエリの無効化が同時に切り替わり、
レポート生成は Stripe 決済検証を通過した場合のみになる。
**必ず①②が完了してから切り替えること**（先に切り替えると購入者がレポートを受け取れない）。

## 既知の制限

- 検証済み `session_id` はブラウザの localStorage にキャッシュされる（リロード時のオフライン耐性のため）。
  同じ成功URLを他人に共有すると、その人が自分で診断した結果に対してレポートを1回生成できてしまう
  （¥500商品のためリスク許容。厳密にしたい場合は Workers KV で session_id の使用済み管理を追加する）。
