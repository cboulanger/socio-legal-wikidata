import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyAssociation } from '../../src/core/model.js';
import { createApp } from '../../src/app.js';

function domFixture() {
  const dom = new JSDOM(`<!doctype html><div id="app">
    <div id="map"></div><aside id="panel-host"></aside>
    <label class="map-toggle"><input type="checkbox" data-role="leadership-toggle"></label>
  </div>`, { url: 'https://example.org/' });
  return dom.window;
}

const associations = [
  { ...emptyAssociation('Q1'), label: 'German Association', countryCode: 'DE', countryLabel: 'Germany' },
  { ...emptyAssociation('Q2'), label: 'Roaming body' },
];

test('createApp renders the panel rows and shows a card on row click', async () => {
  const win = domFixture();
  const fakeMap = { render() {}, focus() {} };
  await createApp({
    window: win,
    config: { cacheTtlMs: 1, centroidsUrl: 'x', snapshotUrl: 'y', tileUrl: 't', tileAttribution: 'a' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => fakeMap,
    detectMode: () => 'read',
  });

  const host = win.document.getElementById('panel-host');
  assert.match(host.innerHTML, /data-qid="Q1"/);
  assert.match(host.innerHTML, /No fixed location/);

  host.querySelector('button.row[data-qid="Q1"]').click();
  assert.match(host.innerHTML, /class="card"/);
  assert.match(host.innerHTML, /German Association/);
  assert.doesNotMatch(host.innerHTML, /data-action="edit"/); // read-only
});

test('typing in search filters the rows', async () => {
  const win = domFixture();
  await createApp({
    window: win,
    config: { cacheTtlMs: 1, centroidsUrl: 'x', snapshotUrl: 'y', tileUrl: 't', tileAttribution: 'a' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: () => 'read',
  });
  const host = win.document.getElementById('panel-host');
  const input = host.querySelector('input[data-role="search"]');
  input.value = 'roaming';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.doesNotMatch(host.innerHTML, /data-qid="Q1"/);
  assert.match(host.innerHTML, /data-qid="Q2"/);
});
