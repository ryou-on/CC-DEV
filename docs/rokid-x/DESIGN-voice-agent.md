# 設計書：LOBBY Voice（Rokid Glasses 音声エージェント）— Opus 担当分
作成：2026-11-05 / 対象ブリーフ：`BRIEF-voice-agent.md`（2026-11-04 出渕）
根拠：`github.com/yodaos-project/AIUI` commit `00c6ec7`（2026-11-03）の `documentation/` を全文検索して照合。

凡例はブリーフと同じ。**【確認】**＝公式doc（パス併記）で裏取り済み / **【未確認】**＝実機未検証 / **【推測】**＝推論。

---

## 0. 結論（先に読む）

公式ドキュメントで、ブリーフの前提が **3点変わる**。

| # | ブリーフの前提 | 公式docの記述 | 影響 |
|---|---|---|---|
| 1 | `fetch` で `http://192.168.x.x` に届くか未確認 | **LAN直接通信は `unsupported`**。本番は **HTTPS必須**（`0-guide/basic/network/lan.en-US.md`、`.../network/usage.en-US.md` §3-4） | ルートAは **HTTPS公開URL（トンネル）が実質必須** → **ロビー承認事項**。M3で平文LANを試す価値は残るが、期待値は低い |
| 2 | TTSは `speechSynthesis.speak()` で日本語可か未確認 | **`utterance.lang` は非対応**。声は中国語・英語のみ（`3-api/ai/speech-synthesis.en-US.md` L102, L150-185） | **日本語TTSは端末では不可**。Mac側で音声生成 → `AudioPlayer` で再生する方式に変更（§4.3） |
| 3 | 実機導入は Package AIX → Hi Rokid | `aix install`（CLI）は **ADB必須**（`0-guide/debug/cli_device_debug.en-US.md`）。ケーブル無しなら **Studio経由一択** | M3のイテレーションが遅い（Studioでパッケージ→アプリで更新）。M2でシミュレータ完結を徹底する |

その他の確認結果：

- **【確認】呼びかけ横取り**：`onVoiceWakeup` はページイベントで、`event.preventDefault()` でホスト既定動作を止められる（`1-framework/open-agent-format/page-events.en-US.md` §onVoiceWakeup）。→ **自エージェントのページが前面にある間は「Hi Rokid」を横取りできる**。初回は「Hi Rokid, open the xxx agent」が必要（未解決Q5の半分が解決）。
- **【確認】ページ送り**：`onKeyDown/onKeyUp` の `event.code` は `ArrowUp` / `ArrowDown` / `Enter` / `Backspace`（同 page-events §Key codes）。テンプル操作がどれに割り当たるかは【未確認】。
- **【確認】fetch に `timeout`（ms）と `AbortController` あり**（`3-api/network/https.en-US.md` L236-254）。
- **【確認】ASR の `lang`** は任意文字列、空なら端末既定（`3-api/ai/speech-recognition.en-US.md` §recognition.lang）。**対応言語リストは文書に無い**。公式サンプルは `zh-CN` 固定（`samples/realtime-voice-intelligence/lib/asr.js` L20）。**ja-JP は【未確認】のまま**。
- **【確認】端末ASRは `audio/pcm` のみ**、16kHz/mono/s16（同 asr.js L22, L99-100、README L18）。
- **【確認】AudioPlayer** はストリーム再生 `format: 'pcm' | 'ogg_opus'`、`append()`/`finish()`（`3-api/media/audio-player.en-US.md` §Streaming）。PCMのサンプルレート指定方法は文書に無い【未確認】。
- **【確認】`wx.setStorageSync` あり**（`0-guide/basic/storage.en-US.md`）。ただし **グラスに文字入力手段がほぼ無い**ため、設定画面でURL/トークンを手入力する案は非現実的（§4.4で代替）。
- **【確認】実名KYC**：Studio利用時のKYCの記述は **無い**。アカウント情報連携は中国プラットフォーム限定（`0-guide/account/*.en-US.md`）。→ Q1は文書では判定不能、ロビーの実地確認待ち。
- **【確認】Developerメニュー名が文書間で不一致**：quickstart は「Hi Rokid → Settings → Developer → Update glasses resource package」、real_device_debug は「Rokid AI App → Settings → Developer Options → AIUI」。iOS版の実在は【未確認】。
- **【確認】Agent Store公開は中国大陸ユーザー向け**（`0-guide/bundle/publish.en-US.md` L3）。→ 審査提出は不要かつ無意味。

---

## 1. 検証計画（【未確認】を潰す順序）

コストの低い順・後工程を左右する順に並べる。各ステップは「判定 → 分岐」。

```
V0 ロビー: アカウント登録 & Studioログイン ──KYC要求──> 停止・ロビー判断
   │OK
V1 ロビー: iPhoneアプリに Developer メニューがあるか（スクショ）──無い──> ルートA不可 → ルートB検討
   │有る
V2 Opus/Codex: 公式サンプル(realtime-voice-intelligence)を無改造でStudio→実機導入
   │  → 導入経路の確認だけ（ネットワーク非依存）
V3 実機: 診断ページ(§1.1)で 4項目を一括測定
   ├─ ASR ja-JP 可?  ─否─> ASRをMac側へ（§4.2 /ask-audio）
   ├─ 日本語表示可?   ─否─> 致命。かな/英数のみ表示に縮退し出渕へ報告
   ├─ http LAN 到達?  ─可─> トンネル不要（LAN限定で継続）
   │                  ─否─> ロビー承認待ち：HTTPSトンネル（§5）
   └─ AudioPlayer pcm 再生可? ─否─> TTSなし（表示のみ）で継続
V4 承認後: HTTPSトンネルで M3〜M6
```

### 1.1 診断ページ（M2.5として追加・Codex実装）
1回の実機導入で未確認項目をまとめて測る専用ページ `pages/diag/index`。グラス画面に結果を出し、同じ内容を中継の `/log` にも送る（届けば）。

| 項目 | 方法 | 表示 |
|---|---|---|
| ASR能力 | `SpeechRecognitionSession.getCapabilities()` を JSON で表示 | 先頭200字 |
| ASR ja-JP | `lang:'ja-JP'` でセッション生成→「テスト」と話す→transcript | 認識文字列 or エラー名 |
| 日本語表示 | 固定文「日本語表示テスト：漢字かなカナ１２３」 | 目視 |
| LAN到達 | `fetch('http://<MacIP>:8787/health',{timeout:5000})` | status or エラー名 |
| HTTPS到達 | `fetch('https://example.com',{timeout:5000})` | status（外部到達の対照） |
| PCM再生 | 中継の `/tts-test.pcm`（16k/mono/s16、1秒のビープ）を `AudioPlayer({format:'pcm'})` で再生 | 聞こえたか目視 |
| LLM | `LanguageModel.availability()` | available/unavailable |
| キー | `onKeyDown` の `event.code` を直近5件表示 | テンプル操作の割当確認 |
| 呼びかけ | `onVoiceWakeup` で `event.keyword` を表示（`preventDefault()` 付き） | keyword |

※ LANのMacIPはビルド時に埋める（§4.4）。

---

## 2. 中継 API 仕様（確定版）

### 2.1 共通
- ベース：`{RELAY_URL}`（LAN時 `http://<MacLAN IP>:8787`、トンネル時 `https://<承認済みホスト>`）
- 認証：ヘッダ `Authorization: Bearer <PAIRING_TOKEN>`（ブリーフの body 内 `token` から変更。ログに body を出してもトークンが漏れないため）。比較は `hmac.compare_digest`。
- Content-Type：`application/json; charset=utf-8`
- 全レスポンスに `request_id`（uuid4 先頭8桁）を付け、中継ログと突き合わせる。

### 2.2 `POST /ask`
リクエスト
```json
{ "text": "明日の天気を一言で", "session": "a1b2c3", "client": "aiui/0.1.0" }
```
| フィールド | 型 | 必須 | 制約 |
|---|---|---|---|
| text | string | ○ | 1〜500字。前後空白除去後に空なら 400 |
| session | string | − | 会話継続用ID（M1では無視、将来用） |
| client | string | − | 版情報（ログ用） |

レスポンス 200
```json
{
  "request_id": "9f3c1a2e",
  "reply": "明日の東京は晴れ。\n最高気温は18℃の見込み。",
  "pages": ["明日の東京は晴れ。\n最高気温は18℃の見込み。"],
  "source": "claude",
  "elapsed_ms": 8421
}
```
- `reply`：AIの生出力を整形したもの（130字超は切り詰めない）
- `pages`：**中継側で整形済み**（19字折返し・7行/ページ）。グラス側は表示するだけ。整形ロジックを1か所（Python）に寄せ、テストしやすくする
- `source`：`claude` | `codex` | `echo`

### 2.3 エラー
形式は共通：`{ "request_id": "...", "error": { "code": "TIMEOUT", "message": "AIの応答が30秒を超えました" } }`

| HTTP | code | 条件 | グラス表示 |
|---|---|---|---|
| 400 | BAD_REQUEST | JSON不正 / text空・500字超 | 「聞き取れませんでした」 |
| 401 | UNAUTHORIZED | トークン無し・不一致 | 「設定エラー(401)」 |
| 403 | FORBIDDEN_SOURCE | 送信元IPが許可範囲外（LANモード時のみ） | 「設定エラー(403)」 |
| 413 | TOO_LARGE | body 8KB超 | 「長すぎます」 |
| 429 | BUSY | 同時実行1件を超過（AI CLIは直列） | 「前の質問を処理中」 |
| 502 | AI_FAILED | CLIが非0終了 / 出力空 | 「AIエラー」 |
| 504 | TIMEOUT | CLIが30秒超（プロセスkill） | 「時間切れ。もう一度」 |

### 2.4 その他エンドポイント
| メソッド | パス | 用途 | 認証 |
|---|---|---|---|
| GET | `/health` | `{"ok":true,"version":"0.1.0"}` | 不要（中身に秘密を含めない） |
| POST | `/log` | グラス診断ログ受信（1KB上限、ファイル追記） | 要 |
| POST | `/tts` | `{text}` → 日本語音声 PCM（§4.3） | 要 |
| POST | `/ask-audio` | PCM(16k/mono/s16) → Mac側ASR → `/ask`と同じ応答。**ja-JP ASR不可時のみ実装** | 要 |
| GET | `/tts-test.pcm` | 診断用1秒ビープ | 不要 |

### 2.5 タイムアウト設計（合計20秒以内に返す＝受け入れ3）
| 区間 | 値 |
|---|---|
| グラス `fetch` timeout | 35,000 ms（中継の30秒＋余裕） |
| 中継 → AI CLI | 30 s（`subprocess.run(timeout=30)`、超過で kill → 504） |
| 「考え中…」表示 | 送信直後（0秒）。5秒経過で「考え中…(5秒)」と経過秒を更新 |

### 2.6 動作モード（環境変数）
| 変数 | 例 | 説明 |
|---|---|---|
| `RELAY_MODE` | `lan` / `tunnel` | `lan`：MacのLAN IPにbind、送信元 `192.168.0.0/16`,`10.0.0.0/8`,`172.16.0.0/12` のみ許可。`tunnel`：**`127.0.0.1` にbind**（トンネル常駐プロセスだけが接続できる）、IP制限は無効（送信元が常にlocalhostになるため）、トークン必須は維持 |
| `RELAY_BIND` | `192.168.1.20` | `lan` 時のbind先。`0.0.0.0` は起動時エラー |
| `RELAY_PORT` | `8787` | |
| `PAIRING_TOKEN` | 32バイト以上の乱数 | 未設定・短すぎは起動拒否 |
| `AI_BACKEND` | `claude` / `codex` / `echo` | |
| `AI_TIMEOUT_SEC` | `30` | |

> ブリーフ §6「送信元を192.168.0.0/16に制限」はトンネル時に機能しない（全リクエストが127.0.0.1から来る）。上記のとおりモードで切り替える。

### 2.7 AI CLI 呼び出し（ツール権限ゼロ）
- `claude`：`["claude", "-p", "--output-format", "text", "--tools", "", prompt]` を想定。**フラグ名は Mac 上の `claude --help` で確認してから確定**（本書ではAPIを発明しない。確認できなければ `--allowedTools` 未指定＝`-p` 既定動作で、作業ディレクトリを空の一時ディレクトリにして実行）。
- `codex`：`["codex", "exec", "--sandbox", "read-only", prompt]` を想定。同様に `codex exec --help` で確認。
- 共通：`cwd` は `tempfile.mkdtemp()` の空ディレクトリ、`stdin=DEVNULL`、`env` は PATH と HOME のみ引き継ぐ。プロンプトは引数リストで渡しシェルを経由しない（`shell=False`）。

---

## 3. システムプロンプト（確定版）

```
あなたはスマートグラスの音声アシスタント。返答はグラスの小さな画面に表示され、読み上げられる。
厳守：
- 日本語。全体で130字以内。
- 1行は19字以内を目安に、意味の切れ目で改行する。最大7行。
- 結論を1行目に書く。前置き・挨拶・「〜ですね」の言い直しはしない。
- 箇条書きは最大3項目、記号は「・」のみ。Markdown記法（#,*,`,|,リンク）は使わない。
- 絵文字・顔文字・URLは出さない。
- 分からないこと・リアルタイム情報（天気・株価・ニュース等）は推測せず「確認できません」と1行で答える。
- ファイル操作・コマンド実行・送信などの依頼には「この端末からは実行できません」とだけ答える。
ユーザーの発話：
{text}
```

設計意図：
- 「リアルタイム情報は確認できません」：`claude -p` はツール無しなので天気は答えられない。受け入れテスト3「明日の天気を一言で」は **「確認できません」系の返答でも合格** とする（表示まで20秒以内が本旨）。天気を本当に答えさせるならツール付与＝ブリーフ§6違反になるため別途判断。
- 「Markdown禁止」：緑単色・等幅でない画面で記号が崩れるため。中継側でも `#*\`|` を除去する（二重防御）。

### 3.1 整形関数の仕様（中継 `format_pages(reply) -> list[str]`）
1. Markdown記号 `# * \` |` と行頭の `- ` を除去、`- ` は `・` に置換
2. 既存の改行で段落分割 → 各段落を **19字（全角/半角とも1字で数える）** で折返し
3. 行頭禁則：`、。」』）！？ー` が行頭に来たら前行末に繰り上げ（その行は20字を許容）
4. 7行ごとにページ分割。2ページ以上なら各ページ末尾に `(1/3)` 形式を追加（8行目扱いにせず7行目末尾に付けて行数を守る、入らなければ7行目を18字で切る）
5. テスト：空文字、19字ちょうど、20字、禁則、131字、改行のみ、英数混在

---

## 4. グラス側（AIUIエージェント）設計

### 4.1 状態遷移
```
        onVoiceWakeup / Enter
IDLE ─────────────────────────> LISTENING ──(VAD確定 or 8秒)──> THINKING ──200──> ANSWER
 ^                                  │ 無音8秒                     │ エラー          │ ArrowUp/Down: ページ送り
 │                                  v                             v                 │ Enter/onVoiceWakeup: 次の質問
 └──────────── Backspace / 30秒無操作 ──────────────────────── ERROR <───────────────┘
```
| 状態 | 表示（1行目＝状態ラベル、以降本文） | 音 |
|---|---|---|
| IDLE | 「Hi Rokid で話しかけて」 | − |
| LISTENING | 「聞いています…」＋暫定認識文（interim、更新は300ms間引き） | − |
| THINKING | 「考え中…(N秒)」＋確定した質問文1行 | − |
| ANSWER | `pages[i]` | TTS（§4.3、1ページ目のみ自動再生） |
| ERROR | §2.3の表示文 ＋「Enterで再試行」 | − |

### 4.2 ASR の分岐
- **ja-JP 可**：`samples/realtime-voice-intelligence/lib/asr.js` を流用（`SPEECH_LANGUAGE` を `'ja-JP'` に）。確定テキストを `/ask` へ。
- **ja-JP 不可**：同 asr.js の PCM 取得部（16k/mono/s16）だけ流用し、VAD確定までのPCMを `/ask-audio` に POST（最大15秒＝約480KB。8KB制限は `/ask` のみ）。Mac側ASRは `whisper.cpp`（brew）等をロビー承認後に導入【推測：精度・速度は要計測】。

### 4.3 日本語読み上げ（端末TTSが中国語/英語のみのため）
- 中継 `POST /tts {text}` → macOS 標準 `say -v Kyoko --data-format=LEI16@16000 -o out.wav` → WAVヘッダ（44byte）を除いた生PCMを返す（`application/octet-stream`）。追加インストール不要。
  - `say` のフラグは Mac 上の `say --help` / `man say` で確認してから確定。
- グラス：`new AudioPlayer({ format: 'pcm' })` → `append(chunk)` → `finish()`（`3-api/media/audio-player.en-US.md`）。
- 【未確認】AudioPlayer の PCM が 16kHz を前提にするか（文書にサンプルレート指定なし）。診断ページで 16k を鳴らし、ピッチがおかしければ 24k/48k で再試行。
- 不可の場合：TTSは諦めて表示のみ（体験0.の4は「必要なら読み上げ」なので必須ではない）。

### 4.4 設定値（URL・トークン）の渡し方
グラスでの手入力は非現実的なので **ビルド時注入** に変更する。
- `agent/config.local.js`（**`.gitignore` 対象**）に `export const RELAY_URL = '...'; export const PAIRING_TOKEN = '...';`
- `agent/config.example.js` のみコミット。`scripts/gen-config` が `relay/.env` から生成。
- Studioで作るパッケージは **ロビー専用・審査提出しない** ので、トークンが入ったAIXが外に出ることはない。ただし AIX ファイル自体は秘密扱い（共有しない）。
- ブリーフ T2 の「`wx.setStorageSync` の設定画面から入力」は、上書き用の補助として残してよい（任意）。

### 4.5 ちらつき防止
- `setData` は **前回と内容が同じならスキップ**（`JSON.stringify` 比較）。
- interim 認識文の更新は300ms間引き、THINKING の秒カウンタは1秒間隔。
- 画面は黒背景＋緑文字のみ、アニメーション無し。

### 4.6 オフライン代替（T3）
`LanguageModel.availability() === 'available'` のときのみ使用、返答先頭に「(端末AI)」。`unavailable` なら §2.3 の「Macにつながりません」表示で終わる。【未確認】海外版で available か。

---

## 5. ロビー承認が必要な判断（ここで作業停止）

| # | 判断 | 選択肢 | おすすめ |
|---|---|---|---|
| 1 | V3で LAN 不可だった場合のHTTPS化 | **A. Cloudflare Tunnel（`cloudflared`）**：無料、Cloudflareアカウント＋独自ドメインがあれば固定URL。Quick Tunnel（アカウント不要）は毎回URLが変わる / **B. Tailscale Funnel**：無料、Tailscaleアカウント要、`*.ts.net` 固定URL / **C. ngrok**：無料枠あり、アカウント要、固定URLは制限あり | **B** 👈 固定URLが無料で得られ、AIXの再ビルドが不要。いずれも **公開URLになる**ためトークン必須・429制限で守る |
| 2 | 日本語ASRが端末で不可の場合のMac側ASR導入 | whisper.cpp（brew、ローカル、無料） / Apple Speech（Swift製CLIを自作） | whisper.cpp |
| 3 | Studio の実名KYCが出た場合 | 続行 / 中止 | ロビー判断 |

---

## 6. Codex へのタスク修正（ブリーフ §Codex向け への差分）

| タスク | 変更 |
|---|---|
| T1 relay | §2 の仕様に従う。トークンは **Authorizationヘッダ**。`RELAY_MODE=lan|tunnel`。`format_pages()` を実装し単体テスト。`/health` `/log` `/tts` `/tts-test.pcm` を追加。AI CLI は直列実行（`threading.Lock`、取れなければ429） |
| T2 agent | §4 の状態遷移。設定は **ビルド時注入**（`config.local.js`、gitignore）。`pages/diag/index`（§1.1）を **最初に** 作る |
| T2.5 新規 | 診断ページ。Studio→実機で1回導入して V3 を判定 |
| T3 fallback | 変更なし（`availability()` 判定必須） |
| T4 ルートB | 変更なし。V1でDeveloperメニューが無い場合のみ着手 |
| 追加禁止事項 | 公開トンネルの起動（設定ファイル作成までは可、起動はロビー承認後） |

---

## 7. Codex コードのレビュー観点（チェックリスト）

**API実在性（差し戻し基準）**
- [ ] AIUI の API 呼び出しすべてに出典コメント（doc パス）があるか。無いものは `// UNVERIFIED` か
- [ ] `speechSynthesis` に `lang` を設定して日本語化しようとしていないか（文書上非対応）
- [ ] LAN 直接通信を前提にした独自API（mDNS、UDP等）を使っていないか
- [ ] Swift側：`startRecord` の `type` を固定値で決め打ちしていないか（試行値＋ログ）

**秘密**
- [ ] `git grep -nE "(sk-|token\s*[:=]\s*['\"][A-Za-z0-9]{16,}|PAIRING_TOKEN\s*=\s*['\"])"` がゼロ
- [ ] `relay/.env`, `agent/config.local.js`, `*.aix` が `.gitignore` に入っている
- [ ] ログに Authorization ヘッダ・トークンを出していない

**ネットワーク制限**
- [ ] `0.0.0.0` bind が無い（起動時エラーで拒否している）
- [ ] `tunnel` モードは `127.0.0.1` bind
- [ ] body サイズ上限、同時実行1件

**AI権限ゼロ**
- [ ] `shell=False`、引数リスト渡し、`cwd` は空の一時ディレクトリ、`stdin=DEVNULL`
- [ ] claude/codex のツール無効化フラグが `--help` で確認済みのものか
- [ ] 音声で「削除して」等を受けても、中継がAI出力を **実行** する経路が無い（出力は文字列として返すだけ）

**版固定**
- [ ] `package.json` に `latest` / `^` / `~` が無い、`package-lock.json` コミット済み
- [ ] `app.json.engine` が具体的な範囲
- [ ] Python は標準ライブラリのみ（FastAPI 等を使うなら `requirements.txt` で `==` 固定）
- [ ] `Podfile` は `pod 'RGCxrClient', '1.1.1'`

**体験**
- [ ] 同内容の `setData` をスキップしている
- [ ] fetch に `timeout` 指定、失敗時に ERROR 状態へ遷移し固まらない
- [ ] `onVoiceWakeup` で `event.preventDefault()` を呼んでいる

---

## 8. 受け入れテストの修正
ブリーフ §7 への差分。
- 1. 「LAN外IP→拒否」は `RELAY_MODE=lan` 時のみ。`tunnel` 時は「127.0.0.1以外のbindが無いこと」を確認。
- 3. 天気の質問は「確認できません」でも合格（§3 設計意図）。別途「日本の首都は？」で内容の正しさを見る。
- 5. 日本語読み上げは `/tts` 経由。端末TTSでの日本語は文書上不可のため対象外。
- 追加：診断ページの全9項目の結果を記録して出渕に共有。

---

## 9. 未解決の質問（更新版）

| # | 質問 | 状態 |
|---|---|---|
| 1 | Studio利用に実名KYCが要るか | 文書に記述なし → ロビー実地確認 |
| 2 | iOSアプリに Developer メニューがあるか | 文書間でメニュー名不一致 → ロビー実地確認 |
| 3 | LAN平文HTTPに届くか | **文書上は unsupported**。V3で最終確認 |
| 4 | 日本語 ASR / TTS / 表示 | TTS：**文書上不可**（Mac側で代替）。ASR・表示：V3で確認 |
| 5 | 「Hi Rokid」を常駐で受け取れるか | **前面時は `onVoiceWakeup`+`preventDefault` で可**（文書）。初回起動は「open the xxx agent」必須【推測】 |
| 6 | CXR-L 系 | 変化なし（ルートBに着手する場合のみ） |
| 7 | カスタム呼びかけ語 | 文書に登録APIなし → **不可でほぼ確定** |
| 8（新） | AudioPlayer PCM のサンプルレート | V3で確認 |
| 9（新） | 海外版で `LanguageModel` が available か | V3で確認 |
