# AI Usage Monitor v0.1.0

Claude Code / Codex / ChatGPT の使用率を **メニューバー・Stream Deck・デスクトップアプリ** で見るローカルツール（Mac 用）。
Firebase にはデプロイしない（ローカル常駐）。

```
~/.claude/projects/*.jsonl ─┐
~/.codex/sessions/*.jsonl  ─┼→ src/server.mjs (127.0.0.1:7777) ─┬→ web/index.html（ダッシュボード）
~/.ai-usage/chatgpt.json   ─┘                                   ├→ swiftbar/（メニューバー）
                                                                ├→ electron/（デスクトップアプリ）
                                                                └→ streamdeck/（キー表示）
```

## データソース
| サービス | 取得方法 | 精度 |
|---|---|---|
| Codex | セッションログ内の `rate_limits.used_percent` | 公式値（5h/週） |
| Claude Code | ログのトークン集計（5hブロック/7日） | 推定。上限は過去最大値 or `~/.ai-usage/config.json` |
| ChatGPT | 公式APIなし → 手動 +1 カウンター | 手動 |

Claude の上限を固定したい場合: `~/.ai-usage/config.json`
```json
{ "claudeBlockLimitTokens": 220000, "claudeWeekLimitTokens": 3000000 }
```

## セットアップ（Mac）
```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/tools/ai-usage-monitor"
node src/server.mjs                 # 動作確認 → http://127.0.0.1:7777
```
### 常駐化（ログイン時に自動起動）
```bash
sed "s|__REPO__|$(git rev-parse --show-toplevel)|" launchd/com.ccdev.aiusage.plist > ~/Library/LaunchAgents/com.ccdev.aiusage.plist
launchctl load ~/Library/LaunchAgents/com.ccdev.aiusage.plist
```
※ node のパスが違う場合は `which node` の値に plist を修正。

### 1. メニューバー（SwiftBar）
`brew install --cask swiftbar` → `swiftbar/ai-usage.30s.sh` をプラグインフォルダにコピー。表示例: `C 42% X 18% G 7%`

### 2. デスクトップアプリ（Electron、Dock非表示でメニューバー常駐）
```bash
npm install && npm run app
```

### 3. Stream Deck
```bash
cp -R streamdeck/com.ccdev.aiusage.sdPlugin "$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/"
```
Stream Deck を再起動 → 右の一覧「AI Usage Monitor」から Claude / Codex / ChatGPT をキーへドラッグ。
キー押下: Claude/Codex = ダッシュボードを開く、ChatGPT = +1 カウント。
