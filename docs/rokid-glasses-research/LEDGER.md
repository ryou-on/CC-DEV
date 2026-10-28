# Rokid Glasses 開発・販売リサーチ｜共通指示書兼ナレッジ台帳

更新日：2026-10-28（日本時間）  
対象：**カメラ・AI機能付きの Rokid Glasses**。Rokid Max、AR Spatial、Glass3、画面のない Style は混同しない。

## 使い方

1. このファイル全体を各AIに渡し、「共通調査指示」を実行させる。
2. 各AIの回答を「AI別レポート」に追記する。AIには既存記録を消させない。
3. 比較担当AIに本ファイル全体を渡し、「統合・差分比較指示」を実行させる。
4. **確定したナレッジの正本はこのファイルだけ**とする。別チャットの回答は、ここに取り込むまで未統合資料として扱う。

## 共通調査指示（各AIにそのまま渡す）

あなたはRokid Glasses向けアプリの開発・販売可能性を調査するリサーチャーです。このMarkdownを読んでから調査してください。現在の日付を明記し、最新の公開情報をWebで確認してください。対象はカメラ・AI機能付きの**表示付きRokid Glasses**です。機種・型番・地域・ファームウェアが異なる情報は必ず区別してください。

調査する項目：

1. 公式開発者ポータル、AIUI、CXR-L、CXR-M、CXR-S、グラス本体アプリ開発の現状。各方式の対象機種、OS、言語、動作場所、必要なアカウント・実機・周辺機器、公開SDKか契約制か。
2. カメラ、マイク、音声認識、音声合成、HUD表示、ボタン操作、通信、バックグラウンド処理について、**公式に保証されたAPI**と、事例で使われた方法を分ける。API名、SDKバージョン、サンプルコードのURLを示す。
3. 最小アプリを作る手順。開発環境、ビルド、シミュレーター、実機導入、デバッグ、配布、公開審査までを調べる。
4. 商用利用許諾、SDK再配布、Agent Storeへの出品、有料販売、課金方法、手数料、収益分配、日本居住者への支払い、外部決済の可否。規約本文や公式FAQを優先し、確認できない項目は「未確認」と書く。
5. 実装・販売事例を最低5件。各事例に製作者の一次資料、対象機種、構成、公開状態、課金の証拠、最終更新日、実機検証の有無を付ける。
6. 日本市場での実装・販売に必要な検証事項。特に日本向け端末のSDK対応、表示言語、プライバシー、アプリ公開経路、継続費用。

出典は公式ドキュメント、公式GitHub、開発者本人のリポジトリ・販売ページ、ストア掲載ページを優先してください。ニュースやまとめ記事は発見の手掛かりに留め、事実確認には一次資料を使用してください。各主張に直接対応するURLと、ページの更新日または確認日を付けてください。**「資料に書いてある」「実機で動作確認された」「推測」を混ぜない**でください。旧SDKの説明を現行仕様に転用しないでください。

回答は以下の順で、このファイルに追記しやすいMarkdownとして出してください。

- 調査者・モデル・調査日・調査範囲
- 要点（最大5項目）
- 方式比較表
- 主張一覧：ID、主張、対象機種、出典URL、出典種別、日付、確度（A＝公式明記／B＝開発者の一次資料／C＝推測・二次資料）、実機検証の有無
- 事例比較表
- 販売条件：確認済み／未確認
- この台帳の既存主張との一致・差分・矛盾
- 次に確認すべき質問（最大10項目）

出典を開けなかった場合、開けたふりをせず、その項目を「未検証」としてください。ユーザーの許可なくRokidや事例の開発者に連絡しないでください。

## 統合・差分比較指示（比較担当AIにそのまま渡す）

このファイルの「AI別レポート」を読み、共通する主張と食い違う主張を比較してください。単なる文面の類似度ではなく、**対象機種・機能・SDKバージョン・地域・時点・販売経路が同じか**で判定してください。出典URLが同じ主張は独立した裏付けとして数えないでください。

1. 同義の主張を1つのナレッジIDに統合し、支持するAI名と一次資料を列挙する。
2. 異なる主張は「真の矛盾」「機種差」「版差」「地域差」「時点差」「定義の違い」「証拠不足」に分類する。分類理由を1文で示す。
3. 確度Aの公式資料でも、古い資料は現行版と照合する。多数決だけで確定しない。
4. 「確認済みナレッジ」「要検証」「否定・旧情報」に振り分ける。既存の記録は削除せず、変更履歴に残す。
5. 開発・販売の判断に影響が大きい未解決点を優先順位付きで示す。

出力は更新済みのこのファイル全文、または置換対象の見出しと更新本文を示してください。元の出典URLとAI別レポートは残してください。

## 確認済みナレッジ（初期版）

| ID | 主張 | 対象・条件 | 根拠 | 確度 | 状態 |
|---|---|---|---|---|---|
| K-001 | CXR-LはRokid AI App経由で画像・音声・表示・キー操作にアクセスするスマホ向けSDK。Android/iOS対応と案内される | Rokid Glasses。公式掲載の版は1.1.2、更新日は2026-09-08 | [公式SDK一覧](https://developerdoc.rokid.com/sdk?lang=en) | A | 文書確認。実機未検証 |
| K-002 | CXR-Mは公式サイトで商談窓口経由と案内される | Rokid Glasses、Android | [公式SDK一覧](https://developerdoc.rokid.com/sdk?lang=en) | A | 文書確認。契約条件未確認 |
| K-003 | AIUI Studioは作成・シミュレーション・実機確認・Agent Store審査提出の手順を公開 | 表示付きRokid Glasses。アカウント・地域等で利用可否が変わり得る | [公式QuickStart](https://js.rokid.com/AIUI/guide/quickstart/quickstart?lang=en-US&version=latest)、[公式解説](https://global.rokid.com/de/blogs/academy-glasses/glasses-3-6-aiui) | A | 文書確認。日本アカウントで未検証 |
| K-004 | AIUI公式の開発ツール・スターター・サンプルがGitHubにある | 表示付きAIグラス | [公式GitHub](https://github.com/yodaos-project/AIUI) | A | リポジトリ確認。実機未検証 |
| K-005 | Rokid対応を明記したAccuNoteが日本のApp Storeにあり、グラスのマイク・字幕・写真機能を説明している | ストア掲載時点。採用SDKは不明 | [App Store掲載](https://apps.apple.com/jp/app/id6782253686) | B | 掲載確認。実機未検証 |
| K-006 | ClawLensXRはRokid対応のAndroid＋グラス連携サービスを有料会員制で提供している | 対応機種・ファームウェアは要個別確認 | [開発者の販売ページ](https://clawlensxr.com/) | B | 販売ページ確認。売上・対応端末未検証 |

確度は情報源の種類を示し、実機の動作保証や商用許諾を意味しません。

## 要検証・販売判断に必要な質問

| ID | 質問 | 判断への影響 | 確認先・方法 | 状態 |
|---|---|---|---|---|
| Q-001 | 日本の個人開発者はAgent Storeで有料販売できるか | 販売経路 | 公式規約・開発者管理画面・Rokid窓口 | 未確認 |
| Q-002 | ストアの課金方式・手数料・入金国・支払条件は何か | 採算 | 公式規約・管理画面 | 未確認 |
| Q-003 | AIUI Agent内の外部決済・自社会員認証は許されるか | 価格設計 | 審査規則・開発者規約 | 未確認 |
| Q-004 | CXR-Lの商用利用・SDK再配布・アプリ販売の許諾範囲は何か | リリース可否 | SDKライセンス原文 | 未確認 |
| Q-005 | 日本で販売される対象型番・現行ファームで撮影・表示・音声APIが動くか | 製品成立 | 正確な型番の実機試験 | 未検証 |
| Q-006 | グラスとスマホの接続復帰、応答時間、電池消費は実用範囲か | UX・運用費 | 実機計測 | 未検証 |

## AI別レポート

### レポート R-001｜Codex｜2026-10-28

初期調査の要点は上のK-001～K-006。参考実装として、[HelloRokid-v2](https://github.com/saintlouisleetokyowest-bot/HelloRokid-v2)は撮影→BLE転送→スマホ→AI解析→HUD表示の構成を公開している。ただし、この資料だけでは商用品質・実機動作・販売実績を確認できない。多くの事例を探す入口として[awesome-rokid](https://github.com/Anezium/awesome-rokid)があるが、非公式一覧であり、掲載だけで動作保証とはしない。

### レポート R-002｜Claude Code（クラウド実行）｜2026-10-28

#### 調査者・モデル・調査日・調査範囲

- 調査者：Claude Code（Anthropic）。モデル：Claude Opus 5.5（設定値。実行時モデルは変わり得る）
- 調査日：2026-10-28（日本時間）
- **調査環境の制約**：実行環境のネットワーク制限で、`developerdoc.rokid.com`・`js.rokid.com`・`global.rokid.com`・`apps.apple.com`・`clawlensxr.com`・`maven.rokid.com` は**開けなかった（未検証）**。開けたのは GitHub（clone・API）と Web 検索の要約のみ。したがって公式情報は主に**公式GitHub `yodaos-project/AIUI` 内のドキュメント原文**で確認した。Web検索で得た報道は確度Cとして扱う。
- 範囲：AIUI（公式リポジトリの文書・サンプル）、CXR-L / CXR-M の実利用リポジトリ、awesome-rokid 掲載事例、日本発売報道、Agent Store・SDKライセンス関連の検索。
- 実機検証：**一切なし**（本レポートの「実機検証」欄はすべて開発者側の申告を転記したもの）。

#### 要点

1. **Agent Store の公開対象地域が文書間で食い違う。** 公式GitHubの公開手順（英語・中国語とも、2026-09-07更新）は「Hi Rokid Agent Storeに公開し、**中国大陸のユーザー**が利用できる」と書く。一方、2026-09のIFA発表報道は AIUI Studio(Global) の世界展開・米国での Agent Store 提供を伝える。日本ユーザーへの配信可否は未確認（R-002-07, -08）。
2. **Agent Store の有料販売・収益分配の仕組みは公開資料に存在しない。** 公式AIUI文書に課金・決済・手数料の記述はなく、報道では Rokid 幹部が「育成段階で当面マネタイズ計画なし」と述べたとされる（確度C）。有料化は現時点では**ストア外の自前課金**（事例：ClawLensXR、SmartCam、AccuNote）しか確認できない。
3. **AIUI は公式に保証されたAPIが最も厚い。** `getUserMedia`/`ImageCapture.takePhoto`/`MediaRecorder`（カメラ・マイク）、`SpeechRecognition`、音声合成、`LanguageModel`、権限照会 `navigator.permissions.query`（AIUI 0.20.0）などが公式文書で定義済み。審査では権限の申告とコードの一致が求められる。
4. **CXR-M は契約制の実態が開発者資料で裏付けられる。** `com.rokid.cxr:client-m:1.2.2` の実機手順書は、グラスのシリアル番号ごとに発行される SN ライセンスファイル（`.lc`）と client secret を要求する（K-002 と整合）。CXR-L は実利用版 `client-l:1.0.1` で `customViewUpdate` が再描画されない不具合報告あり。
5. **CXR SDK のライセンス原文は誰も確認できていない。** 複数の事例リポジトリが「CXR SDK はプロプライエタリで別途 Rokid の条件に従う」と明記し、SDKを再配布していない。商用利用許諾は Q-004 のまま未確認。

#### 方式比較表

| 方式 | 動作場所 | 言語・形式 | 対象機種（資料記載） | 必要なもの | 公開/契約 | 主な出典 |
|---|---|---|---|---|---|---|
| AIUI（Agent / AIX） | グラス上のAIUIランタイム（Ink/WXML+JS） | JavaScript、`.ink` SFC、AIX パッケージ | 「Rokid Glasses等の表示付きAIグラス」。Studio v1.2.1でフルカラー端末のデバッグ対応 | Rokidアカウント、AIUI Studio(Global)（ブラウザ）、Hi Rokid アプリ、実機（実機確認は必須工程）、Node.js 20+（CLI利用時） | 公開（Apache-2.0のツール群） | [AIUI README](https://github.com/yodaos-project/AIUI)、[QuickStart原文](https://github.com/yodaos-project/AIUI/blob/main/documentation/0-guide/quickstart/quickstart.en-US.md) |
| CXR-L | スマホアプリ（Rokid AI App / Hi Rokid 経由でグラスに接続） | Android（Kotlin/Java）。iOS対応はK-001の公式記載のみ（本調査では未検証） | Rokid AI Glasses（Global版 `com.rokid.sprite.global.aiapp` / 中国版 `com.rokid.sprite.aiapp`） | ホストアプリ導入済みスマホ、OAuth認可、minSdk 31 | Maven公開アーティファクト。ライセンス原文未確認 | [RokidAIGlassesUnityBridge](https://github.com/ARDings/RokidAIGlassesUnityBridge) |
| CXR-M | スマホアプリ（BT制御＋Wi‑Fi P2Pデータ） | Android（Kotlin） | 「CXR-M v1.2.2 対応の Rokid Glasses」 | SNライセンス `.lc`（グラス個体ごと）＋client secret、Android 12+推奨 | 実質契約制（開発者認可が必要） | [xg-glass-sdk Rokid E2E手順](https://github.com/hkust-spark/xg-glass-sdk/blob/main/docs/rokid-real-glasses-e2e.md) |
| CXR-S | グラス側（CXR-Lと組み合わせ） | Android | 未確認 | 未確認 | 未確認 | [Rokid-Relay](https://github.com/Anezium/Rokid-Relay)（CXR-L＋CXR-S 使用と記載のみ） |
| グラス本体Androidアプリ（APK サイドロード） | グラス上（YodaOS-Sprite / Android系） | Android（Camera2・BLE等の標準API） | RV101 と記載する事例多数 | ADB/開発者モード、サイドロード | **公式な配布経路・保証なし**（事例で使われた方法） | [SmartCam](https://github.com/ShaBP/smartcam-rokid-apk)、[HelloRokid-v2](https://github.com/saintlouisleetokyowest-bot/HelloRokid-v2) |

#### 機能別：公式API と 事例で使われた方法

| 機能 | 公式に文書化されたAPI（AIUI） | 事例で使われた方法（非保証） |
|---|---|---|
| カメラ | `navigator.mediaDevices.getUserMedia`、`ImageCapture.takePhoto({quality, mode, enableSystemPreview})`、`mode:'wide'`=2016×2688、`MediaRecorder`（`video/mp4` 等）。`app.json.permissions` に `CAMERA` 必須。`lifetime==='cut'` では使用不可（[media-capture](https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/media/media-capture.en-US.md)、2026-10-23更新） | CXR-L `takePhoto(w,h,q)`（解像度一覧APIなし、グラス側で拡縮）／グラス側 Camera2 直接利用（HelloRokid-v2） |
| マイク | `getUserMedia({audio:true})`、`RECORD_AUDIO` 宣言、`wx.media.getRecorderManager()`（音声のみ） | CXR-L 音声ストリーム 16kHz mono 16bit PCM（UnityBridge） |
| 音声認識 | `SpeechRecognition`（Web形式／wx形式）（[speech-recognition](https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/ai/speech-recognition.en-US.md)） | スマホ側で Whisper / OpenAI / ElevenLabs 等の外部STT（Rokid-Relay、RokidAIAssistant） |
| 音声合成 | speech-synthesis API（[speech-synthesis](https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/ai/speech-synthesis.en-US.md)）、TTSサンプル | 非公開TTS binder を叩くライブラリ（[rokid-private-tts-kit](https://github.com/bzerk/rokid-private-tts-kit)、awesome-rokid掲載のみで未確認） |
| LLM | `LanguageModel.availability()/create()`、Agent Session API（0.20.0） | スマホ側で Gemini/OpenAI/Anthropic 等を直接呼ぶ |
| HUD表示 | Ink/WXML コンポーネント、モノクロ緑ディスプレイ設計指針 | CXR-L CustomView（JSONレイアウト。`customViewUpdate` 不具合→close+open回避） |
| ボタン・操作 | テンプル操作（クリック／ダブルクリック／前後スワイプ）を Studio でシミュレート可（[interaction](https://github.com/yodaos-project/AIUI/blob/main/documentation/6-design/interaction.en-US.md)） | グラス側 Android のキーイベント（OKキー・上下キー、HelloRokid-v2） |
| 通信 | HTTPS / WebSocket / EventSource / Bluetooth API、`createOpenAPI`（Rokidクラウド） | BLE 分割転送、Bluetooth SPP、Wi‑Fi P2P |
| バックグラウンド | Agent Worker（UIなしスクリプト）、Widget | スマホ側常駐サービス（通知中継など） |

#### 最小アプリ手順（AIUI、公式文書ベース。実機未検証）

1. `npm create @yodaos-pkg/aiui-agent@latest my-agent`（`app.js`/`app.json`/`AGENTS.md`/`pages/index/index.ink` を生成）
2. AIUI Studio(Global) <https://aiui-global.rokid.com/> に Rokid アカウントでログイン → ローカルフォルダ／GitHub から取込（またはAI CODINGで生成）
3. 「Device Simulation」→ Preview で音声入力・テンプル操作・環境光をシミュレート
4. Build & Review → Package AIX（クラウドへ同期）→ Hi Rokid アプリの「設定 → 開発者 → AIUI → グラスのリソース更新」→「Hi Rokid、xxx を開いて」で実機確認。ADB で入れる CLI 手順も別途あり
5. Build & Review で名称（20字以内）・アイコン・カテゴリ・説明（500字以内）・権限と用途・プレビュー素材3〜5点（画像1以上＋動画1以上、MP4 60秒以内）を入力 → 審査提出

#### 主張一覧

| ID | 主張 | 対象機種 | 出典URL | 出典種別 | 日付 | 確度 | 実機検証 |
|---|---|---|---|---|---|---|---|
| R-002-01 | AIUI公式ツール群は Apache-2.0。スターター・サンプル・`aiui-dev` スキル・cloud-integration パッケージ・79課題のベンチマークを含む | 表示付きAIグラス | https://github.com/yodaos-project/AIUI | 公式GitHub | 最終コミット 2026-10-28 | A | なし |
| R-002-02 | AIUI Studio(Global) はブラウザで動作し、作成→シミュレーション→AIXパッケージ→実機確認→審査提出の流れを持つ | Rokid Glasses | https://github.com/yodaos-project/AIUI/blob/main/documentation/0-guide/quickstart/quickstart.en-US.md | 公式文書 | 2026-09-08 | A | なし |
| R-002-03 | 実機確認は Hi Rokid アプリの開発者設定から「グラスのリソース更新」で行う | Rokid Glasses | https://github.com/yodaos-project/AIUI/blob/main/documentation/0-guide/debug/real_device_debug.en-US.md | 公式文書 | 確認日 2026-10-28 | A | なし |
| R-002-04 | 審査では権限の最小必要性と申告・コード一致を確認。名称に「Test/beta/Official/Premium」等や価格訴求は禁止。プレビュー素材は3〜5点 | Agent Store | https://github.com/yodaos-project/AIUI/blob/main/documentation/0-guide/bundle/publish.en-US.md | 公式文書 | 2026-09-07 | A | — |
| R-002-05 | 審査規定は「他所への誘導」「過度なマーケティング」を禁じる（外部決済誘導が該当するかは明記なし） | Agent Store | 同上 §3.4 | 公式文書 | 2026-09-07 | A（解釈はC） | — |
| R-002-06 | AIUI のカメラ・マイクは Web 標準形の `getUserMedia`/`ImageCapture`/`MediaRecorder` で提供。`CAMERA`/`RECORD_AUDIO` の宣言が必要 | 表示付きAIグラス | https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/media/media-capture.en-US.md | 公式文書 | 2026-10-23 | A | なし |
| R-002-07 | 公開手順書は Agent Store を「中国大陸ユーザー向け」と記載（英・中両版） | Agent Store | 同 publish.en-US.md / publish.md | 公式文書 | 2026-09-07 | A | — |
| R-002-08 | AIUI Studio は 2026-09-09 IFA で世界展開、Agent Store は米国でも Hi Rokid アプリ経由で提供と報道 | — | https://www.androidheadlines.com/2026/09/rokid-opens-ai-glasses-development-aiui-studio.html 、https://www.urbantechnoobs.com/2026/08/rokid-agent-store-launched-in-the-u-s.html | ニュース | 2026-08〜09 | C | — |
| R-002-09 | Agent Store は「育成段階」で当面マネタイズ計画なしと Rokid 幹部が発言 | — | https://www.benzinga.com/markets/tech/26/04/51649979/ | ニュース（本文は未読、検索要約のみ） | 2026-04 | C | — |
| R-002-10 | 公式AIUI文書に課金・決済・手数料・収益分配の記述はない（"payment" は決済コード読取りの用途例のみ） | — | https://github.com/yodaos-project/AIUI/tree/main/documentation | 公式文書の全文検索 | 確認日 2026-10-28 | A（不在の確認） | — |
| R-002-11 | CXR-M 1.2.2 の実機接続には、グラスのシリアル番号ごとに発行される SN ライセンス `.lc` と client secret が必要。BT制御＋Wi‑Fi P2P | CXR-M 1.2.2 対応機 | https://github.com/hkust-spark/xg-glass-sdk/blob/main/docs/rokid-real-glasses-e2e.md | 開発者一次資料 | 2026-09-09 | B | 開発者は「1.2.2 の実機検証は未了」と明記 |
| R-002-12 | CXR-L `client-l:1.0.1` は Rokid AI App の OAuth 経由で写真・音声ストリーム・CustomView を扱える。`customViewUpdate` は true を返すが再描画されない | Rokid AI Glasses（Global/中国版AIアプリ） | https://github.com/ARDings/RokidAIGlassesUnityBridge | 開発者一次資料 | 2026-06-03 | B | 開発者申告で実機検証あり |
| R-002-13 | CXR SDK はプロプライエタリで、各事例は再配布せず Maven から取得し「Rokid の条件に従う」と明記 | — | https://github.com/zero2005x/RokidAIAssistant （README・NOTICE）、UnityBridge README | 開発者一次資料 | 2026-10-26 | B | — |
| R-002-14 | CXR SDK のライセンス原文は公開サイトに見当たらず、BD窓口への問い合わせが必要とする報告あり（窓口アドレスは未検証） | — | https://extentos.com/docs/ecosystem/platforms/rokid | 二次資料（検索要約） | 2026 | C | — |
| R-002-15 | 日本では「Rokid スマートAIグラス」（海外名 Rokid Glasses）が 2026-07-10 一般発売、税込109,990円、販売はフューチャーモデル株式会社 | 日本向け Rokid Glasses | https://www.moguravr.com/?p=316032 、https://kyodonewsprwire.jp/release/202603135591 | ニュース・PR | 2026-06〜07 | C | — |
| R-002-16 | 日本向け端末の型番（RV101等）・技適番号・日本版ファームでの SDK 対応は公開資料で確認できず | 日本向け | — | — | 確認日 2026-10-28 | — | 未検証 |
| R-002-17 | CXR-L の公式掲載版 1.1.2（K-001）に対し、実利用で検証された版は 1.0.1。両版の API 差分は未確認 | Rokid Glasses | K-001、R-002-12 | 公式＋開発者 | 2026-06〜09 | A/B | — |

#### 事例比較表

| 事例 | 製作者の一次資料 | 対象機種 | 構成 | 公開状態 | 課金の証拠 | 最終更新 | 実機検証 |
|---|---|---|---|---|---|---|---|
| ClawLensXR | https://clawlensxr.com/ （**未検証：本環境から開けず**） | Rokid（機種未確認） | Android＋グラスHUD、利用者自身の OpenClaw Gateway | クローズドソース、販売中 | awesome-rokid 記載で €3.99/月 または €99 買い切り、3か月無料テスター（二次資料。販売ページ本文は未確認） | 未確認 | 未確認 |
| AccuNote | Google Play `ai.accunote.accunote`／App Store id6782253686（**未検証：開けず**） | Rokid グラス（マイク・写真） | Android/iOS アプリ＋グラス | ストア公開 | awesome-rokid 記載で「無料プラン＋有料サブスク」（二次資料） | 未確認 | 未確認 |
| SmartCam | https://github.com/ShaBP/smartcam-rokid-apk | Rokid AI Glasses（サイドロード） | グラス単体 APK。Pro はアクティベーションコード＋外部サイトで購入、起動時・約1分毎にライセンス確認 | APKのみ公開・ソース非公開 | **Paddle の sandbox で決済**、README が「テスト取引は商用購入ではない」と明記＝本番課金は未開始 | 2026-09-30 | 開発者が「現在デバイステスト中」と記載 |
| EUNG SOFT カタログ（23本） | https://github.com/eung3392/eungsoft 、https://eung.pe.kr/rokid/ | Rokid Glasses（APK配布） | グラス用APK群＋WebUSBインストーラ | 自社サイトで配布 | 価格表記なし。サイトに Google AdSense の `ads.txt` あり（広告収益の可能性。アプリ内課金の証拠はなし） | 2026-10-27 | 未確認 |
| RokidAIAssistant | https://github.com/zero2005x/RokidAIAssistant | Rokid AR グラス | スマホ＋グラス、CXR-M 1.2.2、複数AI/STT、端末内 Gemma（実験） | OSS（Apache-2.0） | なし（Ko-fi 寄付のみ） | 2026-10-26 | 未確認 |
| HelloRokid-v2 | https://github.com/saintlouisleetokyowest-bot/HelloRokid-v2 | Rokid グラス | グラス側 Camera2→BLE分割転送→スマホ→FastAPI+Gemini→HUD（名刺スキャン） | OSS | なし | 2026-06-14 | 未確認 |
| Rokid Unity Bridge | https://github.com/ARDings/RokidAIGlassesUnityBridge | Rokid AI Glasses | Unity（スマホ）＋CXR-L 1.0.1 | OSS（MIT） | なし | 2026-06-03 | 開発者申告あり |

#### 販売条件

**確認済み（公式GitHub文書）**
- Agent Store 公開は AIUI Studio からの審査提出制。審査項目・素材要件・禁止表現が公開されている（R-002-04）。
- 文書上の公開先は「中国大陸ユーザー」（R-002-07）。

**未確認**
- Agent Store での有料販売・アプリ内課金・手数料・収益分配・入金国・日本居住者への支払い（公式文書に記述なし、報道ではマネタイズ未実施＝C）。
- 外部決済・自社会員認証の可否（「他所への誘導」禁止規定との関係が不明）。
- CXR-L / CXR-M の商用利用・再配布許諾（ライセンス原文が未発見）。
- CXR-M の契約費用・条件。
- 日本アカウントで AIUI Studio(Global) にログイン・提出できるか、日本の Hi Rokid アプリに Agent Store が表示されるか。

**ストア外で実例のある課金方法（参考、非保証）**
- スマホ側アプリをGoogle Play / App Store で配信しサブスク（AccuNote、二次資料）
- 自社サイト会員制（ClawLensXR、二次資料）
- サイドロードAPK＋外部決済（Paddle）＋オンラインライセンス確認（SmartCam、sandbox段階）

#### この台帳の既存主張との一致・差分・矛盾

| 対象 | 判定 | 内容 |
|---|---|---|
| K-001 | 版差 | 公式掲載 1.1.2 に対し、実機検証済み事例は `client-l:1.0.1`、コミュニティ解析は `0.0.1`。旧版の挙動（`customViewUpdate` 不具合等）を 1.1.2 に転用しないこと |
| K-001 | 証拠不足 | iOS 対応は本調査では裏付けなし（Android事例のみ） |
| K-002 | 一致（独立の裏付け） | 開発者資料で SN ライセンス `.lc`＋client secret が必要と確認＝契約・認可制と整合 |
| K-003 | 一致＋**地域差の疑い** | 手順は公式GitHub原文で一致。ただし同じ公式文書群の公開手順が「中国大陸ユーザー向け」と記載し、Global報道と食い違う。文書の更新遅れ（時点差）か配信地域の制限（地域差）か未判定 |
| K-004 | 一致 | Apache-2.0、最終コミット 2026-10-28、AIUI 0.20.0 / Studio v1.3.0（2026-10-23） |
| K-005 | 一致（ただし独立性弱） | awesome-rokid も同じ App Store ID を掲載し「無料＋有料サブスク」と記述。App Store 本体は本環境で未検証 |
| K-006 | 一致（ただし独立性弱） | awesome-rokid に料金（€3.99/月・€99買い切り）記載。販売ページは本環境で未検証 |
| R-001 | 補足 | HelloRokid-v2 はグラス側 Camera2＋独自BLE で、**CXR SDK を使わない方式**（サイドロード前提）である点を追記 |

#### 次に確認すべき質問

1. 日本の Hi Rokid アプリ（日本版端末）に Agent Store は表示されるか、また日本ユーザーへ配信できるか（R-002-07 と報道の食い違い解消）。
2. AIUI Studio(Global) に日本の Rokid アカウントでログイン・審査提出できるか。
3. Agent Store の有料化計画・収益分配の公式アナウンスはあるか（開発者管理画面・規約の実画面で確認）。
4. 審査規定の「他所への誘導」に、外部サイトでの課金・自社ログインが含まれるか。
5. CXR-L 1.1.2 のライセンス原文（AAR・Maven POM・公式SDKページの同意画面）に商用利用・再配布の条項はあるか。
6. CXR-M の SN ライセンスは量産・一般ユーザー端末に対して発行できるか（個体ごとの認可では一般販売できない可能性）。
7. 日本向け「Rokid スマートAIグラス」の正確な型番・技適番号・ファーム版は何か、海外版 Rokid Glasses と SDK 互換か。
8. 日本向け端末で日本語の音声認識・音声合成・LLM（AIUI の `SpeechRecognition` / `LanguageModel`）は使えるか、利用料は誰が負担するか。
9. サイドロード（ADB）は日本版端末で許可されているか、保証・規約への影響は。
10. カメラ撮影時の周囲への通知（LED等）と、日本の個人情報保護法上の撮影データ扱い（クラウド送信先）をどう説明するか。

### レポート R-003｜（AI名・モデル・調査日を記入）

ここに別AIの原文を追記する。出典・主張・未確認事項を省略しない。

## 差分・類似情報の比較台帳

| 比較ID | 対象ID | AI別の主張 | 判定 | 理由 | 解消に必要な証拠 |
|---|---|---|---|---|---|
| C-001 | K-001 | （次の調査後に記入） | 未比較 | — | — |

## 変更履歴

| 日付 | 変更 | 根拠・担当 |
|---|---|---|
| 2026-10-28 | 初期調査と比較用の書式を作成 | Codex、上記の一次資料 |
| 2026-10-28 | R-002 を追記（既存記録は変更なし）。次の追記枠を R-003 に繰り下げ | Claude Code、公式GitHub `yodaos-project/AIUI` ほか R-002 記載の出典 |
