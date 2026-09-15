# HANDOVER.md - AV構成図シミュレーター (av-diagram)

## 基本情報
- バージョン: v0.2.0
- フェーズ: Phase 1（MVP・α版）
- 最終更新: 2026-09-15

## 概要
映像配信・イベント現場の機材構成図（結線図）を、機材をドラッグして端子同士を繋ぐだけで作れるシングルHTMLアプリ。
機材ごとの端子数・種類はメーカー公開仕様に合わせており、端子種別（HDMI / SDI / XLR オス・メス / LAN 等）が合わない接続は物理的に行えない。

## 技術スタック
- Frontend: Vanilla JS + SVG + Tailwind CSS (CDN)
- 書き出し: jsPDF 2.5.1（PDF）/ PptxGenJS 3.12.0（PowerPoint）
- 保存: JSON ファイル + localStorage 自動保存
- Hosting: Firebase Hosting (cc-dev-ps7)

## ファイル構成
public/av-diagram/
├── index.html   … アプリ本体（機材DB・描画・書き出しすべて含む）
└── HANDOVER.md

## 主要機能
- 機材パレット（スイッチャー / カメラ / 音響 / 映像周辺・変換 / PC・ネットワーク / 会場設備 / カスタム）
- クリック or ドラッグ＆ドロップで配置、機材ドラッグで移動（10pxグリッド吸着）
- 端子ドラッグで結線。接続可能端子をハイライトし、近づくとマグネット吸着
- 接続ルール：同一端子種のみ / 出力→入力のみ / XLR は入力=メス・出力=オス / 1端子1ケーブル
- 線の色分け：映像=青、音声=緑、ネットワーク=オレンジ、USB=紫、制御=グレー
- ケーブル長・メモ入力、機材表・ケーブル表の自動集計
- JSON 保存・読込、PNG / PDF（図 + 機材表 + ケーブル表）/ PowerPoint（編集可能図形 + 画像 + 表）
- カスタム機材の登録（localStorage 保存、JSON にも同梱）
- 配置済み機材の編集：メーカー・機材名・役割ラベル・端子（種別/向き/ラベル/追加/削除）、「パレットに保存」で再利用
- 写真モード：機材ボックスを実機写真に切替。PDF由来の写真を内蔵（PHOTOS 定数、約250KB）、機材ごとに写真アップロード可（480px縮小・JSON保存）
- 共通UI：ヘルプモーダル、バージョン表示 → リリースノート、デバッグ（console.log コピー）

## 機材データの根拠（端子数）
- Roland V-8HD: HDMI IN×8 / OUT×3 / RCA IN・OUT / PHONES / USB / MIDI / TALLY-GPIO
- Roland V-1HD+: HDMI IN×4 / OUT×2 / XLR IN×2 / RCA LINE IN / MIC-AUX ミニ / TRS OUT
- Roland V-02HD MK II: HDMI IN×2 / PGM・PVW OUT / ミニ IN×2 / USB-C STREAM
- Roland VR-1HD: HDMI IN×3 / MAIN・MONITOR OUT / XLR-TRS MIC IN×2 / RCA IN・OUT / USB STREAM
- Roland V-160HD: SDI IN×8 / HDMI IN×8 / SDI OUT×3 / HDMI OUT×3 / XLR-TRS IN×2 / RCA IN 3-4 / XLR・RCA OUT / LAN / USB-C
- Blackmagic ATEM Mini Pro (ISO): HDMI IN×4 / OUT×1 / ミニ IN×2 / USB-C / LAN
- Blackmagic ATEM Mini Extreme (ISO): HDMI IN×8 / OUT×2 / ミニ IN×2 / USB-C×2 / LAN / PHONES
- Blackmagic Video Assist 7" 12G HDR: SDI IN・OUT / HDMI IN・OUT / mini XLR IN×2 / USB-C
- IMAGENICS DCE-U1TX / RX: HDMI ↔ IMG.LINK (BNC 同軸)

## JSON フォーマット
```json
{
  "app": "av-diagram", "version": "v0.1.0", "name": "プロジェクト名",
  "nodes": [{ "id": "…", "x": 0, "y": 0, "label": "C-1", "note": "", "photo": "data:image/jpeg;base64,…(任意)", "def": { "id": "roland-v8hd", "brand": "Roland", "name": "V-8HD", "cat": "switcher", "icon": "🎛️", "ports": [ { "id": "hdmi_in_hdmi_in_1", "type": "hdmi", "dir": "in", "label": "HDMI IN 1" } ] } }],
  "conns": [{ "id": "…", "a": { "node": "…", "port": "…" }, "b": { "node": "…", "port": "…" }, "length": 5, "note": "" }],
  "customDevices": [], "photoMode": false, "view": { "x": 0, "y": 0, "k": 1 }
}
```

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/av-diagram/

## 進捗チェックリスト
- [x] 機材パレット・配置・移動
- [x] 端子種別制約付き結線・マグネット吸着
- [x] 色分け（映像 / 音声 / ネットワーク / USB / 制御）
- [x] JSON 保存・読込
- [x] PNG / PDF / PowerPoint 書き出し
- [x] 機材表・ケーブル表
- [x] カスタム機材
- [x] 機材写真（PDF内の実機画像）のノード表示（写真モード）
- [ ] 自動整列（レイアウト）
- [ ] Firestore 保存・共有URL

## 次のステップ
1. 現場で使う機材の端子構成を実機と照合し、差異があれば DEVICES を修正
2. 「機材構成スライドマスター.pdf」の機材を追加（ローカルにあるためリモートでは未参照）
3. 必要なら Firestore 連携でプロジェクト共有

## 既知の問題・注意事項
- jsPDF は日本語フォント非対応のため、PDF の表は canvas 画像として埋め込んでいる
- PowerPoint の図形版は直線で結線（ベジェ曲線ではない）。画像版スライドも同梱
- iOS Safari ではパレットからの HTML5 ドラッグが効かないため、クリック配置を使う
- 端子構成はメーカー公開仕様ベース。実機と異なる場合はカスタム機材で対応
