import { looksPersonal } from './email-guard.js';
import { isValidLangCode } from './languages.js';

export const MAX_TERM_LENGTH = 250; // Wikidata's limit for labels and descriptions

/**
 * @typedef {Object} FormerName  // a name the association used before (an "official name" statement)
 * @property {string} text
 * @property {string} lang        // Wikimedia language code
 * @property {string} start       // year, '' if unknown
 * @property {string} end         // year, '' if unknown or still current
 * @property {boolean} [alias]    // also add it as an alias so search finds it (new rows only)
 *
 * @typedef {Object} AssociationOriginal  // values as loaded from Wikidata (empty when creating)
 * @property {Object<string,string>} labels
 * @property {Object<string,string>} descriptions
 * @property {string|null} website
 * @property {string|null} email
 * @property {string|null} [parentQid]    // "part of" (P361) as loaded
 * @property {string|null} [operatingAreaQid] // "operating area" (P2541) as loaded
 * @property {Object<string,string[]>} [aliases]     // existing aliases per language
 * @property {FormerName[]} [formerNames]              // existing official-name (P1448) statements
 * @property {boolean} [needsClass]   // the item lacks an in-scope instance-of (P31), so it is not in the directory
 * @property {boolean} [needsField]   // the item lacks the in-scope field of work (P101)
 *
 * @typedef {Object} DraftAssociation
 * @property {string|null} qid
 * @property {string} identifyName        // the name typed in the "identify" step (create)
 * @property {Object<string,string>} labels        // language code -> name
 * @property {Object<string,string>} descriptions  // language code -> description
 * @property {AssociationOriginal} original
 * @property {FormerName[]} formerNames   // rows being added in the form
 * @property {Object<string,string>} abbreviations // language -> short name / acronym (P1813)
 * @property {boolean} addToDirectory     // edit: also add the missing in-scope type / field-of-work statements
 * @property {string|null} classQid
 * @property {string|null} fieldQid
 * @property {string|null} countryQid
 * @property {string|null} countryLabel   // display only
 * @property {string|null} operatingAreaQid
 * @property {string|null} [operatingAreaLabel] // display only
 * @property {string|null} seatQid
 * @property {string|null} seatLabel      // display only
 * @property {string|null} parentQid      // the organization this association is part of (P361)
 * @property {string|null} parentLabel    // display only
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
      original: { labels: {}, descriptions: {}, aliases: {}, abbreviations: {}, formerNames: [], website: null, email: null, needsClass: false, needsField: false },
      formerNames: [],
      abbreviations: {},
      addToDirectory: false,
      classQid: null, fieldQid: null,
      countryQid: null, countryLabel: null, operatingAreaQid: null, seatQid: null, seatLabel: null, parentQid: null, parentLabel: null,
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
 * Abbreviation (P1813) entries that will be written: non-blank and not already on the item in that
 * language. Blank means "no change".
 * @param {DraftAssociation} a
 * @returns {Object<string,string>}
 */
export function changedAbbreviations(a) {
  const out = {};
  for (const [lang, text] of Object.entries(cleanTerms(a.abbreviations))) {
    if (!(a.original?.abbreviations?.[lang] || []).includes(text)) out[lang] = text;
  }
  return out;
}

/** Whether the draft adds any abbreviation (a statement, so it needs a reference URL). */
export const hasAbbreviations = (a) => Object.keys(changedAbbreviations(a)).length > 0;

const YEAR = /^\d{1,4}$/;

/**
 * The former-name rows that will actually be written: blank rows are ignored and rows that are
 * already on the item (same name, language and years) are dropped.
 * @param {DraftAssociation} a
 * @returns {Required<FormerName>[]}
 */
export function activeFormerNames(a) {
  const existing = a.original?.formerNames || [];
  return (a.formerNames || [])
    .map((r) => ({
      text: (r.text || '').trim(), lang: (r.lang || '').trim().toLowerCase(),
      start: (r.start || '').trim(), end: (r.end || '').trim(), alias: !!r.alias,
    }))
    .filter((r) => r.text || r.start || r.end)
    .filter((r) => !existing.some((e) => e.text === r.text && e.lang === r.lang && (e.start || '') === r.start && (e.end || '') === r.end));
}

/** Whether the draft adds any former name (a statement, so it needs a reference URL). */
export const hasFormerNames = (a) => activeFormerNames(a).length > 0;

/** @param {DraftAssociation} a @returns {string[]} */
export function validateFormerNames(a) {
  const e = [];
  for (const r of activeFormerNames(a)) {
    if (!r.text) e.push('a former name needs its name');
    else if (r.text.length > MAX_TERM_LENGTH) e.push(`the former name “${r.text.slice(0, 20)}…” is longer than ${MAX_TERM_LENGTH} characters`);
    if (!isValidLangCode(r.lang)) e.push(`former name “${r.text}”: “${r.lang}” is not a valid language code`);
    for (const [label, y] of [['from', r.start], ['until', r.end]]) {
      if (y && !YEAR.test(y)) e.push(`former name “${r.text}”: “${y}” is not a year (${label})`);
    }
    if (YEAR.test(r.start) && YEAR.test(r.end) && Number(r.start) > Number(r.end)) {
      e.push(`former name “${r.text}”: the end year is before the start year`);
    }
  }
  return e;
}

/**
 * Aliases to add so search finds the former names and the abbreviations: per language, the ticked
 * former names and every new abbreviation that are neither the current name nor already an alias.
 * Returns the FULL new alias list per language (existing + new), because the patch replaces the
 * whole list.
 * @param {DraftAssociation} a
 * @returns {Object<string,string[]>}
 */
export function aliasesToSet(a) {
  const out = {};
  const labels = cleanTerms(a.labels);
  const wanted = [
    ...activeFormerNames(a).filter((r) => r.alias).map((r) => ({ lang: r.lang, text: r.text })),
    ...Object.entries(changedAbbreviations(a)).map(([lang, text]) => ({ lang, text })),
  ];
  for (const { lang, text } of wanted) {
    if (!text || !isValidLangCode(lang)) continue;
    const current = out[lang] || a.original?.aliases?.[lang] || [];
    if (text === labels[lang] || current.includes(text)) continue; // pointless (it is the current name) or already an alias
    out[lang] = [...current, text];
  }
  return out;
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

/**
 * The "part of" organization to write: only when picked and different from what is on Wikidata.
 * @param {DraftAssociation} a
 * @returns {string|null}
 */
export function changedParent(a) {
  return a.parentQid && a.parentQid !== (a.original?.parentQid || null) ? a.parentQid : null;
}

/**
 * The operating area (P2541) to write: only when picked and different from what is on Wikidata.
 * @param {DraftAssociation} a
 * @returns {string|null}
 */
export function changedOperatingArea(a) {
  return a.operatingAreaQid && a.operatingAreaQid !== (a.original?.operatingAreaQid || null) ? a.operatingAreaQid : null;
}

/** Whether an association draft would write anything beyond terms. */
export function hasTermChanges(a) {
  const t = changedTerms(a);
  return Object.keys(t.labels).length + Object.keys(t.descriptions).length > 0;
}

/** Errors about the language codes and lengths of the term maps (shared by step and draft validation). */
export function validateTerms(a) {
  const e = [];
  for (const [kind, map] of [['name', a.labels], ['description', a.descriptions], ['abbreviation', a.abbreviations]]) {
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
 * @returns {{labels: Object<string,string>, descriptions: Object<string,string>, aliases: Object<string,string[]>, abbreviations: Object<string,string[]>, formerNames: FormerName[], website: string|null, email: string|null, parentQid: string|null, operatingAreaQid: string|null, countryQid: string|null, classQids: string[], fieldQids: string[]}}
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
  const yearOf = (qualifiers) => {
    const m = /^[+-]?0*(\d+)-/.exec(qualifiers?.[0]?.datavalue?.value?.time || '');
    return m ? m[1] : '';
  };
  const formerNames = (entity?.claims?.P1448 || [])
    .filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value?.text)
    .map((c) => ({
      text: c.mainsnak.datavalue.value.text, lang: c.mainsnak.datavalue.value.language || '',
      start: yearOf(c.qualifiers?.P580), end: yearOf(c.qualifiers?.P582),
    }));
  const abbreviations = {};
  for (const c of entity?.claims?.P1813 || []) {
    const v = c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value;
    if (v?.text && v.language) (abbreviations[v.language] ||= []).push(v.text);
  }
  const aliases = Object.fromEntries(Object.entries(entity?.aliases || {}).map(([lang, list]) => [lang, list.map((x) => x.value)]));
  const country = first('P17');
  const email = first('P968');
  return {
    labels: terms(entity?.labels),
    descriptions: terms(entity?.descriptions),
    aliases,
    abbreviations,
    formerNames,
    website: first('P856'),
    email: email ? bareEmail(email) : null,
    parentQid: ids('P361')[0] || null,
    operatingAreaQid: ids('P2541')[0] || null,
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
    e.push(...validateTerms(a), ...validateFormerNames(a));
  }

  if (d.mode === 'change-president') {
    if (!a.qid) e.push('association.qid is required');
    if (!p.qid && !p.label) e.push('president identity is required');
    if (!d.termStart) e.push('termStart is required');
    if (!p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
  }

  if (d.mode === 'update-field') {
    if (!a.qid) e.push('association.qid is required');
    const former = hasFormerNames(a);
    const parent = !!changedParent(a) || !!changedOperatingArea(a);
    const abbr = hasAbbreviations(a);
    if (!hasTermChanges(a) && !changedStatement && !scopeChange && !former && !parent && !abbr) e.push('nothing to update');
    if ((changedStatement || scopeChange || former || parent || abbr) && !a.referenceUrl) e.push('association.referenceUrl is required');
    e.push(...validateTerms(a), ...validateFormerNames(a));
  }

  if (d.journal && !d.journal.qid && !d.journal.label) e.push('journal.label is required to create a journal');
  return e;
}
