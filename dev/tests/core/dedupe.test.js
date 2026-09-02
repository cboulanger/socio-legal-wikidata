import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLabel, similarity, rankCandidates, isLikelyDuplicate } from '../../../src/core/dedupe.js';

test('normalizeLabel folds case, diacritics, punctuation, whitespace', () => {
  assert.equal(normalizeLabel('  Société  Française de  Droit '), 'societe francaise de droit');
  assert.equal(normalizeLabel('Law & Society Assoc.'), 'law society assoc');
});

test('similarity is 1 for equal normalized strings and lower for different', () => {
  assert.equal(similarity('Law and Society', 'law and society'), 1);
  assert.ok(similarity('Law and Society Association', 'Law & Society Assoc') > 0.6);
  assert.ok(similarity('Law and Society', 'Philosophy of Law') < 0.5);
});

test('rankCandidates sorts by descending similarity to the query', () => {
  const cands = [
    { qid: 'Q1', label: 'Asian Law Institute', description: '' },
    { qid: 'Q2', label: 'Asian Law and Society Association', description: '' },
  ];
  const ranked = rankCandidates('Asian Law and Society Association', cands);
  assert.deepEqual(ranked.map((c) => c.qid), ['Q2', 'Q1']);
  assert.ok(ranked[0].score >= ranked[1].score);
});

test('isLikelyDuplicate true when a candidate scores above the threshold', () => {
  const cands = [{ qid: 'Q2', label: 'Law & Society Assoc', description: '' }];
  assert.equal(isLikelyDuplicate('Law and Society Association', cands, 0.6), true);
  assert.equal(isLikelyDuplicate('Sociology of Law Section', cands, 0.6), false);
});
