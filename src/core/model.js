/**
 * @typedef {[number, number]} LonLat  // [longitude, latitude]
 *
 * @typedef {Object} PersonRef
 * @property {string} qid
 * @property {string} label
 * @property {string|null} url
 *
 * @typedef {Object} JournalRef
 * @property {string} qid
 * @property {string} label
 * @property {string|null} url
 * @property {string|null} issn
 *
 * @typedef {Object} Association
 * @property {string} qid
 * @property {string} label
 * @property {string} description
 * @property {string|null} countryCode      // ISO 3166-1 alpha-2, uppercase
 * @property {string|null} countryLabel
 * @property {string|null} operatingAreaQid // P2541
 * @property {string|null} seatQid          // P159
 * @property {string|null} seatLabel
 * @property {LonLat|null} seatCoord
 * @property {string|null} parentQid        // P361
 * @property {string|null} parentLabel
 * @property {string|null} website          // P856
 * @property {string|null} email            // P968
 * @property {string|null} inception        // year as string
 * @property {PersonRef|null} president
 * @property {string|null} leadUniQid
 * @property {string|null} leadUniLabel
 * @property {LonLat|null} leadCoord
 * @property {JournalRef|null} journal
 *
 * @typedef {Object} Directory
 * @property {Association[]} associations
 * @property {boolean} stale
 * @property {string|null} asOf
 */

/** @param {string} [qid] @returns {Association} */
export function emptyAssociation(qid = '') {
  return {
    qid,
    label: '',
    description: '',
    countryCode: null,
    countryLabel: null,
    operatingAreaQid: null,
    seatQid: null,
    seatLabel: null,
    seatCoord: null,
    parentQid: null,
    parentLabel: null,
    website: null,
    email: null,
    inception: null,
    president: null,
    leadUniQid: null,
    leadUniLabel: null,
    leadCoord: null,
    journal: null,
  };
}

/** @param {Association} a @returns {boolean} */
export function hasFixedLocation(a) {
  return Array.isArray(a.seatCoord) || typeof a.countryCode === 'string';
}

/**
 * Coarse display facet. Not stored in Wikidata as one property; derived here.
 * @param {Association} a
 * @returns {'section'|'regional'|'national'|'international'}
 */
export function deriveScope(a) {
  if (a.parentQid) return 'section';
  if (a.operatingAreaQid) return 'regional';
  if (a.countryCode) return 'national';
  return 'international';
}
