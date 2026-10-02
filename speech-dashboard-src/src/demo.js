import { TYPES } from './meta';
const text = ['どんな課題がありそうですか？', '初回の案内が足りないと思います。', '最初に利用者へ聞いてみましょう。', '調査の結果を共有します。', 'その方針に賛成です。', '時間が足りない点が心配です。', '来週までという理解で合っていますか？', '少し休憩しましょう。', 'では次に進みます。'];
export const DEMO = [1, 2, 3].flatMap(day => ['Main', 'Room A', 'Room B'].flatMap((room, ri) => ['参加者A', '参加者B', '参加者C', '参加者D'].filter((_, i) => ri === 0 || i % 2 === ri - 1).map((speaker, si) => ({
  id: `demo-${day}-${ri}-${si}`, speaker, day: `Day ${day}`, room, session: ri === 0 ? '全体会' : 'ワーク1', status: 'demo', duration: 600, offset: 0, source: 'demo',
  utterances: Array.from({ length: 5 + day + si }, (_, i) => {
    const start = i * 48 + si * 12 + 8, duration = 8 + ((i + si + day) % 5) * 3, type = (i + day + si) % 9;
    return { id: `u${i}`, start, end: start + duration, speechSeconds: duration, text: text[type], analysis: { type: TYPES[type], score: [2, 2, 4, 3, 1, 2, 2, 0, 1][type], questionProbability: type === 0 ? 0.94 : 0.12, confidence: i % 5 === 0 ? 0.52 : 0.91, scoreConfidence: 0.9, review: i % 5 === 0, model: 'demo', rubricVersion: '1' } };
  })
}))));
