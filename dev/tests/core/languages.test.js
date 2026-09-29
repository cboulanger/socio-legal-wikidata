import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidLangCode, languageName, initialLanguages, languageSuggestions } from '../../../src/core/languages.js';

test('isValidLangCode accepts Wikimedia codes and rejects junk', () => {
  for (const ok of ['en', 'pt', 'pt-br', 'zh-hans', 'nds']) assert.equal(isValidLangCode(ok), true, ok);
  for (const bad of ['', 'E', 'EN', 'e', 'english', 'pt_br', 'pt-', 'a b', null, undefined]) assert.equal(isValidLangCode(bad), false, String(bad));
});

test('languageName returns the language name, or the code when unknown', () => {
  assert.match(languageName('de'), /German/);
  assert.equal(languageName('not a code'), 'not a code');
});

test('initialLanguages: national first, English second, then existing alphabetically, no duplicates', () => {
  assert.deepEqual(initialLanguages({ official: ['pt'], existing: ['fr', 'en', 'de'] }), ['pt', 'en', 'de', 'fr']);
  assert.deepEqual(initialLanguages({ official: [], existing: [] }), ['en']);
  assert.deepEqual(initialLanguages({ official: ['en'], existing: ['en'] }), ['en']);
});

test('languageSuggestions lists official languages not yet shown', () => {
  assert.deepEqual(languageSuggestions({ official: ['de', 'fr', 'it'], shown: ['de', 'en'] }), ['fr', 'it']);
});
