# Design decision records

Each record: **Context** (the problem) · **Options** · **Decision** · **Rationale and
evidence** · **Paper implications**. Status is *Adopted* unless marked *Proposed*
(awaiting researcher approval). Engineering-level ADRs live in `docs/decisions/`; these
records capture design choices that matter for the research and the paper.

---

## DR-001: One platform, two experimental conditions (Adopted)

- **Context:** The study compares relational learning between a conventional 2D pathway
  and a spatially organised 3D museum.
- **Options:** (a) two separate applications; (b) one application with route-level
  separation and shared infrastructure.
- **Decision:** (b). One Next.js application with `/learn/2d` and `/learn/immersive`
  sharing one knowledge snapshot, auth, study engine, assessments and telemetry.
- **Rationale:** The independent variable must be *spatial organisation only*. Shared
  content identifiers, assessments and telemetry remove whole classes of confound,
  such as different text, different instruments or different logging.
- **Paper:** State that both conditions render from the same immutable knowledge
  snapshot (content hash recorded per session), and that only navigation and spatial
  organisation differ.

## DR-002: Build fresh; use the existing museum as a design reference (Adopted)

- **Context:** An existing hand-block-printing virtual museum (`virtual-walkthrough`)
  had a hard-coded layout and placeholder content.
- **Options:** extend it; or build fresh and copy design components.
- **Decision:** Build fresh in `Paper_1`. The existing repo is read-only; visual tokens,
  UI patterns and 3D building blocks are adapted with attribution.
- **Rationale:** The research needs a layout *generated* from the knowledge graph. The
  reference layout was hand-written constants, and its content was explicitly
  placeholder (`docs/architecture/design-reuse-catalogue.md` §1, §6).
- **Deviation note:** The concept note and master prompt suggested adapting the existing
  museum. This was a deliberate deviation by the lead and should be reported.

## DR-003: Infrastructure and ordering (Adopted)

PostgreSQL 18 in Docker (pgvector, pg_trgm), Drizzle ORM, Better Auth, and research-critical
modules before CMS polish and public pages. See `docs/decisions/0001-stack-and-foundation.md`.

## DR-004: Six hand-block-printing traditions of one craft type (Adopted; study subset *Proposed*)

- **Context:** The concept note refers to six traditions but names none. The lead asked
  for datasets from hand block printing, mud-based or wood-based craft, preferring one
  craft type if that made demonstration easier.
- **Options:** mixed crafts (block printing, mud, wood); or six traditions of one type.
- **Decision:** Six Indian hand-block-printing traditions: Sanganeri, Bagru, Ajrakh, Bagh,
  Dabu (mud-resist, which also covers the mud-based craft) and Machilipatnam Kalamkari.
- **Rationale:** A shared material, tool and process vocabulary makes cross-tradition
  comparison and concept-map scoring meaningful. Mixed crafts would compare unlike
  structures.
- **Proposed study subset:** Ajrakh, Sanganeri, Machilipatnam Kalamkari (independent
  sources; no shared GI text). Bagru and Sanganeri should not both be used: their GI
  applications share a template and about 34% of their method text verbatim
  (`content/review/verification.md` §V1). Awaiting researcher approval.

## DR-005: Two-stage curation (research agents, then adversarial fact-check) (Adopted)

Each tradition was drafted from public sources (GI registry and journals, museum
records, peer-reviewed papers, craft-documentation archives) by a research agent. An
independent fact-check agent then re-fetched every source and corrected or downgraded
unsupported claims. Logs: `content/review/*-factcheck.md`.

## DR-006: First-hand verification of the whole dataset (Adopted)

- **Context:** The lead required that research be done first-hand and that nothing be
  asserted unless it is present in a source or provable.
- **Decision:** Archive every cited source (105 URLs, SHA-256 recorded) and check every
  claim against the archived text. Weakest and partial lexical matches (457) were read by
  hand; strong matches (795) were checked by a numeric-consistency test plus a reproducible
  random sample of 60 read by hand (60/60 supported).
- **Evidence:** `content/review/verification.md` §V5–V6; scripts in `content/review/tools/`.
- **Paper:** This is a reportable dataset-validation procedure. Report the bands, the
  sample size and seed, and the correction counts.

## DR-007: Learner-facing text is built only from verified claims (Adopted)

- **Context:** About 1,028 summary and body sentences said more than their concept's claims;
  only 104 of those matched a cited source strongly (§V7).
- **Decision:** `summary` and `body_md` are generated from the concept's own claims, each
  followed by its source ids. Earlier prose was archived for curators.
- **Rationale:** Every sentence a participant reads then traces to a cited, checked claim.
  Both conditions present identical text.
- **Paper:** Supports the claim of informational equivalence between conditions.

## DR-008: Relationships must be stated by sources (Adopted)

All 704 relationships were checked (CAUSES and PRECEDES by hand against source step
orders; SCIENTIFICALLY_EXPLAINED_BY against stage claims; the rest by hand or a
stratified sample). 8 relationships that were inferences rather than source statements
were removed and archived with reasons (`content/review/removed-relationships.json`).
Later integrity fixes added 19 claim-derived links (§V9), giving 715 relationships.

## DR-009: Server-enforced condition lock and pseudonymous participants (Adopted)

Participants hold a signed, server-validated session cookie bound to their assigned
condition. Every learning route checks it server-side, so changing the URL cannot reach
the other condition. Participants never hold staff accounts. Independent security
review: 26 findings, 20 confirmed and fixed.

## DR-010: Deterministic, traceable knowledge-to-space compilation (Adopted)

- **Decision:** A compiler maps the typed graph to a spatial manifest using explicit,
  configurable rules (classification → zone, sequence → path, dependency → threshold,
  association → adjacency, comparison → connected hall, causality → explanation
  sequence and never proximity alone, scientific explanation → disclosure layer). The same
  graph, configuration, seed and compiler version give a byte-identical manifest
  (SHA-256). Every element records its source concepts and relationships, the rule
  applied and a written rationale.
- **Evidence:** 59 tests; three shortlisted traditions compile with 254/254 concepts and
  421/421 relationships placed, and validation passes with 0 warnings
  (`docs/architecture/spatial-compiler.md`, §V10).
- **Paper:** This is the method's central, reproducible contribution. Report the rule
  table and the determinism guarantee.

## DR-011: Concept-map scoring is multi-metric and versioned (Adopted; primary metric *Proposed*)

Scores at three matching levels (undirected, directed, directed and typed), causal-chain
depth, structural similarity, pre/post change, and inter-rater agreement (Cohen's and
Fleiss' κ) with consensus building. Every score stores its metric version and
parameters. The **primary metric is a researcher decision** and must be fixed in the
pre-registered analysis plan (`docs/research/concept-map-scoring.md`).

## DR-012: Rendering quality is an experimental-validity requirement (Adopted)

- **Context:** The lead required no flicker, artefacts, distortion, unnatural lighting or lag.
- **Decision:** A measurable acceptance specification with checks C1–C12: static-frame
  pixel stability, luminance histograms, frame-time traces, hitch detection, visual
  regression, aspect assertions, study-mode configuration, low-spec runs, idle and
  background cost, memory and texture fidelity.
- **Rationale:** A visual defect present only in the 3D condition would confound the comparison.
- **Paper:** Report the hardware, the tiers and the measured C1–C12 results with the
  3D condition's description.

## DR-013: Accessibility to low-spec machines without lowering texture definition (Adopted)

The lead: "never compromise with texture quality and definition. We accommodate
everyone." Decision: one full-resolution texture set for all tiers. Low-spec support
comes from GPU texture compression (KTX2/UASTC), zone streaming, deep zoom for large
images, render-on-demand, and a reduced render resolution only while the camera
moves (full resolution within 150 ms of stopping). In study sessions the quality tier is
locked at session start and logged as a covariate.

## DR-014: Rendering approach informed by AAA practice (Proposed; to be decided by measurement)

Primary sources reviewed: the GTA V graphics study (Courrèges 2015), Epic's GPU Lightmass,
TSR and Nanite documentation, and an NVIDIA TAA survey. Adopted principles: bake static
lighting; precompute what does not change; stream by zone; fade rather than pop; use
temporal anti-aliasing for detail in motion. Verified in three.js 0.186.1:
`TAARenderPass` accumulates only at rest (no reprojection); `TRAANode` (reprojection)
requires `WebGPURenderer`, which falls back automatically to a WebGL2 backend. Decision
rule: use WebGPURenderer with TRAA if it passes C1–C12 on both backends; otherwise use
WebGLRenderer with SMAA in motion and accumulation at rest.

## DR-015: Equivalent content, exposure time and citation availability; navigation timed separately (Adopted)

- **Context:** The lead required: "ensure the 2D and 3D versions are equivalent in content,
  exposure time and citation … availability. Keep the navigation distinct but record
  navigation time separately from learning outcomes."
- **Decision:**
  1. Both conditions render the same claims-only content from one snapshot (DR-007).
  2. A fixed learning-phase duration, identical across conditions, is enforced with
     server-side start and end timestamps.
  3. Citations are available in both conditions through one shared, collapsed-by-default,
     non-modal citation component, so they never block the primary learning path.
  4. Telemetry splits learning-phase time into mutually exclusive content-exposure,
     navigation and pause intervals, measured with a monotonic clock. These timings are kept
     in telemetry and derived metrics only, never in learning-outcome data.
- **Rationale:** Navigation is the manipulated variable (distinct by design). Exposure and
  citation access are controlled, so outcome differences cannot be attributed to more time
  with content or more access to sources.
- **Paper:** Report equal exposure by design. Report measured content-exposure time and
  navigation time per condition as descriptive variables or covariates, separate from outcomes.

## DR-016: Requirements traced to sources; concept-note claims checked against the papers (Adopted)

The concept note and the ten supplied reference papers were mined for technical
requirements, with every quotation verified verbatim on its page
(`docs/research/technical-requirements.md`). Findings that bear on the design and need the
researchers' decisions:
- The planned ~20 per group is underpowered unless the effect is large. Derived exact
  power at n = 20: d = 0.45 gives 0.284; d = 0.84 gives 0.735.
- Petersen et al. (2022) does **not** support the concept-note statement that it
  "Demonstrates that extraneous load can undermine the benefits of immersion" (§3, P32);
  immersion had no effect on extraneous load in that study.
- Media-comparison confounds (CAMIL; Petersen et al.) and modality differences in the
  memory-palace studies qualify "differ primarily in spatial organisation" (§7, P91). The
  platform therefore holds content, exposure, citations, typography and tokens equal (DR-015, DR-001).
- Reference-list errors were corrected, e.g. the Hung & Lee author names.

