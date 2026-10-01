# Association founding/dissolution year and defunct filtering — Design

**Status:** Draft for discussion
**Date:** 2026-10-01
**Builds on:** [`2026-10-01-journals-design.md`](2026-10-01-journals-design.md) §3/§4.2
(the `founded`/`closed` year-field pattern and its P571/P576 Wikidata modeling, reused
here for associations)

## 1. Problem

An association's founding year (P571, "inception") is already partially wired into this
app — `core/model.js`'s `Association.inception` is fetched by the main directory query
and `core/changeset.js` writes it when a new association is **created** — but it is
**dead/unreachable** everywhere else: there is no form field to enter or edit it, no
original value is loaded for diffing on edit, and it is never shown on the association
card. There is also no concept at all of an association having **ended** (dissolved,
merged, disbanded) — no `closed`-style field, no P576 usage, nothing.

Separately, the directory's search has no notion of "defunct" for either associations or
journals: a dissolved association or discontinued journal (journals already have a
`closed` field, per the journals design) is shown exactly like an active one.

## 2. Goals and non-goals

**Goals**

1. Complete the founding-year field for associations: a form input, original-value
   loading for edit, change detection, writing on both create and edit, and display on
   the association card.
2. Add a dissolution-year field for associations (P576), symmetrical to founding year
   and to the journal `closed` field, so a defunct association can be recorded.
3. Add a "founding year before dissolution year" validation check, for both associations
   and journals (journals have the same two fields today with no such check).
4. Exclude defunct associations and defunct journals (both association-published and
   independent) from directory search results by default.

**Non-goals (this design)**

- Any UI to find, list, or re-include defunct entries. The SPARQL-level exclusion in
  §5 is unconditional for now; a later design can add a toggle if that becomes needed.
- Changing how `model.js`'s `Association`/`Journal` read-model types report
  defunctness — since defunct entries are excluded from the query, there is nothing to
  carry at that layer.
- Any change to how associations or journals are matched/classified (`P31`/`P101`/
  `P921`) — only the add-on `FILTER NOT EXISTS` guard is new.

## 3. Wikidata modeling

| Statement | Property | Notes |
| --- | --- | --- |
| founding year | **P571** ("inception") | already used; year precision, unchanged |
| dissolution year | **P576** ("dissolved, abolished or demolished date") | same property journals already use for `closed`; year precision |

Field naming: the association's draft/form field is called `closed`, matching the
journal field of the same name for the same property — internal consistency across the
two entity types — while the **form label** reads "Dissolved (year, if defunct)" rather
than "Closed", since that is the natural English term for an association. The founding
field keeps its existing internal name, `inception`.

## 4. Data model

### 4.1 `core/draft.js`

`AssociationOriginal` gains the two fields it is currently missing entirely:

```js
/**
 * @typedef {Object} AssociationOriginal
 * ...
 * @property {string|null} [inception]  // 'YYYY', as loaded from Wikidata
 * @property {string|null} [closed]     // 'YYYY', as loaded from Wikidata
 */
```

`DraftAssociation.inception` already exists; add `closed: string|null` next to it.
`emptyDraft('create-association')`'s association factory gains `closed: null`.

`originalFromEntity(entity)` gains P571/P576 parsing, using the same value-based
year-extraction already written once for `journalOriginalFromEntity`'s local `yearOf`
helper (`/^[+-]?0*(\d+)-/` against the datavalue's `.time`) — factored into one shared
top-level helper in `draft.js` so it is not duplicated a third time.

`changedStatements(a)` (today only diffs `website`/`email`) gains `inception`/`closed`,
same "non-blank and different from original" rule already used for the other two
fields:

```js
export function changedStatements(a) {
  const website = ...
  const email = ...
  const inception = (a.inception || '').trim();
  const closed = (a.closed || '').trim();
  return {
    website: ...,
    email: ...,
    inception: inception && inception !== (a.original?.inception || '').trim() ? inception : null,
    closed: closed && closed !== (a.original?.closed || '').trim() ? closed : null,
  };
}
```

### 4.2 Validation (`core/draft.js`)

A new shared check — "the end year can't be before the start year" — generalized out of
the existing former-name start/end check (today at `validateFormerNames`, comparing
`r.start`/`r.end`) into a small reusable helper, applied to:

- former names (unchanged behavior, now calling the shared helper)
- association `inception`/`closed`
- journal `founded`/`closed`

```js
// reuses the existing `YEAR` regex already defined in this file (former-name validation)
/** null if either side is blank/invalid; else an error string if end precedes start. */
function yearOrderError(what, start, end) {
  if (!YEAR.test(start) || !YEAR.test(end)) return null;
  return Number(start) > Number(end) ? `${what}: the end year is before the start year` : null;
}
```

`validateDraftForChangeset` calls `yearOrderError('association', a.inception, a.closed)`
for `update-field`/`create-association`, and `yearOrderError('journal', j.founded,
j.closed)` for `create-journal`/`update-journal`.

This is a small, closely-related fix bundled with the new association fields rather than
a separate change — journals have the identical gap today, and it would otherwise be
duplicated code the moment association gets its own copy.

### 4.3 `core/changeset.js`

- `create-association`: add `if (a.closed) claims.push({ property: 'P576', value:
  year(a.closed) });` next to the existing `P571` line.
- `update-field`: add, mirroring the existing `website`/`email` branches:

  ```js
  if (stmts.inception) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P571', value: year(stmts.inception), reference: assocRefUrl, replace: true }); changed.push('founding year'); }
  if (stmts.closed) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P576', value: year(stmts.closed), reference: assocRefUrl, replace: true }); changed.push('dissolution year'); }
  ```

- `describeChanges()`: add founding/dissolution year lines to the `update-field` review
  text (mirroring the `website`/`email` lines) and to the `create-association` review
  text (mirroring how country/seat are listed today).

### 4.4 `core/model.js`

No change. `Association.inception` already exists for the search-result row; `closed` is
not added there, since a defunct association never reaches that query once §5 lands.

## 5. Search filtering (SPARQL-level, `adapters/sparql-client.js`)

A `FILTER NOT EXISTS { ?x wdt:P576 ?dissolved }`-style guard is added in three places,
each with a block-scoped variable name to avoid clashes:

1. The main association match in `QUERY_TEMPLATE`, directly after
   `?assoc wdt:P101 wd:%FIELD% .`:
   ```sparql
   FILTER NOT EXISTS { ?assoc wdt:P576 ?assocDissolved. }
   ```
2. The association-published-journal `OPTIONAL` block inside the same `QUERY_TEMPLATE`
   (today: `OPTIONAL { ?journal wdt:P123 ?assoc . ?journal wdt:P31/wdt:P279* wd:Q737498 .
   ... }`), so a defunct journal simply fails to bind rather than hiding its publishing
   association:
   ```sparql
   FILTER NOT EXISTS { ?journal wdt:P576 ?journalDissolved. }
   ```
3. `JOURNAL_QUERY_TEMPLATE` (independent journals), after `?journal wdt:P921 wd:%FIELD% .`:
   ```sparql
   FILTER NOT EXISTS { ?journal wdt:P576 ?journalDissolved. }
   ```

`core/journals.js` needs no change — `publishedJournalsFrom`/`mergeJournals` only
reshape rows the two queries already returned.

## 6. Form UI (`ui/edit-wizard/details-form.js`)

Two plain year inputs, placed right before the "Former names" section (thematically
close — both sections are about dates in an association's history):

```js
<label>Founded (year) <input type="text" inputmode="numeric" name="inception"
    data-field="inception" value="${a.inception || ''}" autocomplete="off"></label>
<label>Dissolved (year, if defunct) <input type="text" inputmode="numeric" name="closed"
    data-field="closed" value="${a.closed || ''}" autocomplete="off"></label>
```

`applyFieldInput`: add `inception`/`closed` to the existing trim-or-null branch
(`field === 'website' || field === 'referenceUrl'`) rather than a new one.

`derived().refRequired`: extend the existing `changed.website || changed.email || ...`
condition with `changed.inception || changed.closed`, so editing either field requires a
reference URL, the same rule already applied to website/e-mail/former
names/abbreviations/parent/operating area.

## 7. Association card display (`ui/association-card.js`)

A "Founded: 1923" line is added when `a.inception` is set, placed in the existing meta
area near the scope/country line. No "Dissolved" display is needed — a defunct
association never reaches the card once §5's filter is in place.

## 8. Units and boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `core/draft.js` | `AssociationOriginal.inception/closed`, shared `yearOrderError` helper, extended `changedStatements` | — |
| `core/changeset.js` | P571/P576 claim writing (create + update), review-text lines | `draft.js` |
| `core/model.js` | unchanged | — |
| `adapters/sparql-client.js` | `FILTER NOT EXISTS` guards in both query templates | — |
| `ui/edit-wizard/details-form.js` | two new year inputs, `refRequired` extension | `draft.js` |
| `ui/association-card.js` | "Founded: YYYY" display line | `core/model.js` |

## 9. Testing

- **Unit (`core/draft.js`):** `originalFromEntity` parses P571/P576 from a fake entity
  (present, absent, deprecated-rank-ignored); `changedStatements` diffs
  `inception`/`closed` correctly (unset → set, set → changed, set → unchanged);
  `yearOrderError` for both association and journal field pairs, including the
  refactored former-name call site (regression: existing former-name year-order error
  message is unchanged).
- **Unit (`core/changeset.js`):** `create-association` with/without `closed`;
  `update-field` writing `P571`/`P576` with `replace:true`; `describeChanges` includes
  the new lines.
- **Adapter (`sparql-client.js`):** the three `FILTER NOT EXISTS` clauses are present in
  the built query strings (string-shape test, same style as existing query-template
  tests).
- **DOM (jsdom):** typing a founding/dissolution year marks the reference-URL field as
  required; the association card shows "Founded: YYYY" when set and omits the line when
  absent.
