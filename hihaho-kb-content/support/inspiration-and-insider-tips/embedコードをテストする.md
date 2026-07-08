---
id: "6842070"
slug: testing-an-embed-code
title: "embedコードをテストする"
title_en: "Testing an embed code"
category: inspiration-and-insider-tips
category_ja: 活用アイデア・上級テクニック
audience: public
source: https://support.hihaho.com/en/articles/6842070-testing-an-embed-code
summary: "Webサイト・LMS・イントラネットへの埋め込みを試せるテスト用embedコード（レスポンシブ版と固定サイズ版）の紹介。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

インタラクティブ動画を自分のWebサイト、LMS、イントラネットに埋め込むとどのように動作するか、テストすることができます。

以下の embed コードをそのまま使って試してみてください:

```html
<div style="position: relative !important; padding-bottom: 56.25% !important; height: 0px !important; overflow: hidden !important; max-width: 100% !important;"><iframe src="https://player.hihaho.com/embed/acad8749-2b16-4c3a-b33a-d1b79e811e49" frameborder="0" webkitallowfullscreen="true" mozallowfullscreen="true" allowfullscreen="true" allow="autoplay; fullscreen; clipboard-read; clipboard-write" style="position: absolute !important; top: 0px !important; left: 0px !important; width: 100% !important; height: 100% !important;"></iframe></div>
```

[公開（Publish）](https://support.hihaho.com/en/articles/5698208-publication-options)した後は、自分の動画を直接[埋め込む](https://support.hihaho.com/en/articles/5698317-how-to-retrieve-the-url-or-embed-code-of-your-published-interactive-video)ことができます。

---

レスポンシブ版の embed コードが動作しない場合は、以下のコードを試してください。width（幅）と height（高さ）は必要に応じて変更できます。

```html
<iframe src="https://player.hihaho.com/embed/acad8749-2b16-4c3a-b33a-d1b79e811e49" width="560" height="315" style="border: 0" allow="autoplay; fullscreen; clipboard-read; clipboard-write"></iframe>
```

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[LMSでSCORMパッケージをテストする]]
- [[プレーヤーパラメータ]]
