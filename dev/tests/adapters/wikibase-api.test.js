import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWikibaseApi } from '../../../src/adapters/wikibase-api.js';

const config = {
  wikidataActionApi: 'https://www.wikidata.org/w/api.php',
  wikibaseRestBase: 'https://www.wikidata.org/w/rest.php/wikibase/v1',
};

test('searchEntities calls wbsearchentities with origin=* and maps results', async () => {
  const fetch = async (url) => {
    assert.match(url, /action=wbsearchentities/);
    assert.match(url, /search=asian\+law/);
    assert.match(url, /origin=%2A|origin=\*/);
    return { ok: true, json: async () => ({ search: [
      { id: 'Q1', label: 'Asian Law and Society Association', description: 'regional body' },
    ] }) };
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const out = await api.searchEntities('asian law', 'item');
  assert.deepEqual(out, [{ qid: 'Q1', label: 'Asian Law and Society Association', description: 'regional body' }]);
});

test('lookupByExternalId queries haswbstatement and returns candidates', async () => {
  const fetch = async (url) => {
    assert.match(url, /haswbstatement%3AP496%3D0000-0002-1825-0097|haswbstatement:P496=0000-0002-1825-0097/);
    return { ok: true, json: async () => ({ query: { search: [{ title: 'Q42' }] } }) };
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const out = await api.lookupByExternalId('P496', '0000-0002-1825-0097');
  assert.deepEqual(out.map((c) => c.qid), ['Q42']);
});

test('applyChangeSet: create-item then add-statement, refs resolved, bearer + summary sent', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/entities/items')) {
      assert.equal(init.headers.Authorization, 'Bearer T');
      const body = JSON.parse(init.body);
      assert.equal(body.item.labels.en, 'Jane Roe');
      assert.match(body.comment, /new president/);
      return { ok: true, json: async () => ({ id: 'Q999' }) };
    }
    // PATCH statements on Q100
    assert.match(url, /\/entities\/items\/Q100\/statements$/);
    const body = JSON.parse(init.body);
    assert.equal(body.statement.property.id, 'P488');
    assert.equal(body.statement.value.content, 'Q999'); // ref 'person' resolved
    return { ok: true, json: async () => ({ id: 'Q100$NEW' }) };
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const cs = { summary: 'socio-legal directory: record new president', ops: [
    { type: 'create-item', ref: 'person', labels: { en: 'Jane Roe' }, descriptions: {}, claims: [
      { property: 'P31', value: { kind: 'item', qid: 'Q5' } },
    ] },
    { type: 'add-statement', target: { qid: 'Q100' }, property: 'P488', value: { kind: 'item', ref: 'person' },
      qualifiers: [{ property: 'P580', value: { kind: 'time', value: '2026-01-01', precision: 11 } }] },
  ]};
  const res = await api.applyChangeSet(cs, 'T');
  assert.equal(res.via, 'direct');
  assert.deepEqual(res.created, [{ ref: 'person', qid: 'Q999' }]);
  assert.ok(res.diffUrls.some((u) => u.includes('Q999')));
  assert.equal(calls.length, 2);
});
