import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../../../src/core/draft.js';
import { STEP_ORDER, validateStep } from '../../../src/ui/edit-wizard/steps.js';

test('STEP_ORDER for create-association has the six steps', () => {
  assert.deepEqual(STEP_ORDER['create-association'],
    ['identify', 'details', 'seat', 'people', 'journal', 'review']);
});

test('STEP_ORDER for update-field is a short path', () => {
  assert.deepEqual(STEP_ORDER['update-field'], ['identify', 'details', 'review']);
});

test('identify step requires an association identity', () => {
  const d = emptyDraft('create-association');
  assert.ok(validateStep('identify', d).includes('choose or name the association'));
  d.association.label = 'X';
  assert.equal(validateStep('identify', d).length, 0);
});

test('details step enforces reference and the personal-e-mail confirmation', () => {
  const d = emptyDraft('create-association');
  d.association.label = 'X';
  d.association.classQid = 'Q955824';
  d.association.fieldQid = 'Q2734663';
  assert.ok(validateStep('details', d).includes('a reference URL is required'));
  d.association.referenceUrl = 'https://x';
  d.association.email = 'jane.doe@uni.edu';
  assert.ok(validateStep('details', d).some((m) => /shared role address/.test(m)));
  d.association.emailConfirmedShared = true;
  assert.equal(validateStep('details', d).length, 0);
});

test('people step requires a president and, for a new person, a university + reference', () => {
  const d = emptyDraft('create-association');
  assert.ok(validateStep('people', d).includes('choose or name the president'));
  d.president.label = 'Jane';
  assert.ok(validateStep('people', d).includes('pick the president’s university'));
  d.president.universityQid = 'Q1';
  assert.ok(validateStep('people', d).includes('a reference URL for the new person is required'));
});
