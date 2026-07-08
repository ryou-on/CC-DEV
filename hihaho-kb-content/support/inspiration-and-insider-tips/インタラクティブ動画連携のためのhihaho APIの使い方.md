---
id: "8005401"
slug: how-to-use-the-hihaho-api-for-interactive-video-integration
title: "インタラクティブ動画連携のためのhihaho APIの使い方"
title_en: "How to use the hihaho API for Interactive Video Integration"
category: inspiration-and-insider-tips
category_ja: 活用アイデア・上級テクニック
audience: public
source: https://support.hihaho.com/en/articles/8005401-how-to-use-the-hihaho-api-for-interactive-video-integration
summary: "hihaho APIによる動画アップロードの流れ（認可→アップロード登録→PUTアップロード→トランスコード→webhook通知）の解説。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

hihaho API を使うと、開発者はインタラクティブ動画をアプリケーションに統合できます。完全なドキュメントは **https://api-docs.hihaho.com/** で公開されています。

## hihaho API の使い方

1. まず API で[認可（authorize）](https://api-docs.hihaho.com/#469a95f1-1b63-4cfb-8c62-4f7e97ebd653)を行います。

2. register upload エンドポイントを使ってアップロード処理を開始します。このエンドポイントは ID と URL を返します。URL は動画ファイルのアップロード先で、ID はアップロード状況の確認や webhook 通知の追跡に使用します。

3. Curl コマンドで動画ファイルをアップロードします:

```
curl --request PUT --upload-file /file_path/file_name.mp4 \
"https://upload-s3.jwplatform.com/tL17msiU?AWSAccessKeyId=[AWSAccessKeyId]&Expires=1482770374&Signature=[Signature]"
```

**`/file_path/file_name.mp4`** は実際の動画ファイルのパスとファイル名に置き換えてください。

4. XHR や Fetch でアップロードする場合は、AWS の署名要件に合わせて Content-Type ヘッダーに半角スペースを設定します。Axios を使った例:

```
return axios.put(response.data.url, file, {
...axiosConfig,
headers: {
'Content-Type': ' ',
},
onUploadProgress: (progressEvent: any) => this.uploadProgress(progressEvent, file), })
```

5. アップロード後、動画はトランスコードとサムネイル生成の処理に入ります。動画はすぐには利用可能になりません。ステータスは [V2 - transcoding statuses](https://api-docs.hihaho.com/#2bc427a0-0254-46ef-8b46-2666ee26d108) エンドポイントで確認するか、webhook URL を設定して自動通知を受け取ります。

6. 完了時には、JSON データを含む webhook の POST リクエストが送信されます:

**成功時:**
```
{
    "upload_id": 1,
    "upload_status": 7,
    "upload_successful": true,
    "video_container_id": 1,
    "video_id": 1
}
```

**失敗時:**
```
{
    "upload_id": 1,
    "upload_status": 11,
    "upload_successful": false,
    "video_container_id": 1,
    "video_id": null
}
```

処理が完了すると動画のアップロードは終わり、hihaho studio または API を通じてインタラクティブ化のカスタマイズができる状態になります。

さらに詳しい機能については、[APIでできること](https://support.hihaho.com/en/articles/5682075-possibilities-with-api)や完全な [API ドキュメント](https://api-docs.hihaho.com/#c427a2b6-6e57-4993-8813-35f06224f62a)を参照してください。

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[インタラクションJSON仕様ガイド]]
- [[プレーヤーパラメータ]]
