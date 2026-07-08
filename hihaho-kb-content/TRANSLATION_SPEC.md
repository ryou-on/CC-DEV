# hihaho サポートKB 日本語化 共通仕様（翻訳エージェント用）

## タスク
指示された各記事URLについて、英語のサポート記事を取得し、完全な日本語訳の Markdown ファイルを作成する。

## 手順（記事ごと）
1. WebFetch で記事URLを取得する。prompt には次を使う:
   "Return the complete article body as markdown. Preserve ALL headings, numbered steps, bullet lists, notes/warnings/tips, tables, and image URLs (as markdown images). Do not summarize or omit anything."
2. 取得内容が明らかに途中で切れている場合は、もう一度 WebFetch して補完する。
3. 全文を自然で正確な日本語に翻訳する。
   - **要約禁止**。手順・注意書き・補足はすべて訳す
   - UI上のボタン名・メニュー名は初出時に「英語表記（日本語訳）」で併記。例: 「Publish（公開）」
   - 製品名は必ず小文字の **hihaho**（文頭でも小文字）
   - 画像は `![説明(日本語)](元の画像URL)` の形式でそのまま残す
   - 技術用語（SCORM, xAPI, embed, iframe 等）はそのまま使用
4. Write ツールでファイルを保存する。

## 保存先
`/Users/lobby/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/hihaho-kb-content/support/<category-slug>/<日本語タイトル>.md`

- ファイル名 = 日本語タイトル。ただし `/ \ : * ? " < > |` を除去し、60文字以内に収める
- category-slug は指示された記事リストに記載のものを使う

## ファイルフォーマット（厳守）
```markdown
---
id: "5279280"
slug: how-hihaho-works-adding-an-interactive-layer-to-an-online-video
title: "hihahoの仕組み：オンライン動画にインタラクティブレイヤーを追加する"
title_en: "How hihaho works: adding an interactive layer to an online video"
category: our-interactive-video-platform
category_ja: プラットフォーム概要
audience: public
source: https://support.hihaho.com/en/articles/5279280-...
summary: "hihahoが既存動画の上にインタラクティブレイヤーを重ねる仕組みの解説。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

（ここに本文の日本語全訳。元の見出し構造を `##` 以下で維持）

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- （同じバッチで自分が訳した関連記事があれば [[その日本語タイトル]] を1〜3件）
```

- `id` はURL中の数字。必ず文字列としてクォートする
- `summary` は日本語1文（検索一覧表示に使うため40〜80字目安）
- `audience` は常に `public`

## カテゴリ日本語名の対応表
| category-slug | category_ja |
|---|---|
| our-interactive-video-platform | プラットフォーム概要 |
| how-to-setup-your-account | アカウント設定 |
| how-to-select-your-video | 動画の追加・接続 |
| how-to-make-your-video-interactive | インタラクション作成 |
| how-to-publish-and-share-your-video | 公開・共有 |
| how-to-measure-the-impact | 統計・効果測定 |
| faq | よくある質問 |
| inspiration-and-insider-tips | 活用アイデア・上級テクニック |
| partnerships | パートナーシップ |

## 完了報告
最終出力には次のみを返す（説明文不要）:
- 作成したファイルのフルパス一覧
- 件数
- 取得に失敗した記事があればそのURLと理由
