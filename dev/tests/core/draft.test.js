import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, validateDraftForChangeset, changedTerms, changedStatements, originalFromEntity, cleanTerms, scopeStatements, hasScopeChanges } from '../../../src/core/draft.js';

test('emptyDraft has a mode and nested association/president/journal', () => {
  const d = emptyDraft('create-association');
  assert.equal(d.mode, 'create-association');
  assert.equal(d.association.qid, null);
  assert.equal(d.journal, null);
});

test('validateDraftForChangeset: create-association requires a name, class, field, reference', () => {
  const d = emptyDraft('create-association');
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.labels: at least one name is required'));
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

test('create-association does not require a president', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, { labels: { pt: 'Rede' }, classQid: 'Q1', fieldQid: 'Q2', referenceUrl: 'https://x' });
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('update-field: a term-only change needs no reference URL; a language code and length are checked', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', original: { labels: {}, descriptions: {}, website: null, email: null }, labels: { de: 'Neu' } });
  assert.deepEqual(validateDraftForChangeset(d), []);
  d.association.labels = { 'DE!': 'x', en: 'y'.repeat(251) };
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.some((e) => /not a valid language code/.test(e)));
  assert.ok(errs.some((e) => /longer than 250/.test(e)));
});

test('update-field with nothing changed reports nothing to update', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', original: { labels: { en: 'A' }, descriptions: {}, website: 'https://a', email: null }, labels: { en: 'A' }, website: 'https://a' });
  assert.ok(validateDraftForChangeset(d).includes('nothing to update'));
});

test('changedTerms: blank means no change and unchanged values are dropped', () => {
  const a = emptyDraft('update-field').association;
  a.original.labels = { en: 'Same', de: 'Alt' };
  a.labels = { en: 'Same', de: 'Neu', fr: '  ' };
  assert.deepEqual(changedTerms(a).labels, { de: 'Neu' });
});

test('changedStatements compares e-mail without the mailto: prefix', () => {
  const a = emptyDraft('update-field').association;
  a.original.email = 'office@x.org';
  a.email = 'office@x.org';
  assert.equal(changedStatements(a).email, null);
  a.email = 'mailto:other@x.org';
  assert.equal(changedStatements(a).email, 'other@x.org');
});

test('originalFromEntity reads terms, website, e-mail (without mailto:) and country', () => {
  const entity = {
    labels: { pt: { language: 'pt', value: 'Rede' }, en: { language: 'en', value: 'Network' } },
    descriptions: { en: { language: 'en', value: 'a network' } },
    claims: {
      P856: [{ rank: 'normal', mainsnak: { datavalue: { value: 'https://reed.example' } } }],
      P968: [{ rank: 'normal', mainsnak: { datavalue: { value: 'mailto:reed@example.org' } } }],
      P17: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q155' } } } }],
      P31: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q43229' } } } }, { rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q1' } } } }],
      P101: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q2734663' } } } }],
    },
  };
  assert.deepEqual(originalFromEntity(entity), {
    labels: { pt: 'Rede', en: 'Network' }, descriptions: { en: 'a network' },
    website: 'https://reed.example', email: 'reed@example.org', countryQid: 'Q155',
    classQids: ['Q43229'], fieldQids: ['Q2734663'],
  });
  assert.deepEqual(originalFromEntity({}), { labels: {}, descriptions: {}, website: null, email: null, countryQid: null, classQids: [], fieldQids: [] });
});

test('cleanTerms trims and drops blanks', () => {
  assert.deepEqual(cleanTerms({ en: ' A ', de: '', fr: '  ' }), { en: 'A' });
});

test('scopeStatements only adds what is missing, and only when ticked', () => {
  const a = emptyDraft('update-field').association;
  Object.assign(a, { qid: 'Q1', classQid: 'Q955824', fieldQid: 'Q2734663' });
  a.original.needsClass = true;
  a.original.needsField = false;
  assert.deepEqual(scopeStatements(a), { class: null, field: null });      // not ticked
  a.addToDirectory = true;
  assert.deepEqual(scopeStatements(a), { class: 'Q955824', field: null }); // field already there
  assert.equal(hasScopeChanges(a), true);
  a.original.needsClass = false;
  assert.equal(hasScopeChanges(a), false);                                 // nothing missing: ticking changes nothing
});

test('update-field: adding to the directory counts as a change and needs a reference URL', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', classQid: 'Q955824', fieldQid: 'Q2734663', addToDirectory: true });
  d.association.original.needsClass = true;
  d.association.original.needsField = true;
  assert.deepEqual(validateDraftForChangeset(d), ['association.referenceUrl is required']);
  d.association.referenceUrl = 'https://x.example';
  assert.deepEqual(validateDraftForChangeset(d), []);
});
