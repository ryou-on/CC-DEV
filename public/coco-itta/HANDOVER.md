# HANDOVER: COCO-ITTA（ここいった）

> 生成日時: 2026-06-09  
> 最終更新: 2026-06-11（v0.7.0 / Claude Code）  
> 引き継ぎ元: Claude.ai チャット（セッションID: be965cb1）  
> 引き継ぎ先: Claude Code / Cowork

---

## 📋 プロジェクト概要

- **名前**: COCO-ITTA（ここいった）
- **バージョン**: v0.7.0
- **フェーズ**: Phase 3（本番運用中・写真共有E2E検証済み。スマホ実機確認のみ残）
- **一言説明**: 家族みんなで「行った場所」「行きたい場所」を地図上で共有できるWebアプリ

---

## 🛠 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | Vanilla JS + HTML/CSS（シングルHTMLファイル） |
| 地図 | Leaflet.js 1.9.4 + OpenStreetMap |
| 住所検索・逆ジオコード | Nominatim（無料・APIキー不要） |
| EXIF取得 | exifr CDN（写真のGPS・撮影日時を自動抽出） |
| Auth | Firebase Auth（Googleログイン）|
| DB | Firebase Firestore（compat v10.12.0、シングルドキュメント構成） |
| ストレージ | Firebase Storage（写真ファイル） |
| ホスティング | Firebase Hosting |
| フォント | Zen Maru Gothic + Crimson Pro（Google Fonts） |

---

## 📁 ファイル構成

```
public/coco-itta/
├── index.html       # アプリ本体（全機能をシングルHTMLで実装、約3400行）
├── manifest.json    # PWA マニフェスト（v0.5.0〜）
├── sw.js            # Service Worker（本体=network-first / CDN・写真=SWR）（v0.5.0〜）
├── icon-512.png     # PWAアイコン（icon-192 / icon-180 = apple-touch-icon も同梱）
└── HANDOVER.md      # このファイル

リポジトリルート:
├── firebase.json    # Hosting + Firestore + Storage rules 設定
├── firestore.rules  # Firestore アクセスルール
└── storage.rules    # Firebase Storage アクセスルール
```

---

## 🔑 重要な設計決定・アーキテクチャ

### Firestore: シングルドキュメント構成
```
groups/{groupId}
  ├── name: string           // グループ名
  ├── createdBy: string      // 作成者メール
  ├── members: [{email, role}] // メンバー一覧
  ├── memberNames: string[]  // 表示名（ピン登録時に選択）
  ├── pins: Pin[]            // ピン配列（写真URLも含む）
  ├── routes: Route[]        // ルート配列（点はネスト配列不可→{lat,lng}形式）
  └── routeSettings: {...}   // ルート設定（デフォルト色・太さ・色メモ）
```

### Firestore ネスト配列制限の回避策 ⚠️ 重要
ルートの `points` は `[[lat,lng],...]`（ネスト配列）だが Firestore は禁止。
必ず `routesToFirestore()` / `routesFromFirestore()` で変換する。

```javascript
// 送信前: [lat,lng] → {lat,lng}
function routesToFirestore(rs) { ... }
// 受信後: {lat,lng} → [lat,lng]
function routesFromFirestore(rs) { ... }
```

### Firebase Storage: 写真の保存パス
```
groups/{groupId}/pins/{pinId}/{timestamp}_{random}.jpg
```

### 写真共有のデータフロー
1. **グループ未参加時**: base64 → `localStorage['pinPhotos_${pinId}']` のみ（`pin.photos` には入れない）
2. **グループ参加・作成時**: マイグレーション（`migrateLocalPhotosToStorage()`）が自動起動
   - localStorage の base64 → Storage にアップロード → URL を `pin.photos` に格納 → Firestore 同期
3. **グループ参加中の新規写真**: 保存ボタン押下時に Storage アップロード → URL → Firestore 同期

### `sanitizePinsForFirestore()` ⚠️ 重要
Firestore に送る前に `pin.photos` から base64 を除去する。これを **必ず** `pushToCloud()` と `createGroup()` で使用すること。

```javascript
function sanitizePinsForFirestore(pinsArray) {
  return pinsArray.map(p => {
    if (!p.photos || !p.photos.length) return p;
    const urlPhotos = p.photos.filter(ph => typeof ph === 'string' && ph.startsWith('http'));
    if (urlPhotos.length === p.photos.length) return p;
    if (urlPhotos.length) return { ...p, photos: urlPhotos };
    const { photos, ...rest } = p;
    return rest;
  });
}
```

### ピンのドラッグ移動（v0.4.0〜）⚠️ 重要
`L.marker` の `draggable: true` で実装。`dragend` イベントで座標を保存・同期する。
- **単独マーカー**（`addMarkerToMap`）: そのピンの `lat/lng` を更新 → `savePins()` で保存＋クラウド同期
- **同名スタックマーカー**（`addStackedMarkerToMap`）: スタックは **名前** でグループ化されるため、ドラッグ時は同名ピンを **一括移動**（`pins.map` で該当 id を全更新）。トーストで移動件数を明示
- 移動後にローカルでは `renderMarkers()` を呼ばない（ドラッグで既に正しい位置にあるため）。リモート受信時は onSnapshot 経由で再描画される

### リアルタイム同期の注意点
- `hasPendingWrites` フラグで自分の書き込みエコーを無視
- `isApplyingRemote` フラグで `pushToCloud()` のループを防ぐ
- `pushToCloud()` は 400ms デバウンス

### Google Auth ⚠️ 重要（v0.6.3 で popup主に変更）

**現在の実装**: `signInWithPopup` を主、blocked時のみ `signInWithRedirect` にフォールバック。
- ボタン押下＝ユーザージェスチャ由来のpopupは iOS Safari でも通る
- iOS Safari の ITP は `signInWithRedirect` の sessionStorage を分割してしまい `Unable to process request due to missing initial state ... storage-partitioned browser environment` エラーが出るため、redirect は使わない

**v0.6.1〜v0.6.3 の経緯（要約）**:
- v0.6.1: authDomain を `cc-dev-ps7.web.app`（same-origin）に切替。デスクトップは復旧、iPhoneも一見動くが…
- v0.6.3: iPhone で `signInWithRedirect` 完了後に「missing initial state」エラー画面（v0.6.1ですり抜けてた）→ popup主にrefactor

**設定状態（変更時に注意）**:
- `authDomain: "cc-dev-ps7.web.app"`（配信元と同一）
- GCP の OAuth クライアントの承認済みリダイレクトURIに `https://cc-dev-ps7.web.app/__/auth/handler` を登録済み（2026-06-11 完了）

**authDomain を変更する場合の鉄則**: コード変更前に必ず GCP の承認済みURIに新ドメインのhandlerを追加すること。未追加で commit すると本番ログインが死ぬ（v0.5.1 で実証済み、`3cb6a59` で revert）。手順書は `IPHONE_LOGIN_FIX.md` に残してある。

---

## ✅ 進捗チェックリスト

### 完了済み
- [x] Leaflet + OpenStreetMap 地図表示
- [x] ピン追加・編集・削除
- [x] ステータス（行った / また行きたい / 行きたい）
- [x] レイヤー（スポット / エリア / 国・地域）
- [x] 訪問日・メモ・同行メンバー
- [x] フィルター（ステータス別・レイヤー別）
- [x] ピン一覧（ソート：日付新順・古順・名前・ステータス・写真あり優先）
- [x] ピン一覧内検索
- [x] 住所検索（Nominatim → 候補クリックでモーダル開く）
- [x] 逆ジオコーディング（場所名サジェスト）
- [x] ルート描画（クリックで点追加、ダブルクリックで完了）
- [x] ルート UNDO
- [x] ルート編集モーダル（名前・日付・色・太さ・メモ）
- [x] ルート設定（デフォルト色・太さ・色別メモ）
- [x] 同名ピンのスタック表示（1マーカー + タイムライン）
- [x] 訪問回数バッジ（「N回」ピンク）
- [x] 再訪記録ボタン（自動で「○回目」メモ付与）
- [x] メンバー管理（追加・削除・チェックボックス選択）
- [x] Firebase Auth（Googleログイン、モバイル対応）
- [x] Firestore リアルタイム同期（onSnapshot）
- [x] グループ作成・参加・退出
- [x] 家族招待メッセージ（自動生成 + コピーボタン）
- [x] 写真追加（複数枚・Canvas リサイズ 800px/JPEG80%）
- [x] EXIF 自動取得（GPS・撮影日時 → フォーム自動入力）
- [x] 写真スライドショービューア（prev/next）
- [x] 写真削除（✕ ボタン）
- [x] Firebase Storage 写真アップロード（グループ参加中）
- [x] 既存 localStorage 写真の Storage への自動マイグレーション
- [x] デバッグコンソール + ログコピーボタン
- [x] バージョンバッジ + リリースノートモーダル
- [x] ヘルプモーダル
- [x] 「また行きたい」ステータスのフィルターボタン（v0.3.0）
- [x] **ピンのドラッグ移動**（座標変更・同名スタックは一括移動）（v0.4.0）
- [x] ルート編集のカラーチップに色メモ表示（v0.4.1）
- [x] **写真アルバムビュー**（ピン一覧📷ボタン → スポット別・同名合算・最新日付順）（v0.5.0）
- [x] **ルート描画中の入力排他制御**（ピン・既存ルートの誤タップ防止）（v0.5.0）
- [x] **PWA 対応**（manifest + Service Worker + アイコン、ホーム画面追加・オフライン表示）（v0.5.0）
- [x] 写真キャッシュの全置換化（削除済みURLの残留防止）（v0.5.0）
- [x] **写真共有のE2Eテスト**（2026-06-10 実施・全項目パス）
- [x] ⭐ 評価機能（★1〜5・「評価が高い順」ソート）（v0.6.0）
- [x] 🔀 写真の並び替え（D&D / モバイル長押し）（v0.6.0）
- [x] 📍 写真EXIFのGPS座標を常に優先（pendingLatLng があっても上書き＋トースト）（v0.6.0）
- [x] 🗺️ ファビコン追加（インラインSVG・方眼紙×ピン）（v0.6.0）
- [x] 📱 スマホヘッダーコンパクト化（横スクロールフィルター）（v0.6.2）
- [x] 🎬 写真スライドショー（トランジション・表示時間変更可能）（v0.7.0）
- [x] 📱 スマホ ピン一覧下部スライドシート（開閉トグル・focusPinで自動クローズ）（v0.7.0）
  - 本番環境・実グループ `V9XQG8` で2ブラウザクライアント（Claude in Chrome 自動操縦）により検証
  - クライアントA: ピン+写真追加 → Storage アップロード ✅ → クライアントB: onSnapshot 同期・写真URL受信・**画像読込成功** ✅ → A: 削除 → B: 削除同期 ✅
  - テストデータは Storage ファイル含め完全クリーンアップ済み（28ピンに復元）

### 未着手 / WIP
- [ ] **スマホ実機での最終確認**（iOS Safari ログイン正常動作の確認・カメラからの写真追加・PWA「ホーム画面に追加」）  ← v0.6.1 で対応完了、最終目視確認のみ
- [ ] **メンバー顔写真/アバター設定**
- [ ] **Google Sheets 連携**（訪問記録エクスポート）
- [ ] **リリースノートの自動更新**（現在は手書き）

---

## 🚀 次のステップ

1. **スマホ実機確認**（ユーザー実施・約1分）: iPhoneで本番URLを開く → 共有メニュー →「ホーム画面に追加」→ 方眼紙×ピンのアイコンで standalone 起動するか確認。ついでにカメラから写真追加→家族の端末で見えるか確認
2. **メンバー顔写真/アバター設定** または **Google Sheets 連携**

---

## ⚠️ 既知の問題・制約

### Firestore 1MB ドキュメントサイズ制限
- ピン数が大量になると超過する可能性
- 解決策: ピンを別コレクションに移行（`groups/{groupId}/pins/{pinId}` 構成）

### ~~`getFilteredPins()` の冗長コード~~（v0.4.0 で修正済み）
末尾の到達不能な `return pins;` は削除済み。`revisit` フィルター条件も追加済み。

### ~~写真削除時の localStorage キャッシュ残留~~（v0.5.0 で修正済み）
`finalizePhotos()` が保存時にキャッシュを現在の写真一覧で丸ごと置換するよう変更（`savePinPhotos(pinId, urls)`）。

### CI の rules 自動デプロイは失敗するが non-blocking（2026-06-10 時点）
`firebase-hosting-merge.yml` の「Deploy Firebase Storage & Firestore rules」ステップはサービスアカウント権限不足で失敗するが、
`continue-on-error: true`（commit `2488f2a`）により **Hosting デプロイは続行される**。
rules はオーナー権限のローカル CLI から手動デプロイ済み（2026-06-10 確認、released 済み）。
恒久対応するなら SA に `Firebase Rules 管理者` 相当のロールを付与するか、CI からステップを除去する。

### `Date.now()` / `Math.random()` を Storage パスに使用
```javascript
const ref = storage.ref(`groups/${groupId}/pins/${pinId}/${Date.now()}_${Math.random()...}.jpg`);
```
ワークフロー内では使用不可だが、本アプリは通常の async 関数なので問題なし。

### Storage ルールは手動デプロイが必要
GH Actions は Hosting のみ。Storage/Firestore rules 変更時は：
```bash
cd "/Users/lobby_mini/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
npx firebase deploy --only storage:rules
npx firebase deploy --only firestore:rules
```

---

## 🔧 Claude Code への指示

このファイルを読み込んだら、以下を確認してください：

1. **ファイルパス**: `public/coco-itta/index.html`（約3400行のシングルHTML）
2. 次タスク候補は「写真共有のE2Eテスト」「メンバーアバター」「Google Sheets 連携」
3. 完了後は `https://github.com/ryou-on/CC-DEV/actions` でデプロイ確認
4. 本番URL: `https://cc-dev-ps7.web.app/coco-itta/`

> ⚠️ **運用ルール（必須）**: coco-itta を変更してデプロイするたびに、この HANDOVER.md も必ず更新すること。
> 更新対象 = ①バージョン（概要 + 最終更新行）②進捗チェックリスト（完了/未着手の移動）③「Claude Code 更新履歴」にコミットを追記。

---

## 💬 引き継ぎメモ

### Claude Code 更新履歴
- **v0.7.0**（commit `f5c0517`, 2026-06-11）: 写真ビューアにスライドショー機能（▶再生/⏸停止・タップで次へ・トランジション4種=fade/slide/zoom/cut・表示時間5段階・localStorage永続化・キーボード操作）／スマホでサイドパネルを下部スライドシート化（`.side-panel` を position:fixed + transform translateY、固定トグルボタン `.panel-toggle-btn` で開閉、focusPin でシート自動クローズ→ピン表示、開時に map.invalidateSize() で地図再計算）
- **v0.6.3**（commit `cf7359f`, 2026-06-11）: iOS Safari の `signInWithRedirect` が sessionStorage 分割で `missing initial state` エラーになる問題を修正。`signInWithPopup` を主、popup-blocked時のみ redirect にフォールバック。getRedirectResult の missing-state 系エラーも無害化（残骸の掃除として無視）。デスクトップ既存セッション維持・40ピン受信を確認
- **v0.6.2**（commit `8e7072d`, 2026-06-11）: スマホヘッダーをコンパクト化。`@media (max-width:600px)` でロゴをinline+ellipsis化、フィルターを `overflow-x:auto` の横スクロールに（flex-wrap:nowrap）。ヘッダー約300px→約72pxに圧縮し地図表示エリア拡大
- **v0.6.1**（commit `87adfea`, 2026-06-11）: iPhone Safari ITP対策完了。GCP の OAuth クライアントにユーザーが事前にリダイレクトURIを追加した上で authDomain を `cc-dev-ps7.web.app` に切替。デスクトップ既存セッション維持・本番動作（39ピン受信・評価1件含む）を確認。`IPHONE_LOGIN_FIX.md` 手順書も同梱
- **v0.6.0**（commit `23e5c16`, 2026-06-10）: 評価機能（rating: 1-5、未評価時はフィールド削除）／写真ドラッグ並び替え（HTML5 D&D + タッチ長押し）／写真EXIF座標を常に優先（以前は `!pendingLatLng` ガードで無視されていた）／インラインSVGファビコン。ピン一覧・マーカーポップアップ・スタックタイムラインに★表示
- **緊急 hotfix**（commit `3cb6a59`, 2026-06-10）: v0.5.1で authDomain を web.app に変更したがGCPのOAuth承認済みURIに未登録で `redirect_uri_mismatch` により全環境ログイン不可になっていたため、firebaseapp.com に即時revert。本番ログイン復旧。iOS Safari対応の恒久対策はGCP Consoleで `https://cc-dev-ps7.web.app/__/auth/handler` を承認済みリダイレクトURIに追加してから web.app への切替を再実施する必要あり
- **v0.5.1**（commit `0555b88`, 2026-06-10）: iPhone Safari でログイン後に初期画面へ戻る問題を修正（authDomain を `cc-dev-ps7.web.app` に same-origin 化、ITP対策）。ログイン失敗時のエラーを画面トースト表示。本番反映・デスクトップ既存セッション維持を確認済み
- **E2Eテスト実施**（2026-06-10）: 本番環境で写真共有のフルサイクル（追加→Storage→Firestore→別クライアント表示→削除同期）を検証、全項目パス。本番SW稼働確認（scope: /coco-itta/）。スマホ実機確認のみ残
- **v0.5.0**（commit `85f0d5b`, 2026-06-10）: スポット別写真アルバム（ピン一覧📷ボタン）／ルート描画中の入力排他制御（`markerPane`・`overlayPane` の pointer-events 無効化 + `openRouteEdit` ガード。アルバムモーダルはスクリプト後方のHTMLのため配線は `load` 後に実施）／PWA対応（manifest・sw.js・アイコン3種）／写真キャッシュ全置換化
- **v0.4.1**（commit `db2bb82`, 2026-06-09）: ルート編集モーダルのカラーチップ下に `routeSettings.colorMemos` の色メモを表示。ユーザー入力エスケープ用 `escHtml()` 追加
- **v0.4.0**（commit `0d63556`）: ピンのドラッグ移動（座標変更）を追加。単独マーカーは個別、同名スタックは一括移動。ヘルプ刷新（クラウド共有が実装済みである旨／「また行きたい」フィルター／ピン移動の説明）
- **v0.3.0**（commit `2d33a54`）: 「また行きたい」フィルター追加、`getFilteredPins` の dead code 削除、リリースノート整備（写真・グループ共有・再訪記録をユーザー向けに記載）

### 写真共有バグの根本原因と修正（2026-06-09, commit 50d7e41）
以下の4バグを修正した（詳細はセッション履歴参照）：

| # | バグ | 影響 |
|---|-----|------|
| 1 | `finalizePhotos()` がグループ未参加時に base64 を返す | `pin.photos = [data:...]` が Firestore に入りサイズ超過でサイレント失敗 |
| 2 | `pushToCloud`/`createGroup` が base64入り pins を送信 | 1MB 制限でサイレントエラー |
| 3 | save handler が `pins[idx].photos = undefined` を設定 | Firestore は undefined を拒否 |
| 4 | マイグレーションが `pin.photos` 内 base64 を見逃す | 既存データの変換がスキップ |

### Firestore グループID 形式
6文字の大文字英数字（紛らわしい文字を除外）。例: `ABC123`, `DEFG78`

### localStorage キー一覧
```
coco-itta-pins           : Pin[]
coco-itta-routes         : Route[]
coco-itta-members        : string[]
coco-itta-route-settings : RouteSettings
coco-itta-group-id       : string（グループID）
pinPhotos_{pinId}        : string[]（base64 or URL、グループ未参加時のキャッシュ）
```

### モバイル対応メモ
- モバイル（iOS/Android）: `signInWithRedirect` → `auth.getRedirectResult()` でログイン
- デスクトップ: `signInWithPopup`

---

## 📦 Storage / Firestore Rules

### `storage.rules`
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /groups/{groupId}/pins/{pinId}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### `firestore.rules`
```
match /groups/{groupId} {
  allow read, write: if request.auth != null;
}
```

---

## 🔗 リンク集

| 項目 | URL |
|------|-----|
| 本番URL | https://cc-dev-ps7.web.app/coco-itta/ |
| GitHub Actions | https://github.com/ryou-on/CC-DEV/actions |
| Firebase Console | https://console.firebase.google.com/project/cc-dev-ps7 |
| GitHubリポジトリ | https://github.com/ryou-on/CC-DEV |
