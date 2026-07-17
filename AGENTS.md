# CC-DEV プロジェクト — AI エージェント共通運用メモ

> Claude Code / Codex など全AIエージェント共通の**単一ソース**。
> ルートの `CLAUDE.md` はこのファイルを import するだけの薄いラッパー。運用ルールの変更は必ずこのファイルで行う。

このリポジトリは Firebase Hosting にデプロイされる複数のミニアプリを `public/` 配下に持つモノレポ。
GitHub Actions により `main` への push で自動デプロイされる。

---

## 🚨 デプロイ後の必須表示ルール

**`git push` が成功したら、必ず以下を表示すること：**

1. **GitHub Actions URL**: https://github.com/ryou-on/CC-DEV/actions
2. **本番URL**（デプロイしたアプリのもの）

プロジェクト別の本番URLは下記「本番URL一覧」参照。
表示を省略しないこと。ユーザーから何度でも `デプロイして` と指示があれば毎回表示する。

---

## 本番URL一覧

**原則: `public/<ディレクトリ名>/` → `https://cc-dev-ps7.web.app/<ディレクトリ名>/`**

主要アプリ：

| アプリ | 本番URL | 管理画面 |
|---|---|---|
| ouchi-hamasushi | https://cc-dev-ps7.web.app/ouchi-hamasushi/ | https://cc-dev-ps7.web.app/ouchi-hamasushi/admin.html |
| ai-meeting | https://cc-dev-ps7.web.app/ai-meeting/ | — |
| ai-skill-check | https://cc-dev-ps7.web.app/ai-skill-check/ | https://cc-dev-ps7.web.app/ai-skill-check-admin/ |
| app-dashboard | https://cc-dev-ps7.web.app/app-dashboard/ | — |
| hihaho-player | https://cc-dev-ps7.web.app/hihaho-player/ | https://cc-dev-ps7.web.app/hihaho-admin/ |
| realtime-translator | https://cc-dev-ps7.web.app/realtime-translator/ | — |
| coco-itta | https://cc-dev-ps7.web.app/coco-itta/ | — |
| Flight_Strip_TODO（安定版） | https://cc-dev-ps7.web.app/Flight_Strip_TODO/ | — |
| Flight_Strip_TODO_dev（開発版） | https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/ | — |
| hihaho-view | https://cc-dev-ps7.web.app/hihaho-view/ | — |
| hihaho-kb（公開ナレッジベース） | https://cc-dev-ps7.web.app/hihaho-kb/ | https://cc-dev-ps7.web.app/hihaho-kb-admin/ |
| hihaho-kb-internal（社内KB・要ログイン） | https://cc-dev-ps7.web.app/hihaho-kb-internal/ | https://cc-dev-ps7.web.app/hihaho-kb-admin/ |

（その他のアプリは上記の原則どおりディレクトリ名を URL に当てはめる）

---

## デプロイ手順

```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
git add public/<アプリ名>/<変更ファイル>
git commit -m "<プレフィックス>: <変更内容> (<アプリ名>)"
git push
```

### コミットメッセージ規約

- `feat:` 新機能
- `fix:` バグ修正
- `refactor:` リファクタリング
- `docs:` ドキュメント

Co-Authored-By トレーラーは実行中のエージェントの既定署名をそのまま使う（特定モデル名をこのファイルに固定しない）。

### 注意事項

- `git add -A` / `git add .` は使わない（`.DS_Store`・録音wav・個人ドキュメント等を含めないため）
- 必ず変更ファイルを個別指定
- `public/ouchi-hamasushi/` には `.DS_Store`, `20260419_*.wav`（録音アーティファクト）, `HANDOVER.md`, `audio/` (base64埋め込みのためソース不要) がuntracked。これらは意図的に除外

---

## デプロイルール（Flight_Strip 限定・毎回厳守）

> 2026-07-08 グローバル `~/.claude/CLAUDE.md` から移設（AI環境監査）。

- **git push の直前または直後に、必ずリリースノートを更新すること**
- **リリースノート更新は省略・後回し禁止。コードと同じコミットに含めること**
- 対象：安定版（Flight_Strip_TODO/index.html）と開発版（Flight_Strip_TODO_dev/index.html）の両方
- 安定版：新バージョン番号（例: v0.5.2）を RELEASE_NOTES 配列の先頭に追加、変更内容を日本語で記載
- 開発版：v0.6.0-dev エントリの date と changes を最新内容で上書き更新
- バージョン番号はSemVer準拠（機能追加→minor up、バグ修正→patch up）
- 更新を忘れたら次のコミットで必ず補完する

---

## 夜間自律開発モード（overnight mode）

> 2026-07-08 グローバル `~/.claude/CLAUDE.md` から移設（AI環境監査）。**CC-DEVリポジトリ内の作業のみ適用**。

### 判断ルール（確認不要・即実行）
- ファイル読み書き・上書き → 常に許可
- git add / commit / push → 常に許可
- npm install / npx → 常に許可
- Firebase deploy → 常に許可
- Firestore rules deploy → 常に許可

### 詰まったときの対応
1. エラーを読んで原因を特定する
2. 別アプローチを最大3回試す
3. それでも解決できない場合は `summary.md` に状況を記録して停止

### 完了時の記録
タスク完了後、作業ディレクトリに `summary.md` を作成し以下を記録：
- 完了した作業リスト
- デプロイURL（該当する場合）
- バージョン番号
- 残課題・注意事項

### overnight プロンプト雛形
```
## タスク
[やりたいこと]

## 完了条件
- [ ] 〇〇が動く
- [ ] git push 済み
- [ ] エラーなし

## 制約
- 確認不要。判断が必要な場合は合理的なデフォルトを選んで進めること
- 詰まったら別アプローチを3回まで試みること
- 完了したら summary.md に結果を書き出すこと
```

---

## リポジトリ情報

| 項目 | 値 |
|---|---|
| GitHub | https://github.com/ryou-on/CC-DEV |
| GitHub Actions | https://github.com/ryou-on/CC-DEV/actions |
| Firebase Hosting | cc-dev-ps7.web.app |
| ローカルパス（MacBook / lobby） | `/Users/lobby/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/` |
| ローカルパス（Mac mini M4 / lobby_mini） | `/Users/lobby_mini/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV/` |
| デプロイパス | `public/<アプリ名>/` |

### cdコマンドの注意

パスに `#` と空白が含まれるため、必ずクォートで囲む：

```bash
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
```

`$HOME` を使えば MacBook（lobby）/ Mac mini（lobby_mini）の両方で同じコマンドが動く。

---

## ouchi-hamasushi 固有メモ

- 現行バージョン: **v1.4.0**（2026-04-21時点）
- 全機能は `public/ouchi-hamasushi/HANDOVER.md` 参照
- base64音声埋め込みのため `index.html` は ~570KB
- MIME は必ず `audio/mpeg`（`audio/mp3` はiOSで NG）
- 管理画面の録音は `audio/mp4` 優先（iOS Safari 対応）

### クラウド同期（v1.4.0〜）
- `cloud-store.js` が Firebase v10 modular SDK を ES module で読み込み
- Firestore パス: `ouchi-hamasushi/{familyCode}/assets/{assetKey}`
- `onSnapshot` でリアルタイム同期、localStorage をキャッシュとして使用
- 家族コードは `setting_familyCode` (localStorage)、デフォルト `default`
- **firestore.rules / storage.rules は main への push で自動デプロイされる**（`.github/workflows/firebase-rules-deploy.yml`、2026-07-13 SA に Firebase 管理者ロール付与済み）。手動デプロイは緊急時のみ:
  ```bash
  cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/#git/cc-DEV"
  npx firebase deploy --only firestore:rules
  ```

### localStorage キー規約（Firestore doc ID と同一）
- `voice_{prefix}_{name}` — カスタム音声（prefix: otousan / okasan / confirm / order / checkout）
- `image_{name}` — メニュー画像（400px JPEG自動リサイズ）
- `image_avatar_{okasan|otousan}` — 声優選択モーダルの親アバター画像
- `setting_familyCode` — クラウド同期用家族コード
- `setting_*` — その他の設定値
- `access_log` — タップ履歴（最大1000件）
- `voices_updated` / `images_updated` — 管理画面→アプリ通知タイムスタンプ（storage event用）
