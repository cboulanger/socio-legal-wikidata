import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { pkceChallenge, buildAuthorizeUrl, createAuth } from '../../../src/adapters/oauth-pkce.js';

const config = {
  oauth: {
    authorizeUrl: 'https://meta.example/authorize',
    tokenUrl: 'https://meta.example/token',
    clientId: 'abc123',
    redirectUri: 'https://app.example/callback.html',
    scopes: 'basic editpage',
  },
  tokenPersistence: 'persistent',
};

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('pkceChallenge returns a verifier and its S256 challenge', async () => {
  const { verifier, challenge, method } = await pkceChallenge(webcrypto);
  assert.equal(method, 'S256');
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.match(challenge, /^[A-Za-z0-9\-_]+$/); // base64url, no padding
});

test('buildAuthorizeUrl carries client_id, redirect_uri, PKCE, state', () => {
  const u = new URL(buildAuthorizeUrl(config, { challenge: 'CH', state: 'ST' }));
  assert.equal(u.origin + u.pathname, 'https://meta.example/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('client_id'), 'abc123');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://app.example/callback.html');
  assert.equal(u.searchParams.get('code_challenge'), 'CH');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('state'), 'ST');
});

test('createAuth.restore mints an access token from a stored refresh token', async () => {
  const storage = memStorage();
  storage.setItem('slw:oauth:refresh', 'REFRESH1');
  const fetch = async (url, init) => {
    assert.equal(url, 'https://meta.example/token');
    assert.match(init.body.toString(), /grant_type=refresh_token/);
    assert.match(init.body.toString(), /refresh_token=REFRESH1/);
    return { ok: true, json: async () => ({ access_token: 'ACCESS1', refresh_token: 'REFRESH2', expires_in: 3600 }) };
  };
  const auth = createAuth({ fetch, storage, location: { href: '' }, crypto: webcrypto, config, now: () => 0 });
  assert.equal(auth.hasSession(), true);
  assert.equal(await auth.restore(), true);
  assert.equal(await auth.getToken(), 'ACCESS1');
  assert.equal(storage.getItem('slw:oauth:refresh'), 'REFRESH2');
});

test('createAuth.getToken refreshes within 30s of expiry (buffer), not only after true expiry', async () => {
  const storage = memStorage();
  storage.setItem('slw:oauth:refresh', 'R1');
  let calls = 0;
  const fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ access_token: `A${calls}`, refresh_token: `R${calls + 1}`, expires_in: 100 }) };
  };
  let t = 0;
  const auth = createAuth({ fetch, storage, location: { href: '' }, crypto: webcrypto, config, now: () => t });
  await auth.restore(); // t=0, expiresAt=100_000
  assert.equal(await auth.getToken(), 'A1'); // still well within the buffer window, no extra call
  assert.equal(calls, 1);
  t = 75_000; // 75s in: past expiresAt-30_000 (=70_000), but before true expiry (100_000)
  assert.equal(await auth.getToken(), 'A2'); // buffer triggers an early refresh
  assert.equal(calls, 2);
});

test('createAuth.connect stores verifier+state and points location at the authorize URL', async () => {
  const storage = memStorage();
  const location = { href: 'https://app.example/?edit' };
  const auth = createAuth({ fetch: async () => ({}), storage, location, crypto: webcrypto, config, now: () => 0 });
  await auth.connect();
  assert.ok(storage.getItem('slw:oauth:verifier'));
  assert.ok(storage.getItem('slw:oauth:state'));
  assert.match(location.href, /^https:\/\/meta\.example\/authorize\?/);
});
