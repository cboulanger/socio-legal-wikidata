# Multilingual "Edit details" and "Add association" — Design

**Status:** Implemented (prototype); see "Implementation notes" at the end
**Date:** 2026-09-29
**Builds on:** [`2026-09-02-ui-design.md`](2026-09-02-ui-design.md) (edit mode UI) and the
write path in [`../plans/2026-09-02-edit-mode-and-write-path.md`](../plans/2026-09-02-edit-mode-and-write-path.md).

## 1. Problem

Edit mode is wired end to end (OAuth, draft model, change-set builder, Wikibase REST
writer) but the wizard body is a placeholder: no step renders any input
(`src/ui/edit-wizard/wizard.js`, "Field widgets are wired in app.js / manual QA"), so
nothing can be edited. In addition:

- Only a single **English** label/description is ever written
  (`labels: { en: … }` in `src/core/changeset.js`); the draft holds one `label` string.
- The `update-field` change set marks website/e-mail ops `replace: true`, but
  `src/adapters/wikibase-api.js` ignores the flag and always POSTs a new statement, so an
  update would leave two values.
- `create-association` requires a president in `validateDraftForChangeset`.

## 2. Goals and non-goals

**Goals (this prototype)**

1. **Edit details** for an existing association: names and descriptions in several
   languages, website, e-mail.
2. **Add association**: create a new association item with the same form, after a
   duplicate check.
3. **Multilingual first**: enter the name in the national language and, where useful,
   an English translation (and any other language) on the same screen.

**Non-goals (later work)**

- President, journal and university steps; "Record new president" stays as it is and is
  not touched. A new association is created **without** a president.
- Aliases; deleting an existing label/description; editing parent, operating area,
  inception; type/field pickers (they default from `config.json`).
- QuickStatements write mode (`writeMode: "direct"` only).

## 3. User flow

Both flows open in the existing right-hand drawer (`#wizard-host`), which covers the
association card, which now lives in the right sidebar `#detail-host`.

| Mode | Entry | Steps |
|---|---|---|
| `update-field` ("Edit details") | **Edit** button on the card | `details` → `review` |
| `create-association` ("Add association") | **Add association** in the edit bar | `identify` → `place` → `details` → `review` |

### 3.1 identify (create only)

The user types the association's name. The app searches Wikidata
(`searchEntities`) and lists matches ranked by `core/dedupe.js`. Each match offers
**Edit this instead** (switches the wizard to `update-field` for that QID).
**None of these — create new** continues to `details`. This step exists to prevent
duplicate items.

### 3.2 details (both modes)

*(For "Add association" this step comes after `place`, so the country is already known.)*

One shared component (`ui/edit-wizard/details-form.js`):

- **Language blocks**, one per language, each with a *name* field and a *description*
  field. The language is shown by name with its code, e.g. "Português (pt)"
  (via `Intl.DisplayNames`).
- **Which languages are shown**, in this order:
  1. the country's official language(s): the first one is added immediately, further
     ones are offered as one-click chips;
  2. English (`en`);
  3. every other language that already has a label or description on the item
     (edit mode).
- **Add language**: a picker with common languages plus a free field for any other
  language code (validated, see §5).
- **Website**, **e-mail** (with the existing personal-address check in
  `core/email-guard.js`; a shared-address confirmation is required if it looks
  personal) and **reference URL**.
- In edit mode all fields are pre-filled from a fresh `getEntity` fetch made when the
  wizard opens; a loading state and a load-error state (with retry) are shown.
- **Blank means "no change".** Deleting a label/description is out of scope.
- **Visibility hint (non-blocking):** the directory query only shows labels in
  `config.labelLanguages` (`en,de,fr,es`; `sparql-client.js`). If none of those
  languages has a name, the form shows a warning that the association will appear as its
  ID in the directory until an English (or other configured-language) name is added.
  This is a warning, not an error, because national-language-only items are valid on
  Wikidata.

### 3.3 place (create only, before details)

Replaces the current `seat` step. A country picker (search, restricted to items that are
instances of "country", Q6256) and an optional seat picker (search). At least a country
or a seat is required (unchanged rule). The chosen country drives the national-language
suggestion in `details`; changing the country after language rows exist only adds
suggestions, it never removes rows the user has typed into.

### 3.4 review (both modes)

A plain summary of exactly what will be written, per item and per language:
`de: (new) "Rede de Pesquisa …"`, `en: "…" → "…"`, website/e-mail old → new. Confirm
performs the write. The same screen shows results or errors (§7).

## 4. Data model

`DraftAssociation` (in `core/draft.js`) changes:

- `label: string` and `description: string` are **replaced** by
  `labels: Object<lang,string>` and `descriptions: Object<lang,string>`.
- New `original: { labels, descriptions, website, email }`: the values as loaded
  (empty for create). The change set is computed as a diff against `original`, so
  untouched languages are never re-sent.
- Everything else (`qid`, `classQid`, `fieldQid`, `countryQid`, `seatQid`, `website`,
  `email`, `emailConfirmedShared`, `referenceUrl`, …) is unchanged.

`DraftPerson` and `DraftJournal` keep their single `label` (used only by
`change-president`, untouched).

`mode: 'update-field'` is kept as the internal name and shown as "Edit details".

## 5. Validation (`ui/edit-wizard/steps.js`, `core/draft.js`)

- Language codes: `^[a-z]{2,3}(-[a-z0-9]{2,8})*$` (lowercase; Wikimedia codes such as
  `pt-br`, `zh-hans`).
- Label and description: at most 250 characters each (Wikidata limit).
- `identify`: a name or a chosen QID.
- `details`:
  - create: at least one non-blank name (any language); `classQid` and `fieldQid`
    present (from config);
  - edit: at least one changed value among names, descriptions, website, e-mail;
  - a reference URL is required when the change set contains a **statement** (create:
    always; edit: only if website or e-mail changed). Names/descriptions take no
    reference;
  - personal-looking e-mail requires `emailConfirmedShared`.
- `place` (create): `countryQid` or `seatQid`.
- The president checks are removed from `create-association` in
  `validateDraftForChangeset`; `change-president` keeps its own.

## 6. Write path

### 6.1 Change set (`core/changeset.js`)

- New op `{type:'set-terms', target:{qid}, labels:{lang:text}, descriptions:{lang:text}}`
  containing only the changed/added languages.
- `create-item` carries the full `labels`/`descriptions` maps (all filled languages,
  not just `en`) and the statements (P31, P101, P17/P159 if set, P856, P968), each with
  the reference when given.
- `update-field` emits `set-terms` (if any term changed) followed by `add-statement`
  with `replace: true` for changed website/e-mail. The summary lists what changed,
  e.g. `socio-legal directory: update names (de, en) and website`.

### 6.2 Adapter (`adapters/wikibase-api.js`)

- `set-terms` → one `PATCH {rest}/entities/items/{qid}` with a JSON Patch of
  `add` operations on `/labels/{lang}` and `/descriptions/{lang}` (`add` on an existing
  member replaces it) and the change-set summary as `comment`. One request means one
  Wikidata revision for all term changes.
- `add-statement` with `replace: true`: read the item's current statements for the
  property (`GET {rest}/entities/items/{qid}/statements?property=P856`), then
  - none → `POST` as today;
  - exactly one → `PUT {rest}/statements/{id}` replacing value and reference;
  - several → refuse with a message telling the user to edit that property on Wikidata
    (no guessing which one to replace).
- New read helper `getOfficialLanguageCodes(countryQid)`: `getEntity(country)` → P37
  (official language) items → `getEntity` each → P424 (Wikimedia language code).
  Results are cached in memory per session. Failure degrades to "no national
  suggestion" (English and existing languages only), never blocks the form.
- The national language for **edit** comes from the item's own P17 in the fetched
  entity; for **create** from the country chosen in `place`.

### 6.3 After a successful write

- The in-memory association list is updated from the saved values (create: the new
  association is appended and selected; edit: label/website/e-mail refreshed), so the
  card reflects the change immediately. The SPARQL-backed data catches up on the next
  refresh (query-service lag of minutes).

## 7. Errors and feedback

- **Duplicate label + description** in a language (Wikidata rejects this): the API error
  message is shown on the review screen; the draft is kept and editable.
- **Partial success** (terms saved, a statement failed): the error is shown on the
  review screen and the draft is kept. Retrying re-sends the whole change set; that is safe
  because setting a label/description to the same value and replacing a statement are both
  idempotent.
- **Auth expired**: `getToken` failure prompts reconnect; the draft persists in
  `localStorage` (existing `slw:wizard:draft` mechanism, now keyed per mode+QID).
- **Load failure** on open (edit): inline error with Retry; nothing is written.

## 8. Units and boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `core/languages.js` (new, pure) | order/suggest languages, code validation, common-language list, display names | none |
| `core/draft.js`, `core/changeset.js` | model, validation, change-set diff | `languages.js` |
| `adapters/wikibase-api.js` | `set-terms`, `replace`, `getOfficialLanguageCodes` | fetch, token |
| `ui/edit-wizard/details-form.js` (new) | language blocks + website/e-mail/reference inputs, writes into the draft | `languages.js` |
| `ui/edit-wizard/identify-step.js`, `place-step.js` (new) | search/duplicate check; country and seat pickers | `entity-typeahead.js`, `dedupe.js` |
| `ui/edit-wizard/wizard.js` | step orchestration, loading original values, review/submit | the above |
| `app.js` | Edit / Add buttons, post-save store update | wizard |

`wizard.js` keeps its role; step bodies move out into the step modules so no file
exceeds one clear responsibility.

## 9. Testing

- **Unit:** `languages.js` (ordering, code validation); draft validation per mode;
  change-set diff (unchanged languages omitted; create carries all languages; no
  president required); adapter with a fake `fetch` (JSON Patch body, `replace` for 0/1/many
  statements, official-language lookup incl. failure).
- **DOM (jsdom):** details form renders the national language + English, adds a language,
  blank = no change, warning when no configured-language name, personal e-mail gate;
  identify step offers "Edit this instead"; place step requires country or seat.
- **Live check (manual):** the OAuth consumer is registered for `www.wikidata.org` only,
  so the first real write touches production Wikidata. Do it on a scratch item created
  for the purpose, and confirm (a) the REST `PATCH` and `PUT` succeed from the GitHub
  Pages origin (CORS), and (b) sessions survive beyond the access-token lifetime
  (refresh-token behaviour for public clients is unverified).

## 10. Open risks

1. **CORS / refresh token** on Wikimedia's REST and token endpoints from a browser-only
   client are unverified beyond the login itself; see §9.
2. **Directory visibility** of labels outside `labelLanguages` (§3.2): handled with a
   warning; widening `labelLanguages` in config is a separate decision.
3. **Country search filter** (instance of Q6256) relies on Wikidata search supporting the
   constraint; if it does not, the picker falls back to unfiltered search plus a
   post-filter on the fetched entity's P31.

## 11. Implementation notes (2026-09-29)

Differences from the design above, and behaviour worth knowing:

- **Step order for create** is `identify → place → details → review` (§3 was corrected to
  match): the country must be known before `details` to suggest the national language.
- **Restored drafts:** if a saved draft exists for the same mode and item, it is reused as-is
  and the item is **not** re-fetched; otherwise the item is fetched fresh. Drafts saved before
  multilingual support (no `labels` map) are discarded.
- **New association in the list** is added without a country code or seat coordinate, so it
  appears under "No fixed location" until the next directory refresh.
- **`?sandbox`**: with `?edit&sandbox` the edit bar gets an "Edit sandbox item" button that
  opens Edit details on the public Wikidata Sandbox item (Q4115189), for trying edits safely.
- **Listeners:** reopening the wizard on the same drawer replaces the previous wizard's
  listeners (previously they accumulated).
- **Not verified live:** nothing has been written to Wikidata yet. The REST calls follow the
  documented Wikibase REST API v1 (`PATCH /entities/items/{id}`, `PUT /statements/{id}`,
  `GET /entities/items/{id}/statements?property=`) and are covered by tests against a fake
  `fetch`, but CORS from the GitHub Pages origin and the response shapes still need the first
  real edit (see §9).
