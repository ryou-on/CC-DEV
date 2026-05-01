export const FPS = 30;
export const TOTAL_DURATION = 95;
export const TOTAL_FRAMES = FPS * TOTAL_DURATION;

export type SceneType = "explain" | "try" | "problem";

export interface ScriptLine {
  startFrame: number;
  endFrame: number;
  text: string;
  appScene: number;
  talking: boolean;
  sceneType: SceneType;
}

export const SCRIPT: ScriptLine[] = [
  // ── 分数の説明 ──────────────────────────────
  {
    startFrame: 0,
    endFrame: FPS * 5,
    text: "みんな、こんにちは！\n今日は分数を一緒に学ぼう！",
    appScene: 1,
    talking: true,
    sceneType: "explain",
  },
  {
    startFrame: FPS * 5,
    endFrame: FPS * 15,
    text: "分数って何かな？\nピザを切るときを想像してね！",
    appScene: 1,
    talking: true,
    sceneType: "explain",
  },
  {
    startFrame: FPS * 15,
    endFrame: FPS * 30,
    text: "全体を同じ大きさに分けたとき、\nいくつ分かを表す数が「分数」だよ！",
    appScene: 1,
    talking: true,
    sceneType: "explain",
  },
  {
    startFrame: FPS * 30,
    endFrame: FPS * 42,
    text: "分数には２つの部分があるよ。\n下の数が「分母」、上の数が「分子」！",
    appScene: 2,
    talking: true,
    sceneType: "explain",
  },
  {
    startFrame: FPS * 42,
    endFrame: FPS * 55,
    text: "分母は「何等分するか」、\n分子は「いくつ分か」を表してるんだ！",
    appScene: 2,
    talking: true,
    sceneType: "explain",
  },
  {
    startFrame: FPS * 55,
    endFrame: FPS * 60,
    text: "わかったかな？",
    appScene: 2,
    talking: true,
    sceneType: "explain",
  },

  // ── 実際に試してみようコーナー ────────────────
  {
    startFrame: FPS * 60,
    endFrame: FPS * 72,
    text: "それじゃあ、左のシミュレーターを\n動かして試してみよう！",
    appScene: 0,
    talking: true,
    sceneType: "try",
  },
  {
    startFrame: FPS * 72,
    endFrame: FPS * 90,
    text: "分子と分母を変えると\n円グラフが変わるよ！",
    appScene: 0,
    talking: true,
    sceneType: "try",
  },

  // ── 問題コーナー ──────────────────────────────
  {
    startFrame: FPS * 90,
    endFrame: FPS * 95,
    text: "問題！\nこの分数の分母はいくつかな？",
    appScene: 0,
    talking: true,
    sceneType: "problem",
  },
];

export function getCurrentLine(frame: number): ScriptLine {
  return (
    SCRIPT.find((s) => frame >= s.startFrame && frame < s.endFrame) ||
    SCRIPT[SCRIPT.length - 1]
  );
}
