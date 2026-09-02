import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksPersonal } from '../../../src/core/email-guard.js';

test('free-mail domains are flagged', () => {
  assert.equal(looksPersonal('someone@gmail.com'), true);
  assert.equal(looksPersonal('a.b@googlemail.com'), true);
  assert.equal(looksPersonal('x@outlook.com'), true);
});

test('name-shaped local part on any domain is flagged', () => {
  assert.equal(looksPersonal('jane.doe@university.edu'), true);
  assert.equal(looksPersonal('j.smith@some-lab.org'), true);
});

test('role/office addresses are not flagged', () => {
  assert.equal(looksPersonal('info@rechtssoziologie.info'), false);
  assert.equal(looksPersonal('admin@slsa.ac.uk'), false);
  assert.equal(looksPersonal('lsa@lawandsociety.org'), false);
});

test('non-strings are not flagged', () => {
  assert.equal(looksPersonal(''), false);
  assert.equal(looksPersonal(null), false);
});
