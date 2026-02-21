#!/bin/bash
# Universal Previewer v2.1 デプロイスクリプト

# CC-DEVリポジトリパス
REPO_PATH="/Users/lobby_mini/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"

# このスクリプトと同じディレクトリにあるHTMLファイル
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_FILE="$SCRIPT_DIR/universal-previewer.html"

# デプロイ先
DEST_DIR="$REPO_PATH/public/universal-previewer"
DEST_FILE="$DEST_DIR/index.html"

echo "🚀 Universal Previewer v2.1 デプロイ開始..."

# ディレクトリ作成
mkdir -p "$DEST_DIR"

# ファイルコピー
cp "$SOURCE_FILE" "$DEST_FILE"
echo "✅ ファイルコピー完了: $DEST_FILE"

# Git操作
cd "$REPO_PATH"
git add .
git commit -m "feat: Universal Previewer v2.1 - ビルド済みHTML出力、コンソールパネル、エラー解説機能"
git push origin main

echo ""
echo "✅ デプロイ完了！"
echo ""
echo "📋 GitHub Actions: https://github.com/ryou-on/CC-DEV/actions"
echo "🌐 公開URL: https://cc-dev-ps7.web.app/universal-previewer/"
