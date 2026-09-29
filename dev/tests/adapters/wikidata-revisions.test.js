import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevisionClient, fetchLastEdits } from '../../../src/adapters/wikidata-revisions.js';

const config = { wikidataActionApi: 'https://www.wikidata.org/w/api.php' };
const page = (title, revid) => ({ title, revisions: [{ revid, user: 'U' + revid, timestamp: '2026-09-29T12:50:46Z', comment: 'c' }] });
const ok = (pages) => ({ ok: true, json: async () => ({ query: { pages } }) });

test('getLastEdit asks the Action API for one item and caches the answer', async () => {
  const urls = [];
  const fetch = async (url) => { urls.push(url); return ok([page('Q1', 11)]); };
  const client = createRevisionClient({ fetch, config });
  const a = await client.getLastEdit('Q1');
  const b = await client.getLastEdit('Q1');
  assert.equal(a.revid, 11);
  assert.deepEqual(a, b);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /prop=revisions/);
  assert.match(urls[0], /rvlimit=1/);
  assert.match(urls[0], /titles=Q1$/);
  assert.match(urls[0], /origin=\*/);
});

test('forget makes the next lookup go to the network again', async () => {
  let n = 0;
  const fetch = async () => ok([page('Q1', ++n)]);
  const client = createRevisionClient({ fetch, config });
  assert.equal((await client.getLastEdit('Q1')).revid, 1);
  client.forget('Q1');
  assert.equal((await client.getLastEdit('Q1')).revid, 2);
});

test('a network error or a bad status resolves to null instead of throwing', async () => {
  assert.equal(await createRevisionClient({ fetch: async () => { throw new Error('offline'); }, config }).getLastEdit('Q1'), null);
  assert.equal(await createRevisionClient({ fetch: async () => ({ ok: false, status: 503 }), config }).getLastEdit('Q1'), null);
});

test('fetchLastEdits batches 50 titles per request and merges the results', async () => {
  const qids = Array.from({ length: 120 }, (_, i) => 'Q' + (1000 + i));
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    const titles = decodeURIComponent(new URL(url).searchParams.get('titles')).split('|');
    return ok(titles.map((t, i) => page(t, i + 1)));
  };
  const out = await fetchLastEdits({ fetch, qids });
  assert.equal(urls.length, 3);                                    // 50 + 50 + 20
  assert.deepEqual(urls.map((u) => decodeURIComponent(new URL(u).searchParams.get('titles')).split('|').length), [50, 50, 20]);
  assert.ok(urls.every((u) => !/rvlimit/.test(u)));               // rvlimit is not allowed with several titles
  assert.equal(Object.keys(out).length, 120);
  assert.equal(out.Q1119.user, 'U20');
});

test('fetchLastEdits rejects on a failed request so the builder can keep the old values', async () => {
  await assert.rejects(() => fetchLastEdits({ fetch: async () => ({ ok: false, status: 500 }), qids: ['Q1'] }), /500/);
  assert.deepEqual(await fetchLastEdits({ fetch: async () => { throw new Error('never called'); }, qids: [] }), {});
});
