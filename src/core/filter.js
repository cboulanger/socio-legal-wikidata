import { resolveSeatPin } from './resolve-location.js';

/**
 * @typedef {import('./model.js').Association} Association
 * @param {Association[]} list
 * @param {{countryCode?: string, text?: string}} criteria
 * @returns {Association[]}
 */
export function filterAssociations(list, { countryCode, text } = {}) {
  const needle = (text || '').trim().toLowerCase();
  return list.filter((a) => {
    if (countryCode && a.countryCode !== countryCode) return false;
    if (needle && !a.label.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/**
 * @param {Association[]} list
 * @param {Object<string, [number,number]>} centroids
 * @returns {{mapped: Association[], unlocated: Association[]}}
 */
export function partitionByLocation(list, centroids) {
  const mapped = [];
  const unlocated = [];
  for (const a of list) {
    (resolveSeatPin(a, centroids) ? mapped : unlocated).push(a);
  }
  return { mapped, unlocated };
}
