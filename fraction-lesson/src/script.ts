// 台本：各シーンの開始フレーム・台詞・分数アプリシーン番号
export const FPS = 30;
export const TOTAL_DURATION = 180; // 3分
export const TOTAL_FRAMES = FPS * TOTAL_DURATION;

export interface ScriptLine {
  startFrame: number;
  endFrame: number;
  text: string;
  appScene: number; // FractionApp に渡すシーン番号
  talking: boolean;
}

export const SCRIPT: ScriptLine[] = [
  {
    startFrame: 0,
    endFrame: FPS * 5,
    text: "みんな、こんにちは！\n今日は分数を一緒に学ぼう！",
    appScene: 1,
    talking: true,
  },
  {
    startFrame: FPS * 5,
    endFrame: FPS * 15,
    text: "分数って何かな？\nピザを切るときのことを想像してね！",
    appScene: 1,
    talking: true,
  },
  {
    startFrame: FPS * 15,
    endFrame: FPS * 30,
    text: "全体を同じ大きさに分けたとき、\nいくつ分かを表す数が「分数」だよ！",
    appScene: 1,
    talking: true,
  },
  {
    startFrame: FPS * 30,
    endFrame: FPS * 42,
    text: "分数には２つの部分があるよ。\n下の数が「分母」、上の数が「分子」！",
    appScene: 2,
    talking: true,
  },
  {
    startFrame: FPS * 42,
    endFrame: FPS * 55,
    text: "分母は「何等分するか」、\n分子は「いくつ分か」を表してるんだ！",
    appScene: 2,
    talking: true,
  },
  {
    startFrame: FPS * 55,
    endFrame: FPS * 60,
    text: "わかったかな？ 次は足し算だよ！",
    appScene: 2,
    talking: true,
  },
  {
    startFrame: FPS * 60,
    endFrame: FPS * 72,
    text: "分母が同じ分数の足し算は\nとっても簡単！",
    appScene: 3,
    talking: true,
  },
  {
    startFrame: FPS * 72,
    endFrame: FPS * 85,
    text: "分子だけを足せばいいんだよ！\n1/4 ＋ 2/4 ＝ 3/4 ！",
    appScene: 3,
    talking: true,
  },
  {
    startFrame: FPS * 85,
    endFrame: FPS * 90,
    text: "ほら、簡単でしょ？",
    appScene: 3,
    talking: true,
  },
  {
    startFrame: FPS * 90,
    endFrame: FPS * 103,
    text: "約分は分数をシンプルにすること！\n分子と分母を同じ数で割るんだ。",
    appScene: 4,
    talking: true,
  },
  {
    startFrame: FPS * 103,
    endFrame: FPS * 115,
    text: "2/4 は 2 で割ると 1/2！\n大きさは同じだよ！",
    appScene: 4,
    talking: true,
  },
  {
    startFrame: FPS * 115,
    endFrame: FPS * 120,
    text: "すっきりしたね！",
    appScene: 4,
    talking: true,
  },
  {
    startFrame: FPS * 120,
    endFrame: FPS * 133,
    text: "通分は分母をそろえること！\n1/2 ＋ 1/3 を計算してみよう。",
    appScene: 5,
    talking: true,
  },
  {
    startFrame: FPS * 133,
    endFrame: FPS * 148,
    text: "分母を 6 にそろえて…\n3/6 ＋ 2/6 ＝ 5/6 になるよ！",
    appScene: 5,
    talking: true,
  },
  {
    startFrame: FPS * 148,
    endFrame: FPS * 150,
    text: "完璧！",
    appScene: 5,
    talking: true,
  },
  {
    startFrame: FPS * 150,
    endFrame: FPS * 165,
    text: "今日は分数について\n４つのことを学んだね！",
    appScene: 6,
    talking: true,
  },
  {
    startFrame: FPS * 165,
    endFrame: FPS * 178,
    text: "分数の意味、分母と分子、\n足し算、約分と通分！",
    appScene: 6,
    talking: true,
  },
  {
    startFrame: FPS * 178,
    endFrame: FPS * 180,
    text: "よくできました！🌟",
    appScene: 6,
    talking: false,
  },
];

export function getCurrentLine(frame: number): ScriptLine {
  return (
    SCRIPT.find((s) => frame >= s.startFrame && frame < s.endFrame) ||
    SCRIPT[SCRIPT.length - 1]
  );
}
