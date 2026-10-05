---
title: "hihaho Release Notes September 2026 / hihahoリリースノート 2026年9月（日英併記）"
source: "hihaho release notes, September 2026（英語原文）／ hihahoナレッジベース『hihahoリリースノート 2026年9月』（日本語版）"
languages: [en, ja]
created: 2026-10-05
---

# hihaho Release Notes — September 2026 / リリースノート 2026年9月

英語は hihaho 公式リリースノートの原文、日本語はナレッジベース掲載の日本語版です。
English is the original hihaho release notes; Japanese follows the version in the hihaho knowledge base.

> **補足 / Note**
> - 日本語版（ナレッジベース）に無かった次の3点は、英語原文をもとに日本語を補いました: ハイライト「Follow each viewer's journey」（※）、「その他」の最終項目（各種バグ修正）（※）、質問タイマー末尾の一文「ベータ版のため、ご意見をお寄せください。」。
> - The Japanese for three items missing from the knowledge-base version was added from the English original: the "Follow each viewer's journey" highlight (※), the last item under "Elsewhere" (※), and the closing sentence of the question timer section ("The timer is in beta…").

---

## TL;DR: what's new / 新着まとめ

| English | 日本語 |
|---|---|
| **Accessibility:** the player works much better with a keyboard and a screen reader, and images in your library can get a description that screen readers read out. | **アクセシビリティ:** プレイヤーのキーボード・スクリーンリーダー対応が大幅向上。ライブラリの画像に説明文（代替テキスト）を設定可能に |
| **Questions:** the question timer is now in beta for everyone. Image questions can have more than one correct answer, open questions can show an image, and learners see when an AI checks their answer. | **質問:** 質問タイマーが全ユーザーにベータ公開。画像問題で複数正解、自由記述に画像表示、AI採点される質問には事前にAIマークを表示 |
| **AI:** give a video a purpose and a learning objective, and the AI writes and judges questions to match. With AI text-to-speech in your plan, the player can now also read questions aloud. | **AI:** 動画に「目的」と「学習目標」を設定すると、AIがそれに合わせて問題作成・採点。AI音声読み上げプランでは質問の読み上げも |
| **Studio:** the new video flow shows how your videos link together. Links, text and images can show a tooltip on hover, every colour picker has an eyedropper, and you can replace the source of any video with an upload. | **Studio:** 動画同士のつながりを可視化するビデオフローを新搭載。ホバーでツールチップ表示、全カラーピッカーにスポイト、任意動画のソース差し替え |
| **Statistics:** the session results page has a new design that shows each viewer's journey, and the video statistics show which chapters viewers click. | **統計:** セッション結果ページを刷新し視聴者一人ひとりの行動を時系列表示。チャプターのクリック数も表示 |
| **Player:** JW Player videos play reliably on iPhone and iPad again, and the closing statistics of a session arrive more reliably. | **プレイヤー:** iPhone/iPadでのJW Player動画の再生が安定、セッション終了時の統計送信がより確実に |

---

## Highlights / ハイライト

### See how your videos connect / ビデオフロー — 動画のつながりを可視化

**EN** The video flow shows how the videos in a folder link to each other through their end-of-video actions. Select a video to highlight everything that connects to it, and spot videos a viewer can never reach. You can also remove a link: drag its arrow to an empty spot or right-click the line, and Undo brings it back. Open it with the Video flow button at the top of your folder and video settings.

**JA** フォルダ内の動画が「動画終了時アクション」でどう繋がっているかを図で確認できます。動画を選択すると関連するすべての接続がハイライトされ、**視聴者が到達できない動画**も発見できます。矢印を空きスペースへドラッグするか線を右クリックすればリンクを削除でき、Undoで復元可能。フォルダ・動画設定の上部にある「Video flow」ボタンから開けます。

### A player for everyone / すべての人のためのプレイヤー

**EN** The player now works much better with a keyboard. Once the player has focus, press K to play or pause, C for subtitles, J and L or the arrow keys to skip, and ? to see all shortcuts. Screen readers name each button and its state, and announce a change of subtitle language, question results and your final score. Add a description to images in your image library, and screen readers read it in interactions, questions and answers.

**JA** プレイヤーにフォーカスした状態で **K**=再生/一時停止、**C**=字幕、**J / L** や矢印キー=スキップ、**?**=ショートカット一覧。スクリーンリーダーが各ボタンと状態を読み上げ、字幕言語の変更・質問の結果・最終スコアもアナウンスします。画像ライブラリの画像に説明文を付ければ、インタラクション・質問・回答内でスクリーンリーダーが読み上げます。

### Follow each viewer's journey / 視聴者の行動をたどる ※

**EN** The session results page has a fresh design. Tiles show at a glance whether a viewer passed, their score and how far they got. A timeline shows what they watched, rewatched, skipped and clicked, with one row per stretch they watched. Step to the previous or next session without going back to the list.

**JA** セッション結果ページを刷新しました。タイルで、視聴者が合格したか・スコア・どこまで進んだかがひと目でわかります。タイムラインには、視聴・再視聴・スキップ・クリックした内容が、視聴した区間ごとに1行ずつ表示されます。一覧に戻らずに、前後のセッションへ移動できます。

### The question timer, now for everyone / 質問タイマーが全ユーザーに開放（ベータ）

**EN** Give a question a countdown in the Assessment tab of the question editor, or set a default for a video or a folder. Until now only hihaho staff could use it. Show the timer as a ring, or as a small pill in the corner or on the submit button, switch off the red pulse in the last seconds, and give viewers up to 30 minutes. The timer is in beta, so tell us what you think.

**JA** これまでhihahoスタッフ限定だった質問のカウントダウンタイマーが使えるようになりました。質問エディタのAssessmentタブで個別設定、または動画・フォルダ単位でデフォルト設定。リング表示／隅や送信ボタン上の小さなピル表示を選べ、残り数秒の赤い点滅のOFFも可能。最長30分まで設定できます。ベータ版のため、ご意見をお寄せください。

---

## Other improvements / その他の改善

### Questions and AI / 質問とAI

| English | 日本語 |
|---|---|
| An image question can have more than one correct answer, each with its own points. Switch it on per question. | 画像問題で**複数の正解**を設定可能に（正解ごとに配点、問題単位でON） |
| Open questions can show an image in the modern layout. | 自由記述問題に画像を表示可能（モダンレイアウト） |
| Give a video a purpose (formative, summative or other) and a learning objective, also as a folder default. AI uses it to write questions and to judge open answers. You can also set how strictly the AI judges each open question. | 動画に目的（形成的/総括的/その他）と学習目標を設定でき（フォルダ既定値も可）、AIが問題作成と自由記述の採点に反映。自由記述ごとにAI採点の厳しさも設定可能 |
| Learners now see a small AI mark on an open question that an AI checks, so they know before they answer. | AI採点される自由記述には回答前に小さな**AIマーク**を表示 |
| With AI text-to-speech in your plan, the player reads a question aloud when it appears. On multiple choice, multiple response and image questions it also reads each answer option when the viewer selects it or hovers over it. A video can now also hold several spoken sound interactions, as long as the text is the same for every viewer. | AI音声読み上げプランでは、質問表示時に読み上げ。選択式・複数回答・画像問題では選択肢のホバー/選択時にも読み上げ。テキストが全視聴者共通なら1動画に複数の音声インタラクションを配置可能に |
| Scoring is fairer. The score screen calls an answer partly correct or wrong based on the points earned, a fill-in-the-blank answer no longer fails on an invisible space, and an empty answer no longer scores full points on a multiple response or image question with no correct answer set. | 採点の公平性向上: スコア画面の部分正解/不正解判定が獲得ポイント基準に、穴埋めの不可視スペースで不正解にならない、正解未設定の複数回答・画像問題で空回答が満点にならない |

### Studio editor / Studioエディタ

| English | 日本語 |
|---|---|
| Links, text, images, scrolling text and highlights can show a short tooltip when a viewer hovers over them. | リンク・テキスト・画像・スクロールテキスト・ハイライトに**ホバーでツールチップ**表示を設定可能 |
| Every colour picker has an eyedropper, so you can pick any colour on your screen (Chrome and Edge). | すべてのカラーピッカーに**スポイト**（画面上の任意の色を取得。Chrome/Edge） |
| Replace the source of any video with a new upload, also YouTube, Vimeo and external videos, as long as your folder can host uploads. The video then moves to hihaho hosting. | **任意の動画のソースを新規アップロードで差し替え可能**（YouTube/Vimeo/外部動画も対象。差し替え後はhihahoホスティングへ移行。フォルダがアップロード可能な場合） |
| Export to JSON also works in a studio embedded in another platform, and a failed image or sound upload now tells you what went wrong so you can try again. | 埋め込みStudioでもJSONエクスポートが動作。画像・音声のアップロード失敗時に原因を表示 |
| Smaller fixes: video titles in the editor follow the same 100-character limit as the settings page, and the question preview no longer gets stuck after you submit an answer. | 細かな修正: エディタの動画タイトルも100文字制限に統一、回答送信後に質問プレビューが固まらない |

### Player / プレイヤー

| English | 日本語 |
|---|---|
| Two new autoplay options try to start a video with sound and fall back to muted autoplay when the browser blocks it. One of them also shows an unmute button. | 新しい自動再生オプション2種: 音声付き自動再生を試み、ブラウザがブロックしたらミュート自動再生にフォールバック（うち1つはミュート解除ボタン表示） |
| JW Player videos finish on iPhone and iPad again, stream in adaptive quality on iPhone again, and no longer freeze when a viewer restarts them. | JW Player動画がiPhone/iPadで最後まで再生され、アダプティブ画質配信が復活、再開時のフリーズも解消 |
| A question with a fade-in no longer leaves the video stuck on a loading screen. | フェードイン付き質問でローディング画面のまま止まらない |
| If a video platform's player cannot load, for example because of an ad blocker, viewers see a message to reload the page instead of an empty screen. | 動画プラットフォームのプレイヤーが読み込めない場合（広告ブロッカー等）、空画面ではなく再読み込みを促すメッセージを表示 |
| The closing statistics of a session arrive more reliably, also when the player sits in a restricted embed. | セッション終了時の統計送信がより確実に（制限付き埋め込み内でも） |
| The share buttons under the video have a new look, and Twitter is now X. | 動画下の共有ボタンを刷新（TwitterはXに） |

### Statistics / 統計

| English | 日本語 |
|---|---|
| The video statistics page shows how often viewers click each chapter in a chapter menu. | 動画統計にチャプターメニューの**チャプター別クリック数**を表示 |
| In the viewer portal, each session links to its detailed statistics. | 視聴者ポータルの各セッションから詳細統計へリンク |
| Uploading a long list of selected viewers is several times faster, and the folder settings page loads again for very large folders. | 許可された視聴者の大量リストのアップロードが数倍高速化。巨大フォルダの設定ページが開けるように |

### Automatic subtitles / 自動字幕

| English | 日本語 |
|---|---|
| AssemblyAI is now the default subtitle service. It is faster and accepts files up to 5 GB. | **AssemblyAIが既定の字幕サービスに**（高速・最大5GBのファイルに対応） |
| Add brand names and jargon to your folder's AI settings (on plans with AI text-to-speech), and AssemblyAI spells them correctly in new subtitles. | フォルダのAI設定にブランド名・専門用語を登録すると、新規字幕で正しい表記に（AI音声読み上げプラン） |
| Mistral is now in beta as subtitle service in a folder's AI settings (on plans with AI text-to-speech). | Mistralが字幕サービスのベータ選択肢に追加（AI音声読み上げプラン） |

### LMS and integrations / LMS・インテグレーション

| English | 日本語 |
|---|---|
| Every video now also has a JSON version: add `.json` to its player address. Like the `.md` version, it never shows the correct answers. | **全動画にJSON版**: プレイヤーURLの末尾に `.json` を付けるだけ。`.md` 版と同様、正解は含まれない |
| The API can read and change a video's seek and embed settings and its list of allowed websites. | APIから動画のシーク設定・埋め込み設定・許可サイトリストを読み書き可能に |
| A new public guide at `/docs/lti` tells LMS administrators how to connect hihaho over LTI 1.3. A whole class on one school network can now also open an LTI video at the same time. | **LTI 1.3の公開ガイド**が `/docs/lti` に登場。同一校内ネットワークからクラス全員が同時にLTI動画を開けるように |
| SCORM packages no longer show "Could not initialize communication with the LMS" at the start on strict learning management systems. | 厳格なLMSでSCORMパッケージ開始時の「Could not initialize communication with the LMS」エラーを解消 |

### Elsewhere / その他

| English | 日本語 |
|---|---|
| The Add video page opens much faster for accounts with many folders. | フォルダ数の多いアカウントで「動画を追加」ページの表示が大幅高速化 |
| When Mux refuses an upload, you now see the reason. A slow Mux thumbnail no longer breaks the whole video picker, and a Kinescope upload that Kinescope suspends shows as failed instead of processing forever. | Muxがアップロードを拒否した際に理由を表示。Muxサムネイル遅延で動画ピッカーが壊れない。Kinescope側で停止されたアップロードは「処理中のまま」ではなく失敗表示に |
| The theme editor still lets you save faint colours, but now marks each one and lists them after saving. | テーマエディタで薄い色は保存可能のまま、保存後に該当色を一覧表示 |
| Password managers can fill in and create passwords on the login and account screens. | ログイン・アカウント画面でパスワードマネージャーによる入力・生成が可能に |
| An emoji in a name or video title no longer cuts off the text after it. | 名前や動画タイトルの絵文字で後続テキストが切れない |
| We tightened security around embedding and chapter titles. | 埋め込みとチャプタータイトル周りのセキュリティを強化 |
| Various bug fixes and small improvements. | 各種バグ修正と細かな改善 ※ |
