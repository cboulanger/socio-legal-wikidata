import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/store.js';

test('createStore notifies subscribers on setState and merges shallowly', () => {
  const store = createStore({ a: 1, b: 2 });
  const seen = [];
  const off = store.subscribe((s) => seen.push({ ...s }));
  store.setState({ b: 3 });
  assert.deepEqual(store.getState(), { a: 1, b: 3 });
  assert.deepEqual(seen, [{ a: 1, b: 3 }]);
  off();
  store.setState({ a: 9 });
  assert.equal(seen.length, 1);
});

test('setState accepts an updater function', () => {
  const store = createStore({ n: 0 });
  store.setState((s) => ({ n: s.n + 1 }));
  assert.equal(store.getState().n, 1);
});
