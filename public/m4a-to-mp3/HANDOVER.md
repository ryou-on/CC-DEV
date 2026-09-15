# HANDOVER.md - m4a-to-mp3

## 基本情報
- バージョン: v0.1.0
- フェーズ: Phase 1（MVP）
- 最終更新: 2026-09-15

## 技術スタック
- Frontend: Vanilla JS + Tailwind CSS（CDN）
- 変換エンジン: Web Audio API（decodeAudioData） + lamejs（MP3エンコード、CDN経由）
- Backend: なし（完全クライアントサイド、サーバー送信なし）
- Hosting: Firebase Hosting

## ファイル構成
```
public/m4a-to-mp3/
├── index.html      # 単一ファイル構成（UI + 変換ロジック）
└── HANDOVER.md
```

## 処理の流れ
1. M4Aファイルをドラッグ&ドロップ、または選択
2. `AudioContext.decodeAudioData` でPCMにデコード
3. `lamejs.Mp3Encoder` でPCM→MP3にブロック単位でエンコード
4. `Blob` 化してダウンロードリンクを生成

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/m4a-to-mp3/

## 進捗チェックリスト
- [x] M4A→MP3変換（複数ファイル対応）
- [x] ビットレート選択（128/192/320kbps）
- [x] 進捗表示・エラー表示
- [x] バージョン表示/リリースノートモーダル/ヘルプモーダル/デバッグボタン
- [ ] 変換後ファイルの一括ZIPダウンロード（未実装、必要なら追加）

## 既知の問題・注意事項
- ブラウザの `decodeAudioData` に依存するため、一部の特殊なM4A（DRM付き等）は非対応
- 大きなファイル（長時間の音声）はエンコードに時間がかかる場合がある（UIはブロック処理で固まらないよう配慮済み）
- 管理画面なし（ユーザーデータを保持しないため不要と判断）
