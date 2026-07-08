---
id: "5695482"
slug: xapi-tin-can-api-guide
title: "xAPI / Tin Can API ガイド"
title_en: "xAPI / Tin Can API guide"
category: how-to-publish-and-share-your-video
category_ja: 公開・共有
audience: public
source: https://support.hihaho.com/en/articles/5695482-xapi-tin-can-api-guide
summary: "xAPI（Tin Can API）の概要、hihahoでの有効化手順、送信されるxAPIコマンド・動詞（verb）の一覧を解説。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

> ⚠ この機能がアカウントに表示されない場合、お使いのプランに含まれていない可能性があります。サポートいたしますので、[info@hihaho.com](mailto:info@hihaho.com) までメールでお問い合わせください。

このガイドでは xAPI に関する情報を提供します。

---

## xAPIとは？

xAPI は Tin Can API または experience API とも呼ばれます。[SCORM](https://support.hihaho.com/en/articles/5694732-exporting-your-video-as-a-scorm-package) の後継と位置づけられる技術です。

xAPI を使うと、書籍を読む、カンファレンスに参加する、hihaho 動画を視聴するといった、いわゆるマイクロラーニングを記録し、その結果を Learning Record Store（LRS）に保存できます。

xAPI の優れた点は、LMS（学習管理システム）の外側にある学習動画の結果も追跡できることです。hihaho の典型的な使い方として、インタラクティブ動画のリンクをメールで送るケースがあります。視聴者はリンクをクリックするだけで、結果が自動的に LRS に保存されます。

マイクロラーニングと xAPI の分かりやすい入門記事は [elearningindustry.com](https://elearningindustry.com/tracking-microlearning-with-tin-can-api) にあります。

---

## xAPIを有効にする方法

Video Settings（動画設定）ページの LMS タブを開きます。

「Enable xAPI（xAPIを有効にする）」トグルを Yes に切り替え、Tin Can Endpoint、ユーザー名、パスワードを入力します。Learning Record Store（LRS）のエンドポイントとは、すべての LRS リクエストを処理するリンク（URL）のことです。このテキストフィールドにエンドポイントの URL を入力またはコピーしてください。

最後に「Save（保存）」ボタンをクリックします。

![xAPI設定画面（LMSタブのEnable xAPIトグルとTin Can Endpoint入力欄）](https://downloads.intercomcdn.com/i/o/453970285/b109c03c8d296caff41772f6/chrome_7Q0lTXFJxx.png?expires=1783476000&signature=5cd15668167510d4131e6670d93007a13f4c4eb1c3bf6119b908cc5c396fefe0&req=cCUkH85%2Bn4laFb4f3HP0gOoLakMET44Fj3gYm2IV6S1S3M5apKN08xE638%2Bc%0AD%2FnSAj5aPK%2FV4vR3xw%3D%3D%0A)

---

## よくある質問

**hihahoはどうやって「誰が動画を見終わったか」を登録するのですか？**

現在のユーザーのメールアドレスが不明な場合、視聴者にメールアドレスの入力を促すプロンプトが表示されます。

**hihahoはxAPIを通じてどんなコマンドを送信しますか？**

動画は xAPI を通じて複数のコマンドをお使いの LRS に送信します。hihaho は「course」と「video」の xAPI レシピを使用しています。xAPI レシピの詳細は [https://tincanapi.com/recipes/](https://tincanapi.com/recipes/) をご覧ください。

| コマンド | 説明 | レシピ | Verb |
|---------|------|--------|------|
| I attempted a session for an elearning course | 動画が初めて再生されたときに、この xAPI コマンドが送信されます。 | course | [http://adlnet.gov/expapi/verbs/attempted](http://adlnet.gov/expapi/verbs/attempted) |
| I answered an elearning course question | 質問に回答があったときに、xAPI コマンドが送信されます。 | course | [http://adlnet.gov/expapi/verbs/answered](http://adlnet.gov/expapi/verbs/answered) |
| I completed a session for an elearning course | 視聴者が動画全体を視聴し終えたときに、この xAPI コマンドが送信されます。 | course | [http://adlnet.gov/expapi/verbs/completed](http://adlnet.gov/expapi/verbs/completed) |
| I passed an elearning course | 視聴者が動画の合格に必要な最低パーセンテージを超えるスコアを取ったときに送信されます。この設定は xAPI 設定の隣、「Reporting（レポート）」タブにあります。 | course | [http://adlnet.gov/expapi/verbs/passed](http://adlnet.gov/expapi/verbs/passed) |
| I failed an elearning course | 視聴者が合格に必要な最低パーセンテージに達しなかったときに送信されます。 | course | [http://adlnet.gov/expapi/verbs/failed](http://adlnet.gov/expapi/verbs/failed) |

**追加のxAPI動詞（Extra verbs）**

| Verb | IRI | トリガー |
|------|-----|---------|
| PLAYED | [https://w3id.org/xapi/video/verbs/played](https://w3id.org/xapi/video/verbs/played) | 動画の再生 |
| PAUSED | [https://w3id.org/xapi/video/verbs/paused](https://w3id.org/xapi/video/verbs/paused) | 動画の一時停止 |
| SEEKED | [https://w3id.org/xapi/video/verbs/seeked](https://w3id.org/xapi/video/verbs/seeked) | ユーザーによるシーク操作 |
| INITIALIZED | [http://adlnet.gov/expapi/verbs/initialized](http://adlnet.gov/expapi/verbs/initialized) | プレイヤーの準備完了 |
| TERMINATED | [http://adlnet.gov/expapi/verbs/terminated](http://adlnet.gov/expapi/verbs/terminated) | ユーザーが動画から離脱・動画を閉じたとき |
| INTERACTED | [http://adlnet.gov/expapi/verbs/interacted](http://adlnet.gov/expapi/verbs/interacted) | ミュート/ミュート解除/音量/フルスクリーンの操作 |

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[LMSやeラーニングにインタラクティブ動画を追加するには？]]
