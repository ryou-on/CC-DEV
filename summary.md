# 既存アンケートIDの受け入れと、古い関数を止めるゲート

日付: 2026-10-21。本番への merge、deploy、Firestore Rules、Auth の変更はしていない。force push もしていない。

## 完了した作業

- 既存アンケートの ID は移行しない。内海課長の指示で、Firestore の自動 ID をそのまま受け付ける。新しい `SV_` 付き ID も受け付ける。`/` と予約名は拒否する。
- 選択式の回答は保存済みの選択肢と一致するときだけ書く。強制更新の minVersion は SemVer で、40文字まで。
- IP ごとの回数は X-Forwarded-For の末尾だけを使う。Cloud Run が付けた接続元であり、先頭の値は使わない。
- 開発版は v0.10.30-dev から v0.10.31-dev へ上げた。v0.10.30-dev の記録は残している。安定版の画面は変えていないので v0.5.17 のまま。
- 手動デプロイの前に `npm ci --prefix functions` を実行する。

## サービスアカウントと版の照合

Hosting と Rules のゲートは `functions.get` を呼ぶ。Hosting 用の `FIREBASE_SERVICE_ACCOUNT_CC_DEV_PS7` に `cloudfunctions.functions.get` が無いと 403 で毎回止まる。

関数はデプロイ時にラベル `fst-rev` へ、対象ソースの SHA-256 先頭32桁を書く。ゲートは本番のラベルが、今のチェックアウトから計算した値と一致し、`state` が ACTIVE で `updateTime` があることを要求する。古いデプロイはラベルが違うので通さない。

照合できない部分: API が返す zip の generation はリポジトリのファイルハッシュではない。zip には依存モジュールが入るため、ソースファイルのハッシュとバイト比較できない。zip の取得もこの確認の権限とは別である。コンソールでラベルだけを期待値へ書き換えると、中身が古くてもこの確認は通る。

ネットワーク失敗、空の応答、403 はどれもデプロイを止める。

## IP 上限

生 IP は保存しない。数えるのは末尾の接続元の短命ハッシュ。

- 利用統計: 1 分 60 回、日本時間で 1 日 800 回
- 目安箱: 1 分 30 回、日本時間で 1 日 100 回
- 告知とアンケート管理: 1 分 20 回、1 日 200 回
- アンケート回答: 1 分 20 回、1 日 100 回

利用者ごとの上限は別で、利用統計は 1 分 30 回・1 日 400 回、目安箱は 1 分 5 回・1 日 50 回、告知とアンケート管理は 1 分 10 回・1 日 100 回、回答は 1 分 5 回・1 日 30 回。

## CI

対象は `tests` と `build_and_preview`。Firestore rules test は PR #4 だけ。この summary を書いた時点では、この修正の CI はまだ走っていない。走ったあとの run ID は summary に追記しない。

## 検証

- `npm test --prefix functions` 73 件成功
- `python3 -m unittest discover -s scripts -p 'test_*.py'` 32 件成功
- Firestore / Storage のルールファイルは今回変えていない。直前のエミュレーター試験は 30 件成功
- 本番 API は呼んでいない

## バージョン

- Flight Strip TODO 安定版: v0.5.17
- Flight Strip TODO 開発版: v0.10.31-dev

## 本番URL

未デプロイ。Actions: https://github.com/ryou-on/CC-DEV/actions
安定版: https://cc-dev-ps7.web.app/Flight_Strip_TODO/
開発版: https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/
明友社見積: https://cc-dev-ps7.web.app/meiyusha-estimate/

## 残課題・残リスク

- accessGrants の本番付与と利用者への案内送付が終わるまで main へマージしない。
- `meiyusha@meiyusha-estimate.app` の emailVerified は未確認。
- 6関数は未デプロイ。ラベル `fst-rev` が無いうちは、Hosting と Rules のゲートは止まる。
- `cloudfunctions.functions.get` が無いサービスアカウントでは 403 で止まる。
- ラベルだけを手で期待値に合わせると、zip の中身が古くてもゲートは通る。
- Hosting 経由の IP 上限は、末尾が Hosting の出口なら、その出口を共有する呼び出しをまとめて数える。
- App Check のコンソール強制は OFF。
- ログイン後の告知とアンケート送信は未実施。
