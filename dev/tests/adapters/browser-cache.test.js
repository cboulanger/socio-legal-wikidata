import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache, loadDirectory } from '../../../src/adapters/browser-cache.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('createCache stores and returns a value within maxAge, null when stale', () => {
  let now = 1000;
  const cache = createCache({ storage: memStorage(), now: () => now });
  cache.set('k', { a: 1 });
  assert.deepEqual(cache.get('k', 500), { a: 1 });
  now = 2000;
  assert.equal(cache.get('k', 500), null);
});

test('loadDirectory: fresh cache short-circuits the network', async () => {
  const storage = memStorage();
  const cache = createCache({ storage, now: () => 0 });
  cache.set('directory', [{ qid: 'Q1' }]);
  const out = await loadDirectory({
    cache, ttlMs: 1000, now: () => 0,
    queryDirectory: async () => { throw new Error('should not be called'); },
    fetch: async () => { throw new Error('should not be called'); },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.equal(out.stale, false);
  assert.deepEqual(out.associations, [{ qid: 'Q1' }]);
});

test('loadDirectory: live query used and cached when cache is cold', async () => {
  const storage = memStorage();
  const cache = createCache({ storage, now: () => 0 });
  const out = await loadDirectory({
    cache, ttlMs: 1000, now: () => 0,
    queryDirectory: async () => [{ qid: 'Q2' }],
    fetch: async () => { throw new Error('no'); },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.equal(out.stale, false);
  assert.deepEqual(out.associations, [{ qid: 'Q2' }]);
  assert.deepEqual(cache.get('directory', 1000), [{ qid: 'Q2' }]);
});

test('loadDirectory: an empty live result is not cached, so a later non-empty query is not shadowed', async () => {
  const storage = memStorage();
  const cache = createCache({ storage, now: () => 0 });
  const first = await loadDirectory({
    cache, ttlMs: 1000, now: () => 0,
    queryDirectory: async () => [],
    fetch: async () => { throw new Error('should not be called'); },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.deepEqual(first.associations, []);
  assert.equal(cache.get('directory', 1000), null); // must not have poisoned the cache

  const second = await loadDirectory({
    cache, ttlMs: 1000, now: () => 1, // still well within the same TTL window
    queryDirectory: async () => [{ qid: 'Q9' }],
    fetch: async () => { throw new Error('should not be called'); },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.deepEqual(second.associations, [{ qid: 'Q9' }]); // re-queried instead of reusing a stale empty cache
});

test('loadDirectory: falls back to the bundled snapshot on live failure', async () => {
  const cache = createCache({ storage: memStorage(), now: () => 0 });
  const out = await loadDirectory({
    cache, ttlMs: 1000, now: () => 1_700_000_000_000,
    queryDirectory: async () => { throw new Error('offline'); },
    fetch: async (u) => {
      assert.equal(u, 'data/snapshot.json');
      return { ok: true, json: async () => ({ generatedAt: '2026-09-01', associations: [{ qid: 'Q3' }] }) };
    },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.equal(out.stale, true);
  assert.equal(out.asOf, '2026-09-01');
  assert.deepEqual(out.associations, [{ qid: 'Q3' }]);
});
