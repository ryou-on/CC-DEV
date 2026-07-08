---
id: "5577525"
slug: connecting-your-panopto-account
title: "Panoptoアカウントを接続する"
title_en: "Connecting your Panopto account"
category: how-to-select-your-video
category_ja: 動画の追加・接続
audience: public
source: https://support.hihaho.com/en/articles/5577525-connecting-your-panopto-account
summary: "PanoptoでAPIクライアントを作成し、hihahoのフォルダに接続してPanopto動画を利用する手順の解説。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

Panoptoの動画にインタラクティブレイヤーを追加したいですか？アカウントを接続すると、最近アップロードしたすべての動画の一覧をhihaho内で直接確認できます。

## Panopto側で連携を設定する

この接続を作成するには、まずPanoptoのAPI認証情報が必要です。この認証情報を取得するにはPanoptoの管理者権限が必要です。管理者権限をお持ちでない場合は、組織のシステム管理者にお問い合わせください。

**ステップ1:** Panoptoサイトに管理者（Administrator）としてログインし、**System（システム）**メニューを展開して、**API Clients（APIクライアント）**を選択します。

![Systemメニューが展開され赤枠で強調されている。その中の「API Clients」も赤枠で強調されている。](https://hihaho-d6f71b986460.intercom-attachments-7.com/i/o/673539270/3f72185bd3b60688601095f2/rtaImage?expires=1783476000&signature=309ce749c77abef94b5b08c9f1ab9977fe609c80c6c46fce6436961c1f4e0f14&req=cickE8p3n4ZfFb4f3HP0gKb6w0KwrEpjT%2F4pkD7flafmj%2Bkbq5zM0mPKZ4uZ%0A0Uak7FlrP49E7VBf6w%3D%3D%0A)

**ステップ2:** **API Clients**ページの上部で、**New（新規）**を選択します。

![API Clientsページ。上部の「New」ボタンが赤枠で強調されている。](https://hihaho-d6f71b986460.intercom-attachments-7.com/i/o/673539272/f56058f56da8fd1fb1420a78/rtaImage?expires=1783476000&signature=f7fd50d321766a6315476ba6a519631e5177bb823bc71ba2cdda48ab682c5b1f&req=cickE8p3n4ZdFb4f3HP0gF34Ab%2FXQkAxkjUAs2GZarymmsIoea%2FHqBsbfgPb%0AG4fDzYgp66B0EDX4cQ%3D%3D%0A)

**ステップ3:** **Create API Client（APIクライアントの作成）**ウィンドウで、**Client Name（クライアント名）**を入力し、**Client URL（クライアントURL）**（任意）を入力します。**Server-side Web Application（サーバーサイドWebアプリケーション）**の左側のボタンを選択し、**Redirect URL（リダイレクトURL）**に **https://studio.hihaho.com/auth/panopto/connect/redirect** を設定します。その後、**Create API Client**を選択します。

![Create API Clientウィンドウ。Client Name、Client Type（Server-side Web Application）、Redirect URLの各フィールドとCreate API Clientボタンが赤枠で強調されている。](https://hihaho-d6f71b986460.intercom-attachments-7.com/i/o/673539277/b567e2aea6fb1d708c646e50/rtaImage?expires=1783476000&signature=1e8d3b7069a250e6a0e3f8f98eedb940e05c39501628193814d74c41eec0c9cc&req=cickE8p3n4ZYFb4f3HP0gEUL6CteIz0Pc%2FLgqD3OGV9W2F0CTgMWaaxaOadT%0Aw5pEVDVRkYHCfn1v0w%3D%3D%0A)

**ステップ4:** **Client Id（クライアントID）**と**Client Secret（クライアントシークレット）**が表示されます（図4）。これらをコピーしてドキュメントに貼り付けておきましょう。この認証情報はhihahoで必要になります。その後、**Ok**を選択します。

## hihaho側で連携を設定する

API認証情報（Client ID（APIキー）、Client Secret（APIシークレット）、ドメイン名）を入手したら、以下の手順に従ってhihaho側でPanoptoアカウントをhihahoのフォルダに接続します。

**ステップ1:** studio.hihaho.com にログインします。アカウント名をクリックすると、ドロップダウンメニューが表示されます。

**ステップ2:** メニューから「Folder settings（フォルダ設定）」を選択します。

![フォルダ設定から接続を行う操作のGIF](https://hihaho-dbfa911c715e.intercom-attachments-1.com/i/o/390342946/c08a10198f162aade60a2d43/how-to-connect-Blue-Billywig_1-1.gif?expires=1783476000&signature=78888c9828f6eb5990a6cebd5e4e0dd722d6841b38b8da3caee91b011a52e353&req=dyknFc18lIVZFb4f3HP0gBgEfTjOG8jXj%2FOcYt081W0dh%2FmPeg3dOkeIGiSh%0Ag%2B3CQuqFqhmb6%2FTgxQ%3D%3D%0A)

**ステップ3:** Panoptoに接続したいフォルダを選びます。右側の鉛筆アイコンをクリックしてフォルダを編集します。

**ステップ4:** 「Connections（接続）」タブを選択し、Panoptoの横にある「Connect（接続）」ボタンをクリックします。

**ステップ5:** API Key id（APIキーID）、API Secret（APIシークレット）、ドメイン名を入力します。

**ステップ6:** 「Test Connection（接続テスト）」を押して保存します。**Connections**ページに戻り、Panoptoサイトが接続済みとして表示されます。

Panoptoの詳細については [support.panopto.com](https://support.panopto.com/s/article/How-to-Configure-and-Use-the-Hihaho-Integration) をご覧ください。

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[Kinescopeアカウントを接続する]]
- [[UbiCastアカウントを接続する]]
