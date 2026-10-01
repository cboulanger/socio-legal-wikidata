import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWikibaseApi } from '../../../src/adapters/wikibase-api.js';

const config = {
  wikidataActionApi: 'https://www.wikidata.org/w/api.php',
  wikibaseRestBase: 'https://www.wikidata.org/w/rest.php/wikibase/v1',
};
const ok = (body) => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });

test('searchPersons: annotates each match with birth year, occupation and field of work, batched in two extra requests', async () => {
  let calls = 0;
  const fetch = async (url) => {
    calls += 1;
    if (url.includes('action=wbsearchentities')) {
      return ok({ search: [
        { id: 'Q1', label: 'Jane Doe', description: 'legal scholar' },
        { id: 'Q2', label: 'Jane Doe', description: 'historian' },
      ] });
    }
    if (url.includes('props=claims')) {
      const ids = new URL(url).searchParams.get('ids').split('|');
      assert.deepEqual(new Set(ids), new Set(['Q1', 'Q2']));
      return ok({ entities: {
        Q1: { claims: {
          P569: [{ rank: 'normal', mainsnak: { datavalue: { value: { time: '+1975-00-00T00:00:00Z', precision: 9 } } } }],
          P106: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q201' } } } }],
          P101: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q202' } } } }],
        } },
        Q2: { claims: {} },
      } });
    }
    if (url.includes('props=labels')) {
      const ids = new URL(url).searchParams.get('ids').split('|');
      assert.deepEqual(new Set(ids), new Set(['Q201', 'Q202']));
      return ok({ entities: {
        Q201: { labels: { en: { value: 'legal scholar' } } },
        Q202: { labels: { en: { value: 'sociology of law' } } },
      } });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const result = await api.searchPersons('Jane Doe');
  assert.equal(calls, 3); // search + one batched claims lookup + one batched labels lookup
  assert.deepEqual(result[0], {
    qid: 'Q1', label: 'Jane Doe', description: 'legal scholar',
    birthYear: '1975', occupationLabels: ['legal scholar'], fieldLabels: ['sociology of law'],
  });
  assert.deepEqual(result[1], {
    qid: 'Q2', label: 'Jane Doe', description: 'historian',
    birthYear: null, occupationLabels: [], fieldLabels: [],
  });
});

test('searchPersons: no matches skips the claims/labels lookups entirely', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return ok({ search: [] }); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.deepEqual(await api.searchPersons('nobody'), []);
  assert.equal(calls, 1);
});

test('searchPersons: a claims-lookup failure falls back to the plain search results', async () => {
  const fetch = async (url) => {
    if (url.includes('action=wbsearchentities')) return ok({ search: [{ id: 'Q1', label: 'Jane Doe', description: '' }] });
    throw new Error('network down');
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.deepEqual(await api.searchPersons('Jane Doe'), [{ qid: 'Q1', label: 'Jane Doe', description: '' }]);
});
