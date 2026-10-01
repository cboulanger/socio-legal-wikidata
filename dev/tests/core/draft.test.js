import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, validateDraftForChangeset, changedTerms, changedStatements, originalFromEntity, cleanTerms, scopeStatements, hasScopeChanges, activeFormerNames, validateFormerNames, aliasesToSet, changedAbbreviations, emptyOfficerRow, leadershipClaimsFromEntity, emptyJournalEntity, emptyEditorRow, journalOriginalFromEntity, editorClaimsFromEntity, hasJournalTermChanges, hasJournalFieldChanges, hasJournalScopeChanges } from '../../../src/core/draft.js';

test('emptyDraft has a mode and nested association/journal', () => {
  const d = emptyDraft('create-association');
  assert.equal(d.mode, 'create-association');
  assert.equal(d.association.qid, null);
  assert.equal(d.journalEntity, null);
});

test('validateDraftForChangeset: create-association requires a name, class, field, reference', () => {
  const d = emptyDraft('create-association');
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.labels: at least one name is required'));
  assert.ok(errs.includes('association.referenceUrl is required'));
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

test('emptyDraft("manage-leadership") starts with an empty officers list and no loaded original', () => {
  const d = emptyDraft('manage-leadership');
  assert.deepEqual(d.officers, []);
  assert.equal(d.leadershipOriginal, null);
});

test('emptyOfficerRow seeds a blank row with the given default office', () => {
  const row = emptyOfficerRow('Q1255921', 'President');
  assert.equal(row.officeQid, 'Q1255921');
  assert.equal(row.officeLabel, 'President');
  assert.equal(row.begin, '');
  assert.equal(row.end, null);
  assert.equal(row.person.qid, null);
  assert.deepEqual(row.person.labels, {});
});

test('leadershipClaimsFromEntity parses P488 claims with P580/P582/P3831 qualifiers', () => {
  const entity = {
    claims: {
      P488: [
        {
          id: 'Q100$A', rank: 'normal',
          mainsnak: { datavalue: { value: { id: 'Q5' } } },
          qualifiers: {
            P580: [{ datavalue: { value: { time: '+1995-06-01T00:00:00Z' } } }],
            P582: [{ datavalue: { value: { time: '+2010-01-15T00:00:00Z' } } }],
            P3831: [{ datavalue: { value: { id: 'Q140686' } } }],
          },
        },
        {
          id: 'Q100$B', rank: 'normal',
          mainsnak: { datavalue: { value: { id: 'Q9' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+2010-01-15T00:00:00Z' } } }] },
        },
        { id: 'Q100$C', rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q999' } } } },
      ],
    },
  };
  const rows = leadershipClaimsFromEntity(entity);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { statementId: 'Q100$A', personQid: 'Q5', officeQid: 'Q140686', begin: '1995-06-01', end: '2010-01-15' });
  assert.deepEqual(rows[1], { statementId: 'Q100$B', personQid: 'Q9', officeQid: null, begin: '2010-01-15', end: null });
});

test('leadershipClaimsFromEntity on an entity with no P488 claims returns []', () => {
  assert.deepEqual(leadershipClaimsFromEntity({ claims: {} }), []);
  assert.deepEqual(leadershipClaimsFromEntity({}), []);
});

test('validateDraftForChangeset: manage-leadership requires at least one officeholder row', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  assert.ok(validateDraftForChangeset(d).includes('add at least one officeholder'));
});

test('validateDraftForChangeset: manage-leadership — an existing person only needs office + begin date', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  d.officers.push({ ...emptyOfficerRow('Q1255921', 'President'), person: { ...emptyOfficerRow('Q1', '').person, qid: 'Q200' }, begin: '2024-01-01' });
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership — a new person needs affiliation or ORCID', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.labels = { en: 'Jane Roe' };
  row.begin = '2024-01-01';
  d.officers.push(row);
  assert.ok(validateDraftForChangeset(d).includes('a new officeholder needs an affiliation or an ORCID iD'));
  row.person.orcid = '0000-0002-1825-0097';
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership — begin is required, end must not precede begin', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.qid = 'Q200';
  d.officers.push(row);
  assert.ok(validateDraftForChangeset(d).includes('the term needs a valid begin date'));
  row.begin = '2024-06-01';
  row.end = '2024-01-01';
  assert.ok(validateDraftForChangeset(d).includes('the end date is before the begin date'));
  row.end = '2024-12-31';
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership — at most one row may be left open (current)', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  const row = (qid) => ({ ...emptyOfficerRow('Q1255921', 'President'), person: { ...emptyOfficerRow('Q1', '').person, qid }, begin: '2024-01-01' });
  d.officers.push(row('Q200'), row('Q300'));
  assert.ok(validateDraftForChangeset(d).includes('only one officeholder can be the current one — give the others an end date'));
  d.officers[0].end = '2024-06-30'; // after its own begin (2024-01-01) — a closed past term
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership requires a reference URL once any row is present', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.qid = 'Q200';
  row.begin = '2024-01-01';
  d.officers.push(row);
  assert.ok(validateDraftForChangeset(d).includes('association.referenceUrl is required'));
});

test('emptyJournalEntity / emptyEditorRow seed blank shapes', () => {
  const j = emptyJournalEntity('Q100');
  assert.equal(j.qid, 'Q100');
  assert.deepEqual(j.labels, {});
  assert.equal(j.addToDirectory, false);
  const row = emptyEditorRow('Q589298', 'Editor-in-chief');
  assert.equal(row.roleQid, 'Q589298');
  assert.equal(row.begin, '');
  assert.equal(row.end, null);
});

test('journalOriginalFromEntity reads title, website+P585, ISSN, founded/closed years, OpenAlex id and publisher', () => {
  const entity = {
    labels: { en: { language: 'en', value: 'Example Journal' } },
    descriptions: { en: { language: 'en', value: 'a journal' } },
    claims: {
      P856: [{ rank: 'normal', mainsnak: { datavalue: { value: 'https://example.org' } }, qualifiers: { P585: [{ datavalue: { value: { time: '+2026-10-01T00:00:00Z' } } }] } }],
      P236: [{ rank: 'normal', mainsnak: { datavalue: { value: '2666-1861' } } }],
      P571: [{ rank: 'normal', mainsnak: { datavalue: { value: { time: '+2020-00-00T00:00:00Z', precision: 9 } } } }],
      P576: [{ rank: 'normal', mainsnak: { datavalue: { value: { time: '+2023-00-00T00:00:00Z', precision: 9 } } } }],
      P10283: [{ rank: 'normal', mainsnak: { datavalue: { value: 'S58239531' } } }],
      P123: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q2867822' } } } }],
      P31: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q737498' } } } }],
      P921: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q847034' } } } }],
    },
  };
  assert.deepEqual(journalOriginalFromEntity(entity), {
    labels: { en: 'Example Journal' }, descriptions: { en: 'a journal' },
    website: 'https://example.org', websiteAsOf: '2026-10-01',
    issn: '2666-1861', founded: '2020', closed: '2023', openAlexId: 'S58239531',
    publisherQid: 'Q2867822', classQids: ['Q737498'], fieldQids: ['Q847034'],
  });
  assert.deepEqual(journalOriginalFromEntity({}), {
    labels: {}, descriptions: {}, website: null, websiteAsOf: null, issn: null, founded: null, closed: null,
    openAlexId: null, publisherQid: null, classQids: [], fieldQids: [],
  });
});

test('editorClaimsFromEntity parses P98 claims with P580/P582/P3831 qualifiers', () => {
  const entity = {
    claims: {
      P98: [
        {
          id: 'Q100$A', rank: 'normal',
          mainsnak: { datavalue: { value: { id: 'Q5' } } },
          qualifiers: {
            P580: [{ datavalue: { value: { time: '+2020-01-01T00:00:00Z' } } }],
            P3831: [{ datavalue: { value: { id: 'Q589298' } } }],
          },
        },
        { id: 'Q100$B', rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q999' } } } },
      ],
    },
  };
  const rows = editorClaimsFromEntity(entity);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { statementId: 'Q100$A', personQid: 'Q5', roleQid: 'Q589298', begin: '2020-01-01', end: null });
  assert.deepEqual(editorClaimsFromEntity({}), []);
});

test('hasJournalTermChanges / hasJournalFieldChanges / hasJournalScopeChanges', () => {
  const j = emptyJournalEntity('Q100');
  j.original = { labels: { en: 'Old' }, descriptions: {}, website: null, issn: null, founded: null, closed: null, openAlexId: null, publisherQid: null, needsClass: true, needsField: false };
  assert.equal(hasJournalTermChanges(j), false);
  assert.equal(hasJournalFieldChanges(j), false);
  assert.equal(hasJournalScopeChanges(j), false); // not ticked yet
  j.labels = { en: 'New' };
  assert.equal(hasJournalTermChanges(j), true);
  j.issn = '1234-5678';
  assert.equal(hasJournalFieldChanges(j), true);
  j.addToDirectory = true;
  assert.equal(hasJournalScopeChanges(j), true);
});

test('validateDraftForChangeset: create-journal requires a title and reference URL', () => {
  const d = emptyDraft('create-journal');
  d.journalEntity = emptyJournalEntity();
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('journal.labels: at least one title is required'));
  assert.ok(errs.includes('journal.referenceUrl is required'));
  d.journalEntity.labels = { en: 'X' };
  d.journalEntity.referenceUrl = 'https://x.example';
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-journal-editors groups the "one open row" rule by role', () => {
  const d = emptyDraft('manage-journal-editors');
  d.journalEntity = emptyJournalEntity('Q100');
  d.journalEntity.referenceUrl = 'https://x.example';
  const row = (roleQid, qid) => ({ ...emptyEditorRow(roleQid, ''), person: { ...emptyEditorRow('Q1', '').person, qid }, begin: '2024-01-01' });
  d.editors.push(row('Q589298', 'Q200'), row('Q75792065', 'Q300'));
  assert.deepEqual(validateDraftForChangeset(d), []); // different roles, both open: fine
  d.editors.push(row('Q589298', 'Q400'));
  assert.ok(validateDraftForChangeset(d).includes('only one editor per role can be current — give the others an end date'));
});
