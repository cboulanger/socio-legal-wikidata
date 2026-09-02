import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { filterAssociations, partitionByLocation } from '../../../src/core/filter.js';

const centroids = { DE: [10.45, 51.16] };
const de = { ...emptyAssociation('Q1'), label: 'German Association for Law and Society', countryCode: 'DE' };
const asia = { ...emptyAssociation('Q2'), label: 'Asian Law and Society Association', seatCoord: [139.7, 35.7] };
const roaming = { ...emptyAssociation('Q3'), label: 'Commission on Legal Pluralism' };

test('filterAssociations by countryCode', () => {
  assert.deepEqual(filterAssociations([de, asia, roaming], { countryCode: 'DE' }).map(a => a.qid), ['Q1']);
});

test('filterAssociations by case-insensitive substring on label', () => {
  assert.deepEqual(filterAssociations([de, asia, roaming], { text: 'law and society' }).map(a => a.qid), ['Q1', 'Q2']);
});

test('filterAssociations with empty criteria returns all', () => {
  assert.equal(filterAssociations([de, asia, roaming], {}).length, 3);
});

test('partitionByLocation splits mapped vs no-fixed-location', () => {
  const { mapped, unlocated } = partitionByLocation([de, asia, roaming], centroids);
  assert.deepEqual(mapped.map(a => a.qid), ['Q1', 'Q2']);
  assert.deepEqual(unlocated.map(a => a.qid), ['Q3']);
});
