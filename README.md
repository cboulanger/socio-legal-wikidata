# Directory of Socio-Legal Associations

A public, read-only world map of socio-legal scholarly associations, reading
live from Wikidata. Hand-written static files — **no build step**.

- Design specs: [`docs/spec/`](docs/spec/)
- Implementation plans: [`docs/plans/`](docs/plans/)

## Run locally

    python3 -m http.server 8000    # then open http://localhost:8000/

## Tests

    cd dev && npm install && npm test

## Deploy

Copy every file except `dev/`, `docs/`, `scripts/`, `.github/` to a web
server that serves over HTTPS. No server-side code required.

## Change common things without touching code

Edit `config.json`: in-scope Wikidata QIDs, label languages, map tile
source, cache lifetime.

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
4. Open the deployed URL and run the manual QA checklist below (requires a
   real browser — not automatable in CI or by an agent).

## Manual QA checklist (requires a browser)

- [ ] Map + tiles load; panel lists associations.
- [ ] No sign-in or edit affordance anywhere in the DOM.
- [ ] Row click → card shows; map pans.
- [ ] Search box filters rows.
- [ ] Clicking a country polygon (or visiting `#/country/DE`) filters to that country; the `×` clears it.
- [ ] Leadership toggle adds/removes lighter pins.
- [ ] Simulate offline (DevTools → Network → Offline, reload): the snapshot loads with a "saved copy from …" banner.

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

## Manual QA checklist — edit mode (requires a browser and a registered OAuth consumer)

- [ ] `?edit` on a fresh browser profile shows the "Edit mode" badge and a
      "Connect a Wikimedia account" button — no Add/Leave buttons yet.
- [ ] Clicking Connect redirects to Wikimedia, then back to `…/callback.html`,
      then to `/#/` with the badge now showing "Add association" / "Leave edit mode".
- [ ] Reloading the site **without** `?edit` still shows edit mode (silent
      session restore) — confirms `editTrigger: either`/`session` works.
- [ ] Opening a card shows an **Edit** button; clicking it opens the six-step
      (or shorter) wizard as a drawer.
- [ ] Typing an association/person/journal name shows ranked Wikidata matches;
      "None of these — create new" appears only once there are zero matches.
- [ ] Completing a wizard flow with `writeMode: "direct"` shows a success panel
      with a real Wikidata diff link.
- [ ] Completing a wizard flow with `writeMode: "quickstatements"` opens a
      QuickStatements tab with the prepared batch instead of writing directly.
- [ ] "Leave edit mode" returns to the plain read-only view with no badge.
