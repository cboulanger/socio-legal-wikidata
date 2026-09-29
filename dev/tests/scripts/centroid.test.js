import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringArea, poleOfInaccessibility, geometryCentre, featureCentroids } from '../../../scripts/build-centroids.mjs';

const square = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

test('ringArea is the unsigned shoelace area', () => {
  assert.equal(ringArea(square(0, 0, 2)), 4);
  assert.equal(ringArea([...square(0, 0, 2)].reverse()), 4);
});

test('poleOfInaccessibility of a square is its centre', () => {
  const [x, y] = poleOfInaccessibility([square(0, 0, 4)]);
  assert.ok(Math.abs(x - 2) < 0.01 && Math.abs(y - 2) < 0.01, `${x},${y}`);
});

test('poleOfInaccessibility stays inside a C shape where the vertex mean would not', () => {
  const c = [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]];
  const [x, y] = poleOfInaccessibility(c);
  assert.ok(x > 0 && x < 2, `x=${x} should be in the spine, not the notch`);
  assert.ok(y > 0 && y < 10);
});

test('poleOfInaccessibility avoids holes', () => {
  const [x, y] = poleOfInaccessibility([square(0, 0, 10), square(3, 3, 4).reverse()]);
  const inHole = x > 3 && x < 7 && y > 3 && y < 7;
  assert.equal(inHole, false, `${x},${y}`);
});

test('geometryCentre picks the largest polygon of a MultiPolygon', () => {
  const [lon, lat] = geometryCentre({
    type: 'MultiPolygon',
    coordinates: [[square(0, 0, 1)], [square(50, 50, 10)]],
  });
  assert.ok(lon > 50 && lon < 60 && lat > 50 && lat < 60);
});

test('featureCentroids keys by ISO_A2, falls back to ISO_A2_EH for -99, skips unknown', () => {
  const geometry = { type: 'Polygon', coordinates: [square(0, 0, 1)] };
  const out = featureCentroids({
    features: [
      { properties: { ISO_A2: 'de' }, geometry },
      { properties: { ISO_A2: '-99', ISO_A2_EH: 'FR' }, geometry },
      { properties: { ISO_A2: '-99', ISO_A2_EH: '-99' }, geometry },
    ],
  });
  assert.deepEqual(Object.keys(out), ['DE', 'FR']);
  assert.ok(Math.abs(out.DE[0] - 0.5) < 0.01 && Math.abs(out.DE[1] - 0.5) < 0.01);
});
