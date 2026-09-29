import { looksPersonal } from './email-guard.js';
import { isValidLangCode } from './languages.js';

export const MAX_TERM_LENGTH = 250; // Wikidata's limit for labels and descriptions

/**
 * @typedef {Object} AssociationOriginal  // values as loaded from Wikidata (empty when creating)
 * @property {Object<string,string>} labels
 * @property {Object<string,string>} descriptions
 * @property {string|null} website
 * @property {string|null} email
 * @property {boolean} [needsClass]   // the item lacks an in-scope instance-of (P31), so it is not in the directory
 * @property {boolean} [needsField]   // the item lacks the in-scope field of work (P101)
 *
 * @typedef {Object} DraftAssociation
 * @property {string|null} qid
 * @property {string} identifyName        // the name typed in the "identify" step (create)
 * @property {Object<string,string>} labels        // language code -> name
 * @property {Object<string,string>} descriptions  // language code -> description
 * @property {AssociationOriginal} original
 * @property {boolean} addToDirectory     // edit: also add the missing in-scope type / field-of-work statements
 * @property {string|null} classQid
 * @property {string|null} fieldQid
 * @property {string|null} countryQid
 * @property {string|null} countryLabel   // display only
 * @property {string|null} operatingAreaQid
 * @property {string|null} seatQid
 * @property {string|null} seatLabel      // display only
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
      qid: null, identifyName: '', labels: {}, descriptions: {},
      original: { labels: {}, descriptions: {}, website: null, email: null, needsClass: false, needsField: false },
      addToDirectory: false,
      classQid: null, fieldQid: null,
      countryQid: null, countryLabel: null, operatingAreaQid: null, seatQid: null, seatLabel: null, parentQid: null,
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

const bareEmail = (v) => (v || '').replace(/^mailto:/i, '').trim();

/** Non-blank entries of a language->text map, trimmed. */
export function cleanTerms(map) {
  const out = {};
  for (const [lang, text] of Object.entries(map || {})) {
    const t = (text || '').trim();
    if (t) out[lang] = t;
  }
  return out;
}

/** Entries of `current` that are non-blank and differ from `original`. Blank means "no change". */
function changedEntries(current, original) {
  const out = {};
  for (const [lang, text] of Object.entries(cleanTerms(current))) {
    if (text !== (original?.[lang] || '').trim()) out[lang] = text;
  }
  return out;
}

/**
 * The label/description entries that will be written (edit: only what changed; create: everything filled).
 * @param {DraftAssociation} a
 * @returns {{labels: Object<string,string>, descriptions: Object<string,string>}}
 */
export function changedTerms(a) {
  return {
    labels: changedEntries(a.labels, a.original?.labels),
    descriptions: changedEntries(a.descriptions, a.original?.descriptions),
  };
}

/**
 * Website / e-mail values that differ from what is on Wikidata. Blank means "no change".
 * @param {DraftAssociation} a
 * @returns {{website: string|null, email: string|null}}
 */
export function changedStatements(a) {
  const website = (a.website || '').trim();
  const email = bareEmail(a.email);
  return {
    website: website && website !== (a.original?.website || '').trim() ? website : null,
    email: email && email !== bareEmail(a.original?.email) ? email : null,
  };
}

/**
 * In-scope statements to add so an existing item shows up in the directory (edit mode, opt-in).
 * @param {DraftAssociation} a
 * @returns {{class: string|null, field: string|null}}
 */
export function scopeStatements(a) {
  if (!a.addToDirectory) return { class: null, field: null };
  return {
    class: a.original?.needsClass ? a.classQid : null,
    field: a.original?.needsField ? a.fieldQid : null,
  };
}

/** Whether ticking "add to directory" would actually write something. */
export function hasScopeChanges(a) {
  const s = scopeStatements(a);
  return !!(s.class || s.field);
}

/** Whether an association draft would write anything beyond terms. */
export function hasTermChanges(a) {
  const t = changedTerms(a);
  return Object.keys(t.labels).length + Object.keys(t.descriptions).length > 0;
}

/** Errors about the language codes and lengths of the term maps (shared by step and draft validation). */
export function validateTerms(a) {
  const e = [];
  for (const [kind, map] of [['name', a.labels], ['description', a.descriptions]]) {
    for (const [lang, text] of Object.entries(cleanTerms(map))) {
      if (!isValidLangCode(lang)) e.push(`“${lang}” is not a valid language code`);
      if (text.length > MAX_TERM_LENGTH) e.push(`the ${kind} in “${lang}” is longer than ${MAX_TERM_LENGTH} characters`);
    }
  }
  return e;
}

/**
 * Read what the editor needs from a `wbgetentities` entity.
 * @param {any} entity
 * @returns {{labels: Object<string,string>, descriptions: Object<string,string>, website: string|null, email: string|null, countryQid: string|null, classQids: string[], fieldQids: string[]}}
 */
export function originalFromEntity(entity) {
  const terms = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([lang, v]) => [lang, v.value]));
  const first = (prop) => {
    const claim = (entity?.claims?.[prop] || []).find((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue);
    return claim ? claim.mainsnak.datavalue.value : null;
  };
  const ids = (prop) => (entity?.claims?.[prop] || [])
    .filter((c) => c.rank !== 'deprecated')
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
  const country = first('P17');
  const email = first('P968');
  return {
    labels: terms(entity?.labels),
    descriptions: terms(entity?.descriptions),
    website: first('P856'),
    email: email ? bareEmail(email) : null,
    countryQid: country && typeof country === 'object' ? country.id : null,
    classQids: ids('P31'),
    fieldQids: ids('P101'),
  };
}

/** @param {DirectoryDraft} d @returns {string[]} */
export function validateDraftForChangeset(d) {
  const e = [];
  const a = d.association;
  const p = d.president;
  const changed = changedStatements(a);
  const changedStatement = !!(changed.website || changed.email);
  const scopeChange = hasScopeChanges(a);

  if (a.email && looksPersonal(a.email) && !a.emailConfirmedShared && (d.mode !== 'update-field' || changed.email)) {
    e.push('association.email looks personal; confirm it is a shared role address');
  }

  if (d.mode === 'create-association') {
    if (Object.keys(cleanTerms(a.labels)).length === 0) e.push('association.labels: at least one name is required');
    if (!a.classQid) e.push('association.classQid is required');
    if (!a.fieldQid) e.push('association.fieldQid is required');
    if (!a.referenceUrl) e.push('association.referenceUrl is required');
    // a president is optional for now; if one is given, a new person needs the usual evidence
    if (p.label && !p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
    if (p.label && !p.qid && !p.referenceUrl) e.push('president.referenceUrl is required for a new person');
    e.push(...validateTerms(a));
  }

  if (d.mode === 'change-president') {
    if (!a.qid) e.push('association.qid is required');
    if (!p.qid && !p.label) e.push('president identity is required');
    if (!d.termStart) e.push('termStart is required');
    if (!p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
  }

  if (d.mode === 'update-field') {
    if (!a.qid) e.push('association.qid is required');
    if (!hasTermChanges(a) && !changedStatement && !scopeChange) e.push('nothing to update');
    if ((changedStatement || scopeChange) && !a.referenceUrl) e.push('association.referenceUrl is required');
    e.push(...validateTerms(a));
  }

  if (d.journal && !d.journal.qid && !d.journal.label) e.push('journal.label is required to create a journal');
  return e;
}
