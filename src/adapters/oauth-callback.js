/**
 * Complete the OAuth redirect: exchange ?code for tokens, persist the refresh
 * token, and return the URL to send the browser back to.
 * @param {{location: Location, storage: Storage, fetch: typeof fetch, config: any}} deps
 * @returns {Promise<string>}
 */
export async function handleCallback({ location, storage, fetch, config }) {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const expectedState = storage.getItem('slw:oauth:state');
  if (!code) throw new Error('missing authorization code');
  if (!state || state !== expectedState) throw new Error('state mismatch');
  const verifier = storage.getItem('slw:oauth:verifier');
  if (!verifier) throw new Error('missing PKCE verifier');

  const res = await fetch(config.oauth.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.oauth.clientId,
      redirect_uri: config.oauth.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  const j = await res.json();
  if (j.refresh_token) storage.setItem('slw:oauth:refresh', j.refresh_token);
  storage.removeItem('slw:oauth:verifier');
  storage.removeItem('slw:oauth:state');
  return `${location.origin}/#/`;
}
