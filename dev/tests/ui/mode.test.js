import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMode } from '../../../src/ui/mode.js';

const authWithSession = { hasSession: () => true, restore: async () => true };
const authNoSession = { hasSession: () => false, restore: async () => false };

test('trigger "param": edit only when the edit param is present', async () => {
  const cfg = { editTrigger: 'param', editParam: 'edit' };
  assert.equal(await detectMode({ location: { search: '?edit' }, auth: authNoSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '' }, auth: authWithSession, config: cfg }), 'read');
});

test('trigger "session": edit only when a stored session restores', async () => {
  const cfg = { editTrigger: 'session', editParam: 'edit' };
  assert.equal(await detectMode({ location: { search: '' }, auth: authWithSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '?edit' }, auth: authNoSession, config: cfg }), 'read');
});

test('trigger "either": session wins, otherwise param', async () => {
  const cfg = { editTrigger: 'either', editParam: 'edit' };
  assert.equal(await detectMode({ location: { search: '' }, auth: authWithSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '?edit' }, auth: authNoSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '' }, auth: authNoSession, config: cfg }), 'read');
});
