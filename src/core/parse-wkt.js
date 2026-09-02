/**
 * Parse a WKT point as returned by the Wikidata Query Service.
 * @param {unknown} wkt e.g. "Point(12.4964 41.9028)"
 * @returns {[number, number]|null} [longitude, latitude] or null
 */
export function parsePoint(wkt) {
  if (typeof wkt !== 'string') return null;
  const m = wkt.trim().match(/^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}
