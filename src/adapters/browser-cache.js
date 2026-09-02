/**
 * @typedef {import('../core/model.js').Directory} Directory
 */

/**
 * @param {{storage: Storage, now?: () => number}} deps
 * @returns {import('../ports/index.js').CachePort}
 */
export function createCache({ storage, now = () => Date.now() }) {
  return {
    get(key, maxAgeMs) {
      const raw = storage.getItem(`slw:${key}`);
      if (!raw) return null;
      try {
        const { t, v } = JSON.parse(raw);
        if (now() - t > maxAgeMs) return null;
        return v;
      } catch {
        return null;
      }
    },
    set(key, value) {
      storage.setItem(`slw:${key}`, JSON.stringify({ t: now(), v: value }));
    },
  };
}

/**
 * Cache -> live query -> bundled snapshot.
 * @param {{
 *   cache: import('../ports/index.js').CachePort,
 *   queryDirectory: () => Promise<any[]>,
 *   fetch: typeof fetch,
 *   snapshotUrl: string,
 *   ttlMs: number,
 *   now?: () => number,
 * }} deps
 * @returns {Promise<Directory>}
 */
export async function loadDirectory({ cache, queryDirectory, fetch, snapshotUrl, ttlMs, now = () => Date.now() }) {
  const cached = cache.get('directory', ttlMs);
  if (cached) return { associations: cached, stale: false, asOf: null };

  try {
    const associations = await queryDirectory();
    cache.set('directory', associations);
    return { associations, stale: false, asOf: null };
  } catch {
    const res = await fetch(snapshotUrl);
    if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`);
    const snap = await res.json();
    return { associations: snap.associations || [], stale: true, asOf: snap.generatedAt || null };
  }
}
