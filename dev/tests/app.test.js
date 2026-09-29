import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyAssociation } from '../../src/core/model.js';
import { createApp } from '../../src/app.js';

function domFixture() {
  const dom = new JSDOM(`<!doctype html><div id="app">
    <div id="map"></div><aside id="panel-host"></aside><aside id="detail-host" hidden></aside>
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

  const detail = win.document.getElementById('detail-host');
  assert.equal(detail.hidden, true);
  host.querySelector('button.row[data-qid="Q1"]').click();
  assert.doesNotMatch(host.innerHTML, /class="card"/); // the card is in the right sidebar, not the list panel
  assert.equal(detail.hidden, false);
  assert.match(detail.innerHTML, /class="card"/);
  assert.match(detail.innerHTML, /German Association/);
  assert.doesNotMatch(detail.innerHTML, /data-action="edit"/); // read-only
});

test('the close button dismisses the selected association card', async () => {
  const win = domFixture();
  win.location.hash = '#/assoc/Q1';
  await createApp({
    window: win,
    config: { cacheTtlMs: 1, centroidsUrl: 'x', snapshotUrl: 'y', tileUrl: 't', tileAttribution: 'a' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: () => 'read',
  });
  const host = win.document.getElementById('detail-host');
  assert.ok(host.querySelector('article.card'));
  host.querySelector('[data-role="close-card"]').click();
  assert.equal(host.querySelector('article.card'), null);
  assert.equal(host.hidden, true);
  assert.equal(win.location.hash, '');
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

const settleApp = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const rev = (user, revid) => ({ revid, user, anon: false, userHidden: false, timestamp: '2026-09-29T12:50:46Z', comment: '' });

async function appWith(revisionClient, list = associations) {
  const win = domFixture();
  await createApp({
    window: win,
    config: { cacheTtlMs: 1, centroidsUrl: 'x', snapshotUrl: 'y', tileUrl: 't', tileAttribution: 'a' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations: list, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: () => 'read',
    revisionClient,
  });
  return win;
}

test('the card shows who last edited the item, once the live lookup returns', async () => {
  const asked = [];
  const win = await appWith({ getLastEdit: async (qid) => { asked.push(qid); return rev('Panyasan', 2550864341); }, forget() {} });
  win.document.querySelector('button.row[data-qid="Q1"]').click();
  await settleApp();
  const detail = win.document.getElementById('detail-host').innerHTML;
  assert.match(detail, /Last edited by/);
  assert.match(detail, /oldid=2550864341/);
  assert.deepEqual(asked, ['Q1']);
  win.document.querySelector('button.row[data-qid="Q1"]').click();      // selecting again does not ask again
  await settleApp();
  assert.deepEqual(asked, ['Q1']);
});

test('the snapshot value shows at once and is replaced by the live one', async () => {
  const list = [{ ...associations[0], lastEdit: rev('SnapshotUser', 100) }, associations[1]];
  let resolveLive;
  const win = await appWith({ getLastEdit: () => new Promise((r) => { resolveLive = () => r(rev('LiveUser', 200)); }), forget() {} }, list);
  win.document.querySelector('button.row[data-qid="Q1"]').click();
  const detail = () => win.document.getElementById('detail-host').innerHTML;
  assert.match(detail(), /SnapshotUser/);       // no waiting on the network
  resolveLive();
  await settleApp();
  assert.match(detail(), /LiveUser/);
  assert.doesNotMatch(detail(), /SnapshotUser/);
});

test('when the live lookup fails the snapshot value stays; with neither, no line is shown', async () => {
  const list = [{ ...associations[0], lastEdit: rev('SnapshotUser', 100) }, associations[1]];
  const win = await appWith({ getLastEdit: async () => null, forget() {} }, list);
  win.document.querySelector('button.row[data-qid="Q1"]').click();
  await settleApp();
  assert.match(win.document.getElementById('detail-host').innerHTML, /SnapshotUser/);
  win.document.querySelector('button.row[data-qid="Q2"]').click();
  await settleApp();
  assert.doesNotMatch(win.document.getElementById('detail-host').innerHTML, /Last edited/);
});
