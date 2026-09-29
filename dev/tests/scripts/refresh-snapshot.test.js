import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, attachLastEdits } from '../../../scripts/refresh-snapshot.mjs';

test('buildSnapshot wraps associations with a generatedAt date', () => {
  const snap = buildSnapshot([{ qid: 'Q1' }], () => new Date('2026-09-02T00:00:00Z'));
  assert.equal(snap.generatedAt, '2026-09-02');
  assert.deepEqual(snap.associations, [{ qid: 'Q1' }]);
});

const edit = (revid) => ({ revid, user: 'Panyasan', anon: false, userHidden: false, timestamp: '2026-09-29T12:50:46Z', comment: '' });

test('attachLastEdits adds the latest revision to each association', () => {
  const out = attachLastEdits([{ qid: 'Q1' }, { qid: 'Q2' }], { Q1: edit(1), Q2: edit(2) });
  assert.deepEqual(out.map((a) => a.lastEdit.revid), [1, 2]);
});

test('attachLastEdits keeps the previous snapshot value for items it could not look up, and omits the field if there is none', () => {
  const out = attachLastEdits([{ qid: 'Q1' }, { qid: 'Q2' }, { qid: 'Q3' }], { Q1: edit(10) }, [{ qid: 'Q2', lastEdit: edit(7) }]);
  assert.equal(out[0].lastEdit.revid, 10);   // fresh
  assert.equal(out[1].lastEdit.revid, 7);    // carried over
  assert.equal('lastEdit' in out[2], false); // nothing known
});
