import { parseLastRevision, parseLastRevisions } from '../core/revisions.js';

const DEFAULT_API = 'https://www.wikidata.org/w/api.php';
const REV_PARAMS = 'action=query&format=json&formatversion=2&origin=*&prop=revisions&rvprop=ids%7Cuser%7Ctimestamp%7Ccomment';
const BATCH = 50; // the Action API's limit on titles per request for ordinary clients

/**
 * Latest revision (who and when) of many items, 50 per request. Used by the snapshot builder.
 * Rejects if a request fails, so the caller can decide what to fall back to.
 * @param {{fetch: typeof fetch, api?: string, qids: string[]}} p
 * @returns {Promise<Object<string, import('../core/revisions.js').LastEdit>>}
 */
export async function fetchLastEdits({ fetch, api = DEFAULT_API, qids }) {
  const out = {};
  for (let i = 0; i < qids.length; i += BATCH) {
    const titles = qids.slice(i, i + BATCH).map(encodeURIComponent).join('%7C');
    const res = await fetch(`${api}?${REV_PARAMS}&titles=${titles}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`revisions request failed: ${res.status}`);
    Object.assign(out, parseLastRevisions(await res.json()));
  }
  return out;
}

/**
 * Looks up the latest revision of one item at a time, for the card. Answers are cached for the
 * session; any failure resolves to `null`, because this is a nice-to-have that must never
 * break the card it is shown on.
 * @param {{fetch: typeof fetch, config: {wikidataActionApi?: string}}} deps
 */
export function createRevisionClient({ fetch, config }) {
  const api = config.wikidataActionApi || DEFAULT_API;
  /** @type {Map<string, Promise<import('../core/revisions.js').LastEdit|null>>} */
  const cache = new Map();

  async function load(qid) {
    try {
      const res = await fetch(`${api}?${REV_PARAMS}&rvlimit=1&titles=${encodeURIComponent(qid)}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return parseLastRevision(await res.json());
    } catch {
      return null;
    }
  }

  return {
    /** @param {string} qid */
    getLastEdit(qid) {
      if (!cache.has(qid)) cache.set(qid, load(qid));
      return cache.get(qid);
    },
    /** Forget a cached answer, e.g. after this app has just edited the item. */
    forget(qid) { cache.delete(qid); },
  };
}
