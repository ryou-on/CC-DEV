// 巴御前 -TOMOE- 30秒 企画デモ動画（本編）
import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {S1Intro, S2Beauty, S3Slash, S3Bow, S4Contrast, S5Asset, S6Keywords, S7Sheathe, S8EndCard} from './scenes';
import {Grain} from './fx';
import {Mitsudomoe} from './Logo';
import {colors, fonts} from './theme';

export const TOTAL_FRAMES = 900; // 30秒 @30fps

// シーン構成（from/dur はフレーム。fade はクロスフェードのフレーム数、0 はハードカット）
const SCENES: {id: string; from: number; dur: number; fade: number; C: React.FC}[] = [
  {id: 'S1 導入', from: 0, dur: 120, fade: 0, C: S1Intro},
  {id: 'S2 美', from: 112, dur: 128, fade: 8, C: S2Beauty},
  {id: 'S3a 武・斬撃', from: 240, dur: 68, fade: 0, C: S3Slash},
  {id: 'S3b 武・弓', from: 306, dur: 69, fade: 0, C: S3Bow},
  {id: 'S4 対比', from: 375, dur: 75, fade: 0, C: S4Contrast},
  {id: 'S5 3Dアセット', from: 444, dur: 186, fade: 6, C: S5Asset},
  {id: 'S6 キーワード', from: 624, dur: 141, fade: 6, C: S6Keywords},
  {id: 'S7 納刀', from: 757, dur: 68, fade: 8, C: S7Sheathe},
  {id: 'S8 エンドカード', from: 817, dur: 83, fade: 8, C: S8EndCard},
];

const Fade: React.FC<{fade: number; children: React.ReactNode}> = ({fade, children}) => {
  const frame = useCurrentFrame();
  const o = fade ? interpolate(frame, [0, fade], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  return <AbsoluteFill style={{opacity: o}}>{children}</AbsoluteFill>;
};

// 右上のブランドバグ（小ロゴ）
const BrandBug: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [120, 140, 800, 817], [0, 0.75, 0.75, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', right: 60, top: 90, display: 'flex', alignItems: 'center', gap: 12, opacity: o}}>
      <Mitsudomoe size={40} rotate={frame * 0.6} />
      <div style={{fontFamily: fonts.brush, fontSize: 30, color: colors.silver}}>巴御前</div>
      <div style={{fontFamily: fonts.roman, fontSize: 14, letterSpacing: 4, color: colors.gold}}>TOMOE</div>
    </div>
  );
};

export const TomoeDemo: React.FC = () => (
  <AbsoluteFill style={{background: '#000'}}>
    {SCENES.map(({id, from, dur, fade, C}) => (
      <Sequence key={id} name={id} from={from} durationInFrames={dur}>
        <Fade fade={fade}>
          <C />
        </Fade>
      </Sequence>
    ))}
    <BrandBug />
    <Grain opacity={0.08} />
    <Audio src={staticFile('audio/bgm.wav')} volume={0.95} />
  </AbsoluteFill>
);
