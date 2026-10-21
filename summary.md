# 既存アンケートID、信頼できるIP、デプロイ前の権限

日付: 2026-10-21。本番への merge、deploy、Firestore Rules、Auth の変更はしていない。force push もしていない。

## 完了した作業

- アンケート ID は `SV_` と16桁の16進に限らない。Firestore の自動 ID（英数字20文字）も通す。使える文字は英数字と `_` と `-`、長さは1から128。`/` と予約名 `__*__` は拒否する。
- 選択式の回答は、保存済みの選択肢のどれかと一致するときだけ書く。
- 強制更新の minVersion は SemVer。前後の空白を除いて40文字まで。先頭の `v` は外して保存する。
- IP ごとの回数は X-Forwarded-For の末尾だけを使う。これは Cloud Run が接続元として付けた値。先頭は呼び出し側が付けられるので使わない。Hosting 経由では末尾が Hosting の出口になることがある。
- 開発版 v0.10.30-dev は未リリースの開発版エントリのまま、date を 2026-10-21 に、changes を最新内容で更新した。過去の v0.10.29-dev は書き換えていない。安定版の画面は変えていないので v0.5.17 のまま。
- 手動デプロイの前に `npm ci --prefix functions` を実行する。

## サービスアカウント

Hosting と Rules のゲートは `functions.get` を呼ぶ。Hosting 用の `FIREBASE_SERVICE_ACCOUNT_CC_DEV_PS7` に `cloudfunctions.functions.get` が無いと、応答は 403 になり、関数が動いていても毎回デプロイが止まる。Firebase 管理者ロールが付いていればこの権限は含まれる。ロールを外した場合は、この権限を残す。

ゲートは `state == ACTIVE` と `updateTime` があることを確認し、ログに `updateTime` と zip の `sourceGeneration` を出す。generation はアップロードされた zip の世代であり、リポジトリのファイルハッシュではない。git の SHA と自動で照合するには、デプロイ時にその SHA を関数の環境変数へ入れる必要がある。今回はその環境変数は置いていない。古い ACTIVE をこのコミットと自動では区別しない。

## 既存アンケート ID

作成は以前 `collection.add()` だった。文書 ID は Firestore の自動 ID で、`^SV_[0-9a-f]{16}$` には合わない。その正規表現のままだと、公開の切り替えと回答が 400 になる。今回の検証は自動 ID を通す。

## IP 上限

生 IP は保存しない。数えるのは末尾の接続元の短命ハッシュ。

- 利用統計: 1 分 60 回、日本時間で 1 日 800 回
- 目安箱: 1 分 30 回、日本時間で 1 日 100 回
- 告知とアンケート管理: 1 分 20 回、1 日 200 回
- アンケート回答: 1 分 20 回、1 日 100 回

利用者ごとの上限は別で、利用統計は 1 分 30 回・1 日 400 回、目安箱は 1 分 5 回・1 日 50 回、告知とアンケート管理は 1 分 10 回・1 日 100 回、回答は 1 分 5 回・1 日 30 回。

## CI

対象は `tests` と `build_and_preview`。Firestore rules test は PR #4 だけ。この summary を書いた時点では、この修正の CI はまだ走っていない。結果は完了報告に書く。走ったあとの run ID は summary に追記しない。

## 検証

- `npm test --prefix functions` 72 件成功
- `python3 -m unittest discover -s scripts -p 'test_*.py'` 29 件成功
- Firestore / Storage のルールファイルは今回変えていない。直前のエミュレーター試験は 30 件成功
- 本番の関数稼働確認スクリプトは、テストでは偽の応答だけを使い、本番 API は呼んでいない

## バージョン

- Flight Strip TODO 安定版: v0.5.17
- Flight Strip TODO 開発版: v0.10.30-dev（date 2026-10-21）

## 本番URL

未デプロイ。Actions: https://github.com/ryou-on/CC-DEV/actions
安定版: https://cc-dev-ps7.web.app/Flight_Strip_TODO/
開発版: https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/
明友社見積: https://cc-dev-ps7.web.app/meiyusha-estimate/

## 残課題・残リスク

- accessGrants の本番付与と利用者への案内送付が終わるまで main へマージしない。
- `meiyusha@meiyusha-estimate.app` の emailVerified は未確認。
- 6関数は未デプロイ。Hosting 用サービスアカウントに `cloudfunctions.functions.get` が無いと、デプロイ前ゲートは 403 で止まる。
- ゲートは git SHA とデプロイ済みソースの一致を見ない。ACTIVE と updateTime があれば、より古いデプロイでも通過する。
- Hosting 経由の IP 上限は、末尾が Hosting の出口なら、その出口を共有する呼び出しをまとめて数える。
- App Check のコンソール強制は OFF。
- 予算停止ラッチが閉じていると目安箱、利用統計、告知、アンケートも `SERVICE_PAUSED` になる。
- ログイン後の告知とアンケート送信は未実施。
