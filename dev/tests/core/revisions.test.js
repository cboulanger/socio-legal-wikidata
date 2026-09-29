import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisionUrl, historyUrl, userUrl, parseLastRevision, parseLastRevisions } from '../../../src/core/revisions.js';

test('links point at the specific revision, the history and the editor', () => {
  assert.equal(revisionUrl('Q141260089', 2550864341), 'https://www.wikidata.org/w/index.php?title=Q141260089&oldid=2550864341');
  assert.equal(historyUrl('Q141260089'), 'https://www.wikidata.org/w/index.php?title=Q141260089&action=history');
  assert.equal(userUrl({ user: 'Panyasan', anon: false }), 'https://www.wikidata.org/wiki/User:Panyasan');
  assert.equal(userUrl({ user: 'Jane Roe', anon: false }), 'https://www.wikidata.org/wiki/User:Jane_Roe');
  assert.equal(userUrl({ user: '203.0.113.7', anon: true }), 'https://www.wikidata.org/wiki/Special:Contributions/203.0.113.7');
});

const response = {
  query: { pages: [{
    title: 'Q141260089',
    revisions: [{ revid: 2550864341, user: 'Panyasan', timestamp: '2026-09-29T12:50:46Z', comment: 'update names (de)' }],
  }] },
};

test('parseLastRevision reads the latest revision', () => {
  assert.deepEqual(parseLastRevision(response), {
    revid: 2550864341, user: 'Panyasan', anon: false, userHidden: false,
    timestamp: '2026-09-29T12:50:46Z', comment: 'update names (de)',
  });
});

test('parseLastRevision copes with missing pages, hidden users and hidden comments', () => {
  assert.equal(parseLastRevision({}), null);
  assert.equal(parseLastRevision({ query: { pages: [{ title: 'Q1', missing: true }] } }), null);
  const hidden = parseLastRevision({ query: { pages: [{ revisions: [{ revid: 5, timestamp: '2026-01-01T00:00:00Z', userhidden: true, commenthidden: true, comment: 'x' }] }] } });
  assert.equal(hidden.userHidden, true);
  assert.equal(hidden.user, '');
  assert.equal(hidden.comment, '');
});

test('parseLastRevisions keys every page by its QID and skips pages without a revision', () => {
  const out = parseLastRevisions({ query: { pages: [
    { title: 'Q1', revisions: [{ revid: 1, user: 'A', timestamp: '2026-01-01T00:00:00Z' }] },
    { title: 'Q2', missing: true },
    { title: 'Q3', revisions: [{ revid: 3, user: 'C', timestamp: '2026-03-03T00:00:00Z' }] },
  ] } });
  assert.deepEqual(Object.keys(out), ['Q1', 'Q3']);
  assert.equal(out.Q3.user, 'C');
});
