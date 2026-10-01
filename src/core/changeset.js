import { validateDraftForChangeset, changedTerms, changedStatements, scopeStatements, changedParent, changedOperatingArea, activeFormerNames, aliasesToSet, changedAbbreviations, cleanTerms, journalChangedTerms, journalChangedFields, hasJournalScopeChanges } from './draft.js';

/**
 * @typedef {{kind:'item', qid:string}|{kind:'item', ref:string}
 *   |{kind:'string', value:string}|{kind:'url', value:string}
 *   |{kind:'external-id', value:string}
 *   |{kind:'monolingual', text:string, language:string}
 *   |{kind:'time', value:string, precision:number}} Value
 * @typedef {{property:string, value:Value}} Qualifier
 * @typedef {{P854:string}} Reference
 * @typedef {{property:string, value:Value, qualifiers?:Qualifier[], reference?:Reference}} Claim
 *
 * @typedef {{type:'create-item', ref:string, labels:Object<string,string>, descriptions:Object<string,string>, aliases?:Object<string,string[]>, claims:Claim[]}
 *   |{type:'set-terms', target:{qid:string}, labels:Object<string,string>, descriptions:Object<string,string>, aliases?:Object<string,string[]>}
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
const mono = (text, language) => ({ kind: 'monolingual', text, language });
// former-name years are 1-4 digit years; Wikidata wants a four-digit year in the date
const yearOnly = (y) => ({ kind: 'time', value: `${String(y).padStart(4, '0')}-01-01`, precision: 9 });
const day = (value) => ({ kind: 'time', value, precision: 11 });

/** "Official name" (P1448) statements for the former-name rows, dated with start/end time qualifiers. */
function formerNameClaims(a, reference) {
  return activeFormerNames(a).map((r) => {
    const qualifiers = [];
    if (r.start) qualifiers.push({ property: 'P580', value: yearOnly(r.start) });
    if (r.end) qualifiers.push({ property: 'P582', value: yearOnly(r.end) });
    return { property: 'P1448', value: mono(r.text, r.lang), qualifiers: qualifiers.length ? qualifiers : undefined, reference };
  });
}

/** "Short name" (P1813) statements for the abbreviations, one per language. */
function abbreviationClaims(a, reference) {
  return Object.entries(changedAbbreviations(a)).map(([lang, text]) => ({ property: 'P1813', value: mono(text, lang), reference }));
}

/**
 * @param {import('./draft.js').DirectoryDraft} draft
 * @param {{humanQid:string, researcherQid:string, academicJournalQid:string, inScopeFieldQid?:string, today?:string}} cfg
 * @returns {ChangeSet}
 */
export function buildChangeSet(draft, cfg) {
  const errors = validateDraftForChangeset(draft);
  if (errors.length) throw new Error(`invalid draft: ${errors.join('; ')}`);

  /** @type {Op[]} */
  const ops = [];
  const a = draft.association;

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
    if (a.closed) claims.push({ property: 'P576', value: year(a.closed) });
    for (const c of claims) if (assocRefUrl) c.reference = assocRefUrl;
    claims.push(...formerNameClaims(a, assocRefUrl));
    claims.push(...abbreviationClaims(a, assocRefUrl));
    const terms = changedTerms(a);
    const createAliases = aliasesToSet(a);
    ops.push({
      type: 'create-item', ref: 'assoc', labels: terms.labels, descriptions: terms.descriptions,
      ...(Object.keys(createAliases).length ? { aliases: createAliases } : {}), claims,
    });
    return { summary: 'socio-legal directory: create association', ops };
  }

  if (draft.mode === 'manage-leadership') {
    const today = cfg.today || new Date().toISOString().slice(0, 10);
    const rows = draft.officers || [];
    let openRow = null;
    rows.forEach((row, i) => {
      const rp = row.person;
      let value;
      if (rp.qid) {
        value = item(rp.qid);
        if (rp.affiliationQid) {
          ops.push({
            type: 'add-statement', target: { qid: rp.qid }, property: 'P108', value: item(rp.affiliationQid),
            qualifiers: [{ property: 'P585', value: day(today) }], reference: assocRefUrl,
          });
        }
      } else {
        const personRef = `person-${i}`;
        /** @type {Claim[]} */
        const claims = [
          { property: 'P31', value: item(cfg.humanQid) },
          { property: 'P106', value: item(cfg.researcherQid) },
        ];
        if (rp.birthDate) claims.push({ property: 'P569', value: day(rp.birthDate) });
        if (rp.affiliationQid) claims.push({ property: 'P108', value: item(rp.affiliationQid), qualifiers: [{ property: 'P585', value: day(today) }] });
        if (rp.homepage) claims.push({ property: 'P856', value: url(rp.homepage) });
        if (rp.orcid) claims.push({ property: 'P496', value: extId(rp.orcid) });
        for (const c of claims) if (assocRefUrl) c.reference = assocRefUrl;
        ops.push({ type: 'create-item', ref: personRef, labels: cleanTerms(rp.labels), descriptions: rp.description ? { en: rp.description } : {}, claims });
        value = ref(personRef);
      }
      const qualifiers = [{ property: 'P580', value: day(row.begin) }, { property: 'P3831', value: item(row.officeQid) }];
      if (row.end) qualifiers.push({ property: 'P582', value: day(row.end) });
      ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P488', value, qualifiers, reference: assocRefUrl });
      if (!row.end) openRow = row;
    });
    if (openRow && draft.leadershipOriginal?.current) {
      ops.push({ type: 'end-statement', statementId: draft.leadershipOriginal.current.statementId, endDate: openRow.begin });
    }
    return { summary: `socio-legal directory: update leadership (${rows.length} ${rows.length === 1 ? 'entry' : 'entries'})`, ops };
  }

  if (draft.mode === 'create-journal') {
    const j = draft.journalEntity;
    const journalRefUrl = j.referenceUrl ? { P854: j.referenceUrl } : undefined;
    /** @type {Claim[]} */
    const claims = [
      { property: 'P31', value: item(cfg.academicJournalQid) },
      { property: 'P921', value: item(cfg.inScopeFieldQid) },
    ];
    if (j.publisherQid) claims.push({ property: 'P123', value: item(j.publisherQid) });
    if (j.website) claims.push({ property: 'P856', value: url(j.website), qualifiers: [{ property: 'P585', value: day(cfg.today || new Date().toISOString().slice(0, 10)) }] });
    if (j.issn) claims.push({ property: 'P236', value: extId(j.issn) });
    if (j.founded) claims.push({ property: 'P571', value: year(j.founded) });
    if (j.closed) claims.push({ property: 'P576', value: year(j.closed) });
    if (j.openAlexId) claims.push({ property: 'P10283', value: extId(j.openAlexId) });
    for (const c of claims) if (journalRefUrl) c.reference = journalRefUrl;
    const terms = journalChangedTerms(j);
    ops.push({ type: 'create-item', ref: 'journal', labels: terms.labels, descriptions: terms.descriptions, claims });
    return { summary: 'socio-legal directory: create journal', ops };
  }

  if (draft.mode === 'update-journal') {
    const j = draft.journalEntity;
    const journalRefUrl = j.referenceUrl ? { P854: j.referenceUrl } : undefined;
    const terms = journalChangedTerms(j);
    const changed = [];
    const langs = (m) => Object.keys(m).sort().join(', ');
    if (Object.keys(terms.labels).length || Object.keys(terms.descriptions).length) {
      ops.push({ type: 'set-terms', target: { qid: j.qid }, labels: terms.labels, descriptions: terms.descriptions });
      if (Object.keys(terms.labels).length) changed.push(`titles (${langs(terms.labels)})`);
      if (Object.keys(terms.descriptions).length) changed.push(`descriptions (${langs(terms.descriptions)})`);
    }
    const fields = journalChangedFields(j);
    if (fields.website) {
      ops.push({
        type: 'add-statement', target: { qid: j.qid }, property: 'P856', value: url(fields.website),
        qualifiers: [{ property: 'P585', value: day(cfg.today || new Date().toISOString().slice(0, 10)) }],
        reference: journalRefUrl, replace: true,
      });
      changed.push('website');
    }
    if (fields.issn) { ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P236', value: extId(fields.issn), reference: journalRefUrl, replace: true }); changed.push('ISSN'); }
    if (fields.founded) { ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P571', value: year(fields.founded), reference: journalRefUrl, replace: true }); changed.push('founded'); }
    if (fields.closed) { ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P576', value: year(fields.closed), reference: journalRefUrl, replace: true }); changed.push('closed'); }
    if (fields.openAlexId) { ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P10283', value: extId(fields.openAlexId), reference: journalRefUrl, replace: true }); changed.push('OpenAlex id'); }
    if (fields.publisherQid) { ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P123', value: item(fields.publisherQid), reference: journalRefUrl, replace: true }); changed.push('publisher'); }
    if (hasJournalScopeChanges(j)) {
      if (j.original?.needsClass) { ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P31', value: item(cfg.academicJournalQid), reference: journalRefUrl }); }
      if (j.original?.needsField) { ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P921', value: item(cfg.inScopeFieldQid), reference: journalRefUrl }); }
      changed.push('directory membership');
    }
    return { summary: `socio-legal directory: update journal ${changed.join(', ')}`, ops };
  }

  if (draft.mode === 'manage-journal-editors') {
    const j = draft.journalEntity;
    const journalRefUrl = j.referenceUrl ? { P854: j.referenceUrl } : undefined;
    const rows = draft.editors || [];
    rows.forEach((row, i) => {
      const rp = row.person;
      let value;
      if (rp.qid) {
        value = item(rp.qid);
        if (rp.affiliationQid) {
          ops.push({
            type: 'add-statement', target: { qid: rp.qid }, property: 'P108', value: item(rp.affiliationQid),
            qualifiers: [{ property: 'P585', value: day(cfg.today || new Date().toISOString().slice(0, 10)) }], reference: journalRefUrl,
          });
        }
      } else {
        const personRef = `person-${i}`;
        /** @type {Claim[]} */
        const claims = [
          { property: 'P31', value: item(cfg.humanQid) },
          { property: 'P106', value: item(cfg.researcherQid) },
        ];
        if (rp.birthDate) claims.push({ property: 'P569', value: day(rp.birthDate) });
        if (rp.affiliationQid) claims.push({ property: 'P108', value: item(rp.affiliationQid), qualifiers: [{ property: 'P585', value: day(cfg.today || new Date().toISOString().slice(0, 10)) }] });
        if (rp.homepage) claims.push({ property: 'P856', value: url(rp.homepage) });
        if (rp.orcid) claims.push({ property: 'P496', value: extId(rp.orcid) });
        for (const c of claims) if (journalRefUrl) c.reference = journalRefUrl;
        ops.push({ type: 'create-item', ref: personRef, labels: cleanTerms(rp.labels), descriptions: rp.description ? { en: rp.description } : {}, claims });
        value = ref(personRef);
      }
      const qualifiers = [{ property: 'P580', value: day(row.begin) }, { property: 'P3831', value: item(row.roleQid) }];
      if (row.end) qualifiers.push({ property: 'P582', value: day(row.end) });
      ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P98', value, qualifiers, reference: journalRefUrl });
    });
    return { summary: `socio-legal directory: update journal editors (${rows.length} ${rows.length === 1 ? 'entry' : 'entries'})`, ops };
  }

  // update-field
  const terms = changedTerms(a);
  const stmts = changedStatements(a);
  const changed = [];
  const langs = (m) => Object.keys(m).sort().join(', ');
  const aliases = aliasesToSet(a);
  if (Object.keys(terms.labels).length || Object.keys(terms.descriptions).length || Object.keys(aliases).length) {
    ops.push({
      type: 'set-terms', target: { qid: a.qid }, labels: terms.labels, descriptions: terms.descriptions,
      ...(Object.keys(aliases).length ? { aliases } : {}),
    });
    if (Object.keys(terms.labels).length) changed.push(`names (${langs(terms.labels)})`);
    if (Object.keys(terms.descriptions).length) changed.push(`descriptions (${langs(terms.descriptions)})`);
  }
  const formerClaims = formerNameClaims(a, assocRefUrl);
  for (const c of formerClaims) ops.push({ type: 'add-statement', target: { qid: a.qid }, ...c });
  if (formerClaims.length) changed.push(`former names (${formerClaims.length})`);
  const abbrClaims = abbreviationClaims(a, assocRefUrl);
  for (const c of abbrClaims) ops.push({ type: 'add-statement', target: { qid: a.qid }, ...c });
  if (abbrClaims.length) changed.push(`abbreviations (${langs(changedAbbreviations(a))})`);
  if (stmts.website) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P856', value: url(stmts.website), reference: assocRefUrl, replace: true }); changed.push('website'); }
  if (stmts.email) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P968', value: mailto(stmts.email), reference: assocRefUrl, replace: true }); changed.push('e-mail'); }
  if (stmts.inception) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P571', value: year(stmts.inception), reference: assocRefUrl, replace: true }); changed.push('founding year'); }
  if (stmts.closed) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P576', value: year(stmts.closed), reference: assocRefUrl, replace: true }); changed.push('dissolution year'); }
  const parent = changedParent(a);
  if (parent) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P361', value: item(parent), reference: assocRefUrl, replace: true }); changed.push('part of'); }
  const area = changedOperatingArea(a);
  if (area) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P2541', value: item(area), reference: assocRefUrl, replace: true }); changed.push('operating area'); }
  const scope = scopeStatements(a);
  if (scope.class) ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P31', value: item(scope.class), reference: assocRefUrl });
  if (scope.field) ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P101', value: item(scope.field), reference: assocRefUrl });
  if (scope.class || scope.field) changed.push('directory membership');
  return { summary: `socio-legal directory: update ${changed.join(', ')}`, ops };
}

/**
 * Plain-language lines describing what a draft would write (for the review step).
 * @param {import('./draft.js').DirectoryDraft} draft
 * @returns {string[]}
 */
export function describeChanges(draft) {
  const a = draft.association;
  const terms = changedTerms(a);
  const stmts = changedStatements(a);
  const lines = [];
  for (const [lang, text] of Object.entries(terms.labels)) {
    const old = a.original?.labels?.[lang];
    lines.push(old ? `name (${lang}): “${old}” → “${text}”` : `name (${lang}): “${text}” (new)`);
  }
  for (const [lang, text] of Object.entries(terms.descriptions)) {
    const old = a.original?.descriptions?.[lang];
    lines.push(old ? `description (${lang}): “${old}” → “${text}”` : `description (${lang}): “${text}” (new)`);
  }
  if (stmts.website) lines.push(`website: ${a.original?.website ? `${a.original.website} → ` : ''}${stmts.website}`);
  if (stmts.email) lines.push(`e-mail: ${a.original?.email ? `${a.original.email} → ` : ''}${stmts.email}`);
  if (stmts.inception) lines.push(`founding year: ${a.original?.inception ? `${a.original.inception} → ` : ''}${stmts.inception}`);
  if (stmts.closed) lines.push(`dissolution year: ${a.original?.closed ? `${a.original.closed} → ` : ''}${stmts.closed}`);
  for (const [lang, text] of Object.entries(changedAbbreviations(a))) {
    lines.push(`abbreviation (${lang}): “${text}”, also an alias`);
  }
  for (const r of activeFormerNames(a)) {
    const years = r.start || r.end ? ` (${r.start || '?'}–${r.end || 'now'})` : '';
    lines.push(`former name (${r.lang}): “${r.text}”${years}${r.alias ? ', also an alias' : ''}`);
  }
  if (changedParent(a) && draft.mode !== 'create-association') {
    lines.push(`part of: ${a.original?.parentQid ? `${a.original.parentQid} → ` : ''}${a.parentLabel || a.parentQid}`);
  }
  if (changedOperatingArea(a) && draft.mode !== 'create-association') {
    lines.push(`operating area: ${a.original?.operatingAreaQid ? `${a.original.operatingAreaQid} → ` : ''}${a.operatingAreaLabel || a.operatingAreaQid}`);
  }
  const scope = scopeStatements(a);
  if (scope.class) lines.push(`add to directory: instance of ${scope.class}`);
  if (scope.field) lines.push(`add to directory: field of work ${scope.field}`);
  if (draft.mode === 'create-association') {
    if (a.countryLabel || a.countryQid) lines.push(`country: ${a.countryLabel || a.countryQid}`);
    if (a.seatLabel || a.seatQid) lines.push(`seat: ${a.seatLabel || a.seatQid}`);
    if (a.parentQid) lines.push(`part of: ${a.parentLabel || a.parentQid}`);
    if (a.inception) lines.push(`founding year: ${a.inception}`);
    if (a.closed) lines.push(`dissolution year: ${a.closed}`);
    if (a.referenceUrl) lines.push(`reference: ${a.referenceUrl}`);
  }
  if (draft.mode === 'manage-leadership') {
    for (const row of draft.officers || []) {
      const who = row.person.qid
        ? `${row.person.pickedLabel || row.person.qid}${row.person.pickedBirthYear ? ` (b. ${row.person.pickedBirthYear})` : ''} (existing person)`
        : `${Object.values(row.person.labels || {})[0] || '(unnamed)'} (new person)`;
      lines.push(`${row.officeLabel || row.officeQid}: ${who}, ${row.begin || '?'} – ${row.end || 'present'}`);
    }
    const openRow = (draft.officers || []).find((r) => !r.end);
    if (openRow && draft.leadershipOriginal?.current) {
      lines.push(`ends the previous officeholder's term at ${openRow.begin}`);
    }
  }
  if (draft.mode === 'create-journal' || draft.mode === 'update-journal') {
    const j = draft.journalEntity;
    const jTerms = journalChangedTerms(j);
    for (const [lang, text] of Object.entries(jTerms.labels)) {
      const old = j.original?.labels?.[lang];
      lines.push(old ? `title (${lang}): “${old}” → “${text}”` : `title (${lang}): “${text}” (new)`);
    }
    for (const [lang, text] of Object.entries(jTerms.descriptions)) {
      const old = j.original?.descriptions?.[lang];
      lines.push(old ? `description (${lang}): “${old}” → “${text}”` : `description (${lang}): “${text}” (new)`);
    }
    const jFields = journalChangedFields(j);
    if (jFields.founded) lines.push(`founded: ${jFields.founded}`);
    if (jFields.closed) lines.push(`closed: ${jFields.closed}`);
    if (jFields.issn) lines.push(`ISSN: ${jFields.issn}`);
    if (jFields.website) lines.push(`website: ${jFields.website}`);
    if (jFields.openAlexId) lines.push(`OpenAlex id: ${jFields.openAlexId}`);
    if (jFields.publisherQid) lines.push(`published by: ${j.publisherLabel || j.publisherQid}${draft.mode === 'update-journal' ? ' (existing association)' : ''}`);
    if (hasJournalScopeChanges(j)) {
      if (j.original?.needsClass) lines.push('add to directory: instance of academic journal');
      if (j.original?.needsField) lines.push('add to directory: field of work sociology of law');
    }
    if (j.referenceUrl) lines.push(`reference: ${j.referenceUrl}`);
  }
  if (draft.mode === 'manage-journal-editors') {
    for (const row of draft.editors || []) {
      const who = row.person.qid
        ? `${row.person.pickedLabel || row.person.qid}${row.person.pickedBirthYear ? ` (b. ${row.person.pickedBirthYear})` : ''} (existing person)`
        : `${Object.values(row.person.labels || {})[0] || '(unnamed)'} (new person)`;
      lines.push(`${row.roleLabel || row.roleQid}: ${who}, ${row.begin || '?'} – ${row.end || 'present'}`);
    }
  }
  return lines;
}
