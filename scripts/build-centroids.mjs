#!/usr/bin/env node
// Derive data/centroids.json (ISO alpha-2 -> [lon,lat]) from a Natural Earth
// countries GeoJSON. Each point is the "pole of inaccessibility" (visual centre)
// of the country's largest polygon, so it always lies inside the country — an
// average of vertices can land in the sea for crescent or exclave-heavy shapes.
// Usage:
//   node scripts/build-centroids.mjs path/to/ne_110m_admin_0_countries.geojson
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Shoelace area of a ring (unsigned, planar). @param {number[][]} ring */
export function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum) / 2;
}

/** Signed distance from a point to a polygon's edges: positive inside, negative outside. */
function pointToPolygonDist(x, y, polygon) {
  let inside = false;
  let minDistSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      let px = ax;
      let py = ay;
      let dx = bx - px;
      let dy = by - py;
      if (dx !== 0 || dy !== 0) {
        const t = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy)));
        px += dx * t;
        py += dy * t;
      }
      dx = x - px;
      dy = y - py;
      minDistSq = Math.min(minDistSq, dx * dx + dy * dy);
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

/**
 * Pole of inaccessibility (Mapbox "polylabel" algorithm): the interior point
 * farthest from any edge. Coordinates are treated as planar.
 * @param {number[][][]} polygon outer ring followed by hole rings
 * @param {number} [precision]
 * @returns {[number,number]}
 */
export function poleOfInaccessibility(polygon, precision = 1e-3) {
  const xs = polygon[0].map((p) => p[0]);
  const ys = polygon[0].map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const size = Math.min(maxX - minX, maxY - minY);
  if (size === 0) return [minX, minY];

  const mkCell = (x, y, h) => {
    const d = pointToPolygonDist(x, y, polygon);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const h0 = size / 2;
  const queue = [];
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) queue.push(mkCell(x + h0, y + h0, h0));
  }
  let best = mkCell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  for (const c of queue) if (c.d > best.d) best = c;

  while (queue.length) {
    queue.sort((a, b) => a.max - b.max);
    const cell = queue.pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const h = cell.h / 2;
    queue.push(
      mkCell(cell.x - h, cell.y - h, h), mkCell(cell.x + h, cell.y - h, h),
      mkCell(cell.x - h, cell.y + h, h), mkCell(cell.x + h, cell.y + h, h),
    );
  }
  return [best.x, best.y];
}

/**
 * Visual centre of the largest polygon of a (Multi)Polygon geometry, in lon/lat.
 * Longitudes are scaled by cos(latitude) first so "farthest from the edge" is
 * measured roughly isotropically instead of being stretched at high latitudes.
 * @param {any} geometry @returns {[number,number]|null}
 */
export function geometryCentre(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates
    : [];
  if (!polygons.length) return null;
  const largest = polygons.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
  const lats = largest[0].map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const scale = Math.max(0.05, Math.cos((midLat * Math.PI) / 180));
  const flat = largest.map((ring) => ring.map(([lon, lat]) => [lon * scale, lat]));
  const [x, y] = poleOfInaccessibility(flat, 1e-3);
  return [x / scale, y];
}

/** @param {any} geojson @returns {Object<string,[number,number]>} */
export function featureCentroids(geojson) {
  /** @type {Object<string,[number,number]>} */
  const out = {};
  for (const f of geojson.features) {
    let iso = (f.properties.ISO_A2 || f.properties.iso_a2 || '').toUpperCase();
    // Natural Earth marks a few real countries (France, Norway) as '-99' in
    // ISO_A2; the '_EH' variant carries the correct alpha-2 code.
    if (iso === '-99') iso = (f.properties.ISO_A2_EH || f.properties.iso_a2_eh || '').toUpperCase();
    if (!iso || iso === '-99') continue;
    const centre = geometryCentre(f.geometry);
    if (!centre) continue;
    out[iso] = [Math.round(centre[0] * 1e4) / 1e4, Math.round(centre[1] * 1e4) / 1e4];
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node scripts/build-centroids.mjs <countries.geojson>');
    process.exit(1);
  }
  const geojson = JSON.parse(await readFile(src, 'utf8'));
  const centroids = featureCentroids(geojson);
  await writeFile('data/centroids.json', JSON.stringify(centroids, null, 0) + '\n');
  console.log(`wrote data/centroids.json (${Object.keys(centroids).length} countries)`);
}
