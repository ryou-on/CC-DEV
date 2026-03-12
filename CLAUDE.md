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
