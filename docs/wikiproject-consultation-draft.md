# Draft: WikiProject consultation post (Task A2)

> Not yet posted. Post this (or an edited version) as the project lead, from a
> logged-in Wikimedia account.
>
> **Venue, checked live 2026-09-02:** `Wikidata:WikiProject Sociology` has had no
> edits since January 2025 and has no talk page at all — not worth creating one
> there. `Wikidata:WikiProject Law`, by contrast, is actively maintained (bot-updated
> lists as recently as 2026-08-30) and its talk page,
> [`Wikidata talk:WikiProject Law`](https://www.wikidata.org/wiki/Wikidata_talk:WikiProject_Law),
> already exists. Post there as the primary venue, and cross-post (or just link to
> it) at [`Wikidata:Project chat`](https://www.wikidata.org/wiki/Wikidata:Project_chat)
> — the general, always-active community discussion board — for broader visibility,
> since this touches sociology as much as law.
>
> This step needs a human account and can't be automated — drafted here so posting
> it is a one-minute copy/paste.

---

## Proposed title

**Modelling proposal: worldwide directory of socio-legal scholarly associations**

## Proposed body

I'm building a public, read-only directory (map + list, reading live from Wikidata)
of scholarly associations, networks, and national sections working on the sociology
of law / law-and-society field. Before importing ~30 items I'd like a sanity check
on the modelling from people who watch this area:

**In-scope class (`P31`)** — provisionally:
- `Q955824` (learned society) for independent, dues-paying scholarly associations
- `Q48204` (voluntary association) for looser networks/committees without formal
  membership structures

Is this split reasonable, or is there a more specific class WikiProject Sociology/Law
already uses for this kind of body?

**Field of work (`P101`)** — `Q2734663` (sociology of law) on every item, regardless
of whether the body's own name says "law and society", "socio-legal studies",
"sociology of law", etc. Agree, or should broader/related fields also be tagged?

**National sections of an international body** (e.g. a country's sociological
association's own "sociology of law" section or research committee) — proposed:
model as a standalone item with `P361` (part of) pointing at the parent association,
rather than folding it into a statement on the parent. Reasoning: several sections
have their own officers, own web presence, and are cited independently in the
literature. Does this match how WikiProject Sociology handles similar national
sections/committees elsewhere?

**Association-published journals** — where an association is the publisher of
record for its own journal (`P123` on the journal item pointing back), the journal
gets linked but is otherwise out of scope for this project (no attempt to model
journals published commercially on an association's behalf, or the association's
whole publication history). Any objection to this narrow treatment?

**Borderline notability cases** — a working list of ~8 entries (brand-new bodies,
dormant networks, national sections with thin independent sourcing) is tracked at
[`docs/at-risk.md`](https://github.com/cboulanger/socio-legal-wikidata/blob/main/docs/at-risk.md)
in the project repo, with a fallback plan for each if challenged. Feedback on any of
these specific cases is very welcome.

Full data-modelling spec:
[`docs/spec/2026-09-01-socio-legal-associations-directory-design.md`](https://github.com/cboulanger/socio-legal-wikidata/blob/main/docs/spec/2026-09-01-socio-legal-associations-directory-design.md).

Thanks for any input — I'd like to run the import (via QuickStatements, references
attached to every added statement) once the class/field choices above are confirmed.

---

## After posting

- [ ] Record the agreed values in `config.json` (`inScopeClassQid`, `inScopeFieldQid`).
- [ ] Update data spec §2.3 to drop the *(confirm)* markers.
- [ ] If the agreed class differs from `Q955824`, update the SPARQL template default in
      `src/adapters/sparql-client.js` (or just rely on `config.json`, which the template
      already reads from).
