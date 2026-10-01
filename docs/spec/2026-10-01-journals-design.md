# Journals (standalone entity, hybrid discovery, editors) — Design

**Status:** Draft for discussion
**Date:** 2026-10-01
**Builds on:** [`2026-09-01-socio-legal-associations-directory-design.md`](2026-09-01-socio-legal-associations-directory-design.md) §1.3/§2.3/§2.8
(journal added to the model, phase-1 scope limited to association-published journals), [`2026-09-29-multilingual-edit-and-add-association-design.md`](2026-09-29-multilingual-edit-and-add-association-design.md)
(multilingual term pattern, reused here), and [`2026-09-30-association-leadership-design.md`](2026-09-30-association-leadership-design.md)
(the officeholder-term pattern, reused almost verbatim for editors).

## 1. Problem

Today a "journal" is not a first-class thing in this app: `draft.journal` is a small,
**half-built** scaffold that only exists embedded inside "Add association" (create an
item, `P31=academic journal`, `P123 → the association being created`), its `'journal'`
step is validated in `ui/edit-wizard/steps.js` but is **never in any `STEP_ORDER`**, so
no UI ever reaches it. The only real, reachable journal behaviour today is read-only:
the main SPARQL query opportunistically fetches `?journal wdt:P123 ?assoc` and the
association card shows it as a link.

This also only ever covers one kind of journal — one the association itself publishes.
Many notable socio-legal journals are **not** tied to any one association (national or
regional law-and-society journals, journals run by a university centre, etc.) and are
invisible to this directory today, even though many already exist on Wikidata, tagged
as academic journals with "sociology of law" as their subject.

This design makes journals a standalone, browsable, editable entity — covering both
**association-published** journals and **independent** socio-legal journals — and adds
an editors feature mirroring the officeholder-term pattern built for associations.

## 2. Goals and non-goals

**Goals**

1. A `Journal` is a first-class read-model entity with its own detail view, not just a
   field tacked onto `Association`.
2. **Hybrid discovery**: the directory can show (a) journals published by an in-scope
   association (as today, free — already part of the main query) and (b) independent
   journals identified purely by being an academic journal with "sociology of law" as
   subject area, regardless of publisher. Showing (b) is opt-in, via a **"Show
   journals"** checkbox — a secondary, low-emphasis control, not a main feature.
3. **Add journal**: look up an existing journal on Wikidata and edit it, or create a new
   one — multilingual title, founding year, optional closing year, ISSN, official
   website (recorded as "valid as of the date of entry"), an OpenAlex ID as a
   global-database persistent identifier, and an optional publisher (association) link.
4. **Manage editors**: record one or more editors (current or past), each with a role
   (editor-in-chief, managing editor, ...) and a term (begin required, end optional),
   for an existing journal — the same "any number of historical terms in one visit"
   capability the leadership feature has for officeholders.
5. A journal's detail view shows its own fields plus its editor history.

**Non-goals (this design)**

- Tracking more than one simultaneous holder of the *same* editor role at once is fine
  (unlike the single-leadership-role scope for associations) — a journal can have an
  editor-in-chief and several associate editors active at the same time; only the
  **per-row** "one open-ended row" rule from the leadership feature is narrowed (see
  §7) to apply per role, not across the whole batch.
- Offering journal creation or the editors step inside "Add association" — same scope
  reduction the leadership design made for officeholders inside "Add association".
- Map pins for journals. "Show journals" only affects the side panel.
- Auto-looking up an OpenAlex ID from the OpenAlex API. The field is a plain optional
  text input; the editor supplies it if known.
- Editing or deleting an editor statement already on Wikidata — existing statements are
  read-only, only new ones are added (same reduction as leadership and former names).
- Caching the independent-journal query in `localStorage` or the daily snapshot. Like
  "last edited by" and leadership history, it is live-only, on demand.
- Letting this app set a journal's country. It is read, never written (§6).

## 3. Wikidata modeling

Verified live against Wikidata (property pages and SPARQL) while writing this design.

| Statement | Property | Notes |
| --- | --- | --- |
| instance of | **P31** = `config.academicJournalQid` (Q737498, already in config) | written when this app creates a new journal |
| subject area | **P921** ("main subject") = `config.inScopeFieldQid` (Q847034, already "Sociology of Law", already used as `P101` on associations) | **Verified live**: real journals (e.g. *Journal of Law and Society*, Q15745294) already carry `P921 → Q847034`. Reusing the same config QID means one value drives both the association query (`P101`) and the independent-journal query (`P921`) |
| publisher | **P123** → association | direction unchanged from the existing embedded code (journal → association) |
| ISSN | **P236** | unchanged, `external-id` kind |
| official website | **P856**, qualified **P585** ("point in time") = date of entry | same "valid as of entry" pattern the leadership feature already uses for an officer's new affiliation (`P108`+`P585`) |
| founded | **P571** (year precision) | same pattern `inception` already uses for associations |
| discontinued | **P576** ("dissolved, abolished or demolished date") | **verified live** on real defunct journals (year precision) |
| global-database PID | **P10283** ("OpenAlex ID") | proposed and verified: OpenAlex covers virtually any academic journal regardless of discipline or open-access status; journals already in this dataset carry it (e.g. *Albion*, `S58239531`). Display/URL: `https://openalex.org/<id>`. Plain optional `external-id`-kind field — no API lookup is built |
| country (independent journals, **display-only, never written**) | **P17** or **P495** ("country of origin") | **verified live**: real data is split across both properties — read with the same `COALESCE`-style fallback the app already uses for `P108`/`P1416` leadership affiliation |
| editor | **P98** ("editor"), qualified **P580**/**P582** (start/end) + **P3831** ("object has role") | **verified live on the property page**: P98 explicitly documents exactly these three qualifiers as its intended "editorial tenure + role" use — the same shape as `P488`+`P580`+`P582`+`P3831` already built for chairpersons |

**Editor-role items** — picked the same way `officeTypes` were (checking real usage to
avoid obscure duplicates), four curated plus a search fallback:

| Role | QID | Description on Wikidata |
| --- | --- | --- |
| Editor-in-chief (default) | **Q589298** | "publication's editorial leader" |
| Managing editor | **Q1068933** | "senior member of a publication's management team" |
| Associate editor | **Q75792065** | "supporting editor of a peer reviewed publication" |
| Deputy editor | **Q62489725** | "position of a member of editorial team" |

Not exhaustive on purpose, same rationale as `officeTypes`: the picker offers these four
plus an **"Other — search Wikidata"** option. "Book review editor" — explicitly asked
for — has no clean standalone Wikidata item (verified: search only turns up article
titles), so it goes through the free-text fallback, same as "Speaker" did for
`officeTypes`. "Executive editor" is an alias of editor-in-chief on Wikidata, not a
separate item, so it is not listed separately.

## 4. Data model

### 4.1 `core/model.js` — read model

```js
/**
 * @typedef {Object} Journal        // enough for a "Journals" list row — a summary, not the full record
 * @property {string} qid
 * @property {string} label              // picked per config.labelLanguages, like Association.label
 * @property {string} description
 * @property {string|null} publisherQid  // P123, null if independent
 * @property {string|null} publisherLabel
 * @property {string|null} countryCode   // P17|P495, independent journals, display only
 * @property {string|null} countryLabel
 */
```

`Association.journal` (the existing `JournalRef` embedded field) is unchanged — it
remains the cheap, already-fetched "does this association have a journal" fact the card
uses. `Journal` is the leaner, standalone shape used only for the panel's "Journals"
list row. The richer fields (founded, closed, ISSN, website, OpenAlex id) are
deliberately **not** part of the bulk/list model — they are fetched live, per journal,
only when its card is opened (§8/§9), the same "fetch once on demand, never in the bulk
query" rule already applied to leadership history and "last edited by".

### 4.2 `core/draft.js`

The dead `DraftJournal`, `draft.journal` and the orphaned `'journal'` step are removed
(confirmed dead: not in any `STEP_ORDER`, so nothing in the UI has ever set or read it
beyond the two already-dead `changeset.js` branches that reference it).

```js
/**
 * @typedef {Object} JournalOriginal   // values as loaded from Wikidata (empty when creating)
 * @property {Object<string,string>} labels
 * @property {Object<string,string>} descriptions
 * @property {string|null} website
 * @property {string|null} websiteAsOf
 * @property {string|null} issn
 * @property {string|null} founded
 * @property {string|null} closed
 * @property {string|null} openAlexId
 * @property {string|null} publisherQid
 * @property {boolean} needsClass   // lacks P31=academic journal
 * @property {boolean} needsField   // lacks P921=sociology of law
 *
 * @typedef {Object} DraftJournalEntity
 * @property {string|null} qid
 * @property {string} identifyName        // typed in the "identify" step (create)
 * @property {Object<string,string>} labels
 * @property {Object<string,string>} descriptions
 * @property {JournalOriginal} original
 * @property {string|null} website
 * @property {string|null} issn
 * @property {string|null} founded        // 'YYYY'
 * @property {string|null} closed         // 'YYYY'
 * @property {string|null} openAlexId
 * @property {string|null} publisherQid
 * @property {string|null} publisherLabel // display only
 * @property {boolean} addToDirectory     // edit: also add missing P31/P921 to an existing item
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DraftEditorPerson   // identical shape to DraftOfficerPerson
 * @property {string|null} qid
 * @property {string|null} pickedLabel
 * @property {string|null} pickedBirthYear
 * @property {Object<string,string>} labels
 * @property {string} description
 * @property {string|null} birthDate
 * @property {string|null} affiliationQid
 * @property {string|null} affiliationLabel
 * @property {string|null} orcid
 * @property {string|null} homepage
 *
 * @typedef {Object} DraftEditorRow      // identical shape to DraftOfficerRow
 * @property {DraftEditorPerson} person
 * @property {string} roleQid            // P3831 value; defaults to config.journalEditorRoles[0].qid
 * @property {string} roleLabel
 * @property {string} begin
 * @property {string|null} end
 *
 * @typedef {Object} EditorHistoryRow    // an existing P98 statement, read from Wikidata
 * @property {string} statementId
 * @property {string} personQid
 * @property {string} personLabel
 * @property {string|null} roleQid
 * @property {string} roleLabel          // "editor" fallback if no P3831 qualifier
 * @property {string|null} begin
 * @property {string|null} end
 *
 * @typedef {Object} EditorHistoryOriginal
 * @property {EditorHistoryRow[]} history   // every P98 statement, sorted begin desc
 */
```

`DirectoryDraft` changes:

- `mode` gains `'create-journal'`, `'update-journal'`, `'manage-journal-editors'`.
- New `draft.journalEntity: DraftJournalEntity|null`.
- New `draft.editors: DraftEditorRow[]` and `draft.editorsOriginal: EditorHistoryOriginal|null`.
- The old `draft.journal` field is deleted.

Pure parsers, next to `originalFromEntity`/`leadershipClaimsFromEntity`:

```js
/** Read what the editor needs from a journal entity (parallel to originalFromEntity). */
export function journalOriginalFromEntity(entity) { /* labels, descriptions, P856+P585, P236, P571, P576, P10283, P123, P31/P921 presence */ }

/** Parse an entity's P98 claims into editor rows (parallel to leadershipClaimsFromEntity). */
export function editorClaimsFromEntity(entity) { /* ... */ }
```

Kept pure and unit-testable against a fake entity, exactly like the leadership parsers.
Label resolution happens in the adapter (§8), same layering rule as before.

## 5. Hybrid discovery and the "Show journals" checkbox

Two pools of journals, merged for display, never for the map:

- **Pool A — association-published.** Already fetched today, for free, inside the main
  per-association SPARQL query (`?journal wdt:P123 ?assoc`, unchanged). This is why an
  association's own journal already shows on its card with zero extra cost, checkbox or
  not.
- **Pool B — independent socio-legal journals.** A **new, separate** SPARQL query in
  `adapters/sparql-client.js` (`buildJournalQuery`/`mapJournalBindings`/`queryJournals`,
  alongside the existing `buildDirectoryQuery` family). It fetches only what a list row
  needs (§4.1) — not the full record (§8 explains why):

```sparql
SELECT ?journal ?journalLabel ?journalDescription
       ?publisher ?publisherLabel ?country ?countryLabel
WHERE {
  ?journal wdt:P31/wdt:P279* wd:%ACADEMIC_JOURNAL% .
  ?journal wdt:P921 wd:%FIELD% .
  OPTIONAL { ?journal wdt:P123 ?publisher. }
  OPTIONAL { ?journal (wdt:P17|wdt:P495) ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "%LANGS%". }
}
```

Fetched **only when the checkbox is first ticked** (lazy), kept in an in-memory
`store.journals` for the session (not `localStorage`, no snapshot fallback — same
"fetch once, live-only" precedent as leadership history and "last edited by").
Unchecking and rechecking does not refetch.

A small pure merge helper, `core/journals.js`:

```js
/** Union of the journals already known from associations (pool A, built from their
 *  .journal JournalRef) and the independently queried pool (pool B), deduped by qid.
 *  Pool B wins on overlap: it carries a resolved countryLabel/publisherLabel pool A's
 *  bare JournalRef does not. */
export function mergeJournals(poolA, poolB) { /* ... */ }
```

**Panel integration**: a new `<label><input type="checkbox" data-role="show-journals"> Show journals</label>`
in `directory-panel.js`'s existing `.panel__toolbar` row, next to "Reload data" — same
small, muted, low-emphasis styling (that row already styles both as secondary
controls). When checked and loaded, a new **"Journals"** group appears in the panel
list (same pattern as the existing "No fixed location" group), filtered by the same
free-text search logic the association list already uses (`filterAssociations` only
ever touches `.label`/`.names`/`.countryCode`, so it applies to the leaner `Journal`
shape unchanged — journals simply have no `.names`, so they filter by label only).
Each row is selectable. **No map pins** — `map-view.js` and `toMapPins` are untouched.

## 6. User flow

### 6.1 Entry points

- **"Add journal"** — a new global button in the edit bar next to "Add association".
  Opens the wizard in `create-journal` mode with no publisher preset.
- **"Link journal"** — a new button on the association card next to "Manage
  leadership" (edit mode only). Opens the same wizard in `create-journal` mode, with
  `publisherQid`/`publisherLabel` preset from the card and shown via the existing
  `chosen(...)` pattern (changeable).
- **"Edit journal"** / **"Manage editors"** — buttons on the journal card (edit mode
  only), opening `update-journal` / `manage-journal-editors` respectively, seeded with
  the journal's `qid`.

### 6.2 `identify` step (`create-journal`)

Search-first, identical shape to the association identify step: a typeahead
(`searchEntities`, generic item type — no journal-specific search decoration, same as
how "part of"/"operating area" pickers work today), a **"None of these — create new"**
button, and picking a match switches the wizard to `update-journal` for that QID — the
existing `switchToEdit` function generalized to take the entity kind
(`'association'|'journal'`) so both flows share the one mechanism rather than forking
it.

### 6.3 `details` step (`create-journal` / `update-journal`)

New `ui/edit-wizard/journal-form.js` (not a generalization of `details-form.js` — the
two diverge enough beyond the shared language-row idea: no former names, no
parent/operating area, no abbreviations; founded/closed/ISSN/OpenAlex/publisher
instead):

- **Title and description**, full multilingual block — the same unlimited
  "+ add language" / free-text language-code mechanism `details-form.js` already has,
  reusing `COMMON_LANGUAGES`/`languageName`/`initialLanguages`/`cleanTerms` as-is.
  `initialLanguages({ official: [], existing })` is called with an empty official list
  (a journal has no country to derive a national-language suggestion from) — already
  handled today (`official[0]` is simply skipped when absent), so `languages.js` needs
  no change.
- **Founded** / **Closed** — `<input type="date">`-free, plain year text inputs, same
  validation shape as `inception`.
- **ISSN** — plain text.
- **Website** — plain text; written with a `P585`="date of entry" qualifier (§8), same
  mechanic as an officer's new affiliation, not shown as a separate field to fill in.
- **OpenAlex ID** — plain optional text input, with a short hint ("look it up at
  openalex.org") and the proposed `https://openalex.org/<id>` link shown once filled.
- **Published by** — the `chosen(...)` / typeahead pattern (search among associations),
  optional, pre-filled when opened via "Link journal".
- Edit mode only, existing item lacking `P31`/`P921`: the same "add to directory"
  checkbox notice pattern as `scopeNotice` in `details-form.js`, parameterized for
  journals (`journalScopeStatements`/`hasJournalScopeChanges`, §7).
- **Reference URL** — required as soon as anything would be written, same rule as
  `update-field`/`create-association`.

### 6.4 `editors` step (`manage-journal-editors`)

A direct copy-and-adapt of `leadership-form.js` into `editor-form.js`:
"officeholder" → "editor", `config.officeTypes` → `config.journalEditorRoles`,
`P488`/`P580`/`P582`/`P3831` → `P98`/`P580`/`P582`/`P3831`. Same person-picker
behaviour (search-first, existing-person-with-optional-affiliation vs.
create-new-person-with-affiliation-or-ORCID guard), same begin-required/end-optional
date fields, same **"+ Add another editor"** / remove-row controls.

**Difference from leadership's at-most-one-open-row rule** (§2 non-goals): a journal
can have several concurrently active editors in different roles (an editor-in-chief
*and* an active associate editor at the same time is normal), so the "at most one
blank-end row" rule is scoped **per role** across the batch, not across the whole
batch — validated by grouping `draft.editors` by `roleQid` before applying the
leadership feature's existing single-open-row check.

### 6.5 `review` step

Same shape as the existing review step, extended with journal-specific lines, e.g.:

```text
title (en): "European Journal of Empirical Legal Studies" (new)
founded: 2020
ISSN: 2666-1861
published by: Q2867822 (existing association)
reference: https://example.org/about
```

```text
editor-in-chief: Jane Roe (new person), 2020-01-01 – present
associate editor: Q12345 (existing person), 2021-01-01 – present
```

## 7. Validation (`core/draft.js`, `ui/edit-wizard/steps.js`)

```js
STEP_ORDER['create-journal'] = ['identify', 'details', 'review']
STEP_ORDER['update-journal'] = ['details', 'review']
STEP_ORDER['manage-journal-editors'] = ['editors', 'review']
```

`validateDraftForChangeset`, new branches:

- `create-journal`: at least one non-blank label; `referenceUrl` required.
- `update-journal`: `journalEntity.qid` required; at least one changed field (terms,
  website, ISSN, founded, closed, openAlexId, publisher, or the `addToDirectory` scope
  statements) or it errors "nothing to update"; `referenceUrl` required once anything
  changed.
- `manage-journal-editors`: `journalEntity.qid` required; at least one editor row;
  per-row the same person/date guards as `manage-leadership`; the "one open row"
  check is grouped **by `roleQid`** (§6.4) instead of across the whole batch;
  `referenceUrl` required once any row is filled in.

`journalScopeStatements(j)` / `hasJournalScopeChanges(j)` parallel
`scopeStatements(a)`/`hasScopeChanges(a)`, writing `P31`/`P921` only for what the
loaded item is missing.

## 8. Write path (`core/changeset.js`, `adapters/wikibase-api.js`)

No new `Op` type — `create-item`/`set-terms`/`add-statement`/`end-statement` already
cover every case, exactly as the leadership design concluded for its own feature.

- **`create-journal`**: one `create-item` op. Claims: `P31`, `P921`, `P123` (if a
  publisher was picked — always an existing association, never created alongside, so
  always `item(publisherQid)`, no ref-interleaving concern), `P856` qualified `P585`
  (today) if a website was given, `P236`, `P571`, `P576`, `P10283` — every claim
  referenced with the step's `referenceUrl`.
- **`update-journal`**: `set-terms` for changed labels/descriptions; one
  `add-statement{replace:true}` per changed field (website — with the `P585` qualifier
  refreshed to today; ISSN; founded; closed; OpenAlex id; publisher), mirroring
  `update-field`'s existing website/parent handling; plus the `P31`/`P921`
  scope-addition statements when `addToDirectory` is ticked.
- **`manage-journal-editors`**: per row, interleaved create-person/add-statement
  exactly like `manage-leadership` (§7.1 of the leadership design — the QuickStatements
  `LAST`-reference ordering constraint applies identically here), writing `P98`
  qualified `[P580=begin, P3831=roleQid, P582=end?]`. No "end the previous
  officeholder's term" auto-end step — that was specific to leadership's
  single-current-holder scope; editors have no equivalent auto-end (§6.4).

### `adapters/wikibase-api.js`

New `getJournalEditorHistory(qid)`, built the same way `getLeadershipHistory` is:
`getEntity` → `editorClaimsFromEntity` (pure) → one batched `wbgetentities` label
lookup for every distinct person/role QID → sorted by `begin` descending. No
"current"/auto-end computation is needed (§6.4), so this is slightly simpler than
`getLeadershipHistory`.

New `getJournalDetails(qid)`: `getEntity` → `journalOriginalFromEntity` (§4.2, pure) →
resolve the publisher's label if `publisherQid` is set. This single function serves
**two** call sites — the wizard's `update-journal` load step (seeding
`draft.journalEntity.original`) and the read-only journal card (§9) — exactly the
"one implementation, two call sites" reuse the leadership design already established
for `getLeadershipHistory` (wizard "already on Wikidata" list + card disclosure).

New `queryJournals(cfg)` in `adapters/sparql-client.js` (§5), following the exact
shape of `queryDirectory`, but returning only the lean list-row fields.

## 9. Card and panel display

- **`ui/journal-card.js`** (new, modeled on `association-card.js`): fetches
  `getJournalDetails(qid)` and `getJournalEditorHistory(qid)` on open (not from the
  lean `Journal` list-row data — see §8), then shows title, "founded – closed" (or
  "founded – present"), ISSN, website with an "as of `DATE`" note when `websiteAsOf` is
  known, an OpenAlex link when set, "published by `<association>`" as an in-app link
  (selects that association), and — always visible, not behind a disclosure, since it
  is this view's main content — the editor history list. Edit mode adds "Edit journal"
  / "Manage editors" buttons. A load failure shows an inline error with retry, same as
  the wizard's existing load-failure handling.
- **`association-card.js`** change: the existing `journal:` row's label becomes a
  button that selects the journal in-app (instead of only linking out to Wikidata); the
  external Wikidata link moves into the journal card (where `safeHref`/the Wikidata
  badge convention already lives).
- **Selection model** (`app.js`): `store.selection` changes from a bare `qid` string to
  `{ kind: 'association'|'journal', qid }`. `renderDetailRegion` branches on `kind`.
  Hash routing gains `#/journal/Q…` alongside `#/assoc/Q…`. Panel rows (association
  list and the new "Journals" group) carry `data-kind` alongside `data-qid`.

## 10. Errors and feedback

Unchanged mechanics, applied to the three new modes — inline error + retry for load
failures, the auth-expired/reconnect handling, and the same "partial success, check the
item before retrying" caveat on the review screen for `manage-journal-editors` that
`manage-leadership` already has (adding/ending `P98` statements is not literally
idempotent either).

## 11. Units and boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `core/model.js` | `Journal` type | — |
| `core/journals.js` (new) | `mergeJournals` (pure) | — |
| `core/draft.js` | `DraftJournalEntity`/`DraftEditorRow`/`EditorHistoryOriginal` types, `journalOriginalFromEntity`, `editorClaimsFromEntity`, validation | `languages.js` |
| `core/changeset.js` | `create-journal`/`update-journal`/`manage-journal-editors` ops | `draft.js` |
| `adapters/sparql-client.js` | `buildJournalQuery`/`mapJournalBindings`/`queryJournals` | — |
| `adapters/wikibase-api.js` | `getJournalEditorHistory`, `getJournalDetails` | `getEntity`, `editorClaimsFromEntity`, `journalOriginalFromEntity` |
| `ui/edit-wizard/journal-form.js` (new) | journal fields UI | `languages.js`, `entity-typeahead.js` |
| `ui/edit-wizard/editor-form.js` (new) | editor rows UI | `entity-typeahead.js` |
| `ui/edit-wizard/wizard.js` | step wiring for the three new modes, generalized `switchToEdit`, loads `getJournalDetails` for `update-journal` | the above |
| `ui/journal-card.js` (new) | journal detail view | `getJournalDetails`, `getJournalEditorHistory` |
| `ui/association-card.js` | journal row becomes an in-app link | — |
| `ui/directory-panel.js` | "Show journals" checkbox, "Journals" list group | `core/journals.js` |
| `app.js` | selection model (`{kind,qid}`), hash routing, lazy independent-journal fetch, "Add journal"/"Link journal" buttons | the above |
| `config.json` | `journalEditorRoles` list | — |

## 12. Testing

- **Unit (`core/draft.js`):** `journalOriginalFromEntity` and `editorClaimsFromEntity`
  against fake entities (0/1/many `P98` claims, with/without `P3831`/`P582`, with/
  without `P585` on `P856`); validation for all three new modes, including the
  per-role (not per-batch) open-row rule.
- **Unit (`core/changeset.js`):** `create-journal` with every optional field;
  `update-journal` changing one field at a time (`replace:true` website refreshes
  `P585`); `manage-journal-editors` with a mixed batch (two different roles, both
  open-ended, no error) and (two rows, same role, both open-ended, error).
- **Unit (`core/journals.js`):** `mergeJournals` dedup, pool-B-wins-on-overlap.
- **Unit (`core/quickstatements.js`):** the interleaved create/link ordering for
  `manage-journal-editors`, same regression shape as the existing leadership-ordering
  test.
- **Adapter (`wikibase-api.js`, `sparql-client.js`) with a fake `fetch`:**
  `getJournalEditorHistory` batches labels and sorts correctly; `getJournalDetails`
  resolves the publisher label; `queryJournals` maps the `COALESCE`-style country
  fallback and the list-row fields correctly.
- **DOM (jsdom):** journal identify → create/switch-to-edit flow; editor row add/
  remove and the per-role open-row validation message; "Show journals" checkbox
  triggers exactly one lazy fetch and a second toggle does not refetch; panel renders
  a deduped "Journals" group; selecting a journal from the association card's journal
  row opens the journal card; hash routing round-trips `#/journal/Q…`.

## 13. Open risks

1. **Independent-journal query performance.** `P31/P279*` transitive traversal was
   flagged as expensive for the main directory query and avoided there via a direct
   `VALUES` match; here it is unavoidable (any academic-journal subclass, globally, not
   scoped to a handful of per-association candidates as today's embedded journal
   lookup is). The `P921` filter should narrow the candidate set substantially before
   the transitive check runs, but this has not been load-tested against WDQS's 60s
   timeout the way the main query was. Worth a quick live timing check during
   implementation; a fallback (matching `P31` directly against `Q737498` plus a short
   list of common journal subclasses, same `VALUES`-list trick as `inScopeClassQids`)
   is available if it is slow.
2. **No country allowlist for independent journals.** Any country globally is eligible
   once a journal carries `P921=sociology of law` — deliberate (§2), but means the
   "Journals" list is not bounded by the same ~40-body curation the association list
   has. Acceptable for a first version; revisit if the independent pool turns out to be
   noisy (mistagged journals, etc.).
3. **Small curated role list**, same acceptance as `officeTypes`: "book review editor"
   and any other uncommon title fall through to the free-text search, with no better
   fallback. Widening `config.journalEditorRoles` needs no code change.
