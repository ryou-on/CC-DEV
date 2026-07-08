---
id: "10537810"
slug: interaction-json-specifications-guide
title: "インタラクションJSON仕様ガイド"
title_en: "Interaction JSON Specifications Guide"
category: inspiration-and-insider-tips
category_ja: 活用アイデア・上級テクニック
audience: public
source: https://support.hihaho.com/en/articles/10537810-interaction-json-specifications-guide
summary: "hihahoの全インタラクション・質問タイプのJSON仕様と属性・サンプルを網羅したリファレンス。一括作成や自動化に使用。"
tags: [hihaho, support-kb]
translated: 2026-07-08
---

## 概要

hihaho のインタラクティブ動画では、JSON 仕様を通じてさまざまなインタラクションタイプを利用できます。各インタラクションは JSON 配列内のオブジェクトとして表現されます。このドキュメントはインタラクティブ動画プロジェクトを管理するコンテンツ制作者向けです。JSON インポートファイルの最大サイズは 256kb です。

**ユースケース:**
- インタラクションの一括作成と自動化
- クイズの質問・回答間の一貫性の確保
- デプロイ前のインタラクション設定の正確性検証

## JSONの全体構造

### 基本構造

```json
{
  "interactions": [...],
  "questions": [...],
  "subtitles": []
}
```

### 共通属性

- **type**: インタラクションタイプを指定（mc, open, text, scroll）
- **start_time または active_at**: インタラクションの開始時刻（秒）
- **end_time**: インタラクションの終了時刻（秒）
- **style**: 色や z-index などの視覚プロパティを制御
- **title**: インタラクションのわかりやすい名前

## インタラクションタイプ

### 3.1 Jump to（ジャンプ）

**目的**: 視聴者が動画内の別の位置へジャンプできるようにします。

**属性:**
- action.type: "jump"
- action.time: ジャンプ先の時刻（秒）

**例:**
```json
{
  "type": "jump_to",
  "start_time": 18.28,
  "action": {"type": "jump", "time": 21.31},
  "title": "Jump to"
}
```

### 3.2 Menu（メニュー）

**目的**: 動画内のナビゲーションを提供し、ユーザーが別のセクションへジャンプしたりアクションをトリガーしたりできるようにします。

**共通インタラクション属性:**
- start_time: メニューが表示される時刻

**インタラクション固有の属性:**
- type: "menu"
- title: わかりやすい名前
- attributes:
  - options:
    - should_give_possibility_to_close: 真偽値
    - should_show_menu_button: 真偽値
    - menu_button_location: 位置の値
    - menu_button_position: 配置の値
    - menu_button_name: ボタンラベル
    - position: メニューの配置（left、right など）
  - menu_items: ナビゲーション可能な項目の配列
    - name: 表示テキスト
    - action: 時刻を指定したジャンプアクション
- should_show_chapter_numbers: 真偽値
- should_not_use_time: 真偽値
- position: 画面上のメニュー位置
- should_pause_when_shown: 真偽値
- style: レイヤー順のための z_index

**例:**
```json
{
  "attributes": {
    "options": {
      "should_give_possibility_to_close": true,
      "should_show_menu_button": false,
      "menu_button_location": 0,
      "menu_button_position": 0,
      "menu_button_name": "",
      "position": "left"
    },
    "menu_items": [
      {
        "action": {
          "type": "jump",
          "time": 12.87
        },
        "name": "Menu item 1"
      },
      {
        "action": {
          "type": "jump",
          "time": 41.69
        },
        "name": "Menu item 2"
      }
    ]
  },
  "should_show_chapter_numbers": true,
  "start_time": 3.66,
  "style": {
    "z_index": 50
  },
  "title": "Menu",
  "type": "menu",
  "should_not_use_time": false,
  "position": "left",
  "should_pause_when_shown": true
}
```

### 3.3 Chapter（チャプター）

**目的**: 動画をセクションに分けて整理し、簡単なナビゲーションと優れたユーザー体験を実現します。

**共通インタラクション属性:**
- start_time: チャプターインタラクションの開始
- end_time: チャプターインタラクションの終了

**インタラクション固有の属性:**
- type: "chapter"
- title: チャプターインタラクション全体のタイトル
- chapters: チャプターセクションの配列
  - title: チャプター名
  - start_time: チャプター開始（秒）
  - end_time: チャプター終了（秒）
  - title_short: 小さい画面用の短縮タイトル
  - sort_order: メニュー内のチャプター順序
  - is_disabled: ナビゲーションを禁止する真偽値
- should_collapse_after_menu_item_click: 真偽値
- should_start_collapsed: 真偽値
- should_use_menu_layout: 真偽値
- position: ナビゲーションの配置
- should_pause_when_shown: 真偽値
- style: z_index、desktop_font_size、mobile_font_size

**例:**
```json
{
  "end_time": 60.18,
  "start_time": 3.25,
  "style": {
    "z_index": 50,
    "desktop_font_size": 30,
    "mobile_font_size": 24
  },
  "title": "Content",
  "type": "chapter",
  "chapters": [
    {
      "title": "Chapter 1",
      "start_time": 3.6,
      "end_time": 21.14,
      "title_short": "Short name for mobile 1",
      "sort_order": 1,
      "is_disabled": false
    },
    {
      "title": "Chapter 2",
      "start_time": 21.14,
      "end_time": 43.34,
      "title_short": "Short name for mobile 2",
      "sort_order": 1,
      "is_disabled": false
    }
  ],
  "should_collapse_after_menu_item_click": true,
  "should_start_collapsed": true,
  "should_use_menu_layout": true,
  "position": "left",
  "should_pause_when_shown": true
}
```

### 3.4 Text（テキスト）

**目的**: 動画の特定区間に、動的でスタイル付きのテキストを追加します。

**属性:**
- should_fade_in, should_fade_out: フェード効果の真偽値
- text: 表示する HTML スタイル付きテキスト
- action: 時間制御用の delayed_jump を含められる
- text_stroke: テキストの縁取り色
- attributes.should_use_vertical_text_orientation: 真偽値
- style: background_color、padding、z_index、border 関連プロパティ、サイズ、位置

**例:**
```json
{
  "action": {
    "type": "delayed_jump",
    "time": 42.76,
    "jump_at_position": 37.33,
    "activation_style": {
      "background_color": null,
      "text_color": null
    }
  },
  "attributes": {
    "should_use_vertical_text_orientation": true
  },
  "end_time": 45.9,
  "start_time": 35.9,
  "style": {
    "background_color": "rgb(0, 255, 0)",
    "padding_top": 40,
    "padding_bottom": 40,
    "align_items": "center",
    "z_index": 50,
    "border": {
      "border_color": null,
      "border_style": null,
      "border_width": null
    },
    "border_radius": 130,
    "height": "70.48%",
    "left": "36.27%",
    "top": "12.35%",
    "width": "40.00%"
  },
  "text": "<p style=\"text-align: center;\">Text example</p>",
  "text_stroke": "black",
  "title": "Text",
  "type": "text",
  "should_fade_in": true,
  "should_fade_out": true
}
```

### 3.5 Scrollable Text（スクロールテキスト）

**目的**: 長めのメッセージや説明のためにスクロール可能なテキストを表示します。

**属性:**
- attributes.scroll_direction: テキストのスクロール方向
- attributes.scroll_duration: スクロール速度（秒）
- should_fade_in, should_fade_out: フェード効果の真偽値
- text: HTML スタイル付きテキスト
- attributes.should_use_vertical_text_orientation: 真偽値
- style: 位置および視覚プロパティ

**例:**
```json
{
  "action": {
    "type": "no_action"
  },
  "attributes": {
    "scroll_direction": "ltr",
    "scroll_duration": 5,
    "should_use_vertical_text_orientation": true
  },
  "end_time": 45.9,
  "start_time": 35.9,
  "style": {
    "background_color": "rgb(0, 255, 0)",
    "padding_top": 40,
    "padding_bottom": 40,
    "align_items": "center",
    "z_index": 50,
    "border": {
      "border_color": null,
      "border_style": null,
      "border_width": null
    },
    "border_radius": 130,
    "height": "70.48%",
    "left": "36.27%",
    "top": "12.35%",
    "width": "40.00%"
  },
  "text": "<p style=\"text-align: center;\">Scrollable text example</p>",
  "text_stroke": "black",
  "title": "Scrollable Text",
  "type": "scroll",
  "should_fade_in": true,
  "should_fade_out": true
}
```

### 3.6 Hotspot（ホットスポット）

**目的**: 動画上のインタラクティブな領域で、特定のコンテンツ部分への追加のエンゲージメントを生みます。

**属性:**
- attributes:
  - should_show_indicator: インタラクションのヒント表示の真偽値
  - indicator_color: ヒントの色
  - text_label_color: テキストラベルの色
  - text_render_scale: テキストの拡大率（デフォルトは null）
  - tooltip_placement: 位置（top, bottom, left, right, middle）
  - blinking_speed: 点滅速度（normal, fast, slow）
  - should_use_vertical_text_orientation: 真偽値
- end_time, start_time: 有効期間
- text: HTML 形式のテキスト
- style: background_color（多くは透明）、z_index、border、border_radius、サイズ、位置

**例:**
```json
{
  "action": {
    "type": "no_action"
  },
  "attributes": {
    "should_show_indicator": true,
    "indicator_color": "rgb(0, 255, 255)",
    "text_label_color": "rgba(4, 51, 72, 0.9)",
    "text_render_scale": null,
    "tooltip_placement": "top",
    "blinking_speed": "normal",
    "should_use_vertical_text_orientation": false
  },
  "end_time": 73.31,
  "start_time": 63.31,
  "style": {
    "background_color": "rgba(0, 0, 0, 0)",
    "z_index": 55,
    "border": {
      "border_color": null,
      "border_style": null,
      "border_width": null
    },
    "border_radius": 0,
    "height": "30.05%",
    "left": "48.06%",
    "top": "52.93%",
    "width": "40.00%"
  },
  "text": "<p style=\"text-align: center;\">Hotspot text</p>",
  "title": "Hotspot",
  "type": "hotspot"
}
```

### 3.7 Highlight（ハイライト）

**目的**: 動画内の領域を強調表示またはズームし、視聴者の注意を引きます。

**属性:**
- should_fade_in, should_fade_out: フェード効果の真偽値
- end_time, start_time: 表示期間
- action: 視覚的な強調のみの場合は通常 no_action
- style:
  - background_color: 不透明度付きのオーバーレイ色
  - z_index: レイヤー順
  - border: 色、スタイル（solid, dashed, dotted）、幅
  - border_radius: 角の丸み
  - サイズと位置: height, width, left, top

**例:**
```json
{
  "action": {
    "type": "no_action"
  },
  "end_time": 77.79,
  "start_time": 67.79,
  "style": {
    "background_color": "rgba(188, 146, 102, 0.66)",
    "z_index": 50,
    "border": {
      "border_color": "rgb(102, 0, 0)",
      "border_style": "dashed",
      "border_width": 7
    },
    "border_radius": 154,
    "height": "56.01%",
    "left": "53.49%",
    "top": "22.53%",
    "width": "40.00%"
  },
  "title": "Highlight",
  "type": "highlight",
  "should_fade_in": true,
  "should_fade_out": true
}
```

### 3.8 Zoom（ズーム）

**目的**: 動画の特定部分にズームインし、詳細をじっくり見せます。

**属性:**
- end_time, start_time: ズーム効果の期間
- style:
  - z_index: レイヤー順
  - border: 色、スタイル（solid, dotted, dashed）、幅
  - border_radius: 角の丸み
  - サイズと位置: height, width, left, top

**例:**
```json
{
  "end_time": 80.22,
  "start_time": 70.22,
  "style": {
    "z_index": 50,
    "border": {
      "border_color": "rgb(255, 0, 0)",
      "border_style": "dotted",
      "border_width": 19
    },
    "border_radius": 360,
    "height": "24.46%",
    "left": "68.80%",
    "top": "50.00%",
    "width": "24.46%"
  },
  "title": "Zoom in",
  "type": "zoom"
}
```

### 3.9 Frame（フレーム）

**目的**: 外部のWebコンテンツを動画内に直接埋め込み、インタラクティブな体験を提供します。

**属性:**
- action:
  - type: "link"
  - link: 埋め込むコンテンツのURL
  - should_open_in_same_window: 真偽値
  - should_resume_video_with_event: 動画再開のための真偽値
- attributes:
  - should_stay_alive_after_hiding: 真偽値
- should_fade_in, should_fade_out: フェード効果の真偽値
- end_time, start_time: フレームの有効期間
- style:
  - background_color: 多くは半透明のオーバーレイ
  - z_index: レイヤー順
  - border: 色、スタイル、幅
  - border_radius: 角の丸み
  - サイズと位置

**例:**
```json
{
  "action": {
    "type": "link",
    "link": "https://hihaho.com/",
    "should_open_in_same_window": false,
    "should_resume_video_with_event": false
  },
  "attributes": {
    "should_stay_alive_after_hiding": true
  },
  "end_time": 83.34,
  "start_time": 73.34,
  "style": {
    "background_color": "rgba(4, 51, 72, 0.9)",
    "z_index": 50,
    "border": {
      "border_color": "rgba(188, 146, 102, 0.66)",
      "border_style": "dashed",
      "border_width": 10
    },
    "border_radius": 114,
    "height": "42.92%",
    "left": "43.73%",
    "top": "48.07%",
    "width": "26.02%"
  },
  "title": "iFrame",
  "type": "frame",
  "should_fade_in": true,
  "should_fade_out": true
}
```

### 3.10 Linked Video（リンク動画）

**目的**: プラットフォーム内の別動画や外部サービスへリンクし、コンテンツをシームレスに切り替えます。

**属性:**
- action:
  - type: "link_video"
  - link: 動画の識別子またはURL
  - should_open_in_same_window: 真偽値
  - link_video_target_custom_start_time: 任意の開始時刻（秒）
  - previous_video_button_mode: 戻るボタンの表示場所
  - previous_video_button_text: 戻るボタンのラベル
- attributes:
  - should_use_vertical_text_orientation: 真偽値
- should_fade_in, should_fade_out: フェード効果
- end_time, start_time: リンクの有効期間
- style: background_color、padding、配置、z_index、border 関連プロパティ、サイズ
- text: HTML 形式のインタラクションテキスト
- text_stroke: テキストの縁取り色

**例:**
```json
{
  "action": {
    "type": "link_video",
    "link": "VIDEO_ID",
    "should_open_in_same_window": true,
    "link_video_target_custom_start_time": 16,
    "previous_video_button_mode": "everywhere",
    "previous_video_button_text": "Button text"
  },
  "attributes": {
    "should_use_vertical_text_orientation": true
  },
  "end_time": 54.57,
  "start_time": 44.57,
  "style": {
    "background_color": "rgb(255, 153, 0)",
    "padding_top": 10,
    "padding_bottom": 10,
    "align_items": "flex-end",
    "z_index": 50,
    "border": {
      "border_color": "rgb(255, 255, 0)",
      "border_style": "dotted",
      "border_width": 3
    },
    "border_radius": 214,
    "height": "40.99%",
    "left": "43.61%",
    "top": "32.83%",
    "width": "39.88%"
  },
  "text": "<p style=\"text-align: center;\"><span style=\"font-family: Roboto, sans-serif; font-size: 21pt; color: rgba(255,255,255,1);\">Your text here</span></p>",
  "text_stroke": "black",
  "title": "Linked video",
  "type": "link_video",
  "should_fade_in": true,
  "should_fade_out": true
}
```

### 3.11 Image（画像）

**目的**: 静止画またはアニメーション画像を、指定した時間に動画の上に表示してコンテンツを強化します。

**属性:**
- action:
  - type: "delayed_jump"
  - time: ジャンプ先の時刻
  - jump_at_position: ジャンプが発動する位置
  - activation_style: アクティブ状態のスタイル
- attributes:
  - should_click_through: 真偽値
- should_fade_in, should_fade_out: フェード効果の真偽値
- end_time, start_time: 画像の表示期間
- image_url: 画像ファイルのURLまたはパス
- should_play_gif_on_mouseover: アニメーションGIF用の真偽値
- style:
  - background_color: 背景色
  - z_index: レイヤー順
  - object_fit: サイズ調整方法（cover, contain）
  - opacity: 画像の透明度
  - border: 色、スタイル、幅
  - border_radius: 角の丸み
  - サイズと位置

**例:**
```json
{
  "action": {
    "type": "delayed_jump",
    "time": 66.85,
    "jump_at_position": 51.14,
    "activation_style": {
      "background_color": "rgb(68, 68, 68)",
      "text_color": "rgb(255, 153, 0)"
    }
  },
  "attributes": {
    "should_click_through": false
  },
  "end_time": 56.82,
  "start_time": 46.85,
  "style": {
    "background_color": "rgb(244, 204, 204)",
    "z_index": 50,
    "object_fit": "cover",
    "opacity": 1,
    "border": {
      "border_color": "rgb(255, 0, 0)",
      "border_style": "dotted",
      "border_width": 46
    },
    "border_radius": 150,
    "height": "1.72%",
    "left": "0.00%",
    "top": "0.00%",
    "width": "0.36%"
  },
  "title": "Image",
  "type": "image",
  "should_fade_in": true,
  "should_fade_out": true,
  "image_url": "/img/default_image_interaction.png",
  "should_play_gif_on_mouseover": false
}
```

### 3.12 Sound（サウンド）

**目的**: 動画の特定の時間に、BGMや効果音を追加します。

**属性:**
- sound_url: サウンドファイルのURL
- should_enable_sound: 再生制御の真偽値

**例:**
```json
{
  "end_time": 96.83,
  "start_time": 95.31,
  "title": "Sound",
  "type": "sound",
  "should_enable_sound": false,
  "sound_url": "SOUND_URL"
}
```

## 質問インタラクション

### 4.1 質問の追加

質問は JSON の「questions」配列に追加します。各質問オブジェクトには次が含まれます:
- type: 質問タイプ（mc, open, rating）
- active_at: 質問が表示される時刻（秒）
- text: ユーザーへの質問文
- answers: 選択肢の配列（自由記述式の場合は null）
- action: 回答時に起こること

### 4.2 質問タイプ

#### 4.2.1 Multiple Choice（多肢選択・mc）

**共通インタラクション属性:**
- active_at: 質問が表示される正確な時刻（秒）

**質問固有の属性:**
- type: "mc"
- text: 質問文（HTML可）
- answers: 選択肢の配列
  - text: 選択肢のテキスト
  - is_correct: 正誤を示す真偽値
  - action: 選択時に起こること（jump, repeat_question, show_score_screen）
    - type: アクションタイプ
    - time: ジャンプ先
    - interaction_id, link, question_id: 外部リソースへのリンク
    - should_open_in_same_window: リンク動作の真偽値
- action: 回答シナリオごとの結果
  - correct: 正解を選択した場合のアクション
  - incorrect: 不正解を選択した場合のアクション
  - no_match: どの回答にも一致しない場合のアクション

**フィードバック・採点属性:**
- counts_points_per_answer: 選択肢ごとの得点計算の真偽値
- enable_partly_correct_feedback: 部分正解フィードバックの真偽値
- explanation_partly_correct: 部分正解の説明文
- feedback_screen_color: 背景色付きの真偽値
- feedback_screen_correct_answer_feedback: 正解時のフィードバック
- feedback_screen_incorrect_answer_feedback: 不正解時のフィードバック
- feedback_screen_general_feedback: 全般フィードバック（HTML形式）
- feedback_title_custom_text: カスタムフィードバックタイトル
- feedback_title_type: "automatic" または "custom"
- feedback_type: 表示方法（no_feedback, direct, screen）

**表示・操作属性:**
- font_size: テキストサイズ
- image_fit, image_url: 質問画像とサイズ調整
- feedback_image_fit, feedback_image_url: フィードバック画像とサイズ調整
- is_repeatable: 再挑戦可否の真偽値
- layout: 表示スタイル（modern, classic）
- markup: UI要素の設定
  - back_button: ナビゲーションボタン
  - feedback_action_button: フィードバック後のアクションボタン
  - placeholder, prefix, suffix: 入力欄のテキスト要素

**その他の属性:**
- points: 質問の合計ポイント
- should_fade_in, should_fade_out: フェード効果
- should_play_sound, sound_url: 効果音
- should_retry_question_on_incorrect_answer: 自動リトライの真偽値
- should_show_feedback_when_answered: フィードバック表示の真偽値
- should_shuffle_answers: 選択肢シャッフルの真偽値
- should_submit_instantly: 即時送信の真偽値
- subtitle_text: 質問の下に表示する補足
- submit_label: 送信ボタンのテキスト

**例:**
```json
{
  "action": {
    "correct": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "continue_playing"
    },
    "incorrect": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "continue_playing"
    },
    "no_match": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "show_score_screen"
    }
  },
  "active_at": 46.85,
  "answers": [
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 33.48,
        "type": "jump"
      },
      "is_correct": true,
      "explanation": null,
      "text": "right answer",
      "points": 2
    },
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 0,
        "type": "repeat_question"
      },
      "is_correct": false,
      "explanation": null,
      "text": "wrong answer",
      "points": 1
    },
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 0,
        "type": "show_score_screen"
      },
      "is_correct": false,
      "explanation": null,
      "text": "another wrong answer",
      "points": 0
    }
  ],
  "answer_minimum_character_count": 0,
  "counts_points_per_answer": true,
  "enable_partly_correct_feedback": false,
  "explanation_partly_correct": "",
  "feedback_screen_color": true,
  "feedback_screen_correct_answer_feedback": "",
  "feedback_screen_general_feedback": "<!--TINYMCE--><p> </p>",
  "feedback_screen_incorrect_answer_feedback": "",
  "feedback_title_custom_text": null,
  "feedback_title_type": "automatic",
  "feedback_type": "no_feedback",
  "font_size": 26,
  "image_fit": null,
  "image_url": null,
  "feedback_image_fit": null,
  "feedback_image_url": null,
  "is_repeatable": null,
  "layout": "modern",
  "markup": {
    "back_button": {
      "action": {
        "interaction_id": null,
        "link": null,
        "time": 0,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": true,
      "name": "Back button"
    },
    "feedback_action_button": {
      "action": {
        "interaction_id": null,
        "link": null,
        "time": 0,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": false,
      "name": null
    },
    "placeholder": null,
    "prefix": null,
    "suffix": null
  },
  "points": 0,
  "should_fade_in": true,
  "should_play_sound": true,
  "should_retry_question_on_incorrect_answer": false,
  "should_show_feedback_when_answered": null,
  "should_shuffle_answers": true,
  "should_submit_instantly": false,
  "sound_url": "[SOUND_URL]",
  "text": "Question",
  "type": "mc",
  "subtitle_text": "Question subtitle",
  "submit_label": "Submit button label"
}
```

#### 4.2.2 Open Question（自由記述式・essay）

**目的**: 長めの記述式回答を収集します。フィードバックや詳細な意見の収集に有用です。

**共通インタラクション属性:**
- active_at: 質問が表示される時刻

**質問固有の属性:**
- type: "essay"
- text: 質問文（HTML可）
- answers: null（選択肢なし）
- action:
  - correct, incorrect, no_match: 結果のアクション

**入力制御属性:**
- answer_minimum_character_count: 回答の最小文字数の要件

**フィードバック・採点属性:**
- counts_points_per_answer: 通常は false
- enable_partly_correct_feedback: 通常は false
- feedback_screen_color: 背景色の真偽値
- feedback_screen_correct_answer_feedback, feedback_screen_incorrect_answer_feedback, feedback_screen_general_feedback: カスタマイズ可能なフィードバック（HTML）
- feedback_title_custom_text: カスタムフィードバックタイトル
- feedback_title_type: "custom" または "automatic"
- feedback_type: 専用フィードバック画面の場合は "screen"

**表示・操作属性:**
- font_size: テキストサイズ
- image_fit, image_url, feedback_image_fit, feedback_image_url: 画像
- is_repeatable: false で再挑戦を禁止
- layout: モダン表示の場合 "modern"
- markup:
  - back_button: ナビゲーションボタン
  - feedback_action_button: フィードバック後のアクション
  - placeholder: 入力欄のガイダンステキスト

**その他の属性:**
- points: 参加または評価に対するポイント
- should_fade_in, should_fade_out: フェード効果
- should_play_sound, sound_url: 効果音
- should_retry_question_on_incorrect_answer: 通常は false
- should_show_feedback_when_answered: 真偽値
- should_shuffle_answers: 記述式では無関係
- should_submit_instantly: 記入時間の確保のため false
- subtitle_text: 補足コンテキスト
- submit_label: 送信ボタンのテキスト

**例:**
```json
{
  "action": {
    "correct": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "continue_playing"
    },
    "incorrect": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "continue_playing"
    },
    "no_match": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "show_score_screen"
    }
  },
  "active_at": 46.85,
  "answers": null,
  "answer_minimum_character_count": 10,
  "counts_points_per_answer": false,
  "enable_partly_correct_feedback": false,
  "explanation_partly_correct": "",
  "feedback_screen_color": false,
  "feedback_screen_correct_answer_feedback": "",
  "feedback_screen_general_feedback": "<!--TINYMCE--><p>Description</p>",
  "feedback_screen_incorrect_answer_feedback": "",
  "feedback_title_custom_text": {
    "correct": null,
    "incorrect": null,
    "neutral": "Feedback title",
    "partlyCorrect": null
  },
  "feedback_title_type": "custom",
  "feedback_type": "screen",
  "font_size": 14,
  "image_fit": null,
  "image_url": null,
  "feedback_image_fit": null,
  "feedback_image_url": null,
  "is_repeatable": false,
  "layout": "modern",
  "markup": {
    "back_button": {
      "action": {
        "interaction_id": null,
        "link": "[URL]",
        "time": 0,
        "question_id": null,
        "type": "link"
      },
      "is_enabled": true,
      "name": "Back button"
    },
    "feedback_action_button": {
      "action": {
        "interaction_id": null,
        "link": null,
        "time": 46.85,
        "question_id": null,
        "type": "jump"
      },
      "is_enabled": true,
      "name": "button title"
    },
    "placeholder": "placeholder text here",
    "prefix": null,
    "suffix": null
  },
  "points": 0,
  "should_fade_in": true,
  "should_play_sound": true,
  "should_retry_question_on_incorrect_answer": false,
  "should_show_feedback_when_answered": true,
  "should_shuffle_answers": true,
  "should_submit_instantly": false,
  "sound_url": "[SOUND_URL]",
  "text": "Open question",
  "type": "essay",
  "subtitle_text": "Question subtitle",
  "submit_label": "Submit button label"
}
```

#### 4.2.3 Rating Question（評価質問）

**目的**: スケールや星を使って、視聴者からフィードバックや評価を取得します。

**共通インタラクション属性:**
- active_at: 質問が表示される時刻

**質問固有の属性:**
- type: "rating"
- text: 評価の質問文（HTML可）
- answers: null（代わりにスケールを使用）
- action:
  - correct, incorrect, no_match: 結果のアクション

**フィードバック・採点属性:**
- counts_points_per_answer: 通常は false
- enable_partly_correct_feedback: 通常は false
- feedback_screen_color: 背景色の真偽値
- feedback_screen_general_feedback: フィードバック（HTML）
- feedback_title_custom_text, feedback_title_type: カスタム／自動タイトル
- feedback_type: 即時フィードバックの場合 "direct"

**表示・操作属性:**
- font_size: テキストサイズ
- image_fit, image_url, feedback_image_fit, feedback_image_url: 画像
- is_repeatable: null で送信後の変更を禁止
- layout: "modern"
- markup: UI設定

**その他の属性:**
- points: 得点の値
- should_fade_in: フェード効果
- should_play_sound, sound_url: 通常は false
- should_retry_question_on_incorrect_answer: false
- should_show_feedback_when_answered: null
- should_shuffle_answers: true（効果なし）
- should_submit_instantly: true（即時送信）
- subtitle_text: 補足コンテキスト
- submit_label: null（不要）

**例:**
```json
{
  "action": {
    "correct": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "continue_playing"
    },
    "incorrect": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "continue_playing"
    },
    "no_match": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "jump_to_end"
    }
  },
  "active_at": 46.85,
  "answers": null,
  "answer_minimum_character_count": 0,
  "counts_points_per_answer": false,
  "enable_partly_correct_feedback": false,
  "explanation_partly_correct": "",
  "feedback_screen_color": true,
  "feedback_screen_correct_answer_feedback": "",
  "feedback_screen_general_feedback": "<!--TINYMCE--><p> </p>",
  "feedback_screen_incorrect_answer_feedback": "",
  "feedback_title_custom_text": null,
  "feedback_title_type": "automatic",
  "feedback_type": "direct",
  "font_size": 28,
  "image_fit": null,
  "image_url": null,
  "feedback_image_fit": null,
  "feedback_image_url": null,
  "is_repeatable": null,
  "layout": "modern",
  "markup": {
    "back_button": {
      "action": {
        "interaction_id": null,
        "link": "[URL]",
        "time": 0,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": true,
      "name": "Back button"
    },
    "feedback_action_button": {
      "action": {
        "interaction_id": null,
        "link": null,
        "time": 52.13,
        "question_id": null,
        "type": "jump"
      },
      "is_enabled": true,
      "name": "button title"
    },
    "placeholder": null,
    "prefix": null,
    "suffix": null
  },
  "points": 0,
  "should_fade_in": true,
  "should_play_sound": false,
  "should_retry_question_on_incorrect_answer": false,
  "should_show_feedback_when_answered": null,
  "should_shuffle_answers": true,
  "should_submit_instantly": true,
  "sound_url": null,
  "text": "Question here",
  "type": "rating",
  "subtitle_text": "Question subtitle",
  "submit_label": null
}
```

#### 4.2.4 Multiple Response（複数回答・mr）

**目的**: 視聴者が複数の正解を選択できるようにし、複雑なクイズシナリオに対応します。

**共通インタラクション属性:**
- active_at: 質問が表示される時刻

**質問固有の属性:**
- type: "mr"
- text: 質問文（HTML可）
- answers: 複数の項目が正解になり得る配列
  - text: 選択肢のテキスト
  - is_correct: 真偽値（複数 true 可）
  - action: 選択結果のアクション
  - points: 選択肢ごとのポイントまたは null
- action:
  - correct: すべての正解が選択された場合のアクション
  - incorrect: 不完全・誤った選択の場合のアクション
  - no_match: 正解が1つも選ばれなかった場合のアクション

**フィードバック・採点属性:**
- counts_points_per_answer: false（質問全体で計算）
- enable_partly_correct_feedback: 部分点のフィードバックには true
- explanation_partly_correct: 部分正解の説明文
- feedback_screen_color: 背景色の真偽値
- feedback_screen_general_feedback: 全般フィードバック（HTML）
- feedback_title_custom_text: カスタムタイトルのオブジェクト
- feedback_title_type: "custom"
- feedback_type: "direct"（即時表示）

**表示・操作属性:**
- font_size: テキストサイズ
- image_fit, image_url: 質問画像
- feedback_image_fit, feedback_image_url: フィードバック画像
- is_repeatable: false で再挑戦を禁止
- layout: "modern"
- markup: UI要素

**その他の属性:**
- points: 質問の合計ポイント
- should_fade_in: フェード効果
- should_play_sound, sound_url: 通常は false
- should_retry_question_on_incorrect_answer: リトライさせる場合は true
- should_show_feedback_when_answered: false
- should_shuffle_answers: true
- should_submit_instantly: false（送信操作が必要）
- subtitle_text: 補足コンテキスト
- submit_label: ボタンのテキスト

**例:**
```json
{
  "action": {
    "correct": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 57.64,
      "type": "jump"
    },
    "incorrect": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "repeat_question"
    },
    "no_match": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "jump_to_end"
    }
  },
  "active_at": 52.13,
  "answers": [
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 0,
        "type": "continue_playing"
      },
      "is_correct": true,
      "explanation": null,
      "text": "Right answer",
      "points": null
    },
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 0,
        "type": "continue_playing"
      },
      "is_correct": false,
      "explanation": null,
      "text": "Wrong answer",
      "points": null
    },
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 0,
        "type": "continue_playing"
      },
      "is_correct": true,
      "explanation": null,
      "text": "another right answer",
      "points": null
    }
  ],
  "answer_minimum_character_count": 0,
  "counts_points_per_answer": false,
  "enable_partly_correct_feedback": true,
  "explanation_partly_correct": "",
  "feedback_screen_color": true,
  "feedback_screen_correct_answer_feedback": "",
  "feedback_screen_general_feedback": "<!--TINYMCE--><p> </p>",
  "feedback_screen_incorrect_answer_feedback": "",
  "feedback_title_custom_text": {
    "correct": "Correct",
    "incorrect": "Incorrect",
    "neutral": null,
    "partlyCorrect": "Partly correct"
  },
  "feedback_title_type": "custom",
  "feedback_type": "direct",
  "font_size": 22,
  "image_fit": "contain",
  "image_url": "example url",
  "feedback_image_fit": "cover",
  "feedback_image_url": "example url",
  "is_repeatable": false,
  "layout": "modern",
  "markup": {
    "back_button": {
      "action": {
        "interaction_id": null,
        "link": "example url",
        "time": 0,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": true,
      "name": "knopje"
    },
    "feedback_action_button": {
      "action": {
        "interaction_id": null,
        "link": null,
        "time": 57.64,
        "question_id": null,
        "type": "jump"
      },
      "is_enabled": true,
      "name": "button title"
    },
    "placeholder": null,
    "prefix": null,
    "suffix": null
  },
  "points": 6,
  "should_fade_in": true,
  "should_play_sound": false,
  "should_retry_question_on_incorrect_answer": true,
  "should_show_feedback_when_answered": false,
  "should_shuffle_answers": true,
  "should_submit_instantly": false,
  "sound_url": null,
  "text": "Question",
  "type": "mr",
  "subtitle_text": "Question subtitle",
  "submit_label": "Submit button label"
}
```

#### 4.2.5 Entry Question（エントリー質問・open）

**目的**: 動画の冒頭でユーザー入力を収集し、パーソナライズやデータ収集に使用します。

**共通インタラクション属性:**
- active_at: 質問が表示される時刻

**質問固有の属性:**
- type: "open"
- text: 入力を促す文（HTML可）
- answers: ダミー回答を含む配列
  - text: 空文字列
  - is_correct: 正解ダミーは true、それ以外は false
  - action: 通常は continue_playing
- action:
  - correct: パーソナライズしたコンテンツへジャンプ
  - incorrect: バリデーション失敗時に質問を繰り返す
  - no_match: 動画終了またはデフォルトの経路

**フィードバック・採点属性:**
- counts_points_per_answer: false
- enable_partly_correct_feedback: false
- feedback_screen_color: 背景の真偽値
- feedback_screen_general_feedback: 説明／フィードバック
- feedback_title_custom_text: null
- feedback_title_type: "automatic"
- feedback_type: "no_feedback"

**表示・操作属性:**
- font_size: null またはテキストサイズ
- image_fit, image_url, feedback_image_fit, feedback_image_url: null
- is_repeatable: null
- layout: "modern"
- markup:
  - back_button: is_enabled は false
  - feedback_action_button: is_enabled は false
  - placeholder: 入力欄のガイダンステキスト

**その他の属性:**
- points: 参加に対して 1
- should_fade_in: true
- should_play_sound, sound_url: false
- should_retry_question_on_incorrect_answer: false
- should_show_feedback_when_answered: null
- should_shuffle_answers: true（効果なし）
- should_submit_instantly: false
- subtitle_text: 補足コンテキスト
- submit_label: null

**例:**
```json
{
  "action": {
    "correct": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 57.64,
      "type": "jump"
    },
    "incorrect": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "repeat_question"
    },
    "no_match": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "jump_to_end"
    }
  },
  "active_at": 57.64,
  "answers": [
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 0,
        "type": "continue_playing"
      },
      "is_correct": true,
      "explanation": null,
      "text": "",
      "points": null
    },
    {
      "action": {
        "interaction_id": null,
        "link": null,
        "question_id": null,
        "should_open_in_same_window": false,
        "time": 0,
        "type": "continue_playing"
      },
      "is_correct": false,
      "explanation": null,
      "text": "",
      "points": null
    }
  ],
  "answer_minimum_character_count": 0,
  "counts_points_per_answer": false,
  "enable_partly_correct_feedback": false,
  "explanation_partly_correct": "",
  "feedback_screen_color": true,
  "feedback_screen_correct_answer_feedback": "",
  "feedback_screen_general_feedback": "<!--TINYMCE--><p> </p>",
  "feedback_screen_incorrect_answer_feedback": "",
  "feedback_title_custom_text": null,
  "feedback_title_type": "automatic",
  "feedback_type": "no_feedback",
  "font_size": null,
  "image_fit": null,
  "image_url": null,
  "feedback_image_fit": null,
  "feedback_image_url": null,
  "is_repeatable": null,
  "layout": "modern",
  "markup": {
    "back_button": {
      "action": {
        "interaction_id": null,
        "link": "example url",
        "time": 0,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": false,
      "name": null
    },
    "feedback_action_button": {
      "action": {
        "interaction_id": null,
        "link": null,
        "time": 57.64,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": false,
      "name": null
    },
    "placeholder": "Placeholder",
    "prefix": "Prefix",
    "suffix": "Suffix"
  },
  "points": 1,
  "should_fade_in": true,
  "should_play_sound": false,
  "should_retry_question_on_incorrect_answer": false,
  "should_show_feedback_when_answered": null,
  "should_shuffle_answers": true,
  "should_submit_instantly": false,
  "sound_url": null,
  "text": "Entry question",
  "type": "open",
  "subtitle_text": "Question subtitle",
  "submit_label": null
}
```

#### 4.2.6 Vacancy Question（応募フォーム質問）

**目的**: インタラクティブ動画の中で、求人応募情報などの構造化されたデータを収集します。

**共通インタラクション属性:**
- active_at: フォームが表示される時刻

**質問固有の属性:**
- type: "vacancy"
- text: フォームのタイトル（HTML可）
- answers: null（フォームベースの回答）
- action:
  - correct: サンキュー画面や次のステップの区間へジャンプ
  - incorrect: バリデーション失敗時に繰り返す
  - no_match: エラー／デフォルトの経路

**フィードバック・採点属性:**
- counts_points_per_answer: false
- enable_partly_correct_feedback: false
- feedback_screen_color: 背景色の真偽値
- feedback_screen_general_feedback: お礼・説明（HTML）
- feedback_title_custom_text, feedback_title_type: null／未使用
- feedback_type: "screen"

**表示・操作属性:**
- font_size: null またはテキストサイズ
- image_fit, image_url, feedback_image_fit, feedback_image_url: null
- is_repeatable: true（複数回の送信を許可）
- layout: "modern"
- markup:
  - back_button: is_enabled は false
  - feedback_action_button: is_enabled は false
  - vacancy: フォーム設定のサブオブジェクト
    - company_name_label: フィールドラベル
    - email_address_label: メールフィールドのラベル
    - first_name_label: 名のフィールドラベル
    - last_name_label: 姓のフィールドラベル
    - receiver_email_address: 送信内容の受信メールアドレス
    - upload_instructional_placeholder: ファイルアップロードの案内文
    - should_allow_file_upload: 真偽値

**その他の属性:**
- points: 0（採点なし）
- should_fade_in: true
- should_play_sound, sound_url: false
- should_retry_question_on_incorrect_answer: false
- should_show_feedback_when_answered: null
- should_shuffle_answers: true（効果なし）
- should_submit_instantly: false
- subtitle_text: 補足コンテキスト
- submit_label: null

**例:**
```json
{
  "action": {
    "correct": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 57.64,
      "type": "jump"
    },
    "incorrect": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "repeat_question"
    },
    "no_match": {
      "interaction_id": null,
      "link": null,
      "question_id": null,
      "should_open_in_same_window": false,
      "time": 0,
      "type": "jump_to_end"
    }
  },
  "active_at": 57.64,
  "answers": null,
  "answer_minimum_character_count": 0,
  "counts_points_per_answer": false,
  "enable_partly_correct_feedback": false,
  "explanation_partly_correct": "",
  "feedback_screen_color": true,
  "feedback_screen_correct_answer_feedback": "",
  "feedback_screen_general_feedback": "<!--TINYMCE--><p>Description</p>",
  "feedback_screen_incorrect_answer_feedback": "",
  "feedback_title_custom_text": null,
  "feedback_title_type": null,
  "feedback_type": "screen",
  "font_size": null,
  "image_fit": null,
  "image_url": null,
  "feedback_image_fit": null,
  "feedback_image_url": null,
  "is_repeatable": true,
  "layout": "modern",
  "markup": {
    "back_button": {
      "action": {
        "interaction_id": null,
        "link": "example url",
        "time": 0,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": false,
      "name": null
    },
    "feedback_action_button": {
      "action": {
        "interaction_id": null,
        "link": null,
        "time": 57.64,
        "question_id": null,
        "type": "jump_to_start"
      },
      "is_enabled": false,
      "name": null
    },
    "placeholder": null,
    "prefix": null,
    "suffix": null,
    "vacancy": {
      "company_name_label": "Third field",
      "email_address_label": "Email field",
      "first_name_label": "First field",
      "last_name_label": "Second field",
      "receiver_email_address": "example@mail.com",
      "upload_instructional_placeholder": "Upload file here",
      "should_allow_file_upload": true
    }
  },
  "points": 0,
  "should_fade_in": true,
  "should_play_sound": false,
  "should_retry_question_on_incorrect_answer": false,
  "should_show_feedback_when_answered": null,
  "should_shuffle_answers": true,
  "should_submit_instantly": false,
  "sound_url": null,
  "text": "Form title",
  "type": "vacancy",
  "subtitle_text": "Question subtitle",
  "submit_label": null
}
```

## アクションタイプ

アクションは、インタラクションや回答が選択されたときに何が起こるかを定義します。主なタイプは次のとおりです:

- **jump**: 動画の特定時刻へジャンプします。例: `{"type": "jump", "time": 45}`
- **continue_playing**: 現在位置から動画を再生し続けます。例: `{"type": "continue_playing"}`
- **repeat_question**: 現在の質問／インタラクションを繰り返します。例: `{"type": "repeat_question"}`
- **show_score_screen**: サマリー画面を表示します。例: `{"type": "show_score_screen"}`
- **link**: 外部Webサイトや動画にリンクします。例: `{"type": "link", "link": "example.com", "should_open_in_same_window": false}`

アクションタイプは、ユーザーの操作に基づいて動画のフローを制御します。

## 字幕（Subtitles）

**目的**: アクセシビリティの向上や翻訳の提供。

**属性:**
- content: SRT 形式の字幕テキスト
- is_default: デフォルト表示の真偽値
- type: "srt"
- language: 言語コード
- title: 表示名
- should_show_button: ボタン表示の真偽値

**例:**
```json
{
  "type": "srt",
  "content": "SRT content here...",
  "is_default": true,
  "language": "EN",
  "title": "English",
  "should_show_button": true
}
```

## AIを活用したJSON自動化

- **自動生成**: AI が動画コンテンツの分析や既定テンプレートから JSON を作成
- **バリデーション**: AI がタイミングの問題、論理エラー、フォーマットの問題をチェック
- **翻訳**: 字幕の翻訳やインタラクションテキストのローカライズを自動化
- **最適化**: エンゲージメントデータに基づいて、AI が最適なタイミングや配置を提案

## 関連トピック
- [[hihahoナレッジベース INDEX]]
- [[インタラクティブ動画連携のためのhihaho APIの使い方]]
- [[SRTファイルの問題を解決する]]
