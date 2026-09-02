# Operations & Data Runbook

> **Automation log (2026-09-02):** Steps that don't require a Wikimedia account or a
> hosting/registration decision were run directly (see checkboxes below for exactly
> which). Everything requiring credentials, a live write to Wikidata, an OAuth
> consumer registration, or a deploy-target decision is left unchecked, pending the
> project lead.

> **This is a runbook, not a TDD code plan.** It is the sequence of one-off setup, decision, and data-loading tasks that surround the two code plans. Work top to bottom. Steps use checkbox (`- [ ]`) syntax for tracking. Where a step produces a value (a QID, a client ID, a decision), record it in the place the step names so the code plans can consume it.

**Goal:** Get the project from "specs approved" to "public read-only site live, editing enabled, ~40 associations imported into Wikidata".

**Owners:** a project lead with a Wikimedia account for the wiki-side steps; a web developer for the deploy and spike steps. No standing role.

Related: [`2026-09-02-read-only-directory-app.md`](2026-09-02-read-only-directory-app.md), [`2026-09-02-edit-mode-and-write-path.md`](2026-09-02-edit-mode-and-write-path.md), data spec §2.7 (risks/spikes), §2.10 (source data), [`../at-risk.md`](../at-risk.md).

---

## Phase A — Decisions that unblock the code plans

### Task A1: CORS spike — does direct browser write work? (sets `writeMode`)

Data spec §2.7 flags this as a one-day spike. It decides whether `config.json` `writeMode` is `"direct"` (Plan 2 Task 9 path) or `"quickstatements"` (Plan 2 Task 10 path). Both paths are built either way; this only sets the default.

- [x] **Step 0 (added, done 2026-09-02 without credentials):** CORS support itself doesn't
  require a live edit — it's decided by the preflight response headers, which are the same
  for anonymous and authenticated requests. Checked directly:

  ```bash
  curl -X OPTIONS -H "Origin: http://localhost:8000" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,content-type" \
    https://www.wikidata.org/w/rest.php/wikibase/v1/entities/items/Q4115189/statements
  ```

  → `204`, `access-control-allow-origin: *`, `access-control-allow-methods` includes
  `POST` (statements endpoint) and `PATCH`/`PUT`/`DELETE` (single-statement endpoint),
  `access-control-allow-headers` includes `Authorization`. **This confirms CORS is not
  a blocker: `writeMode: "direct"` is viable.** `config.json` already has
  `writeMode: "direct"` — left as is. Steps 1–2 below (an actual authenticated write)
  are still worth doing once a token is available, but only to validate Step 4's payload
  questions, not to re-decide `writeMode`.

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

- [ ] **Step 5: Revert the sandbox edit** you made (undo on `Q4115189`).

### Task A2: WikiProject consultation — confirm class + field QIDs

Data spec §2.3 marks `Q955824` (learned society) / `Q48204` (voluntary association) and `Q2734663` (sociology of law) as *(confirm)*.

- [ ] **Step 1: Post the candidate list + modelling proposal** to the talk page of the most relevant WikiProject (e.g. *Wikidata:WikiProject Sociology* or *…Law*), covering: the in-scope class, `P101` field value, the `P361` treatment of national sections, and the `P123` treatment of association-published journals. Link the data spec and `docs/at-risk.md`. **Drafted, not yet posted** — full text ready to copy/paste at [`../wikiproject-consultation-draft.md`](../wikiproject-consultation-draft.md); posting needs a human Wikimedia account.

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

- [ ] **Step 6: Confirm (or explicitly rule out) a token-revocation endpoint.** Check
  Wikimedia's current OAuth 2.0 documentation for a `/revoke` (or similarly named)
  endpoint under the same `meta.wikimedia.org` OAuth2 base path used for
  `authorize`/`access_token`. If one exists, set `config.json`'s `oauth.revokeUrl`
  to it. If none exists, leave `oauth.revokeUrl` as `null` — "Leave edit mode" /
  "forget this device" will still clear the token from this browser, but the
  editor should be told (in onboarding material, not necessarily in-app copy)
  that they can fully revoke the app's access anytime at
  `Special:OAuthManageMyGrants` on Meta-Wiki.

---

## Phase B — Build (hand off to the code plans)

### Task B1: Implement the read-only app

- [x] Execute [`2026-09-02-read-only-directory-app.md`](2026-09-02-read-only-directory-app.md) end to end. Exit criteria: `cd dev && npm test` green; manual QA checklist (its Task 20) passes against a local server; `read-only-app-v1` tag created. **Done** — 21/21 tasks, tagged `read-only-app-v1`. The manual-browser-QA checkboxes in that plan's Task 20 remain unchecked (no browser in this environment) — run them once, from a real browser, before/at deploy.

### Task B2: Implement edit mode

- [x] Execute [`2026-09-02-edit-mode-and-write-path.md`](2026-09-02-edit-mode-and-write-path.md) end to end, using the `oauth.clientId` from Task A3 and the `writeMode` from Task A1. Exit criteria: full suite green; manual QA (its Task 16) passes with the dev OAuth consumer; `edit-mode-v1` tag created. **Done** — 16/16 tasks + 1 follow-up fix, tagged `edit-mode-v1`, 110/110 tests passing. Built with a placeholder `oauth.clientId`/`writeMode` since Task A3/A1 weren't done yet at the time — both need to be swapped from `REPLACE_WITH_*` placeholders into `config.json` before this is usable end to end. Its manual-browser-QA checklist (Task 16) is likewise unchecked pending a real OAuth consumer and a browser.

---

## Phase C — Load the data into Wikidata

The import file `data/socio-legal-associations.quickstatements.txt` already exists (private `data/`, not in the repo). It has three phases (data spec §2.10).

### Task C1: Pre-flight the import file

- [x] **Step 1: Confirm no personal e-mails.** Every `P968` line must be a role/office address. Cross-check against the workbook's "personal / individual e-mail" column — those must **not** appear.

```bash
grep -nE 'P968' "data/socio-legal-associations.quickstatements.txt"
```
Review each hit by eye.

**Done 2026-09-02.** Extracted all 44 email-like strings from the source workbook
(`xl/worksheets/sheet1.xml`, since it has no `openpyxl` available in this sandbox) and
diffed against the 25 `P968` lines in the QuickStatements file: every one of the 25 is
annotated "(role a/c)" or equivalent in the workbook, and none of the ~19 personal
addresses (individual "Pres."/"Chair"/"Convenor"/etc. emails, including
`boulanger@lhlt.mpg.de`) appear anywhere in the import file. Also fixed one data bug
found in passing: `iss23crime20@gmail.com;` had a stray trailing `;` inside the quoted
value (would have imported literally) — corrected.

- [ ] **Step 2: Confirm the provisional `P31` per body** matches the Task A2 outcome; adjust `Q955824` / `Q48204` where the WikiProject advised otherwise. **Blocked on Task A2** (not yet posted/answered) — the file still applies the provisional split as-is.

- [x] **Step 3: Confirm national sections carry `P361 → parent`.** For each body whose scope is "national section" in the workbook, ensure a `P361` line pointing at the parent association's QID (look the parents up first; add them to the file).

**Done 2026-09-02.** None of the 7 national-section/network rows (Austrian, German
DGS, Indian RC-23, Portuguese APS-SDJ, French AFS RT13, Italian AIS, Polish) had a
`P361` line. Looked up each parent via `wbsearchentities` and added it:
`Q303283`, `Q1202999`, `Q3488406`, `Q139771455`, `Q2867726`, `Q2867838`, `Q7209992`
respectively (label-match only, unverified beyond that — worth a second look before
the actual import, especially the Portuguese one at `Q139771455`, a very recently
created item). See the file's header comment for the full mapping.

- [x] **Step 4: Confirm the existing-item rows** (`Q2867822` AISLF, `Q6503159` LSA, `Q2145564` RCSL, `Q1268131` IVR, `Q111548489` JASL) still resolve and are not redirects.

**Done 2026-09-02**, via `wbgetentities` (read-only, no credentials needed): all five
resolve to their expected labels and none are redirects/missing.

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
| `writeMode` (Task A1) | `direct` | 2026-09-02 | Decided from CORS preflight headers alone (see Task A1 Step 0) — `access-control-allow-origin: *` on both the statements and single-statement REST endpoints, methods POST/PATCH/PUT/DELETE all allowed. No live edit needed for this part; already set in `config.json`. |
| in-scope class QID (Task A2) | `Q955824` / `Q48204` (provisional) | | Consultation drafted (`../wikiproject-consultation-draft.md`), not yet posted — needs a human account. |
| in-scope field QID (Task A2) | `Q2734663` (provisional) | | Same as above. |
| production OAuth client ID (Task A3) | | | Needs Task A3 done interactively on Meta-Wiki; still `REPLACE_WITH_REGISTERED_CONSUMER_CLIENT_ID` in `config.json`. |
| production deploy URL | | | Not yet chosen. |
| initial import run (Task C2–C4) | | | Not yet run. Pre-flight (Task C1) done on the import file: personal-email check clean, 7 missing `P361` links added, 5 existing-item QIDs verified live. |
