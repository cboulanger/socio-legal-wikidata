import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { renderPanel } from '../../../src/ui/directory-panel.js';

const centroids = { DE: [10.45, 51.16] };
const list = [
  { ...emptyAssociation('Q1'), label: 'German Association', countryCode: 'DE', countryLabel: 'Germany' },
  { ...emptyAssociation('Q2'), label: 'Asian Law and Society Association', seatCoord: [139.7, 35.7] },
  { ...emptyAssociation('Q3'), label: 'Commission on Legal Pluralism' },
];

test('renders one row per association plus a search box', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: null, centroids, stale: false }).value;
  assert.match(out, /type="search"/);
  assert.match(out, /data-qid="Q1"/);
  assert.match(out, /data-qid="Q2"/);
});

test('groups items with no fixed location under a heading', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: null, centroids, stale: false }).value;
  assert.match(out, /No fixed location/);
  assert.match(out, /Commission on Legal Pluralism/);
});

test('applies the country filter', () => {
  const out = renderPanel({ associations: list, filter: { countryCode: 'DE' }, selection: null, centroids, stale: false }).value;
  assert.match(out, /data-qid="Q1"/);
  assert.doesNotMatch(out, /data-qid="Q2"/);
});

test('shows the stale banner when stale', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: null, centroids, stale: true, asOf: '2026-09-01' }).value;
  assert.match(out, /saved copy from 2026-09-01/);
});

test('renders the selected association card inline', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: 'Q1', centroids, stale: false }).value;
  assert.match(out, /class="card"/);
  assert.match(out, /German Association/);
});
