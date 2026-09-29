import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../../../src/core/draft.js';
import { STEP_ORDER, validateStep } from '../../../src/ui/edit-wizard/steps.js';

test('STEP_ORDER for create-association: place comes before details (the country suggests the language)', () => {
  assert.deepEqual(STEP_ORDER['create-association'], ['identify', 'place', 'details', 'review']);
});

test('STEP_ORDER for update-field skips identify (the item is already known)', () => {
  assert.deepEqual(STEP_ORDER['update-field'], ['details', 'review']);
});

test('identify step requires an association identity', () => {
  const d = emptyDraft('create-association');
  assert.ok(validateStep('identify', d).includes('choose or name the association'));
  d.association.identifyName = 'X';
  assert.equal(validateStep('identify', d).length, 0);
});

test('details step enforces reference and the personal-e-mail confirmation', () => {
  const d = emptyDraft('create-association');
  d.association.labels = { pt: 'X' };
  d.association.classQid = 'Q955824';
  d.association.fieldQid = 'Q847034';
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

test('place step needs a country or a seat', () => {
  const d = emptyDraft('create-association');
  assert.ok(validateStep('place', d).includes('set a fixed seat or a country'));
  d.association.countryQid = 'Q155';
  assert.equal(validateStep('place', d).length, 0);
});

test('details step (create) needs a name in at least one language, but not English specifically', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, { classQid: 'Q1', fieldQid: 'Q2', referenceUrl: 'https://x' });
  assert.ok(validateStep('details', d).includes('give the association a name in at least one language'));
  d.association.labels = { pt: 'Rede' };
  assert.equal(validateStep('details', d).length, 0);
});

test('details step (edit): nothing changed is an error; a term-only change is valid without a reference', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', original: { labels: { en: 'A' }, descriptions: {}, website: null, email: null }, labels: { en: 'A' } });
  assert.ok(validateStep('details', d).includes('change at least one field'));
  d.association.labels = { en: 'A', de: 'B' };
  assert.deepEqual(validateStep('details', d), []);
  d.association.website = 'https://new.example';
  assert.ok(validateStep('details', d).includes('a reference URL is required'));
});

test('an already-stored personal-looking e-mail does not block an unrelated edit', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, {
    qid: 'Q1', original: { labels: { en: 'A' }, descriptions: {}, website: null, email: 'jane.doe@uni.edu' },
    labels: { en: 'A', de: 'B' }, email: 'jane.doe@uni.edu',
  });
  assert.deepEqual(validateStep('details', d), []);
});

test('details step (edit): adding to the directory counts as a change and needs a reference', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', classQid: 'Q955824', fieldQid: 'Q847034', addToDirectory: true });
  d.association.original.needsClass = true;
  assert.deepEqual(validateStep('details', d), ['a reference URL is required']);
  d.association.referenceUrl = 'https://x';
  assert.deepEqual(validateStep('details', d), []);
});

test('details step: a former name is a change; it needs a reference and valid years', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', formerNames: [{ text: 'Old', lang: 'pt', start: '2010', end: '1995', alias: false }] });
  const errs = validateStep('details', d);
  assert.ok(errs.includes('a reference URL is required'));
  assert.ok(errs.some((e) => /end year is before the start year/.test(e)));
  assert.ok(!errs.includes('change at least one field'));
  d.association.formerNames[0] = { text: 'Old', lang: 'pt', start: '1995', end: '2010', alias: false };
  d.association.referenceUrl = 'https://x';
  assert.deepEqual(validateStep('details', d), []);
});

test('an untouched blank former-name row is ignored', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', formerNames: [{ text: '', lang: 'en', start: '', end: '', alias: true }] });
  assert.deepEqual(validateStep('details', d), ['change at least one field']);
});
