# 作業記録（2026-10-15）

PR #3 `fix/cost-risk-guards` と、それを含む PR #4 `fix/firestore-rules-public-writes` に、品質レビューの再確認を反映した。マージ、デプロイ、本番 Firestore Rules、本番 Auth の変更はしていない。

## 完了した作業

- Flight Strip の目安箱を Cloud Functions `submitFstFeedback` / `updateFstFeedback` へ移した。App Check、確認済みの非匿名アカウント、1分5件・1日50件、同一本文の10分拒否、ハニーポット、送信所要時間をサーバーで見る。新規は `unreviewed`。状態は `unreviewed | reviewed | in_progress | resolved` で、編集者だけが更新する。
- `fst_feedback`、`fst_feedback_meta`、`fst_feedback_limits` へのクライアント書き込みをルールで拒否した。読み取りは確認済み編集者か、自分の uid の文書だけ。
- 安定版 v0.5.17、開発版 v0.10.30-dev。送信前の個人情報注意、2,000文字、4状態の更新を画面へ入れた。
- 明友社共有アカウントはルールを緩めず、`docs/meiyusha-email-verification.md` にロビー向けの本番 Auth 確認手順を書いた。スクリプトは Auth に接続しない。
- accessGrants の計画コマンド、例のマニフェスト、手順、利用者向け案内を追加した。例のメールのままでは本番付与できない。`--apply` は環境変数が無いと Firebase を起動する前に止まる。
- PR 本文の冒頭に、許可の本番投入と案内送付が終わるまでマージしない条件を書く（この記録のあとで PR を更新する）。

## バージョン

- Flight Strip TODO 安定版: v0.5.17
- Flight Strip TODO 開発版: v0.10.30-dev
- 開発標準の「v0.6.0-dev を上書き」は、現行の先頭が v0.10.29-dev だったため、履歴を消さずに patch を先頭へ追加した。

## テスト

- `npm test --prefix functions`: 52 passed（目安箱、accessGrants 計画、明友社チェックリストを含む）
- `python3 -m unittest discover -s scripts -p 'test_*.py'`: 24 passed
- Firestore / Auth エミュレーター `tests/firestore`: 22 passed。クライアント書き込み拒否、編集者の読み取り、確認済み明友社の読み取り、未確認明友社の拒否を含む。

## デプロイ

していない。本番 URL は未更新。

- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 対象アプリ（未デプロイ）: https://cc-dev-ps7.web.app/Flight_Strip_TODO/ と https://cc-dev-ps7.web.app/Flight_Strip_TODO_dev/

## 残課題・残リスク

- 本番の accessGrants は空のまま。ルールを main へ出すと、管理者以外は共有データを読めない。案内の送付も未実施。マージ不可。
- 本番 Auth の `meiyusha@meiyusha-estimate.app` が emailVerified かは未確認。未確認のままだとルール公開後に見積もりが読めない。
- Functions は未デプロイ。画面とルールだけ先に出ると、目安箱の送信が失敗する。
- App Check のコンソール強制は OFF のまま。関数側の検証はトークンが無いと拒否するが、本番トークンの取得はブラウザで未確認。
- 目安箱は costControls の許可 UID には入れていない。確認済みアカウントなら送れる。これは有料 API と条件を分けた判断。
- 受信箱は古い `new` / `replied` を表示できる。更新 API は4状態だけを受け付ける。
- Storage ルールのエミュレーター試験は今回の対象外。
- 本番の予算停止、Google ログイン、実 App Check トークンは未検証。
