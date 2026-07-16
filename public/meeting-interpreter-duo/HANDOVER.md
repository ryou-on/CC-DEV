# HANDOVER.md - Meeting Interpreter Duo

## 基本情報
- バージョン: v0.1.0
- フェーズ: Phase 1（MVP・実会議での検証前）
- 最終更新: 2026-07-16

## 経緯
- ChatGPTで開発された `public/meeting-interpreter/`（EN→JA字幕のみ・v0.2.0）の後継として新規作成
- 旧アプリは **そのまま温存**（`~/CC-DEV` で untracked だったものを本リポジトリへ取り込み済み。取り込まないと GH Actions の Hosting デプロイで本番から消えるため）
- 引き継ぎ元: `HANDOVER_meeting-interpreter_v0.2.0.md`（Downloads）

## 技術スタック
- Frontend: シングルファイルHTML + Tailwind CDN + バニラJS
- Backend: Firebase Functions v2 `interpreterCall`（OpenAI Realtime API SDPプロキシ）
- Hosting: Firebase Hosting（GH Actions自動デプロイ）
- AI: OpenAI `gpt-realtime` / `gpt-realtime-mini`（speech-to-speech）+ `gpt-4o-mini-transcribe`（字幕）

## ファイル構成
```
public/meeting-interpreter-duo/
├── index.html   （アプリ本体・全コード）
└── HANDOVER.md
functions/index.js   （anthropicProxy / realtimeToken(旧アプリ用・無変更) / interpreterCall(本アプリ用)）
firebase.json        （/api/realtime-token と /api/interpreter-call の rewrite）
```

## アーキテクチャ
- 1画面に独立2セッション:
  - **A: EN→JA（常時）** 入力=BlackHole 2ch → WebRTC → gpt-realtime → 日本語音声をイヤホンへ（setSinkId）
  - **B: JA→EN（プッシュ・トゥ・トーク）** 入力=外部マイク（track.enabled で PTT 制御）→ 英語音声を BlackHole 16ch へ → Meetのマイク
- `interpreterCall` は direction/model/voice/glossary をJSONで受け、サーバ側でセッション設定を組み立て（ホワイトリスト検証・Origin制限つき）
- 字幕重複は `item_id` + 直前同一テキストで除去
- 用語辞書は instructions 末尾に注入（localStorage 保存）

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/meeting-interpreter-duo/
- 旧アプリ: https://cc-dev-ps7.web.app/meeting-interpreter/
- Functionsは手動デプロイ: `npx firebase deploy --only functions`（GH ActionsはHostingのみ）

## 進捗チェックリスト
- [x] 双方向2セッション実装（EN→JA常時 / JA→EN PTT）
- [x] デバイス選択・自動推奨（BlackHole検出）・localStorage永続化
- [x] 用語辞書・通訳ログ（コピー/MD保存/クリア）・モニター再生
- [x] デバッグ情報コピー・使い方/リリースノートモーダル・設定ガイド
- [x] interpreterCall Function実装・デプロイ
- [ ] 実際のGoogle Meet会議での双方向検証
- [ ] BlackHole 16ch インストール（`brew install --cask blackhole-16ch`）

## 次のステップ
1. 実会議でEN→JAのレイテンシ・音質を確認
2. BlackHole 16ch導入後にJA→EN（PTT）を検証
3. 必要ならVAD閾値（threshold/silence_duration_ms）を調整
4. ログのFirestore保存（会議単位）を検討

## 既知の問題・注意事項
- `/api/interpreter-call` は認証なし（Origin制限のみ）。悪用が見えたら App Check 導入を検討
- OpenAI API は従量課金。長時間会議は gpt-realtime-mini 推奨
- スピーカー使用禁止（ハウリング）。「聞く」側の出力にBlackHoleを選ぶとループする
- 会議参加者へAI通訳利用の告知を忘れない
