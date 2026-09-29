import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../../../src/core/draft.js';
import { buildChangeSet, describeChanges } from '../../../src/core/changeset.js';

const cfg = { humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498' };

test('change-president with an existing person: one add + one end statement', () => {
  const d = emptyDraft('change-president');
  d.association.qid = 'Q100';
  d.president.qid = 'Q200';
  d.president.universityQid = 'Q300';
  d.president.referenceUrl = 'https://uni.example/staff/x';
  d.termStart = '2026-01-01';
  d.previousPresidentStatementId = 'Q100$abc-123';

  const cs = buildChangeSet(d, cfg);
  const add = cs.ops.find((o) => o.type === 'add-statement' && o.property === 'P488');
  assert.deepEqual(add.target, { qid: 'Q100' });
  assert.deepEqual(add.value, { kind: 'item', qid: 'Q200' });
  assert.deepEqual(add.qualifiers, [{ property: 'P580', value: { kind: 'time', value: '2026-01-01', precision: 11 } }]);
  assert.ok(add.reference);
  const end = cs.ops.find((o) => o.type === 'end-statement');
  assert.deepEqual(end, { type: 'end-statement', statementId: 'Q100$abc-123', endDate: '2026-01-01' });
  assert.match(cs.summary, /new president/i);
});

test('change-president with a NEW person: create-item first, refs wired', () => {
  const d = emptyDraft('change-president');
  d.association.qid = 'Q100';
  d.president.label = 'Jane Roe';
  d.president.homepage = 'https://uni.example/roe';
  d.president.orcid = '0000-0002-1825-0097';
  d.president.universityQid = 'Q300';
  d.president.referenceUrl = 'https://uni.example/staff/roe';
  d.termStart = '2026-01-01';

  const cs = buildChangeSet(d, cfg);
  const create = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'person');
  assert.equal(create.labels.en, 'Jane Roe');
  assert.ok(create.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q5'));
  assert.ok(create.claims.some((c) => c.property === 'P106' && c.value.qid === 'Q1650915'));
  assert.ok(create.claims.some((c) => c.property === 'P108' && c.value.qid === 'Q300'));
  assert.ok(create.claims.some((c) => c.property === 'P856' && c.value.value === 'https://uni.example/roe'));
  assert.ok(create.claims.some((c) => c.property === 'P496' && c.value.value === '0000-0002-1825-0097'));
  const add = cs.ops.find((o) => o.type === 'add-statement' && o.property === 'P488');
  assert.deepEqual(add.value, { kind: 'item', ref: 'person' });
});

test('create-association with a new journal links journal P123 to the association ref', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    labels: { en: 'European Society for Empirical Legal Studies', de: 'Europäische Gesellschaft für empirische Rechtsforschung' },
    descriptions: { en: 'European society for empirical legal studies' },
    classQid: 'Q955824', fieldQid: 'Q2734663', countryQid: 'Q55',
    website: 'https://esels.eu', email: 'contact@esels.eu',
    inception: '2021', referenceUrl: 'https://esels.eu/about',
  });
  d.president.qid = 'Q400';
  d.termStart = '2024-01-01';
  d.journal = { qid: null, label: 'European Journal of Empirical Legal Studies', url: 'https://esels.eu/ejels/', issn: null, referenceUrl: 'https://esels.eu/ejels/' };

  const cs = buildChangeSet(d, cfg);
  const assoc = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'assoc');
  assert.deepEqual(assoc.labels, { en: 'European Society for Empirical Legal Studies', de: 'Europäische Gesellschaft für empirische Rechtsforschung' });
  assert.deepEqual(assoc.descriptions, { en: 'European society for empirical legal studies' });
  assert.ok(assoc.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q955824'));
  assert.ok(assoc.claims.some((c) => c.property === 'P101' && c.value.qid === 'Q2734663'));
  assert.ok(assoc.claims.some((c) => c.property === 'P17' && c.value.qid === 'Q55'));
  assert.ok(assoc.claims.some((c) => c.property === 'P571' && c.value.precision === 9));
  const p488 = assoc.claims.find((c) => c.property === 'P488');
  assert.deepEqual(p488.value, { kind: 'item', qid: 'Q400' });
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
    labels: { en: 'X' }, classQid: 'Q955824', fieldQid: 'Q2734663', email: 'office@body.org',
    referenceUrl: 'https://body.org',
  });
  created.president.qid = 'Q400';
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
    classQid: 'Q955824', fieldQid: 'Q2734663', referenceUrl: 'https://example.org/about',
  });
  d.president.qid = 'Q400';
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

test('create-association without a president creates only the association (no empty person)', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    labels: { pt: 'Rede de Pesquisa Empírica em Direito' }, classQid: 'Q955824', fieldQid: 'Q2734663',
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
    qid: 'Q100', classQid: 'Q955824', fieldQid: 'Q2734663', addToDirectory: true, referenceUrl: 'https://x.example/about',
  });
  d.association.original.needsClass = true;
  d.association.original.needsField = true;
  let cs = buildChangeSet(d, cfg);
  assert.deepEqual(cs.ops.map((o) => [o.type, o.property, o.value.qid]), [
    ['add-statement', 'P31', 'Q955824'], ['add-statement', 'P101', 'Q2734663'],
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
    labels: { pt: 'Rede de Pesquisa Empírica em Direito' }, classQid: 'Q955824', fieldQid: 'Q2734663',
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
