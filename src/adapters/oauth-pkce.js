const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** @param {Crypto} crypto @returns {Promise<{verifier:string, challenge:string, method:'S256'}>} */
export async function pkceChallenge(crypto) {
  const raw = crypto.getRandomValues(new Uint8Array(64));
  const verifier = b64url(raw).slice(0, 96);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest), method: 'S256' };
}

/** @param {any} config @param {{challenge:string, state:string}} p */
export function buildAuthorizeUrl(config, { challenge, state }) {
  const u = new URL(config.oauth.authorizeUrl);
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.oauth.clientId,
    redirect_uri: config.oauth.redirectUri,
    scope: config.oauth.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return u.toString();
}

const K = {
  refresh: 'slw:oauth:refresh',
  verifier: 'slw:oauth:verifier',
  state: 'slw:oauth:state',
};

/**
 * @param {{fetch: typeof fetch, storage: Storage, location: Location, crypto: Crypto, config: any, now?: () => number}} deps
 * @returns {import('../ports/index.js').AuthPort}
 */
export function createAuth({ fetch, storage, location, crypto, config, now = () => Date.now() }) {
  let accessToken = null;
  let expiresAt = 0;

  async function tokenRequest(body) {
    const res = await fetch(config.oauth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (!res.ok) throw new Error(`token endpoint ${res.status}`);
    const j = await res.json();
    accessToken = j.access_token;
    expiresAt = now() + (j.expires_in ? j.expires_in * 1000 : 3600_000);
    if (j.refresh_token) storage.setItem(K.refresh, j.refresh_token);
    return accessToken;
  }

  return {
    hasSession: () => !!storage.getItem(K.refresh),

    async restore() {
      const rt = storage.getItem(K.refresh);
      if (!rt) return false;
      try {
        await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt, client_id: config.oauth.clientId });
        return true;
      } catch {
        return false;
      }
    },

    async connect() {
      const { verifier, challenge } = await pkceChallenge(crypto);
      const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
      storage.setItem(K.verifier, verifier);
      storage.setItem(K.state, state);
      location.href = buildAuthorizeUrl(config, { challenge, state });
    },

    async getToken() {
      if (accessToken && now() < expiresAt - 30_000) return accessToken;
      const ok = await this.restore();
      if (!ok) throw new Error('not authenticated');
      return accessToken;
    },

    async disconnect() {
      accessToken = null;
      expiresAt = 0;
      storage.removeItem(K.refresh);
      storage.removeItem(K.verifier);
      storage.removeItem(K.state);
    },
  };
}
