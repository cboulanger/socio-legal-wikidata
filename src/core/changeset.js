import { validateDraftForChangeset } from './draft.js';

/**
 * @typedef {{kind:'item', qid:string}|{kind:'item', ref:string}
 *   |{kind:'string', value:string}|{kind:'url', value:string}
 *   |{kind:'external-id', value:string}
 *   |{kind:'time', value:string, precision:number}} Value
 * @typedef {{property:string, value:Value}} Qualifier
 * @typedef {{P854:string}} Reference
 * @typedef {{property:string, value:Value, qualifiers?:Qualifier[], reference?:Reference}} Claim
 *
 * @typedef {{type:'create-item', ref:string, labels:Object<string,string>, descriptions:Object<string,string>, claims:Claim[]}
 *   |{type:'add-statement', target:{qid:string}|{ref:string}, property:string, value:Value, qualifiers?:Qualifier[], reference?:Reference, replace?:boolean}
 *   |{type:'end-statement', statementId:string, endDate:string}} Op
 *
 * @typedef {{summary:string, ops:Op[]}} ChangeSet
 */

const ref = (r) => ({ kind: 'item', ref: r });
const item = (qid) => ({ kind: 'item', qid });
const url = (value) => ({ kind: 'url', value });
// P968 (email) is a "url" datatype property on Wikidata: the stored value must be a
// full "mailto:" URI, not a bare address (confirmed live — a bare address is
// rejected by the REST API with "invalid-value").
const mailto = (value) => ({ kind: 'url', value: value.startsWith('mailto:') ? value : `mailto:${value}` });
const extId = (value) => ({ kind: 'external-id', value });
const year = (value) => ({ kind: 'time', value: `${value}-01-01`, precision: 9 });
const day = (value) => ({ kind: 'time', value, precision: 11 });

/**
 * @param {import('./draft.js').DirectoryDraft} draft
 * @param {{humanQid:string, researcherQid:string, academicJournalQid:string}} cfg
 * @returns {ChangeSet}
 */
export function buildChangeSet(draft, cfg) {
  const errors = validateDraftForChangeset(draft);
  if (errors.length) throw new Error(`invalid draft: ${errors.join('; ')}`);

  /** @type {Op[]} */
  const ops = [];
  const a = draft.association;
  const p = draft.president;
  const j = draft.journal;

  // --- person (create if new) ---
  let personValue = null;
  if (draft.mode !== 'update-field') {
    if (p.qid) {
      personValue = item(p.qid);
      if (p.universityQid) {
        ops.push({ type: 'add-statement', target: { qid: p.qid }, property: 'P108', value: item(p.universityQid), reference: p.referenceUrl ? { P854: p.referenceUrl } : undefined });
      }
    } else {
      /** @type {Claim[]} */
      const claims = [
        { property: 'P31', value: item(cfg.humanQid) },
        { property: 'P106', value: item(cfg.researcherQid) },
        { property: 'P108', value: item(p.universityQid) },
      ];
      if (p.homepage) claims.push({ property: 'P856', value: url(p.homepage) });
      if (p.orcid) claims.push({ property: 'P496', value: extId(p.orcid) });
      for (const c of claims) if (p.referenceUrl) c.reference = { P854: p.referenceUrl };
      ops.push({ type: 'create-item', ref: 'person', labels: { en: p.label }, descriptions: p.description ? { en: p.description } : {}, claims });
      personValue = ref('person');
    }
  }

  // --- journal (create if new) ---
  if (j) {
    if (!j.qid) {
      /** @type {Claim[]} */
      const claims = [
        { property: 'P31', value: item(cfg.academicJournalQid) },
        { property: 'P123', value: a.qid ? item(a.qid) : ref('assoc') },
      ];
      if (j.url) claims.push({ property: 'P856', value: url(j.url) });
      if (j.issn) claims.push({ property: 'P236', value: extId(j.issn) });
      for (const c of claims) if (j.referenceUrl) c.reference = { P854: j.referenceUrl };
      ops.push({ type: 'create-item', ref: 'journal', labels: { en: j.label }, descriptions: {}, claims });
    } else {
      ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P123', value: a.qid ? item(a.qid) : ref('assoc'), reference: j.referenceUrl ? { P854: j.referenceUrl } : undefined });
      if (j.url) ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P856', value: url(j.url) });
      if (j.issn) ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P236', value: extId(j.issn) });
    }
  }

  const assocRefUrl = a.referenceUrl ? { P854: a.referenceUrl } : undefined;

  if (draft.mode === 'create-association') {
    /** @type {Claim[]} */
    const claims = [
      { property: 'P31', value: item(a.classQid) },
      { property: 'P101', value: item(a.fieldQid) },
    ];
    if (a.countryQid) claims.push({ property: 'P17', value: item(a.countryQid) });
    if (a.operatingAreaQid) claims.push({ property: 'P2541', value: item(a.operatingAreaQid) });
    if (a.seatQid) claims.push({ property: 'P159', value: item(a.seatQid) });
    if (a.parentQid) claims.push({ property: 'P361', value: item(a.parentQid) });
    if (a.website) claims.push({ property: 'P856', value: url(a.website) });
    if (a.email) claims.push({ property: 'P968', value: mailto(a.email) });
    if (a.inception) claims.push({ property: 'P571', value: year(a.inception) });
    if (personValue) {
      claims.push({
        property: 'P488',
        value: personValue,
        qualifiers: draft.termStart ? [{ property: 'P580', value: day(draft.termStart) }] : undefined,
      });
    }
    for (const c of claims) if (assocRefUrl) c.reference = assocRefUrl;
    ops.push({ type: 'create-item', ref: 'assoc', labels: { en: a.label }, descriptions: a.description ? { en: a.description } : {}, claims });
    return { summary: `socio-legal directory: create association${j ? ' and journal' : ''} and link president`, ops };
  }

  if (draft.mode === 'change-president') {
    ops.push({
      type: 'add-statement',
      target: { qid: a.qid },
      property: 'P488',
      value: personValue,
      qualifiers: [{ property: 'P580', value: day(draft.termStart) }],
      reference: assocRefUrl || (p.referenceUrl ? { P854: p.referenceUrl } : undefined),
    });
    if (draft.previousPresidentStatementId) {
      ops.push({ type: 'end-statement', statementId: draft.previousPresidentStatementId, endDate: draft.termStart });
    }
    return { summary: 'socio-legal directory: record new president', ops };
  }

  // update-field
  const changed = [];
  if (a.website) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P856', value: url(a.website), reference: assocRefUrl, replace: true }); changed.push('website'); }
  if (a.email) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P968', value: mailto(a.email), reference: assocRefUrl, replace: true }); changed.push('e-mail'); }
  return { summary: `socio-legal directory: update ${changed.join(' and ')}`, ops };
}
