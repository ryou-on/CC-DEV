import React from 'react';
import {Composition, Still, AbsoluteFill} from 'remotion';
import {BrandLogo} from './Logo';
import {TomoeModel3D} from './TomoeModel3D';
import {TomoeDemo, TOTAL_FRAMES} from './TomoeDemo';
import {FPS, colors} from './theme';

// ロゴ単体（透過PNG書き出し用）
const LogoStill: React.FC = () => (
  <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
    <BrandLogo scale={1.3} />
  </AbsoluteFill>
);

// 3Dアセットの三面図（正面・側面・背面）
const ModelSheet: React.FC = () => (
  <AbsoluteFill style={{background: `radial-gradient(circle at 50% 40%, ${colors.night}, ${colors.ink})`, flexDirection: 'row'}}>
    {[0, Math.PI / 2, Math.PI].map((r) => (
      <div key={r} style={{width: 640, height: 1080}}>
        <TomoeModel3D width={640} height={1080} rotation={r} camDist={4.6} camY={1.2} lookY={1.0} fx={false} />
      </div>
    ))}
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="TomoeDemo" component={TomoeDemo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Still id="Logo" component={LogoStill} width={1600} height={600} />
    <Still id="ModelSheet" component={ModelSheet} width={1920} height={1080} />
    <Composition
      id="ModelTurntable"
      component={() => (
        <AbsoluteFill style={{background: colors.ink}}>
          <TomoeModel3D width={1080} height={1080} rotation={0} />
        </AbsoluteFill>
      )}
      durationInFrames={90}
      fps={FPS}
      width={1080}
      height={1080}
    />
  </>
);
