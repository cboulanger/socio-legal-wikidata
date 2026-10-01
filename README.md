# Directory of Socio-Legal Associations

A public, read-only world map of socio-legal scholarly associations, reading
live from Wikidata. Hand-written static files — **no build step**.

**Live site: <https://cboulanger.github.io/socio-legal-wikidata/>**

- Design specs: [`docs/spec/`](docs/spec/)
- Implementation plans: [`docs/plans/`](docs/plans/)

## Run locally

    python3 -m http.server 8000    # then open http://localhost:8000/

## Tests

    cd dev && npm install && npm test

## Deploy

**Production:** GitHub Pages, deployed automatically by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to
`main` (tests must pass first). Live at
<https://cboulanger.github.io/socio-legal-wikidata/> — a merge to `main` *is* the
deploy; there is no manual upload step for this host.

**A different host:** copy every file except `dev/`, `docs/`, `scripts/`,
`.github/` to a web server that serves over HTTPS. No server-side code required —
see "Deploy (detail)" below.

## Change common things without touching code

Edit `config.json`: in-scope Wikidata QIDs, label languages,
cache lifetime.

## Deploy (detail)

1. `cd dev && npm test` — all green.
2. `node scripts/refresh-snapshot.mjs` — refresh `data/snapshot.json`, commit it.
3. Upload to an HTTPS host, root or subfolder, these paths only:
   `index.html`, `config.json`, `styles/`, `src/`, `vendor/`, `data/`.
   Do **not** upload `dev/`, `docs/`, `scripts/`, `.github/`. If you deploy
   with a plain file copy rather than `git`, upload only the tracked
   contents of `data/` (`centroids.json`, `countries.geojson`,
   `snapshot.json` — see `git ls-files data/`), not the whole folder: it
   also holds a private, git-ignored working spreadsheet that must never
   be published.
4. Open the deployed URL and check that the map loads and the panel lists
   associations.

## Edit mode

The site is read-only by default. A read-only visitor's browser never loads any
OAuth/write-path code — confirmed by a storage-only pre-check in `src/app.js`'s
bootstrap block before any edit module is imported.

Editing is enabled either:

- **silently** — a returning editor whose OAuth refresh token is still in this
  browser (config `editTrigger: session` or `either`); or
- **via `?edit`** — append `?edit` to the URL, then connect a Wikimedia account
  once (config `editTrigger: param` or `either`).

Config keys to fill in before deploying (see `docs/plans/2026-09-02-operations-and-data-runbook.md`):
`oauth.clientId`, `oauth.redirectUri` (must equal the deployed `…/callback.html`
exactly), `editTrigger`, `tokenPersistence` (`persistent` | `session`),
`writeMode` (`direct` | `quickstatements`).

### Wikidata OAuth app as the "backend"

The site has no server of its own, so there is nowhere to keep a password or
API secret. Editing therefore works **only** through a registered Wikimedia
OAuth 2.0 consumer (an "OAuth app") that acts as the backend:

- The consumer is registered once at
  [Special:OAuthConsumerRegistration](https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose)
  on Meta-Wiki. It must be a **public client** (no secret) using the
  authorization-code flow with PKCE, with the grants `basic`, `editpage` and
  `createeditmovepage`.
- Its **callback URL must exactly match** the deployed
  `…/callback.html` (`oauth.redirectUri` in `config.json`); its client ID goes
  in `oauth.clientId`. Register a second consumer with
  `http://localhost:8000/callback.html` for local testing.
- When an editor connects, the browser is sent to Wikimedia to log in and
  approve the grant, then returns to `callback.html` with a code that is
  exchanged for an access token (kept in the browser, see `tokenPersistence`).
- Every edit is then sent **directly from the editor's browser to the Wikidata
  API**, made under the editor's own Wikimedia account and attributed to
  them in the item history. The site never sees their password and cannot
  edit on anyone's behalf without their approval.
- New consumers must be approved by Wikimedia before other users can
  authorize them, which can take days. Without a working consumer (missing or
  mismatched `oauth.clientId` / `redirectUri`), edit mode cannot connect and
  the site stays effectively read-only.

### Testing edit mode on localhost

There is no approved OAuth consumer for `localhost`, so `Connect a Wikimedia
account` cannot work there. When `src/app.js` detects it is running on
`localhost`/`127.0.0.1` it automatically swaps in `src/adapters/dev-auth-mock.js`
and `src/adapters/dev-write-mock.js`: the UI behaves as if an account were
already connected, and the final save logs the changeset to the console and
returns a fake success instead of calling the real Wikidata API. Everything
else — search, the wizard, validation, the post-save UI update — runs exactly
as it would in production. The edit bar shows "local dev — writes simulated"
as a reminder. This only triggers on those two hostnames, so the deployed
site is unaffected.

Step-by-step registration is in
[`docs/plans/2026-09-02-operations-and-data-runbook.md`](docs/plans/2026-09-02-operations-and-data-runbook.md)
(Task A3).

### What edit mode can do

- **Edit details** of an association: names, descriptions and abbreviations
  (P1813) in several languages, website, e-mail.
- **Add association**: create a new item after a duplicate check, or add an
  existing Wikidata item to the directory.
- Record **former names** as dated official-name statements.
- Pick the **host organization** an association is part of.
- **Manage leadership**: look up or create the person holding an office
  (president, chairperson, ...), with begin/end dates, and back-fill past
  officeholders for historical background. Shown on the card as a
  "Leadership history" disclosure.

Design: [`docs/spec/2026-09-29-multilingual-edit-and-add-association-design.md`](docs/spec/2026-09-29-multilingual-edit-and-add-association-design.md),
[`docs/spec/2026-09-30-association-leadership-design.md`](docs/spec/2026-09-30-association-leadership-design.md).
