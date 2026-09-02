import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize } from '../../../src/core/quickstatements.js';

test('add-statement with qualifier and reference on an existing item', () => {
  const cs = { summary: 's', ops: [
    { type: 'add-statement', target: { qid: 'Q100' }, property: 'P488', value: { kind: 'item', qid: 'Q200' },
      qualifiers: [{ property: 'P580', value: { kind: 'time', value: '2026-01-01', precision: 11 } }],
      reference: { P854: 'https://ref.example' } },
  ]};
  assert.equal(serialize(cs).trim(), 'Q100\tP488\tQ200\tP580\t+2026-01-01T00:00:00Z/11\tS854\t"https://ref.example"');
});

test('end-statement is expressed as a qualifier add keyed by the statement subject/prop', () => {
  const cs = { summary: 's', ops: [
    { type: 'end-statement', statementId: 'Q100$GUID', endDate: '2026-01-01' },
  ]};
  assert.match(serialize(cs), /# end statement Q100\$GUID with P582 \+2026-01-01T00:00:00Z\/11 \(apply in the QuickStatements UI\)/);
});

test('single create-item emits CREATE + LAST lines', () => {
  const cs = { summary: 's', ops: [
    { type: 'create-item', ref: 'person', labels: { en: 'Jane Roe' }, descriptions: { en: 'researcher' },
      claims: [
        { property: 'P31', value: { kind: 'item', qid: 'Q5' } },
        { property: 'P856', value: { kind: 'url', value: 'https://u/roe' } },
      ] },
  ]};
  assert.equal(serialize(cs).trim().split('\n').join('|'),
    'CREATE|LAST\tLen\t"Jane Roe"|LAST\tDen\t"researcher"|LAST\tP31\tQ5|LAST\tP856\t"https://u/roe"');
});

test('a ref to a previously created item resolves to LAST only if it is the immediately preceding CREATE', () => {
  const cs = { summary: 's', ops: [
    { type: 'create-item', ref: 'person', labels: { en: 'P' }, descriptions: {}, claims: [] },
    { type: 'create-item', ref: 'assoc', labels: { en: 'A' }, descriptions: {},
      claims: [{ property: 'P488', value: { kind: 'item', ref: 'person' } }] },
  ]};
  const out = serialize(cs);
  assert.match(out, /# MANUAL: after import, add P488 -> \(new item "person"\) on new item "assoc"/);
});
