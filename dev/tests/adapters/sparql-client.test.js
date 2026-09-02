import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDirectoryQuery, mapBindings, queryDirectory } from '../../../src/adapters/sparql-client.js';

const cfg = { inScopeClassQid: 'Q955824', inScopeFieldQid: 'Q2734663', labelLanguages: 'en,de' };

test('buildDirectoryQuery injects config and keeps the key triples', () => {
  const q = buildDirectoryQuery(cfg);
  assert.match(q, /wd:Q955824/);
  assert.match(q, /wdt:P101 wd:Q2734663/);
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
