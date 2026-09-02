import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../../../src/core/draft.js';
import { buildChangeSet } from '../../../src/core/changeset.js';

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
    label: 'European Society for Empirical Legal Studies',
    description: 'European society for empirical legal studies',
    classQid: 'Q955824', fieldQid: 'Q2734663', countryQid: 'Q55',
    website: 'https://esels.eu', email: 'contact@esels.eu',
    inception: '2021', referenceUrl: 'https://esels.eu/about',
  });
  d.president.qid = 'Q400';
  d.termStart = '2024-01-01';
  d.journal = { qid: null, label: 'European Journal of Empirical Legal Studies', url: 'https://esels.eu/ejels/', issn: null, referenceUrl: 'https://esels.eu/ejels/' };

  const cs = buildChangeSet(d, cfg);
  const assoc = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'assoc');
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

test('buildChangeSet throws on an invalid draft', () => {
  assert.throws(() => buildChangeSet(emptyDraft('create-association'), cfg), /association\.label is required/);
});

test('linking an EXISTING journal emits add-statements, not a create-item', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    label: 'Law and Society Association',
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
