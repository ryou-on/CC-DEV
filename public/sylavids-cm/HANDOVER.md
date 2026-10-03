# HANDOVER.md - Sylavids 15秒CM（単体版）

> **後継プロジェクト: `public/cm-generator/HANDOVER.md` を参照。** URL から 15/30秒 × 横/縦を自動生成する汎用ツール。hihaho 版も完成済み（`public/hihaho-cm/`）。
> このファイルは Sylavids 単体版（15秒・横）の記録として残す。「次にやること」は完了済みなので、続きの作業は cm-generator 側で行う。


## 基本情報
- バージョン: v0.1.0（CM素材。アプリ本体ではない）
- フェーズ: Phase 1（MVP・モック）
- 最終更新: 2026-10-03
- 作業ブランチ: `claude/gifted-wozniak-hjm3od`（main へは未マージ・未デプロイ）

## 目的
1. **Sylavids 15秒CM**（文字中心モーショングラフィック）— 完成済み。
2. **hihaho 15秒CM** — 完成（`public/hihaho-cm/`）。

## 仕組み（Sylavids CM で確立済み）
- `index.html` に `window.DURATION`（15）と `window.seek(t)` を定義。全描画は `t` の純粋関数（`Date.now` / rAF / CSS transition に依存しない）。
- BPM120・4拍子。1拍 = 0.5秒、15秒 = 30拍。演出は拍番号で記述。
- `window.READY`（画像・フォントの読み込み Promise）を `render.py` が待ってから撮影。
- `render.py` が Playwright で全フレームを PNG 撮影 → ffmpeg で H.264 MP4 に変換（`-pix_fmt yuv420p` 必須、crf 18）。
- このサーバーで実行する場合:
  ```bash
  pip install playwright
  cd public/<project>
  CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome python3 render.py 30
  ```
  30fps で約1分。Mac なら `CHROMIUM_PATH` 不要（`playwright install chromium` 後に `python3 render.py`）。
- コピーは `index.html` 冒頭の `COPY`、配色は `COLOR` を書き換えるだけ。ロゴは `LOGO.icon` / `LOGO.word` の画像。

## シーン構成（Sylavids 版 / hihaho 版もこの尺を踏襲）
| 拍 | 秒 | 内容 |
|---|---|---|
| 0–4 | 0–2 | 問いかけ（マスク付きせり上がり） |
| 4–8 | 2–4 | アクセント色背景にワイプ、強いメッセージを1文字ずつ表示 |
| 8–14 | 4–7 | 3つのキーワードを2拍ごとに積む（番号01〜03は手順など実際の順序がある場合のみ） |
| 14–26 | 7–13 | 白背景に反転 → ロゴ（アイコンがポップ → ワードマークがワイプ）→ タグライン＋補足1行 |
| 26–30 | 13–15 | ロゴ縮小 → CTA → URL → フェードアウト |

## Sylavids 版の現行コピー（参考）
- 資料を、**読み上げるだけ？** / 受け手の疑問を、**先回りする。** / 意図を渡す → 理解を整える → 何度でも届ける
- タグライン: 説明を、伝わる資産に。 / 補足: PowerPoint / PDF から、あなたの声の説明動画へ。
- CTA: まずは、1本から。 / sylavids.com
- 配色: アクセント `#2b917b`（ロゴのグリーン）、背景 `#0b1512`、前景 `#f4f7f5`

## ファイル構成
```
public/sylavids-cm/
├── index.html          # 描画（seek(t)）。ブラウザで開くと実時間ループ再生
├── render.py           # 書き出し（Playwright + ffmpeg）
├── logo-icon.png       # 添付ロゴ（アイコン 330x330）
├── logo-wordmark.png   # 添付ロゴ（ワードマーク 744x153）
├── sylavids-cm.mp4     # 完成動画（1920x1080 / 30fps / 音声なし）
└── HANDOVER.md
```

## プレビュー（Artifact）
- Sylavids 版: https://claude.ai/artifact/6G1suxHPqu4NZikFfJbd2Y
- 作り方: `index.html` のスクリプトに、ロゴを base64 の data URI で埋め込み、再生/一時停止・シークバー・シーン別ジャンプの UI を付けた1枚の HTML として公開（外部 fetch は CSP でブロックされるため画像は必ず埋め込む）。フォントは Google Fonts の Noto Sans JP を読み込み、`document.fonts.load` 完了後に描画開始。

## デプロイ先（main にマージした場合）
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/sylavids-cm/ （hihaho 版は `/hihaho-cm/`）

## 進捗チェックリスト
- [x] Sylavids 15秒CM（シーン設計・ロゴ適用・サイト文言準拠のコピー）
- [x] MP4 書き出し・代表フレーム確認
- [x] ブラウザ再生プレビュー（Artifact）
- [x] ブランチへ push
- [x] hihaho 公式サイトからの文言・ロゴ取得（hihaho.com/video-interactive-jp/）
- [x] hihaho 15秒CM 作成・書き出し・プレビュー（`public/hihaho-cm/`、プレビュー: https://claude.ai/artifact/WMLVv9fygCifDfHaaczAjN ）
- [ ] main へのマージ・本番デプロイ（ユーザー指示待ち）

## 既知の問題・注意事項
- hihaho 版メモ: 元ロゴ(primary)はアイコン込みのため文字部分だけ `logo-text.png` に切り出し、アイコン＋文字のロックアップで描画。配色は ネイビー`#043348` / ピンク`#fc167b` / シアン`#2ed6e3`。
- （旧）この環境ではネットワークが Trusted（許可リスト制）で、任意サイトは遮断される。環境設定の変更は**新しいセッションにのみ**反映される。
- サーバーのフォントは IPAGothic（太字なし）。Mac で再書き出しすると Hiragino の太字になる。
- アイコン → ワードマークの切り替え瞬間に、薄れていくアイコンがワードマークの一部に重なる（軽微。必要なら調整）。
- 音声（BGM/ビート）は未実装。入れる場合は ffmpeg に `-i audio.wav` を追加。
- `git add -A` は使わない（個別ファイル指定）。デプロイ後は GitHub Actions URL と本番URLの両方を必ず表示する。
- hihaho 関連の注意: iframe はモーダル open 時のみ生成（カードにはサムネのみ）。CM本編は MP4 なのでこの制約は影響しないが、サイト掲載時は守る。
