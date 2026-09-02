import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation, hasFixedLocation, deriveScope } from '../../../src/core/model.js';

test('emptyAssociation has all keys nulled and qid set', () => {
  const a = emptyAssociation('Q1');
  assert.equal(a.qid, 'Q1');
  assert.equal(a.label, '');
  assert.equal(a.seatCoord, null);
  assert.equal(a.president, null);
  assert.equal(a.journal, null);
});

test('hasFixedLocation true when seatCoord is a pair', () => {
  assert.equal(hasFixedLocation({ ...emptyAssociation('Q1'), seatCoord: [12.5, 41.9] }), true);
});

test('hasFixedLocation true when countryCode set, false when neither', () => {
  assert.equal(hasFixedLocation({ ...emptyAssociation('Q1'), countryCode: 'DE' }), true);
  assert.equal(hasFixedLocation(emptyAssociation('Q1')), false);
});

test('deriveScope: parent -> section, operating area -> regional, country -> national, else international', () => {
  const base = emptyAssociation('Q1');
  assert.equal(deriveScope({ ...base, parentQid: 'Q9' }), 'section');
  assert.equal(deriveScope({ ...base, operatingAreaQid: 'Q30' }), 'regional');
  assert.equal(deriveScope({ ...base, countryCode: 'DE' }), 'national');
  assert.equal(deriveScope(base), 'international');
});
