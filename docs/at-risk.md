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
| Law & Social Sciences Network (LASSNET) | Dormant | not yet created | No conference identified since 2018 |
| Research Committee on Sociology of Law, Swiss Sociological Association (FK Rechtssoziologie) | Dormant | not yet created | Possibly inactive; Swiss activity now via SNLS |
| Asociación Latinoamericana y del Caribe de Derecho y Sociedad (ALADES) | Brand‑new | not yet created | Founded 2024; successor to RELADES, 20+ countries |
| Israeli Law and Society Association (ILSA) | Brand‑new / unclear founding | not yet created | Founding date to confirm; annual conference runs |
| Sociology of Law Section, Polish Sociological Association | National section | not yet created | Link `P361` → Polish Sociological Association |
| Austrian Sociological Association – Section on Law and Society | National section | not yet created | Link `P361` → Österreichische Gesellschaft für Soziologie |
| Research Committee on the Sociology of Law, Crime and Deviance (RC‑23), Indian Sociological Society | National section | not yet created | Link `P361` → Indian Sociological Society |
| DGS Sociology of Law Section; AIS Sociology of Law Section; APS‑SDJ; AFS RT13 | National sections | not yet created | Same `P361` pattern; some have an owned journal that is itself notable |
