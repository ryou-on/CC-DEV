import { LIPSYNC } from "./lipsync-data";
import { SCRIPT } from "./script";

// 指定フレームの振幅（0〜1）を返す
export function getAmplitude(frame: number): number {
  const line = SCRIPT.find(
    (s) => frame >= s.startFrame && frame < s.endFrame && s.audioIndex !== undefined
  );
  if (!line || line.audioIndex === undefined) return 0;

  const data = LIPSYNC[line.audioIndex];
  if (!data || data.length === 0) return 0;

  const localFrame = frame - line.startFrame;
  return data[Math.min(localFrame, data.length - 1)] ?? 0;
}
