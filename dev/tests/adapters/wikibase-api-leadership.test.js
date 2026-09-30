import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWikibaseApi } from '../../../src/adapters/wikibase-api.js';

const config = {
  wikidataActionApi: 'https://www.wikidata.org/w/api.php',
  wikibaseRestBase: 'https://www.wikidata.org/w/rest.php/wikibase/v1',
};
const ok = (body) => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });

test('getLeadershipHistory: no P488 claims returns an empty, current:null result with no label request', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return ok({ entities: { Q1: { claims: {} } } }); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.deepEqual(await api.getLeadershipHistory('Q1'), { history: [], current: null });
  assert.equal(calls, 1); // just the entity fetch, no batched label lookup
});

test('getLeadershipHistory: labels are batched in one request, sorted newest-begin-first, office falls back to "chairperson"', async () => {
  const fetch = async (url) => {
    if (url.includes('ids=Q1') && !url.includes('P31')) {
      return ok({ entities: { Q1: { claims: { P488: [
        { id: 'Q1$A', rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q5' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+1995-01-01T00:00:00Z' } } }], P3831: [{ datavalue: { value: { id: 'Q140686' } } }] } },
        { id: 'Q1$B', rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q9' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+2010-01-01T00:00:00Z' } } }] } },
      ] } } } });
    }
    assert.match(url, /action=wbgetentities.*props=labels/); // one batched label lookup, not one request per row
    const ids = new URL(url).searchParams.get('ids').split('|');
    assert.deepEqual(new Set(ids), new Set(['Q5', 'Q9', 'Q140686']));
    return ok({ entities: {
      Q5: { labels: { en: { value: 'Eva Kocher' } } },
      Q9: { labels: { en: { value: 'Old Pres' } } },
      Q140686: { labels: { en: { value: 'Chairperson' } } },
    } });
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const result = await api.getLeadershipHistory('Q1');
  assert.deepEqual(result.history[0], { statementId: 'Q1$B', personQid: 'Q9', personLabel: 'Old Pres', officeQid: null, officeLabel: 'chairperson', begin: '2010-01-01', end: null });
  assert.deepEqual(result.history[1], { statementId: 'Q1$A', personQid: 'Q5', personLabel: 'Eva Kocher', officeQid: 'Q140686', officeLabel: 'Chairperson', begin: '1995-01-01', end: null });
  assert.deepEqual(result.current, result.history[0]); // the more recently begun of the two open rows
});
