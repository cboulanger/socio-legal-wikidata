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

test('does not render the card in the list panel (it lives in the right sidebar)', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: { kind: 'association', qid: 'Q1' }, centroids, stale: false }).value;
  assert.doesNotMatch(out, /class="card"/);
  assert.match(out, /aria-current="true"/);
});

test('"Show journals" checkbox appears, unchecked by default, next to Reload data', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: null, centroids, stale: false }).value;
  assert.match(out, /data-role="show-journals"/);
  assert.doesNotMatch(out, /data-role="show-journals"[^>]*checked/);
  assert.doesNotMatch(out, /Journals<\/h3>/);
});

const journals = [
  { qid: 'Q9', label: 'ZfRS', description: '', publisherQid: 'Q1', publisherLabel: 'German Association', countryCode: 'DE', countryLabel: 'Germany' },
  { qid: 'Q10', label: 'Journal of Law and Society', description: '', publisherQid: null, publisherLabel: null, countryCode: 'GB', countryLabel: 'United Kingdom' },
];

test('when "Show journals" is checked, a "Journals" group lists every journal row', () => {
  const out = renderPanel({ associations: list, journals, showJournals: true, filter: {}, selection: null, centroids, stale: false }).value;
  assert.match(out, /checked/);
  assert.match(out, /Journals<\/h3>/);
  assert.match(out, /data-kind="journal" data-qid="Q9"/);
  assert.match(out, /data-kind="journal" data-qid="Q10"/);
});

test('the journals group is filtered by the same country filter as associations', () => {
  const out = renderPanel({ associations: list, journals, showJournals: true, filter: { countryCode: 'DE' }, selection: null, centroids, stale: false }).value;
  assert.match(out, /data-kind="journal" data-qid="Q9"/);
  assert.doesNotMatch(out, /data-kind="journal" data-qid="Q10"/);
});

test('a selected journal row gets aria-current, an association row with the same qid does not', () => {
  const out = renderPanel({
    associations: list, journals: [{ qid: 'Q1', label: 'Same-qid journal', description: '', publisherQid: null, publisherLabel: null, countryCode: null, countryLabel: null }],
    showJournals: true, filter: {}, selection: { kind: 'journal', qid: 'Q1' }, centroids, stale: false,
  }).value;
  const journalRow = out.match(/<button[^>]*data-kind="journal" data-qid="Q1"[^>]*>/)[0];
  const assocRow = out.match(/<button[^>]*data-kind="association" data-qid="Q1"[^>]*>/)[0];
  assert.match(journalRow, /aria-current="true"/);
  assert.match(assocRow, /aria-current=""/);
});
