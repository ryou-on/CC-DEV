# 📱 iPhone Safari ログイン恒久対応 — 作業手順書

> 対象: COCO-ITTA（ここいった）  
> 症状: iPhone Safari で Googleログイン後、アカウント選択しても初期画面に戻る  
> 原因: iOS Safari の ITP（トラッキング防止）がクロスドメインの `signInWithRedirect` をブロック  
> 対策: `authDomain` をアプリ配信元と同一の `cc-dev-ps7.web.app` に変更する  
> 前提: 先に Google Cloud Console の OAuth クライアント設定を更新する必要あり（未更新だと `redirect_uri_mismatch` で全環境ログイン不可になる）

---

## 🎯 やること（全体像・所要 3-5分）

1. **【あなた】** Google Cloud Console で OAuth クライアントに承認済みリダイレクトURI を追加（下記手順）
2. 完了したら Claude に「GCP完了」と伝える
3. **【Claude】** コード側の `authDomain` を `cc-dev-ps7.web.app` に変更 → commit → push → 自動デプロイ
4. **【あなた】** iPhone Safari でログインを再試行、成功を確認

---

## ✏️ 作業手順（Step-by-Step）

### Step 1: GCP Console を開く

ブラウザで以下を開く：

👉 **https://console.cloud.google.com/apis/credentials?project=cc-dev-ps7**

Googleアカウントは `junpei.omote@gmail.com`（プロジェクトオーナー）でログイン。

### Step 2: OAuth 2.0 クライアントIDを選ぶ

「OAuth 2.0 クライアント ID」セクションに表示されているクライアント一覧から、**Firebase Auth が自動生成したもの**を選ぶ：

- 名前は通常「Web client (auto created by Google Service)」または「Web client (auto created by Firebase)」のような表記
- 種類: **ウェブアプリケーション**

→ 行をクリックして詳細画面へ。

> **注意**: 同じプロジェクトに複数のクライアントがある場合があります。**Firebase が自動生成したもの**（Web type）を選んでください。間違えるとログインに使われていないクライアントを変更してしまい効果がありません。

### Step 3: 承認済みのリダイレクトURIを追加

詳細画面で「**承認済みのリダイレクト URI**」セクションを探す。

「+ URI を追加」をクリックし、以下を**そのままコピペで貼り付け**：

```
https://cc-dev-ps7.web.app/__/auth/handler
```

> すでに `https://cc-dev-ps7.firebaseapp.com/__/auth/handler` が登録されているはず。  
> 既存のものは**消さず**、新しい行として追加します（両方共存OK）。

### Step 4: 保存

画面下の「**保存**」ボタンをクリック。

> 反映には数秒〜数分かかる場合があります（GCP の伝搬時間）。

### Step 5: Claude に伝える

このチャットで一言：

> **GCP完了**

と返信してください。私が即座にコード側を切り替えて自動デプロイします。

---

## 📸 もし画面が見つからない場合

- 「OAuth 2.0 クライアント ID」が見つからない → URL が違う可能性。`cc-dev-ps7` プロジェクトを選択しているか右上で確認
- Firebase Auth を Console で操作したい場合の代替URL: https://console.firebase.google.com/project/cc-dev-ps7/authentication/providers
- 設定変更のための「編集」アイコンが見当たらない → ロール不足の可能性、ログインアカウントを確認

迷ったらこのチャットで聞いてください。

---

## 🔧 Claude側で実施する変更（参考）

```javascript
// 現在
authDomain: "cc-dev-ps7.firebaseapp.com",
// 変更後
authDomain: "cc-dev-ps7.web.app",
```

これだけです。ユーザーが操作するファイルではないので確認不要。

---

## ❗ 万が一の切り戻し

切替後にもし**デスクトップでもログイン不可**になった場合は、Claude が即座に `firebaseapp.com` に戻してデプロイします。
（v0.5.1で実際に起きたので手順は確立済み。`3cb6a59` の hotfix を再適用）

---

## 完了確認

iPhone Safari で:
1. https://cc-dev-ps7.web.app/coco-itta/ を開く
2. 「Google でログイン」をタップ
3. アカウントを選ぶ
4. **地図画面に入れたら成功** 🎉

その後はおまけで「ホーム画面に追加」→ アイコンが地図帳×赤ピンになっていれば PWA も完成です。
