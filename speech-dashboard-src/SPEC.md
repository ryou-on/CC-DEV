# 発話分析ダッシュボード — Phase 1 SPEC

- appId: speech-dashboard / バージョン: 0.1.0 / 2026-10-02
- 対象: Zoom参加者別ローカル音声を扱う研修運営者
- 構成: React + Tailwind CSS + Recharts / Firebase Auth・Firestore / Cloud Run + FFmpeg
- 公開先（予定）: https://cc-dev-ps7.web.app/speech-dashboard/
- 共通仕様: /Users/lobby/.codex/standards/kikaku7-app-development-standard.md v1.0.0

## 1. 到達点
APIキー不要の明示的なデモと、実音声を処理するサーバー経路を用意する。実音声の処理をデモで代替しない。ローカルはJSON保存、本番はFirebase認証・App Checkを検証しAdmin SDKからFirestoreへ保存する。画面は原則App.jsx一枚に集約、集計・API・サーバー責務を別ファイルにする。

## 2. 入力と分類
m4a / wav / mp3 / mp4 / webm / ogg / flacを複数ドラッグ&ドロップ、またはファイル選択。Phase 1では1ファイル20MB・1区間10分以内。ファイルごとに参加者ID、Day、セッションID、Main/Room、Room名、録音上の開始秒・終了秒・セッション時刻への補正秒を編集できる。同一ファイルから複数区間を追加可能。終了空欄は末尾（上限10分）。セッションIDはDay内で一意。参加者IDは日をまたいで統一し、表記ゆれは利用者が修正する。

MainとBOの切替は自動推測しない。同じMainを複数担当者が録音した場合は代表1本を選ぶ。SHA256＋所有者＋分類＋切り出し条件で同一入力の再登録を防ぐ。異なる録音機の波形による重複統合・自動同期・音源分離はPhase 2以降。

## 3. 分析定義
- FFmpegで切り出し・16kHzモノラルPCM化。silencedetect（-35dB、0.35秒）により非無音区間を推定。雑音を発話と誤検知し得るため全画面で推定値と明記。
- 同一録音で0.7秒以内の短い間をつなぎ1発言とする。発話秒数は非無音区間の和であり、つないだ無音の長さを含めない。
- 発話率 = 個人の発話秒数 / 選択範囲の全参加者の発話秒数 × 100。0秒なら0%。同時発話は各話者に計上するため経過時間とは異なる。
- 発言回数 = 上記連続区間の個数。平均発話長 = 発話秒数 / 発言回数。無発話者も取り込み済みなら0として表示する。
- タイムラインはDay＋セッション＋Room別。時刻 = 元音声秒 + 補正秒。異なる日・セッションを同じ時間軸へ混ぜない。
- 比較軸: 個人、ルーム（Main含む）、日。フィルタ: Day、Main/Room、参加者、発言タイプ、要確認。

## 4. 外部API
OpenAI whisper-1 + verbose_json + segment timestampsで文字起こしする。長区間は300秒PCMチャンク（約9.6MB）に分割し元時刻へ戻す。モデルは時間情報の契約を固定するためPhase 1でwhisper-1に限定。発言区間と重なる文字起こしセグメントを最大重複の発言へ一度だけ割り当てる。文字起こしの境界と実発話の境界は完全には一致しない。

Jevは公式TypeSafeエンドポイント https://api.typesafe.ai/v1/systemone を使う。stateに発言本文、questionsにChoice（質問/回答/提案/説明/同意/反対・懸念/確認/雑談/その他）、Score（0反応なし〜4議論を前進させる提案）、Noul（情報・意見を引き出す質問）を送る。Scoreは小数を保持。質問判定はnoul >= 0.5。ChoiceまたはScore confidence < 0.65 は要確認。本文なし・API失敗時は「未分析」とし、その他や0点に置換しない。API失敗は発話量・文字起こしを失わせず部分完了として保存する。再試行は保存済み音声がないため再アップロードで行う（同じ結果IDを更新）。モデル・ルーブリック版を保存する。

## 5. 画面
ヘッダー、取り込み、4つのKPI、Recharts比較グラフ、集計表、セッション別タイムライン、文字起こし・分類一覧。デモデータと実データは混ぜない。読み込み中、保存失敗、空データ、API未設定を表示する。
アプリ名から使い方、バージョンからリリースノート。両モーダルは閉じる・背景クリック・Escape・フォーカス復帰対応。使い方にはホームへ戻る。目安箱を実装。診断コピーは許可済みコード・件数・版・URL pathnameだけを含み、氏名・本文・ファイル名・キーを含めない。

## 6. 保存とAPI
- POST /api/speech/recordings: multipart（file, metadata JSON）、同期処理。処理中表示、結果保存後応答。
- GET /api/speech/recordings: 所有者の結果を取得。
- POST /api/speech/feedback: 匿名化注意表示後送信。
- POST /api/speech/analytics: 日別匿名アクセス集計。
- Firestore speechUsers/{uid}/recordings/{hash}: メタデータ・処理状態・指標・発言配列。10分/最大300発言/本文上限で1文書サイズを制限。
- apps, changelog, analytics, feedback はサーバー専用。登録・更新管理スクリプトを用意。クライアントからの直接書き込みは禁止。
- ローカルの .local-data/ はGit・Hosting・Dockerから除外。音声は一時ディレクトリへ置きfinallyで削除。再生・音声の永続保管は対象外。

## 7. 認証・運用
ローカル開発は127.0.0.1にのみバインド、外部Origin拒否、明示的なlocalモード。Cloud RunではFirebase ID token、speechAnalystカスタムクレーム、App Check必須。ローカル認証省略がCloud Runに混入したら起動拒否。Secret ManagerからOPENAI_API_KEY / JEV_API_KEYを環境変数注入し、フロントへ公開しない。外部API URLを利用者入力から受け付けない。
本番フロントはVITE_API_BASE_URLに設定したCloud RunのHTTPS URLへ直接接続し、許可OriginのみCORS対応する。Firebase Hosting経由のAPI呼出は60秒制限があるため使わない。Cloud Runは同期MVP、timeout 900秒、concurrency 1、max-instances 1を推奨。処理は応答前に完結させ、応答後バックグラウンド処理に依存しない。長時間録音・大人数運用はStorage直送＋Cloud Tasksへ移行する。サーバー側タイムアウト・ファイル数/サイズ・処理数上限とレート制限を設ける。

## 8. 検証・受入条件
- サブパスでビルド成功し、デモから各比較軸・フィルタ・タイムラインを操作できる。
- 両モーダルを実際に開閉、Escape・フォーカス復帰・モバイル横溢れなしを確認。
- 無音・同時発話・短い間・0除算・時刻補正・重複入力をテスト。
- APIアダプタの正常/異常応答、未認証拒否、サイズ超過、部分失敗と再アップロードをテスト。
- 実キーなしの場合は外部API/本番Firestoreの動作を「未検証」と記録する。
- GitHub Flow作業ブランチ、SemVer、同一コミットのリリースノート、summary.md。

## 9. Phase 2以降
実データで発話検出閾値調整、日本語分類評価、手動修正・再分析、保存データ削除UI、長時間非同期処理、音声再生、自動同期・重複統合、権限管理UI。主体性は発言の特徴であり人物の能力評価に使わない。

## 10. 公式参照（2026-10-02確認）
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://docs.typesafe.ai/introduction/quickstart
- https://docs.typesafe.ai/primitives/choice
- https://docs.typesafe.ai/primitives/score
