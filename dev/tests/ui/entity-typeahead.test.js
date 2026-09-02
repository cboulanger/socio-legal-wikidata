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
