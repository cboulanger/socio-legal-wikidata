import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWikibaseApi } from '../../../src/adapters/wikibase-api.js';

const config = {
  wikidataActionApi: 'https://www.wikidata.org/w/api.php',
  wikibaseRestBase: 'https://www.wikidata.org/w/rest.php/wikibase/v1',
};
const REST = config.wikibaseRestBase;
const ok = (body) => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });

test('set-terms sends ONE JSON Patch for all changed names and descriptions', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return ok({}); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const res = await api.applyChangeSet({
    summary: 'socio-legal directory: update names (de)',
    ops: [{ type: 'set-terms', target: { qid: 'Q1' }, labels: { de: 'Netzwerk', pt: 'Rede' }, descriptions: { en: 'a network' } }],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${REST}/entities/items/Q1`);
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer T');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    patch: [
      { op: 'add', path: '/labels/de', value: 'Netzwerk' },
      { op: 'add', path: '/labels/pt', value: 'Rede' },
      { op: 'add', path: '/descriptions/en', value: 'a network' },
    ],
    comment: 'socio-legal directory: update names (de)',
  });
  assert.deepEqual(res.diffUrls, ['https://www.wikidata.org/wiki/Q1']);
});

test('set-terms surfaces the API error (e.g. duplicate label + description)', async () => {
  const fetch = async () => ({ ok: false, status: 400, text: async () => '{"code":"data-policy-violation"}' });
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  await assert.rejects(
    () => api.applyChangeSet({ summary: 's', ops: [{ type: 'set-terms', target: { qid: 'Q1' }, labels: { en: 'x' }, descriptions: {} }] }),
    /set-terms failed: 400.*data-policy-violation/,
  );
});

const replaceOp = { type: 'add-statement', target: { qid: 'Q1' }, property: 'P856', value: { kind: 'url', value: 'https://new.example' }, replace: true, reference: { P854: 'https://src.example' } };

test('replace: with no existing statement it POSTs a new one', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    return url.includes('?property=') ? ok({}) : ok({ id: 'Q1$NEW' });
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  await api.applyChangeSet({ summary: 's', ops: [replaceOp] });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST']);
  assert.equal(calls[1].url, `${REST}/entities/items/Q1/statements`);
});

test('replace: with exactly one existing statement it PUTs over that statement', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    return url.includes('?property=') ? ok({ P856: [{ id: 'Q1$AAA-111' }] }) : ok({ id: 'Q1$AAA-111' });
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  await api.applyChangeSet({ summary: 's', ops: [replaceOp] });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PUT']);
  assert.equal(calls[1].url, `${REST}/statements/${encodeURIComponent('Q1$AAA-111')}`);
  const body = JSON.parse(calls[1].body);
  assert.equal(body.statement.value.content, 'https://new.example');
  assert.equal(body.statement.references[0].parts[0].value.content, 'https://src.example');
});

test('replace: with several existing statements it refuses instead of guessing', async () => {
  const fetch = async (url) => (url.includes('?property=') ? ok({ P856: [{ id: 'a' }, { id: 'b' }] }) : ok({}));
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  await assert.rejects(() => api.applyChangeSet({ summary: 's', ops: [replaceOp] }), /2 values for P856.*edit that property on Wikidata/);
});

test('getOfficialLanguageCodes follows country P37 -> language P424', async () => {
  const fetch = async (url) => {
    if (url.includes('ids=Q155')) {
      return ok({ entities: { Q155: { claims: { P37: [
        { rank: 'preferred', mainsnak: { datavalue: { value: { id: 'Q5146' } } } },
        { rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q999' } } } },
      ] } } } });
    }
    assert.match(url, /ids=Q5146(&|$)/);
    return ok({ entities: { Q5146: { claims: { P424: [{ mainsnak: { datavalue: { value: 'pt' } } }] } } } });
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.deepEqual(await api.getOfficialLanguageCodes('Q155'), ['pt']);
});

test('getOfficialLanguageCodes never throws: a failed lookup means no suggestion', async () => {
  const api = createWikibaseApi({ fetch: async () => { throw new Error('offline'); }, config, getToken: async () => 'T' });
  assert.deepEqual(await api.getOfficialLanguageCodes('Q155'), []);
});

test('searchCountries restricts to instances of country and returns labelled candidates', async () => {
  const fetch = async (url) => {
    if (url.includes('list=search')) {
      assert.match(url, /haswbstatement%3AP31%3DQ6256/);
      return ok({ query: { search: [{ title: 'Q155' }] } });
    }
    return ok({ entities: { Q155: { labels: { en: { value: 'Brazil' } }, descriptions: { en: { value: 'country in South America' } } } } });
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.deepEqual(await api.searchCountries('bra'), [{ qid: 'Q155', label: 'Brazil', description: 'country in South America' }]);
});

test('set-terms also patches the full alias list per language, in the same request', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return ok({}); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  await api.applyChangeSet({ summary: 's', ops: [{ type: 'set-terms', target: { qid: 'Q1' }, labels: { pt: 'Novo' }, descriptions: {}, aliases: { pt: ['Existente', 'Velho'] } }] });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body).patch, [
    { op: 'add', path: '/labels/pt', value: 'Novo' },
    { op: 'add', path: '/aliases/pt', value: ['Existente', 'Velho'] },
  ]);
});

test('a former name is sent as a monolingual value with start/end time qualifiers and a reference', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return ok({ id: 'Q1$NEW' }); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  await api.applyChangeSet({ summary: 's', ops: [{
    type: 'add-statement', target: { qid: 'Q1' }, property: 'P1448',
    value: { kind: 'monolingual', text: 'Velho Nome', language: 'pt' },
    qualifiers: [
      { property: 'P580', value: { kind: 'time', value: '1995-01-01', precision: 9 } },
      { property: 'P582', value: { kind: 'time', value: '2010-01-01', precision: 9 } },
    ],
    reference: { P854: 'https://x.example' },
  }] });
  assert.equal(calls[0].url, `${REST}/entities/items/Q1/statements`);      // a plain POST: no replace lookup
  const st = JSON.parse(calls[0].init.body).statement;
  assert.deepEqual(st.property, { id: 'P1448' });
  assert.deepEqual(st.value, { type: 'value', content: { text: 'Velho Nome', language: 'pt' } });
  assert.deepEqual(st.qualifiers.map((q) => [q.property.id, q.value.content.time, q.value.content.precision]), [
    ['P580', '+1995-01-01T00:00:00Z', 9], ['P582', '+2010-01-01T00:00:00Z', 9],
  ]);
  assert.equal(st.references[0].parts[0].value.content, 'https://x.example');
});

test('create-item sends aliases along with the labels', async () => {
  let body;
  const fetch = async (url, init) => { body = JSON.parse(init.body); return ok({ id: 'Q9' }); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  await api.applyChangeSet({ summary: 's', ops: [{ type: 'create-item', ref: 'assoc', labels: { pt: 'Rede' }, descriptions: {}, aliases: { pt: ['Velha'] }, claims: [] }] });
  assert.deepEqual(body.item.aliases, { pt: ['Velha'] });
});
