import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, validateDraftForChangeset } from '../../../src/core/draft.js';

test('emptyDraft has a mode and nested association/president/journal', () => {
  const d = emptyDraft('create-association');
  assert.equal(d.mode, 'create-association');
  assert.equal(d.association.qid, null);
  assert.equal(d.journal, null);
});

test('validateDraftForChangeset: create-association requires label, class, field, reference', () => {
  const d = emptyDraft('create-association');
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.label is required'));
  assert.ok(errs.includes('association.referenceUrl is required'));
});

test('validateDraftForChangeset: change-president requires association.qid, president identity, termStart', () => {
  const d = emptyDraft('change-president');
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.qid is required'));
  assert.ok(errs.includes('president identity is required'));
  assert.ok(errs.includes('termStart is required'));
});

test('a personal e-mail without emailConfirmedShared is an error', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q1';
  d.association.email = 'jane.doe@uni.edu';
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.some((e) => /personal/i.test(e)));
});

test('validateDraftForChangeset: update-field requires a reference URL', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q1';
  d.association.website = 'https://example.org';
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.referenceUrl is required'));
  d.association.referenceUrl = 'https://source.example/announcement';
  assert.equal(validateDraftForChangeset(d).length, 0);
});
