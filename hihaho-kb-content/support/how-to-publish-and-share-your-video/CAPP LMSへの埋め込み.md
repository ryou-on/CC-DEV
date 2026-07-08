---
id: "5695436"
slug: embedding-in-capp-lms
title: "CAPP LMSへの埋め込み"
title_en: "Embedding in CAPP LMS"
category: how-to-publish-and-share-your-video
category_ja: 公開・共有
audience: public
source: https://support.hihaho.com/en/articles/5695436-embedding-in-capp-lms
summary: "CAPP LMSにhihaho動画を埋め込む際は、通常の埋め込みと異なりURLに/embed/を挿入して使用する手順の解説。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

CAPP LMSにインタラクティブ動画を埋め込む手順は、通常の埋め込みとは異なります。以下のステップに従えば、hihaho動画を問題なく統合できます。

## 手順

**ステップ1.** hihahoで動画をPublish（公開）します。

**ステップ2.** 動画のURLをコピーします（embed code（埋め込みコード）ではありません！）

例: `https://player.hihaho.com/98dbd621-7c24-46de-8180-016064ad29ff`

**ステップ3.** CAPPで動作するようにURLを修正します

次のURLを:

```
https://player.hihaho.com/98dbd621-7c24-46de-8180-016064ad29ff
```

以下のように変更します:

```
https://player.hihaho.com/embed/98dbd621-7c24-46de-8180-016064ad29ff
```

重要な修正点は、URLパスのドメインと動画IDの間に `/embed/` を挿入することです。

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[Articulate Rise 360に動画を埋め込む]]
- [[EasyGeneratorにインタラクティブ動画を追加する]]
