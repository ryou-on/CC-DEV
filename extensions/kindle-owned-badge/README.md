# Kindle Owned Badge — Chrome拡張

Amazon.co.jp の商品サムネイルに、購入済み・Kindle Unlimited利用済みの「済」バッジを重ねて表示するChrome拡張。

- バージョン: v0.3.0
- 最終更新: 2026-08-09
- 配置場所: `extensions/kindle-owned-badge/`（Firebase Hostingへはデプロイされないローカル拡張）

## 仕組み

1. **ライブラリ同期** — Web版Kindle（read.amazon.co.jp）のライブラリAPI `/kindle-library/search` を全ページ分たどり、所有ASINと入手種別（購入 / Kindle Unlimited等）を `chrome.storage.local` に保存
   - 注意: このAPIで取れるKindle Unlimitedは**現在借りている本のみ**。返却済みKU本の一覧を取得できるAPI・ページはAmazonに存在しない（ku-central・注文履歴・コンテンツと端末の管理いずれも不可）
2. **利用履歴の収集** — 商品詳細ページの「Kindle Unlimitedで〇月〇日に利用しました」バナー（`#booksInstantOrderUpdate`）を検出し、返却済みKU本・購入済み本を `kuHistoryItems` として蓄積。一度商品ページを開いた本は以後どのページでもバッジ表示される（ライブラリ同期とマージ、同期側優先）
3. **バッジ表示** — Amazon.co.jp の各ページで商品リンク（`/dp/ASIN` 等）や `data-asin` 属性からASINを抽出し、所有リストに含まれていればサムネイル右上にバッジを重ねる
   - 🔴 赤「済」= 購入済み
   - 🟦 ティール「済」= Kindle Unlimited / コミックUnlimited / Prime Reading で利用済み

検索結果・カルーセル（おすすめ枠）・商品詳細ページ・Kindleストア本棚ページ（`/kindle-dbs/hz/bookshelf`）に対応。

KindleストアページはShadow DOM（web components）で構築されているため、shadow rootを再帰的にたどってスキャンする。CSSはshadow root内へ届かないためバッジのスタイルは全てインライン指定。書影が `<bds-book-cover-image>` などさらに内側のshadow rootにある場合はアンカー要素自体にバッジを付ける。動的追加へは MutationObserver（通常DOM）＋3秒間隔の定期再スキャン（shadow DOM）で追従する。

## インストール手順

1. Chromeで `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」→ このフォルダ（`extensions/kindle-owned-badge/`）を選択

## 使い方

1. 拡張アイコンをクリック → 「ライブラリを同期」を押す
   - Web版Kindle（read.amazon.co.jp）のタブが開き、自動で同期が走る（未ログインの場合は先にログインが必要）
   - read.amazon.co.jp を開くだけでも自動同期される（10分間隔の制限つき）
2. Amazon.co.jp を開くと、所有済みの本のサムネイルに「済」バッジが表示される

## ファイル構成

```
extensions/kindle-owned-badge/
├── manifest.json            # Manifest V3
├── icons/                   # 拡張アイコン（赤地に白「済」）
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── content/
│   ├── amazon-badge.js      # Amazonページへのバッジ注入（Shadow DOM対応・スタイルはインライン）
│   └── library-sync.js      # Web版KindleライブラリAPIの同期
├── popup/
│   ├── popup.html           # ポップアップUI（同期状況・手動同期・デバッグコピー）
│   └── popup.js
└── README.md
```

## 既知の問題・注意事項

- ライブラリAPIは非公式のため、Amazon側の変更で同期が動かなくなる可能性あり（バッジ表示側は `chrome.storage` のキャッシュで動き続ける）
- サンプル本（originType: SAMPLE）は所有扱いにしない
- 対象は amazon.co.jp / read.amazon.co.jp のみ（他リージョン非対応）
- 紙の本とKindle版でASINが異なるため、バッジが付くのはKindle版のサムネイルのみ

## 次のステップ候補

- [ ] バッジのON/OFF・表示位置のオプション設定
- [ ] 定期自動同期（chrome.alarms）
- [ ] kuHistoryItems のエクスポート/インポート（別マシンへの履歴移行用）
