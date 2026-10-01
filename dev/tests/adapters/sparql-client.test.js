import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDirectoryQuery, mapBindings, queryDirectory, buildJournalQuery, mapJournalBindings, queryJournals } from '../../../src/adapters/sparql-client.js';

const cfg = { inScopeClassQid: 'Q955824', inScopeFieldQid: 'Q847034', labelLanguages: 'en,de' };

test('buildDirectoryQuery injects config and keeps the key triples', () => {
  const q = buildDirectoryQuery(cfg);
  assert.match(q, /wd:Q955824/);
  assert.match(q, /wdt:P101 wd:Q847034/);
  assert.match(q, /wdt:P159 \?seat/);
  assert.match(q, /wdt:P123 \?assoc/);
  assert.match(q, /bd:serviceParam wikibase:language "en,de"/);
});

test('buildDirectoryQuery falls back to a single-class VALUES when inScopeClassQids is absent', () => {
  const q = buildDirectoryQuery(cfg); // cfg has no inScopeClassQids
  assert.match(q, /VALUES \?class \{ wd:Q955824 \}/);
  assert.match(q, /\?assoc wdt:P31 \?class/);
});

test('buildDirectoryQuery matches every configured class directly (no P279* subclass traversal on the main class)', () => {
  const multi = { ...cfg, inScopeClassQids: ['Q955824', 'Q48204'] };
  const q = buildDirectoryQuery(multi);
  assert.match(q, /VALUES \?class \{ wd:Q955824 wd:Q48204 \}/);
  assert.match(q, /\?assoc wdt:P31 \?class \./);
  assert.doesNotMatch(q, /\?assoc wdt:P31\/wdt:P279\*/); // the slow, scope-incomplete pattern this replaced
});

test('buildDirectoryQuery excludes defunct associations and defunct association-published journals', () => {
  const q = buildDirectoryQuery(cfg);
  assert.match(q, /\?assoc wdt:P101 wd:Q847034 \.\n\s*FILTER NOT EXISTS \{ \?assoc wdt:P576 \?assocDissolved\. \}/);
  assert.match(q, /FILTER NOT EXISTS \{ \?journal wdt:P576 \?journalDissolved\. \}/);
});

test('mapBindings reduces rows to one Association per qid with nested refs', async () => {
  const json = JSON.parse(await readFile(new URL('../fixtures/sparql-directory.json', import.meta.url)));
  const list = mapBindings(json);
  assert.equal(list.length, 2);
  const rcsl = list.find(a => a.qid === 'Q2145564');
  assert.equal(rcsl.label, 'Research Committee on the Sociology of Law');
  assert.equal(rcsl.seatQid, 'Q1015907');
  assert.deepEqual(rcsl.seatCoord, [2.4102, 43.0356]);
  assert.equal(rcsl.email, 'm.kortabarria@iisj.es'); // P968 comes back as a "mailto:" URI on live Wikidata; must be stripped
  assert.equal(rcsl.president.qid, 'Q125');
  assert.equal(rcsl.president.url, 'https://example.org/guibentif');
  assert.deepEqual(rcsl.leadCoord, [-9.1533, 38.7486]);
  assert.equal(rcsl.journal.issn, '2079-5971');
  const vrug = list.find(a => a.qid === 'Q112');
  assert.equal(vrug.countryCode, 'DE');
  assert.equal(vrug.seatCoord, null);
  assert.equal(vrug.president, null);
  assert.equal(vrug.journal, null);
});

test('queryDirectory posts urlencoded query and returns mapped list', async () => {
  const json = JSON.parse(await readFile(new URL('../fixtures/sparql-directory.json', import.meta.url)));
  let seen = {};
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => json };
  };
  const list = await queryDirectory({ fetch: fakeFetch, endpoint: 'https://wdqs.example/sparql', cfg });
  assert.equal(list.length, 2);
  assert.match(seen.url, /^https:\/\/wdqs\.example\/sparql\?query=/);
  assert.equal(seen.init.headers.Accept, 'application/sparql-results+json');
});

test('queryDirectory throws on non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(
    () => queryDirectory({ fetch: fakeFetch, endpoint: 'https://x/sparql', cfg }),
    /SPARQL query failed: 503/,
  );
});

test('mapBindings keeps the parent organization website for the snapshot', () => {
  const [a] = mapBindings({ results: { bindings: [{
    assoc: { value: 'http://www.wikidata.org/entity/Q1' }, assocLabel: { value: 'Section' },
    parent: { value: 'http://www.wikidata.org/entity/Q2' }, parentLabel: { value: 'Society' },
    parentUrl: { value: 'https://society.example/' },
  }] } });
  assert.equal(a.parentUrl, 'https://society.example/');
});

test('mapBindings and the query carry the P1813 abbreviation', () => {
  assert.match(buildDirectoryQuery({ inScopeClassQid: 'Q1', inScopeFieldQid: 'Q2', labelLanguages: 'en' }), /wdt:P1813 \?abbreviation/);
  const [a] = mapBindings({ results: { bindings: [{
    assoc: { value: 'http://www.wikidata.org/entity/Q1' }, assocLabel: { value: 'Asian Law and Society Association' },
    abbreviation: { value: 'ALSA' },
  }] } });
  assert.equal(a.abbreviation, 'ALSA');
});

const journalCfg = { academicJournalQid: 'Q737498', inScopeFieldQid: 'Q847034', labelLanguages: 'en,de' };

test('buildJournalQuery injects config and keeps the key triples', () => {
  const q = buildJournalQuery(journalCfg);
  assert.match(q, /wdt:P31\/wdt:P279\* wd:Q737498/);
  assert.match(q, /wdt:P921 wd:Q847034/);
  assert.match(q, /\(wdt:P17\|wdt:P495\) \?country/);
  assert.match(q, /bd:serviceParam wikibase:language "en,de"/);
});

test('buildJournalQuery excludes defunct independent journals', () => {
  const q = buildJournalQuery(journalCfg);
  assert.match(q, /FILTER NOT EXISTS \{ \?journal wdt:P576 \?journalDissolved\. \}/);
});

test('mapJournalBindings maps one row per journal, with COALESCE-style country fallback', () => {
  const list = mapJournalBindings({ results: { bindings: [
    {
      journal: { value: 'http://www.wikidata.org/entity/Q2' }, journalLabel: { value: 'Independent Journal' },
      country: { value: 'http://www.wikidata.org/entity/Q30' }, countryLabel: { value: 'United States' }, countryCode: { value: 'us' },
    },
    {
      journal: { value: 'http://www.wikidata.org/entity/Q3' }, journalLabel: { value: 'Published Journal' },
      publisher: { value: 'http://www.wikidata.org/entity/Q1' }, publisherLabel: { value: 'Some Society' },
    },
  ] } });
  assert.equal(list.length, 2);
  const independent = list.find((j) => j.qid === 'Q2');
  assert.equal(independent.countryCode, 'US');
  assert.equal(independent.publisherQid, null);
  const published = list.find((j) => j.qid === 'Q3');
  assert.equal(published.publisherQid, 'Q1');
  assert.equal(published.countryCode, null);
});

test('queryJournals posts urlencoded query and returns mapped list', async () => {
  let seen = {};
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ results: { bindings: [] } }) };
  };
  const list = await queryJournals({ fetch: fakeFetch, endpoint: 'https://wdqs.example/sparql', cfg: journalCfg });
  assert.deepEqual(list, []);
  assert.match(seen.url, /^https:\/\/wdqs\.example\/sparql\?query=/);
  assert.equal(seen.init.headers.Accept, 'application/sparql-results+json');
});

test('queryJournals throws on non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(
    () => queryJournals({ fetch: fakeFetch, endpoint: 'https://x/sparql', cfg: journalCfg }),
    /SPARQL query failed: 503/,
  );
});
