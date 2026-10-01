import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderJournalCard } from '../../../src/ui/journal-card.js';

const journal = { qid: 'Q9', label: 'ZfRS', description: 'a journal', publisherQid: 'Q1', publisherLabel: 'Some Society', countryCode: 'DE', countryLabel: 'Germany' };

test('shows a loading placeholder before details arrive, and the always-visible editor section', () => {
  const out = renderJournalCard(journal, {}).value;
  assert.match(out, /Loading details…/);
  assert.match(out, /Loading…/); // editors section
  assert.doesNotMatch(out, /Edit journal/); // not in edit mode
});

test('renders founded–closed, ISSN, website (with as-of date) and an OpenAlex link once details arrive', () => {
  const details = { founded: '1995', closed: '2010', issn: '1234-5678', website: 'https://zfrs.example', websiteAsOf: '2026-10-01', openAlexId: 'S58239531', publisherQid: null, publisherLabel: null };
  const out = renderJournalCard(journal, { details }).value;
  assert.match(out, /1995 – 2010/);
  assert.match(out, /ISSN: 1234-5678/);
  assert.match(out, /as of 2026-10-01/);
  assert.match(out, /openalex\.org\/S58239531/);
  assert.doesNotMatch(out, /Loading details…/);
});

test('"published by" is an in-app button, not an external link', () => {
  const out = renderJournalCard(journal, { details: {} }).value;
  assert.match(out, /data-action="select-association" data-qid="Q1"/);
  assert.match(out, />Some Society</);
});

test('lists editor history rows once loaded, or "No editors recorded" when empty', () => {
  const withEditors = renderJournalCard(journal, { details: {}, editorHistory: [{ roleLabel: 'Editor-in-chief', personLabel: 'Jane Roe', begin: '2020-01-01', end: null }] }).value;
  assert.match(withEditors, /Editor-in-chief: Jane Roe, 2020-01-01 – present/);
  const empty = renderJournalCard(journal, { details: {}, editorHistory: [] }).value;
  assert.match(empty, /No editors recorded/);
});

test('a load error shows a retry button instead of the loading placeholder', () => {
  const out = renderJournalCard(journal, { loadError: 'offline' }).value;
  assert.match(out, /offline/);
  assert.match(out, /data-role="retry-journal-load" data-qid="Q9"/);
  assert.doesNotMatch(out, /Loading details…/);
});

test('edit mode adds "Edit journal" and "Manage editors" buttons', () => {
  const out = renderJournalCard(journal, { editMode: true, details: {} }).value;
  assert.match(out, /data-action="edit-journal" data-qid="Q9"/);
  assert.match(out, /data-action="manage-editors" data-qid="Q9"/);
});
