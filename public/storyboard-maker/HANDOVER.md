# HANDOVER.md - storyboard-maker（コンテメーカー）

## 基本情報
- バージョン: v0.1.0
- フェーズ: Phase 1（MVP・α版）
- 最終更新: 2026-10-27

## 技術スタック
- Frontend: React 18（UMD + Babel standalone）+ Tailwind CSS（CDN）、シングルファイル
- 認証: Firebase Auth（Google ログイン）＋ `ALLOWED_EMAILS` で本人のみ許可
- データ: ブラウザの IndexedDB（`storyboard-maker` DB）。サーバー保存なし
- AI: Claude API をブラウザから直接呼び出し（キーは localStorage、既定モデル claude-sonnet-4-6、ストリーミング）
- Hosting: Firebase Hosting

## ファイル構成
public/storyboard-maker/
├── index.html
└── HANDOVER.md

## 機能
- md（### CUT 見出し / 表 / 箇条書き / 脚本形式）→ 絵コンテ・字コンテをルール変換、自由形式は AI 変換
- 絵の差し替え（アップロード・D&D・⌘V 貼り付け）、カット間の絵の入れ替え（D&D）
- 手描きスケッチ（線・青影・赤指示・消しゴム・筆圧）、AI ラフ（Claude が SVG を描画→JPEG 化）
- カットの並べ替え・挿入・複製・削除、Undo/Redo
- 書き出し: PDF（印刷ダイアログ、絵コンテ/字コンテ）・Markdown・JSON（絵込み/文字のみ）
- プレビュー再生（秒数どおりの紙芝居＋セリフ読み上げ）

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/storyboard-maker/

## 次のステップ
1. Firestore/Storage 同期（複数端末で同じプロジェクトを使う）
2. AI ラフの画風調整・画像生成 API 連携
3. ビデオコンテ（音声ファイル付き動画書き出し）

## 既知の問題・注意事項
- アクセス制限はクライアント側。HTML 自体は誰でも取得できるがデータは各ブラウザ内のみなので他人には見えない
- 端末間でデータは共有されない（JSON 書き出し→読み込みで移行）
