import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { publishedJournalsFrom, mergeJournals } from '../../../src/core/journals.js';

test('publishedJournalsFrom inherits the publishing association\'s country', () => {
  const a = { ...emptyAssociation('Q1'), label: 'ESELS', countryCode: 'DE', countryLabel: 'Germany', journal: { qid: 'Q2', label: 'EJELS', url: null, issn: null } };
  const b = { ...emptyAssociation('Q3'), label: 'No Journal Assoc' };
  const rows = publishedJournalsFrom([a, b]);
  assert.deepEqual(rows, [{ qid: 'Q2', label: 'EJELS', description: '', publisherQid: 'Q1', publisherLabel: 'ESELS', countryCode: 'DE', countryLabel: 'Germany' }]);
});

test('mergeJournals dedupes by qid, pool B wins on overlap', () => {
  const poolA = [{ qid: 'Q2', label: 'EJELS (assoc copy)', description: '', publisherQid: 'Q1', publisherLabel: 'ESELS', countryCode: 'DE', countryLabel: 'Germany' }];
  const poolB = [{ qid: 'Q2', label: 'EJELS', description: 'a journal', publisherQid: 'Q1', publisherLabel: 'ESELS', countryCode: 'FR', countryLabel: 'France' }];
  const merged = mergeJournals(poolA, poolB);
  assert.deepEqual(merged, poolB);
});

test('mergeJournals keeps pool A\'s country when pool B\'s row has none', () => {
  const poolA = [{ qid: 'Q2', label: 'EJELS', description: '', publisherQid: 'Q1', publisherLabel: 'ESELS', countryCode: 'DE', countryLabel: 'Germany' }];
  const poolB = [{ qid: 'Q2', label: 'EJELS', description: 'a journal', publisherQid: null, publisherLabel: null, countryCode: null, countryLabel: null }];
  const merged = mergeJournals(poolA, poolB);
  assert.deepEqual(merged, [{ qid: 'Q2', label: 'EJELS', description: 'a journal', publisherQid: null, publisherLabel: null, countryCode: 'DE', countryLabel: 'Germany' }]);
});

test('mergeJournals keeps independent journals (pool B only) and sorts by label', () => {
  const poolA = [{ qid: 'Q2', label: 'Zeta Journal', description: '', publisherQid: 'Q1', publisherLabel: 'ESELS', countryCode: 'DE', countryLabel: 'Germany' }];
  const poolB = [{ qid: 'Q9', label: 'Alpha Journal', description: '', publisherQid: null, publisherLabel: null, countryCode: 'US', countryLabel: 'United States' }];
  const merged = mergeJournals(poolA, poolB);
  assert.deepEqual(merged.map((j) => j.qid), ['Q9', 'Q2']);
});
