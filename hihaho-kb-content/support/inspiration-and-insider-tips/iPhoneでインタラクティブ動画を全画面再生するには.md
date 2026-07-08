---
id: "5940845"
slug: how-do-i-make-my-interactive-video-play-full-screen-on-an-iphone
title: "iPhoneでインタラクティブ動画を全画面再生するには？"
title_en: "How do I make my interactive video play full screen on an iPhone?"
category: inspiration-and-insider-tips
category_ja: 活用アイデア・上級テクニック
audience: public
source: https://support.hihaho.com/en/articles/5940845-how-do-i-make-my-interactive-video-play-full-screen-on-an-iphone
summary: "iPhoneではネイティブ全画面がインタラクティブレイヤー非対応のため、直リンク配信・JS APIイベント・埋め込みURLボタンの3つの回避策を解説。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

## 概要

Apple は、ネイティブでない動画が Apple のネイティブ全画面サポートを使用することを許可していません。iPhone で動画を全画面再生すると Apple の QuickTime プレーヤーが再生を引き継ぎますが、このプレーヤーはインタラクティブレイヤーに対応していません。

## 利用可能な解決策

### 方法1: 直接リンクで共有する

インタラクティブ動画を（埋め込みではなく）プレーヤーへの直接リンクで配信する場合、hihaho はブラウザ内で幅・高さを100%にスケーリングして全画面をシミュレートする回避策を実装済みです。

### 方法2: 技術的な実装（JavaScript API）

自分のWebサイトに埋め込んだ動画では、カスタムコードによって同様の効果を実現できます。

**考え方:**
- デバイスの向きを横向きに強制する
- embed を全画面サイズで表示する

**実装手順:**
プレーヤーは `enter-fullscreen` と `exit-fullscreen` の JavaScript API イベントをブロードキャストします。これらのイベントをリッスンすることで、次のように実装できます。

1. 動画URLに `?api=true` を追加する
2. `hihaho_ready` イベントをリッスンして、プレーヤーの初期化を確認する
3. postMessage で `{'type': 'api_fullscreen_event'}` を送り返す
4. `hihaho_enter_fullscreen` および `hihaho_exit_fullscreen` イベントに反応して、独自の全画面スタイルを適用する

### 方法3: シンプルな回避策

埋め込んだ動画の下に、全画面表示用の embed URL へのリンクボタンを追加します:

```
https://player.hihaho.com/embed/[VIDEO_ID]
```

hihaho は、このアプローチをモバイルデバイスで実演する[ライブサンプル](https://www.hihaho.com/showcase/car-promotion/)を提供しています。

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[プレーヤーパラメータ]]
- [[embedコードをテストする]]
