// ブランドカラー・フォント定義（巴御前 -TOMOE-）
import {continueRender, delayRender, staticFile} from 'remotion';

// ローカルTTFを FontFace で読み込む（public/fonts は scripts-fetch-fonts.sh で取得）
const faces: [string, string, string][] = [
  ['TomoeBrush', 'YujiSyuku-Regular.ttf', '400'],
  ['TomoeMincho', 'ShipporiMinchoB1-Medium.ttf', '500'],
  ['TomoeMincho', 'ShipporiMinchoB1-ExtraBold.ttf', '800'],
  ['TomoeRoman', 'Cinzel-Regular.ttf', '400'],
  ['TomoeRoman', 'Cinzel-Bold.ttf', '700'],
];
if (typeof document !== 'undefined') {
  const handle = delayRender('fonts', {timeoutInMilliseconds: 60000});
  Promise.all(
    faces.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, {weight});
      return face.load().then((f) => (document as any).fonts.add(f));
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}

export const fonts = {
  brush: 'TomoeBrush, serif',
  mincho: 'TomoeMincho, serif',
  roman: 'TomoeRoman, serif',
};

export const colors = {
  ink: '#07060c', // 墨
  night: '#121630', // 夜藍
  vermilion: '#d8342c', // 朱
  vermilionDeep: '#8e1b17',
  silver: '#e9ebf1', // 白銀
  silverDim: '#9aa0b3',
  gold: '#c9a45a', // 金
  sakura: '#f5b8c9', // 桜
  ember: '#ff8a3d', // 火の粉
};

export const FPS = 30;
