import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuickStatementsWriter, encodePayload } from '../../../src/adapters/quickstatements-handoff.js';

const config = { quickstatementsUrl: 'https://quickstatements.toolforge.org/#/v1=' };

test('encodePayload URL-encodes with TAB as %09 and newline as %7C', () => {
  assert.equal(encodePayload('Q1\tP31\tQ5\nQ1\tP17\tQ183'), 'Q1%09P31%09Q5%7CQ1%09P17%09Q183');
});

test('applyChangeSet opens the QS URL and returns a quickstatements result', async () => {
  let opened = null;
  const win = { open: (u) => { opened = u; return {}; } };
  const writer = createQuickStatementsWriter({ window: win, config });
  const cs = { summary: 's', ops: [
    { type: 'add-statement', target: { qid: 'Q1' }, property: 'P17', value: { kind: 'item', qid: 'Q183' } },
  ]};
  const res = await writer.applyChangeSet(cs);
  assert.equal(res.via, 'quickstatements');
  assert.equal(opened, res.handoffUrl);
  assert.ok(res.handoffUrl.startsWith('https://quickstatements.toolforge.org/#/v1='));
  assert.ok(res.handoffUrl.includes('Q1%09P17%09Q183'));
});
