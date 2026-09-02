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
 *
 * @typedef {Object} AuthPort
 * @property {() => boolean} hasSession        // a refresh token is stored
 * @property {() => Promise<boolean>} restore  // silently mint an access token; false if not possible
 * @property {() => Promise<void>} connect     // begin the interactive OAuth redirect
 * @property {() => Promise<string>} getToken  // a valid access token, refreshing if needed
 * @property {() => Promise<void>} disconnect  // drop tokens (and revoke if persistent)
 *
 * @typedef {Object} EntityCandidate
 * @property {string} qid
 * @property {string} label
 * @property {string} description
 *
 * @typedef {Object} SearchPort
 * @property {(text: string, type: 'item') => Promise<EntityCandidate[]>} searchEntities
 * @property {(qid: string) => Promise<any>} getEntity
 * @property {(property: string, value: string) => Promise<EntityCandidate[]>} lookupByExternalId
 *
 * @typedef {Object} WriteResult
 * @property {'direct'|'quickstatements'} via
 * @property {{ref: string, qid: string}[]} created  // ref -> new QID (direct only)
 * @property {string[]} diffUrls
 * @property {string} [handoffUrl]                     // quickstatements only
 *
 * @typedef {Object} WritePort
 * @property {(changeSet: import('../core/changeset.js').ChangeSet, token: string|null) => Promise<WriteResult>} applyChangeSet
 */
export {};
