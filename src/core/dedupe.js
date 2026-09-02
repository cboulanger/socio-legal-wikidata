/** @param {string} s */
export function normalizeLabel(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Dice coefficient over character bigrams of the normalized strings. */
export function similarity(a, b) {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ma = bigrams(na);
  const mb = bigrams(nb);
  let overlap = 0;
  for (const [g, count] of ma) if (mb.has(g)) overlap += Math.min(count, mb.get(g));
  return (2 * overlap) / (na.length - 1 + (nb.length - 1));
}

/**
 * @param {string} query
 * @param {import('../ports/index.js').EntityCandidate[]} candidates
 * @returns {(import('../ports/index.js').EntityCandidate & {score: number})[]}
 */
export function rankCandidates(query, candidates) {
  return candidates
    .map((c) => ({ ...c, score: similarity(query, c.label) }))
    .sort((x, y) => y.score - x.score);
}

/** @param {string} query @param {import('../ports/index.js').EntityCandidate[]} candidates @param {number} threshold */
export function isLikelyDuplicate(query, candidates, threshold = 0.6) {
  return rankCandidates(query, candidates).some((c) => c.score >= threshold);
}
