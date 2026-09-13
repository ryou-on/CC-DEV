# 家族フォトスライドショー

Google ドライブの共有フォルダに入れた写真を、テレビ・iPad・PC で全画面スライドショー表示する単一 HTML アプリ。

- 本番URL: https://cc-dev-ps7.web.app/family-slideshow/
- バージョン: v0.1.0（Phase 1 / MVP）
- 技術: 素の HTML + JS + Tailwind CDN（バックエンドなし。Drive API v3 を API キーだけで直接呼ぶ）

## セットアップ

1. Google ドライブでフォルダを作成 → 共有 →「リンクを知っている全員（閲覧者）」
2. Google Cloud Console で Drive API を有効化し、API キーを発行
   - 推奨制限: HTTP リファラー `https://cc-dev-ps7.web.app/*`、API 制限 = Google Drive API のみ
3. アプリを開いて ⚙️ からフォルダ URL と API キーを入力 →「保存して開始」
4. 設定画面の「共有リンク」を家族に配る（設定不要で同じスライドショーが見られる）

## URL パラメータ

| パラメータ | 値 | 説明 |
|---|---|---|
| `folder` | フォルダ ID | 必須 |
| `key` | API キー | 必須 |
| `interval` | 秒数 | 表示秒数（既定 8） |
| `order` | random / newest / oldest / name | 順番 |
| `effect` | kenburns / fade | 演出 |
| `caption` | date / name / both / none | キャプション |
| `subfolders` | 0 | サブフォルダを含めない |
| `blurbg` | 0 | ぼかし背景を無効化 |

## 仕組み

- `files.list` で `'<folderId>' in parents` を取得し、`image/*` のみ抽出（サブフォルダは深さ 5 まで再帰）
- 画像は `https://lh3.googleusercontent.com/d/<id>=w<size>` で取得（公開共有ファイルのみ。HEIC も JPEG 変換される）。失敗時は `drive.google.com/thumbnail` にフォールバック
- 撮影日は `imageMediaMetadata.time`（EXIF）→ なければ `createdTime`
- 10 分ごとにリストを自動再読み込み

## iCloud 非対応の理由

iCloud Drive には Web から呼べる公開 API がない。iCloud 共有アルバムの公開リンクは非公式エンドポイント経由で読めるが CORS のため Cloud Functions のプロキシが必要（Phase 2 候補）。
