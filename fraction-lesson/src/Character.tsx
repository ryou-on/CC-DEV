import { useCurrentFrame, Img, staticFile } from "remotion";

interface CharacterProps {
  talking: boolean;
  happy?: boolean;
  amplitude?: number; // 0〜1（リップシンク用）
}

export const Character: React.FC<CharacterProps> = ({
  talking,
  happy = false,
  amplitude = 0,
}) => {
  const frame = useCurrentFrame();

  // ふわふわ上下
  const bob = Math.sin(frame * 0.07) * 5;
  // ハッピー時の横揺れ
  const sway = happy ? Math.sin(frame * 0.08) * 3 : 0;
  const scale = happy ? 1.05 : 1;

  // 口の開き具合（振幅を口の高さにマッピング）
  // 閾値0.08以下は閉じたまま（元の笑顔が見える）
  const openRatio = Math.max(0, (amplitude - 0.08) / 0.92);
  const mouthH = openRatio * 18; // 0〜18px

  return (
    <div
      style={{
        position: "relative",
        transform: `translateY(${bob}px) rotate(${sway}deg) scale(${scale})`,
        transformOrigin: "bottom center",
        width: 260,
        height: 300,
      }}
    >
      {/* キャラクター本体 */}
      <Img
        src={staticFile("character.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "bottom",
        }}
      />

      {/* 口オーバーレイ（リップシンク）
          ── 位置調整は left / top の % で変える ── */}
      {openRatio > 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "37.5%",        // ← 口の縦位置（上げたい→小さく、下げたい→大きく）
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        >
          <svg
            width="34"
            height={mouthH + 10}
            viewBox={`0 0 34 ${mouthH + 10}`}
            overflow="visible"
          >
            {/* 肌色カバー：元の笑顔の線を隠す */}
            <ellipse cx="17" cy="5" rx="15" ry="5" fill="#f0a882" />

            {/* 口の内側（暗い） */}
            <ellipse
              cx="17"
              cy={5 + mouthH * 0.45}
              rx="13"
              ry={mouthH * 0.5 + 1}
              fill="#1e0808"
            />

            {/* 歯（開き具合が大きいとき） */}
            {openRatio > 0.3 && (
              <ellipse
                cx="17"
                cy={5 + mouthH * 0.2}
                rx="11"
                ry={mouthH * 0.28}
                fill="#f0ede8"
              />
            )}

            {/* 上唇 */}
            <ellipse cx="17" cy="5" rx="15" ry="3.5" fill="#c87060" />

            {/* 下唇 */}
            <ellipse
              cx="17"
              cy={5 + mouthH}
              rx="13"
              ry="3"
              fill="#c87060"
            />
          </svg>
        </div>
      )}
    </div>
  );
};
