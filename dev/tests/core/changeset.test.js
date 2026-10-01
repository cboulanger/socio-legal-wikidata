import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../../../src/core/draft.js';
import { buildChangeSet, describeChanges } from '../../../src/core/changeset.js';

const cfg = { humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498' };

test('create-association with a new journal links journal P123 to the association ref', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    labels: { en: 'European Society for Empirical Legal Studies', de: 'Europäische Gesellschaft für empirische Rechtsforschung' },
    descriptions: { en: 'European society for empirical legal studies' },
    classQid: 'Q955824', fieldQid: 'Q847034', countryQid: 'Q55',
    website: 'https://esels.eu', email: 'contact@esels.eu',
    inception: '2021', referenceUrl: 'https://esels.eu/about',
  });
  d.journal = { qid: null, label: 'European Journal of Empirical Legal Studies', url: 'https://esels.eu/ejels/', issn: null, referenceUrl: 'https://esels.eu/ejels/' };

  const cs = buildChangeSet(d, cfg);
  const assoc = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'assoc');
  assert.deepEqual(assoc.labels, { en: 'European Society for Empirical Legal Studies', de: 'Europäische Gesellschaft für empirische Rechtsforschung' });
  assert.deepEqual(assoc.descriptions, { en: 'European society for empirical legal studies' });
  assert.ok(assoc.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q955824'));
  assert.ok(assoc.claims.some((c) => c.property === 'P101' && c.value.qid === 'Q847034'));
  assert.ok(assoc.claims.some((c) => c.property === 'P17' && c.value.qid === 'Q55'));
  assert.ok(assoc.claims.some((c) => c.property === 'P571' && c.value.precision === 9));
  const journal = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'journal');
  assert.ok(journal.claims.some((c) => c.property === 'P123' && c.value.ref === 'assoc'));
});

test('update-field emits one referenced add-statement per provided field', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q100';
  d.association.email = 'office@body.org';
  d.association.website = 'https://body.org';
  d.association.referenceUrl = 'https://body.org';
  const cs = buildChangeSet(d, cfg);
  const props = cs.ops.filter((o) => o.type === 'add-statement').map((o) => o.property).sort();
  assert.deepEqual(props, ['P856', 'P968']);
  assert.ok(cs.ops.every((o) => o.type !== 'add-statement' || o.replace === true));
});

test('P968 (email) is always stored as a mailto: URI, in both create and update-field modes', () => {
  const created = emptyDraft('create-association');
  Object.assign(created.association, {
    labels: { en: 'X' }, classQid: 'Q955824', fieldQid: 'Q847034', email: 'office@body.org',
    referenceUrl: 'https://body.org',
  });
  const csCreate = buildChangeSet(created, cfg);
  const assoc = csCreate.ops.find((o) => o.type === 'create-item' && o.ref === 'assoc');
  const p968Create = assoc.claims.find((c) => c.property === 'P968');
  assert.deepEqual(p968Create.value, { kind: 'url', value: 'mailto:office@body.org' });

  const updated = emptyDraft('update-field');
  updated.association.qid = 'Q100';
  updated.association.email = 'office@body.org';
  updated.association.referenceUrl = 'https://body.org';
  const csUpdate = buildChangeSet(updated, cfg);
  const p968Update = csUpdate.ops.find((o) => o.type === 'add-statement' && o.property === 'P968');
  assert.deepEqual(p968Update.value, { kind: 'url', value: 'mailto:office@body.org' });

  // an already-prefixed address (e.g. round-tripped from a read) must not get double-prefixed
  updated.association.email = 'mailto:already@prefixed.org';
  const csIdempotent = buildChangeSet(updated, cfg);
  const p968Idempotent = csIdempotent.ops.find((o) => o.type === 'add-statement' && o.property === 'P968');
  assert.deepEqual(p968Idempotent.value, { kind: 'url', value: 'mailto:already@prefixed.org' });
});

test('buildChangeSet throws on an invalid draft', () => {
  assert.throws(() => buildChangeSet(emptyDraft('create-association'), cfg), /at least one name is required/);
});

test('linking an EXISTING journal emits add-statements, not a create-item', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    labels: { en: 'Law and Society Association' },
    classQid: 'Q955824', fieldQid: 'Q847034', referenceUrl: 'https://example.org/about',
  });
  d.journal = { qid: 'Q6502970', label: 'Law & Society Review', url: 'https://example.org/lsr', issn: '0023-9216', referenceUrl: 'https://example.org/lsr' };

  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.some((o) => o.type === 'create-item' && o.ref === 'journal'), false);
  const p123 = cs.ops.find((o) => o.type === 'add-statement' && o.property === 'P123' && o.target.qid === 'Q6502970');
  assert.ok(p123, 'expected a P123 add-statement targeting the existing journal qid');
  assert.deepEqual(p123.reference, { P854: 'https://example.org/lsr' });
  const p856 = cs.ops.find((o) => o.type === 'add-statement' && o.property === 'P856' && o.target.qid === 'Q6502970');
  assert.ok(p856);
  assert.equal(p856.value.value, 'https://example.org/lsr');
  const p236 = cs.ops.find((o) => o.type === 'add-statement' && o.property === 'P236' && o.target.qid === 'Q6502970');
  assert.ok(p236);
  assert.equal(p236.value.value, '0023-9216');
});

test('create-association creates only the association item (no person, no P488)', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    labels: { pt: 'Rede de Pesquisa Empírica em Direito' }, classQid: 'Q955824', fieldQid: 'Q847034',
    countryQid: 'Q155', referenceUrl: 'https://reed.example/sobre',
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.length, 1);
  assert.equal(cs.ops[0].type, 'create-item');
  assert.deepEqual(cs.ops[0].labels, { pt: 'Rede de Pesquisa Empírica em Direito' });
  assert.equal(cs.ops[0].claims.some((c) => c.property === 'P488'), false);
  assert.match(cs.summary, /create association/);
});

test('update-field writes only the changed terms, in one set-terms op', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q100',
    original: { labels: { pt: 'Rede', en: 'Network' }, descriptions: { pt: 'rede' }, website: null, email: null },
    labels: { pt: 'Rede', en: 'Network', de: 'Netzwerk', fr: '   ' },   // de is new, fr is blank
    descriptions: { pt: 'rede', en: 'a network' },                        // en is new
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.length, 1);
  assert.deepEqual(cs.ops[0], { type: 'set-terms', target: { qid: 'Q100' }, labels: { de: 'Netzwerk' }, descriptions: { en: 'a network' } });
  assert.match(cs.summary, /names \(de\)/);
  assert.match(cs.summary, /descriptions \(en\)/);
});

test('update-field: an unchanged website is not re-sent; a changed e-mail replaces', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q100',
    original: { labels: {}, descriptions: {}, website: 'https://old.example', email: 'a@old.example' },
    website: 'https://old.example', email: 'b@new.example', referenceUrl: 'https://new.example/news',
  });
  const cs = buildChangeSet(d, cfg);
  assert.deepEqual(cs.ops.map((o) => o.property), ['P968']);
  assert.equal(cs.ops[0].replace, true);
});

test('describeChanges lists new and changed names per language', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q100',
    original: { labels: { en: 'Old' }, descriptions: {}, website: null, email: null },
    labels: { en: 'New', de: 'Neu' },
  });
  assert.deepEqual(describeChanges(d), ['name (en): “Old” → “New”', 'name (de): “Neu” (new)']);
});

test('update-field with "add to directory" adds only the missing type/field statements, referenced', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q100', classQid: 'Q955824', fieldQid: 'Q847034', addToDirectory: true, referenceUrl: 'https://x.example/about',
  });
  d.association.original.needsClass = true;
  d.association.original.needsField = true;
  let cs = buildChangeSet(d, cfg);
  assert.deepEqual(cs.ops.map((o) => [o.type, o.property, o.value.qid]), [
    ['add-statement', 'P31', 'Q955824'], ['add-statement', 'P101', 'Q847034'],
  ]);
  assert.ok(cs.ops.every((o) => o.reference.P854 === 'https://x.example/about' && !o.replace)); // added, never replacing other types
  assert.match(cs.summary, /directory membership/);
  assert.ok(describeChanges(d).includes('add to directory: instance of Q955824'));

  d.association.original.needsClass = false;
  cs = buildChangeSet(d, cfg);
  assert.deepEqual(cs.ops.map((o) => o.property), ['P101']);
});

const monoOf = (o) => ({ text: o.value.text, language: o.value.language });

test('update-field records a former name as a dated P1448 statement, plus an alias in the same edit as the terms', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q100', referenceUrl: 'https://x.example/history',
    original: { labels: { pt: 'Velho Nome' }, descriptions: {}, aliases: { pt: ['Existente'] }, formerNames: [], website: null, email: null },
    labels: { pt: 'Novo Nome' },
    formerNames: [{ text: 'Velho Nome', lang: 'pt', start: '1995', end: '2010', alias: true }],
  });
  const cs = buildChangeSet(d, cfg);
  assert.deepEqual(cs.ops[0], {
    type: 'set-terms', target: { qid: 'Q100' }, labels: { pt: 'Novo Nome' }, descriptions: {},
    aliases: { pt: ['Existente', 'Velho Nome'] },
  });
  const stmt = cs.ops[1];
  assert.equal(stmt.type, 'add-statement');
  assert.equal(stmt.property, 'P1448');
  assert.equal(stmt.replace, undefined);                                    // added next to any other names, never replacing
  assert.deepEqual(stmt.target, { qid: 'Q100' });
  assert.deepEqual(monoOf(stmt), { text: 'Velho Nome', language: 'pt' });
  assert.equal(stmt.value.kind, 'monolingual');
  assert.deepEqual(stmt.qualifiers, [
    { property: 'P580', value: { kind: 'time', value: '1995-01-01', precision: 9 } },
    { property: 'P582', value: { kind: 'time', value: '2010-01-01', precision: 9 } },
  ]);
  assert.deepEqual(stmt.reference, { P854: 'https://x.example/history' });
  assert.match(cs.summary, /names \(pt\)/);
  assert.match(cs.summary, /former names \(1\)/);
  assert.ok(describeChanges(d).includes('former name (pt): “Velho Nome” (1995–2010), also an alias'));
});

test('a former name with only an end year gets only the end qualifier, and short years are zero-padded', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q100', referenceUrl: 'https://x.example',
    formerNames: [{ text: 'Sodalitas', lang: 'la', start: '', end: '999', alias: false }],
  });
  const cs = buildChangeSet(d, cfg);
  assert.deepEqual(cs.ops.map((o) => o.type), ['add-statement']);           // no terms changed, no alias asked for
  assert.deepEqual(cs.ops[0].qualifiers, [{ property: 'P582', value: { kind: 'time', value: '0999-01-01', precision: 9 } }]);
});

test('create-association can carry former names and aliases on the new item', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    labels: { pt: 'Rede de Pesquisa Empírica em Direito' }, classQid: 'Q955824', fieldQid: 'Q847034',
    countryQid: 'Q155', referenceUrl: 'https://reed.example/sobre',
    formerNames: [{ text: 'Rede de Estudos Empíricos', lang: 'pt', start: '2012', end: '2016', alias: true }],
  });
  const create = buildChangeSet(d, cfg).ops[0];
  assert.deepEqual(create.aliases, { pt: ['Rede de Estudos Empíricos'] });
  const p1448 = create.claims.find((c) => c.property === 'P1448');
  assert.deepEqual(monoOf(p1448), { text: 'Rede de Estudos Empíricos', language: 'pt' });
  assert.equal(p1448.qualifiers.length, 2);
  assert.deepEqual(p1448.reference, { P854: 'https://reed.example/sobre' });
});

test('a create without former names has no aliases key and no P1448 claim', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, { labels: { pt: 'Rede' }, classQid: 'Q1', fieldQid: 'Q2', referenceUrl: 'https://x' });
  const create = buildChangeSet(d, cfg).ops[0];
  assert.equal('aliases' in create, false);
  assert.equal(create.claims.some((c) => c.property === 'P1448'), false);
});

test('update-field: picking a host organization writes a replacing P361 statement with a reference', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q100';
  d.association.original = { labels: {}, descriptions: {}, website: null, email: null, parentQid: null };
  d.association.parentQid = 'Q500';
  d.association.parentLabel = 'German Sociological Association';
  d.association.referenceUrl = 'https://dgs.example/sections';
  const cs = buildChangeSet(d, cfg);
  const op = cs.ops.find((o) => o.property === 'P361');
  assert.deepEqual(op.value, { kind: 'item', qid: 'Q500' });
  assert.equal(op.replace, true);
  assert.deepEqual(op.reference, { P854: 'https://dgs.example/sections' });
  assert.ok(describeChanges(d).some((l) => /part of: German Sociological Association/.test(l)));
});

test('update-field: an unchanged host organization is not a change', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q100';
  d.association.original = { labels: {}, descriptions: {}, website: null, email: null, parentQid: 'Q500' };
  d.association.parentQid = 'Q500';
  assert.throws(() => buildChangeSet(d, cfg), /nothing to update/);
});

test('update-field adds a new abbreviation as a P1813 statement plus an alias, and needs a reference', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q100',
    original: { labels: { en: 'Asian Law and Society Association' }, descriptions: {}, aliases: {}, abbreviations: {}, formerNames: [], website: null, email: null },
    labels: { en: 'Asian Law and Society Association' },
    abbreviations: { en: 'ALSA' },
  });
  assert.throws(() => buildChangeSet(d, cfg), /referenceUrl/);
  d.association.referenceUrl = 'https://alsa.example';
  const cs = buildChangeSet(d, cfg);
  assert.deepEqual(cs.ops[0], { type: 'set-terms', target: { qid: 'Q100' }, labels: {}, descriptions: {}, aliases: { en: ['ALSA'] } });
  const stmt = cs.ops[1];
  assert.equal(stmt.property, 'P1813');
  assert.deepEqual(stmt.value, { kind: 'monolingual', text: 'ALSA', language: 'en' });
  assert.equal(stmt.replace, undefined);
  assert.deepEqual(stmt.reference, { P854: 'https://alsa.example' });
  assert.match(cs.summary, /abbreviations \(en\)/);
  assert.ok(describeChanges(d).includes('abbreviation (en): “ALSA”, also an alias'));
});

test('create-association carries the abbreviation on the new item', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    classQid: 'Q955824', fieldQid: 'Q847034', referenceUrl: 'https://alsa.example',
    labels: { en: 'Asian Law and Society Association' }, abbreviations: { en: 'ALSA' },
  });
  const create = buildChangeSet(d, cfg).ops.find((o) => o.type === 'create-item' && o.ref === 'assoc');
  const claim = create.claims.find((c) => c.property === 'P1813');
  assert.deepEqual(claim.value, { kind: 'monolingual', text: 'ALSA', language: 'en' });
  assert.deepEqual(claim.reference, { P854: 'https://alsa.example' });
  assert.deepEqual(create.aliases, { en: ['ALSA'] });
});

test('update-field: a changed operating area alone is a valid change and replaces P2541', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q100';
  d.association.original = { labels: {}, descriptions: {}, website: null, email: null, operatingAreaQid: null };
  d.association.operatingAreaQid = 'Q48';
  d.association.operatingAreaLabel = 'Asia';
  d.association.referenceUrl = 'https://example.org/about';

  const cs = buildChangeSet(d, cfg);
  const op = cs.ops.find((o) => o.property === 'P2541');
  assert.deepEqual(op.target, { qid: 'Q100' });
  assert.deepEqual(op.value, { kind: 'item', qid: 'Q48' });
  assert.equal(op.replace, true);
  assert.match(cs.summary, /operating area/);
  assert.ok(describeChanges(d).includes('operating area: Asia'));
});

test('manage-leadership: an existing person gets a referenced P488 with begin/office qualifiers', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/board';
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.length, 1);
  const op = cs.ops[0];
  assert.equal(op.type, 'add-statement');
  assert.deepEqual(op.target, { qid: 'Q100' });
  assert.equal(op.property, 'P488');
  assert.deepEqual(op.value, { kind: 'item', qid: 'Q200' });
  assert.deepEqual(op.qualifiers, [
    { property: 'P580', value: { kind: 'time', value: '2024-01-01', precision: 11 } },
    { property: 'P3831', value: { kind: 'item', qid: 'Q1255921' } },
  ]);
  assert.deepEqual(op.reference, { P854: 'https://x.example/board' });
});

test('manage-leadership: a past term (end given) adds P582 too, and needs no current-officer end-statement', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/history';
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q140686', officeLabel: 'Chairperson', begin: '1995-06-01', end: '2010-01-15',
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.length, 1);
  assert.deepEqual(cs.ops[0].qualifiers, [
    { property: 'P580', value: { kind: 'time', value: '1995-06-01', precision: 11 } },
    { property: 'P3831', value: { kind: 'item', qid: 'Q140686' } },
    { property: 'P582', value: { kind: 'time', value: '2010-01-15', precision: 11 } },
  ]);
});

test('manage-leadership: a new person is created with P569/P108(+P585)/P496/P856, then linked via P488', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/about';
  d.officers.push({
    person: {
      qid: null, labels: { en: 'Jane Roe', pt: 'Joana Roe' }, description: 'legal scholar',
      birthDate: '1970-03-04', affiliationQid: 'Q300', affiliationLabel: 'Example University',
      orcid: '0000-0002-1825-0097', homepage: 'https://uni.example/roe',
    },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, { ...cfg, today: '2026-09-30' });
  const create = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'person-0');
  assert.deepEqual(create.labels, { en: 'Jane Roe', pt: 'Joana Roe' });
  assert.deepEqual(create.descriptions, { en: 'legal scholar' });
  assert.ok(create.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q5'));
  assert.ok(create.claims.some((c) => c.property === 'P106' && c.value.qid === 'Q1650915'));
  assert.ok(create.claims.some((c) => c.property === 'P569' && c.value.value === '1970-03-04' && c.value.precision === 11));
  const aff = create.claims.find((c) => c.property === 'P108');
  assert.deepEqual(aff.value, { kind: 'item', qid: 'Q300' });
  assert.deepEqual(aff.qualifiers, [{ property: 'P585', value: { kind: 'time', value: '2026-09-30', precision: 11 } }]);
  assert.ok(create.claims.some((c) => c.property === 'P496' && c.value.value === '0000-0002-1825-0097'));
  assert.ok(create.claims.some((c) => c.property === 'P856' && c.value.value === 'https://uni.example/roe'));
  assert.ok(create.claims.every((c) => c.reference?.P854 === 'https://x.example/about'));
  // the P488 statement for this row must immediately follow its own create-item, for the
  // QuickStatements LAST-reference ordering constraint (see quickstatements.test.js)
  const createIdx = cs.ops.indexOf(create);
  const link = cs.ops[createIdx + 1];
  assert.equal(link.property, 'P488');
  assert.deepEqual(link.value, { kind: 'item', ref: 'person-0' });
});

test('manage-leadership: a new row with no end date auto-ends the previously open statement', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/board';
  d.leadershipOriginal = { history: [], current: { statementId: 'Q100$OLD', personQid: 'Q9', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null } };
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, cfg);
  const end = cs.ops.find((o) => o.type === 'end-statement');
  assert.deepEqual(end, { type: 'end-statement', statementId: 'Q100$OLD', endDate: '2024-01-01' });
});

test('manage-leadership: a purely historical batch (no open row) does not touch the existing current statement', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/history';
  d.leadershipOriginal = { history: [], current: { statementId: 'Q100$OLD', personQid: 'Q9', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null } };
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '1990-01-01', end: '1995-01-01',
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.some((o) => o.type === 'end-statement'), false);
});

test('manage-leadership: picking an existing person with a current affiliation writes a P585-dated P108, no create-item', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/board';
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: 'Q300', affiliationLabel: 'Example University', orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, { ...cfg, today: '2026-09-30' });
  assert.equal(cs.ops.some((o) => o.type === 'create-item'), false);
  const aff = cs.ops.find((o) => o.property === 'P108');
  assert.deepEqual(aff.target, { qid: 'Q200' });
  assert.deepEqual(aff.value, { kind: 'item', qid: 'Q300' });
  assert.deepEqual(aff.qualifiers, [{ property: 'P585', value: { kind: 'time', value: '2026-09-30', precision: 11 } }]);
});

test('describeChanges: manage-leadership lists each row and the auto-end', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.leadershipOriginal = { history: [], current: { statementId: 'Q100$OLD', personQid: 'Q9', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null } };
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const lines = describeChanges(d);
  assert.ok(lines.includes('President: Q200 (existing person), 2024-01-01 – present'));
  assert.ok(lines.some((l) => /ends the previous officeholder.s term at 2024-01-01/.test(l)));
});

test('describeChanges: an existing person picked from the typeahead is shown by name and birth year, not the bare qid', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.officers.push({
    person: { qid: 'Q200', pickedLabel: 'Jane Doe', pickedBirthYear: '1975', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const lines = describeChanges(d);
  assert.ok(lines.includes('President: Jane Doe (b. 1975) (existing person), 2024-01-01 – present'));
});
