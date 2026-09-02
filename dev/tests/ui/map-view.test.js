import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { toMapPins, isoOfFeature } from '../../../src/ui/map-view.js';

const centroids = { DE: [10.45, 51.16] };
const list = [
  { ...emptyAssociation('Q1'), label: 'Seat body', seatCoord: [13.4, 52.5] },
  { ...emptyAssociation('Q2'), label: 'Country body', countryCode: 'DE' },
  { ...emptyAssociation('Q3'), label: 'Roaming body' },
  { ...emptyAssociation('Q4'), label: 'Has president abroad', seatCoord: [139.7, 35.7], leadCoord: [114.1, 22.3], leadUniLabel: 'HKU' },
];

test('toMapPins produces one seat pin per located association', () => {
  const pins = toMapPins(list, { centroids, showLeadership: false });
  assert.deepEqual(pins.map((p) => p.id), ['Q1:seat', 'Q2:seat', 'Q4:seat']);
  assert.equal(pins[0].layer, 'seat');
  assert.deepEqual(pins[0].coord, [13.4, 52.5]);
});

test('toMapPins adds leadership pins only when showLeadership is true', () => {
  const off = toMapPins(list, { centroids, showLeadership: false });
  assert.equal(off.some((p) => p.layer === 'leadership'), false);
  const on = toMapPins(list, { centroids, showLeadership: true });
  const lead = on.find((p) => p.id === 'Q4:leadership');
  assert.ok(lead);
  assert.deepEqual(lead.coord, [114.1, 22.3]);
  assert.equal(lead.label, 'HKU');
});

test('isoOfFeature reads ISO_A2 case-insensitively and rejects the -99 sentinel', () => {
  assert.equal(isoOfFeature({ properties: { ISO_A2: 'de' } }), 'DE');
  assert.equal(isoOfFeature({ properties: { iso_a2: 'FR' } }), 'FR');
  assert.equal(isoOfFeature({ properties: { ISO_A2: '-99' } }), null);
});
