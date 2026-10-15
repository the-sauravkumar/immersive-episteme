# ADR 0003: The visual system "Apparatus"

- **Status:** accepted (before any participant data is collected)
- **Supersedes:** nothing; extends ADR 0001 (stack and foundation)
- **Detail:** `DESIGN.md` (the binding spec) and the design decision log,
  `docs/research/design-process/decisions.md` DR-015, DR-018, DR-019, DR-020, DR-021, and the
  implementation notes in `docs/research/design-process/modules/visual-system.md`.

## Context

The interface has to look like finished research and must not explain a 2D versus 3D difference
in results: the project's governing requirement is equivalence of knowledge, ease of access and a
neat UI that cannot skew the comparison (DESIGN.md 1, 12). DR-019 adopted DESIGN.md after a
screenshot audit, five verified research topics, three scored directions and a critic pass.

## Decision

The platform uses the "Apparatus" system of DESIGN.md. The decisions that bear on the study
materials, and so must be fixed before data collection, are:

| Decision | Value | Where it is defined |
|---|---|---|
| One knowledge component set | The 2D page column and the 3D panel render the same `KnowledgeSheet`, `ClaimList`, citation, figure, layer, related-concept, pager, StudyBar, guidance and state components, from the same module files. | DESIGN.md 12.1; checked by P19 (`tests/unit/design/import-graph.test.ts`) |
| Claim face | Inter, kept from the earlier build so the study baseline changes least; Source Serif 4 for titles, headings and the verbatim quote. | DESIGN.md 2.6, 5.1 |
| Claim measure and panel width | A 34rem (544 px) measure plus a 2.25rem hang and 1.5rem padding: the sheet is 39.25rem in both conditions; the 3D panel docks at that width from 1024 px and covers the scene below 1024 px. | DESIGN.md 6, 11.6; P2, P3 |
| Lightbox cap | Every study figure opens in a lightbox capped at 768 px on its long edge, in both conditions (the V&A cap, one cap for all figures). | DESIGN.md 9.9, 12.3 rule 10; DR-020 |
| Canonical tradition order | Alphabetical by display name (Ajrakh, Machilipatnam Kalamkari, Sanganeri for the study), fixed and identical in both conditions, not counterbalanced. | DESIGN.md 12.3 rule 12; DR-019 |
| Study theme | Light only in study mode; High contrast offered once, before any measured step, and recorded on the session. | DESIGN.md 4.5; DR-019 |
| Search | Off in study builds of both conditions. | DR-019; DESIGN.md 17 risk 9 |
| Figures | Graph-derived structure diagrams now, rights-cleared photographs later, through one figure frame; balanced per section across the study traditions; a protocol switch turns the diagrams off in both conditions. | DR-018, DR-020 |
| Motion | None in study mode, in either condition. | DESIGN.md 8; P12 |

## Consequences

- The interface parity suite (`tests/e2e/parity.spec.ts`, checks P1-P27) measures these choices
  on the live pages and writes `analysis/parity/interface-parity.json`, which the Equivalence
  Monitor shows in the research console and on the Colophon.
- Any later change to these values changes the study materials. It needs a new decision record
  and, after data collection has started, cannot apply to a running study.
- The paper reports the visual system as part of the materials, with the parity results, and
  names the docked-panel width and the fixed tradition order as limitations (DR-019).
