# 💸 コスト暴走防止（cost-guard）

> 2026-10-04 導入。きっかけ: 個人のプロトタイプを公開・放置していたら AI クローラー（ClaudeBot / GPTBot）に
> 1日250万回叩かれ、Vercel から約120万円請求された事例。
> **「誰も見ていない公開サイトでも、クローラーは容赦なく来る。1リクエストの重さ × 回数 = 請求額」**

## 1. CC-DEV の診断結果（2026-10-04）

| # | リスク | 対象 | 深刻度 | 対応 |
|---|---|---|---|---|
| 1 | 認証・Origin・回数制限なしで OpenAI Realtime（gpt-realtime）を自分の鍵で起動できた | `realtimeToken`（/api/realtime-token） | 🔴 高 | ✅ ボット拒否＋Origin必須＋日次上限（IP 30 / 全体 100） |
| 2 | Origin ヘッダを付けなければ（curl 等）素通りできた | `interpreterCall`（/api/interpreter-call） | 🔴 高 | ✅ 同上（realtime 枠を共有） |
| 3 | 全関数でスケール上限なし（攻撃・巡回で無制限にインスタンス増） | functions 全体 | 🟠 中 | ✅ `setGlobalOptions({ maxInstances: 10 })` |
| 4 | robots.txt が無く、AI クローラーが全ページを巡回し放題 | cc-dev-ps7.web.app / lobby-personal | 🟠 中 | ✅ AI クローラー全面禁止の robots.txt |
| 5 | 素材配信（最大30MBの動画）を Functions 経由で毎回ストリーム。CDN キャッシュ60秒のみ | `assetServe`（/e/**） | 🟠 中 | ✅ AI クローラー 403＋CDN 10分＋noindex |
| 6 | 誰でも使える Anthropic 中継（使用箇所なし＝放置中） | `anthropicProxy` | 🟡 低 | ✅ ボット拒否＋Origin必須。**未使用なら削除推奨** |
| 7 | HTML が `no-store` で毎回全量ダウンロード | firebase.json | 🟡 低 | ✅ `no-cache`（ETag で 304 → 転送量削減、鮮度は同じ） |
| 8 | 誰でも書き込める Firestore コレクション | `apps` / `note-analytics` / `playlist_analytics` / `video_analytics` / `ouchi-hamasushi`（950KB/件） | 🟡 低〜中 | ⚠️ 未対応（アプリ影響があるため別タスク）。CI で警告表示 |
| — | 予算超過時の自動停止の仕組みが無い | GCP | 🔴 高 | ✅ `budgetGuard` を用意（**下記 §3 の手動設定が必要**） |

問題なしだったもの:
- サーバー側で重い処理を毎回やる SSR 構成は無い（全アプリ静的配信）
- Claude/OpenAI を直接呼ぶページはすべて「ユーザー自身の API キー入力」方式で、オーナーに課金されない
- `hondoko*` は Firebase Auth＋メンバー判定済み、`miniMeGenerate` は Origin 必須＋日次上限済み
- Cloudflare Worker（ai-meeting / meishi-sf）は SHARED_TOKEN 認証済み
- ハードコードされた秘密鍵は無し

## 2. 仕組み（多層防御）

```
リクエスト
  │
  ├─ robots.txt …………… 正規の AI クローラーはここで止まる（GPTBot / ClaudeBot は robots.txt を守る）
  ├─ isBotRequest ………… UA でボット・curl・スクリプトを 403（Firestore も外部APIも触らない＝ほぼ無料）
  ├─ originAllowedStrict … 自サイト以外からの POST を 403
  ├─ killSwitch …………… Firestore cost-guard/config.killSwitch=true なら 503（予算超過で自動 ON）
  ├─ consumeDailyQuota …… IP単位・全体の日次上限で 429
  └─ maxInstances: 10 …… それでも漏れた分のスケール上限
```

| ファイル | 役割 |
|---|---|
| `functions/cost-guard.js` | 上記ガードの共通実装（`guardPaidRequest` を関数の先頭で呼ぶだけ） |
| `functions/index.js` の `budgetGuard` | 予算アラート（Pub/Sub）を受けてキルスイッチ ON |
| `public/robots.txt` ほか | AI クローラー拒否 |
| `scripts/cost-guard-check.js` | 静的チェック（CI・pre-push で実行。違反があると赤／push 中止） |
| `.github/workflows/cost-guard-check.yml` | 全 push / PR で上記チェックを実行 |

## 3. 手動で必要な設定（1回だけ）

### 3-1. Functions のデプロイ（CI は miniMeGenerate しかデプロイしないため手動）

```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
npx firebase deploy --only functions:realtimeToken,functions:interpreterCall,functions:anthropicProxy,functions:assetServe,functions:budgetGuard,functions:hondokoAnalyze,functions:hondokoAmazon,functions:hondokoCover,functions:hondokoNdl
```

### 3-2. 予算アラート → キルスイッチ連携

1. https://console.cloud.google.com/billing → 対象の請求先アカウント →「予算とアラート」→「予算を作成」
2. 対象プロジェクト: `cc-dev-ps7`／金額: 例 **¥5,000/月**／しきい値: 50%・90%・100%
3. 「アクションの管理」→「Pub/Sub トピックをこの予算に接続する」→ `projects/cc-dev-ps7/topics/billing-budget-alerts`
   （3-1 で `budgetGuard` をデプロイするとトピックが自動作成される）
4. メール通知も ON にしておく（Pub/Sub が止まっても気づけるように）

> 予算アラートは課金データの反映に数時間の遅れがある。だから「上限」ではなく「ブレーカー」。
> 1次防御（robots.txt・ボット拒否・日次上限）が本命で、budgetGuard は最後の保険。

### 3-3. （任意）ハードストップ

予算の 150% で請求先アカウントを外し、プロジェクトごと止める。**Hosting も止まり、復旧は手動で請求先を再リンク**。

```bash
# functions/.env に追記してから budgetGuard を再デプロイ
echo "COST_GUARD_HARD_STOP=1" >> functions/.env
```

さらに Functions の実行サービスアカウントに「プロジェクト課金管理者（roles/billing.projectManager）」を付与する。

### 3-4. （任意）クォータ記録の自動削除

Firestore コンソール →「TTL」→ コレクショングループ `items`、フィールド `expireAt` を登録（3日で自動削除）。

## 4. 運用

| やりたいこと | 方法 |
|---|---|
| 有料APIを今すぐ全停止 | Firestore `cost-guard/config` に `killSwitch: true`（60秒以内に反映） |
| 再開 | 同ドキュメントを `killSwitch: false` |
| 日次上限を変える | `functions/.env` に `COST_GUARD_REALTIME_PER_IP=50` / `COST_GUARD_REALTIME_GLOBAL=200` → 再デプロイ |
| 手元でチェック | `node scripts/cost-guard-check.js` |

## 5. 新しいアプリ・関数を作るときのルール

AGENTS.md「💸 コスト暴走防止ルール」を参照（CI が E1〜E5 を自動検査）。
