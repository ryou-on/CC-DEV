# HANDOVER.md - cm-generator（URL から CM を自動生成）

## 基本情報
- バージョン: v0.1.0（Phase 1・MVP）
- 最終更新: 2026-10-03
- 作業ブランチ: `claude/gifted-wozniak-hjm3od`（main 未マージ・本番未デプロイ）
- 目的: サイトURLから、文字中心モーショングラフィックCMを **15/30秒 × 横/縦** で自動生成する

## 技術スタック
- 描画: HTML Canvas（`seek(t)` の純粋関数）+ Playwright で全フレーム撮影
- 書き出し: ffmpeg（H.264 / yuv420p / crf 18 / 30fps / 音声なし）
- 取得: Python（urllib + Pillow）。コピー自動生成は Claude API（任意）
- Hosting: 未デプロイ（生成物は MP4。サイトに載せる場合のみ `public/cm-generator/`）

## ファイル構成
```
public/cm-generator/
├── extract.py        # URL → brands/<slug>/brand.json（ロゴ・配色・コピー）
├── render.py         # brand.json → out/<slug>-{15,30}s-{h,v}.mp4
├── template.html     # 共通テンプレ（BRAND / CFG を render.py が注入）
├── brands/
│   ├── hihaho/       # 手作業で作った基準データ（icon/text/full + brand.json）
│   └── sylavids/     # extract.py の試験出力（仮コピーのまま。要手直し）
├── out/              # hihaho の4本（15s-h / 15s-v / 30s-h / 30s-v）
└── README.md
public/hihaho-cm/     # 先行して作った hihaho 15秒横版（単体版・MP4あり）
public/sylavids-cm/   # Sylavids 15秒横版（単体版・MP4あり）
```

## 使い方
```bash
pip install playwright pillow anthropic
cd public/cm-generator
export ANTHROPIC_API_KEY=...                       # あればコピー自動生成（無ければ仮コピー）
python3 extract.py https://example.com example     # → brands/example/brand.json
# brand.json を確認・手直し（needs_review: true の間は必須）
python3 render.py brands/example/brand.json        # 4本を一括書き出し
#   --durations 15 --orients v --fps 30 で絞り込み
```
サーバーで実行する場合は `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を付ける。
所要時間の目安（30fps）: 15秒=約1〜2分 / 30秒=約2〜3分。4本で約8分。

## 仕組み
- BPM120・1拍=0.5秒。15秒=30拍、30秒=60拍。シーン開始拍は `template.html` の `L` で定義
  - 15秒: 問いかけ 0–4 / 強い一言 4–8 / キーワード 8–14 / ロゴ 14–26 / CTA 26–30
  - 30秒: 問いかけ 0–6 / 強い一言 6–12 / キーワード2ページ 12–28 / ロゴ＋補足3行 28–50 / CTA 50–60
- 縦（1080×1920）は文字を画面幅に自動フィット（`fit()`）、ロゴはアイコン上・文字下
- ロゴは `icon`+`text` があればロックアップ演出、`full` のみなら単体ロゴのポップ＋ワイプ
- 番号（01〜03）は手順など順序がある内容のときだけ使う（現状のテンプレは番号なし）

## brand.json 仕様
- `colors`: bg / fg / accent / accent2 / sub
- `logo`: `full`（必須に近い）/ `icon` / `text`（brand.json からの相対パス、PNG/JPG）
- `copy`: l1a・l1b（問いかけ）, l2a・l2b（強い一言）, words(3), words2(3・30秒のみ), points(3・30秒のみ), tagline, sub, cta, url
- コピーの目安: l1a/l2a は8字以内、l1b/l2b は6字以内、words 系は9字以内、tagline は16字以内

## 進捗チェックリスト
- [x] hihaho 15秒CM（横・単体版）
- [x] 補足コピー「16種類のインタラクション」に修正
- [x] 共通テンプレ化（15/30秒 × 横/縦）
- [x] `extract.py`（ロゴ・配色取得、仮コピー、Claude API コピー生成の実装）
- [x] hihaho の4本を書き出し・代表フレーム確認
- [x] ブランチへ push
- [ ] **k-dc.net で動作確認**（ネットワーク許可待ち。下記参照）
- [ ] `ANTHROPIC_API_KEY` 経路の実機テスト（未テスト）
- [ ] 30秒版の見直し（ロゴ画面が約11秒と長い。シーン追加案は下記）
- [ ] 音声（BGM/ビート）
- [ ] main へのマージ・本番デプロイ（ユーザー指示待ち）

## 次のステップ
1. 新しいセッションを開始し、環境の Allowed domains に `k-dc.net` `*.k-dc.net` を追加
2. 「`cm-generator` で https://k-dc.net/ の CM を作って」と依頼 → `extract.py` → コピー確認 → `render.py`
3. 結果を見て、取得失敗パターン（JS描画・SVGロゴ・ロゴ未検出）への対策を入れる
4. 30秒版のテンポ改善（ロゴ画面の短縮、ユースケース/数字シーンの追加）
5. Web アプリ化する場合は Cloud Run 等で書き出しサーバーを用意（Firebase Hosting だけでは MP4 書き出し不可）

## 既知の問題・注意事項
- **ネットワーク**: 環境は Custom（許可リスト制）。許可していないドメインは取得できない。環境設定の変更は**新しいセッションにのみ**反映される（現セッションでは反映されない）。回避は「Full に変更」「事前に広めに登録」「Mac ローカルで実行」のいずれか
- `extract.py` の仮コピーは原文の切り出しで粗い（sylavids で確認済み）。実運用は API キーで自動生成するか手直し
- ロゴは SVG 非対応（PNG/JPG のみ）。公式サイトに低解像度しか無い場合はぼやける（hihaho アイコンは 200px）
- 色は自動抽出のため、明暗の相性が外れることがある（bg はアクセント色を暗くして作る）
- サーバーのフォントは IPAGothic（太字なし）。Mac で再書き出しすると Hiragino の太字になる
- hihaho 版のロゴ素材は手作業で切り出し（アイコン+文字の分離）。他ブランドは単体ロゴ演出になる
- `git add -A` は使わない（個別ファイル指定）。デプロイ時は GitHub Actions URL と本番URLの両方を必ず表示する
- hihaho の iframe 課金ルール（カードはサムネのみ、iframe はモーダル内）はサイト掲載時に厳守。CM本編は MP4 なので影響なし

## プレビュー・成果物
- hihaho 15秒 ブラウザプレビュー（Artifact）: https://claude.ai/artifact/WMLVv9fygCifDfHaaczAjN
- MP4: `public/cm-generator/out/hihaho-{15,30}s-{h,v}.mp4` / `public/hihaho-cm/hihaho-cm.mp4`

## デプロイ先（main にマージした場合）
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/cm-generator/ （hihaho 単体版: `/hihaho-cm/` / Sylavids: `/sylavids-cm/`）
