# summary.md — hihahoナレッジベース構築（2026-07-08）

## 完了した作業

### 1. ナレッジコンテンツ生成（計180ノート）
- **公式サポートKB日本語全訳**: support.hihaho.com/en の全155記事（9カテゴリ）を日本語化 → `hihaho-kb-content/support/`
- **サービス資料5.0**: 顧客向け資料をテーマ別10ノートに再構成（公開扱い） → `hihaho-kb-content/service/`
- **営業完全ガイドv2.0（第1 基礎・ユースケース編）**: 社内向け15ノートに再構成 → `hihaho-kb-content/internal/`

### 2. Webアプリ3本（すべて v0.1.0）
| アプリ | URL | 内容 |
|---|---|---|
| 公開KB | https://cc-dev-ps7.web.app/hihaho-kb/ | 検索・カテゴリ絞り込み・Markdownコピー。認証不要 |
| 社内KB | https://cc-dev-ps7.web.app/hihaho-kb-internal/ | Googleログイン+allowlist。社内ノート含む全記事横断検索 |
| 管理画面 | https://cc-dev-ps7.web.app/hihaho-kb-admin/ | ナレッジ追加・編集・削除・JSON一括インポート/エクスポート |

### 3. インフラ
- Firestore `hihaho-kb` コレクション新設 + rules（audience別読み取り制御・編集者allowlist）
- 社内15ノートをFirestoreへ自動シード済み（`seed-firestore.js`）
- Obsidian Vault `wiki/hihaho-kb/` に180ノート+INDEXを同期（`build.js --vault`）
- 既存ノート「hihaho（インタラクティブ動画SaaS）」からINDEXへの逆リンク追加

## 判断事項（要確認）
- **営業完全ガイドは全ノート「社内限定（audience: internal）」に振り分け**。公開サイトには一切出していない。価格戦略・提案トーク・競合比較を含むため公開不適と判断。公開したい個別ノートがあれば管理画面で audience を public に変更すれば公開KBに出せる
- サービス資料5.0は顧客配布資料のため「公開」扱いにした（料金プラン・事例含む）

## 運用（HANDOVER: public/hihaho-kb/HANDOVER.md 参照）
- 翻訳記事の修正 → md編集 → `node build.js --vault` → commit/push
- 社内ノートの修正 → `node build.js && node seed-firestore.js`
- 日常のナレッジ追加（会議・音声由来）→ 管理画面から

## 残課題
- AI回答ボット連携（kb-data.json / Firestore を Claude API から参照）は次フェーズ
- 英語版KBの新着記事の検知・自動翻訳パイプラインは未構築
- 記事内画像は英語版KB（intercom CDN）への直リンク

## 追記（2026-07-08 v0.2.0）
- 日本のサービス内容を正とする更新を実施（splineinteractive.com 準拠）
  - 料金・視聴回数上限・支払い・SLA・サポート窓口・制作支援・パートナー等11記事に「🇯🇵 日本でのご利用の場合（こちらが正）」ブロックを追加、料金記事は日本料金表を主文に書き換え
  - 新記事「日本でのお問い合わせ・提供体制（スプライングローバル）」追加（公開記事は計166件に）
  - 記事下・フッターに日本お問い合わせリンク（splineinteractive.com/apply/）追加、両KBを v0.2.0 へ
- iCloud同期競合で生じた「〜 2.md」重複25件を検出・削除（オリジナルと同一内容を確認済み）
