/**
 * @typedef {import('./model.js').Association} Association
 * @typedef {import('./model.js').LonLat} LonLat
 * @typedef {Object<string, LonLat>} CentroidTable  // ISO alpha-2 -> [lon,lat]
 */

/**
 * Primary map pin for an association. Precedence (data spec §2.4):
 *   1. seat coordinate (P159 -> P625)
 *   2. country centroid (P17 -> table)
 *   3. null  -> caller lists it under "no fixed location"
 * @param {Association} a
 * @param {CentroidTable} centroids
 * @returns {{coord: LonLat, kind: 'seat'|'country'}|null}
 */
export function resolveSeatPin(a, centroids) {
  if (Array.isArray(a.seatCoord)) return { coord: a.seatCoord, kind: 'seat' };
  const cc = a.countryCode;
  if (cc && centroids[cc]) return { coord: centroids[cc], kind: 'country' };
  return null;
}
