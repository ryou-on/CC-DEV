# cm-generator — URL から CM（15/30秒 × 横/縦）を自動生成

文字中心モーショングラフィックCMを、サイトURLから `brand.json` を作って一括書き出しする。

## 使い方
```bash
cd public/cm-generator
pip install playwright pillow anthropic   # 初回のみ

# 1) URL からロゴ・配色・文言を取得 → brands/<slug>/brand.json
export ANTHROPIC_API_KEY=sk-ant-...        # あれば Claude がコピーを自動生成（無ければ仮コピー）
python3 extract.py https://example.com example

# 2) brand.json のコピーを確認・手直し（needs_review: true の間は必須）

# 3) 15/30秒 × 横/縦 の4本を書き出し → out/<slug>-15s-h.mp4 など
python3 render.py brands/example/brand.json
#   絞る場合: --durations 15 --orients v --fps 30
```
サーバーで実行する場合は `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を付ける。

## 出力
| ファイル | 尺 | サイズ |
|---|---|---|
| `<slug>-15s-h.mp4` | 15秒 | 1920×1080 |
| `<slug>-15s-v.mp4` | 15秒 | 1080×1920 |
| `<slug>-30s-h.mp4` | 30秒 | 1920×1080 |
| `<slug>-30s-v.mp4` | 30秒 | 1080×1920 |

## brand.json
- `colors`: bg / fg / accent / accent2 / sub
- `logo`: `full`（単体ロゴ）。アイコンと文字が分かれたロゴは `icon` + `text` を指定するとロックアップ演出になる
- `copy`: l1a/l1b（問いかけ）, l2a/l2b（強いメッセージ）, words（3件）, words2（3件・30秒版のみ）, points（3件・30秒版のみ）, tagline, sub, cta, url
- 例: `brands/hihaho/brand.json`（手作業で作成した基準データ）

## 構成（BPM120・1拍=0.5秒）
- 15秒(30拍): 問いかけ 0–4 / 強い一言 4–8 / キーワード 8–14 / ロゴ 14–26 / CTA 26–30
- 30秒(60拍): 問いかけ 0–6 / 強い一言 6–12 / キーワード2ページ 12–28 / ロゴ＋補足3行 28–50 / CTA 50–60
- 縦は文字を画面幅に自動フィットし、ロゴはアイコン上・文字下に積む

## 既知の制約
- `extract.py` の仮コピーは原文の切り出しなので粗い。実運用は ANTHROPIC_API_KEY で自動生成するか手直しする
- ロゴは SVG 非対応（PNG/JPG のみ）。JSで描画されるサイトは取得できない場合がある
- 取得元が許可リスト外のドメインだとサーバーからは取れない（環境設定の Allowed domains に追加）
- 音声なし
