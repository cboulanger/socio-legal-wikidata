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
 * @property {() => Promise<void>} disconnect  // drop local tokens; best-effort server-side revoke if oauth.revokeUrl is configured
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
 * @property {(qid: string) => Promise<{history: import('../core/draft.js').LeadershipHistoryRow[], current: import('../core/draft.js').LeadershipHistoryRow|null}>} [getLeadershipHistory]
 * @property {(text: string) => Promise<(EntityCandidate & {birthYear: string|null, occupationLabels: string[], fieldLabels: string[]})[]>} [searchPersons]
 * @property {(text: string) => Promise<EntityCandidate[]>} [searchCountries]
 * @property {(countryQid: string) => Promise<string[]>} [getOfficialLanguageCodes]
 * @property {(qid: string) => Promise<{history: import('../core/draft.js').EditorHistoryRow[]}>} [getJournalEditorHistory]
 * @property {(qid: string) => Promise<null|{qid: string, labels: Object<string,string>, descriptions: Object<string,string>, website: string|null, websiteAsOf: string|null, issn: string|null, founded: string|null, closed: string|null, openAlexId: string|null, publisherQid: string|null, publisherLabel: string|null, classQids: string[], fieldQids: string[]}>} [getJournalDetails]
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
