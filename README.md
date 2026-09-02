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
   Do **not** upload `dev/`, `docs/`, `scripts/`, `.github/`.
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
