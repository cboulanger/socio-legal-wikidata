import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyAssociation } from '../../src/core/model.js';
import { createApp } from '../../src/app.js';

function win(url) {
  return new JSDOM(`<!doctype html><div id="app">
    <div id="map"></div><aside id="panel-host"></aside>
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
  const host = w.document.getElementById('panel-host');
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
      auth: { disconnect: async () => {} },
      openWizard: (host, seed) => { wizardMounted = true; host.innerHTML = '<section class="wizard"></section>'; },
    }),
  });
  assert.match(w.document.body.innerHTML, /Edit mode/);
  const host = w.document.getElementById('panel-host');
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  assert.match(host.innerHTML, /data-action="edit"/);
  host.querySelector('[data-action="edit"]').click();
  assert.equal(wizardMounted, true);
});
