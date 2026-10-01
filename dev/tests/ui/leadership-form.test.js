import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, emptyOfficerRow } from '../../../src/core/draft.js';
import { renderLeadershipForm, applyLeadershipFieldInput } from '../../../src/ui/edit-wizard/leadership-form.js';

const config = { officeTypes: [{ qid: 'Q1255921', label: 'President' }, { qid: 'Q140686', label: 'Chairperson' }] };

test('renders one fieldset per officer row, an "already on Wikidata" list, and the office select', () => {
  const draft = emptyDraft('manage-leadership');
  draft.leadershipOriginal = { history: [{ statementId: 'Q1$A', personQid: 'Q9', personLabel: 'Old Pres', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null }], current: null };
  draft.officers.push(emptyOfficerRow('Q1255921', 'President'));
  const out = renderLeadershipForm({ draft, config }).value;
  assert.match(out, /Old Pres/);
  assert.match(out, /2018-01-01/);
  assert.match(out, /data-role="ta-officer-0"/); // no person chosen yet: search-first typeahead placeholder
  assert.match(out, /<option value="Q1255921"[^>]*selected[^>]*>President<\/option>/);
  assert.match(out, /Other — search Wikidata/);
});

test('an existing person (qid set) shows the person and affiliation picker placeholders (the wizard mounts their "chosen" state), not the new-person fields', () => {
  const draft = emptyDraft('manage-leadership');
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.qid = 'Q200';
  draft.officers.push(row);
  const out = renderLeadershipForm({ draft, config }).value;
  assert.match(out, /data-role="ta-officer-0"/);
  assert.match(out, /Current affiliation \(optional\)/);
  assert.match(out, /data-role="ta-officer-affiliation-0"/);
  assert.doesNotMatch(out, /New person/);
});

test('a new person (labels set, no qid) shows the create-person fields including birth date and ORCID', () => {
  const draft = emptyDraft('manage-leadership');
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.labels = { en: 'Jane Roe' };
  draft.officers.push(row);
  const out = renderLeadershipForm({ draft, config }).value;
  assert.match(out, /New person/);
  assert.match(out, /value="Jane Roe"/);
  assert.match(out, /type="date"[^>]*data-field="officer-birthdate"/);
  assert.match(out, /data-field="officer-orcid"/);
});

test('applyLeadershipFieldInput writes name, dates, office and reference fields into the right row', () => {
  const draft = emptyDraft('manage-leadership');
  draft.officers.push(emptyOfficerRow('Q1255921', 'President'));
  const set = (field, index, value, extra = {}) => applyLeadershipFieldInput(draft, { dataset: { field, index: String(index), ...extra }, value, selectedOptions: [{ textContent: 'Chairperson' }] });

  assert.equal(set('officer-name', 0, 'Jane Roe', { lang: 'en' }), true);
  assert.equal(draft.officers[0].person.labels.en, 'Jane Roe');

  assert.equal(set('officer-begin', 0, '2024-01-01'), true);
  assert.equal(draft.officers[0].begin, '2024-01-01');

  assert.equal(set('officer-end', 0, ''), true);
  assert.equal(draft.officers[0].end, null);

  assert.equal(set('officer-office', 0, 'Q140686'), true);
  assert.equal(draft.officers[0].officeQid, 'Q140686');
  assert.equal(draft.officers[0].officeLabel, 'Chairperson');

  assert.equal(set('referenceUrl', 0, ' https://x.example '), true);
  assert.equal(draft.association.referenceUrl, 'https://x.example');

  assert.equal(applyLeadershipFieldInput(draft, { dataset: {} }), false);
});

test('applyLeadershipFieldInput: choosing "Other" on the office select flags the row for the custom picker', () => {
  const draft = emptyDraft('manage-leadership');
  draft.officers.push(emptyOfficerRow('Q1255921', 'President'));
  const el = { dataset: { field: 'officer-office', index: '0' }, value: '__other__' };
  applyLeadershipFieldInput(draft, el);
  assert.equal(draft.officers[0]._customOffice, true);
});
