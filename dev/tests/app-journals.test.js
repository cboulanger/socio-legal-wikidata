import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyAssociation } from '../../src/core/model.js';
import { createApp } from '../../src/app.js';

function win(url) {
  return new JSDOM(`<!doctype html><div id="app">
    <div id="map"></div><aside id="panel-host"></aside><aside id="detail-host" hidden></aside>
  </div>`, { url }).window;
}
const associations = [
  { ...emptyAssociation('Q1'), label: 'Body', countryCode: 'DE', countryLabel: 'Germany', journal: { qid: 'Q9', label: 'ZfRS', url: 'https://zfrs.example', issn: null } },
];

test('read mode: "Show journals" fetches once, shows the association-published journal, and a selected journal opens the journal card', async () => {
  const w = win('https://app.example/');
  let queries = 0;
  const { store } = await createApp({
    window: w,
    config: { cacheTtlMs: 1, sparqlEndpoint: 'https://wdqs.example/sparql', academicJournalQid: 'Q737498', inScopeFieldQid: 'Q847034', labelLanguages: 'en' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'read',
  });
  const host = w.document.getElementById('panel-host');
  assert.doesNotMatch(host.innerHTML, /Journals<\/h3>/);

  w.fetch = async () => { queries += 1; return { ok: true, json: async () => ({ results: { bindings: [] } }) }; };
  host.querySelector('input[data-role="show-journals"]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(queries, 1);
  assert.match(host.innerHTML, /Journals<\/h3>/);
  assert.match(host.innerHTML, /ZfRS/);

  host.querySelector('button.row[data-kind="journal"][data-qid="Q9"]').click();
  assert.deepEqual(store.getState().selection, { kind: 'journal', qid: 'Q9' });
  const detail = w.document.getElementById('detail-host');
  assert.match(detail.innerHTML, /ZfRS/);

  // unchecking and rechecking does not refetch
  host.querySelector('input[data-role="show-journals"]').click();
  host.querySelector('input[data-role="show-journals"]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(queries, 1);
});

test('#/journal/Q… selects the journal card on load', async () => {
  const w = win('https://app.example/#/journal/Q9');
  await createApp({
    window: w,
    config: { cacheTtlMs: 1, sparqlEndpoint: 'https://wdqs.example/sparql', labelLanguages: 'en' },
    centroids: {},
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'read',
  });
  assert.match(w.document.getElementById('detail-host').innerHTML, /ZfRS/);
});

test('clicking the journal link on an association card opens the journal card in-app', async () => {
  const w = win('https://app.example/');
  await createApp({
    window: w,
    config: { cacheTtlMs: 1, sparqlEndpoint: 'https://wdqs.example/sparql', labelLanguages: 'en' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'read',
  });
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  w.document.querySelector('[data-action="select-journal"]').click();
  assert.match(w.document.getElementById('detail-host').innerHTML, /ZfRS/);
  assert.doesNotMatch(w.document.getElementById('detail-host').innerHTML, /<article class="card" /); // it's the journal card, not the association one
});

function editApp(url, assocs = associations) {
  const w = win(url);
  const opened = [];
  const config = { cacheTtlMs: 1, sparqlEndpoint: 'https://wdqs.example/sparql', labelLanguages: 'en', editTrigger: 'either', editParam: 'edit' };
  const ready = createApp({
    window: w,
    config,
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations: assocs, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'edit',
    buildEditRuntime: async () => ({
      auth: { hasSession: () => true, connect: async () => {}, disconnect: async () => {} },
      getJournalDetails: async () => ({ qid: 'Q9', labels: { en: 'ZfRS' }, descriptions: {}, website: null, websiteAsOf: null, issn: null, founded: null, closed: null, openAlexId: null, publisherQid: 'Q1', publisherLabel: 'Body', classQids: [], fieldQids: [] }),
      getJournalEditorHistory: async () => ({ history: [] }),
      openWizard: (host, seed, hooks) => { opened.push({ seed, hooks }); },
    }),
  });
  return { w, opened, ready };
}

test('edit mode: "Add journal" button opens the wizard in create-journal mode', async () => {
  const { w, opened, ready } = editApp('https://app.example/?edit');
  await ready;
  w.document.querySelector('[data-role="add-journal"]').click();
  assert.equal(opened[0].seed.mode, 'create-journal');
});

test('edit mode: "Link journal" on an association card presets the publisher', async () => {
  const { w, opened, ready } = editApp('https://app.example/?edit');
  await ready;
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  w.document.querySelector('[data-action="link-journal"]').click();
  assert.equal(opened[0].seed.mode, 'create-journal');
  assert.deepEqual(opened[0].seed.journal, { publisherQid: 'Q1', publisherLabel: 'Body' });
});

test('edit mode: "Edit journal" and "Manage editors" on the journal card open the right wizard modes', async () => {
  const { w, opened, ready } = editApp('https://app.example/?edit');
  await ready;
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  w.document.querySelector('[data-action="select-journal"]').click();
  w.document.querySelector('[data-action="edit-journal"]').click();
  assert.deepEqual(opened[0].seed, { mode: 'update-journal', journal: { qid: 'Q9' } });
  w.document.querySelector('[data-action="manage-editors"]').click();
  assert.deepEqual(opened[1].seed, { mode: 'manage-journal-editors', journal: { qid: 'Q9' } });
});

test('after creating a journal it is listed under "Show journals" and selected', async () => {
  const { w, opened, ready } = editApp('https://app.example/?edit', [{ ...emptyAssociation('Q2'), label: 'No Journal Yet' }]);
  const { store } = await ready;
  w.document.querySelector('[data-role="add-journal"]').click();
  opened[0].hooks.onSaved({ created: [{ ref: 'journal', qid: 'Q500' }], diffUrls: [] }, {
    mode: 'create-journal',
    journalEntity: { qid: null, original: { labels: {}, descriptions: {} }, labels: { en: 'New Journal' }, descriptions: {}, publisherQid: null, publisherLabel: null },
  });
  assert.deepEqual(store.getState().selection, { kind: 'journal', qid: 'Q500' });
  w.document.getElementById('panel-host').querySelector('input[data-role="show-journals"]').click();
  assert.match(w.document.getElementById('panel-host').innerHTML, /New Journal/);
});
