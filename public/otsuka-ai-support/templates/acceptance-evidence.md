# 受入条件の証拠（PR #9）

- 照合した標準: 企画7課アプリ開発標準 1.1.0 の 13.1〜13.4、Webアプリケーションセキュリティ標準 1.0.0
- 対象: このPRの静的テンプレートと文書（`public/otsuka-ai-support/templates/`）
- 確認日: 2026-10-22
- 確認方法: ローカルの静的サーバ `http://127.0.0.1:8765/otsuka-ai-support/templates/` を Chrome で開く。幅は 1280×900 と 375×812
- 本番URLでのスモークテストはしていない。マージもデプロイもしていない

判定は「適用あり／対象外」。適用ありは「満たす／満たさない」。

親の公開ページ `public/otsuka-ai-support/index.html` には、企画7課の共通ヘッダー（取扱説明書、版番号から開くリリースノート、目安箱）はない。あるのは店名ヘッダー、問い合わせフォーム、コンソールログ用の🐞ボタンだけである。だからこのPRでは、一覧とデザイン集に版・取扱説明・診断コピーを足し、店舗下書きの見た目と、目安箱API、App Registry は足していない。

## 13.1 共通UI

| 項目 | 判定 | 根拠 |
|---|---|---|
| アプリ名のクリックで取扱説明書が開く | 一覧・デザイン集は満たす。4店舗ページは満たさない | 一覧 `gallery.html` とデザイン集 `index.html` の `#openManual` が `catalog-meta.js` の取扱説明書ダイアログを開く。2026-10-22、デザイン集で開いたとき `open: true`、見出しは「取扱説明書」、本文に目的・使い方・操作・注意があった。4店舗HTMLにこのボタンは無い |
| 「ホームへ戻る」と「閉じる」がある | 一覧・デザイン集は満たす。4店舗ページは満たさない | 両ダイアログにリンク `https://cc-dev-ps7.web.app/`（表示「ホームへ戻る」）と「閉じる」ボタンがある。`catalog-meta.js` の `makeDialog`。店舗ページにはダイアログが無い |
| Escape、フォーカス移動、フォーカス復帰 | 一覧・デザイン集は満たす。4店舗ページは対象外（モーダルが無い） | 一覧でリリースノートを開くと、初期フォーカスはダイアログ内の「閉じる」。Tab は「ホームへ戻る」と「閉じる」だけを往復し、Shift+Tab でもダイアログ外へ出なかった。Escape で閉じ、フォーカスは `#openNotes` に戻った。背景クリックでも取扱説明書は閉じた（`open` が false） |
| 版番号クリックでリリースノートが開く | 一覧・デザイン集は満たす。4店舗ページは満たさない | `#openNotes` の表示はスクリプトが `v1.1.0` に揃える。開いた本文の先頭は `v1.1.0 公開日 2026-10-19`、次が `v1.0.0 公開日 2026-09-12`。破壊的変更は無い旨を本文に書いた。店舗ページに版番号は無い |
| 診断情報を1操作でコピーでき、秘密と個人情報を含まない | 一覧・デザイン集は満たす。4店舗ページは対象外 | `#debugCopy`。コピー本文は `diagnosticText`（appId、version、クエリとフラグメントを除いたURL、platform と言語、ISO時刻、画面名、エラーメッセージ最大20件、errorCode）。氏名・電話・フォーム値は組み立てない。ヘッドレスChromeで「診断情報をコピーしました」を観測。別実行ではクリップボードが拒否され、「コピーできませんでした。下の文字を選択してコピーしてください」と、選択可能な同じ本文が出た。その本文に `03-0000` と `@` は無かった。成功時のクリップボード再読はこの環境では空だった |

店舗ページを満たさない理由: 架空店舗の納品下書きであり、親の公開ページにも同じ共通ヘッダーが無い。4ページのヘッダーをアプリ用モーダルに作り替えるのは、このPRの範囲を超える。

スクリーンショット: `acceptance_notes_pc.png`（リリースノート）、`acceptance_manual_sp.png`（取扱説明書、375px）、`acceptance_debug_toast.png`（コピー成功の通知）。

## 13.2 目安箱

すべて対象外。このPRに送信フォーム、Cloud Functions、Firestore への書き込みは無い。

| 項目 | 判定 |
|---|---|
| 中央Feedbackへ送信される | 対象外。送信UIが無い |
| appId、version、url、サーバー時刻が記録される | 対象外。保存処理が無い |
| 個人情報を入力しない旨を送信前に表示する | 対象外。入力欄が無い |
| クライアントからのFirestore直接書き込みをRulesで拒否する | 対象外。このPRは Rules を変更していない |
| サーバー側の型、長さ、列挙値、URL検証 | 対象外。APIが無い |
| レート制限、App Check、スパム対策 | 対象外。APIが無い |
| 新規が unreviewed | 対象外。登録が無い |
| 管理者だけが4種のstatusを変える | 対象外。管理画面が無い |

## 13.3 App Registry / Developer Console

すべて対象外。Apps、ChangeLog、Analytics、Feedback の保存も、Developer Console も、このPRには無い。

| 項目 | 判定 |
|---|---|
| 必須項目が仕様どおり保存される | 対象外。台帳への書き込みが無い |
| 稼働数、今週アクセス、未対応Feedbackの集計 | 対象外。集計画面が無い |
| 一覧、推移、Feedback、変更履歴の閲覧と絞り込み | 対象外。Consoleが無い |
| 未認証者と非管理者はConsoleへ入れない | 対象外。Consoleが無い |
| 0件と未取得を区別する | 対象外。その画面が無い |

## 13.4 AI運用・開発・デプロイ

| 項目 | 判定 | 根拠 |
|---|---|---|
| CodexとClaude Codeが同じ正本を参照する | 対象外 | このPRは正本の配置を変えていない。リポジトリに企画7課標準の SKILL.md は置いていない |
| 開発開始、version変更、Phase変更、主要改善でAppsとChangeLogが更新される | 対象外 | App Registry の更新経路がこのアプリに無い。ブラウザからFirestoreへは書かない |
| 再実行しても同一ChangeLogが重複しない | 対象外 | ChangeLogを書いていない |
| 表示バージョン、Apps、ChangeLog、リリースノートが一致する | 満たさない | 一覧・デザイン集の表示と `catalog-meta.js` の `APP_VERSION`、ノート先頭はいずれも `1.1.0`（公開日 2026-10-19）。Apps と ChangeLog のレコードは無く、4点の一致は確認できない |
| `public/<project-name>/` のサブパスで動く | 満たす | `http://127.0.0.1:8765/otsuka-ai-support/templates/` および `industries/*.html`。1280px と 375px で横スクロールは無かった（scrollWidth と clientWidth が一致） |
| GitHub Actionsが成功し、本番URLでスモークテストが完了する | 満たさない | 実施していない。ブランチのpushであり、main へのマージと Hosting へのデプロイはしていない |
| リリースノートがコードと同じcommitに含まれる | 満たす | `catalog-meta.js` の `NOTES` を、版表示と同じ変更としてコミットする |

## セキュリティ点検（このPRの追加分）

| 観点 | 観測 |
|---|---|
| 外部スクリプト | 無い。スクリプトは各店舗HTMLのインラインと、同一ディレクトリの `catalog-meta.js` だけ。外部は Google Fonts のCSS（`fonts.googleapis.com` / `fonts.gstatic.com`） |
| iframe | 一覧の縮小プレビュー4つ。`sandbox="allow-scripts"`（`allow-same-origin` は付けない）、`referrerpolicy="no-referrer"`、`tabindex="-1"`。親DOMは読めない。地図の埋め込みiframeは無い |
| フォーム | このPRのHTMLに `form` は無い（2026-10-22 の確認で forms は 0） |
| 個人情報 | 店名・電話 `03-0000-11xx`・住所の `XX` は架空。診断コピーはクエリ、フラグメント、電話、メールを含めない。User-Agent全文はコピーしない |
| innerHTML | `catalog-meta.js` と4店舗・一覧に `innerHTML` 代入は無い。文言は `textContent` |
| 外部リンク | 地図リンクは `https` の Google マップで、`target="_blank"` と `rel="noopener noreferrer"`。デザイン集の `target="_blank"` にも `noreferrer` を足した |
| 保存 | `localStorage` / `sessionStorage` / `fetch` は、このPRの追加ファイルに無い |
| HTTPヘッダー | `firebase.json` の main Hosting は HTML に `Cache-Control: no-cache, no-store, must-revalidate` だけ。CSP、`X-Content-Type-Options`、Referrer-Policy、HSTS はこのPRで足していない。本番レスポンスは未確認 |
| コンソール | 一覧で `/favicon.ico` の 404 を観測。ページは link で favicon を指定していない。既存デザイン集と同じ。機能は壊れていない |

残リスク: Google Fonts は第三者配信。CSPが無いので、フォント用の許可を書けていない。sandbox 付きiframeでも子ページのスクリプトは動く（親とは別オリジン）。

## 表示確認（2026-10-22）

横スクロールなし、コンソールのページエラーなし。h1 は次のとおり。

| ページ | 1280px | 375px |
|---|---|---|
| 一覧 gallery.html | 業種別テンプレート一覧 | 同左 |
| 飲食 inshoku.html | 昼の定食を、きちんと出す。 | 同左 |
| 美容 biyou.html | 髪処 ルミエル | 同左 |
| 整体 seitai.html | 肩が上がったままの日に、一度、横になる。 | 同左 |
| 建設 kensetsu.html | 必要なところだけ、直す。 | 同左 |

スクリーンショット（ファイル名）:

- `acceptance_gallery_pc.png` / `acceptance_gallery_sp.png`
- `acceptance_inshoku_pc.png` / `acceptance_inshoku_sp.png`
- `acceptance_biyou_pc.png` / `acceptance_biyou_sp.png`
- `acceptance_seitai_pc.png` / `acceptance_seitai_sp.png`
- `acceptance_kensetsu_pc.png` / `acceptance_kensetsu_sp.png`
- `acceptance_catalog_pc.png`（デザイン集。版番号と診断コピー）
- `acceptance_notes_pc.png` / `acceptance_manual_sp.png` / `acceptance_debug_toast.png`

## この確認で直した点

- 一覧とデザイン集に、取扱説明書、リリースノート（v1.1.0 を先頭、v1.0.0 が次）、診断コピーを追加した。版の定数は `catalog-meta.js` の `APP_VERSION = "1.1.0"`
- ダイアログは Escape、背景クリック、閉じる、で閉じる。Tab はダイアログ内に留まる
- 一覧iframeを sandbox にした
- デザイン集の `target="_blank"` に `noreferrer` を足した

## 未解決（大きな追加はしていない）

- 4店舗ページに共通ヘッダー、取扱説明書、リリースノート、診断コピーが無い
- 目安箱のAPI、検証、App Check、レート制限、Rules
- Apps / ChangeLog / Analytics / Feedback と Developer Console
- 表示版と Apps・ChangeLog の一致
- 正本 SKILL.md の配置と、AIによる台帳更新
- 本番スモークと GitHub Actions の成功確認（デプロイしていない）
- Hosting のセキュリティヘッダー（CSP 等）。全アプリに効くため未変更
- `/favicon.ico` の 404
