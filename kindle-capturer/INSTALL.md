# Kindle Auto Capturer v5.32.0 — セットアップガイド / Setup Guide

Kindle Cloud Reader（read.amazon.co.jp）のページを自動キャプチャし、PDF / 画像として保存するChrome拡張機能です。

A Chrome extension that automatically captures pages from Kindle Cloud Reader (read.amazon.co.jp) and saves them as a PDF or images.

---

## ⚠️ 利用上の注意 / Important Notice

**この拡張機能で作成したPDF・画像は、著作権法で認められた私的使用（個人利用）の範囲内でのみご利用ください。** 第三者への配布・共有・アップロード・販売は著作権侵害となります。DRM保護コンテンツの取り扱いは、各サービスの利用規約および著作権法に従ってください。

**PDFs and images created with this extension must be used only for personal use, within the scope of private use permitted by copyright law.** Distributing, sharing, uploading, or selling them to third parties constitutes copyright infringement. Handle DRM-protected content in accordance with each service's terms of use and applicable copyright law.

---

## 動作要件 / Requirements

| 項目 / Item | 内容 / Details |
|---|---|
| ブラウザ / Browser | Google Chrome（デスクトップ版）/ Google Chrome (desktop) |
| アカウント / Account | read.amazon.co.jp にログインできるAmazonアカウント / An Amazon account that can sign in to read.amazon.co.jp |
| その他 / Other | 追加ライブラリ不要（jspdf.min.js 同梱）/ No extra downloads needed (jspdf.min.js is bundled) |

---

## Chrome拡張への登録（インストール）/ Loading the Extension into Chrome

ストア公開はしていないため、「パッケージ化されていない拡張機能」として読み込みます。

The extension is not published on the Chrome Web Store; load it as an unpacked extension.

1. **拡張フォルダを用意する**（zipの場合は展開しておく）
   **Prepare the extension folder** (unzip it first if you received a zip).
2. Chromeのアドレスバーに `chrome://extensions` と入力して開く。
   Open `chrome://extensions` in Chrome's address bar.
3. 画面右上の**「デベロッパー モード」をON**にする。
   Turn on **"Developer mode"** at the top right.
4. 左上の**「パッケージ化されていない拡張機能を読み込む」**をクリックし、手順1のフォルダ（`manifest.json` が入っているフォルダ）を選択する。
   Click **"Load unpacked"** at the top left and select the folder from step 1 (the one containing `manifest.json`).
5. 一覧に「Kindle Auto Capturer v5.32.0 Ultimate」が表示されれば登録完了。ツールバーのパズルアイコン🧩からピン留めしておくと便利です。
   Setup is complete when "Kindle Auto Capturer v5.32.0 Ultimate" appears in the list. Pinning it via the puzzle icon 🧩 on the toolbar is recommended.

> **ヒント / Tip:** フォルダを移動・リネームすると拡張が読み込めなくなります。読み込み元フォルダは固定の場所に置いてください。
> Moving or renaming the folder breaks the extension. Keep the source folder in a fixed location.

---

## 更新方法 / Updating

1. 読み込み元フォルダのファイルを新しいバージョンで**上書き**する。
   **Overwrite** the files in the loaded folder with the new version.
2. `chrome://extensions` を開き、**「更新」ボタン（または拡張カードの ⟳）**を押す。
   Open `chrome://extensions` and click the **"Update" button (or ⟳ on the extension card)**.
3. カードのバージョン表記が新しくなっていれば反映完了。
   The update is applied when the version shown on the card changes.

> **注意 / Note:** 更新ボタンを押し忘れると本体が旧バージョンのまま動きます。その場合、編集画面の上部に赤いバージョン不一致警告が表示されます。
> If you forget to press Update, the extension keeps running the old version. In that case, a red version-mismatch warning appears at the top of the editor screen.

---

## 初回起動時の表示 / First Launch

初回にポップアップを開くと、個人利用に関する注意が日英併記で表示されます。「以後表示しない / Don't show again」にチェックを入れてOKを押すと、次回から表示されません。

The first time you open the popup, a personal-use notice is shown in Japanese and English. Check "以後表示しない / Don't show again" and press OK to hide it from the next launch onward.

---

## 言語切替 / Language Switch

ポップアップ右上の **「EN / 日本語」ボタン**で、ポップアップUIの表示言語を切り替えられます。設定は保存され、次回以降も維持されます。（編集画面は現在日本語のみです）

Use the **"EN / 日本語" button** at the top right of the popup to switch the popup UI language. The choice is saved and persists across sessions. (The editor screen is currently Japanese only.)

---

## 基本的な使い方 / Basic Usage

1. read.amazon.co.jp で対象の本を開く。
   Open the book at read.amazon.co.jp.
2. 文章の本はKindle設定を「サイズ 5 / 行間 中 / 余白 狭」にしてブラウザ幅をA4縦比率に、マンガ・雑誌はページ全体が見える幅にする。
   For text books, set Kindle to "Font size 5 / Line spacing Medium / Margins Narrow" and make the window an A4-portrait ratio; for manga/magazines, make it wide enough to show the whole page.
3. 拡張機能アイコンをクリックし、方向・本のタイプ・枚数・間隔を設定して「撮影開始」。10秒後に自動撮影が始まります。
   Click the extension icon, set direction, book type, pages, and interval, then press "Start Capture". Capture begins after a 10-second countdown.
4. 撮影中はKindleウィンドウを最前面に保つ（外れると一時停止、戻すと再開）。
   Keep the Kindle window in the foreground during capture (it pauses when unfocused and resumes when restored).
5. 完了後に編集画面が自動で開き、余白カットが適用されます。不要ページを削除して「保存」→ タイトル/著者を確認してPDF出力。
   When done, the editor opens automatically with margin-crop applied. Delete unwanted pages, press "Save", confirm title/author, and export the PDF.

詳細はポップアップの**「使い方 / Guide」ボタン**、および同梱の `README.txt`（日本語）を参照してください。

For details, see the **"使い方 / Guide" button** in the popup and the bundled `README.txt` (Japanese).

---

## トラブルシューティング / Troubleshooting

| 症状 / Symptom | 対処 / Fix |
|---|---|
| 「read.amazon.co.jp を開いてから実行してください」と出る / "Open read.amazon.co.jp first" message | Kindle Cloud Readerのタブをアクティブにしてから撮影開始する / Make the Kindle Cloud Reader tab active before starting |
| 撮影が一時停止したまま / Capture stays paused | Kindleのウィンドウ／タブを最前面に戻す / Bring the Kindle window/tab back to the front |
| PDFが保存できない / PDF won't save | `chrome://extensions` で拡張を更新（⟳）してから再試行 / Update the extension (⟳) at `chrome://extensions` and retry |
| 編集画面に赤い警告が出る / Red warning in the editor | 本体が旧バージョンです。「更新」を押してから撮影・編集をやり直す / The core is outdated; press "Update", then capture and edit again |
| ページ送りが効かない / Page turning stops working | Amazon側のUI仕様変更の可能性。拡張の更新を待つ / Amazon may have changed their UI; wait for an extension update |

---

*Kindle Auto Capturer v5.32.0 Ultimate — Personal use only.*
