/**
 * @typedef {import('../core/model.js').Directory} Directory
 * @typedef {import('../core/model.js').Association} Association
 *
 * @typedef {Object} WikidataReadPort
 * @property {() => Promise<Association[]>} queryDirectory
 *   Fetch every in-scope association from the live query service.
 *
 * @typedef {Object} CachePort
 * @property {(key: string, maxAgeMs: number) => (any|null)} get
 * @property {(key: string, value: any) => void} set
 */
export {};
