# Operations & Data Runbook

> **This is a runbook, not a TDD code plan.** It is the sequence of one-off setup, decision, and data-loading tasks that surround the two code plans. Work top to bottom. Steps use checkbox (`- [ ]`) syntax for tracking. Where a step produces a value (a QID, a client ID, a decision), record it in the place the step names so the code plans can consume it.

**Goal:** Get the project from "specs approved" to "public read-only site live, editing enabled, ~40 associations imported into Wikidata".

**Owners:** a project lead with a Wikimedia account for the wiki-side steps; a web developer for the deploy and spike steps. No standing role.

Related: [`2026-09-02-read-only-directory-app.md`](2026-09-02-read-only-directory-app.md), [`2026-09-02-edit-mode-and-write-path.md`](2026-09-02-edit-mode-and-write-path.md), data spec §2.7 (risks/spikes), §2.10 (source data), [`../at-risk.md`](../at-risk.md).

---

## Phase A — Decisions that unblock the code plans

### Task A1: CORS spike — does direct browser write work? (sets `writeMode`)

Data spec §2.7 flags this as a one-day spike. It decides whether `config.json` `writeMode` is `"direct"` (Plan 2 Task 9 path) or `"quickstatements"` (Plan 2 Task 10 path). Both paths are built either way; this only sets the default.

- [ ] **Step 1: Register a throwaway dev OAuth consumer** (see Task A3 for the full procedure; for the spike a `http://localhost` redirect consumer with the `editpage` grant is enough).

- [ ] **Step 2: From a plain static page on a non-Wikimedia origin**, obtain an access token via the PKCE flow (you can reuse `src/adapters/oauth-pkce.js` once Plan 2 Task 7 exists, or do it by hand), then attempt one real edit on a test item:

```bash
# after you have $TOKEN in a browser console on http://localhost:8000
fetch('https://www.wikidata.org/w/rest.php/wikibase/v1/entities/items/Q4115189/statements', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    statement: { property: { id: 'P2534' }, value: { type: 'value', content: 'test' } },
    comment: 'CORS spike — please revert'
  })
}).then(r => r.status).then(console.log)
```
(`Q4115189` is the Wikidata Sandbox item. Revert your edit afterwards.)

- [ ] **Step 3: Record the outcome.**
  - HTTP 200/201 with the response body readable in JS → **`writeMode: "direct"`**.
  - Network error / opaque response / CORS console error → **`writeMode: "quickstatements"`**.
  - Write it into `config.json` and note the result and date at the top of this file.

- [ ] **Step 4: While you have a live sandbox edit working, also confirm two REST payload
  details `src/adapters/wikibase-api.js` (Plan 2 Task 9) assumed without a live test:**
  - The edit-summary field name: confirm the create/add-statement request body's
    top-level `comment` key is what the live REST API expects (not `bot`/`summary`
    or a query-string param).
  - Ending a statement (`end-statement` op → `PATCH /statements/{id}` with a
    JSON-Patch `add` at `/qualifiers/-`): confirm this succeeds against a sandbox
    statement that currently has **no** qualifiers at all (RFC 6902 append-to-absent-array
    semantics). Try it on a throwaway statement on `Q4115189`, then revert.
  - If either assumption is wrong, fix `src/adapters/wikibase-api.js`'s `restStatement`/
    `applyChangeSet` accordingly and re-run `cd dev && npm test`.

- [ ] **Step 4: Revert the sandbox edit** you made (undo on `Q4115189`).

### Task A2: WikiProject consultation — confirm class + field QIDs

Data spec §2.3 marks `Q955824` (learned society) / `Q48204` (voluntary association) and `Q2734663` (sociology of law) as *(confirm)*.

- [ ] **Step 1: Post the candidate list + modelling proposal** to the talk page of the most relevant WikiProject (e.g. *Wikidata:WikiProject Sociology* or *…Law*), covering: the in-scope class, `P101` field value, the `P361` treatment of national sections, and the `P123` treatment of association-published journals. Link the data spec and `docs/at-risk.md`.

- [ ] **Step 2: Record the agreed values** in `config.json` (`inScopeClassQid`, `inScopeFieldQid`) and update data spec §2.3 to drop the *(confirm)* markers.

- [ ] **Step 3: If the agreed class differs from `Q955824`**, update the SPARQL template default in `src/adapters/sparql-client.js` (Plan 1 Task 7) accordingly, or rely on `config.json` (the template already reads `cfg.inScopeClassQid`).

### Task A3: Register the production OAuth consumer

- [ ] **Step 1: Decide the deploy URL** with the site maintainer (e.g. `https://socio-legal-map.example.org/`). The redirect URI is fixed at registration.

- [ ] **Step 2: At `https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose`**, register:
  - **Application name:** Socio-Legal Associations Directory
  - **OAuth "protocol version":** OAuth 2.0
  - **This consumer is for use only by <you>:** unchecked (multiple editors)
  - **Callback URL:** `https://socio-legal-map.example.org/callback.html` (exact)
  - **Allow consumer to specify a callback in requests:** unchecked
  - **Client is confidential:** **unchecked** (public client — no secret)
  - **Grants:** *Basic rights*, *Edit existing pages*, *Create, edit, and move pages*
  - **Contact email:** the project inbox

- [ ] **Step 3: Record the issued client ID** in `config.json` → `oauth.clientId`, and set `oauth.redirectUri` to the exact callback URL. There is no secret to store.

- [ ] **Step 4: Register a second, dev consumer** with callback `http://localhost:8000/callback.html`, same grants, for local testing. Keep its client ID in a local, untracked `config.dev.json` or swap it in by hand.

- [ ] **Step 5: Note** that Wikimedia may take days to approve new consumers; some grant changes require re-approval.

---

## Phase B — Build (hand off to the code plans)

### Task B1: Implement the read-only app

- [ ] Execute [`2026-09-02-read-only-directory-app.md`](2026-09-02-read-only-directory-app.md) end to end. Exit criteria: `cd dev && npm test` green; manual QA checklist (its Task 20) passes against a local server; `read-only-app-v1` tag created.

### Task B2: Implement edit mode

- [ ] Execute [`2026-09-02-edit-mode-and-write-path.md`](2026-09-02-edit-mode-and-write-path.md) end to end, using the `oauth.clientId` from Task A3 and the `writeMode` from Task A1. Exit criteria: full suite green; manual QA (its Task 16) passes with the dev OAuth consumer; `edit-mode-v1` tag created.

---

## Phase C — Load the data into Wikidata

The import file `data/socio-legal-associations.quickstatements.txt` already exists (private `data/`, not in the repo). It has three phases (data spec §2.10).

### Task C1: Pre-flight the import file

- [ ] **Step 1: Confirm no personal e-mails.** Every `P968` line must be a role/office address. Cross-check against the workbook's "personal / individual e-mail" column — those must **not** appear.

```bash
grep -nE 'P968' "data/socio-legal-associations.quickstatements.txt"
```
Review each hit by eye.

- [ ] **Step 2: Confirm the provisional `P31` per body** matches the Task A2 outcome; adjust `Q955824` / `Q48204` where the WikiProject advised otherwise.

- [ ] **Step 3: Confirm national sections carry `P361 → parent`.** For each body whose scope is "national section" in the workbook, ensure a `P361` line pointing at the parent association's QID (look the parents up first; add them to the file).

- [ ] **Step 4: Confirm the existing-item rows** (`Q2867822` AISLF, `Q6503159` LSA, `Q2145564` RCSL, `Q1268131` IVR, `Q111548489` JASL) still resolve and are not redirects.

### Task C2: Run Phase 1 — association items

- [ ] **Step 1: Open** `https://quickstatements.toolforge.org/`, sign in (its own OAuth), **New batch → Import v1 commands**.

- [ ] **Step 2: Paste the Phase 1 block** (the `CREATE` / `LAST` association rows and the `Q…` statement rows for existing items). Run.

- [ ] **Step 3: Record every newly created QID.** Export the batch result; for each association write its QID into a scratch mapping `data/qids.json` (`{ "Africa Law and Society Network": "Q…", … }`). Update `docs/at-risk.md`: set "Status" to "created (Q…)" for each at-risk body.

### Task C3: Run Phase 2 — contact persons

- [ ] **Step 1: For each association**, find or create the chair as a person item:
  - Search Wikidata for the name; if an item exists with a matching ORCID / employer, use it.
  - Otherwise add a `CREATE` block: `Len "<name>"`, `Den "<discipline> scholar"`, `P31 Q5`, `P106 <sociologist/legal scholar/researcher>`, `P108 <university QID>`, and `P496 "<ORCID>"` where verified (the file header lists the first few).

- [ ] **Step 2: Link** each association to its president: `Q<assoc>\tP488\tQ<person>\tP580\t+<term start>T00:00:00Z/11` (add `P582` for any known past term).

- [ ] **Step 3: Add a reference** (`S854 "<url>"`) to each `P488` and to each new person's `P108` — the university staff page or the association's officers page.

### Task C4: Run Phase 3 — association-published journals

- [ ] **Step 1: For the subset the association is the publisher of record for** (workbook *Journal* column + the "published by the association" editorial call from data spec §2.7): search Wikidata for the journal (many exist, e.g. ARSP `Q15710036`, LSR `Q6502970`).

- [ ] **Step 2: Link** `Q<journal>\tP123\tQ<assoc>` and add `P856` / `P236` if missing. Create a minimal journal item only if none exists (`P31 Q737498`, `P123 Q<assoc>`, `P856`, `P236`).

- [ ] **Step 3: Do NOT link** journals published by a commercial house on the society's behalf — deferred (data spec §2.8).

### Task C5: Seed the snapshot from live data

- [ ] **Step 1: Run** `node scripts/refresh-snapshot.mjs` (Plan 1 Task 19). It should now return the imported associations.

- [ ] **Step 2: Commit** the populated `data/snapshot.json`.

- [ ] **Step 3: Enable** the `.github/workflows/snapshot.yml` schedule (it is committed disabled-by-default only in the sense that GitHub runs scheduled workflows on the default branch — confirm Actions are enabled for the repo).

---

## Phase D — Deploy

### Task D1: Publish the site

- [ ] **Step 1: Final local check** — `cd dev && npm test` green; `node scripts/refresh-snapshot.mjs` fresh.

- [ ] **Step 2: Upload** to the HTTPS host at the URL registered in Task A3. Include: `index.html`, `callback.html`, `config.json`, `styles/`, `src/`, `vendor/`, `data/`. Exclude: `dev/`, `docs/`, `scripts/`, `.github/`.

- [ ] **Step 3: Verify `config.json` on the server** carries the **production** `oauth.clientId` and the **production** `oauth.redirectUri` (matching the deployed `callback.html` exactly), and the `writeMode` from Task A1.

### Task D2: Post-deploy verification

- [ ] Read-only load: map + tiles + panel; **no sign-in / edit affordance** anywhere.
- [ ] `?edit` on the production URL → "Edit mode" badge → "Connect a Wikimedia account" → full OAuth round trip → returns signed in.
- [ ] Reload without `?edit` → still edit mode (silent restore).
- [ ] Do one real "update a detail" edit end to end; confirm the diff on wikidata.org; "Leave edit mode".
- [ ] Offline test (DevTools offline, reload): snapshot loads with the "saved copy from …" banner.
- [ ] Mobile viewport: bottom sheet works; still read-only by default.

### Task D3: Hand-off notes

- [ ] Add the production URL and the OAuth consumer name/ID to `README.md`.
- [ ] Tell each association's contact person: the site, the `?edit` link, and the one Wikimedia preference to tick for change notifications (data spec §1.6.1 A).
- [ ] Confirm the "notify me of changes" links on cards resolve to the right items.

---

## Phase E — Optional: automated change-notification e-mail (data spec §1.6.1 B)

Only if the project wants proactive diffs on top of contact-person watchlists. The read-only app works without this.

- [ ] **Step 1: Extend `scripts/refresh-snapshot.mjs`** with a `diffSnapshots(prev, next)` that returns `{ assocQid, label, changedFields }[]`, and an e-mail sender (SMTP or a transactional-email API) that mails the association's `P968` address plus the project inbox, each with a `https://www.wikidata.org/wiki/Q…?diff=cur` link. TDD `diffSnapshots` the same way as the other `scripts/` functions.

- [ ] **Step 2: Add the mail credential** as a single GitHub Actions secret (`SMTP_URL` or `MAIL_API_KEY`). This is the project's only secret and is outbound-only.

- [ ] **Step 3: Extend `.github/workflows/snapshot.yml`** to pass the secret and run the diff-and-notify step after the snapshot commit.

- [ ] **Step 4: Dry-run** once with the project inbox as the only recipient before enabling per-association mail.

---

## Decision log (fill in as you go)

| Decision | Value | Date | Notes |
| --- | --- | --- | --- |
| `writeMode` (Task A1) | | | direct / quickstatements |
| in-scope class QID (Task A2) | | | |
| in-scope field QID (Task A2) | | | |
| production OAuth client ID (Task A3) | | | public client, no secret |
| production deploy URL | | | redirect URI = `<url>/callback.html` |
| initial import run (Task C2–C4) | | | batch URLs / counts |
