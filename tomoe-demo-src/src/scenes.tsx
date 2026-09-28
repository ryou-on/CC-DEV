// 各シーン（S1〜S8）
import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Shot} from './Shot';
import {Embers, Petals, Vignette, Flash, SlashArc, SpeedLines, Letterbox} from './fx';
import {Telop, VerticalTelop, StampKanji} from './Telop';
import {BrandLogo, Mitsudomoe} from './Logo';
import {TomoeModel3D} from './TomoeModel3D';
import {colors, fonts} from './theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

// ── S1 導入：燃え盛る戦場に佇む女武者のシルエット（クレーンダウン＋プッシュイン）
export const S1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 24], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <AbsoluteFill style={{opacity: fadeIn}}>
        <Shot clip="shot1" cam={{scale: [1.18, 1.04], y: [-5, 0], origin: '48% 60%', grade: 'contrast(1.1) saturate(1.1) brightness(0.92)'}} />
        <Embers count={80} seed="s1" intensity={1.1} />
        <Petals count={18} seed="s1p" />
        <Vignette strength={0.8} />
      </AbsoluteFill>
      <Letterbox />
      <Telop text="寿永三年　近江・粟津" from={18} to={112} size={30} x={120} y={150} align="left" color={colors.gold} />
      <Telop text="炎の中に、ひとりの女武者がいた。" sub="IN THE FLAMES, A LONE WARRIOR STOOD" from={34} to={118} size={60} y="80%" />
    </AbsoluteFill>
  );
};

// ── S2 美：凛とした表情のアップ（ラックフォーカス＋ドリーイン）
export const S2Beauty: React.FC = () => (
  <AbsoluteFill>
    <Shot clip="shot2" cam={{scale: [1.06, 1.2], x: [0, 2], origin: '45% 38%', blur: [10, 0], grade: 'contrast(1.05) saturate(1.05)'}} />
    <Petals count={12} seed="s2f" front />
    <Petals count={20} seed="s2b" />
    <Vignette strength={0.7} />
    <Letterbox />
    <VerticalTelop text="透き通る美貌。" from={16} to={124} x={1640} y={170} size={70} />
    <VerticalTelop text="秘めたる純愛。" from={46} to={124} x={1520} y={290} size={70} />
    <Telop text="美 ─ BEAUTY" from={20} to={124} size={26} x={120} y={150} align="left" color={colors.sakura} font="mincho" />
  </AbsoluteFill>
);

// ── S3a 武：長刀の斬撃（シェイク＋閃光＋光跡）
export const S3Slash: React.FC = () => (
  <AbsoluteFill>
    <Shot clip="shot3" cam={{scale: [1.22, 1.05], rot: [-4, 0], origin: '55% 45%', shake: 14, grade: 'contrast(1.15) saturate(1.2)'}} />
    <SpeedLines opacity={0.25} seed="s3" />
    <SlashArc start={6} />
    <Embers count={60} seed="s3e" intensity={1.3} wind={1.2} />
    <Vignette strength={0.75} />
    <Flash at={0} dur={7} />
    <Letterbox />
    <StampKanji char="剛" from={10} to={66} x={1560} y={420} size={300} />
    <Telop text="男顔負けの太刀さばき" from={18} to={66} size={52} x={1820} y="72%" align="right" />
  </AbsoluteFill>
);

// ── S3b 武：剛弓を引き、放つ（ウィップパン → 放った瞬間にズームパンチ）
export const S3Bow: React.FC = () => {
  const frame = useCurrentFrame();
  const release = 38;
  const whip = interpolate(frame, [0, 8], [40, 0], {...clamp, easing: ease});
  const punch = interpolate(frame, [release, release + 3, release + 12], [1, 1.09, 1.03], clamp);
  const arrowX = interpolate(frame, [release, release + 10], [700, 2200], clamp);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `translateX(${whip}%) scale(${punch})`, filter: `blur(${Math.abs(whip) / 4}px)`}}>
        <Shot clip="shot4" cam={{scale: [1.12, 1.2], x: [-2, 1], origin: '40% 45%', shake: frame > release ? 10 : 0, grade: 'contrast(1.1) saturate(1.15)'}} />
      </AbsoluteFill>
      {frame >= release ? (
        <AbsoluteFill style={{mixBlendMode: 'screen'}}>
          {/* 矢の光跡 */}
          <div style={{position: 'absolute', left: arrowX - 900, top: 322, width: 900, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(255,255,255,0), #ffe0b8 70%, #fff)', boxShadow: '0 0 24px #ff9a5a'}} />
        </AbsoluteFill>
      ) : null}
      {frame >= release ? <SpeedLines opacity={interpolate(frame, [release, release + 16], [0.5, 0], clamp)} seed="s3b" /> : null}
      <Embers count={50} seed="s3be" wind={1.5} />
      <Vignette strength={0.75} />
      <Flash at={release} dur={6} color="#ffe6cc" />
      <Letterbox />
      <Telop text="剛弓、千里を射抜く。" sub="ONE RIDER, A THOUSAND FOES" from={6} to={68} size={58} y="80%" />
    </AbsoluteFill>
  );
};

// ── S4 対比：「美 × 剛」スプリット
export const S4Contrast: React.FC = () => {
  const frame = useCurrentFrame();
  const split = interpolate(frame, [0, 14], [0, 1], {...clamp, easing: ease});
  const leftPoly = `polygon(0 0, ${50 + 8 * split}% 0, ${50 - 8 * split}% 100%, 0 100%)`;
  const rightPoly = `polygon(${50 + 8 * split}% 0, 100% 0, 100% 100%, ${50 - 8 * split}% 100%)`;
  const kanji = (ch: string, x: number, delay: number, c: string) => {
    const s = spring({frame: frame - delay, fps: 30, config: {damping: 12, stiffness: 160}});
    return (
      <div style={{position: 'absolute', left: x, top: 470, transform: `translate(-50%,-50%) scale(${s})`, fontFamily: fonts.brush, fontSize: 280, color: c, textShadow: '0 10px 40px rgba(0,0,0,0.8)'}}>
        {ch}
      </div>
    );
  };
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <AbsoluteFill style={{clipPath: leftPoly}}>
        <Img src={staticFile('look/s2-closeup.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.1 + frame * 0.001}) translateX(-8%)`, filter: 'saturate(0.6) hue-rotate(-15deg) brightness(0.75)'}} />
      </AbsoluteFill>
      <AbsoluteFill style={{clipPath: rightPoly}}>
        <Img src={staticFile('look/s3-slash.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.1 + frame * 0.001}) translateX(8%)`, filter: 'saturate(1.3) brightness(0.75)'}} />
      </AbsoluteFill>
      {/* 朱の境界線 */}
      <svg width="1920" height="1080" style={{position: 'absolute'}}>
        <line x1={960 + 154 * split} y1={0} x2={960 - 154 * split} y2={1080} stroke={colors.vermilion} strokeWidth={8} strokeDasharray={1200} strokeDashoffset={1200 * (1 - split)} />
      </svg>
      <Vignette strength={0.7} />
      {kanji('美', 520, 8, colors.sakura)}
      {kanji('剛', 1400, 16, colors.vermilion)}
      <div style={{position: 'absolute', left: 960, top: 470, transform: 'translate(-50%,-50%)', fontFamily: fonts.roman, fontSize: 90, color: colors.gold, opacity: interpolate(frame, [20, 30], [0, 1], clamp)}}>×</div>
      <Telop text="美と剛——ふたつの貌を持つヒロイン" sub="BEAUTY × VALOR" from={26} to={75} size={54} y="80%" />
    </AbsoluteFill>
  );
};

// 企画プレゼン共通の背景
const PresentationBg: React.FC<{label: string; title: string}> = ({label, title}) => {
  const frame = useCurrentFrame();
  const head = interpolate(frame, [0, 18], [0, 1], {...clamp, easing: ease});
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 35% 45%, #2a1830 0%, ${colors.night} 45%, ${colors.ink} 100%)`}}>
      {/* 背景の巨大な巴紋とグリッド */}
      <div style={{position: 'absolute', right: -220, top: -160, opacity: 0.07}}>
        <Mitsudomoe size={900} rotate={frame * 0.4} fill={colors.silver} ring={colors.silver} />
      </div>
      <svg width="1920" height="1080" style={{position: 'absolute', opacity: 0.08}}>
        {new Array(20).fill(0).map((_, i) => (
          <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={1080} stroke="#fff" strokeWidth={1} />
        ))}
        {new Array(11).fill(0).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 100} x2={1920} y2={i * 100} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
      <div style={{position: 'absolute', left: 100, top: 70, opacity: head, transform: `translateX(${(1 - head) * -40}px)`}}>
        <div style={{fontFamily: fonts.roman, fontSize: 22, letterSpacing: 8, color: colors.gold}}>{label}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 8}}>
          <div style={{width: 10, height: 46, background: colors.vermilion}} />
          <div style={{fontFamily: fonts.mincho, fontWeight: 800, fontSize: 46, color: colors.silver, letterSpacing: 4}}>{title}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── S5 企画プレゼン①：キャラクターデザイン（3Dアセット展示）
const callouts = [
  {n: '01', t: '大鎧（おおよろい）', d: '白銀の胴 × 朱の威。平安末期の騎馬武者の正装', at: 22},
  {n: '02', t: '大太刀（長刀）', d: '身の丈を超える反りの刃。一振りで戦況を変える', at: 52},
  {n: '03', t: '和弓・矢筒', d: '剛弓を引き絞る遠距離戦。弓馬の道の体現', at: 82},
  {n: '04', t: 'エフェクト：桜 × 火の粉', d: '美と苛烈さを同時に描く、作品のビジュアルコード', at: 112},
];
export const S5Asset: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = interpolate(frame, [0, 10], [0, 1], clamp);
  const modelIn = spring({frame: frame - 6, fps, config: {damping: 18}});
  return (
    <AbsoluteFill style={{opacity: enter}}>
      <PresentationBg label="PROJECT PRESENTATION  01" title="キャラクターデザイン ─ 3Dアセット" />
      {/* 3Dモデル（ターンテーブル） */}
      <div style={{position: 'absolute', left: 80, top: 170, width: 960, height: 910, transform: `translateY(${(1 - modelIn) * 80}px)`, opacity: modelIn}}>
        <TomoeModel3D width={960} height={910} rotation={-0.7 + frame * 0.024} camDist={4.9} camY={1.2} lookY={0.98} />
      </div>
      <Embers count={30} seed="s5" intensity={0.6} />
      {/* コールアウト */}
      {callouts.map((c, i) => {
        const p = interpolate(frame, [c.at, c.at + 16], [0, 1], {...clamp, easing: ease});
        return (
          <div key={c.n} style={{position: 'absolute', left: 1060, top: 220 + i * 170, width: 760, opacity: p, transform: `translateX(${(1 - p) * 60}px)`}}>
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 26}}>
              <div style={{fontFamily: fonts.roman, fontWeight: 700, fontSize: 44, color: colors.vermilion, lineHeight: 1}}>{c.n}</div>
              <div style={{flex: 1}}>
                <div style={{fontFamily: fonts.mincho, fontWeight: 800, fontSize: 40, color: colors.silver}}>{c.t}</div>
                <div style={{height: 2, background: `linear-gradient(90deg, ${colors.gold}, rgba(201,164,90,0))`, margin: '12px 0', width: `${p * 100}%`}} />
                <div style={{fontFamily: fonts.mincho, fontWeight: 500, fontSize: 26, color: colors.silverDim, lineHeight: 1.5}}>{c.d}</div>
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// レーダーチャート（キャラクター能力値）
const stats = [
  {k: '武勇', v: 95},
  {k: '弓術', v: 92},
  {k: '美貌', v: 96},
  {k: '忠義', v: 100},
  {k: '機動', v: 86},
  {k: '知略', v: 74},
];
const Radar: React.FC<{p: number}> = ({p}) => {
  const R = 230;
  const cx = 300;
  const cy = 300;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / stats.length) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const poly = stats.map((s, i) => pt(i, (R * s.v * p) / 100).join(',')).join(' ');
  return (
    <svg width={600} height={600}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={stats.map((_, i) => pt(i, R * f).join(',')).join(' ')} fill="none" stroke="rgba(233,235,241,0.18)" strokeWidth={1.5} />
      ))}
      {stats.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(233,235,241,0.18)" strokeWidth={1.5} />;
      })}
      <polygon points={poly} fill="rgba(216,52,44,0.35)" stroke={colors.vermilion} strokeWidth={4} />
      {stats.map((s, i) => {
        const [x, y] = pt(i, R + 42);
        return (
          <g key={s.k}>
            <text x={x} y={y} fill={colors.silver} fontFamily={fonts.mincho} fontWeight={800} fontSize={28} textAnchor="middle" dominantBaseline="middle">
              {s.k}
            </text>
            <text x={x} y={y + 30} fill={colors.gold} fontFamily={fonts.roman} fontSize={20} textAnchor="middle" dominantBaseline="middle" opacity={p}>
              {Math.round(s.v * p)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── S6 企画プレゼン②：アニメ企画キーワード（インフォグラフィック）
const keywords = [
  {k: '一騎当千', e: 'IKKI TOUSEN', d: 'たった一騎で千の兵に匹敵する武勇。女武者の爽快なバトル', at: 8},
  {k: '愛と宿命', e: 'LOVE & DESTINY', d: '主君・木曾義仲への忠義と純愛、避けられぬ別れの物語', at: 26},
  {k: '歴史バトル', e: 'HISTORICAL BATTLE', d: '源平合戦を舞台に描く、和風ダークファンタジー・アクション', at: 44},
];
export const S6Keywords: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 8], [0, 1], clamp);
  const radarP = interpolate(frame, [50, 95], [0, 1], {...clamp, easing: ease});
  return (
    <AbsoluteFill style={{opacity: enter}}>
      <PresentationBg label="PROJECT PRESENTATION  02" title="アニメ企画キーワード" />
      {keywords.map((kw, i) => {
        const p = interpolate(frame, [kw.at, kw.at + 16], [0, 1], {...clamp, easing: ease});
        return (
          <div
            key={kw.k}
            style={{
              position: 'absolute',
              left: 100,
              top: 220 + i * 240,
              width: 1000,
              height: 200,
              display: 'flex',
              alignItems: 'center',
              gap: 36,
              padding: '0 40px',
              background: 'linear-gradient(90deg, rgba(216,52,44,0.22), rgba(18,22,48,0.2))',
              borderLeft: `8px solid ${colors.vermilion}`,
              opacity: p,
              transform: `translateX(${(1 - p) * -80}px)`,
              boxSizing: 'border-box',
            }}
          >
            <div style={{width: 110, height: 110, flexShrink: 0}}>
              <Mitsudomoe size={110} rotate={frame * 2 + i * 40} />
            </div>
            <div>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 22}}>
                <div style={{fontFamily: fonts.brush, fontSize: 84, color: colors.silver, lineHeight: 1}}>{kw.k}</div>
                <div style={{fontFamily: fonts.roman, fontSize: 20, letterSpacing: 6, color: colors.gold}}>{kw.e}</div>
              </div>
              <div style={{fontFamily: fonts.mincho, fontWeight: 500, fontSize: 26, color: colors.silverDim, marginTop: 12}}>{kw.d}</div>
            </div>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 1200, top: 200, opacity: interpolate(frame, [44, 60], [0, 1], clamp)}}>
        <div style={{fontFamily: fonts.roman, fontSize: 20, letterSpacing: 6, color: colors.gold, textAlign: 'center', marginBottom: 6}}>CHARACTER STATS</div>
        <Radar p={radarP} />
      </div>
      {/* 企画概要チップ */}
      <div style={{position: 'absolute', left: 1180, top: 900, display: 'flex', gap: 14, flexWrap: 'wrap', width: 660}}>
        {['TVアニメ 1クール想定', '和風ダークファンタジー', '源平合戦 × 純愛'].map((c, i) => {
          const p = interpolate(frame, [96 + i * 6, 108 + i * 6], [0, 1], clamp);
          return (
            <div key={c} style={{padding: '10px 22px', border: `2px solid ${colors.gold}`, color: colors.silver, fontFamily: fonts.mincho, fontWeight: 800, fontSize: 24, opacity: p, transform: `scale(${0.8 + 0.2 * p})`}}>
              {c}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── S7 結び：力強く刀を納める
export const S7Sheathe: React.FC = () => {
  const frame = useCurrentFrame();
  const glint = interpolate(frame, [48, 52, 60], [0, 1, 0], clamp);
  return (
    <AbsoluteFill>
      <Shot clip="shot5" cam={{scale: [1.16, 1.04], y: [2, 0], origin: '50% 55%', grade: 'contrast(1.05) saturate(0.95) brightness(0.95)'}} />
      <Petals count={24} seed="s7" />
      <Embers count={24} seed="s7e" intensity={0.5} />
      <Vignette strength={0.8} />
      {/* 鍔鳴りの閃き */}
      <div style={{position: 'absolute', left: 560, top: 560, width: 260, height: 260, transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,220,180,0.4) 25%, rgba(255,255,255,0) 60%)', opacity: glint, mixBlendMode: 'screen'}} />
      <Letterbox />
      <Telop text="その刃は、愛のために。" from={6} to={68} size={60} y="80%" />
    </AbsoluteFill>
  );
};

// ── S8 エンドカード：ロゴ＋ティザー
export const S8EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = interpolate(frame, [0, 8], [0, 1], clamp);
  const crestDraw = interpolate(frame, [4, 24], [0, 1], {...clamp, easing: ease});
  const crestRot = interpolate(frame, [4, 34], [-240, 0], {...clamp, easing: ease});
  const textReveal = interpolate(frame, [14, 34], [0, 1], {...clamp, easing: ease});
  const subReveal = interpolate(frame, [28, 44], [0, 1], clamp);
  const scale = spring({frame: frame - 4, fps, config: {damping: 20}}) * 0.1 + 0.9;
  const teaser = interpolate(frame, [42, 56], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: '#000', opacity: enter}}>
      <Img src={staticFile('look/keyvisual-blur.jpg')} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.1 + frame * 0.0008})`}} />
      <Embers count={70} seed="s8" intensity={0.9} />
      <Vignette strength={0.85} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: 'translateY(-60px)'}}>
        <BrandLogo scale={scale * 1.05} crestDraw={crestDraw} crestRotate={crestRot} textReveal={textReveal} subReveal={subReveal} />
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 0, right: 0, top: 780, textAlign: 'center', opacity: teaser, transform: `translateY(${(1 - teaser) * 16}px)`}}>
        <div style={{fontFamily: fonts.mincho, fontWeight: 800, fontSize: 46, color: colors.silver, letterSpacing: 12}}>TVアニメ化企画、始動。</div>
        <div style={{fontFamily: fonts.roman, fontSize: 24, color: colors.gold, letterSpacing: 18, marginTop: 18}}>COMING SOON</div>
      </div>
    </AbsoluteFill>
  );
};
