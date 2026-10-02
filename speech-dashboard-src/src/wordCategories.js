export const CATEGORIES = {
 dental: { label: '歯科用語', dark: '#79dccc', light: '#006b60', terms: '歯科 歯周病 歯周 歯肉 歯磨き 歯ブラシ 口腔 口腔ケア 口腔衛生 う蝕 虫歯 齲蝕 プラーク 歯石 スケーリング インプラント 義歯 補綴 咬合 矯正 根管治療 歯科衛生士 歯科医師 予防歯科 フッ素 歯面清掃 定期検診' },
 medical: { label: '医療用語', dark: '#a9c9ff', light: '#2855a0', terms: '医療 患者 診療 診察 治療 予防 感染 感染対策 消毒 滅菌 衛生 診断 症状 疾患 服薬 投薬 処方 看護 医師 看護師 血圧 糖尿病 全身疾患 既往歴 問診 検査 手術 リスク 疼痛 誤嚥 バイタル インフォームドコンセント 医療安全' },
 training: { label: '研修・整理法', dark: '#ffce79', light: '#8b4c00', terms: '研修 整理法 整理 整頓 清掃 清潔 しつけ 5s kj法 pdca swot mece ロジックツリー マインドマップ ブレインストーミング ブレスト ファシリテーション 振り返り 可視化 構造化 分類 優先順位 課題 解決 改善 目標 行動計画 ワーク グループワーク フィードバック ロールプレイ 傾聴 要約 対話 合意形成 共有 学習 実践 評価 付箋' },
 general: { label: '一般語', dark: '#e0e8d1', light: '#4a5343', terms: '' }
};
const dictionary = Object.entries(CATEGORIES).flatMap(([category,entry]) => entry.terms.split(' ').filter(Boolean).map(word => [word.normalize('NFKC').toLowerCase(),category]));
export const TERM_CATEGORY = new Map(dictionary);
export const KNOWN_TERMS = [...TERM_CATEGORY.keys()].sort((a,b)=>b.length-a.length);
export const categoryFor = word => TERM_CATEGORY.get(word) || 'general';
