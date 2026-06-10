# HANDOVER.md - ヨルマチ（yorumachi）

## 基本情報
- バージョン: v0.1.0
- フェーズ: Phase 1（MVP・フロントエンドモック）
- 最終更新: 2026-06-10

## 技術スタック
- Frontend: バニラJS シングルファイルHTML + Leaflet 1.9.4（CDN）
- 地図タイル: CARTO dark_all（OSMベース・無償枠）※商用本格化時はプラン確認
- Backend: なし（Phase 2 で Firestore 予定）
- Hosting: Firebase Hosting（GitHub Actions 自動デプロイ）

## ファイル構成
```
public/yorumachi/
├── index.html   … アプリ本体（全コード・デモデータ内蔵）
├── kikaku.md    … 企画書（競合・補助金調査・フェーズ計画）
└── HANDOVER.md  … 本書
```

## 完全なコード
`index.html` 参照（シングルファイル・約700行・ビルド不要）。

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/yorumachi/

## 実装メモ
- **深夜時間の扱い**: 営業時間は小数時間で保持し `close: 29` = 翌5時。0〜6時は `nowH()` が +24 して連続判定
- **多言語**: `STR[lang]` 辞書 + 店舗データの `{ja, en}` フィールド。`lv()` で解決。localStorage `yorumachi_lang`
- **送客デモ**: localStorage `yorumachi_referrals` に {venueId, ts} を蓄積。情報モーダル（ロゴタップ）で累計×¥300 を表示
- **デモデータ**: `VENUES` 配列14軒。**すべて架空**（実在店舗の誤情報を避けるため）。Phase 2 で実データに差し替え
- **デバッグ**: console を logBuf に捕捉、🐞ボタンでクリップボードへコピー

## 進捗チェックリスト
- [x] Phase 0 企画書（kikaku.md）
- [x] Phase 1 MVP 公開
- [ ] 実店舗データ5〜10軒（Phase 2）
- [ ] Firestore 化＋店舗投稿フォーム（Phase 2）
- [ ] SNS告知のClaude API自動構造化プロトタイプ（Phase 2）
- [ ] 送客計測の本実装・手数料モデル（Phase 3）
- [ ] 豊島区・商店会への協議会アプローチ（Phase 3）

## 次のステップ
1. 大塚・池袋の知人・店舗オーナー2〜3人にMVPを見せて反応を取る（UX検証）
2. 実在店舗の公開SNS告知をClaude APIで構造化するプロトタイプ（このリポジトリの ai-meeting worker 構成が流用可能）
3. 豊島区観光協会・大塚商店会のナイトタイム関連の動きを確認（協議会ルートの種まき）

## 既知の問題・注意事項
- 掲載店舗・イベントは全件架空のデモデータ（バナーで明示済み）
- イベントは毎日「今夜開催」として表示される（デモ仕様）
- CARTO タイルの利用規約は商用本格化前に要確認（代替: MIERUNE / OpenFreeMap / 自前タイル）
- 位置情報は HTTPS 必須のため、実機検証は本番URLで行うこと
