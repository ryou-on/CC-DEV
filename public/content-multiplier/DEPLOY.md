# Content Multiplier AI - デプロイ手順

## CC-DEV配置先
`public/content-multiplier/index.html`

## 手順
1. `content-multiplier/` フォルダごと CC-DEV の `public/` 直下にコピー
2. git add, commit, push
3. GitHub Actions が自動デプロイ

## 確認URL
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/content-multiplier/

## コマンド（Mac）
```bash
# lobby_mini の場合
cp -r ~/Downloads/content-multiplier "/Users/lobby_mini/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/public/"

# lobby の場合
cp -r ~/Downloads/content-multiplier "/Users/lobby/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/public/"

cd "/Users/lobby_mini/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
git add .
git commit -m "add: Content Multiplier AI v1"
git push
```
