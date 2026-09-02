import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { resolveSeatPin, resolveLeadershipPin } from '../../../src/core/resolve-location.js';

const centroids = { DE: [10.45, 51.16], FR: [2.35, 46.6] };

test('resolveSeatPin prefers an explicit seat coordinate', () => {
  const a = { ...emptyAssociation('Q1'), seatCoord: [13.4, 52.5], countryCode: 'DE' };
  assert.deepEqual(resolveSeatPin(a, centroids), { coord: [13.4, 52.5], kind: 'seat' });
});

test('resolveSeatPin falls back to the country centroid', () => {
  const a = { ...emptyAssociation('Q1'), countryCode: 'DE' };
  assert.deepEqual(resolveSeatPin(a, centroids), { coord: [10.45, 51.16], kind: 'country' });
});

test('resolveSeatPin returns null when neither seat nor known country', () => {
  assert.equal(resolveSeatPin(emptyAssociation('Q1'), centroids), null);
  assert.equal(resolveSeatPin({ ...emptyAssociation('Q1'), countryCode: 'ZZ' }, centroids), null);
});

test('resolveLeadershipPin uses the president university coordinate or null', () => {
  const a = { ...emptyAssociation('Q1'), leadCoord: [114.1, 22.3], leadUniLabel: 'HKU' };
  assert.deepEqual(resolveLeadershipPin(a), { coord: [114.1, 22.3], label: 'HKU' });
  assert.equal(resolveLeadershipPin(emptyAssociation('Q1')), null);
});
