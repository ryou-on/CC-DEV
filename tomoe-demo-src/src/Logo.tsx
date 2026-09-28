// ブランドロゴ：三つ巴紋 + 「巴御前」筆文字 + TOMOE
import React from 'react';
import {colors, fonts} from './theme';

// 巴（コンマ形）1つ分のパス。R=外周半径、c=頭の中心距離、h=頭の半径
const R = 95;
const c = 55;
const h = 40;
const tailDeg = 112;
const rad = (tailDeg * Math.PI) / 180;
const tipX = R * Math.sin(rad);
const tipY = -R * Math.cos(rad);
export const tomoePath = [
  `M 0 ${-(c - h)}`, // 頭の内側の点
  `A ${h} ${h} 0 0 1 0 ${-R}`, // 頭の左側を回って外周へ
  `A ${R} ${R} 0 0 1 ${tipX.toFixed(2)} ${tipY.toFixed(2)}`, // 尾の外側（時計回り）
  `A 66 66 0 0 0 0 ${-(c - h)}`, // 尾の内側で頭へ戻る
  'Z',
].join(' ');

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
