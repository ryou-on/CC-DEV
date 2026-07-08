---
id: "5576862"
slug: connecting-your-mediasite-account
title: "Mediasiteアカウントを接続する"
title_en: "Connecting your Mediasite account"
category: how-to-select-your-video
category_ja: 動画の追加・接続
audience: public
source: https://support.hihaho.com/en/articles/5576862-connecting-your-mediasite-account
summary: "MediasiteのAPI認証情報と必要な権限を用意し、hihahoのフォルダー設定からアカウントを接続する手順。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

執筆: Melanie
2023年2月13日

## 概要

Mediasiteの動画にインタラクティブレイヤーを追加したいですか？アカウントを接続すれば、最近アップロードしたすべての動画の一覧を hihaho 内で直接確認できます。

この接続を作成するには、まずMediasiteのAPI認証情報が必要です。

## 必要な権限

API認証情報のリクエストは、Mediasite側で以下の権限を持っている場合にのみ可能です:

* API Access（APIアクセス）
* Manage Auth Tickets（認証チケットの管理）
* User Profile Management（ユーザープロファイル管理）
* Impersonation（なりすまし／代理実行）

これらの権限を自分で持っていない場合、または見つけられない場合は、組織のシステム管理者かMediasiteのサポートデスクに確認してください。おそらく対応してもらえるはずです。

## 接続手順

API認証情報を入手したら、hihaho で以下の手順に従ってください。

**ステップ1:** アカウント名をクリックします。ドロップダウンメニューが表示されます。

**ステップ2:** メニューから「Folder settings（フォルダー設定）」を選択します。

![Mediasiteの接続方法](https://hihaho-dbfa911c715e.intercom-attachments-1.com/i/o/390231708/1eeef2c741643f0fa1096c4a/how-to-connect-Blue-Billywig_1-1.gif?expires=1783476000&signature=d86b3dd5e7a9151f87a87f9b8e014ebd42cb07da7bbd30b835761a6c29b468fe&req=dyknFMp%2FmoFXFb4f3HP0gMvgp0Zvc8WniqHMxxd6kovAfq%2FvXTNZ%2F4ELMUhs%0Aqf6Ux9N4TC7ogte5pg%3D%3D%0A)

**ステップ3:** Mediasiteに接続したいフォルダーを選びます。フォルダー右側の鉛筆アイコンをクリックして編集します。

**ステップ4:** 「Connections（接続）」タブを選択し、Mediasiteの横にある「Connect（接続）」ボタンをクリックします。

**ステップ5:** 環境名、ユーザー名、パスワード、APIキーを入力します。

## FAQ

**「Your playback ticket has expired.（再生チケットの有効期限が切れました）」とはどういう意味ですか？**

この通知は、Mediasiteのセッションが期限切れになったことを意味します。hihaho のWebページを再読み込みするだけで、通知は消えるはずです。

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[JW Playerアカウントを接続する]]
- [[Kalturaアカウントを接続する]]
- [[Blue Billywigアカウントを接続する]]
