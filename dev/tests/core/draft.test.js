import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, validateDraftForChangeset, changedTerms, changedStatements, originalFromEntity, cleanTerms, scopeStatements, hasScopeChanges, activeFormerNames, validateFormerNames, aliasesToSet, changedAbbreviations } from '../../../src/core/draft.js';

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
      P101: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q847034' } } } }],
      P361: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q1202999' } } } }],
      P2541: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q48' } } } }],
      P1813: [{ rank: 'normal', mainsnak: { datavalue: { value: { text: 'REED', language: 'pt' } } } }],
    },
  };
  assert.deepEqual(originalFromEntity(entity), {
    labels: { pt: 'Rede', en: 'Network' }, descriptions: { en: 'a network' },
    website: 'https://reed.example', email: 'reed@example.org', parentQid: 'Q1202999', operatingAreaQid: 'Q48', countryQid: 'Q155',
    classQids: ['Q43229'], fieldQids: ['Q847034'], aliases: {}, abbreviations: { pt: ['REED'] }, formerNames: [],
  });
  assert.deepEqual(originalFromEntity({}), {
    labels: {}, descriptions: {}, website: null, email: null, parentQid: null, operatingAreaQid: null, countryQid: null, classQids: [], fieldQids: [],
    aliases: {}, abbreviations: {}, formerNames: [],
  });
});

test('changedAbbreviations ignores blanks and abbreviations already on the item; new ones also become aliases', () => {
  const a = emptyDraft('update-field').association;
  a.original.abbreviations = { en: ['ALSA'] };
  a.original.aliases = { de: ['Alt'] };
  a.labels = { en: 'Asian Law and Society Association', de: 'Asiatische Vereinigung' };
  a.abbreviations = { en: 'ALSA', de: ' AVR ', fr: '  ' };
  assert.deepEqual(changedAbbreviations(a), { de: 'AVR' });
  assert.deepEqual(aliasesToSet(a), { de: ['Alt', 'AVR'] });
});

test('an abbreviation in an invalid language is rejected', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', referenceUrl: 'https://x.example', abbreviations: { 'not a code': 'X' } });
  assert.ok(validateDraftForChangeset(d).some((m) => /not a valid language code/.test(m)));
});

test('cleanTerms trims and drops blanks', () => {
  assert.deepEqual(cleanTerms({ en: ' A ', de: '', fr: '  ' }), { en: 'A' });
});

test('scopeStatements only adds what is missing, and only when ticked', () => {
  const a = emptyDraft('update-field').association;
  Object.assign(a, { qid: 'Q1', classQid: 'Q955824', fieldQid: 'Q847034' });
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
  Object.assign(d.association, { qid: 'Q1', classQid: 'Q955824', fieldQid: 'Q847034', addToDirectory: true });
  d.association.original.needsClass = true;
  d.association.original.needsField = true;
  assert.deepEqual(validateDraftForChangeset(d), ['association.referenceUrl is required']);
  d.association.referenceUrl = 'https://x.example';
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('originalFromEntity reads former names (P1448 with start/end years) and aliases', () => {
  const time = (y) => [{ datavalue: { value: { time: `+${y}-00-00T00:00:00Z`, precision: 9 } } }];
  const o = originalFromEntity({
    aliases: { de: [{ language: 'de', value: 'DGRS' }, { language: 'de', value: 'Gesellschaft' }] },
    claims: {
      P1448: [
        { rank: 'normal', mainsnak: { datavalue: { value: { text: 'Old Name', language: 'en' } } }, qualifiers: { P580: time('1995'), P582: time('2010') } },
        { rank: 'normal', mainsnak: { datavalue: { value: { text: 'Undated', language: 'de' } } } },
        { rank: 'deprecated', mainsnak: { datavalue: { value: { text: 'Wrong', language: 'en' } } } },
      ],
    },
  });
  assert.deepEqual(o.formerNames, [
    { text: 'Old Name', lang: 'en', start: '1995', end: '2010' },
    { text: 'Undated', lang: 'de', start: '', end: '' },
  ]);
  assert.deepEqual(o.aliases, { de: ['DGRS', 'Gesellschaft'] });
});

const withFormer = (rows, original = {}) => {
  const a = emptyDraft('update-field').association;
  Object.assign(a, { qid: 'Q1', formerNames: rows, labels: { pt: 'Novo Nome' } });
  Object.assign(a.original, original);
  return a;
};

test('activeFormerNames ignores blank rows and rows already recorded on the item', () => {
  const a = withFormer(
    [{ text: ' Old ', lang: 'PT', start: '1995', end: '2010' }, { text: '', lang: 'pt', start: '', end: '' }, { text: 'Known', lang: 'pt', start: '', end: '2000' }],
    { formerNames: [{ text: 'Known', lang: 'pt', start: '', end: '2000' }] },
  );
  assert.deepEqual(activeFormerNames(a), [{ text: 'Old', lang: 'pt', start: '1995', end: '2010', alias: false }]);
});

test('validateFormerNames checks the name, language, years and their order', () => {
  assert.deepEqual(validateFormerNames(withFormer([{ text: 'Old', lang: 'pt', start: '1995', end: '2010' }])), []);
  assert.deepEqual(validateFormerNames(withFormer([{ text: 'Old', lang: 'pt', start: '', end: '' }])), []);   // years are optional
  assert.ok(validateFormerNames(withFormer([{ text: '', lang: 'pt', start: '1990', end: '' }])).includes('a former name needs its name'));
  assert.ok(validateFormerNames(withFormer([{ text: 'Old', lang: 'Portuguese', start: '', end: '' }])).some((e) => /valid language code/.test(e)));
  assert.ok(validateFormerNames(withFormer([{ text: 'Old', lang: 'pt', start: '19x5', end: '' }])).some((e) => /not a year/.test(e)));
  assert.ok(validateFormerNames(withFormer([{ text: 'Old', lang: 'pt', start: '2010', end: '1995' }])).some((e) => /end year is before the start year/.test(e)));
});

test('aliasesToSet returns the full new list, skipping the current name and existing aliases', () => {
  const a = withFormer(
    [
      { text: 'Velho Nome', lang: 'pt', start: '', end: '2010', alias: true },
      { text: 'Velho Nome', lang: 'pt', start: '', end: '', alias: true },   // duplicate
      { text: 'Novo Nome', lang: 'pt', start: '2010', end: '', alias: true }, // it is the current name
      { text: 'Old', lang: 'en', start: '', end: '', alias: false },          // not ticked
      { text: 'Known', lang: 'de', start: '', end: '', alias: true },         // already an alias
    ],
    { aliases: { pt: ['Existente'], de: ['Known'] } },
  );
  assert.deepEqual(aliasesToSet(a), { pt: ['Existente', 'Velho Nome'] });
});

test('update-field: a former name is a change that needs a reference URL', () => {
  const d = emptyDraft('update-field');
  Object.assign(d.association, { qid: 'Q1', formerNames: [{ text: 'Old', lang: 'pt', start: '', end: '2010', alias: true }] });
  assert.deepEqual(validateDraftForChangeset(d), ['association.referenceUrl is required']);
  d.association.referenceUrl = 'https://x.example';
  assert.deepEqual(validateDraftForChangeset(d), []);
});
