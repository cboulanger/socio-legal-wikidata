#!/usr/bin/env node
// Derive data/centroids.json (ISO alpha-2 -> [lon,lat]) from a Natural Earth
// countries GeoJSON. Usage:
//   node scripts/build-centroids.mjs path/to/ne_110m_admin_0_countries.geojson
import { readFile, writeFile } from 'node:fs/promises';

/** @param {number[][]} ring @returns {[number,number]} */
export function ringCentroid(ring) {
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
    ? ring.slice(0, -1)
    : ring;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of pts) {
    x += lon;
    y += lat;
  }
  return [x / pts.length, y / pts.length];
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
    const g = f.geometry;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]]
      : g.type === 'MultiPolygon' ? g.coordinates.map((poly) => poly[0])
      : [];
    if (!rings.length) continue;
    // largest ring by vertex count is a good-enough proxy for the mainland
    const biggest = rings.sort((a, b) => b.length - a.length)[0];
    const [lon, lat] = ringCentroid(biggest);
    out[iso] = [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4];
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
