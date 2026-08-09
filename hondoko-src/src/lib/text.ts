// 検索・照合用のテキスト正規化ユーティリティ

// NFKC正規化 + 小文字化 + カタカナ→ひらがな + 記号/空白除去
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　・．.。、,:：;；'"「」『』()（）\[\]【】\-–—―~〜!！?？*＊#＃]/g, '')
}

// 2-gram Dice係数による類似度 (0〜1)
export function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0
  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) || 0) + 1)
    }
    return m
  }
  const ga = grams(na)
  const gb = grams(nb)
  let overlap = 0
  let total = 0
  for (const [g, c] of ga) {
    total += c
    const cb = gb.get(g)
    if (cb) overlap += Math.min(c, cb)
  }
  let totalB = 0
  for (const [, c] of gb) totalB += c
  return (2 * overlap) / (total + totalB)
}

// 片方がもう片方を含む場合も一致とみなすタイトル照合
export function titleMatches(a: string, b: string, threshold = 0.6): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true
  return similarity(a, b) >= threshold
}
