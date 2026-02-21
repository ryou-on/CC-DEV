# HANDOVER: Universal Previewer v2.1

## プロジェクト概要
多機能ファイルプレビューア＆コードエディタ。JSX/React、HTML、Markdown、SVG、JSON、YAML、CSS等に対応。

## 技術スタック
- **フロントエンド**: Vanilla JS, HTML5, CSS3
- **React**: CDN版 React 18.2.0
- **トランスパイラ**: Babel Standalone 7.23.5
- **CSS**: Tailwind CSS (CDN)
- **その他ライブラリ**: marked.js, highlight.js, js-yaml, xlsx, pdf.js

## 新機能 (v2.1)
- ⚡ **ビルド済みHTMLダウンロード**: JSXをトランスパイルしてBabel不要のHTMLを生成
- 📋 **コンソールパネル**: ログ表示、コピー機能、クリア機能
- 💡 **エラー日本語解説**: よくあるエラーを自動解説
- 🎯 **JSX検出強化**: import文からの確実な判定
- 🔄 **Proxyフォールバック**: 未対応Lucideアイコンも動作継続

## ファイル構成
```
public/universal-previewer/
└── index.html    # メインファイル（単一HTML、約3300行）
```

## デプロイパス
```
public/universal-previewer/index.html
```

## デプロイ手順

### 1. ファイル配置
```bash
cd /Users/lobby_mini/Library/Mobile\ Documents/com~apple~CloudDocs/#git/cc-DEV
mkdir -p public/universal-previewer
cp [ダウンロードしたuniversal-previewer.html] public/universal-previewer/index.html
```

### 2. Git Push（自動デプロイ）
```bash
git add .
git commit -m "feat: Universal Previewer v2.1 - ビルド済みHTML出力、コンソールパネル、エラー解説機能"
git push origin main
```

### 3. デプロイ確認
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 公開URL: https://cc-dev-ps7.web.app/universal-previewer/

## 主な機能一覧

### ファイルビューア機能
- ドラッグ&ドロップでファイルプレビュー
- JSX/TSX, HTML, CSS, Markdown, SVG, JSON, YAML, CSV, Excel, PDF, 画像対応
- シンタックスハイライト

### コードエディタ機能
- 自動コード種別判定
- リアルタイムプレビュー
- Light/Dark/透過背景切替

### ダウンロード機能
- 💾 HTMLで保存: Babel込みの開発用HTML
- ⚡ ビルド済みで保存: トランスパイル済み本番用HTML（JSXのみ）

### コンソール機能
- console.log/warn/error/infoを表示
- 📋 コピーボタン
- 🗑️ クリアボタン
- 💡 エラー日本語解説（自動）

## 対応Lucideアイコン（200+）
Plus, X, Check, ChevronLeft/Right/Up/Down, Menu, Search, Settings2, Trash2, Save, Download, Upload, FileText, FileSearch, Globe, PlusCircle, Sparkles, Loader2, MessageSquare, Code, Send, Copy, AlertCircle, Info, Home, User, Heart, Star, Mail, Bell, Lock, Eye, Activity, 他多数

※未対応アイコンは○で代替表示（エラーにならない）

## コード全文
添付の `universal-previewer.html` を参照

---
生成日時: 2026-02-21
Claude Code HANDOVER
