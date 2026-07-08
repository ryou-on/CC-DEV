# HANDOVER.md - hihaho ナレッジベース（3アプリ構成）

## 基本情報
- バージョン: v0.1.0（3アプリ共通）
- フェーズ: Phase 2（BaaS結合済み・クローズド運用開始）
- 最終更新: 2026-07-08

## 構成（3アプリ + コンテンツパイプライン）

| アプリ | URL | 認証 |
|---|---|---|
| 公開KB | https://cc-dev-ps7.web.app/hihaho-kb/ | 不要 |
| 社内KB | https://cc-dev-ps7.web.app/hihaho-kb-internal/ | Googleログイン + allowlist |
| 管理画面 | https://cc-dev-ps7.web.app/hihaho-kb-admin/ | Googleログイン + allowlist |

allowlist: `@splineglobal.com` ドメイン全員 + `junpei.omote@gmail.com`
（変更箇所: firestore.rules の `isKbEditor()` と各HTMLの `ALLOW` 定数の両方）

## 技術スタック
- Frontend: シングルファイルHTML + Tailwind CDN + marked + DOMPurify
- Backend: Firebase Firestore（コレクション `hihaho-kb`）+ Firebase Auth（Google）
- Hosting: Firebase Hosting（GitHub Actions自動デプロイ）

## データフロー
```
hihaho-kb-content/            ← ナレッジの正本（markdown / git管理）
├── support/<category>/*.md   ← 公式サポートKB 155記事の日本語全訳（audience: public）
├── service/*.md              ← サービス資料5.0由来 10ノート（audience: public）
├── internal/*.md             ← 営業完全ガイドv2.0由来 15ノート（audience: internal）
├── TRANSLATION_SPEC.md       ← 翻訳エージェント用仕様書（追加翻訳時に再利用）
├── build.js                  ← ビルド: md → kb-data.json / internal-data.json（--vault でObsidian同期）
├── seed-firestore.js         ← internal-data.json を Firestore へ投入（firebase login のトークン利用）
└── internal-data.json        ← 生成物（社内用・public/ 配下には置かないこと）

public/hihaho-kb/kb-data.json ← 生成物（公開記事のみ。コミットして配信）
Firestore hihaho-kb/          ← 社内ノート + 管理画面から追加したナレッジ
Obsidian Vault wiki/hihaho-kb/ ← build.js --vault が全180ノート+INDEXを同期
```

- 公開KB = kb-data.json + Firestore(audience==public)
- 社内KB = kb-data.json + Firestore全件（internalは🔒バッジ・注意帯つき）
- 管理画面 = Firestoreのみを編集（翻訳記事はリポジトリで管理）

## 運用手順

### 翻訳記事・PDFノートを修正/追加したとき
```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/hihaho-kb-content"
node build.js --vault
cd ..
git add public/hihaho-kb/kb-data.json hihaho-kb-content
git commit -m "docs: ナレッジ更新 (hihaho-kb)" && git push
```

### 社内ノート（internal/）を修正したとき
```bash
node build.js && node seed-firestore.js   # Firestoreに反映（kb-data.jsonには含まれない）
```

### 会議・音声からのナレッジ追加（日常運用）
管理画面のフォームに貼り付けて保存（公開範囲を選択）。
Obsidianにも残したい場合は一覧の「md」ボタンでMarkdownをコピーして Vault に貼る。

### firestore.rules を変更したとき
```bash
npx firebase deploy --only firestore:rules
```

## セキュリティ設計（重要）
- **社内ナレッジは静的ファイルに絶対に置かない**（public/ 配下は誰でもDL可能）。社内情報は必ずFirestore + rules で保護
- 営業完全ガイド由来のノートは audience: internal 固定。公開への転載判断は人間が行う
- kb-data.json は build.js が audience==public のみを出力する設計

## 進捗チェックリスト
- [x] サポートKB 155記事の日本語全訳（9カテゴリ）
- [x] サービス資料5.0 → 公開ノート10件
- [x] 営業完全ガイドv2.0 → 社内ノート15件
- [x] 公開KB / 社内KB / 管理画面の3アプリ
- [x] Firestore rules（audienceベース + メールallowlist）
- [x] Obsidian Vault 同期（wiki/hihaho-kb/ + INDEXノート）
- [ ] 過去の音声・テキストからのナレッジ追加（運用フェーズ）
- [ ] ナレッジボット連携（次期: kb-data.json / Firestore を Claude API から参照）

## 次のステップ
1. 過去議事録・PLAUD文字起こしからのナレッジ化（管理画面 or 一括インポート）
2. AI回答ボット（公開KB検索 → Claude APIで回答生成）の追加
3. 英語版KBの更新検知（新着記事の自動翻訳パイプライン）

## 既知の問題・注意事項
- 記事内の画像は intercom（英語版KB）のCDN画像を直接参照。hihaho側が画像URLを変えると表示されなくなる
- Tailwind CDN 利用（本番ではPostCSS推奨だが他アプリと同様の構成を採用）
- seed-firestore.js は firebase login 済みマシンでのみ動作（オーナー権限でrulesを迂回する）
