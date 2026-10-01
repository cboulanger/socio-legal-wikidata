/**
 * WritePort stand-in used only on localhost, so the edit wizard's save flow
 * (and everything that reacts to it) can be exercised without a working
 * Wikidata OAuth consumer. Never calls the real Wikidata API — logs the
 * changeset and fabricates a successful result instead.
 * @returns {import('../ports/index.js').WritePort}
 */
export function createDevWriteMock() {
  let counter = 0;
  return {
    async applyChangeSet(cs) {
      console.log('[dev] simulated Wikidata write (nothing was sent to Wikidata):', cs);
      const created = cs.ops
        .filter((op) => op.type === 'create-item')
        .map((op) => ({ ref: op.ref, qid: `Q_DEV_${++counter}` }));
      return { via: 'direct', created, diffUrls: [] };
    },
  };
}
