import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../../scripts/refresh-snapshot.mjs';

test('buildSnapshot wraps associations with a generatedAt date', () => {
  const snap = buildSnapshot([{ qid: 'Q1' }], () => new Date('2026-09-02T00:00:00Z'));
  assert.equal(snap.generatedAt, '2026-09-02');
  assert.deepEqual(snap.associations, [{ qid: 'Q1' }]);
});
