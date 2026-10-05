---
name: dep
description: CC-DEV のデプロイを一括実行する。変更ファイルを個別に add → commit → push（main への push で GitHub Actions が Firebase Hosting へ自動デプロイ）→ Actions 結果と本番URLの確認 → GitHub Actions URL と本番URLを必ず表示する。ユーザーが「/dep」「デプロイして」「本番に上げて」と言ったときに使う。
---

# /dep — CC-DEV デプロイ

`$ARGUMENTS` にアプリのディレクトリ名（`public/` 直下）をスペース区切りで渡せる。省略時は `git status` の変更から対象アプリを判定する。
例: `/dep hihaho-release-sep` / `/dep sylavids-cm hihaho-cm`

運用ルール本体は `AGENTS.md`（単一ソース）。このスキルはその手順を実行するだけ。ルールが食い違う場合は `AGENTS.md` を優先する。

## 手順

### 1. 対象と現状の確認
- `git status -sb` と `git branch --show-current` を確認する。
- 対象アプリ = `$ARGUMENTS`、なければ変更が入っている `public/<dir>/` を列挙する。
- 変更が無ければ「デプロイ対象なし」と伝えて終了（空コミットは作らない）。

### 2. 事前チェック（該当するものだけ）
- **ステージは必ず個別指定**。`git add -A` / `git add .` は使わない。
- 次のものは含めない: `.DS_Store`、録音 `*.wav`、`frames*/`（書き出し中の連番画像）、`preview.html` などの一時生成物、`node_modules/`、秘密情報（`.env`・鍵・トークン）。
- バージョン表示のあるアプリは、版を上げたら release notes も更新する。**Flight_Strip は release notes 更新を同じコミットに含める**（`AGENTS.md` のデプロイルール）。リリースノートには UI で体験できる変更だけを書く（`.claude/CLAUDE.md` 参照）。
- 動画（MP4）を含む場合はサイズを確認する（目安: 1本 10MB 以下。超える場合はユーザーに伝える）。

### 3. コミット
- 形式: `<プレフィックス>: <変更内容> (<アプリ名>)`（`feat:` / `fix:` / `refactor:` / `docs:`）。
- 末尾の Co-Authored-By トレーラーは、実行中のエージェントの既定署名をそのまま使う（モデル名を固定しない）。

### 4. push と main への反映
- **ローカル（Mac）で `main` にいる場合**: `git push`。
- **クラウドセッションなど作業ブランチにいる場合**（`main` へ直接 push 済みでないとき）:
  1. `git fetch origin main` → `git merge --no-edit origin/main`（競合したら解決。ロックファイル等は生成コマンドで再生成）。
  2. ユーザーが「デプロイして」と明示した場合のみ `git push origin HEAD:main`。
  3. 作業ブランチも `git push -u origin <branch>` で揃える。
- 履歴の書き換え（`--force` / rebase / amend）は他人のブランチ・main では絶対にしない。
- push が拒否されたら、`git pull --no-edit` で取り込んでから再 push（他セッションが同じブランチへ push していることがある）。
- ネットワークエラーのみ 2s / 4s / 8s / 16s の間隔で最大4回リトライ。

### 5. デプロイ結果の確認
- GitHub Actions の最新 run（`firebase-hosting-merge.yml`）を確認する（`mcp__github__actions_list` など）。`in_progress` なら完了まで待つ。
- 失敗したらログ（`mcp__github__get_job_logs`）から原因を特定して修正 → 再 push。ルールのファイル（`firestore.rules` / `storage.rules`）を変えた場合は `firebase-rules-deploy.yml` の結果も見る。
- 成功後、本番URLを `curl -sS -o /dev/null -w '%{http_code}'` で確認する。200 以外は原因を報告する。

### 6. 必ず表示するもの（省略しない）
`git push` が成功したら毎回、次の2つを出す。

1. **GitHub Actions**: https://github.com/ryou-on/CC-DEV/actions
2. **本番URL**（デプロイしたアプリごと）:
   - 原則: `public/<ディレクトリ名>/` → `https://cc-dev-ps7.web.app/<ディレクトリ名>/`
   - 管理画面がある一部アプリは別URL（`AGENTS.md` の「本番URL一覧」を参照）。

## 返答の形式（ユーザーの好み）
- 日本語・簡潔・結論先出し。冒頭に「回答日時: YYYY-MM-DD」を入れる。
- 何を push したか（コミット数・対象アプリ）、Actions の結果、HTTP 確認結果を短く。
- 最後にチャットタイトル案を1つ。要約の繰り返し・前置き・頼まれていない注意書きは書かない。

## やってはいけないこと
- `git add -A` / `git add .`
- `main` や他人のブランチへの force push・履歴書き換え
- 秘密情報（`.env`・鍵・トークン）のコミット
- Actions が失敗のまま「デプロイ完了」と報告すること
- ユーザーが依頼していない対象（別プロジェクトの未コミット変更など）を勝手に含めること。作業ブランチに他セッションの変更が積まれている場合は、デプロイ前に「含まれる対象」を一覧で伝える。
