import { looksPersonal } from './email-guard.js';

/**
 * @typedef {Object} DraftAssociation
 * @property {string|null} qid
 * @property {string} label
 * @property {string} description
 * @property {string|null} classQid
 * @property {string|null} fieldQid
 * @property {string|null} countryQid
 * @property {string|null} operatingAreaQid
 * @property {string|null} seatQid
 * @property {string|null} parentQid
 * @property {string|null} website
 * @property {string|null} email
 * @property {boolean} emailConfirmedShared
 * @property {string|null} inception     // 'YYYY'
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DraftPerson
 * @property {string|null} qid
 * @property {string} label
 * @property {string} description
 * @property {string|null} homepage
 * @property {string|null} orcid
 * @property {string|null} universityQid
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DraftJournal
 * @property {string|null} qid
 * @property {string} label
 * @property {string|null} url
 * @property {string|null} issn
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DirectoryDraft
 * @property {'create-association'|'change-president'|'update-field'} mode
 * @property {DraftAssociation} association
 * @property {DraftPerson} president
 * @property {DraftJournal|null} journal
 * @property {string|null} previousPresidentStatementId
 * @property {string|null} termStart    // ISO date
 */

/** @param {DirectoryDraft['mode']} mode @returns {DirectoryDraft} */
export function emptyDraft(mode) {
  return {
    mode,
    association: {
      qid: null, label: '', description: '', classQid: null, fieldQid: null,
      countryQid: null, operatingAreaQid: null, seatQid: null, parentQid: null,
      website: null, email: null, emailConfirmedShared: false, inception: null, referenceUrl: null,
    },
    president: {
      qid: null, label: '', description: '', homepage: null, orcid: null,
      universityQid: null, referenceUrl: null,
    },
    journal: null,
    previousPresidentStatementId: null,
    termStart: null,
  };
}

/** @param {DirectoryDraft} d @returns {string[]} */
export function validateDraftForChangeset(d) {
  const e = [];
  const a = d.association;
  const p = d.president;

  if (a.email && looksPersonal(a.email) && !a.emailConfirmedShared) {
    e.push('association.email looks personal; confirm it is a shared role address');
  }

  if (d.mode === 'create-association') {
    if (!a.label) e.push('association.label is required');
    if (!a.classQid) e.push('association.classQid is required');
    if (!a.fieldQid) e.push('association.fieldQid is required');
    if (!a.referenceUrl) e.push('association.referenceUrl is required');
    if (!p.qid && !p.label) e.push('president identity is required');
    if (!p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
    if (!p.qid && !p.referenceUrl) e.push('president.referenceUrl is required for a new person');
  }

  if (d.mode === 'change-president') {
    if (!a.qid) e.push('association.qid is required');
    if (!p.qid && !p.label) e.push('president identity is required');
    if (!d.termStart) e.push('termStart is required');
    if (!p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
  }

  if (d.mode === 'update-field') {
    if (!a.qid) e.push('association.qid is required');
    if (!a.email && !a.website) e.push('nothing to update');
    if (!a.referenceUrl) e.push('association.referenceUrl is required');
  }

  if (d.journal && !d.journal.qid && !d.journal.label) e.push('journal.label is required to create a journal');
  return e;
}
