# 公開前検査の判定

検査日: 2026-10-15。エラーは免除していない。判定は ERROR 1 件（修正済み）と REVIEW 58 件（受理）です。

| # | レベル | ルール | 場所 | 判定 | 根拠 |
|---:|---|---|---|---|---|
| 0 | ERROR | CACHE_BUSTER | public/hihaho-widgets/live_stats_overlay3.html:157 | fixed | Date.now() を付けた fetch をやめ、同じ URL を cache: no-cache で 30 秒ごとに再検証する。再スキャンで ERROR は 0 件。 |
| 1 | REVIEW | PUBLIC_READ | firestore.rules:51 | accepted | playlists の公開読み取りは hihaho-view / hihaho-player の匿名再生に必要。書き込みは isHihahoEditor() のみ。2026-10-15 にルール本文を確認。 |
| 2 | REVIEW | PUBLIC_READ | firestore.rules:55 | accepted | video_meta の公開読み取りはサムネイル表示に必要。書き込みは編集者のみで、タイトル等のサイズ上限がある。 |
| 3 | REVIEW | PUBLIC_READ | firestore.rules:348 | accepted | hihaho-material は Chrome 拡張の一覧取得のため公開読み取り。作成・更新・削除は確認済みの編集者のみで、type と tags の上限がある。 |
| 4 | REVIEW | PUBLIC_READ | firestore.rules:402 | accepted | hondoko-config/sharing の公開読み取りは link/public の未ログイン閲覧判定に必要。書き込みは確認済みオーナーのみ。viewers のメールが見える残リスクは docs/anonymous-user-impact.md に記載。 |
| 5 | REVIEW | HTTP_SERVER | functions/fst-feedback.js:1 | accepted | fstFeedbackSubmit は authorize で App Check と確認済み非匿名を要求し、reserve は呼ばない。costControls/global.enabled が true でないと SERVICE_PAUSED。fstRateLimits でユーザーと IP を制限し、status は unreviewed 固定。有料 API は呼ばない。 |
| 6 | REVIEW | HTTP_SERVER | functions/hondoko.js:1 | accepted | hondokoAnalyze は getGuard().authorize と reserve を通す。Amazon/NDL/Cover は ID トークンとメンバー判定のあとだけ外部APIを呼ぶ。2026-10-15 の functions 試験で未認証の有料呼び出しは 0。 |
| 7 | REVIEW | HTTP_SERVER | functions/index.js:1 | accepted | anthropicProxy / realtimeToken / interpreterCall は authorize と reserve の成功前にプロバイダを呼ばない。assetServe は GET/HEAD、パス検証、Cache-Control と ETag。endpoint-denials 試験で拒否を確認。 |
| 8 | REVIEW | HTTP_SERVER | functions/mini-me.js:1 | accepted | miniMeGenerate は authorize と reserve を要求。Checkout は許可オリジンとサーバー側の価格計算。Webhook は Stripe 署名検証。生成APIの未認証呼び出しは試験で拒否。 |
| 9 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:60 | accepted | hondoko-config/sharing の単一ドキュメント購読。useEffect が unsubscribe を返す。link/public 判定に必要。 |
| 10 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:80 | accepted | members の単一ドキュメント購読。ログイン後だけ張り、cleanup で解除する。 |
| 11 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:101 | accepted | hondoko-shelves は閲覧権限があるときだけ購読し、6 本まとめて cleanup で解除する。 |
| 12 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:104 | accepted | hondoko-books の購読。同じ effect の cleanup で解除。未ログインの link/public は既存の閲覧仕様。 |
| 13 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:107 | accepted | hondoko-photos の購読。同じ cleanup。 |
| 14 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:110 | accepted | hondoko-maps の購読。同じ cleanup。 |
| 15 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:113 | accepted | hondoko-comments の購読。同じ cleanup。 |
| 16 | REVIEW | DB_LISTENER | hondoko-src/src/App.tsx:116 | accepted | hondoko-reviews の購読。同じ cleanup。 |
| 17 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO/index.html:829 | accepted | users/{uid}/projects を type==routine で購読し unsub する。本人データのみ。 |
| 18 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO/index.html:1626 | accepted | users/{uid} 配下の categories 単一ドキュメント。useEffect が unsub する。 |
| 19 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO/index.html:1647 | accepted | users/{uid}/tasks の購読。unsubscribe を保持する。他人のタスクはルールで拒否。 |
| 20 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO_dev/index.html:4721 | accepted | 開発版の routine projects。users/{uid}/projects に限定し unsub する。 |
| 21 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO_dev/index.html:5205 | accepted | 開発版の categories 単一ドキュメント。unsub あり。 |
| 22 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO_dev/index.html:5250 | accepted | 開発版の projects 購読。users/{uid}/projects。unsub あり。 |
| 23 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO_dev/index.html:5258 | accepted | 開発版の enhancedRequests 単一ドキュメント。unsub あり。 |
| 24 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO_dev/index.html:5375 | accepted | fst_admin/broadcast にルールの許可が無く、末尾の拒否に落ちる。未ログインへデータを配らない。リスナーは失敗して読み取りが増え続けない。 |
| 25 | REVIEW | DB_LISTENER | public/Flight_Strip_TODO_dev/index.html:5577 | accepted | 開発版の users/{uid}/tasks。unsubscribe を保持する。 |
| 26 | REVIEW | HTTP_SERVER | public/ai-meeting/worker/src/worker.js:1 | accepted | この Worker は Firebase ではなく Cloudflare。共有トークンがないと Anthropic へ中継しない。GCP の 1,000 円停止の対象外なので、Anthropic 側の支出上限は人間が別途設定する。 |
| 27 | REVIEW | DB_QUERY | public/app-dashboard/index.html:167 | accepted | apps 一覧。ルールは canShare(apps__registry) が必要で、未ログインは拒否。件数は社内のアプリ台帳規模。 |
| 28 | REVIEW | DB_QUERY | public/app-dashboard/index.html:173 | accepted | インデックスが無いときの apps 全件取得。同じ認証と grant が必要。公開コレクションではない。 |
| 29 | REVIEW | DB_QUERY | public/app-dashboard/index.html:184 | accepted | seedIfEmpty が apps を読んで空なら初期データを入れる。未ログインと grant なしはルールで拒否される。 |
| 30 | REVIEW | DB_QUERY | public/bombing-bay/index.html:1290 | accepted | getDocs は orderBy(score) と limit(n) 付きの上位ランキング。読み取りは bombing-bay__global の許可ユーザーのみ。 |
| 31 | REVIEW | DB_LISTENER | public/coco-itta/index.html:2694 | accepted | groups/{groupId} の単一ドキュメント。groupUnsub で解除する。確認済みアカウントの get だけを許し、匿名サインインと全件 list は拒否。ピン更新は members の人だけ。 |
| 32 | REVIEW | LARGE_PUBLIC_FILE | public/hazard-dashboard/data/kanda-20260909.bin:1 | accepted | 静的なハザードメッシュ。firebase.json で /hazard-dashboard/data/** に Cache-Control max-age=86400 を付与。リクエスト毎の生成ではない。 |
| 33 | REVIEW | LARGE_PUBLIC_FILE | public/hazard-dashboard/data/shakujii-20260909.bin:1 | accepted | 静的なハザードメッシュ。同じ Cache-Control max-age=86400。動的レンダリングや有料APIは無い。 |
| 34 | REVIEW | LARGE_PUBLIC_FILE | public/hazard-dashboard/data/sumida-20260909.bin:1 | accepted | 静的なハザードメッシュ。同じ Cache-Control max-age=86400。 |
| 35 | REVIEW | DB_QUERY | public/hihaho-admin/index.html:553 | accepted | 編集者画面の video_meta 一覧。読み取りは公開だが書き込みは編集者のみ。管理画面はログイン後に使う。 |
| 36 | REVIEW | DB_QUERY | public/hihaho-admin/index.html:594 | accepted | playlists の全件取得。公開読み取りは再生アプリの仕様。書き込みは編集者のみ。 |
| 37 | REVIEW | DB_QUERY | public/hihaho-admin/index.html:1504 | accepted | loadAllPlaylists の playlists 全件。同上。編集者向けの管理操作。 |
| 38 | REVIEW | DB_QUERY | public/hihaho-admin/index.html:1833 | accepted | playlist_analytics の一覧。未ログインは拒否。hihaho 編集者か hihaho-analytics__global の reader だけが読める。 |
| 39 | REVIEW | DB_QUERY | public/hihaho-admin/index.html:1834 | accepted | video_analytics の一覧。未ログインは拒否。編集者か許可 reader のみ。+1 書き込みは grant と増分検証が必要。 |
| 40 | REVIEW | DB_QUERY | public/hihaho-admin/index.html:1838 | accepted | 分析画面がプレイリスト名を足すための playlists 全件取得。公開読み取りは再生アプリの仕様で、書き込みは編集者のみ。 |
| 41 | REVIEW | LARGE_PUBLIC_FILE | public/hihaho-hub/booth.jpg:1 | accepted | ブース写真の静的 JPEG。firebase.json で /hihaho-hub/booth.jpg に Cache-Control max-age=86400。 |
| 42 | REVIEW | LARGE_PUBLIC_FILE | public/hihaho-release-2609/hihaho-release-2609.mp4:1 | accepted | 2026年9月リリースの静的な解説動画。リクエスト毎の生成ではない。firebase.json の /hihaho-release-*/**/*.mp4 に Cache-Control max-age=86400。 |
| 43 | REVIEW | LARGE_PUBLIC_FILE | public/hihaho-release-sep/hihaho-release-sep-en.mp4:1 | accepted | 9月リリースノート英語版の静的動画。同じ Cache-Control max-age=86400。有料APIは呼ばない。 |
| 44 | REVIEW | LARGE_PUBLIC_FILE | public/hihaho-release-sep/hihaho-release-sep-ja.mp4:1 | accepted | 9月リリースノート日本語版の静的動画。同じ Cache-Control max-age=86400。有料APIは呼ばない。 |
| 45 | REVIEW | LARGE_PUBLIC_FILE | public/hihaho-release-v3400/hihaho-release-v3400.mp4:1 | accepted | v3.40.0 リリースノートの静的動画。同じ Cache-Control max-age=86400。有料APIは呼ばない。 |
| 46 | REVIEW | DB_LISTENER | public/hondoko/assets/index-EhwcnUma.js:40 | accepted | hondoko-src のビルド成果物。購読本数と解除は App.tsx と同じ。ソース側の 8 件と二重には数えないが、配信物にもリスナーが含まれるため記録する。 |
| 47 | REVIEW | DB_LISTENER | public/meet-knowledge/index.html:366 | accepted | meet-knowledge/{team}/entries。unsubscribe を保持。読み取りは meet-knowledge__{team} の grant が必要。 |
| 48 | REVIEW | DB_QUERY | public/meishi-db/index.html:605 | accepted | users/{uid}/meishiCards を本人だけが読む。ルールは request.auth.uid == userId。他人の名刺は読めない。 |
| 49 | REVIEW | DB_QUERY | public/meishi-db/index.html:1338 | accepted | 同じ本人コレクションを email で重複確認。コレクション全体の公開取得ではない。 |
| 50 | REVIEW | DB_QUERY | public/meishi-db/index.html:1342 | accepted | 同じ本人コレクションを姓名で重複確認。uid 境界の外には出ない。 |
| 51 | REVIEW | HTTP_SERVER | public/meishi-sf/worker/src/worker.js:1 | accepted | meishi-sf Worker も Cloudflare。SHARED_TOKEN 不一致は 401。Salesforce と Anthropic の鍵は Worker secret。GCP 予算停止では止まらないため、プロバイダ側の上限設定が残作業。 |
| 52 | REVIEW | DB_LISTENER | public/ouchi-hamasushi/cloud-store.js:94 | accepted | 家族コードの assets を、共有ログインの Promise のあとで購読。currentUnsubscribe で解除。未ログインはルールで拒否。 |
| 53 | REVIEW | DB_LISTENER | public/outreach-crm/index.html:321 | accepted | outreach-crm/{workspace} の単一ドキュメント。unsub を保持。grant が無いとルールで拒否。 |
| 54 | REVIEW | DB_LISTENER | public/tomoe-home/index.html:289 | accepted | tomoe-home/config の単一ドキュメント。requireCCDevLogin のあとで購読。grant が必要。 |
| 55 | REVIEW | PUBLIC_READ | storage.rules:29 | accepted | hihaho-thumbs は公開画像。書き込みは確認済み編集者、5MB 未満、image/* のみ。 |
| 56 | REVIEW | PUBLIC_READ | storage.rules:38 | accepted | logos はプレイリストのロゴ。公開読み取り、確認済み編集者のみ書き込み、2MB 未満の画像。 |
| 57 | REVIEW | PUBLIC_READ | storage.rules:47 | accepted | hihaho-material の実ファイルは公開読み取り。書き込みは確認済み編集者、30MB 未満。配信関数 assetServe は GET/HEAD と ETag のみ。 |
| 58 | REVIEW | PUBLIC_READ | storage.rules:56 | accepted | hondoko の棚写真は共有リンク閲覧のため公開読み取り。書き込みは確認済みアカウントの 10MB 未満の画像。 |
