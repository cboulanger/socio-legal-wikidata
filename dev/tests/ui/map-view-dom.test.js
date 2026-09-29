import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { createMapView } from '../../../src/ui/map-view.js';

const require = createRequire(import.meta.url);
const d3 = require('../../../vendor/d3.min.js');

const square = (x, y, s) => [[[x, y], [x, y + s], [x + s, y + s], [x + s, y], [x, y]]];
const countriesGeojson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { ISO_A2: 'DE' }, geometry: { type: 'Polygon', coordinates: square(6, 47, 8) } },
    { type: 'Feature', properties: { ISO_A2: '-99', ISO_A2_EH: 'FR' }, geometry: { type: 'Polygon', coordinates: square(-4, 42, 10) } },
  ],
};
const pin = (id, layer, coord) => ({ id, layer, coord, label: `Label ${id}`, assocQid: id.split(':')[0] });

function setup() {
  const { window } = new JSDOM('<div id="map"></div>');
  const container = window.document.getElementById('map');
  const calls = { select: [], country: [] };
  const view = createMapView(container, {
    d3,
    countriesGeojson,
    onSelect: (q) => calls.select.push(q),
    onSelectCountry: (iso) => calls.country.push(iso),
  });
  return { container, view, calls };
}

test('draws the sphere outline and one path per country', () => {
  const { container } = setup();
  assert.equal(container.querySelectorAll('path.map-sphere').length, 1);
  const paths = container.querySelectorAll('path.map-country');
  assert.equal(paths.length, 2);
  for (const p of paths) assert.match(p.getAttribute('d'), /^M/);
});

test('clicking a country reports its ISO code, using the _EH fallback for -99', () => {
  const { container, calls } = setup();
  const [de, fr] = container.querySelectorAll('path.map-country');
  de.dispatchEvent(new de.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  fr.dispatchEvent(new fr.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(calls.country, ['DE', 'FR']);
});

test('render draws seat and leadership pins, titles them, and replaces them on re-render', () => {
  const { container, view, calls } = setup();
  view.render([pin('Q1:seat', 'seat', [13.4, 52.5]), pin('Q1:leadership', 'leadership', [114.1, 22.3])]);
  assert.equal(container.querySelectorAll('circle.pin--seat').length, 1);
  assert.equal(container.querySelectorAll('circle.pin--lead').length, 1);
  assert.equal(container.querySelector('circle.pin--seat title').textContent, 'Label Q1:seat');
  container.querySelector('circle.pin--seat').dispatchEvent(new container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(calls.select, ['Q1']);

  view.render([pin('Q2:seat', 'seat', [10, 50])]);
  assert.equal(container.querySelectorAll('circle.pin--seat').length, 1);
  assert.equal(container.querySelectorAll('circle.pin--lead').length, 0);
  assert.equal(container.querySelector('circle.pin--seat title').textContent, 'Label Q2:seat');
});

test('pins are positioned with the Equal Earth projection', () => {
  const { container, view } = setup();
  view.render([pin('Q1:seat', 'seat', [0, 0])]);
  const [x, y] = view.projection([0, 0]);
  assert.equal(container.querySelector('circle.pin--seat').getAttribute('transform'), `translate(${x},${y})`);
  // Equal Earth: the equator is a straight line and (0,0) is the map centre
  assert.ok(Math.abs(x - 480) < 1 && Math.abs(y - 240) < 1);
});
