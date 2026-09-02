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
