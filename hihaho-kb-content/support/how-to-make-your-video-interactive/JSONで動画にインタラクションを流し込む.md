---
id: "6471534"
slug: filling-your-video-through-json
title: "JSONで動画にインタラクションを流し込む"
title_en: "Filling your video through JSON"
category: how-to-make-your-video-interactive
category_ja: インタラクション作成
audience: public
source: https://support.hihaho.com/en/articles/6471534-filling-your-video-through-json
summary: "インタラクションをJSONでエクスポート・インポートする方法。一括翻訳・一括置換・AIによる問題追加の活用例つき。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

JSONはデータの交換・保存に使われる標準的なテキストベースのフォーマットです。JSONを使ってインタラクションのエクスポートとインポートが行えます。注: JSON以外に、APIを通じてインタラクションをインポートすることも可能です。

## JSONの基本的な使い方

**ステップ1.** エディターで動画を開きます

**ステップ2.** Settings（設定）をクリックし、インタラクションをJSONにエクスポートします:

![設定からJSONへエクスポートする画面](https://downloads.intercomcdn.com/i/o/889180160/1ef8fae2c64176cf77abf180/image.png?expires=1783476000&signature=d3f371293ffe98b2be75ec7801990bd174c99f8fb4c410d2bf153d24443f840e&req=fCguF8F%2BnIdfFb4f3HP0gEnfkx4VnJdZ3kZ27EPQpVQUzNGSJlpTkyTL26oC%0An4oWfZVVnjCzn8JPAg%3D%3D%0A)

**ステップ3.** 変更を加えます（下記の例を参照）

**ステップ4.** 調整したJSONファイルを同じ動画にインポートするか、新しい動画を作成してインポートします

---

## 活用例

### すべてのインタラクションを一括翻訳する

**ステップ1.** インタラクションをJSONにエクスポートします

**ステップ2.** ChatGPTを使い、次のようなプロンプトで各インタラクション内のテキストを翻訳します:

`In the following file translate all texts that are behind a "text": tag a "feedback_screen_correct_answer_feedback" tag a "feedback_screen_incorrect_answer_feedback" tag or a "feedback_screen_general_feedback". Translate from English to Dutch.`

（訳: 以下のファイル内で、"text" タグ、"feedback_screen_correct_answer_feedback" タグ、"feedback_screen_incorrect_answer_feedback" タグ、または "feedback_screen_general_feedback" タグの後ろにあるすべてのテキストを翻訳してください。英語からオランダ語へ。）

**ステップ3.** 新しいJSONファイルをインタラクティブ動画にインポートします

### すべてのインタラクション内の特定のテキストを変更する

**ステップ1.** インタラクションをJSONにエクスポートします

**ステップ2.** [Notepad++](https://notepad-plus-plus.org/) などのテキストエディターでファイルを開きます

**ステップ3.** ctrl+h を押して、すべてのインタラクション内の特定のテキストを置換します

![検索と置換のダイアログ](https://downloads.intercomcdn.com/i/o/889232930/3b0a7357ee6c9280e06e9ce1/image.png?expires=1783476000&signature=a88d401b4dd6d95ef6d79687fa95df02020b5d8806b0eaab447af975ac7fd853&req=fCguFMp8lIJfFb4f3HP0gEp5PiuLwNp3z4lxU1f%2FUAczhvDKHklkGdTKz5Ib%0AdIDrH1ywjfYThY4OFA%3D%3D%0A)

**ステップ4.** 新しいJSONファイルをインタラクティブ動画にインポートします

### AIで既定の質問を追加する

**ステップ1.** 多肢選択式の質問を1つと、その他の任意のインタラクションを含む動画を作成します

**ステップ2.** インタラクションをJSONにエクスポートします

**ステップ3.** 動画の設定を開き、Subtitles（字幕）タブに移動します

**ステップ4.** hihahoに文字起こし（トランスクリプション）を生成させます

**ステップ5.** 文字起こしをChatGPTに渡し、コンテンツに沿った多肢選択式の質問を指定した数だけ生成するよう依頼します

**ステップ6.** 現在のJSONファイルをChatGPTに渡し、生成した質問をタイムスタンプを含めてこのフォーマットに追加するよう依頼します

**ステップ7.** 新しいJSONファイルをインタラクティブ動画にインポートします

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[動画をパーソナライズする]]
- [[インタラクションを意図したとおりに動作させる]]
