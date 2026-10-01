import { looksPersonal } from './email-guard.js';
import { isValidLangCode } from './languages.js';

export const MAX_TERM_LENGTH = 250; // Wikidata's limit for labels and descriptions

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isValidIsoDate = (s) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(s));

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
 * @property {string|null} [inception]    // 'YYYY', as loaded from Wikidata
 * @property {string|null} [closed]       // 'YYYY', as loaded from Wikidata
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
 * @property {string|null} closed        // 'YYYY', if the association is defunct
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} JournalOriginal   // values as loaded from Wikidata (empty when creating)
 * @property {Object<string,string>} labels
 * @property {Object<string,string>} descriptions
 * @property {string|null} website
 * @property {string|null} websiteAsOf
 * @property {string|null} issn
 * @property {string|null} founded
 * @property {string|null} closed
 * @property {string|null} openAlexId
 * @property {string|null} publisherQid
 * @property {boolean} [needsClass]   // lacks P31=academic journal
 * @property {boolean} [needsField]   // lacks P921=sociology of law
 *
 * @typedef {Object} DraftJournalEntity
 * @property {string|null} qid
 * @property {string} identifyName        // typed in the "identify" step (create)
 * @property {Object<string,string>} labels
 * @property {Object<string,string>} descriptions
 * @property {JournalOriginal} original
 * @property {string|null} website
 * @property {string|null} issn
 * @property {string|null} founded        // 'YYYY'
 * @property {string|null} closed         // 'YYYY'
 * @property {string|null} openAlexId
 * @property {string|null} publisherQid
 * @property {string|null} publisherLabel // display only
 * @property {boolean} addToDirectory     // edit: also add missing P31/P921 to an existing item
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DraftEditorPerson   // identical shape to DraftOfficerPerson
 * @property {string|null} qid
 * @property {string|null} pickedLabel
 * @property {string|null} pickedBirthYear
 * @property {Object<string,string>} labels
 * @property {string} description
 * @property {string|null} birthDate
 * @property {string|null} affiliationQid
 * @property {string|null} affiliationLabel
 * @property {string|null} orcid
 * @property {string|null} homepage
 *
 * @typedef {Object} DraftEditorRow      // identical shape to DraftOfficerRow
 * @property {DraftEditorPerson} person
 * @property {string} roleQid            // P3831 value; defaults to config.journalEditorRoles[0].qid
 * @property {string} roleLabel
 * @property {string} begin
 * @property {string|null} end
 *
 * @typedef {Object} EditorHistoryRow    // an existing P98 statement, read from Wikidata
 * @property {string} statementId
 * @property {string} personQid
 * @property {string} personLabel
 * @property {string|null} roleQid
 * @property {string} roleLabel          // "editor" fallback if no P3831 qualifier
 * @property {string|null} begin
 * @property {string|null} end
 *
 * @typedef {Object} EditorHistoryOriginal
 * @property {EditorHistoryRow[]} history   // every P98 statement, sorted begin desc
 *
 * @typedef {Object} DraftOfficerPerson
 * @property {string|null} qid                  // an existing person, or null to create one
 * @property {string|null} pickedLabel           // display only: qid's label at pick time
 * @property {string|null} pickedBirthYear       // display only: qid's birth year at pick time, if known
 * @property {Object<string,string>} labels      // language code -> name (new person only)
 * @property {string} description                // short English description (new person only)
 * @property {string|null} birthDate             // 'YYYY-MM-DD', new person only, optional
 * @property {string|null} affiliationQid        // P108 target, optional
 * @property {string|null} affiliationLabel      // display only
 * @property {string|null} orcid                 // P496, optional
 * @property {string|null} homepage              // P856, optional
 *
 * @typedef {Object} DraftOfficerRow
 * @property {DraftOfficerPerson} person
 * @property {string} officeQid                  // P3831 value; defaults to config.officeTypes[0].qid
 * @property {string} officeLabel                // display only
 * @property {string} begin                      // 'YYYY-MM-DD', required
 * @property {string|null} end                   // 'YYYY-MM-DD', optional ("present" if blank)
 *
 * @typedef {Object} LeadershipHistoryRow         // an existing P488 statement, read from Wikidata
 * @property {string} statementId
 * @property {string} personQid
 * @property {string} personLabel
 * @property {string|null} officeQid
 * @property {string} officeLabel                 // "chairperson" fallback if no P3831 qualifier
 * @property {string|null} begin
 * @property {string|null} end                    // null = still open
 *
 * @typedef {Object} LeadershipOriginal
 * @property {LeadershipHistoryRow[]} history      // every P488 statement, sorted begin desc
 * @property {LeadershipHistoryRow|null} current   // the one row (if any) with no end date
 *
 * @typedef {Object} DirectoryDraft
 * @property {'create-association'|'manage-leadership'|'update-field'|'create-journal'|'update-journal'|'manage-journal-editors'} mode
 * @property {DraftAssociation} association
 * @property {DraftOfficerRow[]} officers            // manage-leadership only: rows being added
 * @property {LeadershipOriginal|null} leadershipOriginal  // manage-leadership only: loaded from Wikidata
 * @property {DraftJournalEntity|null} journalEntity // create-journal/update-journal/manage-journal-editors only
 * @property {DraftEditorRow[]} editors              // manage-journal-editors only: rows being added
 * @property {EditorHistoryOriginal|null} editorsOriginal  // manage-journal-editors only: loaded from Wikidata
 */

/** @param {DirectoryDraft['mode']} mode @returns {DirectoryDraft} */
export function emptyDraft(mode) {
  return {
    mode,
    association: {
      qid: null, identifyName: '', labels: {}, descriptions: {},
      original: { labels: {}, descriptions: {}, aliases: {}, abbreviations: {}, formerNames: [], website: null, email: null, inception: null, closed: null, needsClass: false, needsField: false },
      formerNames: [],
      abbreviations: {},
      addToDirectory: false,
      classQid: null, fieldQid: null,
      countryQid: null, countryLabel: null, operatingAreaQid: null, seatQid: null, seatLabel: null, parentQid: null, parentLabel: null,
      website: null, email: null, emailConfirmedShared: false, inception: null, closed: null, referenceUrl: null,
    },
    officers: [],
    leadershipOriginal: null,
    journalEntity: null,
    editors: [],
    editorsOriginal: null,
  };
}

/**
 * A blank officer row, ready for the UI to fill in.
 * @param {string} officeQid @param {string} officeLabel
 * @returns {DraftOfficerRow}
 */
export function emptyOfficerRow(officeQid, officeLabel) {
  return {
    person: { qid: null, pickedLabel: null, pickedBirthYear: null, labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid, officeLabel, begin: '', end: null,
  };
}

/**
 * A blank journal entity, ready for the UI to fill in (create) or load into (edit).
 * @param {string|null} [qid]
 * @returns {DraftJournalEntity}
 */
export function emptyJournalEntity(qid = null) {
  return {
    qid, identifyName: '', labels: {}, descriptions: {},
    original: { labels: {}, descriptions: {}, website: null, websiteAsOf: null, issn: null, founded: null, closed: null, openAlexId: null, publisherQid: null, needsClass: false, needsField: false },
    website: null, issn: null, founded: null, closed: null, openAlexId: null,
    publisherQid: null, publisherLabel: null,
    addToDirectory: false, referenceUrl: null,
  };
}

/**
 * A blank editor row, ready for the UI to fill in.
 * @param {string} roleQid @param {string} roleLabel
 * @returns {DraftEditorRow}
 */
export function emptyEditorRow(roleQid, roleLabel) {
  return {
    person: { qid: null, pickedLabel: null, pickedBirthYear: null, labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    roleQid, roleLabel, begin: '', end: null,
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
 * Website / e-mail / founding year / dissolution year values that differ from what is on
 * Wikidata. Blank means "no change".
 * @param {DraftAssociation} a
 * @returns {{website: string|null, email: string|null, inception: string|null, closed: string|null}}
 */
export function changedStatements(a) {
  const website = (a.website || '').trim();
  const email = bareEmail(a.email);
  const inception = (a.inception || '').trim();
  const closed = (a.closed || '').trim();
  return {
    website: website && website !== (a.original?.website || '').trim() ? website : null,
    email: email && email !== bareEmail(a.original?.email) ? email : null,
    inception: inception && inception !== (a.original?.inception || '').trim() ? inception : null,
    closed: closed && closed !== (a.original?.closed || '').trim() ? closed : null,
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

/** null if either side is blank/invalid; else an error string if `end` precedes `start`. */
export function yearOrderError(what, start, end) {
  if (!YEAR.test(start || '') || !YEAR.test(end || '')) return null;
  return Number(start) > Number(end) ? `${what}: the end year is before the start year` : null;
}

// Wikidata's P854 (reference URL) format constraint disallows wikipedia.org: a reference
// must point at the primary source, not at Wikipedia's own article about it.
const WIKIPEDIA_HOST = /(^|\.)wikipedia\.org$/i;

/** null if `url` is blank/not a URL/not Wikipedia; else an error string. */
export function wikipediaReferenceError(what, url) {
  if (!url) return null;
  let host;
  try { host = new URL(url).hostname; } catch { return null; }
  return WIKIPEDIA_HOST.test(host) ? `${what}: a Wikipedia URL cannot be used as a reference — Wikidata does not allow citing Wikipedia itself; use the source it cites instead` : null;
}

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
    const orderErr = yearOrderError(`former name “${r.text}”`, r.start, r.end);
    if (orderErr) e.push(orderErr);
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

const trimmedOrNull = (v) => (v || '').trim() || null;

/**
 * The journal title/description entries that will be written (parallel to `changedTerms`).
 * @param {DraftJournalEntity} j
 * @returns {{labels: Object<string,string>, descriptions: Object<string,string>}}
 */
export function journalChangedTerms(j) {
  return {
    labels: changedEntries(j.labels, j.original?.labels),
    descriptions: changedEntries(j.descriptions, j.original?.descriptions),
  };
}

/**
 * Journal field values (website, ISSN, founded, closed, OpenAlex id, publisher) that differ
 * from what is on Wikidata. Blank/unset means "no change".
 * @param {DraftJournalEntity} j
 * @returns {{website?: string, issn?: string, founded?: string, closed?: string, openAlexId?: string, publisherQid?: string}}
 */
export function journalChangedFields(j) {
  const o = j.original || {};
  const out = {};
  const website = trimmedOrNull(j.website);
  if (website && website !== trimmedOrNull(o.website)) out.website = website;
  const issn = trimmedOrNull(j.issn);
  if (issn && issn !== trimmedOrNull(o.issn)) out.issn = issn;
  const founded = trimmedOrNull(j.founded);
  if (founded && founded !== trimmedOrNull(o.founded)) out.founded = founded;
  const closed = trimmedOrNull(j.closed);
  if (closed && closed !== trimmedOrNull(o.closed)) out.closed = closed;
  const openAlexId = trimmedOrNull(j.openAlexId);
  if (openAlexId && openAlexId !== trimmedOrNull(o.openAlexId)) out.openAlexId = openAlexId;
  if (j.publisherQid && j.publisherQid !== (o.publisherQid || null)) out.publisherQid = j.publisherQid;
  return out;
}

/** Whether a journal draft would write any name/description change. */
export function hasJournalTermChanges(j) {
  const t = journalChangedTerms(j);
  return Object.keys(t.labels).length + Object.keys(t.descriptions).length > 0;
}

/** Whether a journal draft would write any field change (website/ISSN/founded/closed/OpenAlex/publisher). */
export function hasJournalFieldChanges(j) {
  return Object.keys(journalChangedFields(j)).length > 0;
}

/** Whether ticking "add to directory" on a journal would actually write something. */
export function hasJournalScopeChanges(j) {
  return !!(j.addToDirectory && (j.original?.needsClass || j.original?.needsField));
}

/**
 * Read what the editor needs from a journal entity (parallel to `originalFromEntity`).
 * @param {any} entity
 * @returns {{labels: Object<string,string>, descriptions: Object<string,string>, website: string|null, websiteAsOf: string|null, issn: string|null, founded: string|null, closed: string|null, openAlexId: string|null, publisherQid: string|null, classQids: string[], fieldQids: string[]}}
 */
export function journalOriginalFromEntity(entity) {
  const terms = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([lang, v]) => [lang, v.value]));
  const mainClaim = (prop) => (entity?.claims?.[prop] || []).find((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue);
  const first = (prop) => mainClaim(prop)?.mainsnak.datavalue.value ?? null;
  const ids = (prop) => (entity?.claims?.[prop] || [])
    .filter((c) => c.rank !== 'deprecated')
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
  const publisher = first('P123');
  return {
    labels: terms(entity?.labels),
    descriptions: terms(entity?.descriptions),
    website: first('P856'),
    websiteAsOf: dateOf(mainClaim('P856')?.qualifiers?.P585),
    issn: first('P236'),
    founded: yearOfTimeValue(first('P571')),
    closed: yearOfTimeValue(first('P576')),
    openAlexId: first('P10283'),
    publisherQid: publisher && typeof publisher === 'object' ? publisher.id : null,
    classQids: ids('P31'),
    fieldQids: ids('P921'),
  };
}

/**
 * Parse an entity's P98 (editor) claims into editor rows. No label resolution here (QIDs
 * only) — that is the adapter's job (see `adapters/wikibase-api.js`'s `getJournalEditorHistory`).
 * @param {any} entity
 * @returns {{statementId: string, personQid: string, roleQid: string|null, begin: string|null, end: string|null}[]}
 */
export function editorClaimsFromEntity(entity) {
  return (entity?.claims?.P98 || [])
    .filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value?.id)
    .map((c) => ({
      statementId: c.id,
      personQid: c.mainsnak.datavalue.value.id,
      roleQid: c.qualifiers?.P3831?.[0]?.datavalue?.value?.id || null,
      begin: dateOf(c.qualifiers?.P580),
      end: dateOf(c.qualifiers?.P582),
    }));
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
    inception: yearOfTimeValue(first('P571')),
    closed: yearOfTimeValue(first('P576')),
    parentQid: ids('P361')[0] || null,
    operatingAreaQid: ids('P2541')[0] || null,
    countryQid: country && typeof country === 'object' ? country.id : null,
    classQids: ids('P31'),
    fieldQids: ids('P101'),
  };
}

const TIME_RE = /^[+-]?0*(\d{1,4})-(\d{2})-(\d{2})/;

/** A Wikidata time qualifier's first value, as 'YYYY-MM-DD', or null. */
function dateOf(qualifiers) {
  const m = TIME_RE.exec(qualifiers?.[0]?.datavalue?.value?.time || '');
  return m ? `${m[1].padStart(4, '0')}-${m[2]}-${m[3]}` : null;
}

/** A Wikidata time datavalue's year, unpadded (e.g. '1923'), or null. */
function yearOfTimeValue(value) {
  const m = /^[+-]?0*(\d+)-/.exec(value?.time || '');
  return m ? m[1] : null;
}

/**
 * Parse an entity's P488 (chairperson) claims into leadership rows. No label resolution
 * here (QIDs only) — that is the adapter's job, since it is the only layer that talks to
 * the network (see `adapters/wikibase-api.js`'s `getLeadershipHistory`).
 * @param {any} entity
 * @returns {{statementId: string, personQid: string, officeQid: string|null, begin: string|null, end: string|null}[]}
 */
export function leadershipClaimsFromEntity(entity) {
  return (entity?.claims?.P488 || [])
    .filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value?.id)
    .map((c) => ({
      statementId: c.id,
      personQid: c.mainsnak.datavalue.value.id,
      officeQid: c.qualifiers?.P3831?.[0]?.datavalue?.value?.id || null,
      begin: dateOf(c.qualifiers?.P580),
      end: dateOf(c.qualifiers?.P582),
    }));
}

/** @param {DirectoryDraft} d @returns {string[]} */
export function validateDraftForChangeset(d) {
  const e = [];
  const a = d.association;
  const changed = changedStatements(a);
  const changedStatement = !!(changed.website || changed.email || changed.inception || changed.closed);
  const scopeChange = hasScopeChanges(a);

  if (a.email && looksPersonal(a.email) && !a.emailConfirmedShared && (d.mode !== 'update-field' || changed.email)) {
    e.push('association.email looks personal; confirm it is a shared role address');
  }

  const assocYearErr = yearOrderError('association', a.inception, a.closed);
  if (assocYearErr) e.push(assocYearErr);

  const assocRefErr = wikipediaReferenceError('association.referenceUrl', a.referenceUrl);
  if (assocRefErr) e.push(assocRefErr);

  if (d.journalEntity) {
    const journalRefErr = wikipediaReferenceError('journal.referenceUrl', d.journalEntity.referenceUrl);
    if (journalRefErr) e.push(journalRefErr);
  }

  if (d.mode === 'create-association') {
    if (Object.keys(cleanTerms(a.labels)).length === 0) e.push('association.labels: at least one name is required');
    if (!a.classQid) e.push('association.classQid is required');
    if (!a.fieldQid) e.push('association.fieldQid is required');
    if (!a.referenceUrl) e.push('association.referenceUrl is required');
    e.push(...validateTerms(a), ...validateFormerNames(a));
  }

  if (d.mode === 'manage-leadership') {
    if (!a.qid) e.push('association.qid is required');
    const rows = d.officers || [];
    if (rows.length === 0) e.push('add at least one officeholder');
    let openCount = 0;
    for (const row of rows) {
      const rp = row.person;
      const hasName = Object.keys(cleanTerms(rp.labels)).length > 0;
      if (!rp.qid && !hasName) e.push('name the officeholder or pick an existing person');
      if (!rp.qid) {
        if (!rp.affiliationQid && !rp.orcid) e.push('a new officeholder needs an affiliation or an ORCID iD');
        e.push(...validateTerms({ labels: rp.labels, descriptions: {}, abbreviations: {} }));
      }
      if (!row.officeQid) e.push('pick the type of office');
      if (!row.begin || !isValidIsoDate(row.begin)) e.push('the term needs a valid begin date');
      if (row.end) {
        if (!isValidIsoDate(row.end)) e.push('the end date is not valid');
        else if (row.begin && isValidIsoDate(row.begin) && row.end < row.begin) e.push('the end date is before the begin date');
      } else {
        openCount += 1;
      }
    }
    if (openCount > 1) e.push('only one officeholder can be the current one — give the others an end date');
    if (rows.length > 0 && !a.referenceUrl) e.push('association.referenceUrl is required');
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

  if (d.mode === 'create-journal') {
    const j = d.journalEntity;
    if (!j || Object.keys(cleanTerms(j.labels)).length === 0) e.push('journal.labels: at least one title is required');
    if (!j?.referenceUrl) e.push('journal.referenceUrl is required');
    if (j) {
      e.push(...validateTerms({ labels: j.labels, descriptions: j.descriptions, abbreviations: {} }));
      const journalYearErr = yearOrderError('journal', j.founded, j.closed);
      if (journalYearErr) e.push(journalYearErr);
    }
  }

  if (d.mode === 'update-journal') {
    const j = d.journalEntity;
    if (!j?.qid) e.push('journal.qid is required');
    const termChange = j ? hasJournalTermChanges(j) : false;
    const fieldChange = j ? hasJournalFieldChanges(j) : false;
    const scopeChange = j ? hasJournalScopeChanges(j) : false;
    if (j) {
      const journalYearErr = yearOrderError('journal', j.founded, j.closed);
      if (journalYearErr) e.push(journalYearErr);
    }
    if (!termChange && !fieldChange && !scopeChange) e.push('nothing to update');
    if ((termChange || fieldChange || scopeChange) && !j?.referenceUrl) e.push('journal.referenceUrl is required');
    if (j) e.push(...validateTerms({ labels: j.labels, descriptions: j.descriptions, abbreviations: {} }));
  }

  if (d.mode === 'manage-journal-editors') {
    const j = d.journalEntity;
    if (!j?.qid) e.push('journal.qid is required');
    const rows = d.editors || [];
    if (rows.length === 0) e.push('add at least one editor');
    const openCountByRole = new Map();
    for (const row of rows) {
      const rp = row.person;
      const hasName = Object.keys(cleanTerms(rp.labels)).length > 0;
      if (!rp.qid && !hasName) e.push('name the editor or pick an existing person');
      if (!rp.qid) {
        if (!rp.affiliationQid && !rp.orcid) e.push('a new editor needs an affiliation or an ORCID iD');
        e.push(...validateTerms({ labels: rp.labels, descriptions: {}, abbreviations: {} }));
      }
      if (!row.roleQid) e.push('pick the editor role');
      if (!row.begin || !isValidIsoDate(row.begin)) e.push('the term needs a valid begin date');
      if (row.end) {
        if (!isValidIsoDate(row.end)) e.push('the end date is not valid');
        else if (row.begin && isValidIsoDate(row.begin) && row.end < row.begin) e.push('the end date is before the begin date');
      } else {
        openCountByRole.set(row.roleQid, (openCountByRole.get(row.roleQid) || 0) + 1);
      }
    }
    if ([...openCountByRole.values()].some((n) => n > 1)) e.push('only one editor per role can be current — give the others an end date');
    if (rows.length > 0 && !j?.referenceUrl) e.push('journal.referenceUrl is required');
  }

  return e;
}
