// ブランドカラー・フォント定義（巴御前 -TOMOE-）
import {loadFont as loadSyuku} from '@remotion/google-fonts/YujiSyuku';
import {loadFont as loadShippori} from '@remotion/google-fonts/ShipporiMinchoB1';
import {loadFont as loadCinzel} from '@remotion/google-fonts/Cinzel';

export const fonts = {
  brush: loadSyuku('normal', {weights: ['400'], subsets: ['japanese', 'latin']}).fontFamily,
  mincho: loadShippori('normal', {weights: ['500', '800'], subsets: ['japanese', 'latin']}).fontFamily,
  roman: loadCinzel('normal', {weights: ['400', '700'], subsets: ['latin']}).fontFamily,
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
