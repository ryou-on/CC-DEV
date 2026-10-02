# Phase 1 作業結果

- バージョン: 0.1.0
- 日付: 2026-10-02
- ブランチ: feat/speech-dashboard-mvp（取得したorigin/mainから分岐）
- デプロイ: 未実施
- 本番予定URL: https://cc-dev-ps7.web.app/speech-dashboard/

## 完了
- SPEC.mdを先に作成し、Phase 1の範囲・指標・入力・認証・保存・制約を定義。
- React + Tailwind + Rechartsのダッシュボード、Day/Main/Room分類、個人・日・ルーム比較、タイムライン、発話内容一覧。
- 複数ファイルのドロップ、区間追加、元音声の切り出し・時刻補正、実データ/サンプル分離。
- FFmpegの非無音検出、OpenAI文字起こし、Jev Choice/Score/Noul、部分完了保存・再試行・完全重複の除外。
- ローカルJSON/Firestore保存アダプタ、Cloud Run Dockerfile、サーバー専用APIキー。
- Firebase Auth・分析者クレーム・App Check検証、ファイル上限、Origin検証、制限付きアップロード、CORS。
- 使い方・リリースノートの開閉、ホーム導線、診断コピー、目安箱、台帳管理スクリプト。
- README、環境変数例、Rules結合例、CI定義、ビルド済みpublic/speech-dashboardを用意。

## 検証結果
- npm run build: 成功。
- npm test: 10件成功（実FFmpeg、集計、API契約、重複/再試行、永続化、サイズ制限、本番の認証欠落拒否、CORS）。
- npm run test:ui: Chromium 3件成功（両モーダルの閉じる/Escape/背景クリック/フォーカス復帰、比較軸、フィルタ、タイムライン、モバイル横溢れなし、診断情報の匿名化、ドラッグ&ドロップから部分完了表示、再読込）。
- テスト用外部APIはモック。FFmpeg区間検出は実バイナリで実行。
- デスクトップ・モバイルのスクリーンショットを目視確認。

## 残課題・注意事項
- 実OpenAI/Jevキーによる課金API呼出、本番Firebase Auth/App Check、Firestore/Registry書き込み、Cloud Runデプロイは未検証。台帳の未反映状態はdeploy/registry.pending.jsonに記録。
- 本番公開、git push、PR、GitHub Actions実行は未実施。ローカル検証可能な雛形までが今回の範囲。
- Firestore Rulesは既存プロジェクト全体を上書きしない結合例。実Rulesの包括allow監査とEmulator検証を行ってから公開する。
- 同期MVP: 1ファイル20MB、1区間10分、最大300発言。原音永続保存/再生・自動同期・異なる録音の重複統合・手動修正は未実装。
- 発話時間は非無音区間に基づく推定。雑音等による誤差あり。実研修録音での精度評価は今後必要。
- 本番APIはHostingの60秒制限を避けCloud Runへ直接接続。VITE_API_BASE_URLの設定必須。
- JavaScriptバンドル約682KB（gzip約208KB）。Viteの500KB通知あり、ビルドエラーなし。
- Phase 2以降で長時間録音の非同期処理・分散ロック・保存結果削除UIを実装する。
