// OpenAI TTS で台本の音声ファイルを一括生成
// 使い方: OPENAI_API_KEY=sk-xxx node generate-audio.js
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// script.ts と同じ内容（Node.jsから直接 .ts は読めないのでここに複製）
const FPS = 30;
const SCRIPT = [
  { startFrame: 0,        endFrame: FPS * 5,   text: "みんな、こんにちは！今日は分数を一緒に学ぼう！" },
  { startFrame: FPS * 5,  endFrame: FPS * 15,  text: "分数って何かな？ピザを切るときのことを想像してね！" },
  { startFrame: FPS * 15, endFrame: FPS * 30,  text: "全体を同じ大きさに分けたとき、いくつ分かを表す数が「分数」だよ！" },
  { startFrame: FPS * 30, endFrame: FPS * 42,  text: "分数には２つの部分があるよ。下の数が「分母」、上の数が「分子」！" },
  { startFrame: FPS * 42, endFrame: FPS * 55,  text: "分母は「何等分するか」、分子は「いくつ分か」を表してるんだ！" },
  { startFrame: FPS * 55, endFrame: FPS * 60,  text: "わかったかな？次は足し算だよ！" },
  { startFrame: FPS * 60, endFrame: FPS * 72,  text: "分母が同じ分数の足し算はとっても簡単！" },
  { startFrame: FPS * 72, endFrame: FPS * 85,  text: "分子だけを足せばいいんだよ！4分の1 プラス 4分の2 は 4分の3！" },
  { startFrame: FPS * 85, endFrame: FPS * 90,  text: "ほら、簡単でしょ？" },
  { startFrame: FPS * 90, endFrame: FPS * 103, text: "約分は分数をシンプルにすること！分子と分母を同じ数で割るんだ。" },
  { startFrame: FPS * 103,endFrame: FPS * 115, text: "4分の2 は 2 で割ると 2分の1！大きさは同じだよ！" },
  { startFrame: FPS * 115,endFrame: FPS * 120, text: "すっきりしたね！" },
  { startFrame: FPS * 120,endFrame: FPS * 133, text: "通分は分母をそろえること！2分の1 プラス 3分の1 を計算してみよう。" },
  { startFrame: FPS * 133,endFrame: FPS * 148, text: "分母を 6 にそろえて、6分の3 プラス 6分の2 は 6分の5 になるよ！" },
  { startFrame: FPS * 148,endFrame: FPS * 150, text: "完璧！" },
  { startFrame: FPS * 150,endFrame: FPS * 165, text: "今日は分数について４つのことを学んだね！" },
  { startFrame: FPS * 165,endFrame: FPS * 178, text: "分数の意味、分母と分子、足し算、約分と通分！" },
  { startFrame: FPS * 178,endFrame: FPS * 180, text: "よくできました！" },
];

const AUDIO_DIR = path.join(__dirname, "public/audio");

async function generateAudio() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY が設定されていません");
    console.error("   実行方法: OPENAI_API_KEY=sk-xxx node generate-audio.js");
    process.exit(1);
  }

  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

  console.log(`🎙️  ${SCRIPT.length} 行の音声を生成します...\n`);

  for (let i = 0; i < SCRIPT.length; i++) {
    const line = SCRIPT[i];
    const outputPath = path.join(AUDIO_DIR, `line_${i}.mp3`);

    // すでに生成済みの場合はスキップ（--forceで強制再生成）
    if (fs.existsSync(outputPath) && !process.argv.includes("--force")) {
      console.log(`⏭️  line_${i}.mp3 スキップ（既存）`);
      continue;
    }

    const durationSec = (line.endFrame - line.startFrame) / FPS;
    console.log(`🔊 [${i + 1}/${SCRIPT.length}] line_${i}.mp3 (${durationSec}秒)`);
    console.log(`   "${line.text}"`);

    try {
      const mp3 = await client.audio.speech.create({
        model: "tts-1",
        voice: "nova",   // 明るい女性声。shimmer/alloy/echo も試せる
        input: line.text,
        speed: 1.1,      // 少し速め（子ども向けテンポ）
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
      console.log(`   ✅ 保存: ${outputPath}\n`);
    } catch (err) {
      console.error(`   ❌ エラー: ${err.message}\n`);
    }
  }

  console.log("🎉 完了！");
  console.log(`   出力フォルダ: ${AUDIO_DIR}`);
  console.log("   次のステップ: Remotion Studio で再生確認してください");
}

generateAudio();
