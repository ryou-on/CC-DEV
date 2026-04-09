# APP DASHBOARD — HANDOVER.md

> ロビーの制作物ポータル  
> バージョン: v0.1.0  
> 作成日: 2026-04-09  
> 引き継ぎ先: Cowork

---

## プロジェクト概要

ロビー（表 ロビー 純平 / Spline Global）が作成・開発中のアプリを一覧管理するダッシュボード。  
Firestore をデータストアとし、シングルHTMLファイルで完結する構成。

---

## 本番URL・デプロイ情報

| 項目 | 値 |
|------|----|
| 本番URL | https://cc-dev-ps7.web.app/app-dashboard/ |
| Firebase Hosting プロジェクト | `cc-dev-ps7` |
| デプロイ方法 | GitHub Actions（main pushで自動） |
| GitHub リポジトリ | https://github.com/ryou-on/CC-DEV |
| GitHub Actions | https://github.com/ryou-on/CC-DEV/actions |
| 配置パス | `public/app-dashboard/index.html` |

---

## ローカルパス

| 環境 | パス |
|------|------|
| MacBook | `/Users/lobby/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/public/app-dashboard/` |
| Mac mini | `/Users/lobby_mini/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/public/app-dashboard/` |

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | バニラHTML + CSS + JavaScript（シングルファイル） |
| フォント | Syne（見出し）/ Noto Sans JP（本文）@ Google Fonts |
| データストア | Cloud Firestore（cc-dev-ps7プロジェクト） |
| Firebase SDK | v10.12.0（CDN / ESモジュール） |
| ホスティング | Firebase Hosting（cc-dev-ps7） |
| CI/CD | GitHub Actions |

---

## ファイル構成

```
public/app-dashboard/
└── index.html       # 全コードをシングルファイルに収録
```

---

## Firestore 構成

### コレクション: `apps`

| フィールド | 型 | 説明 |
|------------|----|------|
| `name` | string | アプリ名 |
| `type` | string | `web` / `chrome` / `ios` / `android` / `other` |
| `version` | string | SemVer（例: `0.1.0`） |
| `status` | string | `active` / `dev` / `beta` / `archived` |
| `url` | string | アプリURL（空文字可） |
| `env` | array\<string\> | 開発環境タグ（例: `["Claude Code", "Firebase"]`） |
| `releaseNote` | string | リリースノート・概要 |
| `docs` | array\<object\> | ドキュメントリンク（後述） |
| `updatedAt` | timestamp | Firestore serverTimestamp |

### `docs` フィールドの構造

```json
[
  {
    "label": "仕様書",
    "url": "https://docs.google.com/...",
    "type": "gdoc"
  }
]
```

`type` は `gdoc` / `notion` / `obsidian` のいずれか。

### セキュリティルール

```
match /apps/{id} {
  allow read, write: if true;
}
```

> ⚠️ 現在は認証なし。将来的にIP制限 or Firebase Auth導入を推奨。

---

## 機能一覧

### 現在実装済み（v0.1.0）

- [x] タブ切り替え（ALL / Web / Chrome拡張 / iOS / Android / Other）
- [x] タブごとのアプリ件数表示
- [x] アプリカード表示（名前・バージョン・ステータス・開発環境・リリースノート・URL）
- [x] ステータスバッジ（LIVE / DEV / BETA / ARCHIVE）
- [x] ドキュメントリンク表示（Google Docs / Notion / Obsidian）
- [x] 「▶ 開く」ボタン（URL設定済みのWebアプリ）
- [x] アプリ追加モーダル（Firestoreに保存）
- [x] アプリ編集モーダル
- [x] アプリ削除（確認ダイアログあり）
- [x] 初回アクセス時のシードデータ自動投入（11アプリ）
- [x] デバッグ用コンソールログ + クリップボードコピーボタン

### 未実装・TODO（Phase 2以降）

- [ ] Firebase Auth による編集権限制限
- [ ] アプリ検索・フィルター機能
- [ ] ステータス・更新日でのソート
- [ ] GitHub Actions からの自動upsert（デプロイ時に自動登録）
- [ ] バージョン履歴・チェンジログ表示
- [ ] KPI・メモフィールドの追加
- [ ] スマホ対応の強化（モバイルUI改善）
- [ ] アプリアイコン画像のアップロード対応

---

## Firebase設定

```js
const firebaseConfig = {
  apiKey: "AIzaSyDPlsAhtxbJBihy-EAHck9P7XbuM",
  authDomain: "cc-dev-ps7.firebaseapp.com",
  projectId: "cc-dev-ps7",
  storageBucket: "cc-dev-ps7.firebasestorage.app",
  messagingSenderId: "1029579090333",
  appId: "1:1029579090333:web:XXXXXXXXXXXXXXXXXXXXXX"  // ← 要確認・22文字
};
```

> ⚠️ `appId` の末尾22文字が未確定。Firebase Console → プロジェクトの設定 → マイアプリ で確認・修正すること。

---

## 既知の問題・バグ

| # | 問題 | 原因 | 対処法 |
|---|------|------|--------|
| 1 | `initializeApp has already been declared` エラー | Chrome拡張（Mapify等）がグローバルスコープにFirebaseを注入 | `import { initializeApp as fbInitApp }` でエイリアス化済み（v0.1.0で修正） |
| 2 | `appId` が不完全 | スクリーンショットから取得したため末尾が切れた | Firebase Consoleで正しい値を確認し差し替える |
| 3 | ローカルファイルでは動作するがFirestoreに繋がらない | appIdが不正な場合 | #2の対処後に再デプロイ |

---

## デプロイ手順

```bash
# ファイルを編集後
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/#git/cc-DEV

git add public/app-dashboard/index.html
git commit -m "feat: app-dashboard vX.X.X"
git push origin main

# GitHub Actionsが自動でFirebase Hostingにデプロイ
# 確認: https://github.com/ryou-on/CC-DEV/actions
```

---

## バージョン履歴

| バージョン | 日付 | 内容 |
|------------|------|------|
| v0.1.0 | 2026-04-09 | 初期リリース。Firestore連携・11アプリシードデータ・CRUD完全実装 |

---

## 次のアクション

1. **appIdを正しい値に修正** → Firebase Console で確認・index.html更新 → push
2. **本番でFirestore接続確認** → https://cc-dev-ps7.web.app/app-dashboard/
3. **Firebase Auth導入検討**（Phase 2）
4. **GitHub Actions自動upsertスクリプト作成**（Phase 2）
