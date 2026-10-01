import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWikibaseApi } from '../../../src/adapters/wikibase-api.js';

const config = {
  wikidataActionApi: 'https://www.wikidata.org/w/api.php',
  wikibaseRestBase: 'https://www.wikidata.org/w/rest.php/wikibase/v1',
};
const ok = (body) => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });

test('getJournalEditorHistory: no P98 claims returns an empty result with no label request', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return ok({ entities: { Q1: { claims: {} } } }); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.deepEqual(await api.getJournalEditorHistory('Q1'), { history: [] });
  assert.equal(calls, 1);
});

test('getJournalEditorHistory: labels batched in one request, sorted newest-begin-first, role falls back to "editor"', async () => {
  const fetch = async (url) => {
    if (!url.includes('props=labels')) {
      return ok({ entities: { Q1: { claims: { P98: [
        { id: 'Q1$A', rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q5' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+2010-01-01T00:00:00Z' } } }], P3831: [{ datavalue: { value: { id: 'Q589298' } } }] } },
        { id: 'Q1$B', rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q9' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+2020-01-01T00:00:00Z' } } }] } },
      ] } } } });
    }
    assert.match(url, /action=wbgetentities.*props=labels/);
    const ids = new URL(url).searchParams.get('ids').split('|');
    assert.deepEqual(new Set(ids), new Set(['Q5', 'Q9', 'Q589298']));
    return ok({ entities: {
      Q5: { labels: { en: { value: 'Jane Roe' } } },
      Q9: { labels: { en: { value: 'John Doe' } } },
      Q589298: { labels: { en: { value: 'Editor-in-chief' } } },
    } });
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const result = await api.getJournalEditorHistory('Q1');
  assert.deepEqual(result.history[0], { statementId: 'Q1$B', personQid: 'Q9', personLabel: 'John Doe', roleQid: null, roleLabel: 'editor', begin: '2020-01-01', end: null });
  assert.deepEqual(result.history[1], { statementId: 'Q1$A', personQid: 'Q5', personLabel: 'Jane Roe', roleQid: 'Q589298', roleLabel: 'Editor-in-chief', begin: '2010-01-01', end: null });
});

test('getJournalDetails returns null for a missing item, and resolves the publisher label', async () => {
  const fetch = async (url) => {
    if (url.includes('ids=Q404')) return ok({ entities: {} });
    if (url.includes('ids=Q1') && !url.includes('ids=Q2')) {
      return ok({ entities: { Q1: {
        labels: { en: { value: 'Example Journal' } }, descriptions: {},
        claims: { P123: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q2' } } } }] },
      } } });
    }
    if (url.includes('ids=Q2')) return ok({ entities: { Q2: { labels: { en: { value: 'Some Society' } } } } });
    throw new Error(`unexpected url ${url}`);
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.equal(await api.getJournalDetails('Q404'), null);
  const details = await api.getJournalDetails('Q1');
  assert.equal(details.qid, 'Q1');
  assert.equal(details.labels.en, 'Example Journal');
  assert.equal(details.publisherQid, 'Q2');
  assert.equal(details.publisherLabel, 'Some Society');
});

test('getJournalDetails with no publisher does not fetch a second entity', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return ok({ entities: { Q1: { labels: {}, descriptions: {}, claims: {} } } }); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const details = await api.getJournalDetails('Q1');
  assert.equal(details.publisherQid, null);
  assert.equal(details.publisherLabel, null);
  assert.equal(calls, 1);
});

// Regression: app.js exposes these as bare references on a different object
// (`editRuntime.getJournalDetails = api.getJournalDetails`) and later calls them as
// `editRuntime.getJournalDetails(qid)` — a method call that rebinds `this` to `editRuntime`.
// Every method must therefore work even when invoked detached from `api` like this.
test('getJournalDetails and getJournalEditorHistory work when detached and called as a method on an unrelated object', async () => {
  const fetch = async () => ok({ entities: { Q1: { labels: { en: { value: 'X' } }, descriptions: {}, claims: {} } } });
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const editRuntime = { getJournalDetails: api.getJournalDetails, getJournalEditorHistory: api.getJournalEditorHistory };
  const details = await editRuntime.getJournalDetails('Q1');
  assert.equal(details.qid, 'Q1');
  assert.deepEqual(await editRuntime.getJournalEditorHistory('Q1'), { history: [] });
});
