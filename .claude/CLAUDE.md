# 🤖 CLAUDE.md - AI開発共通指示書
> 企画7課 / CC-DEV プロジェクト共通仕様 v1.0
> このファイルはリポジトリルートに配置し、Claude Code・Coworkが自動参照します。

---

## 基本ルール

- 回答は **日本語** で簡潔に
- コードコメントは **日本語**
- 変数名・関数名は **英語（camelCase）**
- 説明より **コピペで動く完全なコード** を優先
- エラー発生時は「原因 + 修正コード」をセットで出す

---

## リリースノートのルール（必須）

- **ユーザーが直接体験できる UI 変更・機能追加のみ記載する**
- 以下は掲載禁止：管理画面・Analytics・Firestore rules・ER登録/ER管理・デバッグ修正・内部実装・データ構造変更
- 禁止例：「管理画面新設」「Analytics改善」「er-sync.json 更新」「ER-XXXX 新規登録」「ID マイグレーション」
- OK例：「タスクのダブルクリックで編集モーダルを開く」「印刷/PDF出力ボタン追加」「ミニカレンダー追加」

---

## 技術スタック（優先順）

- **Frontend:** React + Tailwind CSS
- **Backend / BaaS:** Firebase（Firestore / Auth / Hosting）
- **構成:** シングルファイル優先（HTML / JSX）
- **Webアプリには必ずデバッグ用コンソールコピーボタンを含める**

---

## デプロイ（CC-DEV）

| 項目 | 内容 |
|------|------|
| 配置先 | `public/<project-name>/` |
| GitHub Actions | https://github.com/ryou-on/CC-DEV/actions |
| 本番URL | https://cc-dev-ps7.web.app/<project-name>/ |

デプロイ手順を出す際は必ず上記URLを両方セットで表示する。

---

## 開発フェーズ（リーンスタートアップ準拠）

| フェーズ | 内容 |
|---------|------|
| Phase 0 | 企画・要件定義・技術選定・ワイヤーフレーム |
| Phase 1 | MVP・フロントエンドモック・α版 |
| Phase 2 | BaaS結合・クローズドテスト・β版 |
| Phase 3 | 本番リリース |
| Phase 4 | KPI分析・マネタイズ・保守 |
| Phase 5 | スケール・マルチプラットフォーム |

---

## バージョン管理（SemVer準拠）

- `0.x.x` → MVP前（頻繁な仕様変更あり）
- `1.0.0` → Phase 3 本番リリース以降
- ブランチ戦略: **GitHub Flow**
  - `main` / `feature/〇〇` / `fix/〇〇`

---

## HANDOVER.md テンプレート

新規アプリ完成時・引き継ぎ時は以下のフォーマットで出力する。

```markdown
# HANDOVER.md - {プロジェクト名}

## 基本情報
- バージョン: v0.x.x
- フェーズ: Phase X
- 最終更新: YYYY-MM-DD

## 技術スタック
- Frontend:
- Backend:
- Hosting:

## ファイル構成
public/{project-name}/
├── index.html
└── ...

## 完全なコード
（ここにコード全文）

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/{project-name}/

## 進捗チェックリスト
- [x] 完了した項目
- [ ] 未完了の項目

## 次のステップ
1.
2.

## 既知の問題・注意事項
-
```

---

## ローカルパス（マシン別）

| マシン | パス |
|--------|------|
| Mac mini M4（lobby_mini） | `/Users/lobby_mini/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV` |
| MacBook（lobby） | `/Users/lobby/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV` |

---

## チャットタイトルタグ

コード生成・開発タスク開始時は以下のタグをタイトルに含めて提案する。

| タグ | 用途 |
|-----|------|
| `[VCCC]` | アプリ開発全般 |
| `[EXCC]` | Chrome拡張 |
| `[AICC]` | AI API統合 |
| `[WSCC]` | Webサイト制作 |
| `[iOSCC]` | iOSアプリ |
| `[AndroidCC]` | Androidアプリ |
| `[BMCC]` | ブックマークレット |
| `[IDEA]` | 企画・ブレスト |

---

## hihaho固有ルール

- iframeはモーダルopen時のみ生成、close時に必ず破棄する
- カードサムネイルにiframeを使わない（1表示ごとに課金発生）
- hihaho記事CTA末尾: 「『見るだけの動画から触れる動画へ』...スプライングローバルまでお問い合わせください。」+ splineglobal.comリンク

---

## Claude API利用ルール

- ストリーミング必須: fetch + TextDecoder + chunkリアルタイム表示
- ローディング表示: スピナー +「生成中...（X字）」文字カウンター
- モデル: claude-sonnet-4-20250514
- max_tokens: 1000（Artifact内）/ 4096（エージェント）

---

## エージェント設計原則（Claude認定アーキテクト準拠）

- stop_reasonで終了判定する（"end_turn" = 完了 / "tool_use" = ツール実行して継続）
- 自然言語で終了判定しない（「完了しました」検知はNG）
- サブエージェントに必要な情報はすべてプロンプトに明示的に渡す
- ツール説明文には「何をするか・入力形式・似たツールとの使い分け」を含める
- エラー種別: Transient（リトライ可）/ Validation（修正後リトライ）/ Business・Permission（リトライ不可）
