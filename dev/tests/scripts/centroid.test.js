import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringCentroid, featureCentroids } from '../../../scripts/build-centroids.mjs';

test('ringCentroid returns the average of a simple square ring', () => {
  const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  assert.deepEqual(ringCentroid(ring), [1, 1]);
});

test('featureCentroids keys by ISO_A2 and rounds to 4 dp', () => {
  const fc = {
    features: [{
      properties: { ISO_A2: 'de' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    }],
  };
  assert.deepEqual(featureCentroids(fc), { DE: [0.5, 0.5] });
});
