import { useCurrentFrame, Img, staticFile } from "remotion";

interface CharacterProps {
  talking: boolean;
  happy?: boolean;
}

export const Character: React.FC<CharacterProps> = ({ talking, happy = false }) => {
  const frame = useCurrentFrame();

  // ふわふわ上下
  const bob = Math.sin(frame * 0.07) * 5;

  // トーク中：軽くスケールパルス（喋ってる感）
  const talkPulse = talking
    ? 1 + Math.abs(Math.sin(frame * 0.4)) * 0.025
    : 1;

  // ハッピー時：少し大きく＋横揺れ
  const happyScale = happy ? 1.05 : 1;
  const sway = happy ? Math.sin(frame * 0.08) * 3 : 0;

  const scale = talkPulse * happyScale;

  return (
    <div style={{
      transform: `translateY(${bob}px) rotate(${sway}deg) scale(${scale})`,
      transformOrigin: "bottom center",
      width: 260,
      height: 300,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
    }}>
      <Img
        src={staticFile("character.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "bottom",
        }}
      />
    </div>
  );
};
