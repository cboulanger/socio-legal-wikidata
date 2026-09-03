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

test('clearing the country filter also clears the #/country/XX URL hash', async () => {
  const win = domFixture();
  win.location.hash = '#/country/DE';
  await createApp({
    window: win,
    config: { cacheTtlMs: 1, centroidsUrl: 'x', snapshotUrl: 'y', tileUrl: 't', tileAttribution: 'a' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: () => 'read',
  });
  const host = win.document.getElementById('panel-host');
  assert.match(host.innerHTML, /Germany/); // filter applied from the initial hash
  assert.doesNotMatch(host.innerHTML, /Roaming body/);

  host.querySelector('[data-role="clear-filter"]').click();
  assert.match(host.innerHTML, /Roaming body/); // filter cleared in the UI
  assert.equal(win.location.hash, ''); // ...and the hash must not still say #/country/DE

  // A reload-equivalent (re-reading the now-cleared hash) must not re-apply the filter.
  assert.doesNotMatch(win.location.hash, /country/);
});

test('typing in search keeps focus on the search box across re-renders', async () => {
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
  let input = host.querySelector('input[data-role="search"]');
  input.focus();
  assert.equal(win.document.activeElement, input);

  // Type character by character, like a real user — each keystroke fires its own
  // 'input' event and triggers a full re-render of the panel (mount() replaces
  // innerHTML), which would otherwise destroy and recreate the <input>, losing focus.
  for (const ch of 'roaming') {
    input.value += ch;
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    input = host.querySelector('input[data-role="search"]'); // the node was replaced
    assert.equal(win.document.activeElement, input, `lost focus after typing "${ch}"`);
  }
  assert.equal(input.value, 'roaming');
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
