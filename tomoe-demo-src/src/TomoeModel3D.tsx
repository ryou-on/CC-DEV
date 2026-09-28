// 3Dアセット（巴御前モデル）を Remotion 上で描画するコンポーネント
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {ThreeCanvas} from '@remotion/three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {useCurrentFrame, useVideoConfig} from 'remotion';
// @ts-ignore（プレーンJSモジュール）
import {buildTomoe, buildFx} from './tomoeModel.js';

export const TomoeModel3D: React.FC<{
  width: number;
  height: number;
  rotation?: number; // Y軸回転（ラジアン）
  camDist?: number;
  camY?: number;
  lookY?: number;
  fx?: boolean;
}> = ({width, height, rotation = 0, camDist = 3.2, camY = 1.3, lookY = 1.05, fx = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const model = useMemo(() => buildTomoe(THREE), []);
  const effects = useMemo(() => buildFx(THREE), []);
  effects.update(frame / fps);
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{fov: 30, position: [0, camY, camDist], near: 0.1, far: 50}}
      onCreated={({camera, gl, scene}) => {
        camera.lookAt(0, lookY, 0);
        // 金属（白銀・金）を映えさせる環境マップ
        const pmrem = new THREE.PMREMGenerator(gl);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.55;
      }}
      gl={{antialias: true, alpha: true}}
    >
      <ambientLight intensity={0.35} color={'#8a90c0'} />
      {/* キーライト（暖色）・リム（朱）・フィル（月光） */}
      <directionalLight position={[2.5, 3.5, 3]} intensity={2.4} color={'#ffd9b8'} />
      <directionalLight position={[-3, 2, -2.5]} intensity={2.2} color={'#ff4a36'} />
      <directionalLight position={[-2, 1.5, 3]} intensity={0.7} color={'#9fb3ff'} />
      <pointLight position={[0, 0.3, 1.2]} intensity={1.2} color={'#ff7a3d'} distance={4} />
      <group rotation={[0, rotation, 0]}>
        <primitive object={model} />
      </group>
      {fx ? <primitive object={effects.group} /> : null}
    </ThreeCanvas>
  );
};
