# Association leadership ("Add association president") — Design

**Status:** Draft
**Date:** 2026-09-30
**Builds on:** [`2026-09-01-socio-legal-associations-directory-design.md`](2026-09-01-socio-legal-associations-directory-design.md) §1.3/§2.3 (data model,
leadership layer) and [`2026-09-29-multilingual-edit-and-add-association-design.md`](2026-09-29-multilingual-edit-and-add-association-design.md) (multilingual
term pattern, former-names pattern, reused here).

## 1. Problem

The data model and change-set builder already have a `change-president` mode
(`P488` chairperson, `P580`/`P582` qualifiers, `previousPresidentStatementId`), but it
was never finished: `src/ui/edit-wizard/wizard.js`'s `people` step falls through to the
generic placeholder (`Fill the fields for "people"`), nothing sets
`previousPresidentStatementId`, and no button in `app.js` ever opens the wizard in this
mode. Recording a president today means editing the Wikidata item by hand.

At the same time the existing shape is too narrow for what associations actually need:

- Only one hard-coded title ("president"/"chairperson" are used interchangeably); many
  associations call the role chairman, speaker, or something else.
- Only the *current* holder can be recorded; there is no way to enter known past
  holders for historical background.
- A new person can only be created with a single English name and a **required**
  university, which blocks entering a president who is not (yet) linkable to an
  employer on Wikidata.
- There is no way to note that an affiliation is only known to be true as of today, as
  opposed to an open-ended, durable fact.

This design replaces the dead `change-president` scaffolding with a working
**"Manage leadership"** action: add one or more officeholder terms (current or past),
each with its own office title and dates, for an existing association.

## 2. Goals and non-goals

**Goals**

1. Look up an existing person on Wikidata, or create one with multilingual name
   fields, an optional birth date, and an optional current affiliation.
2. Record the type of office (president, chairperson, vice-president, ...) precisely,
   without giving up the existing `P488`-based model.
3. Begin date (required) and end date (optional) per term, as native
   `<input type="date">` fields.
4. Enter **past presidents** — any number of historical terms — in one visit, for
   associations where that history is known but not yet on Wikidata.
5. Show that history on the association card as a dated list.

**Non-goals (this design)**

- Tracking several simultaneous offices (e.g. president *and* treasurer at once).
  One leadership role is tracked per association, however it is titled locally.
- Offering this step inside "Add association". A new association is still created
  without a president (unchanged from the 2026-09-29 design); leadership is recorded
  afterwards, from the card.
- Editing or deleting a leadership statement already on Wikidata (same scope
  reduction as former names: existing statements are read-only; only new ones are
  added, and at most the currently open one is auto-ended).
- Adding the leadership history to the daily snapshot (`data/snapshot.json`) or the
  bulk directory SPARQL query. It is fetched live, on demand, same as "last edited
  by".

## 3. Wikidata modeling

Verified live against Wikidata (property/item pages and `wbsearchentities`) while
writing this design.

| Statement | Property | Notes |
| --- | --- | --- |
| chairperson | **P488** | association → person. Unchanged base property: "presiding member of an organization, group or body" — broad enough to cover every title below. |
| start of term | **P580** | qualifier on the `P488` statement, day precision. |
| end of term | **P582** | qualifier on the `P488` statement, day precision; absent = still current. |
| exact title | **P3831** ("object of statement has role") | qualifier on the `P488` statement, value = one of the office-type items below. This is the qualifier Wikidata defines specifically for "what role does the *object* of this statement play, in the context of this statement" — exactly this case. No new statement type or property is introduced; existing `P488` statements without this qualifier keep meaning "chairperson" generically. |
| employer / current affiliation | **P108** | person → organization. Unchanged from the existing model. |
| affiliation known as of | **P585** ("point in time") | qualifier on the `P108` statement, set to the date the entry is made. This is the literal answer to "valid at the time of entry": `P585` is Wikidata's qualifier for "a statement was true at this point in time", used precisely when start/end of validity is *not* known — as opposed to `P580`/`P582`, which assert a known duration. Applied whenever this feature writes a `P108` statement, whether the person is new or already exists. |
| date of birth | **P569** | person, optional, day precision. |
| ORCID iD | **P496** | person, optional, unchanged. |
| official website | **P856** | person, optional, unchanged ("academic homepage" in the existing model). |

**Office-type items** — picked by checking sitelink counts on Wikidata to avoid an
obscure duplicate item with the same label:

| Office | QID | Description on Wikidata | Sitelinks |
| --- | --- | --- | --- |
| President | **Q1255921** | "leader of an organization" (not Q30461, which is a head-of-*state* president) | 22 |
| Chairperson / chairman | **Q140686** | "leading or presiding officer of an organized group" | 48 |
| Vice-president | **Q42178** | "officer in government, business or educational institutions" (not Q17989045, a near-unused duplicate with 2 sitelinks) | 89 |
| Secretary-general | **Q6501749** | "leader or chief officer of an organisation" | 47 |
| Treasurer | **Q388338** | "person responsible for running the treasury of an organization" | 45 |
| Speaker | **Q1758037** | "presiding officer of a national assembly or legislative body" — less common for a scholarly association, kept as it was explicitly asked for | — |

This list is **not exhaustive on purpose** (honorary president, president-elect and
executive director all exist on Wikidata but are comparatively rare for this
directory's associations). Rather than hard-coding every title, the picker offers
these six plus an **"Other — search Wikidata"** option using the existing
entity-typeahead component, so any office item can be picked without a code change —
consistent with how `config.json` already holds `humanQid`/`researcherQid` for exactly
this kind of "small curated default, no hard ceiling" choice.

## 4. Data model (`core/draft.js`)

The `change-president` mode and its backing fields are **removed**, not deprecated:
`DraftPerson`, `draft.president`, `draft.previousPresidentStatementId` and
`draft.termStart` are dead code today — confirmed by `STEP_ORDER`, where
`create-association` has no `people` step and `change-president`'s `people` step body
was never implemented, so nothing in the UI has ever set these fields. `create-association`'s
already-unreachable "optional president at creation" branch in `buildChangeSet` is
removed for the same reason.

```js
/**
 * @typedef {Object} DraftOfficerPerson
 * @property {string|null} qid                  // an existing person, or null to create one
 * @property {Object<string,string>} labels      // language code -> name (new person only)
 * @property {string} description                // short English description (new person only)
 * @property {string|null} birthDate             // 'YYYY-MM-DD', new person only, optional
 * @property {string|null} affiliationQid        // P108 target, optional
 * @property {string|null} affiliationLabel      // display only
 * @property {string|null} orcid                 // P496, optional
 * @property {string|null} homepage              // P856, optional
 *
 * @typedef {Object} DraftOfficerRow
 * @property {DraftOfficerPerson} person
 * @property {string} officeQid                  // P3831 value; defaults to config.officeTypes[0].qid
 * @property {string} officeLabel                // display only
 * @property {string} begin                      // 'YYYY-MM-DD', required
 * @property {string|null} end                   // 'YYYY-MM-DD', optional ("present" if blank)
 *
 * @typedef {Object} LeadershipHistoryRow         // an existing P488 statement, read from Wikidata
 * @property {string} statementId
 * @property {string} personQid
 * @property {string} personLabel
 * @property {string|null} officeQid
 * @property {string|null} officeLabel            // "chairperson" fallback if no P3831 qualifier
 * @property {string|null} begin
 * @property {string|null} end                    // null = still open
 *
 * @typedef {Object} LeadershipOriginal
 * @property {LeadershipHistoryRow[]} history      // every P488 statement, sorted begin desc
 * @property {LeadershipHistoryRow|null} current   // the one row (if any) with no end date
 */
```

`DirectoryDraft` changes:

- `mode` gains `'manage-leadership'`, replacing `'change-president'`.
- New `draft.officers: DraftOfficerRow[]` — the rows being added (empty array to
  start, one blank row seeded on open).
- New `draft.leadershipOriginal: LeadershipOriginal|null` — loaded from Wikidata when
  the wizard opens; `null` only while loading.
- `association.qid` and `association.referenceUrl` are reused as-is: this mode always
  targets an existing association (`qid` preset from the card) and always writes
  statements, so one reference URL covers the whole submission — same pattern
  `update-field` already uses.
- `president`, `previousPresidentStatementId`, `termStart`, `DraftPerson` are deleted.

A pure parser, next to the existing `originalFromEntity`:

```js
/** Parse an entity's P488 claims into leadership rows (no label resolution — QIDs only). */
export function leadershipClaimsFromEntity(entity) { /* ... */ }
```

returning `{statementId, personQid, officeQid, begin, end}[]`, using the same
time-value parsing idea as `originalFromEntity`'s `yearOf` but to day precision. Kept
pure and unit-testable against a fake entity, exactly like the former-names parsing.
Label resolution (person and office names) happens in the adapter (§7), which is the
only layer that talks to the network.

## 5. User flow

### 5.1 Entry point

A **"Manage leadership"** action next to **Edit** on the association card (edit mode
only). Opens the wizard in `manage-leadership` mode, seeded with the card's `qid`.

### 5.2 `officers` step

On open, the wizard fetches the item's existing leadership (§7) and shows:

- **Already on Wikidata** (read-only), exactly like former names: each existing row as
  `office: person, begin – end (or "present")`. Not editable here.
- **Add an officeholder**, repeated for each row in `draft.officers`:
  - **Person** — a search-first typeahead (existing `entity-typeahead.js`, unchanged).
    Picking a match fills `person.qid` **and** reveals an optional **current
    affiliation** field for that existing person (same typeahead as "part of" /
    "operating area" elsewhere in the wizard) — no guard, since an existing Wikidata
    item's notability is already established; this only adds a fresh, `P585`-dated
    `P108` statement if filled in. Choosing "None of these — create new" instead
    switches the row into a small create-person form:
    - **Name** — one required text field (default language `en`) plus a "+ add another
      language" link that reveals exactly one more name field, for a second language.
      Capped at two languages total, with no further "add" after that — a deliberately
      smaller version of the association's language-block UI: most people need at most
      a native-script name and a Latin-script one, not the full "any number of
      languages, suggested from the country" machinery the association form has.
    - **Description** — one short English line, optional.
    - **Birth date** — `<input type="date">`, optional.
    - **Current affiliation** — the same typeahead as above, optional, but see the
      guard below.
    - **ORCID iD**, **homepage** — optional text fields, unchanged from today.
    - Guard: a brand-new person needs **affiliation or ORCID** (at least one) before
      the row validates — kept from the current design's notability rationale so this
      feature does not make it easy to create unverifiable stub items. Birth date
      stays fully optional either way.
  - **Office** — a `<select>` of the six curated titles (§3), defaulting to
    "President", plus "Other — search Wikidata…", which reveals the typeahead in
    place of the select.
  - **Begin** — `<input type="date">`, required.
  - **End** — `<input type="date">`, optional; leave blank for "this is the current
    officeholder".
  - A **remove** button per row.
- **+ Add another officeholder** appends a blank row (default office "President",
  today's date is *not* pre-filled — the date is a fact to enter, not a default).
- **Reference URL** — one field for the whole step, required as soon as any row is
  filled in (same placement/behavior as the existing `update-field` reference field).

At most one row across the whole batch may be left with a blank end date (validation,
§6) — the batch can describe any number of past terms, but only one "this is the
current one" claim at a time, matching the single-leadership-role scope (§2).

### 5.3 `review` step

Same shape as the existing review step (`describeChanges`), with one line per row,
e.g.:

```text
president: Jane Roe (new person), 2020-01-01 – 2023-06-30
president: Q12345 (existing person), 2023-07-01 – present
ends the previous president's term at 2023-07-01
```

## 6. Validation (`core/draft.js`, `ui/edit-wizard/steps.js`)

`STEP_ORDER['manage-leadership'] = ['officers', 'review']` (no `identify` step — the
association is already known).

`validateDraftForChangeset`, `manage-leadership` branch:

- `association.qid` required (always true — seeded from the card).
- `draft.officers` must contain at least one row ("add at least one officeholder").
- Per row:
  - person: `qid`, or at least one non-blank `labels` entry ("name the officeholder or
    pick an existing person").
  - new person only: `affiliationQid` or `orcid` required; `labels` validated the same
    way as association terms (valid language codes, ≤250 characters).
  - `officeQid` required (always true — the select always has a value).
  - `begin` required and a valid calendar date.
  - `end`, if given, a valid calendar date not before `begin`.
- Across all rows: at most one may have a blank `end`.
- `association.referenceUrl` required as soon as `draft.officers` has any filled row.

## 7. Write path

### 7.1 Change set (`core/changeset.js`)

New `manage-leadership` branch in `buildChangeSet`, replacing the old
`change-president` branch. For each row, **in order**, and interleaved (a new
person's `create-item` immediately followed by its own `P488` statement, not batched
separately) so the QuickStatements fallback's `LAST` reference keeps resolving to the
right item:

1. Person:
   - existing (`qid` set): `personValue = item(qid)`; if `affiliationQid` given, an
     `add-statement` op for `P108` on the person, qualified with `P585` = today,
     referenced with the step's `referenceUrl`.
   - new: a `create-item` op (`ref: 'person-<row index>'`) with claims `P31=Q5`
     (human), `P106=<researcherQid>`, plus `P569` (birth date) if given, `P108`
     (qualified `P585` = today) if `affiliationQid` given, `P856` if homepage given,
     `P496` if ORCID given — each claim referenced with the step's `referenceUrl`.
     `personValue = ref('person-<row index>')`.
2. The term itself: an `add-statement` op on `association.qid`, property `P488`,
   value `personValue`, qualifiers `[P580=begin, P3831=officeQid, P582=end?]`,
   referenced with the step's `referenceUrl`.
3. After all rows: if exactly one row has a blank `end` **and**
   `draft.leadershipOriginal.current` is not null, one `end-statement` op on that
   existing statement's id, `endDate` = that row's `begin` — generalizing the dead
   `previousPresidentStatementId` mechanic, now driven by the row's own date instead
   of a separate top-level field.

No new `Op` type is introduced — `create-item` / `add-statement` / `end-statement`
already cover every case, and `core/quickstatements.js`'s serializer already handles
item-valued qualifiers (`qsValue`'s `'item'` case) and the interleaved-ref pattern
described above, so the QuickStatements fallback (`writeMode: 'quickstatements'`)
needs no changes.

### 7.2 Reading existing leadership (`adapters/wikibase-api.js`)

New `getLeadershipHistory(qid)`:

1. `getEntity(qid)` (existing method) → `leadershipClaimsFromEntity(entity)` (§4, pure,
   core-layer) → rows with QIDs but no labels yet.
2. Collect every distinct person and office QID referenced, resolve labels in **one**
   batched `wbgetentities` call (same batching already used by `searchCountries`), not
   one request per row.
3. Merge labels into the rows, sort by `begin` descending (rows with no `begin` last),
   and compute `current` = the row with a null `end` (if there is more than one — a
   data inconsistency already present on Wikidata itself — pick the one with the
   latest `begin` and proceed; this is a display/auto-end nicety, not a data
   integrity check this app can or should enforce).
4. Never throws from a missing office qualifier: `officeLabel` falls back to
   "chairperson" when a row has no `P3831` qualifier (the pre-existing, un-qualified
   meaning of `P488`).

Used by both the wizard (to show "already on Wikidata" and to find `current` for the
auto-end step) and the card's leadership-history disclosure (§8) — one implementation,
two call sites, no duplicated parsing.

## 8. Card display ("past presidents")

`association-card.js` gains a collapsed, native disclosure right after the existing
`president:` row (that row, driven by the unchanged bulk SPARQL query, is untouched):

```html
<details class="card__history" data-qid="${a.qid}">
  <summary>Leadership history</summary>
  <div data-role="leadership-history-body"></div>
</details>
```

A small new component, `src/ui/components/leadership-history.js`, mounted once per
rendered card, listens for the native `toggle` event and — only on the **first** time
it opens, and only if not already cached for this `qid` — calls
`ports.search.getLeadershipHistory(qid)`, renders a `<ul>` of
`"<office>: <person>, <begin> – <end or "present">"` rows sorted most-recent-first, or
an inline error with no retry button needed (re-collapsing and re-expanding retries
it). Using `<details>`/`<summary>` means the expand/collapse state itself needs no
JavaScript — only the lazy fetch on first open does.

**Caching:** an in-memory `Map<qid, LeadershipOriginal>`, session-only, mirroring how
`adapters/wikidata-revisions.js` caches `lastEdit`. Saving a `manage-leadership`
change clears that association's cache entry so the disclosure re-fetches fresh data
next time it is opened (same "clear on save" rule already applied to `lastEdit`).

**Explicitly not done:** no SPARQL query changes, no addition to
`scripts/refresh-snapshot.mjs` / `data/snapshot.json`. This is a live-only, on-demand
detail, not part of the always-visible card content — unlike "last edited by", which
is shown unconditionally and therefore is snapshotted.

## 9. Errors and feedback

Unchanged mechanics, applied to the new mode:

- **Partial success** (some rows written, one failed): the error is shown on the
  review screen, the draft (including which rows already exist as ops) is kept, and
  retrying re-sends the whole change set — safe, because adding a `P488` statement and
  ending one are not literally idempotent (retrying could in principle add a duplicate
  term), so the review screen's error message explicitly tells the editor to check the
  item before retrying rather than silently re-submitting, the one place this design
  departs from the "retry is always safe" assumption used elsewhere in the wizard.
- **Auth expired / load failure on open**: identical to the existing `update-field`
  handling (inline error + retry for the load; reconnect prompt for auth).

## 10. Units and boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `core/draft.js` | `DraftOfficerRow`/`LeadershipOriginal` types, `leadershipClaimsFromEntity` (pure), validation | `languages.js` |
| `core/changeset.js` | `manage-leadership` ops, interleaved create/statement ordering | `draft.js` |
| `adapters/wikibase-api.js` | `getLeadershipHistory` (fetch + label batching + sort) | `getEntity`, `leadershipClaimsFromEntity` |
| `ui/edit-wizard/leadership-form.js` (new) | officer rows UI, field-input handling | `entity-typeahead.js`, `languages.js` |
| `ui/edit-wizard/wizard.js` | step wiring, loading `leadershipOriginal` on open | the above |
| `ui/components/leadership-history.js` (new) | card disclosure: lazy fetch + render | `getLeadershipHistory` |
| `ui/association-card.js` | mounts the disclosure | `leadership-history.js` |
| `app.js` | "Manage leadership" button | `wizard.js` |
| `config.json` | `officeTypes` list | — |

## 11. Testing

- **Unit (`core/draft.js`):** `leadershipClaimsFromEntity` against a fake entity with
  0/1/many `P488` claims, with and without `P3831`/`P582`; validation (row guards,
  at-most-one-open-row, new-person affiliation-or-ORCID guard, date ordering).
- **Unit (`core/changeset.js`):** one existing person + dates only; one new person
  with every optional field; a mixed batch of two rows (one past, one current) with
  the auto-`end-statement` on the previously-open statement; the `P585` qualifier is
  present on every `P108` op this mode writes.
- **Unit (`core/quickstatements.js`):** the interleaved create/statement ordering
  resolves via `LAST` for a two-row batch (regression guard for the exact ordering
  §7.1 depends on).
- **Adapter (`wikibase-api.js`) with a fake `fetch`:** `getLeadershipHistory` batches
  label lookups into one request, sorts correctly, falls back to "chairperson" when
  `P3831` is missing, and picks the latest `begin` when more than one row is open.
- **DOM (jsdom):** officer row add/remove; new-person sub-form only requires
  affiliation-or-ORCID, not both; office select defaults to President and switches to
  a typeahead under "Other"; begin/end are real `<input type="date">` elements; the
  at-most-one-blank-end rule blocks Next with a clear message; card disclosure fetches
  only on first open and reuses the cached result on a second toggle.

## 12. Open risks

1. **More than one open `P488` statement already on an item** (a pre-existing data
   problem, not something this app writes): `getLeadershipHistory` picks the
   latest-`begin` row as `current` and proceeds rather than blocking the wizard; the
   read-only "already on Wikidata" list still shows every row, so the inconsistency is
   visible, just not fixed automatically.
2. **QuickStatements interleaving** (§7.1) is a real constraint of QS v1's `LAST`
   reference, not merely a style choice; if a future change to `buildChangeSet`
   reorders these ops (e.g. during a refactor), the QS fallback would silently start
   emitting `# MANUAL` comments instead of working statements for every row after the
   first. Covered by the ordering-regression test in §11, but worth flagging as a
   constraint on future changes to this function, not just this one.
3. **Small office-type list**: an association whose head is titled something not in
   the curated six and not obviously findable via the "Other — search" free text
   (a mistranslation, an unusual historical title) has no better fallback than that
   search. Acceptable for a first version; widening `config.officeTypes` needs no code
   change if the six turn out to be too narrow in practice.
