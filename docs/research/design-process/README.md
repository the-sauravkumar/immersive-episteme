# Design process record

This folder records **how** Immersive Episteme was designed and built: the decisions,
the alternatives considered, the evidence behind each choice, and what each decision
means for the research paper. It is written so that the methods, system-design and
limitations sections of a paper can be drafted from it directly.

| File | What it holds |
|---|---|
| [timeline.md](timeline.md) | Ordered sequence of milestones and decisions (no dates) |
| [decisions.md](decisions.md) | Decision records (DR-NNN): problem, options, decision, rationale, evidence, paper implications |
| [methods-notes.md](methods-notes.md) | Draft methods-section material (dataset construction, verification, spatial transformation, reproducibility), with verified numbers only |

## Rules for this record

1. **Every number must be traceable** to a log, test run or command output in the
   repository. Cite the file (e.g. `content/review/verification.md` §V6) next to the number.
2. **Record alternatives honestly**, including ones that were tried and reverted, and
   mistakes that were corrected. Reviewers value a transparent process.
3. **Separate fact from interpretation.** Decisions that are proposals awaiting the
   researchers' approval are marked *Proposed*.
4. **Add an entry in the same change** as the decision or module it describes.
5. **No dates or times.** Record order and substance only.
6. **Keep it current.** The record is updated as the project progresses. A wave or module
   is not reported as done until its steps are in `timeline.md`, its decisions are in
   `decisions.md` (or a `modules/<area>.md` record), and any changed numbers in
   `methods-notes.md` have been re-measured.

## Related technical documents

- `docs/research/requirements-digest.md`: research requirements from the concept note
- `docs/research/content-dataset.md`: dataset composition and shortlist proposal
- `content/review/verification.md`: first-hand verification log (V1–V10)
- `docs/architecture/spatial-compiler.md`: knowledge-to-space transformation
- `docs/architecture/knowledge-graph-validation.md`: graph integrity rules
- `docs/research/concept-map-scoring.md`: primary-outcome scoring definitions
- `docs/architecture/immersive-rendering-quality.md`: rendering acceptance specification
- `docs/decisions/`: engineering architecture decision records (ADRs)
