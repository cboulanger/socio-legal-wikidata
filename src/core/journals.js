/**
 * @typedef {import('./model.js').Association} Association
 * @typedef {import('./model.js').Journal} Journal
 */

/**
 * Pool A: every association's own journal (already fetched for free in the main directory
 * query), reshaped into a `Journal` list row. The country is inherited from the publishing
 * association, since the journal item itself essentially never carries its own P17/P495 —
 * this is what lets "Show journals" + an active country filter find it.
 * @param {Association[]} associations
 * @returns {Journal[]}
 */
export function publishedJournalsFrom(associations) {
  return associations
    .filter((a) => a.journal)
    .map((a) => ({
      qid: a.journal.qid,
      label: a.journal.label,
      description: '',
      publisherQid: a.qid,
      publisherLabel: a.label,
      countryCode: a.countryCode,
      countryLabel: a.countryLabel,
    }));
}

/**
 * Union of pool A (association-published, built fresh from the current associations list)
 * and pool B (independent socio-legal journals, fetched once per session), deduped by qid.
 * On overlap, pool B's own fields win, EXCEPT: if pool B's row has no countryCode of its
 * own, pool A's (the publisher-inherited one) is kept.
 * @param {Journal[]} poolA
 * @param {Journal[]} poolB
 * @returns {Journal[]}
 */
export function mergeJournals(poolA, poolB) {
  const byQid = new Map(poolA.map((j) => [j.qid, j]));
  for (const b of poolB) {
    const a = byQid.get(b.qid);
    byQid.set(b.qid, a && !b.countryCode ? { ...b, countryCode: a.countryCode, countryLabel: a.countryLabel } : b);
  }
  return [...byQid.values()].sort((x, y) => x.label.localeCompare(y.label));
}
