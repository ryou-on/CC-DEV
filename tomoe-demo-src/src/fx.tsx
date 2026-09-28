// 映像エフェクト：火の粉・桜・フィルムグレイン・ビネット・レターボックス・閃光・斬撃線
import React from 'react';
import {AbsoluteFill, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors} from './theme';

// 火の粉（下から舞い上がる光の粒）
export const Embers: React.FC<{count?: number; seed?: string; intensity?: number; wind?: number}> = ({
  count = 70,
  seed = 'ember',
  intensity = 1,
  wind = 0.4,
}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
      {new Array(count).fill(0).map((_, i) => {
        const speed = 60 + random(`${seed}s${i}`) * 180;
        const size = 2 + random(`${seed}z${i}`) * 6;
        const x0 = random(`${seed}x${i}`) * width;
        const life = (height + 100) / speed;
        const phase = random(`${seed}p${i}`) * life;
        const tt = (t + phase) % life;
        const y = height + 40 - tt * speed;
        const x = x0 + Math.sin(tt * 2 + i) * 30 + tt * speed * wind;
        const flicker = 0.55 + 0.45 * Math.sin(t * 12 + i * 3.1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x % (width + 80) - 40,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `radial-gradient(circle, #fff3c4 0%, ${colors.ember} 45%, rgba(255,80,30,0) 75%)`,
              opacity: flicker * intensity,
              filter: `blur(${size > 6 ? 1 : 0}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// 桜の花びら（上から舞い落ちる）
export const Petals: React.FC<{count?: number; seed?: string; front?: boolean}> = ({count = 26, seed = 'petal', front = false}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {new Array(count).fill(0).map((_, i) => {
        const speed = 70 + random(`${seed}s${i}`) * 110;
        const size = (front ? 22 : 10) + random(`${seed}z${i}`) * (front ? 26 : 12);
        const life = (height + 200) / speed;
        const tt = (t + random(`${seed}p${i}`) * life) % life;
        const x = random(`${seed}x${i}`) * width - tt * speed * 0.6 + Math.sin(tt * 1.7 + i) * 60;
        const y = -80 + tt * speed;
        const rot = tt * (90 + random(`${seed}r${i}`) * 200);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: ((x % width) + width) % width,
              top: y,
              width: size,
              height: size * 0.62,
              background: `linear-gradient(135deg, #ffe3ec, ${colors.sakura} 55%, #e98aa6)`,
              borderRadius: '80% 0 80% 0',
              transform: `rotate(${rot}deg) rotateX(${rot * 1.3}deg)`,
              opacity: front ? 0.85 : 0.7,
              filter: front ? 'blur(2px)' : 'none',
              boxShadow: '0 0 6px rgba(255,160,190,0.4)',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// フィルムグレイン（事前生成ノイズをフレームごとにずらす：feTurbulence より高速）
export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.09}) => {
  const frame = useCurrentFrame();
  const ox = Math.floor(random(`gx${frame}`) * 512);
  const oy = Math.floor(random(`gy${frame}`) * 512);
  return (
    <AbsoluteFill
      style={{pointerEvents: 'none', opacity, mixBlendMode: 'overlay', backgroundImage: `url(${staticFile('look/grain.png')})`, backgroundPosition: `${ox}px ${oy}px`}}
    />
  );
};

export const Vignette: React.FC<{strength?: number}> = ({strength = 0.75}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

// シネマスコープ風の上下黒帯
export const Letterbox: React.FC<{size?: number}> = ({size = 70}) => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: size, background: '#000'}} />
    <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: size, background: '#000'}} />
  </AbsoluteFill>
);

// 白い閃光（カット頭）
export const Flash: React.FC<{at?: number; dur?: number; color?: string}> = ({at = 0, dur = 8, color = '#fff'}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 1, at + dur], [0, 0.95, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{background: color, opacity: o, pointerEvents: 'none', mixBlendMode: 'screen'}} />;
};

// 斬撃の光跡（円弧を一気に描く）
export const SlashArc: React.FC<{start: number; dur?: number; flip?: boolean}> = ({start, dur = 9, flip = false}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fade = interpolate(frame, [start + dur, start + dur + 10], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (frame < start) return null;
  const len = 2600;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', transform: flip ? 'scaleX(-1)' : undefined, mixBlendMode: 'screen'}}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080">
        <defs>
          <linearGradient id="slashG" x1="0" x2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.6" stopColor="#ffd2a8" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
          <filter id="slashBlur">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {[{w: 38, o: 0.35, f: 'url(#slashBlur)'}, {w: 10, o: 1, f: undefined}].map((s, i) => (
          <path
            key={i}
            d="M -80 860 C 500 260, 1300 120, 2000 360"
            fill="none"
            stroke="url(#slashG)"
            strokeWidth={s.w}
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - p)}
            opacity={s.o * fade}
            filter={s.f}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// 集中線（スピードライン）
export const SpeedLines: React.FC<{opacity?: number; seed?: string}> = ({opacity = 0.35, seed = 'sl'}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity, mixBlendMode: 'screen'}}>
      <svg width="1920" height="1080">
        {new Array(48).fill(0).map((_, i) => {
          const a = random(`${seed}${i}${Math.floor(frame / 2)}`) * Math.PI * 2;
          const r0 = 380 + random(`${seed}r${i}`) * 200;
          const r1 = 1300;
          return (
            <line
              key={i}
              x1={960 + Math.cos(a) * r0}
              y1={540 + Math.sin(a) * r0}
              x2={960 + Math.cos(a) * r1}
              y2={540 + Math.sin(a) * r1}
              stroke="#fff"
              strokeWidth={1 + random(`${seed}w${i}`) * 3}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
