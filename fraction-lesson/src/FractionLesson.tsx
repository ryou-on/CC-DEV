import {
  useCurrentFrame,
  useVideoConfig,
  Audio,
  Sequence,
  staticFile,
} from "remotion";
import { Character } from "./Character";
import { getCurrentLine, SCRIPT, FPS } from "./script";

// 吹き出し
const SpeechBubble: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split("\n");
  return (
    <div
      style={{
        position: "relative",
        background: "white",
        borderRadius: 24,
        padding: "18px 28px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.14)",
        maxWidth: 340,
        minWidth: 260,
        border: "3px solid #FFD166",
      }}
    >
      {/* しっぽ（左向き：左側の空白エリアに向けて）*/}
      <div style={{
        position: "absolute",
        left: -22,
        top: "50%",
        transform: "translateY(-50%)",
        width: 0, height: 0,
        borderTop: "14px solid transparent",
        borderBottom: "14px solid transparent",
        borderRight: "22px solid white",
        zIndex: 2,
      }} />
      <div style={{
        position: "absolute",
        left: -27,
        top: "50%",
        transform: "translateY(-50%)",
        width: 0, height: 0,
        borderTop: "16px solid transparent",
        borderBottom: "16px solid transparent",
        borderRight: "24px solid #FFD166",
        zIndex: 1,
      }} />
      {lines.map((line, i) => (
        <p key={i} style={{
          margin: 0,
          fontSize: 22,
          fontWeight: "bold",
          color: "#2c3e50",
          fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
          lineHeight: 1.65,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}>
          {line}
        </p>
      ))}
    </div>
  );
};

export const FractionLesson: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const currentLine = getCurrentLine(frame);
  const sceneIdx = currentLine.appScene - 1;
  const isHappy = currentLine.appScene === 6 && frame >= FPS * 165;

  // 星エフェクト
  const stars = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2 + frame * 0.04;
    const r = 140 + Math.sin(frame * 0.1 + i) * 20;
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      scale: 0.7 + Math.sin(frame * 0.15 + i) * 0.35,
    };
  });

  // 右パネル背景色（シーンごとに微妙に変化）
  const panelBg = [
    "#fffef5", "#f5fff8", "#fff5f5", "#f8f5ff", "#f5fffd", "#fffef5"
  ][Math.min(sceneIdx, 5)];

  return (
    <div style={{
      width, height,
      display: "flex",
      fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
      background: "#1a1a2e", // 左側（hihahoがiframe乗せる部分）は暗めにしておく
    }}>

      {/* ======== 左側：hihahoがiframeウィジェットを乗せるエリア（空白） ======== */}
      <div style={{
        flex: 1,
        // 何も描画しない。hihahoがここにウィジェットを重ねる
      }} />

      {/* ======== 右側：キャラクターパネル ======== */}
      <div style={{
        width: 480,
        height: "100%",
        background: panelBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* 右パネル上部の装飾バー */}
        <div style={{
          width: "100%",
          height: 8,
          background: "linear-gradient(90deg, #3498db, #8e44ad)",
        }} />

        {/* シーンタイトル */}
        <div style={{
          width: "100%",
          padding: "12px 0 0",
          textAlign: "center",
        }}>
          {[
            "分数って何だろう？",
            "分母と分子",
            "同じ分母の足し算",
            "約分",
            "通分",
            "まとめ",
          ].map((t, i) => (
            sceneIdx === i && (
              <span key={i} style={{
                fontSize: 18,
                fontWeight: "bold",
                color: "#8e44ad",
                letterSpacing: "0.04em",
              }}>
                {t}
              </span>
            )
          ))}
        </div>

        {/* 吹き出し */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          padding: "0 24px 0 36px",
        }}>
          <SpeechBubble text={currentLine.text} />
        </div>

        {/* キャラクター + 星エフェクト */}
        <div style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          {isHappy && stars.map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              fontSize: 24,
              transform: `scale(${s.scale})`,
              pointerEvents: "none",
            }}>⭐</div>
          ))}
          <Character talking={currentLine.talking} happy={isHappy} />
        </div>

        {/* プログレスバー */}
        <div style={{ width: "100%", height: 8, background: "rgba(0,0,0,0.06)" }}>
          <div style={{
            height: "100%",
            width: `${(frame / (FPS * 180)) * 100}%`,
            background: "linear-gradient(90deg, #3498db, #8e44ad)",
          }} />
        </div>
      </div>

      {/* 各台詞の音声 */}
      {SCRIPT.map((line, i) => (
        <Sequence
          key={i}
          from={line.startFrame}
          durationInFrames={line.endFrame - line.startFrame}
        >
          <Audio src={staticFile(`audio/line_${i}.mp3`)} />
        </Sequence>
      ))}
    </div>
  );
};
