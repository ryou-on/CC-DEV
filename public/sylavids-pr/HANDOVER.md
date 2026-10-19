# HANDOVER.md - Sylavids プロモーション動画 30秒

## 基本情報
- バージョン: v0.1.0（確認版・音声なし）
- フェーズ: Phase 1（モック／確認版）
- 最終更新: 2026-10-19
- 作業ブランチ: `claude/tender-ptolemy-f972fg`
- 制作仕様: `SPEC_from_chat.md`（チャットで作成された引き継ぎ書の原本）

## 納品物
| ファイル | 内容 |
|---|---|
| `sylavids-pr.mp4` | 確認用 MP4（1920×1080／30fps／30.0秒／H.264 High／yuv420p／faststart／音声なし） |
| `index.html` | 編集ソース。`seek(t)` で任意時刻を描画。ブラウザで開くとシークバー付きでプレビューできる |
| `render.py` | Playwright で全900フレームを撮影 → ffmpeg で MP4 化。`--qa` で代表フレームと境界だけ PNG 保存 |
| `assets/logo-*.png` | 正式ロゴ（`public/sylavids-cm/` から流用。カタログから抽出済みのもの） |
| `fonts/` | Noto Sans JP（SIL OFL 1.1）を使用文字だけに絞ったもの。コピーを変えたら作り直す（下記） |

## シーン構成（6 × 5秒）
| 秒 | 主テロップ | 画面 |
|---|---|---|
| 0–5 | 同じ説明を、何度も？ | 資料カードが重なる（概念図） |
| 5–10 | いつもの資料を、説明動画に。 | 資料カード → 実画面 `editor.png` |
| 10–15 | 「読み上げ」から「説明」へ。 | 問い・理由・具体例 ＋ 実画面 `import.png`／「AIの原稿は下書き。仕上げは、あなたが確認。」 |
| 15–20 | 変わったところだけ、直す。 | 5枚中1枚を強調 → 原稿を更新 → 音声を再生成（概念図） |
| 20–25 | 営業にも。研修にも。 | 営業説明・新人研修・規程研修 ＋ 実画面 `play.png` |
| 25–30 | その説明、今日、動画に。 | 正式ロゴ＋sylavids.com（26.9秒〜最後まで約3秒表示） |

- 出入り: フェード＋24px の位置移動（0.5〜0.6秒）。シーン末尾0.4秒でフェードアウト（最終シーンを除く）。ズーム・点滅なし。
- 文字サイズ: 主テロップ 88〜100px、補足 40px。

## 実画面の差し替え（未完了）
カタログの実画面3枚がまだ届いていないため、今は「実画面 差し込み予定」の枠を表示している（架空UIは描いていない）。
1. `assets/editor.png`・`assets/import.png`・`assets/play.png` を置く（比率は自動で収まる）
2. どの画面をどのシーンに出すかは `index.html` の `SCREENS` で変更
3. 再書き出し:
   ```bash
   pip install playwright && playwright install chromium   # Mac 初回のみ
   cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/public/sylavids-pr"
   python3 render.py --qa   # qa/ に代表フレームを保存して確認
   python3 render.py        # sylavids-pr.mp4 を書き出し（約2分）
   ```
   クラウド環境では `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を付ける。

## コピーを変えたとき（フォントの作り直し）
フォントは使用文字だけに絞っているので、新しい漢字を足したら作り直す。
```bash
pip install fonttools
# Google Fonts から Noto Sans JP 500/700/900 の TTF を取得し、index.html の文字で絞る
python3 -c "import pathlib;s=set(pathlib.Path('index.html').read_text())|set(map(chr,range(32,127)));pathlib.Path('/tmp/chars.txt').write_text(''.join(sorted(c for c in s if c.isprintable())))"
pyftsubset NotoSansJP-900.ttf --text-file=/tmp/chars.txt --output-file=fonts/NotoSansJP-900.ttf --layout-features='*'
# 500 / 700 も同様
```

## QA チェック
- [x] 30秒／1080p／30fps／H.264／yuv420p／faststart（ffprobe で確認）
- [x] 全6シーンの代表フレームと境界の確認
- [x] 日本語の文字化け・見切れ・重なりなし
- [x] 正式ロゴを歪めず使用（比率固定）。実画面は捏造せず差し込み枠
- [x] CTA（sylavids.com）を約3秒表示
- [x] 音声なし（ナレーション案は未収録）
- [x] 価格・速度・AIの精度について根拠のない表現なし（「約3分」も不使用）
- [ ] 実画面3枚の差し込み
- [ ] ユーザーの最終デザイン承認
- [ ] ナレーション（Hana 等を使う場合はサービス・声モデル・費用上限・実行許可を確認してから）

## 既知の問題・注意事項
- ロゴは `public/sylavids-cm/` で使ったもの（アイコン＋ワードマークの画像）。仕様書の `assets/logo.png`（カタログ原本）とは別ファイルなので、原本と違いがあれば差し替える。
- カタログ内の旧表記「しらびず」は画面素材側の表記なので、差し込み時に描き変えない。
- 配信・アップロード・hihaho のリンク設定は別工程（未実施）。
