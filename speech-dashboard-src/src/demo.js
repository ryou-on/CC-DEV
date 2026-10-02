import { TYPES } from './meta.js';
const text = ['どんな課題がありそうですか？', '初回の案内が足りないと思います。', '最初に利用者へ聞いてみましょう。', '調査の結果を共有します。', 'その方針に賛成です。', '時間が足りない点が心配です。', '来週までという理解で合っていますか？', '少し休憩しましょう。', 'では次に進みます。'];
const topics = ['歯周病の予防と口腔ケアを患者に説明します。', '感染対策と医療安全、問診の確認が必要です。', 'KJ法で課題を整理して、PDCAの行動計画を共有します。', '歯科衛生士と歯科医師で歯周病の治療方針を確認します。', 'グループワークで付箋を分類し、優先順位を決めます。', '患者の糖尿病と服薬の状況を問診で確認します。', '5Sの整理と整頓を実践し、振り返りを共有します。', '歯周病とプラーク、歯磨きの説明を練習します。'];
export const DEMO_PEOPLE = ['A', 'B', 'C', 'D'].flatMap(group => Array.from({ length: 8 }, (_, i) => ({ speaker: `${group}-${String(i + 1).padStart(2, '0')}`, room: `Room ${group}` })));
// Names, utterances and measurements are synthetic, unrelated to people in optional local photos.
export const DEMO = [1, 2, 3].flatMap(day => [0, 1, 2, 3].flatMap(round => DEMO_PEOPLE.map(({ speaker, room }, person) => ({
  id: `demo-${day}-${round}-${speaker}`, speaker, day: `Day ${day}`, room: round ? room : 'Main', session: round ? `ワーク${round}` : '全体会', status: 'demo', duration: 600, offset: 0, source: 'demo',
  utterances: Array.from({ length: round ? 4 + (person + day + round) % 4 : 2 }, (_, i) => {
    const slot = round ? person % 8 : person;
    const start = round ? i * 72 + slot * 8 : i * 290 + slot * 8;
    const duration = round ? 5 + (person + day + i) % 4 : 4 + (person + i) % 4;
    const type = (i + day + person + round) % 9;
    return { id: `u${i}`, start, end: start + duration, speechSeconds: duration, text: text[type] + topics[(person + i + round) % topics.length], analysis: { type: TYPES[type], score: [2, 2, 4, 3, 1, 2, 2, 0, 1][type], questionProbability: type === 0 ? .94 : .12, confidence: i % 5 === 0 ? .52 : .91, scoreConfidence: .9, review: i % 5 === 0, model: 'demo', rubricVersion: '1' } };
  })
}))));
