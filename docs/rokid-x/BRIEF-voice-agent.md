# 指示書：Rokid Glassesで「呼びかけ → AIに指示 → 返答を表示/読み上げ」を作る
作成：2026-11-04（出渕） / 対象：Claude Opus（設計・レビュー）、OpenAI Codex（実装）
元ネタ：GOROman氏 RayNeo iO 独自アプリ（https://x.com/i/status/2117651444413370842 ：「“hey RayNeo!” で Museに指示できる」）

凡例：**【確認】**＝SDK実物（RGCxrClient 1.1.1 の swiftinterface）か公式ドキュメント（yodaos-project/AIUI）で裏取り済み。**【未確認】**＝実機で試していない。**【推測】**＝出渕の推論。**APIを発明しないこと。** ここに無いAPIを使う場合は、出典（swiftinterface行 or 公式docパス）を必ず添える。

---
## 0. ゴールと体験
1. ロビーがRokid Glassesをかけて「Hi Rokid（乐奇）」と呼ぶ（またはテンプルのAIボタン）。
2. 自作エージェントが話を聞き取り、テキスト化（ASR）。
3. テキストを **Mac上の中継サーバー**（LAN内）に送り、Mac側でAI（Claude / Codex / 他）に渡す。
4. 返答をグラスに表示（緑単色、19字×7行≒130字目安）し、必要なら読み上げ（TTS）。
- 独自の呼びかけ語（"hey RayNeo!"相当）は **作れない前提**。【確認】AIUIの`onVoiceWakeup`の`event.keyword`は `'乐奇'` / `'Hi Rokid'` / `'clickAiAssist'`（タッチ）。カスタム語の登録APIは文書に無い。
- GOROman氏の実装詳細（RayNeo側SDK）は公開情報が見つからなかった。体験だけを再現する。

## 1. 既知の前提
- 端末：Rokid Glasses（RV101、YodaOS-Sprite=Android12ベース）。表示480×640 / density240 / 16spで日本語19字×15行（maruhana氏実測）。
- 手元：iPhone 16 Pro（Hi Rokidアプリ）、MacBook（macOS 26.5.2、Xcode、brew、xcodegen、CocoaPods未導入）。
- Androidスマホ・5ピンADBケーブルは **無い**（ケーブル約¥1,855は購入判断が要るので使わない前提）。
- CXR-M（Android専用、B2Bライセンス＋実名認証）は対象外。
- Rokidアカウント未登録（ロビー作業待ち）。

## 2. アーキテクチャ（2ルート）

### ルートA（第1推奨）：AIUIエージェント → Mac中継 → AI
```
[Glasses: AIUI agent (JS/Ink)]
  onVoiceWakeup / ボタン → SpeechRecognitionSession(ASR) → text
  → fetch(POST) ──(Bluetooth)──> [iPhone Hi Rokid が中継] ──(LAN/Internet)──> [Mac relay :8787]
                                                                              → claude / codex CLI 等
  <── {reply} ── 表示(Ink page) + speechSynthesis.speak()
```
- 【確認】AIUIは`fetch`/SSE/WebSocket可。HTTPSはグラス→Bluetooth→スマホアプリ経由で出る（documentation/3-api/network.en-US.md）。
- 【確認】ASR：`SpeechRecognitionSession` + `getUserMedia`、`app.json`に`"permissions":["RECORD_AUDIO"]`（3-api/ai/speech-recognition.en-US.md, 3-api/permissions.en-US.md）。完成例：samples/realtime-voice-intelligence（VAD→ASR→LLM→UI）。
- 【確認】TTS：`speechSynthesis.speak(new SpeechSynthesisUtterance(text),'enqueue')`（3-api/ai/speech-synthesis.en-US.md）。
- 【確認】端末内LLM：`LanguageModel`（ホスト側LLM、APIキー不要）もある → 中継が届かない場合の暫定フォールバック。
- 【確認】配布：AIUI Studioで「Package AIX」→ Hi Rokid「Settings → Developer → Update glasses resource package」→「Hi Rokid, open the xxx agent」（0-guide/quickstart）。
- 【未確認・最大リスク】①AIUI Studioのアカウント/実名KYC要否 ②iOS版Hi Rokidに同じDeveloperメニューがあるか ③**`http://192.168.x.x` のLAN宛てに届くか**（iOSのHi Rokidがローカルネットワーク許可を持つか、平文HTTPが許されるか）。届かない場合はHTTPS公開URL（トンネル等）が必要＝外部公開・費用の判断になり **ロビー承認が必要**。④日本語ASR（`lang:'ja-JP'`）が使えるか。⑤日本語表示。

### ルートB（第2）：iOS CXR-Lアプリ（RokidX拡張）でグラスのマイクを使う
```
[Glasses] --Hi Rokid/BLE--> [iPhone: RokidX (RGCxrClient)]
   audioEventPublisher(.stream PCM/Opus) → iPhone側ASR(Apple Speech)→ Mac relay → AI → customView.update(text)
```
- 【確認】swiftinterfaceに存在：
  - 認証スコープ `RGCxrClientAuthPermission.microphone / .camera / .media / .deviceManage`
  - `startRecord(_ type: String, codec: RGCxrAudioCodec(.pcm/.oggOpus/.mp3), mode: RGCxrAudioMode(.xf/.antClose/.rokidOmni/.antOmni/.xfOrientation/.barrierFree))`、`stopRecord(_:)`
  - `audioEventPublisher: AnyPublisher<RGCxrClientAudioEvent>`（`.started(codec,type,channels)` / `.stream(data,timestamp)`）
  - `aiWakeInterruptEventPublisher`、`interruptAiWake(_:callback:)`、`changeAudioSceneId(.interaction ...)`
  - 通知cmd列挙に `ASR_Result` `Ai_Waked` `NotifyUserAsr` 等、`setNotifyEventListenCmds(_:)` + `notifyEventPublisher`
  - 再生 `startPlayAudio(codec:)` / `feedAudio(_:)` / `stopPlayAudio()`
- 【未確認】`startRecord`の`type`文字列に何を渡すか（文書未入手）、どのinitMode/セッションで使えるか、`interruptAiWake(true)`で「Hi Rokid」の起動を自アプリが横取りできるか、`ASR_Result`のpayload形式。**最大リスク：Hi Rokidが未登録アプリの認証を拒否する可能性**。
- 【推測】`interruptAiWake(true)`＋`aiWakeInterruptEventPublisher`が「呼びかけ横取り」に最も近い。要実機検証。
- 弱点：Xcode実機ビルド必須、無料Personal Teamは7日で失効。

**推奨順**：A（ケーブル・Xcode・CXR-L認証が不要）→ AのLAN到達が駄目ならBで検証。

## 3. ロビーがやること（前提作業）
1. Rokidアカウント登録：https://account-web.rokid.com/register?lang=en（国Japan、SMSコード）。
2. AIUI Studio（https://aiui-global.rokid.com/）にログインできるか確認。実名/身分証を求められたら **止めて出渕に連絡**（判断はロビー）。
3. iPhoneのHi Rokid → Settings → Developer があるか確認（スクショ）。
4. ルートBをやる場合：Xcodeに無料Apple IDでサインイン（Personal Team）、iPhoneのデベロッパモードON。
5. Mac側AIのCLI（`claude` または `codex`）がログイン済みであること。APIキーをコードに書かない。
6. Studioの「submit for review」（公開審査）は押さない＝外部公開扱い。

## 4. マイルストーン（各 約1時間）
| # | 内容 | 完了条件 |
|---|---|---|
| M0 | Mac中継サーバー（エコー版） | `curl -XPOST http://<MacIP>:8787/ask -d '{"text":"テスト"}'` → `{"reply":"テスト"}` |
| M1 | 中継にAI接続（`claude -p` / `codex exec` をsubprocessで呼ぶ） | 日本語質問に130字以内で返答、タイムアウト30s |
| M2 | AIUI最小エージェント：ボタンでfetch→画面表示 | Studioシミュレータで返答表示 |
| M3 | 実機導入（Package AIX→Hi Rokid） | グラスに表示。**ここでLAN到達可否が判明** |
| M4 | 音声：onVoiceWakeup/ボタン→ASR(ja-JP)→fetch | 話した内容が中継ログに届く |
| M5 | 返答の表示整形（19字折返し、ページ送り）＋TTS | 体験0.の1〜4が通る |
| M6 | 堅牢化：タイムアウト表示、オフライン時は端末LanguageModelで代替、ログ | 中継停止時もエラーが出て固まらない |
| B1 | （ルートB）RokidXに`.microphone`スコープ追加、`startRecord`→audioEvent受信をログ | PCMバイト数がログに出る |
| B2 | Apple Speech(ja-JP)で文字化→中継→customView.update | 表示まで通る |

## 5. API断片（出典つき）

### 5.1 AIUI（出典：github.com/yodaos-project/AIUI documentation/）
```js
// app.js — 呼びかけ受信（1-framework/open-agent-format/page-events, 3-api/framework/app）
App({
  onVoiceWakeup(event) { /* event.keyword: '乐奇' | 'Hi Rokid' | 'clickAiAssist' */ }
});
```
```json
// app.json（samples/realtime-voice-intelligence/app.json を参考）
{ "agentName": "LOBBY Voice", "pages": ["pages/index/index"], "permissions": ["RECORD_AUDIO"] }
```
```js
// ASR（3-api/ai/speech-recognition.en-US.md の抜粋。lang:'ja-JP'可否は【未確認】）
const caps = await SpeechRecognitionSession.getCapabilities();
const session = new SpeechRecognitionSession({ lang: 'ja-JP', interimResults: caps.interimResults, audio: { mimeType } });
session.onresult = (e) => { const r = e.results[e.resultIndex][0]; /* r.transcript */ };
const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
// 実機ASRは audio/pcm のみ受理（samples/realtime-voice-intelligence/README の記述）→ lib/asr.js を流用推奨
```
```js
// 中継へ（3-api/network.en-US.md）。URLは設定値、秘密は入れない
const res = await fetch(RELAY_URL + '/ask', { method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({ text, token: PAIRING_TOKEN }) });
const { reply } = await res.json();
speechSynthesis.speak(new SpeechSynthesisUtterance(reply), 'enqueue'); // 3-api/ai/speech-synthesis
```
- 雛形：`npm create @yodaos-pkg/aiui-agent@latest lobby-voice`（バージョンは作成後に固定）。AI向けスキル：`skills/aiui-dev/SKILL.md`。

### 5.2 CXR-L iOS（出典：RGCxrClient 1.1.1 swiftinterface、/workspace/rokid-x/sdk/）
```swift
CxrClient.initialize(mode: .customView, options: .init(appDisplayName: "LOBBY Voice"))
let link = CxrClient.makeLink(appDisplayName: "LOBBY Voice")
link.authenticate(scopes: [.deviceManage, .microphone])          // Hi Rokid（rokidai://）→ cxrl://auth/callback
// .onOpenURL { CxrClient.shared.handleOpenURL($0) }
let c = CxrClient.shared
c.audioEventPublisher.sink { ev in
  switch ev { case .started(let s): print(s.codec, s.type, s.channels)
              case .stream(let d): /* d.data → ASR */ break }
}
c.startRecord("<type 未確認>", codec: .pcm, mode: .rokidOmni)   // type文字列・modeの意味は未確認
c.interruptAiWake(true) { ok in }                              // 呼びかけ横取り【推測】
session.customView.update("[{\"action\":\"update\",\"id\":\"post\",\"props\":{\"text\":\"…\"}}]")
```
既存実装：RokidX/Sources/GlassesLink.swift（CustomView JSON、`.opened`後にupdate）。

### 5.3 Mac中継（新規、Codexが実装）
- Python標準ライブラリ or FastAPI（版固定）。`POST /ask {text, token}` → AI CLI呼び出し → `{reply}`。
- システムプロンプト：「日本語、130字以内、箇条書き最大3行、19字で改行しやすく」。

## 6. セキュリティ
- コード・リポジトリに秘密（APIキー、トークン、パスワード）を置かない。AIは**Mac上でログイン済みCLI**を呼ぶ。中継のペアリングトークンは`.env`（git管理外）。
- 中継は **LAN内のみ**：`0.0.0.0`ではなくMacのLAN IPにbind、送信元を`192.168.0.0/16`等に制限、トークン必須。トンネル/公開URLは **ロビー承認なしに作らない**。
- AIに渡すのはテキストのみ。AI側に任意コマンド実行（ツール権限）を与えない（`claude -p`は許可ツールなし、`codex exec`はread-only sandbox）。音声で「削除して」等が来ても実行しない。
- 依存は版固定：`pod 'RGCxrClient', '1.1.1'`（RGCoreKit 0.0.2）、npmは`package-lock.json`をコミット、`@latest`禁止（作成時だけ使い、すぐ固定）。
- 外部送信・公開・課金・Studio審査提出はロビー承認事項。

## 7. 受け入れテスト
1. 中継：トークン無し→401、LAN外IP→拒否、30s超→「タイムアウト」返却。
2. 「Hi Rokid、LOBBY Voiceを開いて」→ エージェントが起動する。
3. 起動中に話す「明日の天気を一言で」→ 5秒以内に「考え中…」表示、20秒以内に返答表示。
4. 返答が19字で折返し、130字超はページ送り（テンプル操作）で読める。
5. TTSで日本語読み上げ。
6. Mac中継を止める→グラスに「Macにつながりません」。固まらない。
7. コードgrepで秘密文字列ゼロ、依存に`latest`ゼロ。

## 8. 未解決の質問（優先順）
1. AIUI Studio利用に実名KYCが要るか。
2. iOS版Hi Rokidに Developer → Update glasses resource package があるか。
3. AIUIの`fetch`がLAN内平文HTTP（`http://192.168.x.x`）に届くか。駄目ならHTTPS必須か。
4. 日本語ASR/TTS/フォントの対応。
5. 自作エージェントを「Hi Rokid」直後に常駐で受け取れるか（毎回「open the xxx agent」が要るか）。
6. CXR-L：未登録アプリの認証可否、`startRecord`の`type`、`interruptAiWake`の挙動、`ASR_Result`のpayload。
7. カスタム呼びかけ語は不可の見込み（確認できれば確定）。

---
## Opus向け（設計・レビュー担当）
- この指示書の【未確認】を潰す順序の検証計画を作る（M3で分岐：LAN可→A継続 / 不可→B or 承認待ちでHTTPS）。
- 中継のAPI仕様（リクエスト/レスポンス/エラーコード/タイムアウト）とプロンプト（130字・19字折返し）を確定させる。
- Codexのコードをレビュー：APIが本書の出典に存在するか（**存在しないAPIは差し戻し**）、秘密の混入、LAN制限、版固定、AIへのツール権限ゼロ。
- 体験設計：「考え中」表示、ページ送り、緑単色でのちらつき防止（同内容は再描画しない）。
- 判断がロビー承認事項（公開・課金・外部送信・実名登録）に触れたら作業を止めて報告。

## Codex向け（実装タスク）
作業場所：`~/mechanic/rokid-x/`（Mac）。資料：`aiui-docs/`（AIUI公式リポジトリ一式、`skills/aiui-dev/SKILL.md`を最初に読む）、`sdk/`（swiftinterface）、`RokidX/`。
1. **T1 relay/**：`relay/server.py`（標準ライブラリ`http.server`で可）。`POST /ask`、トークン検証、送信元IP制限、`subprocess.run(["claude","-p",prompt], timeout=30)`（CLIは設定で切替、`codex exec`も可）。`relay/.env.example`のみコミット。テスト`relay/test_server.py`（受け入れ1）。
2. **T2 agent/**：`npm create @yodaos-pkg/aiui-agent@latest agent` → 版固定。`pages/index`に状態（待機/聞き取り中/考え中/返答/エラー）。`samples/realtime-voice-intelligence/lib/asr.js`を流用してASR、`fetch`で中継、返答を19字折返し＋ページ送り、`speechSynthesis.speak`。中継URL・トークンは`wx.setStorageSync`の設定画面から入力（ハードコード禁止）。
3. **T3 fallback**：中継失敗時は`LanguageModel`で短く答え「(端末AI)」と明示。
4. **T4（ルートB、Aが詰まった時のみ）**：`RokidX`に`.microphone`スコープ、`audioEventPublisher`のログ、`startRecord`の`type`は試行値をログ付きで切替可能に。Apple `Speech`(ja-JP)で文字化→中継→`customView.update`。
5. 禁止：アカウント作成、Studio審査提出、トンネル/公開URL作成、課金、`@latest`の残置、秘密のコミット。swiftinterface/公式docに無いAPIの使用（使うなら出典コメント必須、無ければ`// UNVERIFIED`）。
