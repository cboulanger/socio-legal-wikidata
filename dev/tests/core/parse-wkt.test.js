import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoint } from '../../../src/core/parse-wkt.js';

test('parsePoint reads "Point(lon lat)" into [lon, lat] numbers', () => {
  assert.deepEqual(parsePoint('Point(12.4964 41.9028)'), [12.4964, 41.9028]);
});

test('parsePoint tolerates leading/trailing whitespace and negative values', () => {
  assert.deepEqual(parsePoint('  Point(-73.9857 40.7484)  '), [-73.9857, 40.7484]);
});

test('parsePoint returns null for anything unparseable', () => {
  assert.equal(parsePoint(''), null);
  assert.equal(parsePoint(undefined), null);
  assert.equal(parsePoint('POLYGON((0 0,1 1,1 0,0 0))'), null);
});
