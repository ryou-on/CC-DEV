// 実写（動画素材）カット：Seedance クリップがあれば動画、無ければルック画像にカメラワークを付けて代替
import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {CLIPS, ClipId} from './clips';

export type Cam = {
  scale: [number, number]; // 開始→終了の拡大率
  x?: [number, number]; // 横移動（%）
  y?: [number, number]; // 縦移動（%）
  rot?: [number, number]; // 回転（deg）
  origin?: string; // transform-origin
  blur?: [number, number]; // ラックフォーカス（px）
  shake?: number; // 手ブレ量（px）
  grade?: string; // CSS filter によるカラーグレード
};

export const Shot: React.FC<{clip: ClipId; cam: Cam; ease?: (t: number) => number}> = ({clip, cam, ease = Easing.bezier(0.33, 0, 0.2, 1)}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const c = CLIPS[clip];
  const p = interpolate(frame, [0, durationInFrames - 1], [0, 1], {extrapolateRight: 'clamp', easing: ease});
  const lerp = (a?: [number, number], d = 0) => (a ? a[0] + (a[1] - a[0]) * p : d);
  const shakeX = cam.shake ? Math.sin(frame * 2.3) * cam.shake * Math.exp(-frame / 12) : 0;
  const shakeY = cam.shake ? Math.cos(frame * 3.1) * cam.shake * Math.exp(-frame / 12) : 0;
  const transform = `translate(${lerp(cam.x)}%, ${lerp(cam.y)}%) translate(${shakeX}px, ${shakeY}px) scale(${lerp(cam.scale, 1)}) rotate(${lerp(cam.rot)}deg)`;
  const filter = `${cam.grade ?? ''} blur(${lerp(cam.blur)}px)`;
  const style: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover', transform, transformOrigin: cam.origin ?? '50% 50%', filter};
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>
      {c.enabled ? (
        // Seedance 素材はカメラワーク込みなので軽いグレードのみ適用
        <OffthreadVideo src={staticFile(c.file)} startFrom={c.startFrom ?? 0} muted style={{width: '100%', height: '100%', objectFit: 'cover', filter: cam.grade}} />
      ) : (
        <Img src={staticFile(c.look)} style={style} />
      )}
    </AbsoluteFill>
  );
};
