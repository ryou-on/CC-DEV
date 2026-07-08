---
id: "6842047"
slug: solving-srt-file-problems
title: "SRTファイルの問題を解決する"
title_en: "Solving SRT File problems"
category: inspiration-and-insider-tips
category_ja: 活用アイデア・上級テクニック
audience: public
source: https://support.hihaho.com/en/articles/6842047-solving-srt-file-problems
summary: "字幕用SRTファイルがエラーになる典型的な原因（スペースの過不足・番号抜け・タイムコードのドット等）と確認方法。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

SRTファイルは、動画の字幕を作成するためのすべての情報を含むプレーンテキストファイルです。動画に追加することで、1つまたは複数のインタラクティブ字幕トラックを作成できます。

一般的に、SRTファイルを開くには Notepad（メモ帳）が最も簡単です。ファイルは次のような形式になっています:

```
1  
00:00:00,000 --> 00:00:02,000  
First text.   
Second sentence.  
  
2  
00:00:07,000 --> 00:00:10,000  
Second subtitle
```

## よくある間違い

エラーが発生したり、SRTファイルの一部しか動画に表示されなかったりする場合、通常はテキストのどこかに誤りがあります。ファイルをメモ帳で開き、上の正しい例と以下のケースを見比べて、ファイル内の間違いを見つけてください。

### スペースが1つ多い、または足りない

```
1  
00:00:00,000-->00:00:02,000  
In this example the space between the timing and arrow is missing.   
（この例では、タイミングと矢印の間のスペースが抜けています）
  
2  
00:00:02,000-->00:00:07,000  
  
Here we added a space above the actual subtitle. This will also cause errors.  
（ここでは字幕本文の上に空行を入れています。これもエラーの原因になります）
  
2  
  
00:00:02,000-->00:00:07,000  
Here we added a space above the time.
（ここでは時間の上に空行を入れています）
```

### 番号のいずれかが抜けている

```
1  
00:00:00,000 --> 00:00:02,000  
This line is ok.  
（この行は問題ありません）
  
  
00:00:07,000 --> 00:00:10,000  
Here the 2 is missing.
（ここでは「2」が抜けています）
```

### タイムコードの形式が異なる

```
1  
00:00:00,000 --> 00:00:02,000  
This line is ok  
（この行は問題ありません）
  
2  
00:00:07.000 --> 00:00:10.000  
Here, a dot has been used in the time code instead of a comma.
（ここではタイムコードにカンマではなくドットが使われています）
```

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[インタラクションJSON仕様ガイド]]
