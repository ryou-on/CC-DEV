// Seedance 2.5（Higgsfield）で生成した動画素材の差し替え設定
// public/clips/<id>.mp4 を置いたら enabled: true にする。false の間はルック画像＋カメラワークで代替表示
export type ClipId = 'shot1' | 'shot2' | 'shot3' | 'shot4' | 'shot5';

export const CLIPS: Record<ClipId, {enabled: boolean; file: string; look: string; startFrom?: number}> = {
  shot1: {enabled: false, file: 'clips/shot1.mp4', look: 'look/s1-silhouette.jpg'}, // 導入：燃える戦場のシルエット
  shot2: {enabled: false, file: 'clips/shot2.mp4', look: 'look/s2-closeup.jpg'}, // 美：凛とした顔のアップ
  shot3: {enabled: false, file: 'clips/shot3.mp4', look: 'look/s3-slash.jpg'}, // 武：長刀の斬撃
  shot4: {enabled: false, file: 'clips/shot4.mp4', look: 'look/s4-bow.jpg'}, // 武：剛弓を放つ
  shot5: {enabled: false, file: 'clips/shot5.mp4', look: 'look/s5-sheathe.jpg'}, // 結び：納刀
};
