// テロップ：横組み（筆で払うようなワイプ）と縦組み
import React from 'react';
import {interpolate, useCurrentFrame, Easing} from 'remotion';
import {colors, fonts} from './theme';

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

export const Telop: React.FC<{
  text: string;
  sub?: string;
  from: number;
  to: number;
  size?: number;
  x?: number | string;
  y?: number | string;
  align?: 'left' | 'center' | 'right';
  font?: 'mincho' | 'brush';
  color?: string;
}> = ({text, sub, from, to, size = 64, x = '50%', y = '78%', align = 'center', font = 'mincho', color = colors.silver}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const reveal = interpolate(frame, [from, from + 16], [0, 1], {extrapolateRight: 'clamp', easing: ease});
  const out = interpolate(frame, [to - 10, to], [1, 0], {extrapolateLeft: 'clamp'});
  const tx = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(${tx}, -50%)`,
        textAlign: align,
        opacity: out,
      }}
    >
      <div
        style={{
          fontFamily: font === 'brush' ? fonts.brush : fonts.mincho,
          fontWeight: 800,
          fontSize: size,
          color,
          letterSpacing: size * 0.08,
          whiteSpace: 'nowrap',
          textShadow: '0 2px 18px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)',
          clipPath: `inset(-20% ${(1 - reveal) * 100}% -20% 0)`,
          filter: `blur(${(1 - reveal) * 6}px)`,
        }}
      >
        {text}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: fonts.roman,
            fontSize: size * 0.3,
            letterSpacing: size * 0.12,
            color: colors.gold,
            opacity: interpolate(frame, [from + 10, from + 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
            textShadow: '0 2px 10px rgba(0,0,0,0.9)',
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

// 縦組みテロップ（一文字ずつ浮かび上がる）
export const VerticalTelop: React.FC<{text: string; from: number; to: number; x: number; y: number; size?: number; stagger?: number}> = ({
  text,
  from,
  to,
  x,
  y,
  size = 72,
  stagger = 4,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const out = interpolate(frame, [to - 10, to], [1, 0], {extrapolateLeft: 'clamp'});
  return (
    <div style={{position: 'absolute', left: x, top: y, writingMode: 'vertical-rl', opacity: out}}>
      {text.split('').map((ch, i) => {
        const p = interpolate(frame, [from + i * stagger, from + i * stagger + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontFamily: fonts.mincho,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.1,
              color: colors.silver,
              opacity: p,
              transform: `translateY(${(1 - p) * -20}px)`,
              filter: `blur(${(1 - p) * 8}px)`,
              textShadow: '0 2px 16px rgba(0,0,0,0.9)',
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

// 大きな一文字（判子のように叩きつける）
export const StampKanji: React.FC<{char: string; from: number; to: number; x: number; y: number; size?: number; color?: string}> = ({
  char,
  from,
  to,
  x,
  y,
  size = 320,
  color = colors.vermilion,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const s = interpolate(frame, [from, from + 5, from + 9], [2.2, 0.94, 1], {extrapolateRight: 'clamp'});
  const o = interpolate(frame, [from, from + 3, to - 8, to], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${s})`,
        fontFamily: fonts.brush,
        fontSize: size,
        lineHeight: 1,
        color,
        opacity: o,
        textShadow: `0 0 40px rgba(216,52,44,0.6), 0 6px 0 ${colors.vermilionDeep}`,
      }}
    >
      {char}
    </div>
  );
};
