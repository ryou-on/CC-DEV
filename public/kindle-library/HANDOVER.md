# HANDOVER.md - Kindleライブラリ (kindle-library)

## 基本情報
- バージョン: v0.2.0
- フェーズ: Phase 1（MVP）
- 最終更新: 2026-08-17

## 概要
kindle-capturer（Chrome拡張）でスキャンしたPDFを、本ドコ風UIのライブラリとして
一覧・プレビューするWebアプリ。ファイルはFile System Access APIでローカルフォルダ
（例: ダウンロード/kindle本PDF）からブラウザ内で直接読み取り、サーバー送信は一切なし。

## 技術スタック
- Frontend: バニラJS シングルファイルHTML（本ドコ準拠のamber×stoneライトテーマ）
- PDF描画: pdf.js 3.11.174（cdnjs）※render は intent:'print'（バックグラウンドタブのrAF停止対策）
- 保存: IndexedDB（フォルダハンドル永続化・表紙サムネイルキャッシュ）
- Hosting: Firebase Hosting

## ファイル構成
public/kindle-library/
├── index.html   （全コード）
└── HANDOVER.md

## 主な機能（v0.2.0）
- フォルダ選択（次回以降は再接続ボタンのみ・サブフォルダ1階層まで走査）
- 表紙グリッド（1ページ目サムネイル自動生成・IndexedDBキャッシュ・2並列）
- タイトル検索 / 並び替え（新しい順・古い順・名前順）
- プレビュー: 表紙クリックで PDF Reader（/pdf-reader/）を新しいタブで起動し、
  File を postMessage（同一オリジン）で受け渡し（v0.2.0で内蔵リーダーを廃止・統合）。
  右開き見開き・±1P・ズーム・しおり・自動めくり・位置記憶は PDF Reader 側の機能
- app-header-meta準拠: アプリ名→使い方 / バージョン→リリースノート、
  新バージョン初回起動時にリリースノート自動表示
- デバッグログコピー（🐛ボタン）

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/kindle-library/

## 進捗チェックリスト
- [x] フォルダ選択・再接続・スキャン
- [x] サムネイルグリッド・検索・並び替え
- [x] PDF Reader統合（postMessage連携・内蔵リーダー廃止）
- [x] 使い方・リリースノートモーダル
- [ ] 本のタイプ（本/マンガ/雑誌）タグ付け・フィルタ
- [ ] ズーム・全画面

## 次のステップ
1. ファイル名から著者を分離表示（「タイトル - 著者.pdf」規約）
2. 本/マンガ/雑誌のタグ付け・フィルタ
3. 削除・リネーム等のファイル操作（要 readwrite 権限）

## 既知の問題・注意事項
- File System Access API対応ブラウザ（デスクトップのChrome/Edge）専用。Safari/Firefox不可
- ブラウザの仕様上、再起動後は「再接続する」ボタンで許可の再取得が必要
- スキャンPDFの閲覧は私的使用（個人利用）の範囲で（使い方モーダルにも明記）
- iCloud未ダウンロードのPDF（雲マーク）は読み込みに時間がかかることがある
