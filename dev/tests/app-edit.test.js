import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyAssociation } from '../../src/core/model.js';
import { createApp } from '../../src/app.js';

function win(url) {
  return new JSDOM(`<!doctype html><div id="app">
    <div id="map"></div><aside id="panel-host"></aside><aside id="detail-host" hidden></aside>
    <label class="map-toggle"><input type="checkbox" data-role="leadership-toggle"></label>
  </div>`, { url }).window;
}
const associations = [{ ...emptyAssociation('Q1'), label: 'Body', countryCode: 'DE', countryLabel: 'Germany',
  president: { qid: 'Q9', label: 'Old Pres', url: null } }];

test('in read mode there is no Edit button and no "Edit mode" badge', async () => {
  const w = win('https://app.example/');
  await createApp({
    window: w,
    config: { cacheTtlMs: 1, tileUrl: 't', tileAttribution: 'a', editTrigger: 'either', editParam: 'edit' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'read',
    buildEditRuntime: () => { throw new Error('must not build edit runtime in read mode'); },
  });
  const host = w.document.getElementById('detail-host');
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  assert.doesNotMatch(host.innerHTML, /data-action="edit"/);
  assert.doesNotMatch(w.document.body.innerHTML, /Edit mode/);
});

test('in edit mode the badge and Edit button show; clicking Edit mounts the wizard', async () => {
  const w = win('https://app.example/?edit');
  let wizardMounted = false;
  await createApp({
    window: w,
    config: { cacheTtlMs: 1, tileUrl: 't', tileAttribution: 'a', editTrigger: 'either', editParam: 'edit' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'edit',
    buildEditRuntime: async () => ({
      auth: { hasSession: () => true, connect: async () => {}, disconnect: async () => {} },
      openWizard: (host, seed) => { wizardMounted = true; host.innerHTML = '<section class="wizard"></section>'; },
    }),
  });
  assert.match(w.document.body.innerHTML, /Edit mode/);
  const host = w.document.getElementById('detail-host');
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  assert.match(host.innerHTML, /data-action="edit"/);
  assert.match(host.innerHTML, /Notify me of changes/);
  host.querySelector('[data-action="edit"]').click();
  assert.equal(wizardMounted, true);
});

test('edit mode without a session shows Connect, not Add/Leave, and wires onConnect', async () => {
  const w = win('https://app.example/?edit');
  let connectCalled = false;
  await createApp({
    window: w,
    config: { cacheTtlMs: 1, tileUrl: 't', tileAttribution: 'a', editTrigger: 'either', editParam: 'edit' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'edit',
    buildEditRuntime: async () => ({
      auth: {
        hasSession: () => false,
        connect: async () => { connectCalled = true; },
        disconnect: async () => {},
      },
      openWizard: () => {},
    }),
  });
  const chrome = w.document.getElementById('edit-chrome');
  assert.match(chrome.innerHTML, /Connect a Wikimedia account/);
  assert.doesNotMatch(chrome.innerHTML, /Add association/);
  assert.doesNotMatch(chrome.innerHTML, /Leave edit mode/);
  chrome.querySelector('[data-role="connect"]').click();
  assert.equal(connectCalled, true);
});

function editApp(url, associations2 = associations) {
  const w = win(url);
  const opened = [];
  const config = { cacheTtlMs: 1, tileUrl: 't', tileAttribution: 'a', editTrigger: 'either', editParam: 'edit', labelLanguages: 'en,de,fr,es' };
  const ready = createApp({
    window: w,
    config,
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations: associations2, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'edit',
    buildEditRuntime: async () => ({
      auth: { hasSession: () => true, connect: async () => {}, disconnect: async () => {} },
      openWizard: (host, seed, hooks) => { opened.push({ seed, hooks }); },
    }),
  });
  return { w, opened, ready };
}

test('Edit opens "Edit details" (update-field) for the selected association', async () => {
  const { w, opened, ready } = editApp('https://app.example/?edit');
  const { store } = await ready;
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  w.document.querySelector('[data-action="edit"]').click();
  assert.deepEqual(opened[0].seed, { mode: 'update-field', association: { qid: 'Q1', label: 'Body' } });
  assert.equal(store.getState().selection, 'Q1');
});

test('after Edit details is saved the card shows the new name at once (in a directory language)', async () => {
  const { w, opened, ready } = editApp('https://app.example/?edit');
  const { store } = await ready;
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  w.document.querySelector('[data-action="edit"]').click();
  opened[0].hooks.onSaved({ created: [], diffUrls: [] }, {
    mode: 'update-field',
    association: { qid: 'Q1', original: { labels: { pt: 'Corpo' }, descriptions: {} }, labels: { pt: 'Corpo', de: 'Körper' }, descriptions: {}, website: 'https://new.example', email: null },
  });
  const a = store.getState().associations.find((x) => x.qid === 'Q1');
  assert.equal(a.label, 'Körper');           // de is a directory language, pt is not
  assert.equal(a.website, 'https://new.example');
  assert.match(w.document.getElementById('detail-host').innerHTML, /Körper/);
});

test('after Add association is saved the new association is listed and selected', async () => {
  const { w, opened, ready } = editApp('https://app.example/?edit');
  const { store } = await ready;
  w.document.querySelector('[data-role="add"]').click();
  assert.deepEqual(opened[0].seed, { mode: 'create-association' });
  opened[0].hooks.onSaved({ created: [{ ref: 'assoc', qid: 'Q999' }], diffUrls: [] }, {
    mode: 'create-association',
    association: {
      qid: null, original: { labels: {}, descriptions: {} },
      labels: { pt: 'Rede', en: 'Network' }, descriptions: {}, website: null, email: null, countryLabel: 'Brazil', seatQid: null, seatLabel: null,
    },
  });
  const s = store.getState();
  assert.equal(s.selection, 'Q999');
  const added = s.associations.find((x) => x.qid === 'Q999');
  assert.equal(added.label, 'Network');
  assert.equal(added.countryLabel, 'Brazil');
  assert.match(w.document.getElementById('detail-host').innerHTML, /Network/);
});
