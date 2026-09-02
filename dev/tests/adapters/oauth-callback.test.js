import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCallback } from '../../../src/adapters/oauth-callback.js';

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const config = { oauth: { tokenUrl: 'https://meta.example/token', clientId: 'abc', redirectUri: 'https://app.example/callback.html' } };

test('exchanges the code, stores the refresh token, returns the post-login target', async () => {
  const storage = memStorage({ 'slw:oauth:verifier': 'VER', 'slw:oauth:state': 'STATE' });
  const location = { search: '?code=CODE&state=STATE', origin: 'https://app.example' };
  const fetch = async (url, init) => {
    assert.equal(url, 'https://meta.example/token');
    assert.match(init.body.toString(), /grant_type=authorization_code/);
    assert.match(init.body.toString(), /code=CODE/);
    assert.match(init.body.toString(), /code_verifier=VER/);
    return { ok: true, json: async () => ({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }) };
  };
  const target = await handleCallback({ location, storage, fetch, config });
  assert.equal(storage.getItem('slw:oauth:refresh'), 'R');
  assert.equal(storage.getItem('slw:oauth:verifier'), null);
  assert.equal(target, 'https://app.example/#/');
});

test('rejects on a state mismatch', async () => {
  const storage = memStorage({ 'slw:oauth:verifier': 'VER', 'slw:oauth:state': 'STATE' });
  const location = { search: '?code=CODE&state=OTHER', origin: 'https://app.example' };
  await assert.rejects(() => handleCallback({ location, storage, fetch: async () => ({}), config }), /state mismatch/);
});
