---
id: "5697208"
slug: creating-a-mailto-button
title: "mailtoボタンを作成する"
title_en: "Creating a mailto button"
category: inspiration-and-insider-tips
category_ja: 活用アイデア・上級テクニック
audience: public
source: https://support.hihaho.com/en/articles/5697208-creating-a-mailto-button
summary: "動画内のボタンから視聴者のメールクライアントを起動し、宛先や件名を事前入力したメール作成画面を開く方法。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

## 概要

mailto リンクを使うと、視聴者が指定したメールアドレス宛にメールを送信できます。視聴者が動画内のこのボタンをクリックすると、あらかじめ指定した情報が入力された状態で、メールクライアントが自動的に開きます。

## 基本の書式

次の書式を使用します。`email@xample.com` の部分は実際のメールアドレスに置き換えてください。

```
mailto://email@xample.com
```

## 件名を追加する

次のパラメータを末尾に追加すると、件名を含めることができます。「Exampletext」の部分を任意の件名に置き換えてください。

```
?subject=Exampletext
```

## 重要な動作条件

> この機能は、視聴者が Windows の Outlook や Android の Gmail のようなメールクライアントをインストールしている場合にのみ動作します。

## 画像

![mailtoボタンの設定例1](https://downloads.intercomcdn.com/i/o/412578095/ceaadb4b6aed265fb00ca219/image.png?expires=1783476000&signature=27225d2c374bc904ac65b6b5c2b53dccab48fa7d48997bc84299515dcbd958df&req=cCElE852nYhaFb4f3HP0gBW4cwk4GFTwc9JVLH02EO8%2BmnHmp7D7LpiTwEmS%0AQ6vsgwt7JVgo6qjPyA%3D%3D%0A)

![mailtoボタンの設定例2](https://downloads.intercomcdn.com/i/o/412578304/2b640c0370dcac3d94a7a5c0/image.png?expires=1783476000&signature=249398eb039fe9b13b38bc352bc4f35cee43d9ea5e7529d9a68f1773e0611c78&req=cCElE852noFbFb4f3HP0gE7%2BBAOxGIXDOR4DAI1wiY77OVkgnOj2e7%2BYMlL8%0ACz7i3MWlO94XklKfGA%3D%3D%0A)

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[「今すぐ電話」ボタンを作成する]]
- [[WhatsAppボタンを作成する]]
- [[WooCommerceで「カートに追加」ボタンを作成する]]
