/**
 * Auth stand-in used only on localhost, where no Wikimedia OAuth consumer can
 * work (new consumers need Wikimedia approval before any non-owner account can
 * authorize them — see README.md "Edit mode"). Reports an always-connected
 * session so the edit UI renders as it would for a signed-in editor, without
 * ever redirecting to Wikimedia or minting a real token.
 * @returns {import('../ports/index.js').AuthPort}
 */
export function createDevAuth() {
  return {
    hasSession: () => true,
    async restore() { return true; },
    async connect() { /* no-op: there is nowhere to redirect to on localhost */ },
    async getToken() { throw new Error('dev mode: writes are mocked, no real token is ever requested'); },
    async disconnect() { /* no-op: nothing was ever connected */ },
  };
}
