# At‑risk / contested records

Working list of directory entries that a Wikidata editor could reasonably challenge on
notability grounds, with the fallback plan for each. Referenced from
`docs/spec/2026-09-01-socio-legal-associations-directory-design.md` §1.7 / §2.7.

Keep this current: when an item is created, note its QID; if an item is deleted or
merged, record the outcome and how the directory now represents that body.

## Categories

| Category | Why exposed | Default modelling | Fallback if challenged |
| --- | --- | --- | --- |
| **National sections / committees** of a larger association | Often no independent identifiers or press coverage | Item linked to the parent with `P361` (part of) | Represent as a statement on the parent (`P527` has part), no stand‑alone item |
| **Brand‑new bodies** (founded ≲ 3 years) | Limited independent sourcing yet | Stand‑alone item with references + official site + founders | Hold in the directory data only until sourcing matures; revisit in 12 months |
| **Dormant / possibly inactive networks** | "Clearly identifiable" but thin recent activity | Stand‑alone item, `P571` inception, last‑known activity noted in `data/` | Represent via its journal or its host institution; or keep in directory data only |

## Entries to watch (from directory v7, Sept 2026)

| Body | Category | Status | Notes |
| --- | --- | --- | --- |
| Law & Social Sciences Network (LASSNET) | Dormant | created ([Q141260093](https://www.wikidata.org/wiki/Q141260093)) | No conference identified since 2018 |
| Research Committee on Sociology of Law, Swiss Sociological Association (FK Rechtssoziologie) | Dormant | created ([Q141260174](https://www.wikidata.org/wiki/Q141260174)) | Possibly inactive; Swiss activity now via SNLS |
| Asociación Latinoamericana y del Caribe de Derecho y Sociedad (ALADES) | Brand‑new | created ([Q141260163](https://www.wikidata.org/wiki/Q141260163)) | Founded 2024; successor to RELADES, 20+ countries |
| Israeli Law and Society Association (ILSA) | Brand‑new / unclear founding | created ([Q141260170](https://www.wikidata.org/wiki/Q141260170)) | Founding date to confirm; annual conference runs |
| Sociology of Law Section, Polish Sociological Association | National section | created ([Q141260096](https://www.wikidata.org/wiki/Q141260096)), `P361`→[Q7209992](https://www.wikidata.org/wiki/Q7209992) | Link `P361` → Polish Sociological Association |
| Austrian Sociological Association – Section on Law and Society | National section | created ([Q141260165](https://www.wikidata.org/wiki/Q141260165)), `P361`→[Q303283](https://www.wikidata.org/wiki/Q303283) | Link `P361` → Österreichische Gesellschaft für Soziologie |
| Research Committee on the Sociology of Law, Crime and Deviance (RC‑23), Indian Sociological Society | National section | created ([Q141260175](https://www.wikidata.org/wiki/Q141260175)), `P361`→[Q3488406](https://www.wikidata.org/wiki/Q3488406) | Link `P361` → Indian Sociological Society |
| DGS Sociology of Law Section | National section | created ([Q141260089](https://www.wikidata.org/wiki/Q141260089)), `P361`→[Q1202999](https://www.wikidata.org/wiki/Q1202999) | Same `P361` pattern; some have an owned journal that is itself notable |
| AIS Sociology of Law Section (Italian) | National section | created ([Q141260179](https://www.wikidata.org/wiki/Q141260179)), `P361`→[Q2867838](https://www.wikidata.org/wiki/Q2867838) | Same `P361` pattern |
| APS‑SDJ (Portuguese) | National section | added to pre‑existing item ([Q141260178](https://www.wikidata.org/wiki/Q141260178)), `P361`→[Q139771455](https://www.wikidata.org/wiki/Q139771455) | Same `P361` pattern |
| AFS RT13 (French) | National section | created ([Q141260095](https://www.wikidata.org/wiki/Q141260095)), `P361`→[Q2867726](https://www.wikidata.org/wiki/Q2867726) | Same `P361` pattern |

All entries above imported 2026-09-02 (runbook Task C2), without waiting for the
Task A2 WikiProject consultation to conclude — the project lead reviewed the
provisional `P31`/`P101` choices directly and judged them sound. If the consultation
(still open at `Wikidata talk:WikiProject Law`) surfaces a different consensus,
revisit these items' `P31` values then. Full QID mapping for every imported
association (not just the at-risk ones): `data/qids.json` (private, untracked).
