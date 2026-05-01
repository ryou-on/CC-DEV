import { useCurrentFrame, interpolate } from "remotion";

interface CharacterProps {
  talking: boolean;
  happy?: boolean;
}

export const Character: React.FC<CharacterProps> = ({ talking, happy = false }) => {
  const frame = useCurrentFrame();

  // ふわふわ上下アニメ
  const bob = Math.sin(frame * 0.08) * 6;

  // 口パク（talking中は速く開閉）
  const mouthOpen = talking
    ? Math.abs(Math.sin(frame * 0.45)) * 18
    : 0;

  // 目のまばたき（60フレームに1回）
  const blinkCycle = frame % 90;
  const isBlinking = blinkCycle > 84;
  const eyeScaleY = isBlinking ? 0.05 : 1;

  // happy時は目が弧になる
  const eyePath = happy
    ? "M-10,0 Q0,-12 10,0"
    : null;

  // 体の揺れ
  const sway = Math.sin(frame * 0.05) * 3;

  return (
    <svg
      width="280"
      height="340"
      viewBox="0 0 280 340"
      style={{ transform: `translateY(${bob}px)` }}
    >
      {/* 影 */}
      <ellipse cx="140" cy="330" rx="60" ry="10" fill="rgba(0,0,0,0.1)" />

      {/* 体 */}
      <g transform={`translate(140,230) rotate(${sway})`}>
        {/* 胴体 */}
        <rect x="-38" y="-20" width="76" height="80" rx="20" fill="#FFD166" />
        {/* ネクタイ */}
        <polygon points="0,-8 -8,20 8,20" fill="#EF476F" opacity="0.9" />
        <rect x="-5" y="16" width="10" height="8" rx="2" fill="#EF476F" opacity="0.9" />
        {/* 左腕 */}
        <ellipse cx="-52" cy="20" rx="14" ry="26" fill="#FFD166" transform="rotate(-15,-52,20)" />
        <ellipse cx="-52" cy="44" rx="12" ry="12" fill="#FFBA5C" />
        {/* 右腕 */}
        <ellipse cx="52" cy="20" rx="14" ry="26" fill="#FFD166" transform="rotate(15,52,20)" />
        <ellipse cx="52" cy="44" rx="12" ry="12" fill="#FFBA5C" />
        {/* 左足 */}
        <ellipse cx="-20" cy="70" rx="14" ry="18" fill="#FFD166" />
        <ellipse cx="-20" cy="86" rx="16" ry="10" fill="#FFBA5C" />
        {/* 右足 */}
        <ellipse cx="20" cy="70" rx="14" ry="18" fill="#FFD166" />
        <ellipse cx="20" cy="86" rx="16" ry="10" fill="#FFBA5C" />
      </g>

      {/* 頭 */}
      <g transform={`translate(140,140) rotate(${sway * 0.5})`}>
        {/* 頭の丸 */}
        <circle cx="0" cy="0" r="72" fill="#FFD166" />
        {/* ほっぺ */}
        <ellipse cx="-46" cy="18" rx="16" ry="10" fill="#FFB3BA" opacity="0.7" />
        <ellipse cx="46" cy="18" rx="16" ry="10" fill="#FFB3BA" opacity="0.7" />

        {/* 左目 */}
        <g transform={`translate(-24,-10) scale(1,${eyeScaleY})`}>
          {eyePath ? (
            <path d={eyePath} fill="none" stroke="#333" strokeWidth="4" strokeLinecap="round" />
          ) : (
            <>
              <ellipse rx="13" ry="16" fill="white" />
              <ellipse cx="3" cy="2" rx="8" ry="9" fill="#333" />
              <ellipse cx="5" cy="-1" rx="3" ry="3" fill="white" />
            </>
          )}
        </g>

        {/* 右目 */}
        <g transform={`translate(24,-10) scale(1,${eyeScaleY})`}>
          {eyePath ? (
            <path d={eyePath} fill="none" stroke="#333" strokeWidth="4" strokeLinecap="round" />
          ) : (
            <>
              <ellipse rx="13" ry="16" fill="white" />
              <ellipse cx="3" cy="2" rx="8" ry="9" fill="#333" />
              <ellipse cx="5" cy="-1" rx="3" ry="3" fill="white" />
            </>
          )}
        </g>

        {/* 口 */}
        {happy ? (
          <path d="M-20,22 Q0,46 20,22" fill="none" stroke="#333" strokeWidth="4" strokeLinecap="round" />
        ) : (
          <ellipse cy="26" rx="18" ry={4 + mouthOpen} fill="#333" />
        )}

        {/* 卒業帽 */}
        <rect x="-50" y="-78" width="100" height="14" rx="4" fill="#333" />
        <rect x="-16" y="-92" width="32" height="16" rx="4" fill="#444" />
        <rect x="-18" y="-94" width="36" height="8" rx="2" fill="#333" />
        {/* タッセル */}
        <line x1="46" y1="-72" x2="56" y2="-50" stroke="#FFD166" strokeWidth="3" />
        <circle cx="56" cy="-46" r="5" fill="#FFD166" />
      </g>
    </svg>
  );
};
