// ブランドロゴ：三つ巴紋 + 「巴御前」筆文字 + TOMOE
import React from 'react';
import {colors, fonts} from './theme';

// 巴（コンマ形）1つ分のパス：丸い頭＋外周に沿って細くなる尾（渦巻き状）
const R = 92; // 尾の外周半径
const c = 48; // 頭の中心距離
const h = 28; // 頭の半径
const tailDeg = 160; // 尾の長さ（時計回り角度）
const taper = 1.5;
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
};
const buildTomoePath = () => {
  const parts = [`M 0 ${-(c - h)}`, `A ${h} ${h} 0 0 1 0 ${-(c + h)}`];
  // 頭の上端から外周へ滑らかに繋ぐ
  parts.push(`L ${polar(0, R)}`);
  for (let d = 4; d <= tailDeg; d += 4) parts.push(`L ${polar(d, R)}`);
  // 内側の縁：先端から頭の下端へ（半径が徐々に減る）
  for (let d = tailDeg; d >= 0; d -= 4) {
    const r = R - (R - (c - h)) * Math.pow(1 - d / tailDeg, taper);
    parts.push(`L ${polar(d, r)}`);
  }
  parts.push('Z');
  return parts.join(' ');
};
export const tomoePath = buildTomoePath();

// 三つ巴紋（単体）
export const Mitsudomoe: React.FC<{
  size: number;
  rotate?: number;
  fill?: string;
  ring?: string;
  drawProgress?: number; // 0-1：リングの描画進行
}> = ({size, rotate = 0, fill = colors.vermilion, ring = colors.silver, drawProgress = 1}) => {
  const circ = 2 * Math.PI * 112;
  return (
    <svg width={size} height={size} viewBox="-125 -125 250 250" style={{overflow: 'visible'}}>
      <defs>
        <linearGradient id="tomoeFill" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5a47" />
          <stop offset="1" stopColor={fill} />
        </linearGradient>
        <linearGradient id="ringFill" x1="-1" y1="-1" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor={ring} />
          <stop offset="1" stopColor="#8b90a3" />
        </linearGradient>
      </defs>
      <circle
        r={112}
        fill="none"
        stroke="url(#ringFill)"
        strokeWidth={7}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - drawProgress)}
        transform="rotate(-90)"
      />
      <circle r={103} fill="none" stroke={ring} strokeOpacity={0.35} strokeWidth={1.5} />
      <g transform={`rotate(${rotate})`}>
        {[0, 120, 240].map((a) => (
          <path key={a} d={tomoePath} fill={fill === colors.vermilion ? 'url(#tomoeFill)' : fill} transform={`rotate(${a})`} />
        ))}
      </g>
    </svg>
  );
};

// フルロゴ（横組み）
export const BrandLogo: React.FC<{
  scale?: number;
  crestRotate?: number;
  crestDraw?: number;
  textReveal?: number; // 0-1：文字の出現
  subReveal?: number; // 0-1：TOMOE の出現
}> = ({scale = 1, crestRotate = 0, crestDraw = 1, textReveal = 1, subReveal = 1}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 44 * scale,
        transform: `scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      <Mitsudomoe size={250} rotate={crestRotate} drawProgress={crestDraw} />
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div
          style={{
            fontFamily: fonts.brush,
            fontSize: 190,
            lineHeight: 1,
            color: colors.silver,
            letterSpacing: 6,
            textShadow: `0 0 24px rgba(216,52,44,0.55), 0 4px 0 ${colors.vermilionDeep}`,
            clipPath: `inset(0 ${(1 - textReveal) * 100}% 0 0)`,
            whiteSpace: 'nowrap',
          }}
        >
          巴御前
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            opacity: subReveal,
            transform: `translateY(${(1 - subReveal) * 12}px)`,
          }}
        >
          <span style={{width: 70, height: 2, background: colors.vermilion}} />
          <span
            style={{
              fontFamily: fonts.roman,
              fontWeight: 700,
              fontSize: 54,
              letterSpacing: 26 * subReveal + 4,
              color: colors.gold,
              paddingLeft: 26 * subReveal + 4,
            }}
          >
            TOMOE
          </span>
          <span style={{width: 70, height: 2, background: colors.vermilion}} />
        </div>
      </div>
    </div>
  );
};
