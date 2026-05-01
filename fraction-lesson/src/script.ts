export const FPS = 30;

// 総フレーム数は動的に決まる（最後の行のendFrameで決まる）
export const TOTAL_FRAMES = 1746;
export const TOTAL_DURATION = TOTAL_FRAMES / FPS; // ~58.2秒

export type SceneType = "explain" | "try" | "problem";

export interface ScriptLine {
  startFrame: number;
  endFrame: number;
  text: string;
  appScene: number;
  talking: boolean;
  sceneType: SceneType;
  audioIndex?: number; // 対応する audio ファイルの番号（undefined = 無音）
}

// 各フレームは「実際の発話フレーム数 + 15f（0.5秒）」で次へ移行
// 余白・問題のみ固定長
export const SCRIPT: ScriptLine[] = [
  // ── 分数の説明 ────────────────────────────────
  {
    startFrame: 0,
    endFrame: 116,   // 発話101f + 0.5s
    text: "みんな、こんにちは！\n今日は分数を一緒に学ぼう！",
    appScene: 1, talking: true, sceneType: "explain", audioIndex: 0,
  },
  {
    startFrame: 116,
    endFrame: 250,   // 発話119f + 0.5s
    text: "分数って何かな？\nピザを切るときを想像してね！",
    appScene: 1, talking: true, sceneType: "explain", audioIndex: 1,
  },
  {
    startFrame: 250,
    endFrame: 404,   // 発話139f + 0.5s
    text: "全体を同じ大きさに分けたとき、\nいくつ分かを表す数が「分数」だよ！",
    appScene: 1, talking: true, sceneType: "explain", audioIndex: 2,
  },
  {
    startFrame: 404,
    endFrame: 565,   // 発話146f + 0.5s
    text: "分数には２つの部分があるよ。\n下の数が「分母」、上の数が「分子」！",
    appScene: 2, talking: true, sceneType: "explain", audioIndex: 3,
  },
  {
    startFrame: 565,
    endFrame: 712,   // 発話132f + 0.5s
    text: "分母は「何等分するか」、\n分子は「いくつ分か」を表してるんだ！",
    appScene: 2, talking: true, sceneType: "explain", audioIndex: 4,
  },
  {
    startFrame: 712,
    endFrame: 757,   // 発話30f + 0.5s
    text: "わかったかな？",
    appScene: 2, talking: true, sceneType: "explain", audioIndex: 5,
  },

  // ── 試してみようコーナー（セリフ） ──────────────
  {
    startFrame: 757,
    endFrame: 894,   // 発話122f + 0.5s
    text: "それじゃあ、左のシミュレーターを\n動かして試してみよう！",
    appScene: 0, talking: true, sceneType: "try", audioIndex: 6,
  },
  {
    startFrame: 894,
    endFrame: 996,   // 発話87f + 0.5s
    text: "分子と分母を変えると\n円グラフが変わるよ！",
    appScene: 0, talking: true, sceneType: "try", audioIndex: 7,
  },

  // ── 余白（インタラクション時間・20秒）─────────────
  {
    startFrame: 996,
    endFrame: 1596,  // 20秒
    text: "",        // 吹き出し非表示
    appScene: 0, talking: false, sceneType: "try", audioIndex: undefined,
  },

  // ── 問題コーナー（5秒）─────────────────────────
  {
    startFrame: 1596,
    endFrame: 1746,  // 5秒
    text: "問題！\nこの分数の分母はいくつかな？",
    appScene: 0, talking: true, sceneType: "problem", audioIndex: 8,
  },
];

export function getCurrentLine(frame: number): ScriptLine {
  return (
    SCRIPT.find((s) => frame >= s.startFrame && frame < s.endFrame) ||
    SCRIPT[SCRIPT.length - 1]
  );
}
