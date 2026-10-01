import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createTypeahead } from '../../../src/ui/components/entity-typeahead.js';

function host() {
  const dom = new JSDOM('<!doctype html><div id="h"></div>');
  return dom.window.document.getElementById('h');
}
const search = async (text) => text.toLowerCase().includes('asian')
  ? [{ qid: 'Q2', label: 'Asian Law and Society Association', description: 'regional body' }]
  : [];

test('shows candidates after typing and picks one', async () => {
  const el = host();
  let picked = null;
  const ta = createTypeahead(el, { label: 'Association', searchEntities: search, onPick: (v) => { picked = v; }, allowCreate: true });
  await ta._typeForTest('asian law');
  assert.match(el.innerHTML, /Asian Law and Society Association/);
  el.querySelector('[data-pick="Q2"]').click();
  assert.deepEqual(picked, { qid: 'Q2', label: 'Asian Law and Society Association', description: 'regional body' });
});

test('the create form is hidden until "None of these" is clicked', async () => {
  const el = host();
  let createdName = null;
  const ta = createTypeahead(el, { label: 'Association', searchEntities: search, onPick: () => {}, onCreate: (name) => { createdName = name; }, allowCreate: true });
  await ta._typeForTest('brand new body');
  assert.doesNotMatch(el.innerHTML, /data-role="create-form"/);
  el.querySelector('[data-role="none-of-these"]').click();
  assert.match(el.innerHTML, /data-role="create-form"/);
  el.querySelector('[data-role="create-name"]').value = 'Brand New Body';
  el.querySelector('[data-role="create-confirm"]').click();
  assert.equal(createdName, 'Brand New Body');
});

test('allowCreate=false never shows the create affordance (e.g. universities)', async () => {
  const el = host();
  const ta = createTypeahead(el, { label: 'University', searchEntities: search, onPick: () => {}, allowCreate: false });
  await ta._typeForTest('unknown place');
  assert.doesNotMatch(el.innerHTML, /none-of-these/);
  assert.match(el.innerHTML, /not on Wikidata/);
});

test('the create affordance is hidden while real candidates are showing', async () => {
  const el = host();
  const ta = createTypeahead(el, { label: 'Association', searchEntities: search, onPick: () => {}, onCreate: () => {}, allowCreate: true });
  await ta._typeForTest('asian law'); // `search()` returns one real match for this query
  assert.match(el.innerHTML, /Asian Law and Society Association/);
  assert.doesNotMatch(el.innerHTML, /none-of-these/);
});

test('a stale search response does not overwrite a newer query\'s results', async () => {
  const el = host();
  let resolveFirst;
  const slowThenFast = async (text) => {
    if (text === 'slow query') {
      return new Promise((resolve) => { resolveFirst = () => resolve([{ qid: 'QSLOW', label: 'Slow Result', description: '' }]); });
    }
    return [{ qid: 'QFAST', label: 'Fast Result', description: '' }];
  };
  const ta = createTypeahead(el, { label: 'X', searchEntities: slowThenFast, onPick: () => {}, allowCreate: false });
  const firstSearch = ta._typeForTest('slow query'); // starts, does not resolve yet
  await ta._typeForTest('fast query'); // resolves immediately, should win
  resolveFirst(); // now let the stale first search resolve
  await firstSearch;
  assert.match(el.innerHTML, /Fast Result/);
  assert.doesNotMatch(el.innerHTML, /Slow Result/);
});

test('an optional badge is shown next to each match', async () => {
  const el = host();
  const ta = createTypeahead(el, {
    label: 'Association', searchEntities: search, onPick: () => {},
    badge: (c) => (c.qid === 'Q2' ? '✓ in directory' : ''),
  });
  await ta._typeForTest('asian law');
  assert.match(el.innerHTML, /✓ in directory/);
});

test('a person candidate with birth year, occupation and field of work shows a detail line; one with none of those shows no extra line', async () => {
  const el = host();
  const personSearch = async () => [
    { qid: 'Q1', label: 'Jane Doe', description: 'legal scholar', birthYear: '1975', occupationLabels: ['historian'], fieldLabels: ['sociology of law'] },
    { qid: 'Q2', label: 'Jane Doe', description: 'unrelated person' },
  ];
  const ta = createTypeahead(el, { label: 'Person', searchEntities: personSearch, onPick: () => {}, allowCreate: true });
  await ta._typeForTest('jane doe');
  assert.match(el.innerHTML, /typeahead__detail">b\. 1975 · historian · sociology of law</);
  const q2Button = el.querySelector('[data-pick="Q2"]');
  assert.doesNotMatch(q2Button.innerHTML, /typeahead__detail/);
});
