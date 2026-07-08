---
id: "12673333"
slug: scaling-interactive-video-with-ai-in-3-steps
title: "AIでインタラクティブ動画を3ステップでスケールさせる"
title_en: "Scaling interactive video with AI in 3 steps"
category: inspiration-and-insider-tips
category_ja: 活用アイデア・上級テクニック
audience: public
source: https://support.hihaho.com/en/articles/12673333-scaling-interactive-video-with-ai-in-3-steps
summary: "JSONエクスポートとAIチャットモデルを組み合わせ、多言語版や学習レベル別などのインタラクティブ動画を素早く量産する3ステップの手順。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

インタラクティブ動画を素早くスケール（横展開）する方法をお探しですか？ JSONとAIを組み合わせれば、多言語版や学習レベル別など、さまざまなバリエーションのインタラクティブコンテンツを短時間で作成できます。

## ステップ1: インタラクションをエクスポートする

まず、インタラクションをJSON形式でエクスポートします。このオプションは、動画にインタラクションを追加する画面の「Tools（ツール）」セクションにあります。

![JSONエクスポート画面](https://downloads.intercomcdn.com/i/o/hziexk0j/1798399636/5dcb2cde1510cecef194a260e9c6/JSON+image.png?expires=1783476000&signature=b1d37f858f619bbedadc6e08eb6d40ca547a09523a4cfd9bcced1babbd44472b&req=dScuHsp3lIdcX%2FMW1HO4zemoF5NDTFk6It6ArrwihgplP3nw6z5yJuOI%2Fp5O%0AxJJSPrCz%2BYj1%2FEnltHc%3D%0A)

## ステップ2: AIチャットモデルにインタラクションを調整させる

JSONとAIによるスケールの可能性を見てみましょう。エクスポートしたJSONファイルをChatGPTなどのAIチャットモデルにアップロードし、プロンプトを入力するだけです。以下に、目的別のプロンプト例を挙げます。プロンプトを入力してJSONファイルをアップロードしたら、ステップ3に進んでください。

AIチャットモデルは、他のインタラクションに影響を与えずに特定のインタラクションだけを変更できます。たとえば、JSONに複数の種類のインタラクションが含まれている場合でも、プロンプトで「質問のみ変更する」と指定すれば、それ以外はそのまま保持されます。

### インタラクション調整の例

| 調整の種類 | プロンプト例 |
|---|---|
| インタラクションを複数言語に翻訳する | 「このJSONファイル内のすべてのインタラクションをスペイン語とドイツ語に翻訳し、別々のファイルに分けてください。」 |
| 複数の学習レベルに対応した質問を作成する | 「以下のJSONファイル内のすべての質問を、言語習熟度レベル A2・B1・B2 の各レベル向けに書き換え、別々のファイルに分けてください。」 |
| メニュータイトルを変更する | 「このJSONファイル内のすべてのメニュータイトルを、より熱意のあるタイトルに変更してください。各タイトルは5語以内にしてください。」 |
| 回答の選択肢を追加する | 「このJSONファイル内の各選択式（multiple choice）質問には回答の選択肢が2つあります。各質問にさらに2つの選択肢を提案し、ファイルに追加してください。」 |
| ハイパーリンクやiFrameのURLを置き換える | 「このJSONファイル内のすべてのURLを https://hihaho.com/contact/ から https://hihaho.com/contact-form/ に変更してください。」 |

## ステップ3: 新しいインタラクションをインポートする

まず、[動画を複製](https://support.hihaho.com/en/articles/7007370-duplicate-a-video)します。複製した動画では、新しいインタラクションに置き換えるために、古いインタラクションを削除しておくとよいでしょう。

次に、新しいJSONファイルをインポートします。

![JSONインポート画面](https://downloads.intercomcdn.com/i/o/hziexk0j/1798714521/edd82cf8b87629c0c2334e44f175/JSON+image+2.png?expires=1783476000&signature=b0b28cca37a053bbd04f8c871f96e409a52f2ebd2e3e8d4f4188efa82bb4a862&req=dScuHs5%2FmYRdWPMW1HO4zWk3uL0PZ5f%2F6SHhQbOb0Vebe8daSPNCEPYKAEQn%0AKlrM0GPGug1dTg%2BNYt0%3D%0A)

> **ヒント:** 最初に必要な数だけ動画の複製を作成し、それぞれにタイトルを付けておくと、バリエーションの管理がしやすくなります。

これで、AIが調整した新しいインタラクションがすべて動画に反映されます。公開前には必ずインタラクションの内容を確認することをおすすめします。

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[AIで動画に目次を追加する]]
- [[AIで動画に自由記述式の質問を追加する]]
