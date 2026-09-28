# HANDOVER.md - 巴御前 -TOMOE- 30秒 企画デモ動画

## 基本情報
- バージョン: v0.1.0（プレビュー版）
- フェーズ: Phase 1（MVP・α版）
- 最終更新: 2026-09-28
- ブランチ: `claude/zen-babbage-y4oz9x`

## 技術スタック
- 動画編集: Remotion 4.0.529（React）＋ @remotion/three（three 0.180 / r3f 9）
- 画像生成: Canva generate-image（ルック画像6枚）
- 動画生成: **Higgsfield MCP / Seedance 2.5（未実施・次セッション）**
- BGM/SE: numpy 合成（`audio/make_bgm.py`）
- Hosting: Firebase Hosting（`public/tomoe-demo/`）

## ファイル構成
```
tomoe-demo-src/
├── src/
│   ├── Root.tsx            コンポジション登録（TomoeDemo / Logo / ModelSheet / ModelTurntable）
│   ├── TomoeDemo.tsx       本編タイムライン（S1〜S8, BGM）
│   ├── scenes.tsx          各シーン
│   ├── Shot.tsx            実写カット（Seedanceクリップ or ルック画像＋カメラワーク）
│   ├── clips.ts            ★ Seedance クリップ差し替えフラグ
│   ├── fx.tsx / Telop.tsx  エフェクト・テロップ
│   ├── Logo.tsx            ロゴ（三つ巴紋＋筆文字）
│   ├── tomoeModel.js       3Dアセット（buildTomoe / buildFx）
│   └── theme.ts            配色・フォント（ローカルTTF）
├── public/look/            ルック画像・三面図・グレイン
├── public/audio/bgm.wav    BGM（make_bgm.py で再生成可）
├── public/clips/           ★ Seedance クリップ置き場（shot1〜5.mp4）
├── higgsfield-shotlist.json ★ Seedance 2.5 用ショットリスト（プロンプト・カメラ・開始フレーム）
├── scripts-fetch-fonts.sh  フォント取得（public/fonts は git 管理外）
└── remotion.config.ts      Chromium=/opt/pw-browsers（remotion.media は egress 不可）
public/tomoe-demo/          公開ページ（index.html / model.html / mp4 / 素材）
```

## 次セッションの手順（Higgsfield 接続後）
1. 事前に https://claude.ai/customize/connectors で **Higgsfield を接続し、新しいセッションを開始**（コネクタはセッション開始時に読み込まれる）
2. セットアップ
   ```bash
   cd tomoe-demo-src && npm ci && ./scripts-fetch-fonts.sh
   ```
3. ToolSearch で Higgsfield ツールをロードし、スキーマ確認（画像の渡し方・Seedance 2.5 のモデルID）
4. `higgsfield-shotlist.json` の5ショットを Seedance 2.5 image-to-video で生成（開始フレーム = `public/look/*.jpg`、style_lock を全ショットに付与）
5. 生成動画を `public/clips/shot1.mp4`〜`shot5.mp4` に保存
   - ダウンロード先ホストが 403 の場合：環境設定 → Network access に該当ホストを追加してもらう
6. `src/clips.ts` の該当ショットを `enabled: true` に
7. 確認 → 本番レンダー
   ```bash
   npx remotion still src/index.ts TomoeDemo out/check.jpg --frame=80
   npx remotion render src/index.ts TomoeDemo out/tomoe-demo.mp4 --codec=h264 --crf=21 --concurrency=4
   cp out/tomoe-demo.mp4 ../public/tomoe-demo/tomoe-demo.mp4
   ```
8. `public/tomoe-demo/index.html` の RELEASE_NOTES に v0.2.0 を追記し、プレビュー注記を削除 → commit & push

## 進捗チェックリスト
- [x] ロゴ（三つ巴紋＋「巴御前」筆文字＋TOMOE）
- [x] 3Dアセット（白銀×朱の大鎧・大太刀・和弓・矢筒・桜/火の粉エフェクト）＋ビューア（GLB保存）
- [x] ルック画像6枚（Canva生成 → サムネタイル合成で1920x1080化）
- [x] BGM/SE（太鼓・琴・篠笛風・斬撃/弓/納刀）
- [x] Remotion 本編（テロップ・インフォグラフィック・エンドカード）＋プレビュー版レンダー
- [x] Seedance 2.5 用ショットリスト
- [ ] Higgsfield / Seedance 2.5 で動画素材5本生成
- [ ] 完成版レンダー・公開

## 既知の問題・注意事項
- Canva のダウンロードURL（export-download.canva.com / media.canva.com）は egress 403。ルック画像は edit-design サムネを 600px タイルで取得・合成した（s3 の下段右2タイル、s4・s5 はサムネ拡大のため他よりやや甘い）
- Canva の編集トランザクションは短時間で失効する
- ヘッドレス Chrome から Google Fonts を読めないため、フォントはローカルTTF
- レンダーは 4コアで約17分
