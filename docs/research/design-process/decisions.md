# Design decision records

Each record: **Context** (the problem) · **Options** · **Decision** · **Rationale and
evidence** · **Paper implications**. Status is *Adopted* unless marked *Proposed*
(awaiting researcher approval). Engineering-level ADRs live in `docs/decisions/`; these
records capture design choices that matter for the research and the paper.

**Numbering note (DR-039; final review knowledge-11).** DR-021, DR-022 and DR-023 were each filed
twice, in the same commit. The second set (DR-021 layout parity, DR-022 Atlas, DR-023 3D gallery
finish, and all their addenda) keeps its numbers, because the code, the tests, DESIGN.md and the
later records cite it. The first set was renumbered: **DR-034** (filed as the first DR-021, the
same concept layers and pager), **DR-035** (the first DR-022, Dashboard Figure 3) and **DR-036**
(the first DR-023, the read-only admin settings page). The renumbered records stay where they were
filed. In commits before the renumbering a bare DR-021, DR-022 or DR-023 may mean either record;
read it by its topic.

**Numbering note (DR-061).** Records prepared on side branches carried provisional numbers from
DR-047 ("number to confirm at merge") while `main` filed its own DR-047 to DR-053. At the merge
they became DR-054 (invite gate), DR-055 (Neon and R2, provider left to the deployer), DR-056 (GPU
split), DR-057 (photo ingest), DR-058 (visual pass), DR-059 (verification route) and DR-060
(unsupported links stay as needs_evidence). In branch commits before the merge (prep-all,
prep-deploy, prep-gpu, prep-photos, prep-visual, prep-content) a DR-047 to DR-050 means one of
these; read it by its topic.

**Numbering note (DR-127).** DR-125 was filed twice on parallel branches. The look-sheet record
keeps DR-125, because `substance-looks.json`, the label corrections, the Kalamkari verification
record and the methods notes cite it. The integration of DR-122 to DR-124 (commit 2297001, filed as
DR-125) became **DR-128** and stays where it was filed.

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

## DR-004: Six hand-block-printing traditions of one craft type (Adopted; study subset adopted in DR-017)

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
TSR and Nanite documentation, and an NVIDIA TAA survey (Yang, Liu & Salvi 2020). Each
adopted principle and its source:
- **Bake static lighting; precompute what does not change.** Epic Games, "GPU Lightmass
  Global Illumination in Unreal Engine" (UE 5.8 docs,
  https://dev.epicgames.com/documentation/en-us/unreal-engine/gpu-lightmass-global-illumination-in-unreal-engine),
  § "GPU Lightmass Global Illumination": "GPU Lightmass (GPULM) is a light-baking solution
  that precomputes complex light interactions from lights which have their mobility set to
  Stationary or Static, and stores that data in generated lightmap textures that are applied
  to scene geometry."
- **Stream by zone.** Courrèges, A. (2015), "GTA V - Graphics Study",
  https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/, § "GTA V - Graphics
  Study": "Nothing kills immersion more than a loading screen: in GTA V you can play for
  hours, drive hundreds of kilometers into a huge open-world without a single interruption."
  and "Considering the heavy streaming of assets going on". Epic Games, "Nanite Virtualized
  Geometry in Unreal Engine" (UE 5.8 docs,
  https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine),
  § "How does Nanite work?": "Data is streamed in on demand so that only visible detail
  needs to reside in memory."
- **Fade rather than pop.** Courrèges 2015, § "G-Buffer Generation": "It’s not about
  performance, it’s about LOD transition: this dithering pattern makes opaque meshes look a
  bit transparent when they transition between LODs." Nanite docs, § "Benefits of Nanite":
  "Loss of quality is rare or non-existent, especially with LOD transitions".
- **Temporal anti-aliasing for detail in motion.** Yang, L., Liu, S. & Salvi, M. (2020),
  "A Survey of Temporal Antialiasing Techniques", *Computer Graphics Forum* 39(2), 607–621,
  doi:10.1111/cgf.14018 (author's accepted version, http://behindthepixels.io/assets/files/TemporalAA.pdf,
  linked from https://research.nvidia.com/labs/rtr/publication/yang2020survey/), PDF p. 1:
  "Temporal Antialiasing (TAA), formally defined as temporally-amortized supersampling, is
  the most widely used antialiasing technique in today's real-time renderers and game
  engines." PDF p. 2: "Temporally accumulated samples from the previous frame's output
  (history) are reprojected (resampled) using application-generated motion vectors to
  account for camera and object motion". Epic Games, "Temporal Super Resolution in Unreal
  Engine" (UE 5.8 docs,
  https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-in-unreal-engine),
  § "Temporal Super Resolution": "Reduced flickering on geometry with high complexity, such
  as those rendered with Nanite."
- **Caveats the sources raise.** TAA is not artefact-free. Yang et al. 2020, PDF p. 2: "It
  is sometimes criticized for producing soft images, and can introduce artifacts such as
  ghosting and shimmering." So a TRAA build must still pass C1/C1b and C5. GTA V itself is
  not a TAA example. Courrèges 2015, § "Anti-Aliasing and Lens Distortion": "If the
  anti-aliased method used is FXAA, it is now performed to smooth-out the jagged edges of
  the meshes." The TAA principle rests on Yang et al. and the TSR docs, not on the GTA V
  study.

Verified in the three.js 0.186.1 source (`node_modules/three`):
- `TAARenderPass` accumulates only at rest and does not reproject.
  `examples/jsm/postprocessing/TAARenderPass.js` L11–12: "When there is no motion in the
  scene, the TAA render pass accumulates jittered camera samples across frames to create a
  high quality anti-aliased result." L14: "Note: This effect uses no reprojection so it is
  no TRAA implementation."
- `TRAANode` reprojects. `examples/jsm/tsl/display/TRAANode.js` L12: "A special node that
  applies TRAA (Temporal Reprojection Anti-Aliasing)." L18: "Note: MSAA must be disabled
  when TRAA is in use."
- `TRAANode` requires `WebGPURenderer`. This is an inference from two lines; no single
  line says it. `TRAANode.js` L1 imports its base classes `from 'three/webgpu';`. The
  node post-processing chain it plugs into, `src/renderers/common/RenderPipeline.js`, says
  at L20: "Note: This module can only be used with `WebGPURenderer`."
- `WebGPURenderer` falls back to WebGL2. `src/renderers/webgpu/WebGPURenderer.js` L23–24:
  "By default, the renderer tries to use a WebGPU backend if the browser supports WebGPU.
  If not, `WebGPURenderer` falls backs to a WebGL 2 backend."

Decision rule: use WebGPURenderer with TRAA if it passes C1–C12 on both backends;
otherwise use WebGLRenderer with SMAA in motion and accumulation at rest.

Source archive and verification: every quotation above was checked verbatim on its stated
PDF page, section or source line, using `docs/research/tools/verify_quotes.py` for the PDF
and a section-scoped check with the same normalisation for web pages and code.

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
  "Demonstrates that extraneous load can undermine the benefits of immersion" (§3, P32).
  Petersen et al. 2022, p. 9 (PDF p. 9): "There was no significant effect of immersion on
  extraneous cognitive load environment." Same page: "There were also no significant effects
  on extraneous cognitive load interaction although the main effect of interactivity was
  close (p = .059)."
- Media-comparison confounds (CAMIL; Petersen et al.) and modality differences in the
  memory-palace studies qualify "differ primarily in spatial organisation" (§7, P91). The
  platform therefore holds content, exposure, citations, typography and tokens equal (DR-015, DR-001).
- Reference-list errors were corrected, e.g. the Hung & Lee author names.

## DR-017: Open study parameters decided from the literature and our data (Adopted; researchers may override before preregistration)

- **Context:** The concept note leaves several parameters open, among them traditions, primary
  metric, design, sample, duration, guidance, instruments and content sign-off. The lead asked
  the team to take the best decisions after researching them first-hand.
- **Decision:** Recorded in full, with verbatim cited evidence, in
  `docs/research/study-decisions.md` (D1–D9):
  - **Traditions:** Ajrakh, Sanganeri and Machilipatnam Kalamkari (Bagh in reserve).
  - **Primary outcome:** expert-map coverage (`cmap.recall.dl`), analysed by ANCOVA on the
    pre-test.
  - **Design:** between-group, allocated after the pre-test, stratified by pre-test band.
  - **Sample:** 51 analysable per group (recruit 56).
  - **Learning phase:** 30 minutes, fixed, after a content-free familiarisation, over a study
    scope of ≤ 4,500 words.
  - **Guidance:** hybrid, the same in both pathways, not manipulated.
  - **Instruments:** a Leppink-family cognitive-load scale with interface items, the SUS,
    physical presence (3D only) and the SSQ.
  - **Order:** load, sickness and presence ratings straight after learning; the SUS last.
  - **Content sign-off:** two independent experts per tradition plus adjudication; no
    self-verification.
- **Rationale** (each source is quoted with its page in `study-decisions.md`, at the section
  named in brackets):
  - Carry-over is asymmetric and not removable by counterbalancing (Krokos et al. 2019;
    Brooks 2012) [D3].
  - Convergence is reliable, normally distributed and not inflated by map size (Ruiz-Primo
    2000; Ruiz-Primo et al. 1998; Yin et al. 2004) [D2].
  - The benchmark effect is d = 0.45 (Zhou et al. 2022) [D4].
  - Reading-time arithmetic (Brysbaert 2019) constrains duration and scope [D5].
  - Unassisted discovery does not help novices (Alfieri et al. 2011) [D6].
- **Departures from the concept note (flagged for the researchers):**
  - **Sample size:** ~20 per group becomes 51.
  - **Primary outcome:** "number of valid relations" is demoted to a secondary measure.
  - **Order:** the questionnaire splits into an immediate part and the SUS at the end.
- **Paper:** Report D1–D9 as the preregistered protocol, the derived power table, and any
  researcher overrides.

## DR-018: Figures in both conditions; graph-derived diagrams now, rights-cleared photographs later (Adopted)

- **Context:** The user asked for images alongside the text in both conditions, with equivalence
  kept. A strict sourcing pass found very few usable photographs (`content/review/media-proposals.md`).
  - **Licence and depiction:** only openly licensed images were accepted, with the licence checked
    first-hand on the source record, and only where the source's own description names the
    tradition and the subject. Two independent skeptics checked every image (rights, depiction).
  - **Result:** 3 usable images, one per study tradition. Two show textiles; the Sanganeri one is a
    view of the region from orbit. 56 were rejected and 7 held in reserve.
  - **The cause is supply:** few open-licence craft photographs name their tradition. Rejected
    images were not wrong; their records could not prove what they show. The lead checked the
    licences of two of the proposed images against the Commons API.
- **Options:**
  - accept the 3 uneven photos;
  - text only;
  - diagrams derived from the verified knowledge graph now, with photographs later from
    rights-cleared sources (own photography, or permission from museums and craft organisations).
- **Decision (user):** diagrams now, photos later.
  - Explanatory figures (process sequence; materials and tools per stage; dye and mordant
    mechanisms) are generated from the verified concepts and relationships.
  - Every study tradition gets the same figure types, rendered identically in 2D and in the 3D
    information panel by one shared component.
  - A figure states nothing the claims and relationships do not state.
  - Photographs enter through the same pipeline once rights are cleared, under the same parity
    rules.
- **Rationale:**
  - Equal coverage across traditions by construction, so no tradition is made more salient.
  - No licence risk.
  - Figures that explain the content serve learning, unlike decorative pictures (see the
    learning-science findings in DESIGN.md).
- **Methodological caution (for the paper):** structure diagrams show part of the knowledge
  structure that the 3D condition encodes spatially. Showing them identically in both
  conditions keeps the content equal, but gives the 2D condition some structural visualisation
  too, which may narrow the measured difference. Report which figures were shown. A protocol
  option to switch structure diagrams off in both conditions together is kept, so researchers can
  choose.

## DR-019: Visual system "Apparatus" adopted; study-mode presentation rules (Adopted; researchers approve before any participant data)

- **Context:** The user asked for a UI that is "research grade but still impressive not as
  bland". The user also required equivalence of knowledge, ease of access and a neat UI, "so that
  the data cannot be skewed (meaning that 3D vs 2D result shouldn't be affected because of poor
  interface choice)".
- **Process:**
  - A screenshot audit of every area.
  - Five research topics, with 103 findings verified verbatim: craft visual culture, heritage
    interfaces, research-grade typography and data design, accessibility and colour, and learning
    science.
  - Three competing directions, scored by four independent judges: a principal investigator, a
    brand and editorial designer, an accessibility and performance engineer, and a methodologist
    hunting interface confounds.
  - A synthesis and a critic pass. The lead re-checked all 81 quotes in the research tables against
    the archived copies.
- **Decision:** `DESIGN.md` ("Apparatus", an editorial critical-edition system).
  - **One knowledge component set** serves both conditions: the 2D column and the 3D panel are the
    same components with the same typography, measure and surface.
  - **Numbered claims**, each with its source line.
  - **Graphic language** from the craft's shared structure (block module, registration,
    outline-then-fill), never one tradition's motifs or colours.
  - **Expression by zone:** strongest on public and console pages, minimal in study.
  - **Parity checks** are measurable and shown in an Equivalence Monitor.
- **Lead decisions on its open items:**
  - **Theme:** study mode is fixed to the light theme in both conditions. A dark theme would darken
    all of 2D but only the panel in 3D. High contrast is offered identically as an accessibility
    accommodation and recorded on the study session.
  - **Search:** off in study builds of both conditions; it has no 3D counterpart.
  - **Tradition order:** one canonical alphabetical order, fixed and identical in both conditions,
    and not counterbalanced (in 3D the order is spatial). Order effects are reported as a
    limitation.
  - **Public field pattern:** a straight grid, not a half-drop. The half-drop of offset rows is
    tied to Sanganeri.
  - **Figures** follow DR-018: graph-derived diagrams now, photographs later, the same frame for
    both.
- **Paper:** report the visual system as part of the materials, together with the parity check
  results, and name the docked-panel width (pilot) and the fixed order as limitations.
- **Note (implementation of the High contrast accommodation):**
  - High contrast is offered **once**, on the consent page, before any measured step, through
    the shared Display Settings dialog in its study form (High contrast only; the theme stays
    light).
  - The device check shows the choice read-only and records it on the session
    (`study_sessions.device.contrastAccommodation`). Nothing later in the study can change it, so
    one stored value covers the pre-test, the learning task and the post-test.
  - **Limitation:** the choice is stored per browser (localStorage). A session resumed in another
    browser shows that browser's setting; the recorded value is the one taken at the device check.


## DR-020: Rights-checked photographs: one museum textile photograph per study tradition (Adopted; V&A use confirmed)

- **Context:** DR-018 deferred photographs until rights were cleared. The user then asked the
  build team to "Research and choose high quality photos along with the licences and figure
  everything else by yourself".
  - **Search:** a second sourcing pass covered Wikimedia Commons, Flickr, Openverse, Europeana,
    Finna, the Met, Rijksmuseum, V&A, Cleveland, the Art Institute of Chicago, Cooper Hewitt, the
    British Museum, the Science Museum Group and Wellcome.
  - **Checking:** one researcher and one independent verifier worked on each study tradition.
    They downloaded every candidate, recorded its pixel size and SHA-256, and looked at it.
  - **Result:** 93 entries in `content/review/media-proposals.json` and `.md`.
- **Licence tiers:**
  - **Tier 1 (preferred):** public domain, CC0, CC BY, CC BY-SA.
  - **Tier 2 (allowed):** CC BY-NC, CC BY-NC-SA, and museum terms that allow free
    non-commercial display on academic websites.
  - **Rejected:** all rights reserved, unclear licences, "fair use", licence laundering,
    watermarks, stock sites and AI images.
  - **Why Tier 2 is acceptable:** the platform and study are non-commercial academic research.
    Without Tier 2 there is no usable Sanganeri image: its documented textiles are at the V&A,
    and its craft photographs are CC BY-NC.
- **Identification rule:** a photo counts for a tradition only if its own record names the
  tradition or its place. Recognising a style by eye does not count. Hedges ("probably") stay in
  the caption. A caption restates an existing claim plus the record's description, and adds no
  craft fact.
- **Balance rule:**
  - Same kinds for every tradition, one photo per kind, all photos of a kind attached to
    concepts in the same section.
  - A kind missing for any tradition is dropped for all three.
  - A kind whose images are not comparable in medium and salience is held back for all three.
- **Decision (lead, after viewing every selected image):** one textile photograph per tradition,
  each attached to a context concept.
  - **Anchor claims (corrected by DR-039; final review knowledge-08).** This record first said
    that the anchor claim of each photograph names that very object. That holds for two of the
    three:
    - Ajrakh: `sindh-indus-origins` claim 5 cites the object: "held by the V&A (e.g. 5473A/(IS),
      ca. 1855-79)";
    - Machilipatnam Kalamkari: `persian-export-trade` claim 1 describes the object without its
      number: "An 1879 Machilipatnam dress fabric ... its Persian inscription names the trader";
    - Sanganeri: `eighteenth-century-records` claim 2 is about OTHER dated cloths ("dupattas
      printed at Sanganer carry dated octroi stamps such as 1853 and 1906"). The figure, an undated
      wrapped garment with an octroi stamp, illustrates that subject; it is not the object the
      claim describes. It was chosen over V&A IS.517-1883, the chintz that
      `export-and-museum-record` claim 2 describes, for comparable salience: like the other two it
      is a whole-object studio photograph, while IS.517-1883 is "a dull close detail"
      (`content/review/media-proposals.json`, notes of the 4497(IS) entry). Decision 1 of
      `content/review/media-proposals.md` repeats the first wording; that file belongs to the
      curation effort, so the correction is routed to the curators.
  - **The three photographs:** each is a whole-object V&A studio photograph at about 2,000–2,500
    px:
    - Ajrakh: V&A 5473A/(IS), "Pieces of an ajrakh textile, block printed cotton, Sind,
      ca. 1855-1879";
    - Machilipatnam Kalamkari: V&A IS.1765-1883, "Textile, animal design, kalamkari (pen work)
      and block printing on cotton, Machilipatnam, dated AH 1297/1879 AD";
    - Sanganeri: V&A 4497(IS), "Textile, wrapped garment, block printed cotton, probably
      Sanganer, ca. 1855-1879".
  - **Record check:** the lead re-checked all three records in the V&A collections API.
  - **Process and tool kinds dropped:** no Machilipatnam Kalamkari image of either has a record
    naming Machilipatnam, Masulipatam or Pedana.
  - **Place kind held in reserve:** the three candidates differ in medium, light and subject,
    and would make one tradition's place figure more salient than another's:
    - Sanganeri: a colour street scene at a town gate, with identifiable passers-by;
    - Ajrakh: a dim workshop tank, 768 px only;
    - Machilipatnam Kalamkari: a monochrome 18th-century etching.
- **V&A terms** (https://www.vam.ac.uk/info/va-websites-terms-conditions, section 3, read
  first-hand):
  - **Covered use:** "Academic e-publications, online journals, non-commercial websites and
    blogs: use of Content is permitted up to 5 years from first day of publication."
  - **Conditions:** "digitally at a maximum 768 pixels along the longest side"; "The amount of
    V&A Content used must not exceed 25% of the total content used in your publication or
    project"; credit "© Victoria and Albert Museum, London".
  - **Excluded uses:** "Images for use in exhibitions, displays and catalogues" and "home page
    uses" fall under commercial conditions.
- **Consequences:**
  - **One display cap:** every study photo is served at 768 px at most on the long edge, with no
    larger srcset step. One cap for all photos means no tradition's image looks sharper. The
    DESIGN.md 9.9 lightbox already uses this cap.
  - **Credit line:** shown under every photo, identically in both conditions. An image credits
    page lists the creator, record, licence, any crop and the 5-year V&A term.
  - **Home page:** V&A images are not used on the public home page or in promotional material.
  - **V&A confirmation (received):** because the 3D condition is a virtual museum, the team
    asked the V&A to confirm that study figures are not an "exhibition display" (request:
    `docs/research/va-image-licence-request.md`). The V&A Images team replied that the use "may
    be treated as non-commercial academic and educational use under Section 3". It said the
    virtual museum is "an academic digital learning interface rather than a commercial
    exhibition, display or catalogue", and that "no separate commercial exhibition licence would
    be required". The reply was forwarded by the project lead and is archived verbatim in
    `docs/research/va-image-licence-reply.md`.
  - **Conditions of the reply, enforced in the platform:**
    - at most 768 px on the longest side;
    - the credit "© Victoria and Albert Museum, London" on every image;
    - non-commercial research, education and demonstration only, which covers both study
      versions and the public research demonstration;
    - at most five years from the date of first publication (recorded on each asset when it is
      first published);
    - no advertising, promotion, commercial products or revenue;
    - the paper-tag crop must not materially alter the object.
  - **When to contact the V&A again:** if the scope changes, especially commercial distribution,
    promotion or a separately operated public exhibition.
  - **Gating:** a photo goes live only when its anchor claim is verified.
  - **Crop:** the Machilipatnam textile is cropped about 13% at the left, to remove the museum's
    paper tag, and credited "cropped".
- **Paper:** report that one museum textile photograph per tradition was shown, identically in
  both conditions. Also report:
  - all three are context figures, so they cannot explain differences on process or materials
    items;
  - process, tool and place photographs were not shown for any tradition, and why;
  - as a limitation, that the Sanganeri photograph illustrates its claim's subject (octroi-stamped
    Sanganer cloth) rather than the object the claim describes, unlike the Ajrakh and
    Machilipatnam Kalamkari photographs (see Anchor claims above);
  - that the photographs a study showed are frozen with the release it pins (DR-037), so the
    figure set can be reconstructed from the snapshot.


## DR-034: The same concept layers and pager in both conditions (Adopted; filed as the first DR-021, renumbered by DR-039)

- **Context:** The 2D concept page showed one layer (the concept's own claims). The 3D panel
  showed LayerTabs with the exhibit's attached concepts (artisan, science, explanation, compare
  counterparts, process). DESIGN.md 9.6 makes LayerTabs the only layer navigation in BOTH
  conditions, and 12.1 rule 3 does not allow this difference: it changed P11 (switch layer), P13
  (Tab stops from the h1) and the offset of the claim block (P8, P18). Drafted by WP2 in
  `docs/research/design-process/modules/visual-system.md` (WP2 section).
- **Decision:** the 2D sheet builds the panel's layer set from the read model (`conceptLayers` in
  `src/features/learning-2d/navigation.ts`), with the mapping the compiled manifest uses:
  - artisan: the concepts that PRACTITIONER_EXPLAINS it;
  - science: the concepts it is SCIENTIFICALLY_EXPLAINED_BY;
  - an EXPLAINS explainer: under artisan, process or science by its type (`exposureLayerOf`);
  - compare: cross-tradition SIMILAR_TO / CONTRASTS_WITH counterparts, and the compared concepts
    of a comparison;
  - process: the concept, when it is a station of an ordered sequence.
  - Entries keep the manifest's order, except the Compare layer, which lists its concepts in the
    canonical tradition order (DESIGN.md 12.3 rule 12, DR-019), stable within a tradition. Both
    conditions now apply this sort (2D `byCanonicalTradition`, 3D `buildPanelModel`).
  - Sequence stations get the eyebrow "Step n of N" and the sequence pager in both conditions. No
    other concept has a pager in either condition.
- **One copy of every layer part.** The sequence list, the head of a concept shown under another
  concept's layer, the comparison blocks and the concept chooser live once in
  `src/components/knowledge` (`layer-parts.tsx`, `concept-chooser.tsx`), with their wording in
  `src/features/learning/strings.ts`. Each condition only maps its data onto them and supplies
  how the head's action acts: "Go to this concept" navigates in 2D and walks in 3D (12.1 rule 3).
- **Evidence:** `tests/unit/learning-2d/layers.test.ts` compiles the curated content into a
  manifest and checks, for every placed concept, the same layer ids, concepts and order (Compare
  included), the same sequence and position for every station, and a pager in 2D exactly when the
  panel has one. `tests/unit/immersive/layer-parts-parity.test.tsx` renders both conditions'
  layer parts from equivalent data and requires identical DOM.
- **Telemetry:** switching layers logs what the panel's `setTab` logs
  (`information_layer_closed` with openMs, `information_layer_opened`, `knowledge_layer_selected`
  for artisan, process and science, `concept_encountered` when another concept is shown). No event
  name or payload is new.
  - **Note for the analysis:** the "About these links" disclosures of Related Concepts are one
    per relation-verb group (DESIGN.md 9.12). They log `information_layer_opened` with
    `layerId: "rels:<TYPE>:<direction>"` per group, instead of the former
    `rel:<relationshipId>` per link, identically in both conditions.
- **Paper:** report that both conditions present the same layers per concept, by construction and
  by test.


## DR-035: Dashboard Figure 3 "Gain by Tradition" is a descriptive breakdown (Proposed; the project lead or the analysis plan confirms or replaces the definition; filed as the first DR-022, renumbered by DR-039)

- **Context:** DESIGN.md 11.9 asks for Figure 3, "Gain by Tradition", as small multiples for the
  three study traditions. The registered outcomes do not define a per-tradition gain.
- **Decision (as built by WP5):** the knowledge test split by the tradition of each keyed item's
  concept (`assessment_items.concept_id` to `concepts.tradition_id`). Per session and tradition:
  the proportion of that tradition's keyed post-test items answered correctly minus the
  proportion of its keyed pre-test items answered correctly (stored `item.key_match`, latest
  attempt). A session counts for a tradition only when it has scored items of that tradition in
  both tests. Items without a concept, or whose concept has no tradition, are not counted.
- **Status:** a descriptive breakdown of the knowledge test, not a registered outcome. The figure
  says so in its caption.
- **Consequence:** Figure 3 stays empty until the study's keyed pre-test and post-test items carry
  a `concept_id` (study setup and curation). Today no item in the local database has a
  `concept_id` or an answer key.


## DR-036: The admin settings page is read-only (Adopted; a departure from DESIGN.md 11.11; filed as the first DR-023, renumbered by DR-039)

- **Context:** DESIGN.md 11.11 describes settings as sectioned forms with a sticky "Save changes"
  bar and a "Danger zone" alert. The platform's settings (`src/server/admin/settings.ts`) are
  read-only values: nothing on the page can be changed from the browser.
- **Decision:** the page shows the values in sectioned definition lists with `text-eyebrow` running
  heads and a "Note: read-only" alert. It has no form, no save bar and no Danger zone, because a
  save bar or a destructive control that does nothing would mislead.
- **Destructive admin actions** (locking an account, removing a role) keep the typed
  confirmation of 11.11: the dialog's button stays inactive until the account's email address is
  typed, and the server action refuses a submission whose `confirm` field does not match
  (`src/server/admin/actions.ts`).
- **When this changes:** if settings become editable, the page adopts the 11.11 save bar and
  Danger zone.

## DR-021: Desktop Layout Parity: One Shared Rail and a Right-Docked Sheet in Both Conditions (Proposed; methodologist sign-off required before any participant data)

- **Context:** The lead called the 2D pages "text all in center" and asked for a UI that is "research grade but still impressive not as bland", without hurting "the core theme of the experiment for 2d vs 3d".
  - At 1440 px the 2D sheet is centred, with about 430 px of empty ground on each side (tells C7; audit K).
  - The site-level 2D navigation is hidden behind "Contents" (usability correction C7).
  - DESIGN.md §6, §9.12, §14 and WP2 step 2 forbid a 2D side rail, so that no pane exists in one condition only.
- **Evidence:**
  - "Hidden navigation provides a worse user experience than visible or partially visible navigation does, in both mobile phones and desktop user interfaces." (NN/g, 26 June 2016, intro)
  - "On desktop, people used the hidden menus in only 27% of the cases" (same, h2 "Navigation Usage: Hidden Navigation Used Less and Later in the Task").
  - "Ensure that it is left-aligned, keyword front-loaded, and visible." (NN/g vertical navigation, Summary)
  - The 2D control must be a "well-designed slideshow" (Parong and Mayer 2018, abstract).
  - None of the nine collection sites studied centres one narrow column (museums §2).
- **Options:**
  - keep the centred sheet and add craft inside it only;
  - left-align the sheet with an inert margin;
  - a shared rail and a right-docked sheet in both conditions (three competing directions all proposed this);
  - in addition, a 2D plate grid (rejected).
- **Decision:**
  1. **One shared `PlaceRail` component** in both conditions. "In This Section" (2D) and "In This Room" (3D) are the same component, at the same position, width and row size. The rail carries titles, types, steps and destinations only: the in-world text set (immersive-3d I-P).
  2. **The KnowledgeSheet docks right** at the same x, width and top in both conditions, and scrolls internally in both.
  3. **Field:** the 2D field holds a typographic index of traditions and numbered sections. It is a list, never a spatial map. The 3D field holds the scene and the Plan.
  4. **Close** fills the sheet's action slot in both conditions. In 2D it returns to the section view. "Up to <parent>" is removed from the 2D StudyBar.
  5. **Below 1280 px,** the rail becomes an identical drawer in both conditions.
  6. **Rejected: a 2D plate grid.** It would list the section's concepts a second time in 2D only, as an extra structural signal.
  7. **Checks:** new parity checks P28 to P32 and a 1280 x 720 viewport. This amends DESIGN.md §6, §9.11, §9.12, §9.14, §11.5, §11.6, §12.1 rule 3, §12.4, §14 and WP2 step 2 together, which answers the parity objection in §14: the rail is not a pane one condition lacks.
- **Rationale:**
  - Navigation is the manipulated variable (DR-015), so each condition gets best-practice navigation for its medium.
  - Everything from the moment a concept opens is identical by construction, not by tuning.
- **Risks:**
  - The 2D arm of the manipulation becomes stronger than the earlier "Contents" design.
  - An open 3D rail would allow list-driven navigation in 3D. **The lead decided** that the 3D "In This Room" rail stays **collapsed by default**. Navigation source (rail, scene, plan, keyboard; 2D: rail, index, pager, link) is logged in both conditions, so list use can be modelled.
  - The 2D index shows section names persistently, while the 3D Plan shows numbers.
  - The reading column on the right is untested for reading speed.
- **Further lead decisions:**
  - The 3D Plan default follows the protocol setting `studies.config.minimap` (minimised unless the protocol says otherwise).
  - The KnowledgeSheet keeps its LayerTabs (Overview, Process) in both conditions, so exposure per layer stays measurable.
  - "Mouse look" stays a labelled button in the 3D StudyBar.
  - There is no surround-luminance matching between conditions, because the rule has no source.
- **Paper:** Describe both navigation designs as materials. Report rail use per condition. Name the docked-column position, the occlusion of the scene at 1280 px and the list-versus-plan difference as limitations.

## DR-022: Visual Direction "Atlas" Replaces "Apparatus" (Proposed; researchers approve before any participant data)

- **Context:** After DR-019 the lead judged the UI "boring and vibe-coded" and named "claude's watermark style" as the giveaway.
  - The audit found the ground `#F5F1E8` literally in a public tell-scanner list.
  - It also found Source Serif 4 with an off-red accent (Anthropic's frontend-design skill, trait 1: "a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent").
  - Template chrome: 57 eyebrow or uppercase uses, 56 middle-dot joins and 106 monospace uses (tells C2, as corrected in its verification).
  - Native selects with the OS chevron at 63 render sites.
  - The Button focus outline removed by `outline-none` (audit A, I).
- **Process:** Six research topics, verified with 4 failures out of 489 claims, which were then excluded. Three competing directions (Archive, Atlas, Studio Proof). A gate-ordered adversarial judgement: equivalence, then ease of use, then accessibility, then craft.
- **Decision:** Atlas, with grafts. In detail:
  - **Surfaces:** white paper `#FFFFFF` for knowledge; a neutral field `#E9ECEC` for navigation.
  - **Colour:** pure black ink; indigo `#24406E` as the only interactive colour.
  - **Type:** Atkinson Hyperlegible Next (OFL) for all study, console and text use, set at 20/30 so the 34rem measure keeps about 62 characters per line. Anek Latin (OFL, Ek Type) for public display only.
  - **Evidence:** verbatim quotes set roman, with a visible label, on a sunk mat.
  - **Removed:** cream, serif, madder, ochre, the band, ticks, eyebrows, uppercase labels, middle dots, decorative monospace, left bars, the tradition marker and shadows.
  - **Controls:** native controls restyled, with forced-colors fallbacks and a black-and-white two-tone focus ring.
  - **Record foot:** off in study builds of both conditions.
- **Measured:**
  - every text pair is at least 4.5:1 in four themes (minimum 5.11);
  - control boundaries are at least 3.44:1;
  - the ring keeps at least 4.58:1 against any colour;
  - study preloads one font file of 33,996 bytes, against 170,792 today;
  - the indigo is 5.29 ΔE from its nearest Tailwind colour.
- **Rejected:**
  - Atlas's own indigo `#1C3F94` (2.01 from Tailwind blue-900) and its danger (1.75 from red-700);
  - Studio's mid-grey field, which forbids most pairs on it;
  - italic and serif evidence faces;
  - apply-on-change selects (WCAG SC 3.2.2);
  - Figure 1 entrance motion.
- **Paper:** Report the visual system, the typeface and reading-size change (cpl held constant, after Dyson 2004 §8), and the parity results as materials.

## DR-023: 3D Gallery Finish, Identical in Every Wing (Proposed; adopted only after a low-tier frame-time measurement)

- **Context:** The 3D museum renders as a flat beige box:
  - walls at about (247, 239, 226), above PBR Neutral's 1:1 limit of sRGB 231;
  - plaque to wall 1.05:1;
  - wall to floor 1.82 to 2.03:1, a Smithsonian contrast of 45% to 53% against a required 70%;
  - dark door linings at 8.8 to 9.4:1, the most salient objects in view (gallery3d §1a, corrections S2, S5 to S7).
- **Decision:** One parameter set, with no zone, tradition or room key. The symmetric lobby is attempted; if the compiler cannot do it cleanly, a directory wall at the spawn point is used instead (lead decision).
  - **Walls:** a neutral re-grade to rendered sRGB 200 to 210, no warm cast.
  - **Floor:** matte, at most 0.3 x the wall luminance.
  - **Plaques, cards and signs:** unlit and `toneMapped: false`, white `#FFFFFF` with black ink. This follows the X3 correction: a tone-mapped `#F5F1E8` would render at about (236, 232, 224).
  - **Wall wash:** a shared baked profile, with architecture moved to an unlit lightmapped material (X2 correction).
  - **Floor and ceiling:** per-room bakes normalised to one mean.
  - **Junctions:** a 150 mm ceiling cove; 25 mm shadow-gap skirting; plaster door reveals with a 20 mm `#3F454C` edge (5.79 to 6.40:1); a plinth toe recess.
  - **Light:** neutral.
  - **No additions:** no new post passes and no props.
  - **Lobby:** a directory wall at spawn listing the wings in canonical order, with symmetric portals (compiler change under DR-010).
- **Rationale:**
  - Uniform wall washing "underlines the coherence of an exhibition" (ERCO, Gallery).
  - "Limit changes in light level within a gallery and between galleries." (Smithsonian Guidelines, PDF p. 54)
  - Global illumination raised plausibility but not presence (Yu et al. 2012), so the finish serves credibility and must not cost frame time.
- **Checks:**
  - unit tests for the single config and the shared profile instance;
  - room means within 1%;
  - C2b, the wing entrance rooms: means within ±5%;
  - plaque contrast at least 4.5:1 on the rendered frame;
  - C1 to C12 re-run;
  - C3/C9 at most 33 ms p95.
  - **GPU:** measured on the NVIDIA GTX 1650 at the lead's instruction ("use Nvidia insted of Intel"). An integrated-graphics (low-tier) check is recommended before data collection and is listed as open.
- **Risk:** A finished 3D scene next to a plain 2D page could bias perceived-usability and motivation ratings (Tractinsky et al. 2000). The DR-022 2D pass ships in the same release, and the finish level of both conditions is reported.
- **Paper:** Report the finish as part of the 3D materials, with the C2b results.

> The project lead reviewed the research synthesis (`design-research/DESIGN-v2-proposal.md`) and its ten open questions, and approved the recommended answers, recorded in DR-021 to DR-023. Methodologist sign-off is still required before any participant data is collected.

## DR-022 Addendum A: Citations as Quiet Numbered Markers That Expand in Place (Lead Decision; Proposed with DR-022)

- **Context:** The lead asked whether the verbatim passage and the full reference must show under every claim, or whether numbered [1] links would do. The cognitive-load rule for the knowledge presentation ("make sure the knowledge presentation is not cognitive overload") also applies.
- **Decision (the recommendation the lead adopted):**
  - A quiet numbered marker [n] after each claim, with a 44 px hit area through padding.
  - Activating it expands IN PLACE under the claim (a disclosure, not a jump): the locator or page, the labelled verbatim passage ("Verbatim from the source"), and "Open the source". Activating it again closes it.
  - One deduplicated numbered reference list at the end of the KnowledgeSheet gives each source's full details once.
  - No hover-only previews, and no jump-to-bottom anchors as the primary mechanism.
  - Identical in both conditions (one shared component); `citation_opened` and `citation_closed` telemetry are unchanged.
- **Consequence:** This replaces the per-claim full source line of DESIGN.md 9.9.
- **Implementation (package 2D-C):** the shared `CitedClaim` renders the claim with its markers and the records they open. Both placements put `ReferenceList` in the KnowledgeSheet's `references` slot, after the field and before Related Concepts, built from the same claims. Choices made while building it:
  1. **Numbering scope:** the claims of the concept view on screen (one concept at a time under LayerTabs), numbered in order of first citation, so the list always matches the visible markers.
  2. **A lean record:** "Source n" with the short label and locator, the labelled verbatim passages and "Open the source". Title, publisher, kind, reliability and access date moved to the reference list, so they appear once.
  3. **No links in the reference list:** the record already carries the link. Links in the list would add Tab stops between the claims and Related Concepts in both conditions.
  4. **Hit area:** the marker's own 44 x 44 px box, with negative block margins so the 30 px reading line box is unchanged. The accessible name is "Source n: <short label>".
  5. **Lean metadata:** the Status row is removed, because the notice strip already states the verification status. The sheet keeps Tradition, Category, Step and Local terms.
- **Equivalence:** one shared component serves both conditions. Claim text, order and layers are unchanged, and so are the `citation_opened` / `citation_closed` events (sourceId, claimIndex, openMs). P1, P5, P11 and P13, and the new P33, measure it.

## DR-022 Addendum B: How the Visual System and the Control Set Were Applied (2D/UI Track)

- **Scope:** tokens, faces and type of DESIGN.md 4 and 5; the two-tone focus ring; the control set of DESIGN.md 9; the removal of every listed tell; the public, console, CMS, admin and study pages. Recorded in detail in `docs/research/design-process/modules/visual-system.md` ("Atlas: Visual System and Controls").
- **Choices made while applying it** (each identical in both conditions, or outside the measured concept view):
  1. **One focus rule for every theme.** The two tones are tokens (`--focus-outer`, `--focus-inner`), so high contrast needs no separate ring; controls that hide their native input draw the ring on the visible label.
  2. **Retired names kept as aliases only where code outside this track reads them:** `--surface` is the paper; `--font-inter` and `--font-source-serif` resolve to Atkinson so the 3D lettering atlas letters in the one face until it reads `--font-atkinson`.
  3. **Selects:** every raw `<select>` (and the CMS select skin) is the shared `NativeSelect`. The research study picker keeps its submit button, now labelled "Show study", with a readout of the full title, key and state; its options no longer repeat the key and state.
  4. **Participant-facing choice:** the study-entry group became a radio list of 56 px option rows. It is shown before allocation, so it is identical for both allocations.
  5. **Numbers** are text inputs with a numeric keyboard and a pattern; the range moved into the label; the server validates as before. **Dates** keep the native picker with a visible "Format: YYYY-MM-DD". **Files** use `FileInput`.
  6. **Lean sheet metadata:** the eyebrow ("Material, Step 3 of 9") is removed. Step became a metadata row; the concept type is no longer shown in the sheet, because the category and the step carry the same orientation with less text. Order: Tradition, Category, Step, Local terms (Status was later removed, DR-022 Addendum A); the reading-progress bar follows the metadata. Shared component, so both conditions change together.
  7. **Citation label:** "Author (year), locator", derived in the view layer with no middle dot.
  8. **Option rows and alerts:** no left bars anywhere; a chosen study option is `--wash` with its check icon; the stall cue is the alert form with the heading "Hint" in both conditions.
  9. **Public home:** the hero plate (a claim specimen beside the title) is removed, because the title-plus-buttons-plus-card hero is a stated tell; the traditions are an index of equal rows; the latest parity run is shown from the stored report only.
  10. **Study flow pages** sit left-aligned in a 1280 px frame instead of a 40rem column centred on the page.
  11. **The 2D navigation pages** (index, categories, comparisons, search, tradition pages) no longer show an eyebrow above their h1. These pages are outside the measured concept view, and the 3D museum has no page header to match.
- **Equivalence:** no knowledge string, claim order, layer, timer, hint policy or telemetry event changed. Every change to a shared component applies to both conditions by construction; the parity tests in `tests/unit` (layers, layer parts, knowledge components, strings, import graph) pass.

## DR-021 and DR-023 Addendum: Alignment With the Concept Note, Pathway B (Lead Decision)

- **Context:** The lead asked whether the build still follows the concept note. Its §7 Pathway B says: "Social/live functions and unnecessary controls should be removed; the map may be minimised; interface instructions should disappear after onboarding; and information should be progressively disclosed." It also says: "The intended comparison is therefore not a 'fancy 3D museum' versus a plain webpage".
- **Decisions:**
  - **Study builds hide the "Mouse look" StudyBar button.** Free look stays on the L key and in Controls help; right-button look and drag-look need no interface element. The public demo keeps the button. This revises the earlier answer to the open question on "Mouse look" so that it follows §7.
  - **The 3D gallery finish stays restrained** (DR-023): credible, never "fancy", and matched by the 2D polish of DR-022, released together.

## DR-021 Addendum: How the Layout Was Built (2D/UI Track, Package 2D-B)

- **Built as decided:** one `PlaceRail` for both conditions ("In This Section", "In This Room");
  the sheet docked right through one shared width rule; Close in the sheet's action slot in both
  (2D: a link to the section view; 3D: closes the panel); "Up to <parent>" removed; the 3D rail
  collapsed by default, the 2D rail open by default from 1280 px; a drawer below 1280 px in both;
  Mouse look hidden in study builds; the Plan default following `minimap`. Details and the
  equivalence check: `modules/visual-system.md`, "Atlas Layout".
- **One focus while reading:** the 2D index recedes while a concept is open (only the concept's own
  tradition keeps its sections).
- **Navigation source:** an optional `source` field on `page_entered`, `room_entered`,
  `exhibit_selected` and `content_item_selected` (2D: rail, index, pager, link, close; 3D: rail,
  plan, scene, keyboard, link, pager), so list use can be modelled per condition.
- **Open:** the 2D index numbers the ten template sections while the 3D Plan numbers seven rooms per
  wing, so P29's "section numbers equal room numbers" clause does not hold yet. Aligning them means
  regrouping the 2D template to the wing groups (or the reverse), a protocol change for the lead and
  the methodologist.

## DR-020 Addendum: How the Study Photographs Are Ingested, Gated and Switched (2D/UI Track, Package 2D-D)

- **Ingest:** `scripts/content/ingest-study-photos.ts` takes the three "proposed" images of
  `content/review/media-proposals.json` (read only) and their 768 px derivatives in
  `scripts/content/study-photos/` (the Machilipatnam Kalamkari one cropped at the left to remove the
  paper tag). It uploads each through the media library service, links it as the `illustration` of
  its concept after the claim that names the object (Ajrakh claim 5, Machilipatnam Kalamkari claim
  1, Sanganeri claim 2) and submits it for review. It never verifies: a second curator does, in the
  CMS (nobody verifies their own upload). Run it from the main checkout with
  `--uploader <staff email>`; `--dry-run` checks the plan without writing.
- **Metadata on every asset:** the proposal's title, caption and alt text; the credit
  "© Victoria and Albert Museum, London", with "(cropped)" on the cropped one; the licence "V&A
  non-commercial terms" linked to the terms page; the V&A record page as provenance; a display cap
  of 768 px; a 60-month term counted from first publication; no public-plate flag, so a V&A image
  can never appear on the home page or another public plate.
- **First publication (migration 0017):** `first_published_on` is stamped once, on the day an asset
  first becomes servable (verified, linked to a concept in a published release, licence valid).
  The stamp runs on a verifying review, a link, a metadata edit and a release publication. The same
  step sets `licence_expires_on` to the day before the fifth anniversary. The learner route refuses
  a termed asset that has no stamp, so no photograph is shown before its term has started.
- **Gate:** a photograph shows only when its anchor claim is verified. Claims carry no state of
  their own (curators verify a concept's claims together), so the gate is the anchor concept's
  state in the snapshot both conditions read: verified or published. All three anchor concepts are
  under review or need evidence today, so no photograph is shown to learners yet.
- **Switch:** the protocol setting `figures.photos` (default on) removes the photographs from both
  conditions together. The read model, the 2D pages and the content parity engine apply it. The 3D
  payload must pass the same value: one helper, `figureOptionsOf`, gives both conditions their
  figure options.
- **Assessment check (asked by the lead):** none of the three anchor concepts
  (`ajrakh.historical_context.sindh-indus-origins`,
  `machilipatnam-kalamkari.historical_context.persian-export-trade`,
  `sanganeri.historical_context.eighteenth-century-records`) is an assessment item or a node of a
  reference concept map. This was checked against the development database when the photographs
  were ingested. It holds 106 assessment items (58 of them real), and every real assessment is a
  questionnaire (SUS, UMUX-LITE, Cognitive Load, Physical Presence, Simulator Sickness). No
  knowledge test or reference map names a photo concept. The check must be repeated when the
  knowledge tests and reference maps are written. If a photo concept becomes an item, the paper
  reports it, or the photographs are switched off for that study.
- **Credit line:** "Photo: <credit>. Licence: <licence>", identical in both conditions (the middle
  dot that joined them is gone).
- **Paper:** report the three photo concepts by key, as above, with DR-020's note that all three
  are context figures.

## DR-020 Addendum B: No In-World Image Planes in Study Builds (3D Track, Package 3D-B)

- **Decision:** images (the graph-derived diagrams and the study photographs) appear only inside
  the KnowledgeSheet, through the shared `KnowledgeFigure`, identically in both conditions. The
  museum never draws an image on a wall: `IN_WORLD_IMAGES = false` in
  `src/features/immersive/scene-model.ts`. The compiler may still declare an image surface; the
  scene model reports it as not drawn whatever its licence or review state, and the renderer has no
  image-plane path.
- **Check:** `tests/unit/immersive/image-planes.test.ts` compiles the study manifest with a
  reviewed, licensed figure for one concept of each tradition and asserts that no image mesh,
  material, texture or vertex on an image surface exists in the built museum.
- **Why:** an image on a wall would be a second, condition-specific exposure of the same figure
  (gate 1, equivalence), and a decorative element near knowledge content.

## DR-023 Addendum: Lobby Directory Adopted; Wing Distances Measured (3D Track, Package 3D-B; Merge)

- **Lobby:** the symmetric lobby was attempted and rejected as not clean. With three wings the
  symmetric axis falls on the middle wing's door, which centres one tradition, and the change needs
  a republished manifest. The fallback of DR-023 was adopted: a directory wall on the spawn axis
  (`src/features/immersive/wayfinding.ts`, `entranceDirectory`) listing the wings in canonical
  order and then the shared commons, in equal-size rows, each with its doorway direction. Clicking
  a row, a door sign or a doorway frame walks the visitor through the doorway (a walk, never a
  teleport).
- **Finding (gate 1, open):** the wings are not equally far from the entrance. The compiler places
  the wings in slug order along the hall with the lobby at its west end; directory to wing doorway
  took 5.9 s (Ajrakh), 19.3 s (Machilipatnam Kalamkari) and 31.4 s (Sanganeri) at the click-to-walk
  pace. The 2D index lists the traditions in the same canonical order, so the order is matched
  across conditions; the distance exists only in 3D, where it is navigation time, which is already
  recorded apart from content exposure (DR-015).
- **Decision for the pilot (taken at the merge, with the 3D track's recommendation):** keep the
  layout and report time-to-wing per tradition as a covariate. It needs no new event:
  `room_entered` carries the room and its `traditionId`, so the time from the session start (or the
  directory) to the first entry into each wing is derived from the stored events.
- **Recommended before the main study (lead and methodologist decide):** equalise the distances
  with a compiler change under DR-010 (the lobby centred on the wing span with two doorways
  flanking the directory, a `LAYOUT_VERSION` bump, updated `tests/unit/spatial` and a republished
  study manifest), or counterbalance the wing order across participants. Either must be decided
  before participant data.

## DR-022 Addendum C: Contracts Wired at the Merge of the 2D and 3D Tracks

- **Input method covariate:** the scene reports the first move of each navigation interval and
  every switch of method after it (keys, drag, rmb, freelook, click; "list" from rail and Plan
  rows); the host logs each report as `input_method_used` with the method before it. A navigation
  interval restarts when a concept closes. Details: `modules/immersive-3d.md`, "Merge of the 2D and
  3D Tracks".
- **Visited marks** are one state, shown on the rail in both conditions and mirrored on the 3D
  plates with the same word, "Visited".
- **Figures:** the 3D payload uses `figureOptionsOf(ctx)`, the helper the 2D pages use, so
  `figures.photos` switches photographs off in both conditions together.
- **Practice:** the 3D practice room shows the practice instruction (`PRACTICE_TEXT.tryControls`)
  and cites the same platform practice source as the 2D practice, so both practices teach the
  citation marker.
- **Study photo derivatives:** the three 768 px V&A derivatives in `scripts/content/study-photos/`
  stay committed (the repository is private, the ingest reads them, and they are at the 768 px
  display cap of DR-020). The originals stay outside the repository.

## DR-021 Addendum B: Both Rails Collapsed by Default; Visits Marked on the Rail Only (Review Fix Round; Proposed with DR-021)

- **Finding (independent review, gate 1):** P33's "largest gap 2" held only because the parity
  test opened the 3D rail before opening an exhibit. In each condition's default flow it did not:
  a 3D visitor who clicks a plaque keeps "In This Room" collapsed (the lead's DR-021 default),
  while a 2D visitor saw the 14-row "In This Section" rail beside the sheet. Counted with P33's
  own method: 2D 28 against 3D 16 at 1440 x 900, 26 against 16 at 1280 x 720, a gap of 10 to 12
  against the limit of 6. The open concept is the part of the two conditions that must be equal.
- **Decision:** the 2D rail is **collapsed by default** too, at every width, as the 3D rail is
  (the lead's decision 2 is kept; the 2D side follows it). In both conditions the StudyBar button of
  the same name shows it, Hide collapses it, and the choice holds across moves. P28 now expects
  "closed" in both; P33 is measured in both default states (2D opened by a link, 3D with the rail
  collapsed as after a plaque click) and again with the rail shown in both, and each state must
  meet the limits.
- **Visited marks (revises DR-022 Addendum C):** a visit is marked on the rail row in both
  conditions (a quiet check and the visually hidden word), and never on the 3D plates
  (`PLATE_VISITED_MARK = false`). The plate word "Visited" was always in view and in full ink in
  3D only, a stronger cue for revisiting than the 2D rail's check, which is now collapsed by
  default. The user's rule was "mirrored in both conditions, or in neither"; outside the rail it
  is now neither.
- **Tradition page rail:** on a 2D tradition page the rail leads to the other traditions instead of
  listing the page's ten sections a third time (they are in the page column and the index).
- **Help copy:** the 2D onboarding and the Explore control list say where the rail is now
  ("In This Section, in the top bar"; the index "on the left").
- **Measured:** see `modules/visual-system.md`, "Review Fix Round".
- **Risk:** a 2D participant may use the rail less than before; rail use is logged per condition
  (navigation `source`), so it can be modelled, as for 3D.

## DR-023 Addendum B: Wing Distances Still Unequal; Recommended Route (Review Fix Round; Open, for the Lead and the Methodologist)

- **Status:** unchanged in this round. Walking time from the directory to the three wing doorways
  stays 5.9 / 19.3 / 31.4 s (Ajrakh, Machilipatnam Kalamkari, Sanganeri, click-to-walk pace), an
  open confound for tradition salience in 3D (gate 1), while every tradition is one link away in
  2D.
- **Why not fixed here:** with three wings side by side along one hall, no lobby position makes the
  three distances equal (a centred lobby makes the middle wing nearest). Equal distances need a
  different building scheme: a hub (the comparison hall at the centre with the wings opening off
  three sides of it at the same distance from the entrance), which changes the compiler under
  DR-010 (`LAYOUT_VERSION` bump), the stored study manifests, the rendering baselines and the
  wayfinding words. That is a protocol change, not a fix-round edit.
- **Recommended route (to decide before participant data):** the hub layout, so the access cost is
  equal by construction. If the layout must stay, counterbalance the wing order across participants
  (three rotations, the 2D index order rotated with it so the order still matches across
  conditions) and log the rotation as a covariate. Until then, time-to-wing per tradition is
  reported as a covariate (DR-023 Addendum).

## DR-024: One Section Map for Both Conditions (Adopted under the lead's delegation; methodologist sign-off with DR-021 before any participant data)

- **Context:** the 2D tradition page listed ten sections chosen by concept TYPE
  (`src/features/learning-2d/template.ts`), while the spatial compiler built seven wing rooms chosen
  by knowledge CATEGORY (`DEFAULT_ZONE_GROUPS`), plus the comparison hall. The review found that four
  study concepts sat in a different section in each condition (finding spatial-1, confirmed by
  compiling the study manifest): `machilipatnam-kalamkari.historical_context.srikalahasti-style`
  (2D Context, 3D the comparison hall, outside its own wing),
  `machilipatnam-kalamkari.explanation.producer-communities-and-karkhanas` (2D Science, 3D Context),
  and `sanganeri.historical_context.chhipa-community` and `.kharadi-block-makers` (2D Context, 3D
  Artisan decisions). P29 could not hold either: the 2D index numbered ten sections per tradition
  and the 3D Plan numbered every room of the building in reading order (the open item of the
  DR-021 Addendum, Package 2D-B).
- **Options:**
  1. 3D follows the 2D ten sections (ten rooms per wing). Rejected: three more rooms and doorways
     per wing raise the 3D navigation cost (gate 2) without any requirement asking for them, and
     the template has seven parts, not ten.
  2. Ask the curators to change the four concepts' categories. Rejected as the fix: it repairs this
     content release only, and `content/` is not ours to edit; a later release could split again.
  3. **One shared section map, placed by type, used by both conditions (chosen).**
- **Decision:** `src/features/learning/sections.ts` (`KNOWLEDGE_SECTIONS`) is the single source of
  truth. The 2D template re-exports it (`EPISTEMIC_SECTIONS` is the same array), and the compiler's
  default zone groups are derived from it (`DEFAULT_ZONE_GROUPS`, rule set
  `knowledge-to-space-default` version 2). The sections, in order:
  1. Tradition and context (`tradition`, `historical_context`);
  2. Materials and tools (`material`, `tool`);
  3. Process sequence (`process_stage`);
  4. Artisan decisions (`artisan_decision`);
  5. Design and outcomes (`design_principle`, `outcome`);
  6. Science and environment (`scientific_mechanism`, `explanation`, `environmental_condition`);
  7. Open questions (`open_question`);
  8. Cross-tradition comparison (`comparison`): in 2D the tradition page's comparisons section, in
     3D the one comparison hall that joins the wings.
- **Rules that follow from it:**
  - A concept's section is `sectionOfType(type)` in both conditions. The compiler chooses a room by
    type whenever the rule set's zone groups list types (version 2); categories now only order the
    labelled category runs inside a room. A version 1 rule set (category-based) still compiles, for
    stored manifests.
  - The compiler check `rules.sections` fails a manifest (error) in which any exhibit stands outside
    its 2D section's room: a tradition's concept outside its own wing's room, a comparison outside
    the hall, a shared concept outside the commons or the hall. For a version 1 rule set it is a
    warning that lists the disagreements.
  - Numbers and names: section n has number n and the same title in the 2D index and on the museum
    Plan. The Plan numbers a wing room by its section (each wing repeats 1-7, as each tradition's 2D
    index does), the hall 8, and gives the entrance lobby and the shared commons no number (they are
    no section; the 2D catalogue page has none either). The full Plan lists the entrance, then each
    wing in the canonical tradition order (DR-019) by section number, then the hall. Room names in
    the Plan are the section titles; the hall keeps "Comparison Hall" as its zone line and its
    in-scene signs. This replaces the reading-order numbering of DESIGN.md 11.6.
  - Ids are kept so telemetry and assets stay stable: 2D section ids (`#section-<id>`,
    `section:<id>`) and 3D room ids (`room:<slug>:<zone group>`) are both columns of the one table.
- **Rationale and evidence:**
  - The order is the concept note's common epistemic template (requirements digest §3; Concept §6;
    MP:278-286; TM:66-74). Its seven parts are kept in their order; open questions (the master
    spec's rule that uncertainty is shown) is the only addition. It is placed seventh, with the
    tradition's own knowledge, so a wing's rooms are numbered 1-7 without a gap and the section that
    spans traditions comes last (8), matching the hall that sits between the wings. Placing it after
    the comparison would leave a gap (no room 7 in any wing), which novices read as a missing room
    (gate 2).
  - Section 6 is named "Science and environment", the name the 3D rooms already carried, because it
    holds the environmental conditions as well as the mechanisms and explanations; the concept
    note's "scientific/technological knowledge: mechanisms, material treatments, process conditions"
    covers both. Keeping the 3D names left every wing-room plaque text unchanged except "Open
    questions" (no concept of the `supporting_evidence` category exists in the content).
  - Type, not category, decides because type is single-valued, is what the 2D page has always used,
    and is what `exposureLayerOf` already uses for per-layer exposure in both conditions. In the
    current content the two disagree for 4 of the 442 concepts (a type-by-category count over `content/`).
  - Equivalence (gate 1): the same concept now has the same section, the same section neighbours and
    the same section label in both conditions; the manipulated difference stays navigation only.
- **Measured:** `tests/unit/immersive/section-map.test.ts` compiles the study manifest from
  `content/` and checks that every wing room holds exactly the concepts of the 2D section of the
  same tradition (all study wing exhibits compared), that the hall holds the comparisons and nothing
  else, that the four concepts above now sit in their 2D section's room, that `rules.sections`
  passes with no issue, and that the Plan's numbers and names equal the 2D index's. Parity check P29
  now compares every Plan room with the 2D index of its tradition by number AND name and requires
  the index order; P26 reports each study wing's rooms by section and fails a wing room outside the
  map. Quick parity run on the production build (GTX 1650, 1280 x 800 light, three study
  traditions): P29 compared 22 Plan rooms with 24 index sections by number and name, 0 differing;
  P26 found wing rooms 1-7 in every study wing and none outside the map; the run passed.
- **Consequences:**
  - 2D: "Design principles" and "Outcomes" become one section, "Design and outcomes";
    "Environmental conditions" moves into "Science and environment"; "Comparisons" is renamed
    "Cross-tradition comparison" and becomes section 8, after "Open questions" (7).
  - 3D: the four concepts move to their 2D section's room (Srikalahasti style into the Machilipatnam
    Kalamkari context room, out of the hall). Stored manifests compiled with rule set version 1 keep
    the old placement; the demo study is re-pinned to a version 2 manifest. Of the six C5 rendering
    baselines only the Sanganeri artisan-decisions view changed (0.25% of pixels: the two moved
    concepts no longer stand on that wall); it was regenerated on the GTX 1650 and checked by eye, and
    still needs the human baseline review the other C5 baselines are waiting for.
  - Figure balance (`src/server/research/parity/engine.ts`) balances per section; section 6 now
    mixes the science layer with environmental conditions (overview layer), so "section balance also
    balances every layer" holds only per section until the engine also balances per layer
    (requested from the back-end track).
- **Paper implications:** the Methods describe one section structure for both conditions, taken from
  the concept note's template, and state that the 3D building is generated from it; the four moved
  concepts are a reported correction made before any participant data.

## DR-025: Telemetry Ingest Keeps Every Event and Reports Only Real Loss (Adopted under the lead's delegation; final review telemetry-02, -06, -07, -08, database-03, -05)

- **Context:** The final review confirmed four ways the server lost events or misreported data
  quality. Each is reproduced in the integration test
  `tests/integration/telemetry-ingest-integrity.test.ts`. All four tests failed before the
  change; the concurrency case failed in 6 of 6 sessions.
  - **Second tab:** a batch key named only the seq range. A second tab of one session (a
    ctrl-click on a 2D link) got a "replay" answer for different events and deleted them unstored.
  - **Concurrent beacons:** two page-exit beacons of one session ingested at the same moment each
    missed the other's uncommitted events and left a permanent open `gap`.
  - **Double counting:** a seq the server had quarantined (refused by a database rule) was
    counted again as a missing seq, so `open_sequence_gaps` reported it as transmission loss too.
  - **Stale rollup:** a late, lower-seq batch for an ended session never refreshed its dashboard
    rollup.
- **Options:**
  - **Where to fix the keys:** server-only checks, client-only keys, or both.
  - **Gaps:** keep storing them as now, or derive them at read time.
- **Decision:** fix both sides, and keep the stored-gap design.
  - **Client key:** `b:<session>:<first>-<last>:<16-hex hash of the event ids>`. Equal events give
    equal keys; different events never share one.
  - **Replays:** the server answers a key replay only when every event of the batch is already
    stored or quarantined. Otherwise it ingests the batch under a key derived from its event ids.
    An event on a used seq is then quarantined as `seq_conflict`: kept, not lost.
  - **Serialisation:** a transaction-scoped advisory lock serialises one session's batches.
  - **Gaps:** a quarantined seq counts as received when gaps are computed, except for events
    quarantined as belonging to another session. `open_sequence_gaps` now means "seq numbers
    never received"; rejections stay in `quarantined_events`. The data dictionary is updated.
  - **Rollups:** an event accepted for a completed or abandoned session deletes that session's
    rollup row, so the next dashboard load recomputes it.
- **Equivalence:** the same ingest serves both conditions. The second-tab loss affected 2D only,
  because in-app links open new tabs there. The fix removes a loss of raw data that differed by
  condition.
- **Paper:** report open sequence gaps and quarantined events as separate data-quality counts.

## DR-026: Timing Starts Paused in a Background Tab; Final Events Are Delivered Before Completion (Adopted under the lead's delegation; final review telemetry-03, -05, -09)

- **Context:**
  - **Background tabs:** a page opened in a background tab (middle click or ctrl-click, common in
    2D) loads hidden. It gets no `visibilitychange` until it is shown, so its intervals counted
    hidden time as active exposure or navigation time.
  - **Interval ids:** ids were built from `performance.now()` when the tracker was created, which
    restarts at every page load. Two loads could share an id and hide an unterminated interval.
  - **Finishing:** `FinishForm` awaited `flush()`, which returns without sending during a retry
    backoff. The session then completed and the cookie the uploads need was cleared, so the final
    events were lost silently.
- **Decision:**
  - **Start state:** the tracker reads `document.visibilityState` when it starts and pauses timing
    (cause `hidden`) if the page is hidden. It does not read window focus at start: headless
    browsers and pages behind DevTools report `hasFocus()` false, which would leave timing paused.
  - **Interval ids:** `iv-<10 random hex per tracker>-<counter>`.
  - **Delivery:** `flushNow()` tries at once, ignoring the client's own backoff. It retries within
    an 8 s cap and returns how many events are still pending. `FinishForm` calls it and passes
    that count to `finishSession`, which stores it as `telemetryPending` in the
    `study.session_completed` journal entry. Completion is never blocked, so a participant cannot
    get stuck.
- **Evidence:** four unit tests in `tests/unit/telemetry-client/tracker.test.ts`, all of which
  failed before the change:
  - a page that starts hidden reports 2000 ms active and 60 000 ms paused after one hidden minute;
  - interval ids created at 812.3 and 812.9 ms differ;
  - `flushNow` delivers during a 15-30 s backoff;
  - `flushNow` reports `pending: 1` when the server keeps refusing.
- **Equivalence:** the same tracker and finish page serve both conditions. The background-tab
  inflation affected 2D more than 3D. With the fix, exposure time measures the same thing in both
  conditions.

## DR-027: Research Exports Read One Snapshot, Ship as One CSV Set, and Open Safely in Spreadsheets (Adopted under the lead's delegation; final review telemetry-01, -04, security-07)

- **Context:**
  - **Inconsistent tables:** the export bundle ran about 16 autocommit queries, so during
    collection its tables could come from different moments. Each per-table CSV was also rebuilt
    at its own moment.
  - **Formula injection:** CSV cells that participants control (telemetry `target`,
    `roomOrPageId`) were written verbatim, so `=HYPERLINK(...)` ran as a formula in a spreadsheet.
  - **Unallocated sessions:** recomputing metrics failed for any study with an unallocated session
    (a pre-test dropout, D3), because `derived_metrics.condition_id` is NOT NULL. The export
    validator also rejected such sessions.
- **Decision:**
  - **One snapshot:** downloads build the bundle in one `REPEATABLE READ, READ ONLY` transaction.
  - **One CSV set:** a new download, "Download every table (CSV, ZIP)", serves every table's CSV
    from that one bundle, with `manifest.json` (generatedAt, checksums, dictionary,
    reproducibility). It adds no dependency: a minimal ZIP writer on Node's zlib, checked with
    Python's `zipfile`. The page says not to mix single-table CSV files during collection.
  - **Safe cells:** a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return
    gets a leading `'`. Numbers, and text that is a plain number such as `-1.5`, are unchanged.
    The assessment-scores CSV uses the same rule. It is documented on the exports page and in the
    ZIP manifest. The JSON bundle is unchanged.
  - **Metrics:** derived only for allocated sessions. Each session's rows are written in one
    statement, so a session is never half-updated. The validator accepts a session whose
    `condition_id` is empty (not yet allocated).
- **Evidence:**
  - `tests/integration/research-console.test.ts` now includes an unallocated session. It
    reproduced the NOT NULL failure before the change, and passes after it with the consistent
    builder and the ZIP.
  - `tests/unit/research/export-access.test.ts` covers the formula cases.
  - `tests/unit/research/export-zip.test.ts` covers the ZIP writer.
- **Paper:** the export is reproducible from one database snapshot. Analysts strip the `'` prefix
  when they load CSV files.

## DR-028: The Live Dashboard Updates the Per-Session Table Directly (Adopted under the lead's delegation; step 3 open item research-dashboard-live)

- **Context:** on the production build, `research-dashboard-live` measured 2.2-4.0 s from insert to
  UI, against a 2 s target.
  - **Server path (fast):** NOTIFY to SSE took 2-47 ms and the RSC response 200-300 ms.
  - **Client path (slow):** the delay was in `router.refresh()`, a whole-page React transition.
  - **Coarse measurement:** Playwright's `toHaveText` re-checks after 100, 250 and 500 ms, then
    every 1000 ms. The measured times (2875, 2881 and 3968 ms) fall just after the 2850 and
    3850 ms checks.
- **Decision:**
  - **Direct path:** on every `change` event the page fetches only the per-session rows
    (`/api/research/dashboard?include=sessions`), using the same coalesced computation and
    permission as the page. A small client store holds them, and the table re-renders through
    `useSyncExternalStore`, a synchronous commit rather than a transition.
  - **Rest of the page:** `router.refresh()` still follows for the other figures. The table shows
    whichever rows are newer (by server `generatedAt`), live or rendered, so a later refresh never
    rolls it back.
  - **Measurement:** the e2e spec now times the update inside the page, with a MutationObserver
    armed before the insert, instead of waiting for Playwright's next check.
- **Evidence:**
  - `tests/unit/research-dashboard/live-sessions.test.tsx` shows the events cell updating from the
    rows fetch before any refresh.
  - The production e2e timing was not re-run here, because this track has no server or browser.
    The track that owns them has to re-run it.
- **Equivalence:** the research console is not part of either condition.

## DR-029: The Server Keeps the Step Order; the Device Check Uses the Museum's Own Rule (Adopted under the lead's delegation; final review study-01, -02, -09, security-03, -06)

- **Context:** the final review confirmed that parts of the D5/D8 step order were enforced only by
  the user interface.
  - **Learning pages:** `/learn/<condition>` checked the cookie, the condition and the session
    status, never the step. Typing the URL during familiarisation, onboarding or (with allocation at
    enrolment) the pre-test showed the content and stamped the learning clock early. After learning
    ended, the full content was still sent in the page payload and hidden only on the client, so a
    second tab gave an open-book post-test.
  - **Assessment stamps and map saves:** `markAssessmentStarted` and the concept-map save trusted the
    step the client sent. A forged stamp for the post-test inflated its `duration_ms` by the whole
    learning phase; a stale pre-test tab, or a replayed save during learning, could create or submit
    the post map open-book.
  - **Device check:** it passed WebGL 1 and software renderers (SwiftShader, llvmpipe), which the
    museum refuses in study mode. Such an immersive participant saw only the fallback screen for the
    whole budget, and the WebGL-failure policy (Q-R10) never ran.
- **Options:** gate in the pages only; gate in the services; or both.
- **Decision:** the services decide, using the study engine's position.
  - **Learning gate:** `getLearningContext` serves a participant only while the learning step is
    current (`learningStepIsCurrent`); otherwise it redirects to `/study/session`, which shows the
    current step. The learning clock can therefore start only during the learning step. The practice
    pages already required the familiarisation step.
  - **Stamps and saves:** `markAssessmentPresented` (engine) refuses any step but the current one,
    under the session lock a submission takes. The participant map save locks the session and
    requires the reconstruction step of the map's phase (`currentReconstructionPhase`).
  - **One GPU rule:** `museumCanRender` (`src/features/study/gpu-acceptance.ts`): WebGL 2 on a
    hardware renderer. The device check reports a `softwareRenderer` boolean (never the renderer
    string, so no fingerprinting) and the engine applies the policy to an immersive participant
    whose browser fails that rule.
  - **Backstop:** `recordMuseumWebglFailure` (engine) and the Server Action `reportMuseumUnavailable`
    apply the same policy when the museum's own probe fails later: exclude; reassign to 2D (only the
    condition-blind steps are carried over, so the 2D practice and introduction come first); or retry
    (a failed device check is recorded and the participant returns to the check). The journal entry
    `study.webgl_failed` flags the session's learning time.
- **Open for the 3D track:** the museum's fallback screen must call `reportMuseumUnavailable` in
  study mode, and `quality.ts` / `museum-app.tsx` should take the regex and the rule from
  `gpu-acceptance.ts`, so the two cannot drift.
- **Equivalence:** both conditions pass the same gates; the device check measures the same
  covariates in both and applies the policy to the immersive condition only, as Q-R10 already did.
  The learning gate removes a way of seeing content outside the protocol that existed equally in
  both.
- **Paper:** report the number of immersive participants handled by the WebGL policy, at the check
  and later, per policy outcome.

## DR-030: Participant Data Is Removed on Request and After the Retention Period (Adopted under the lead's delegation; final review database-04, study-08)

- **Context:** the withdrawal page stated a retention period and said data could be removed on
  request. Nothing read `retentionDays`, and removal needed hand-ordered SQL over about twelve tables
  under two purge settings. Whether protocol CXA/ETH/01 requires a particular procedure is not
  recorded in the project; the page's own promise is removal on request and keeping the data no
  longer than the stated period.
- **Options:** automatic deletion by a scheduled job; a researcher-run removal with an audit trail;
  or changing the wording to match a manual process.
- **Decision:** a researcher-run removal, never automatic, with its scope said plainly to the
  participant.
  - **Who:** the principal investigator only (new permission `participants.purge`), from the
    research console (study page, "Participant Data") or `scripts/db/purge.ts` (dry run by default).
  - **What is removed:** the participant's telemetry (events, batches, quarantine, gaps, rollups),
    derived metrics and scores, concept maps with edges and revisions, responses, protocol deviations,
    annotations and session rows, in one transaction under both purge settings
    (`src/server/study/purge.ts`).
  - **What is kept:** the pseudonymous participant row, consent records, allocation and journal. They
    are append-only, hold no answers and no name, and are the record that consent was obtained and the
    randomisation was followed. The withdrawal page now says so.
  - **On request:** refused while the participant is still taking part (they withdraw first).
  - **Retention:** `retentionDays` counts from the end of the participant's participation (latest
    completion, withdrawal, exclusion or last activity of their sessions). The console lists who is
    past it, and one action removes them. Running it is part of the research team's data-management
    routine; the console field says it is not automatic.
  - **Audit:** every removal is journalled as `research.participant_data_purged` (who, reason,
    trigger, rows per table), never the data removed.
- **Why not automatic:** a scheduled job that deletes research data without a person deciding is
  hard to stop if the period was mis-set, and the period is still an open researcher decision
  (Q-R11). The listing makes due removals visible every time the study page is opened.
- **Equivalence:** the same rule for both conditions.
- **Paper:** report the number of participants whose data were removed on request, by condition, as
  part of attrition.

## DR-031: Allocation and Its Analysis Stay Fixed and Concealed (Adopted under the lead's delegation; final review study-03, -04, -07, database-02)

- **Context:**
  - **Predictable seed:** without a configured seed, the seed was derived from the study id and
    protocol version, both visible to facilitators, so the next condition could be recomputed
    (allocation concealment, CONSORT item 9).
  - **Drifting reference:** `pre_map_recall` scored against the newest locked reference map at each
    allocation, so a map version locked mid-study changed the stratification rule part-way.
  - **Blank pre-test:** under `pre_test_score`, a participant who skipped every keyed item had no
    score and could never be allocated: exactly the low-prior-knowledge participants the stratum is
    about.
  - **Reassignment:** attempts were numbered per session, so after `webglFailurePolicy = reassign` the
    post-learning SSQ became a second "attempt 1" (reported as SSQ-pre), and the closed immersive
    session's SSQ and pre-test counted in the immersive arm for a participant analysed in 2D.
- **Decision:**
  - **Seed:** activation writes a random 256-bit seed into the frozen config when none is set. The
    journal records only a fingerprint, and exports carry the seed only after the study is closed. A
    new protocol version gets its own seed.
  - **Reference map:** activation pins the stratification reference map (`stratifyBy.referenceMapId`)
    and is refused when none is locked; allocation scores against the pinned map only.
  - **Blank pre-test:** a skipped keyed item scores 0, as it already did when only some were
    skipped. Allocation is refused only when the pre-test has no keyed item at all (a configuration
    fault). The allocation record shows answered and skipped keyed items.
  - **Attempts:** numbered per participant and assessment. The journal step tells the SSQ before and
    after learning apart (dashboard and exports, which now have a `step` column). Condition-blind data
    are attributed to the participant's analysed session, as the concept-map block already was.
- **Not adopted:** varying block sizes to hide block ends (study-07, point 3). Facilitators can see
  conditions, so the last slot of a block of 4 stays guessable; this is the usual limit of permuted
  blocks and should be reported. Changing it is a design decision for the methodologist, not a defect
  fix.
- **Equivalence:** allocation and analysis rules are condition-neutral; the reassignment fix stops
  2D-analysed data being counted in the immersive arm.
- **Paper:** report that the seed was generated at activation and concealed, the pinned reference
  map version, and the block size.

## DR-032: A Study Activates Only When Every Step of Its Journey Can Run (Adopted under the lead's delegation; final review study-05, study-10)

- **Context:** a configured test step with no matching battery assessment was completed silently as
  "empty" for every participant, losing the prior-knowledge covariate or an outcome. A hybrid
  guidance policy without hint text activated, then refused every enrolment. Saving the study form
  also dropped `guidance.hintText` and reset a tuned `stallSeconds`.
- **Decision:**
  - **Parity check `d.journey` (critical):** the engine's order rules (`protocolIssues`) hold; every
    test step has a battery assessment of its phase and kind; and every questionnaire instrument of a
    configured step is in the battery. Activation is refused otherwise.
  - **Study form:** the form keeps the guidance fields it does not show. Hint text and the stall
    threshold are now on the form.
- **Equivalence:** the journey and battery are study-wide; the check protects both conditions alike.

## DR-033: Enrolment Limits, Pseudonymised Free Text and Staff Sign-In Locks (Adopted under the lead's delegation; final review security-01, -04, -05, -09, -10, database-06, -07, -08)

- **Enrolment limits (security-04):** new enrolments are counted per client address and study (30
  per 10 minutes, so a lab behind one address can still start together) and per study (120 per
  hour), in Postgres, with no address stored. A study may set its own limits and a
  `maxParticipants` cap. Demo studies are not throttled. An access code separate from the slug was
  not adopted: sessions are facilitator-run and the code is not published; the limits and the cap
  bound the damage if it leaks.
- **Free text (security-05):** exclusion details, annotation bodies and deviation descriptions reach
  only identified-scope roles (and each author's own notes), as in the pseudonymised export. The
  audit log keeps the exclusion category only.
- **Staff sign-in (security-09):** a browser that has signed in to an account before is counted in
  its own bucket, so a stranger who knows a staff email can no longer lock its owner out; guessing
  from a known browser is still capped. `scripts/unlock-account.ts` lets an administrator clear a
  lock, audited.
- **Other guards:** cookie deletions carry `Secure`, so `__Host-` cookies really are cleared in
  production (security-01). Locking an administrator takes the same lock as revoking one
  (security-10). Migration 0018 makes withdrawal, exclusion and the end of a session terminal,
  stamps consent rows with the server clock, refuses a decision after a withdrawal and a second
  initial decision, makes telemetry intake follow the latest consent, allows a session row to be
  deleted only in a reasoned purge, and makes item writes wait for a concurrent publish
  (database-06, -07, -08). Consent, enrolment, publish and lock writes run in one transaction with
  their audit rows.
- **Equivalence:** none of these touches either condition's presentation.

## DR-037: Study Photographs Are Frozen With the Release a Study Pins; Every Change to Learner-Facing Figure Text Is Reviewed (Adopted under the lead's delegation; final review knowledge-01, -02, -05, -07, -10, database-01, security-02)

- **Context:** the final review confirmed that the study photographs (DR-020) were the one part of
  what learners see that a study did not pin.
  - **Read live:** the read model took every approved illustration link of any concept in ANY
    published release from the live `asset_links` and `assets` rows, cached for an hour. The bundle
    froze no figures (`assetIds` was always empty). A caption or alt-text edit, a re-anchored or new
    link, a reviewer's verification or a re-linked file reached the next participant of a running
    study, and the activation parity report described only the day it ran.
  - **Unreviewed text:** a content editor (media.upload, not media.review) could set a link's
    caption override of up to 2,000 characters, or move its anchor claim, on a verified photograph.
    The asset stayed verified and the 180-character caption rule was never applied.
  - **Anchors by index:** a claim reorder in the CMS kept `asset_links.position`, so a photograph
    could move under a claim it was never reviewed against.
  - **Authors:** a media reviewer was barred only as the uploader or the LAST editor, so an earlier
    editor could verify the caption they wrote.
  - **Image optimiser:** photographs rendered through `/_next/image`, whose cache keeps a copy for at
    least four hours and re-serves the stale copy when `/figures/<id>` starts answering 404. The
    route itself sent `max-age=31536000, immutable`. A withdrawn or expired photograph could stay
    fetchable for a year or longer.
- **Options:** (a) refuse every media change while a study is active; (b) freeze the photographs
  into the release and serve them from the frozen copy; (c) put the figures into the bundle payload
  (`concept.assetIds` plus asset snapshot items).
- **Decision: (b), with the review rules tightened.**
  - **Frozen at publication:** `publishRelease` copies every illustration that is servable at that
    moment (approved, licence valid, within its display cap, with credit, alt text and caption, and
    an anchor that names one of the concept's claims) into `snapshot_figures` (migration 0019). Each
    row keeps what a learner sees: the anchor claim index, the caption (the link's override, else the
    asset's), the alt text, credit and licence lines, the pixel size and the file's sha256. A trigger
    allows rows only while the release is a draft and refuses every later change. Releases published
    before the migration were backfilled with the photographs servable on the migration day.
  - **Served from the frozen copy:** for a published release, the read model (both conditions), the
    activation parity check and the CMS Figure Balance read only these rows. Nothing can be added or
    changed during a study. Only removals stay live: the licence (expiry, display cap, the
    first-publication stamp), a reviewer's needs-evidence, rejection or archive decision, and a
    different stored file. An edit that sends the asset back to review does NOT remove it: the
    study keeps the reviewed text it froze. A review build (no frozen figures) still previews the
    live, approved links.
  - **Removals are deviations:** when a media action removes a frozen photograph from the release
    of an ACTIVE study, the same transaction records a major `content` protocol deviation for that
    study and an audit row (`media.figure_withdrawn`). Removal by the calendar (a licence reaching
    its end date) has no actor and is not recorded automatically; the expiry dates are known in
    advance and the parity report flags an expired licence.
  - **A link is learner-facing text:** its caption override obeys the caption rules (at most 180
    characters, never the alt text). Creating a link, moving its anchor or changing its override on
    an accepted asset sends the asset back to review, so no new release freezes it until another
    reviewer has checked it.
  - **Anchors follow their claim:** `saveClaims` moves each illustration's anchor to the new index of
    the same claim text. When that text is gone (reworded or deleted), the asset goes back to review
    (`media.anchor_lost` in the audit log).
  - **All authors:** `assetAuthors` bars everyone who uploaded, edited or linked an asset from
    verifying it, as `authorsOf` does for concepts.
  - **No optimiser cache:** photographs render `unoptimized` in the shared `KnowledgeFigure`, so the
    browser requests `/figures/<id>` itself (the files are already 768 px derivatives). The route
    sends `public, max-age=300, must-revalidate` (never past the licence's last day) with the file's
    sha256 as ETag, and answers a matching revalidation with 304 only after the licence gate passes.
- **Rationale:** (a) would block licence withdrawals and leave the parity report stale; (c) would
  change the knowledge-bundle contract, its hashes and the snapshot items the spatial compiler
  reads, for no gain over a frozen table keyed by the snapshot. (b) makes "one immutable bundle per
  study" true for figures too, keeps licence compliance live, and lets the paper rebuild the figure
  set from the pinned snapshot.
- **Evidence:** `tests/integration/cms-media.test.ts` (frozen figures unchanged by a new link, a new
  caption, an anchor change and an unlink; the frozen rows immutable; a rejection recorded as a
  deviation of the active study; the override rules; an earlier editor refused);
  `tests/integration/cms-release-governance.test.ts` (publishRelease freezes the photograph; the
  anchor follows its claim; a reworded claim returns the asset to review);
  `tests/unit/knowledge/figure-photo-source.test.tsx` (slot and lightbox request `/figures/<id>`,
  never `/_next/image`; fails on the previous component).
- **Equivalence:** both conditions read the same frozen rows through the same `getFiguresByConcept`
  and render them through the same component; no condition sees a figure the other does not. The
  change removes a between-cohort difference that existed in both.
- **Paper:** report that the study photographs were fixed with the content release the study
  pinned, and list any `content` deviation recorded for a withdrawn photograph.

## DR-038: A Release Names Every Dependency Outside Review; Content Imports Keep Curator Decisions (Adopted under the lead's delegation; final review knowledge-03, -04, -06, -09, -12)

- **Context:** the final review confirmed five ways in which reviewed content could change, or be
  released differently from how it was reviewed, without anyone being told.
  - **Dropped citations (knowledge-03):** a claim could cite a draft CMS source; verification never
    checked the cited sources' states, and the snapshot loader silently dropped a citation it could
    not resolve. The same happened when a cited source was later rejected or archived.
  - **Orphaned concepts (knowledge-12):** archiving or rejecting a tradition left its verified
    concepts in the release with no tradition, so the spatial compiler and the metrics counted them
    as shared knowledge.
  - **One quote for many sources (knowledge-06):** a reworded multi-source claim kept one claim-level
    quote, which the learner view can attach only to a single-source claim, so learners saw no
    verbatim text on any of its citations.
  - **Re-import (knowledge-04, -09):** `content:import` reset any state a curator had set below
    acceptance (rejected, archived, needs evidence, withdrawn) to the file's state; it deleted
    CMS-authored relationships between imported concepts; it aborted with a raw foreign-key error
    when a dropped relationship was encoded by a spatial manifest; and it replaced an accepted
    tradition's GI evidence without reopening review.
- **Decision:**
  - **Release refusals:** REL004 refuses a release while a claim or relationship in the pipeline
    cites a source outside it (draft, rejected, archived); REL005 refuses it while a concept in the
    pipeline belongs to a tradition outside it. The pending list names the source or concept.
  - **Verification:** a concept or relationship citing a source outside the pipeline cannot be
    verified (`claim_source_unusable`, `rel_source_unusable`). A source that leaves the pipeline
    sends every accepted concept and relationship citing it back to review, in the same transaction.
  - **A quote per citation:** a claim with more than one source needs a verbatim passage for each
    citation. The CMS claim editor asks for one per citation; imported passages are kept while the
    claim text, source and locator are unchanged, and dropped when the locator changes, so a kept
    passage never contradicts the citation's own locator.
  - **Imports:** the importer still never touches accepted rows. It now also keeps any state a user
    decided (the latest `verification_records` row has an actor) and reports it as `keptCurated`;
    states it set itself still follow the files. It prunes only relationships it created and that no
    snapshot or manifest holds; the rest are reported in `stale.relationships`. It leaves the GI
    evidence of an accepted tradition alone, and a trigger on `tradition_sources` (migration 0019)
    reopens an accepted tradition whenever any writer changes its evidence.
- **Rationale:** the snapshot loader's state filter is right for review builds, so the gaps are
  closed where the decisions are made (verification, source transitions, release readiness, the
  importer) rather than by making review snapshots fail on drafts.
- **Evidence:** `tests/integration/cms-release-governance.test.ts` (REL004 and REL005, the
  verification refusal, the cascade from an archived source, the per-citation quote rule) and
  `tests/integration/content-pipeline.test.ts` (curator states kept, CMS and manifest-encoded edges
  kept and reported, GI evidence of an accepted tradition kept, the trigger). All of them fail on the
  previous code.
- **Equivalence:** these rules act before a release exists, identically for every tradition and both
  conditions; nothing learner-facing changes in a published release.
- **Paper:** none beyond the citation standard already reported (every citation carries its own
  locator and verbatim quote).

## DR-039: Corrections to This Record: Duplicate Numbers and the DR-020 Anchor Statement (Adopted under the lead's delegation; final review knowledge-08, -11)

- **Duplicate numbers (knowledge-11):** DR-021, DR-022 and DR-023 each headed two records, filed in
  the same commit, so a bare citation was ambiguous (one DR-023 Adopted, the other Proposed).
  - **Options:** renumber the second set (layout parity, Atlas, 3D gallery finish), as the review
    suggested, or the first set (concept layers and pager, Figure 3, admin settings).
  - **Decision:** renumber the first set, to DR-034, DR-035 and DR-036. Neither set is older. The
    second set is cited about 300 times (code, tests, DESIGN.md, eight later addenda, the 3D track's
    files and the team's notes); the first set about 15 times. Keeping the widely cited meaning
    avoids rewriting those citations and the risk of a wrong rewrite in files owned by the 3D track.
    The citations of the first set in files this track owns were updated; the rest are listed for
    the 3D track (`src/features/learning-2d/navigation.ts`).
- **DR-020 anchor statement (knowledge-08):** DR-020 said that the anchor claim of each study
  photograph names that very object. It does for Ajrakh and Machilipatnam Kalamkari, not for
  Sanganeri. DR-020 now states the actual relation and lists it as a limitation in its Paper item.
  The figure itself was not changed: the alternative (anchoring V&A IS.517-1883 to
  `export-and-museum-record` claim 2) would restore the rule at the cost of the salience match DR-020
  chose, and would need the curators' decision and new parity baselines.
- **Equivalence:** documentation only; nothing learner-facing changes.

## DR-040: Concept-Map Scores Follow Their Published Definitions; Reference Agreement Uses a Defined Universe (Adopted under the lead's delegation; final review scoring-01, -05, -06)

- **Optional edges (scoring-06):** the scorer counted a match to an optional reference edge as
  valid by default (`optionalMatch = "valid"`), while D2 ("Optional edges are neutral") and the
  published definition of `cmap.precision.dl` ("optional reference edges neutral") say the
  opposite; nothing in the platform set "neutral".
  - **Options:** keep "valid" and rewrite the definitions, or make "neutral" the default.
  - **Decision:** "neutral" is the default (scoring pipeline `cmap-scoring@1.1.0`). It matches D2
    and the published text, treats optional edges the same way recall and Jaccard already do
    (neither help nor hurt), and keeps precision a guard against over-linking. This answers open
    question 4 of `docs/research/concept-map-scoring.md` §8. A study may still set "valid"; every
    score stores the value it used, so older scores stay attributable and can be rescored.
- **Coverage ratios above 1 (scoring-05):** `cmap.cross_category.valid_normalised` (D2 secondary 4)
  divided all valid participant edges, optional matches included, by the expected cross-category
  edges, and `cmap.causal_chain_depth_normalised` divided a depth over every valid edge by a depth
  over expected edges; both reached 3.0 in the reproduced case.
  - **Decision:** both now count only expected reference edges the participant covered (not
    missing at the validity level, as recall counts them): covered expected cross-category edges ÷
    expected cross-category edges, and the longest chain of covered expected edges ÷ the longest
    chain of all expected edges. Both stay in [0, 1] for any `optionalMatch` or `validityLevel`.
    The raw counts and the raw depth are unchanged.
  - **Versions:** `cmap.precision`, `cmap.f1`, `cmap.valid_relationships`,
    `cmap.cross_category.valid`, `cmap.cross_category.valid_normalised`,
    `cmap.causal_chain_depth` and `cmap.causal_chain_depth_normalised` move to 1.1.0. Recall (the
    primary outcome), Jaccard, edit distance and the incorrect count do not change.
- **Rater agreement (scoring-01):** over the default "union" universe no edge is absent for every
  rater, so for two raters pₒ − pₑ = −2bc/n² ≤ 0: Cohen's κ (and Fleiss' κ, Scott's π for two
  raters) could never be positive. 18 shared edges plus one unique edge each (90 % agreement) read
  as κ = −0.053. The docs called this universe "conservative".
  - **Decision:** over the union, κ is reported as undefined (`kappaUndefinedReason`), and
    positive agreement is reported instead: the Dice coefficient 2a/(2a+b+c) per rater pair and the
    pooled proportion of specific positive agreement over all raters (equal to Dice for two
    raters). κ is computed only over a defined universe: every possible edge of the item's concept
    set and relationship types. The reference workspace shows both, each labelled with its
    universe, and the finalise note records positive agreement and the all-possible κ.
  - **Why both:** positive agreement does not depend on how many trivially agreed absences the
    universe holds; κ over all possible edges is the chance-corrected figure reviewers expect, and
    it is close to positive agreement when absences dominate. Which one gates adjudication stays
    open question 10 for the methodologist.
- **Evidence:** `tests/unit/assessment-scoring/score.test.ts` (worked example under the new
  defaults, derivations in comments; the "valid" variant; a reference with optional cross-category
  causal edges where every normalised metric is 1, which was 3); `agreement.test.ts` (union κ is
  null, Dice 2/3; the 18 + 1 + 1 case gives 36/38, κ over all possible edges > 0.9; three-rater
  pooled agreement 8/12); `change.test.ts`. 73 scoring tests pass.
- **Equivalence:** scoring is condition-blind: the same rules apply to maps from both conditions
  and every tradition.
- **Paper:** report scoring pipeline 1.1.0, `optionalMatch = neutral`, the coverage definitions of
  the two normalised secondaries, and reference-map reliability as positive agreement with κ over
  the all-possible universe (name the universe). Rescore any map scored under 1.0.0 before
  analysis.

## DR-041: One Reference, One Version, One Row per Participant in Every Analysis (Adopted under the lead's delegation; final review scoring-02, -03, -04, -07, -10)

- **Unallocated sessions (scoring-02):** allocation follows the pre-test (D3), so a consented
  participant who stops before it keeps `condition_id` null. The Python verifier rejected such a
  bundle ("unknown condition") and `build_table` raised, so one dropout stopped the preregistered
  analysis. **Decision:** a null condition means "not allocated"; such participants are counted
  as `unallocated` (CONSORT: before randomisation), never an error. The server validator already
  accepted them.
- **Reassignment (scoring-03):** the Python table was keyed by session, so after a WebGL
  reassignment the pre-test (on the abandoned immersive session) and the post-test (on the 2D
  session) became two rows: the participant left the ANCOVA and the immersive arm gained a phantom
  baseline. **Decision:** one row per participant, as on the dashboard: condition and status from
  the latest-period allocated session; the condition-blind baseline from any of the participant's
  sessions; outcomes from the analysed session only; earlier sessions counted as
  `superseded_sessions`. A participant with any excluded or withdrawn session is set aside and
  counted.
- **Reference and version (scoring-04):** a map's scores against several reference maps (and
  metric versions) coexist, and every read took the latest `computed_at`, so pre and post recall
  could use different expected-edge sets, against D2's one-denominator rule.
  - **Options:** pin a reference column on the study at activation; or resolve one reference per
    reconstruction assessment by a fixed rule at read time.
  - **Decision:** the rule (`src/server/research/analysis-reference.ts`): the map pinned at
    activation for stratification (DR-031), else the newest locked map, else, before any is
    locked, the newest finalised map marked "provisional". The dashboard, the Analytics page and
    the export read concept-map scores against that map only and, on the dashboard, at the current
    metric version only. The export names the maps (`study.analysisReferenceMaps`) and the
    current versions (`reproducibility.scoringMetricVersions`); the Python table filters on both
    (a `--metric-version` flag overrides) and refuses to guess when versions are mixed and none is
    recorded. As a backstop a baseline scored against another reference than the outcome is never
    paired: the dashboard treats that pre value as missing; Python drops and counts it.
  - **Why read-time:** it needs no schema change, works for studies already active, and is the
    same for both conditions and every participant at any moment; once a map is locked or pinned
    the reference cannot drift. Scoring against other references stays possible for exploration.
- **Analytics distributions (scoring-07):** per-item rows (`item.key_match`, per-response rubric
  ratings) kept one arbitrary item per session, and pre-test, post-test and transfer totals were
  pooled into one distribution. **Decision:** response-level rows are left out (their statistics
  are on the dashboard); each non-map score is its own distribution per assessment kind, code and
  version; unallocated sessions are left out.
- **Power reference (scoring-10):** every report embedded the concept note's t-test at 20 per
  group as "planned_sample". **Decision:** the report's `power_reference` is the D4 plan (ANCOVA,
  ρ = 0.6, 51 per group; MDE 0.73 at 20 per group), with the t-test kept as a labelled comparison.
- **Evidence:** `analysis/tests/test_episteme_stats.py` (21 tests pass; 9 new or changed ones fail on the
  previous package: unallocated, reassigned participant, reference and version filtering, mismatch
  backstop, mixed versions, D4 plan); `tests/integration/research-dashboard.test.ts` (newer scores
  against another reference and at an old version leave P01 at pre 0.2 / post 0.6 in the dashboard
  and its CSV; analysis-reference rule pinned > locked > provisional; pre-test and post-test totals
  apart, no item rows; the two data tests fail on the previous queries) and
  `tests/integration/research-console.test.ts` (bundle fields).
- **Equivalence:** all rules are condition-neutral; the reassignment fix stops 2D-analysed data
  counting in the immersive arm, and the reference rule gives both arms one denominator.
- **Paper:** report the analysis reference map (id, version, basis), the scoring version, the
  per-participant unit with counts of unallocated, superseded, excluded and withdrawn
  participants, and power against D4.

## DR-042: The Parity Gate Fails Early Finish; the Equivalence Monitor Counts Every Expected Check (Adopted under the lead's delegation; final review scoring-08, -09)

- **Early finish (scoring-09):** a fixed-time study with `allowEarlyFinish = true` passed the
  critical check "The exposure budget is fixed and equal for both conditions" and could be
  activated, although D5 and DR-015 hold time on task constant (and 3D navigation overhead counts
  toward the budget, so one condition may finish earlier). **Decision:** `e.exposure` now raises
  `exposure_early_finish`, which is critical, so activation is refused until early finish is off.
  The study form says so next to the switch. A pilot that needs early finish is a documented
  deviation, not a parity pass. The parity generator version was not changed (the new
  `d.journey` check of DR-032 did not change it either); stored reports are regenerated at
  activation.
- **Unmeasured checks (scoring-08):** the run line divided by the checks measured in at least one
  run, so a stored report older than the suite (P1-P27 only) read "27 of 27 checks pass" on the
  public pages while P28-P33 had no evidence; it also cut the commit to 7 characters and so hid
  "+uncommitted". **Decision:** the denominator is every expected check; unmeasured checks are
  named ("27 of 33 checks pass; 6 not measured (P28, P29, P30, P31, P32, P33)"); a report from a
  dirty tree says "with uncommitted changes". The monitor never claims a check passes that no run
  measured.
- **Evidence:** `tests/unit/research/parity-engine.test.ts` (early finish fails `e.exposure` and
  the report) and `tests/unit/research/equivalence-monitor.test.tsx` (a P1-P27 report reads "27 of
  33 … 6 not measured (P28 … P33)" with the dirty-tree mark; the fixture run lines now count all 33).
- **Open (3D track):** the stored `analysis/parity/interface-parity.json` in this worktree covers
  all 33 checks (66 runs, 30 pass, 3 partly measured) but was recorded at `119e815+uncommitted`; it
  should be regenerated with `tests/e2e/parity.spec.ts` on the final commit.
- **Equivalence:** both changes make the equivalence evidence stricter; nothing learner-facing
  changes.
- **Paper:** report that exposure was fixed with no early finish, and quote the parity headline
  with its denominator and any unmeasured or partial checks.
## DR-043: Hub Building: Every Tradition Wing Equally Far From the Start (Adopted under the lead's delegation; resolves DR-023 Addendum B; methodologist sign-off with DR-021 before any participant data)

- **Context (gate 1, tradition salience):** the compiler built the three wings side by side along
  one 91.5 m comparison hall with the lobby at its west end. Walking from the entrance directory to
  the wing doorways took 5.9 s (Ajrakh), 19.3 s (Machilipatnam Kalamkari) and 31.4 s (Sanganeri),
  while every tradition is one link away in 2D. The DR-023 addenda left this open as a covariate and
  recommended a hub. The review also confirmed three compiler findings: consecutive sections were
  not adjacent rooms (spatial-3: up to 6 doorways apart in the Sanganeri wing, hidden by a test
  metric that skipped exactly those pairs), floor contact shading was missing on walls filed under
  a neighbouring room (spatial-4), and manifest rationales misdescribed the layout (spatial-5).
- **Options:**
  1. Keep the row and counterbalance wing order across participants. Rejected as the fix: it
     averages the confound out across participants instead of removing it, needs a rotated 2D
     index to keep the orders matched, and leaves every individual session unequal.
  2. A lobby centred on the row of wings. Rejected: the middle wing becomes nearest.
  3. The comparison hall as the hub, entered from a lobby on its fourth side. Rejected: from a
     doorway on one side, the opposite wing is about 1.4 times as far as the side wings.
  4. **The entrance lobby as the hub, the spawn equidistant from three wing doorways (chosen).**
- **Decision (rule set `knowledge-to-space-default` version 3, `layout.building: "hub"`;
  `spatial-compiler@1.3.0`, `LAYOUT_VERSION grid-wings@3`):**
  - The wings open off the lobby's west, south and east walls in canonical (slug) order: Ajrakh
    west, Machilipatnam Kalamkari south, Sanganeri east. The spawn stands on the lobby's axis
    3.5 m from its north wall (`hubSpawnDepth`, the directory's reading distance), facing north.
    The west and east doorways are level with the spawn and the south doorway is on its axis, and
    the lobby is 3.5 m plus half its width deep, so all three doorways are half the lobby width
    (5.5 m) from the spawn. Each wing grid is rotated so its entrance room is centred on its
    doorway.
  - The entrance directory hangs on the lobby's north wall, facing the spawn, read from the spawn
    with no walk-up (removes the walk-up arrival in front of a bare wall, open item (a)). It lists
    the wings in canonical order, then the comparison hall and the shared commons, in equal-size
    rows. Its directions name the lobby wall, as one reads the directory: "Doorway in the left
    wall", "... in the opposite wall", "... in the right wall", "Doorways either side of this
    sign", "Through the comparison hall".
  - The comparison hall lies north of the lobby, entered by two doorways at the quarter points of
    the north wall, either side of the directory. Each comparison stands on the hall slot nearest,
    in plan, to the wings it compares. The commons opens off the hall's far wall on the spawn axis,
    in no wing's direction.
  - At the spawn none of the three wing doorways is in view (they are at 90 and 180 degrees); the
    view holds the directory and the hall. No tradition is seen first.
  - Wing grids fill in serpentine order with a circulation doorway between consecutive slots, so
    walking the sections in their 2D order is one doorway per section (spatial-3). New compiler
    checks: `navigation.wing-equidistance` (routes from the spawn to the wing doorways within
    10%; an error for a hub) and `layout.section-adjacency` (consecutive sections share a
    doorway; error). More than three wings cannot form a hub; the compiler then builds the row and
    warns (`layout.building`); the study selects three traditions (DR-017).
  - Wayfinding and finish items in the same package: door signs carry the section number of the
    room they lead to ("3. Process Sequence"), the number the Plan and the 2D index give it; the
    Plan marks the current room with an arrow pointing the visitor's facing in eight compass steps
    and names each room on hover; a sequence station's "Step n of N" line is set at the title size
    on a plate 0.1 m taller (0.8 m), so no title loses a line; floor and ceiling bakes use every
    wall that bounds a room (spatial-4); the manifest rationales describe the real algorithm
    (spatial-5).
- **Measured:**
  - Compiler: route length from the spawn to each wing doorway 5.85 / 5.85 / 5.85 m; consecutive
    sections 1 doorway apart in every wing (6 doorways for 7 sections). Floor contact bands on all
    four sides of all 24 rooms (edge means 0.70 to 0.77 against 0.86 to 1.00 for the walls missing
    before).
  - GTX 1650, production build, 1280 x 800, a click on each wing's directory row at the spawn,
    three runs per wing, wing order rotated: median time to enter the wing 3.51 s (Ajrakh),
    3.42 s (Machilipatnam Kalamkari), 3.42 s (Sanganeri), a spread of 2.7%; to stand at rest
    inside it 5.97 / 5.82 / 5.82 s, a spread of 2.6% (requirement: within 10%). Arrival faces into
    the room in every run.
  - Scripted novice, default controls (`modules/immersive-3d.md`, "Hub Building"): no wrong turns
    in any wing.
  - Rendering on the GTX 1650: C1-C8, C10 and both legibility checks pass after one fix (a late
    program compile for the route ribbon, C4); C12 fails as before (wall colour encode, unrelated).
    Quick parity run: passed (P29 0 differing, P33 18 against 18).
- **Equivalence check:** content: unchanged (every concept stays in its section's room; the
  section map, plate titles and claims are unchanged). Exposure and timing: navigation time to each
  tradition is now equal by construction and by measurement; content exposure is untouched.
  Citations: unchanged. Ease once a concept is open: unchanged (the sheet is the same; the plate's
  step line is larger, and its wording is the 2D rail's). Natural navigation only: the building,
  directory, door-sign numbers and Plan arrow are 3D navigation, the manipulated variable; the
  section numbers are those the 2D index already shows. Tradition salience: the confound DR-023
  recorded is removed; the order of wings is the canonical order of the 2D index. Telemetry: no new
  event or field; `room_entered` still carries the tradition, and the old time-to-wing covariate
  is still derivable.
- **Consequences:** every stored manifest compiled under rule sets v1/v2 keeps the row building; the
  dev database has a new manifest (`01a1427c-0769-7c55-86fe-79a1a46436e8`, valid) and the draft demo
  study `demo-review-walkthrough` is re-pinned to it. The six C5 rendering baselines were
  regenerated (every room view changed) and need the same human review as before. The files under
  `analysis/out/spatial/` were recompiled. `docs/architecture/spatial-compiler.md` still describes
  the row building and the old order metric (outside this track's files; a change is requested).
- **Paper implications:** the Methods state that the 3D building places every tradition at the same
  walking distance from the start (measured), that wings appear in the same canonical order as the
  2D index, and that walking through a wing meets the sections in the 2D order one doorway apart.

## DR-044: Wall Colour Texture Re-Encoded Without Rate-Distortion Optimisation (Adopted under the lead's delegation; package 3D-3)

- **Context:** check C12 (texture fidelity, SSIM at least 0.98 against the authored source on the
  GPU) failed for the wall colour map, 0.9746, in every run since the gallery finish. Earlier work
  showed it was the encode, not the transcode (an uncompressed RGBA8 transcode measured 0.9753),
  and named the fix (re-encode with KTX-Software 4.4.2), which was not installed.
- **Tool:** KTX-Software v4.4.2 for Windows x64, the official release asset
  `KTX-Software-4.4.2-Windows-x64.exe` from github.com/KhronosGroup/KTX-Software. Its sha256
  `1f323b0f...2d2957fe` matches the digest GitHub publishes for the asset, and its Authenticode
  signature is valid (The Khronos Group Inc). It was extracted, not installed, to `C:\Tools\KTX`
  (not on PATH; called as `C:\Tools\KTX\bin\ktx.exe`; provenance in `C:\Tools\KTX\SOURCE.txt`).
- **Measured offline first** (each variant encoded, level 0 transcoded to RGBA8 with `ktx extract`,
  SSIM by the project's own `scripts/museum/ssim.ts`, the C12 metric). The shipped file reproduced
  0.9753 exactly, so the proxy matches the earlier measurement.

  | Wall colour encode | Bytes | SSIM (proxy) | Mean abs. error (sRGB levels) |
  |---|---|---|---|
  | UASTC quality 2, RDO lambda 0.5 (shipped) | 2,697,552 | 0.9753 | 0.947 |
  | quality 2, RDO lambda 0.25 | 3,372,591 | 0.9863 | 0.684 |
  | quality 2, RDO lambda 0.1 | 3,653,046 | 0.9882 | 0.626 |
  | **quality 2, no RDO (chosen)** | **3,714,461** | **0.9883** | **0.624** |
  | quality 3, no RDO | 3,715,147 | 0.9884 | 0.621 |
  | quality 4, no RDO (226 s to encode) | 3,963,634 | 0.9882 | 0.631 |

- **Decision:** the wall colour map is encoded without RDO (`rdo: false` on that map in
  `scripts/museum/textures.config.ts`; the encoder arguments are otherwise unchanged). RDO is what
  cost the fidelity on the near-flat plaster; quality levels above 2 add nothing. No-RDO is chosen
  over lambda 0.1 because it is the simpler setting for the same fidelity (59 kB more). Every other
  map keeps its encode, and because the encoder is deterministic their files and hashes are
  byte-identical (only `wall-color.53c126ea.ktx2` changed).
- **Budget:** the first download (the two colour maps the finish loads) is now 8,074,954 bytes,
  against 25 MB; texture memory is unchanged (the GPU format and size are the same).
- **Measured on the GPU (GTX 1650, production build):** C12 wall colour 0.9872 (was 0.9746), floor
  colour 0.9925 (unchanged); block-artefact index 1.18 and 1.15. C12 passes.
- **Equivalence check:** content, exposure, citations, ease and navigation: unchanged (a texture
  encode, the same in every room). Tradition salience: unchanged (one plaster for the whole museum).

## DR-045: Plates on Identical Reading Stands Instead of the Wall Above Empty Plinths (Adopted under the lead's delegation; package 3D-3; methodologist sign-off with DR-021 before any participant data)

- **Context:** every exhibit was a 1.2 x 0.6 x 1.4 m white plinth with the plate on the wall above
  it (1.55 to 2.35 m). The review found the plinths read as "objects missing" and the museum as an
  unfinished greybox. The lead allowed replacing them with simple, identical lectern stands for the
  plaques, **if it improves legibility**, with no decorative props near the knowledge, identical in
  every wing, and nothing tradition-specific.
- **Options:**
  1. Keep the plinths. Rejected: the finding stands, and the plate is 1.95 m from where the visitor
     stops.
  2. A sloped lectern desk (plate tilted 30 degrees, about 1.1 m high). Rejected on geometry: the
     scene's planes are axis-aligned, and a desk-angle plate is foreshortened from across a room,
     where the sequence order ("Step n of N") must stay readable (DR-043).
  3. No plinth, the plate lower on the wall, the approach point moved to it. Rejected: it changes
     every approach point and so the walking routes and times, the measured navigation of DR-043.
  4. **An upright reading stand at the front of the same footprint (chosen).**
- **Decision (rule set `knowledge-to-space-default` version 4, `layout.exhibitMount: "stand"`;
  `spatial-compiler@1.4.0`, `LAYOUT_VERSION grid-wings@4`):**
  - The plate (the same 1.0 x 0.8 m plate, the same lettering) stands on a 40 mm plaster board at
    the front face of the exhibit footprint, its edges at 1.15 and 1.95 m (centre 1.55 m, near the
    1.62 m eye height). The board overhangs the plate by 30 mm and sits on a 360 x 240 mm pedestal
    on the F8 recessed toe, in the plinth's plaster and tint (finish F8b,
    `src/components/museum/three/resources.ts`). One size for every exhibit, room and wing.
  - The footprint in plan, the exhibit position, the approach point, every room and doorway and the
    spawn are unchanged (asserted byte-for-byte against the plinth mount in
    `tests/unit/immersive/reading-stand.test.ts`), so every walking route, collision and arrival is
    the same. Only the footprint's height changes (to the board's top, 1.98 m), and floor contact
    shading comes from the pedestal instead of the plinth.
  - The plate lettering keeps its size: the type is sized for at least the wall plates' farthest
    approach distance (`PLATE_TYPE_MIN_DISTANCE` 2.139 m in `placement.ts`); sized from the nearer
    stand distance it would have shrunk by a third and cancelled the gain.
  - The placement audit treats the board as the plate's backing; the plinth-below-panel rule now
    applies to wall-mounted plates only; doorway checks use the wall behind a stand. Rule sets
    v1 to v3 still compile plinths.
  - Rendering check C2 counts exact-black plate ink apart from crushed shadows, as it already did
    for exact-white plate paper (the darkest scene surface renders at about sRGB 35). At the approach
    point the larger plate's ink alone exceeded 0.5% (up to 0.72%, 12 of 98 views in the first run);
    the ink fraction is recorded (`maxPlateInkFraction`).
  - **Considered and not adopted: baked lighting variation** (for example scallops from downlights on
    the walls). It would put a pattern behind the plates, which is decorative detail near knowledge;
    it needs per-wall light maps (texture memory on low-spec machines); and no gate gains from it. The
    finish keeps the uniform wash, cove and contact shading of DR-023.
- **Measured (legibility):**
  - Geometry, all 254 exhibits (unit test): at the approach point the plate subtends at least 1.63
    times its former height and 1.59 times its width, and the title at least 1.55 times its angle.
    From each room's centre every plate subtends at least 1.05 times its former height; its area is
    larger for the median plate (1.17 times), and 6 plates near corners lose up to 2.4% of area
    because they are seen more obliquely.
  - Rendered, GTX 1650, production build, 1280 x 720, the same views before and after (the
    manifest switched in the database): plate height at the approach point 378 px (was 232.5 px,
    +63%), always fully in frame and clickable at its centre (23 of 23); from the 48 room-centre
    views, median height of plates visible at their centre 55.6 px (was 50.9 px), 197 visible
    plates (was 192); matched plate by plate, median 1.09 times, none smaller.
- **Measured (rendering, all checks C1 to C12 on the GTX 1650, production build, run
  `3d-3-stand-2`, 10 of 10 pass):** C1 0 changed pixels at 98 viewpoints; C1b 0 spikes; C2
  clipped at most 0.26%, crushed at most 0.14% (plate ink up to 0.57%), zone means within 3.2%;
  C2b wing entrance rooms 171.0 / 175.7 / 169.4 (8-bit luma), at most 2.2% from their average
  (limit 5%); C3 two tours of 24 rooms, p50 6.9 ms, p95 7.1 ms, p99 7.2 ms, max 20.9 and 27.8 ms,
  at most 107 draw calls and 53,403 triangles; C4 no frame over 50 ms, 17 programs before and after;
  C5 the six regenerated baselines reproduce with 0 differing pixels; C6 0 non-uniform, 0
  transparent; C8 restored and logged; C10 0 idle and 0 hidden frames; C11 102 geometries and 81
  textures before and after both tours, heap +0.15%, textures 42.7 MB and render targets 35.1 MB;
  C12 wall colour 0.9872, floor colour 0.9925; card titles at least 21:1, room plaques at 2.5 m at
  least 19.56:1.
- **Measured (low tier, first run):** Iris Xe with the CPU throttled x4, the same build: all ten
  checks pass; p95 20.8 and 27.5 ms (budget 33), p99 28.0 and 41.4 ms (budget 50), heap 103 MB
  (budget 250), textures 42.7 MB + 35.1 MB render targets (budget 192). Frames over 50 ms (allowed
  on this tier) 93 and 177, at most 173.6 ms.
- **Measured (ease, scripted novice walkthrough, GTX 1650, 1440 x 900, default controls only, the
  same script and targets as DR-043):** time to open the target 47.1 s (Ajrakh, was 52.0),
  32.5 s (Machilipatnam Kalamkari, was 32.4), 40.1 s (Sanganeri, was 39.8); the same clicks
  (7 / 6 / 7) and drags (5 / 0 / 1), no wrong turns. Quick parity run (1280 x 800, 3 traditions):
  99 checks, 0 failed; immersive flow e2e: 4 of 4 passed.
- **Equivalence check:** content: unchanged (the same plates, titles and lettering; claims are in
  the shared KnowledgeSheet). Exposure and timing: unchanged; every route and arrival is identical.
  Citations: unchanged. Ease: no new control; the click target is the stand and its plate. Natural
  navigation only: a 3D finish item; the 2D condition has no counterpart, as it has no plinths.
  Tradition salience: the stand is identical in every wing; the wing entrance means stay within
  2.2%. Telemetry: no change.
- **Consequences:** a new manifest in the dev database (`01a142ea-b29b-7654-be07-1f2fd1bf4a6c`,
  valid) and the draft demo study `demo-review-walkthrough` re-pinned to it. The six C5 baselines
  were regenerated (every room view changed) and accepted by eye; they need the same human review as
  before (the previous set is kept in the 3D-3 scratch folder). `docs/architecture/spatial-compiler.md`
  should describe `layout.exhibitMount` (outside this track's files; a change is requested).
- **Paper implications:** the Methods describe each exhibit as a plate on a reading stand at a
  fixed height and distance, identical across traditions.

## DR-046: Integration of the Final Fix Tracks: Figure Balance per Layer and the Museum's Device Backstop (Adopted under the lead's delegation; merge of the back-end and 3D tracks)

- **Context:** merging the back-end track (DR-025 to DR-042) and the 3D track (DR-024, DR-043 to
  DR-045) left open contract needs between them. Two are protocol choices:
  1. **Figure balance.** The parity engine's critical check `a.figures` balanced figures per
     section and claimed that this also balanced every knowledge layer. Under the one section map
     (DR-024) section 6, "Science and environment", holds the science types and environmental
     conditions, which `exposureLayerOf` counts in the overview layer. Two traditions could then
     have the same figures per section while one shows its figure in the Science layer and the
     other in Overview.
  2. **The museum's device backstop (study-01).** DR-029 added `reportMuseumUnavailable` for a GPU
     that fails after the device check passed, but nothing in the museum called it, and the museum
     still kept its own copy of the software-renderer rule.
- **Options (1):** (a) keep section balance only and correct the comment; (b) also require
  balance per layer; (c) split section 6 into two sections. (c) undoes DR-024's seven rooms per
  wing. (a) leaves a possible per-layer exposure difference unchecked.
- **Decision (1): (b).** `figureBalance` also counts figures per knowledge layer (by the layer of
  each figure's own concept type) and reports `figures_unbalanced_layer` in the same critical
  check. If an unbalanced section already explains a layer's imbalance, the layer is not
  reported a second time. On the curated content the three study traditions pass both rules
  (`tests/unit/research/parity-figure-balance.test.ts`, real content case: no issues).
- **Decision (2):** the museum takes `isSoftwareRenderer` and `museumCanRender` from
  `src/features/study/gpu-acceptance.ts`, so the device check and the museum apply one rule. In
  study mode its no-WebGL screen reports the failure once and follows the engine's outcome, as the
  device check does: excluded goes to `/study/complete?status=excluded` (the device check's own
  message, more specific than `ended`), and retry, reassigned or ignored go back to
  `/study/session`. While the report is pending the action reads "Recording this device" and is
  disabled. Demo and preview visitors are never reported.
- **Found at verification:**
  - A layout with no rooms crashed the museum to the framework's blank error page. The walking
    grid's bounds were infinite: `RangeError: Invalid typed array length: Infinity`. Under
    SwiftShader the no-WebGL screen had always hidden this; on the GPU the e2e fixture's placeholder
    manifest reached it. The museum now shows its designed failure screen ("The museum could not
    load", with the study's policy action) for such a layout. An activated study cannot have one,
    so participants are unaffected; staff previews and fixtures no longer crash.
  - The study-journey and telemetry e2e specs forced SwiftShader. Under the device rule above, an
    immersive participant on SwiftShader correctly stops at the device check. With `PW_GPU` set,
    the specs now keep the hardware GPU. The journey spec now also checks the step gate in both
    conditions: `/learn/<own condition>` redirects to the onboarding before learning and to the
    post-test after it, and the learning clock stays unset before the learning step.
- **Not adopted:** re-fetching figures inside a running museum when a photo is withdrawn
  mid-session. A study pins its release and its figures are frozen with it (DR-037), so in a study
  the figure set cannot change during a session; outside a study the difference lasts only until
  the next load.
- **Equivalence check:** content, exposure, citations and ease once a concept is open are
  unchanged. The layer rule can only make the two conditions' figure exposure more equal. It is a
  check on the content, which both conditions share. The backstop applies only to the immersive
  condition, because only that condition can fail on graphics. It applies the same policy as the
  device check, which runs before allocation is revealed. Tradition salience is unchanged. The
  only new telemetry is the existing `study.webgl_failed` journal entry, which is now reachable.
- **Paper implications:** report figure balance as "equal per section and per knowledge layer
  across the study traditions". Report runtime WebGL failures under the preregistered failure
  policy, with their count per condition.

## DR-047: Compared Concepts Are Listed in the Canonical Tradition Order in Both Conditions (Adopted under the lead's delegation; final review equivalence-compared-concepts-order)

- **Context:** the "Compared Concepts" block of a comparison concept's sheet listed the traditions in
  a different order in each condition. The 2D page sorted them into the canonical order (DR-019:
  Ajrakh, Machilipatnam Kalamkari, Sanganeri). The 3D panel kept the content file's order, and
  `content/comparisons.json` lists Sanganeri before Machilipatnam Kalamkari in 9 of 11 comparisons.
  The sheet text of every such hall exhibit therefore differed between conditions (P5), and so did
  the order in which the traditions were named, which is a salience difference. The review's
  sheet-by-sheet sweep (92 concepts, 125 layer views) found exactly these differences.
- **Options:** (a) sort in the 3D panel; (b) keep the content order in both. (b) would break DR-019
  (one canonical order on every list) in 2D as well.
- **Decision: (a).** `byCanonicalTradition` moved to the shared `src/features/learning/labels.ts`,
  and both conditions use that one helper: the 2D `scopedComparisons`, the 3D `toPanelConcept`
  (the Compared Concepts block) and the 3D Compare layer, which was already sorted. The order is
  stable within a tradition, as in 2D.
- **Test:** `tests/unit/immersive/panel-content.test.ts` ("compared concepts follow the canonical
  tradition order") gives `toPanelConcept` every comparison of the fixture in the file's order and
  reversed, and requires the 2D rule's result and non-decreasing canonical ranks. Without the fix
  it fails (`bagru.comparison.bagru-vs-sanganer`).
- **Equivalence check:** (1) content: the same compared concepts, now in the same order; (2)
  exposure: unchanged; (3) citations: unchanged; (4) ease: unchanged; (5) navigation: unchanged;
  (6) tradition salience: now equal (the same order in both); (7) telemetry: nothing new.

## DR-048: Tradition Knowledge Appears Only in the Shared Sheet; the 2D Tradition Page Is a Navigation Page (Adopted under the lead's delegation; final review equivalence-tradition-page-extra-facts)

- **Context:** the 2D tradition page showed tradition knowledge that the 3D condition never shows:
  "Also known as" (five names), a detailed region, the GI status and a "Geographical Indication
  record" (application number, year, sources). The landing cards showed each tradition's state and
  country. The page also showed the tradition's overview claims inline, outside the KnowledgeSheet
  (no layer tabs, references after them), on every tradition visit. In 3D the same concept is
  reached only by opening its exhibit in the Tradition and Context room, whose sheet carries
  Tradition, Category and Local terms. Some names and places were therefore visible to 2D
  participants only.
- **Options:** (a) drop the metadata, the GI record and the inline claims from the 2D pages, and
  list the overview concept as a concept to open; (b) add the same rows to the shared sheet's
  metadata in both conditions. (b) adds facts to the sheet that are not claims: they carry no
  numbered citation, so they would be uncited text in the study content (every statement shown is
  a sourced claim), and the sheet's lean metadata (lead decision: only what aids learning) would
  grow in both conditions.
- **Decision: (a).** The 2D tradition page shows the tradition's name, then the seven section
  disclosures. The tradition's overview concept is the first link of section 1, Tradition and
  Context, and opens in the shared sheet, exactly as its exhibit stands first in the museum's
  Tradition and Context room (the compiler places tradition concepts first). The 2D index and
  rail list it there too (`sectionConcepts`). The landing cards carry the tradition's name only,
  as the museum's lobby directory does. The page is a navigation surface for as long as it is
  shown. The tradition record's alternative names, region and GI data stay in the content and in
  the research console; neither condition shows them.
- **Tests:** `tests/unit/immersive/section-map.test.ts` now requires the 2D section 1 to start
  with the tradition concept and each wing room to hold exactly the concepts of the same 2D section
  (the earlier special case for the tradition concept is gone). Live on the production build:
  the 2D tradition page shows no "Also known as", GI or region text, its section 1 opens with
  "Kutch Ajrakh (Ajrakh Resist Block Printing)", and the landing cards read the three tradition
  names only.
- **Equivalence check:** (1) content: the same knowledge in both, only through the shared sheet;
  (2) exposure: the overview claims count as exposure only with the sheet open, in both (DR-050);
  (3) citations: unchanged (the sheet's markers); (4) ease once a concept is open: unchanged; one
  click in 2D reaches the overview claims, as opening the exhibit does in 3D; (5) navigation:
  only the route to the concept changed; (6) tradition salience: the cards and pages are the same
  for every tradition (no region line whose length differed by tradition); (7) telemetry: the
  overview concept's visit is now a concept page visit with `concept_encountered`, as an exhibit
  open is in 3D.

## DR-049: The 2D Comparisons Page Lists the Aspects; No Claims Are Juxtaposed Across Traditions (Adopted under the lead's delegation; final review equivalence-comparisons-juxtaposition)

- **Context:** the 2D Comparisons page stacked every compared concept's full claims, figures and
  references for all three traditions, aspect by aspect, on one scrolling page. The 3D condition
  has no counterpart: a hall exhibit's sheet shows the comparison's own claims and the shared
  Compared Concepts block (titles only), and its Compare layer shows one compared concept at a
  time. A 2D-only juxtaposition aids exactly the comparison and transfer outcomes being measured,
  and it breaks the "one focus" cognitive-load rule both sheets follow. An earlier record had
  called the page a navigation page outside the measured view, which did not match a page that
  renders claims.
- **Options:** (a) reduce the 2D page to a list of aspects, each opening its comparison concept's
  sheet, as a hall exhibit does; (b) build an equivalent juxtaposition in 3D. (b) adds a 3D view
  that shows several concepts at once, against the concept note's §7 Pathway B ("information
  should be progressively disclosed") and the one-focus rule, and it would change the 3D sheet,
  which is shared.
- **Decision: (a),** citing §7 "progressively disclosed". The page is now the 2D counterpart of
  the Comparison Hall: a list of the aspects compared (44 px row links, no claim text, no counts,
  no tradition headings). It is a navigation surface for as long as it is shown. The compared
  concepts' claims are reached one concept at a time, through the comparison sheet's Compare layer
  or a link, in both conditions. `ExposureGroup` (several exposure regions on one page) is removed
  with it.
- **Parity suite:** P26's 2D part now measures the comparisons page's aspect rows (all with the
  same type and colour) and requires that no tradition is named or marked in the page's own column
  (the spread's index beside it names every tradition equally and is measured as "index rows").
  The quick parity run (PARITY_QUICK=1, three traditions, 1280 x 800 light, GTX 1650) passed after
  this change; a quick run does not write the report, so the run of record (a757d85) is unchanged
  and is now out of date for P26's wording. Live: the page lists 12 aspects and renders no
  statement list. A re-run of the review's sheet sweep over the hall (12 exhibits, 24 layer
  views, 2D page against 3D panel) found no difference (DR-047).
- **Equivalence check:** (1) content: the same claims, reached the same way; (2) exposure: claims
  count only in a sheet, in both (DR-050); (3) citations: unchanged; (4) ease: one comparison at a
  time in both; (5) navigation: the page is navigation only; (6) tradition salience: no tradition
  headings, so none is promoted; (7) telemetry: comparison claims are logged as concept visits in
  both, never as a page-level group.

## DR-050: One Exposure Rule for Both Conditions, Defined on the Shared Sheet (Adopted under the lead's delegation; final review equivalence-exposure-rule, blocker)

- **Context:** content exposure (`time.exposure_total_ms`, `time.navigation_ms`, the `nav.*` visit
  metrics, the stall cue) followed a different rule in each condition. In 2D it ran only while at
  least half of the claims region, or half the viewport, was in view. In 3D it ran whenever the
  panel was open, wherever the panel was scrolled, and also while the full Plan was open over it.
  Measured by the final review on the :3300 production build at 1280 x 800 for
  `ajrakh.process_stage.saaj`: on opening the 2D page the claims region spanned 531 to 1252 px of
  an 800 px viewport (37% of the region, 34% of the viewport visible), so 2D logged navigation
  (`menu`) while the first claim and Fig. 1 were on screen; the reference list and Related
  Concepts counted as navigation in 2D and as exposure in 3D. data-and-telemetry-layer.md §4c and
  condition-equivalence E3 stated the rules were the same; no parity check measured it.
- **Options:** (a) "sheet open" in both: exposure while the concept's KnowledgeSheet is open and
  no navigation overlay covers it, wherever it is scrolled; (b) the in-view rule in both, applied to
  the claims region inside each sheet's scroll container. (b) makes exposure depend on layout
  geometry, which differs between a page placement and a docked panel (title, metadata, tabs and
  sequence list push the claims down by different amounts), so the same reading would still be
  timed differently; it also treats the sheet's own references and related concepts as
  navigation, although they are the sheet's content in both conditions. (a) is decided by the
  learner's actions only (open, cover, close), which are the same in both.
- **Decision: (a).** `useSheetTiming` (`src/features/telemetry/client/sheet-timing.ts`) is THE
  rule and its only implementation; both conditions call it. 2D: the sheet is open while the
  concept page is shown; the overlays are the StudyBar's Contents and Search sheets (navigation
  `menu`). 3D: the sheet is the open panel; the overlay is the full Plan dialog (navigation `map`).
  The minimap beside the panel is not an overlay, as the 2D rail and index beside the sheet are
  not. Pages without a sheet (catalogue, tradition, category and comparisons lists, search) are
  navigation. The 2D in-view machinery (IntersectionObserver, 50% threshold) is removed.
- **Addendum (minor equivalence-layer-telemetry-asymmetry):** every 3D panel open logged
  `information_layer_opened` (overview) and every close `information_layer_closed` (openMs), while
  a 2D concept page logged them only on a tab switch, so 3D had extra layer events and openMs data
  by construction. The 2D sheet now logs the same pair when the concept page is shown and left
  (deferred one task, as `page_exited`, so React Strict Mode's simulated remount logs nothing), and
  the 3D panel logs `concept_encountered` before the layer, the 2D order.
- **Tests:** `tests/unit/telemetry-client/sheet-timing.test.tsx`: the rule's truth table; both
  conditions call `useSheetTiming` and neither uses an in-view rule or the bare exposure hook; the
  same scripted sequence (open, cover, uncover, close) gives identical exposure and navigation
  intervals through the 2D region and the 3D binding. `tests/unit/learning-2d/learning-2d.test.tsx`:
  exposure starts on mount with no navigation interval; Contents over the page counts as
  navigation; the 2D sheet logs one opened/closed pair per visit with openMs. New e2e parity check
  `tests/e2e/exposure-parity.spec.ts`: the same script on the same concept in both conditions on
  the production build.
- **Result (production build on :3300, full Chromium on the GTX 1650, 1280 x 800, demo session,
  `ajrakh.process_stage.dhori-gach`, the first station of the Ajrakh process room):** both
  conditions logged exposure -> navigation (overlay) -> exposure -> navigation (after Close), the
  same seven interval events. Navigation surfaces: 2D `menu` (Search) then `catalogue` (the
  section page Close leads to); 3D `map` (the full Plan) then `map` (walking with the minimap
  shown). Exposure activeMs: first interval (3 s at the top plus 3 s scrolled to the reference list
  and Related Concepts) 2D 6006, 3D 6149; second interval 2D 2076, 3D 2079 (second run; the first
  run gave 6011/6166 and 2114/2071). Under the old rule the 2D page logged no exposure at all in
  the first 3 s.
- **Documents updated:** data-and-telemetry-layer.md §4c, condition-equivalence E3,
  learning-2d L4 (superseded), the metric definition of exposure, the telemetry event
  description, the research console's labels ("sheet open"), DESIGN.md 11.5.
- **Equivalence check:** (1) content: unchanged; (2) exposure: now one rule, so equal by
  construction; navigation is timed by the same rule's complement; (3) citations: opening a
  citation is inside the sheet, exposure in both; (4) ease: unchanged; (5) navigation: unchanged;
  (6) salience: unchanged; (7) telemetry: the definitions of exposure and navigation changed for
  2D (more exposure, less `menu` navigation on concept pages). No participant data exists yet
  (methodologist sign-off pending with DR-021), so no recorded session is affected.
- **Limitation for the paper:** "exposure" is time with a concept's sheet open and uncovered; a
  learner may look away while a sheet is open, in either condition alike.

## DR-051: The Museum's Pause Button Is Hidden in Study Builds (Adopted under the lead's delegation; final review equivalence-pause-control-3d-only)

- **Context:** the 3D StudyBar had a Pause button with no 2D counterpart. Pausing stopped the
  telemetry intervals (a 3D-only pause category), while the server-clock learning budget kept
  running, under a screen reading "The museum is paused. Nothing moves until you resume." Concept
  note §7 Pathway B: "unnecessary controls should be removed".
- **Decision:** study builds hide Pause, as they hide Mouse look (DR-021/DR-023 Addendum). The
  public demo and staff preview keep it. Controls help, a lost graphics context and a hidden tab
  still pause timing in study builds, the last in both conditions.
- **Test:** `tests/unit/learning/study-bar-groups.test.tsx` (Pause hidden in a study build, shown
  in the demo).
- **Equivalence check:** (1) to (4) unchanged; (5) one 3D-only control fewer; (6) unchanged; (7) no
  3D-only pause time in study sessions.

## DR-052: Both Practices Train the Same Knowledge-Sheet Controls (Adopted under the lead's delegation; final review equivalence-practice-sheet-controls)

- **Context:** with onboarding off in both conditions, the familiarisation practice (D5) is the
  only training. The 2D practice had participants switch tabs, open a citation, Enlarge a figure,
  follow a link and use Previous and Next. The 3D practice room had no figure, and its instruction
  named only "an exhibit and a citation number", so 3D participants met Enlarge and the lightbox
  for the first time during the task.
- **Decision:** the practice diagram is one shared definition
  (`src/features/learning/practice-figure.ts`). The 2D practice sheet keeps it, and the practice
  room shows it on Practice step 2, a station with Previous and Next, after its second statement,
  in the same shared KnowledgeFigure frame. Each instruction is a navigation part (different by
  design: navigation is the manipulated variable; the 3D part names the key map and the three look
  methods) followed by the same sheet part, word for word (`PRACTICE_SHEET_CONTROLS`: "switch its
  tabs, open a citation number and Enlarge under the figure, follow a link, use Previous and Next,
  then Close it."). This replaces the earlier "within 10% of words" convention for these two
  strings, which cannot hold once the 3D line names its look methods and the same sheet controls.
- **Tests:** `tests/unit/immersive/practice-room.test.ts` (both instructions end with the same
  sheet words naming every control; the practice room carries the diagram on the station).
- **Equivalence check:** (1) content: practice only, no craft content; (2) exposure: practice is
  outside learning time in both; (3) citations: the same practice source; (4) ease once a concept
  is open: both trained on the same sheet controls; (5) navigation: unchanged; (6) salience:
  unchanged; (7) telemetry: practice is outside the metrics.

## DR-053: Museum Wayfinding Fixes From the Novice Walkthrough (Adopted under the lead's delegation; final review novice-3d findings)

Navigation-only changes in the 3D condition (the manipulated variable). They remove handicaps a
novice met, and none touches the sheet.

- **Enter cues fire on entering only** (novice-3d-wing-cue-fires-on-leaving). A wing announcement
  ("Entering <tradition>") and a doorway threshold fired whichever way the visitor crossed the
  doorway, so walking back to the lobby announced the wing again, the note stayed in the lobby, and
  each false firing logged `guidance_cue_used` "shown", inflating 3D guidance telemetry. Each
  enter cue now carries the room it leads into (`SceneCue.enterRoomId`: the dependent exhibit's
  room for a threshold; the room holding the cue's concept, else the tradition side of the door,
  for a wing announcement) and fires only on crossing into it (`enterCuesOnCrossing`). Test:
  `tests/unit/immersive/wayfinding.test.ts` (every wing announcement fires entering its wing and
  never entering the lobby; every threshold fires entering the dependent's room; no enter cue fires
  both ways).
- **Movement keys after a bar or rail click** (novice-3d-arrow-keys-dead-after-bar-buttons). The
  whole StudyBar and the rail swallowed arrows and WASD, so after clicking Plan or In This Room the
  visitor could not turn or walk until they clicked the scene. The bar and the rail are now
  regions whose plain toggles, heading and Hide button let the movement keys through; controls
  that use arrows themselves (the rail's rows, a menu, a popup trigger, a dialog) and the panel,
  the Plan and the screens keep them (`src/components/museum/keys.ts`). Test:
  `tests/unit/immersive/museum-keys.test.tsx`.
- **"Leads To" names the doorways as their signs do** (novice-3d-rail-leads-to-indistinguishable).
  The lobby rail listed "Tradition and Context" three times and "Comparison Hall" twice. Rows are
  now built from the doorway signs' own label function: the section number ("1. Tradition and
  Context") and, when the doorway changes zone, the tradition as the row's detail; the wings are in
  the canonical tradition order; two doorways into the same room are one row.
- **Category signs are never cut** (novice-3d-category-signs-truncated): a name wider than its sign
  is set smaller to fit on its one line, as the directory rows are, instead of ending in an
  ellipsis ("Geography and…").
- **The full Plan's drawing walks to the room clicked** (novice-3d-plan-drawing-not-clickable), as
  its description says; the list stays the keyboard and screen-reader path.
- **Verified live** (production build on :3300, GTX 1650, 1280 x 800, demo): the lobby's "Leads
  To" reads "1. Tradition and Context" with each tradition as its detail, three rows in the
  canonical order, then "8. Comparison Hall" (one row for its two doorways); entering the Ajrakh
  wing raised "Entering Ajrakh Resist Block Printing (Kutch Ajrakh)" and walking back raised no
  note (none in the lobby after 6 s; one `guidance_cue_used` "shown" in the whole walk); holding
  ArrowRight for 500 ms turned the view by 0.82 to 0.89 rad with focus on the scene, on the bar's
  In This Room button after Hide, on the rail's heading, and on the Plan button; a click on the
  Sanganeri Tradition and Context room in the full Plan's drawing closed the dialog and walked
  there; the commons sign reads "Production Outcomes" in full.
- **Open (not changed here):**
  - "Start" and "Last step" are still lettered at the plates' base size (about 3 to 4 px from the
    room centre). On the 1.0 x 0.8 m plates the step line is 0.099 m; "Step 14 of 14 · Last step"
    at that size needs about 1.3 m, so it cannot join the step line, and a footer at that size
    costs a title line (titles would then end in an ellipsis, which knowledge labels must not).
    Both conditions' rails show the step numbers; the fix needs a plate layout change measured on
    the GTX 1650 (3D track).
  - The minimap can cover a plate's bottom-left corner while a panel is open; the framing inset
    does not include it yet (3D track, measured fix).
  - The plan drawing does not label the wings with their traditions (hover titles in the full
    plan; the list names them).
  - Heading cost at the spawn (equivalence-hub-turn-cost): DR-043 equalised walking distance (5.85
    m to each wing door), not heading. With the keyboard, Machilipatnam Kalamkari is a 180-degree
    turn away against 90 degrees for the other two (about 6.3 s against 5.3 s from the visitor's
    turn and walk speeds, a calculation, not a measurement). Until free-navigation times are
    measured, the first wing entered and the time to each wing's first room are reported as
    covariates with DR-043.
- **Equivalence check:** (1) content: unchanged; (2) exposure: unchanged (navigation only); (3)
  citations: unchanged; (4) ease once a concept is open: unchanged; (5) navigation: each change
  makes 3D navigation more natural and handicaps neither condition; (6) salience: the "Leads To"
  rows name the three wings in the canonical order, with the same row form; (7) telemetry: fewer
  false `guidance_cue_used` "shown" events; no new event.

## DR-054: Always-On Invite Gate and Deployment Source Changes for Vercel (Adopted under the lead's delegation; deployment preparation, nothing deployed)

- **Context:** the platform is to run on Vercel with RDS and S3 in `ap-south-1`
  (docs/deploy/RESEARCH.md, RUNBOOK.md). The lead's rule is that the site is **always
  invite-only, with no open mode**. Vercel cannot provide that: Password Protection is a paid
  add-on that Hobby lacks, and Vercel Authentication admits only Vercel team members
  (RESEARCH.md s15). RESEARCH.md s13 also lists source changes S1 to S12 that the deployment
  needs; S4 (`@vercel/functions`) and OIDC for S3 (`@vercel/oidc-aws-credentials-provider`) add
  dependencies and wait for the lead's approval.
- **Options (gate):**
  1. A shared site password in an environment variable. Rejected: one secret for everyone, no
     per-cohort revocation or use counts, and a change needs a redeploy.
  2. An "open mode" switch for demos. Rejected: the lead ruled it out, and a switch left on would
     expose the study.
  3. Invite codes in the database, administered in the console, redeemed once into a signed
     cookie. **Adopted.**
- **Decision (gate, S11):**
  - Admin -> Access (`admin.users`) creates codes with a label, an optional use limit, an
    optional last day and an optional study; lists them with their use counts and status; and
    revokes them with a typed confirmation. Every create and revoke writes an audit row (with the
    code's 4-character hint, never the code).
  - Codes are 20 Crockford base32 symbols (100 random bits). Only a SHA-256 of the normalised code
    is stored (migration 0020, `invite_codes`), so a code is shown once, at creation. Redemption
    is one conditional `UPDATE` (not revoked, not expired, under the limit), so concurrent
    redemptions cannot exceed the limit, and a refusal never says why.
  - `?invite=<code>` on any gated URL, or the `/invite` form, sets a signed (HMAC, purpose
    `site-invite/v1`, `BETTER_AUTH_SECRET`), httpOnly, SameSite=Lax cookie (`__Host-` and Secure
    in production) valid for 30 days, then returns to the same URL without the code.
  - `src/proxy.ts` now matches every path except `/api` (other than `/api/auth`), `/_next/static`,
    `/_next/image`, `/museum` and the root files, verifies the cookie's signature without a
    database round trip, and redirects to `/invite?next=...` (403 for non-GET). Exempt:
    `/invite`, `/sign-in`, `/sign-out`, `/forbidden`, `/console`, `/api/*` (their handlers already
    refuse callers without a participant, demo or staff session) and static assets. Staff pass
    with a session cookie; staff areas still redirect to `/sign-in`.
  - Server-side half: `enterStudy` and `startPublicDemo`, the only actions that create a study or
    demo session, call `requireSiteAccess`: a verified staff session, or a verified invite
    cookie whose code is not revoked. So a forged staff cookie or a revoked code can never start
    a session.
  - **Revocation** applies at once to new redemptions and to browsers that already used the code
    (at their next study or demo start). **Expiry** only ends redemption: a cookie issued before
    the last day stays valid for its 30 days, so a participant is not shut out mid-session when
    a cohort's sign-up window closes.
  - **Study links** carry the invite: creating a code for a study shows the participant link
    `/study?code=<slug>&invite=<code>`, so participants see no extra step. The gate sits before
    consent and allocation and is identical in both conditions.
- **Decision (other source changes):**
  - **S3:** `DATABASE_CA_PEM` (required in production on an `.rds.amazonaws.com` host). When it is
    set, the pool and the dashboard's LISTEN connection strip `sslmode`/`sslrootcert` from the URL
    and pass `ssl: { ca, rejectUnauthorized: true }`, because node-postgres lets URL parameters
    override an explicit `ssl` object. Without it, nothing changes locally.
  - **S1:** the dashboard stream declares `maxDuration = 300` (the Hobby maximum) and closes itself
    15 s before it; EventSource reconnects after `retry: 3000`, and the `ready` fingerprint
    catches changes made in between.
  - **S5:** in production, media storage refuses to run without the `MEDIA_S3_*` keys instead of
    falling back to Vercel's placeholder `AWS_*` values. `AWS_ROLE_ARN` alone is refused too,
    until OIDC is approved and wired.
  - **S6/S7:** `images.localPatterns` limited to `/figures/**` with no query, `minimumCacheTTL`
    60 s (figures were already `unoptimized`); `/figures/<id>` now answers `private` instead of
    `public`, so no shared cache serves a licensed image past the gate; content-hashed museum
    textures are `public, max-age=31536000, immutable`.
  - **S8** `!.env.production.example` in `.gitignore`; **S9** a root `.vercelignore`; **S10**
    `engines.node` `24.x`; **S12** `APP_BUILD_VERSION` defaults to the short
    `VERCEL_GIT_COMMIT_SHA` when it is unset (an explicit value still wins).
  - **Not done:** S4 and OIDC (dependencies awaiting approval); S2 was already in place.
- **Consequences:** every Playwright spec now needs an invite. `tests/e2e/global-setup.ts`
  creates one `Demo:` code per run in the development database and writes a storage state with
  the signed cookie. Specs that test the gate itself must start from an empty storage state.
  Rotating `BETTER_AUTH_SECRET` also signs out every invite cookie. The production
  `APP_BUILD_VERSION` set by hand (RUNBOOK step 7) should be removed so S12 applies.
- **Equivalence check:** the gate is condition-blind: it runs before consent and allocation, both
  conditions are behind the same cookie, and no learning page, telemetry event or knowledge
  content changed. The checks of the 7-point 2D/3D list are unaffected; the parity and e2e suites
  must be rerun after merge with the new global setup.
- **Paper implications:** report that access was by invitation (codes per cohort, revocable),
  identical for both conditions and before consent, and that no personal data is collected by the
  gate (codes are hashed; the cookie holds only the code's row id).

## DR-055: Neon Free Postgres in Singapore and Cloudflare R2 for Media as the Lead's Default; the Provider Stays the Deployer's Choice (Decided by the lead; deployment preparation, nothing deployed)

- **Context:** DR-054 planned Vercel with RDS and S3 in `ap-south-1`. The lead then
  chose "a free hosted Postgres such as Neon, which needs no AWS for now". The first deployment is
  a Vercel CLI deploy on the Hobby plan. Vendor facts below were read on the vendors' pages on
  2026-10-16 (notes: scratchpad `neon/neon-facts.md`, `code-compat.md`, `media-storage.md`).
- **Database: Neon Free.**
  - Plan: "$0/month"; "1 GB/project"; "100 CU-hours/project/month (enough to run a 0.25 CU
    compute in a project for 400 hours/month)" (https://neon.com/docs/introduction/plans).
  - "Scale to zero is always enabled (computes suspend after 5 minutes of inactivity) and can't
    be disabled"; a suspended compute "reactivates automatically within a few hundred
    milliseconds" (https://neon.com/docs/introduction/scale-to-zero).
  - Backups: Free has "History window: 6 hours (1 GB limit)" and no instant restore
    (https://neon.com/pricing). So the team keeps its own `pg_dump` exports of study data.
- **Region: AWS Asia Pacific (Singapore), `aws-ap-southeast-1`; Vercel functions in `sin1`.**
  - Neon has no region in India. Its region list names "AWS Asia Pacific (Singapore) —
    `aws-ap-southeast-1`" and says "You cannot change the region" after creation
    (https://neon.com/docs/introduction/regions).
  - Vercel: "| sin1 | ap-southeast-1 | Singapore |" (https://vercel.com/docs/regions); Hobby may
    use a "Single region" (https://vercel.com/docs/functions/configuring-functions/region).
    `vercel.json` `regions` is now `["sin1"]` (was `bom1`).
  - **Ethics:** participant data would be stored in Singapore, outside India. The repository
    promises no storage location to participants (see Consequences), but the CXA/ETH/01 file and
    the consent text the team enters must agree with this.
- **Code changes (minimal):**
  - **Pooled vs direct URL.** Neon's pooler is "PgBouncer in transaction mode
    (`pool_mode=transaction`)", and "`LISTEN` / `NOTIFY`" is "Not supported with pooled
    connections" (https://neon.com/docs/connect/connection-pooling). New optional
    `DATABASE_URL_UNPOOLED` (Neon's own name: "| `DATABASE_URL_UNPOOLED` | Direct connection
    string |", https://neon.com/docs/guides/vercel-managed-integration). The app pool keeps the
    pooled `DATABASE_URL`; the dashboard LISTEN connection (`dashboard-service.ts`), the `db:*`
    scripts (`scripts/db/_shared.ts resolveDatabaseUrl`) and `drizzle.config.ts` use the direct
    URL ("| Schema migrations | Direct | Tools may not support transaction pooling |", same
    page). In production `src/lib/env.ts` requires it when `DATABASE_URL` has `-pooler.` and
    refuses a pooled value in it.
  - **TLS.** "Neon requires that all connections use SSL/TLS encryption" and recommends
    `verify-full` (https://neon.com/docs/connect/connect-securely). `sslmode=require` or
    `verify-full` both verify in node-postgres (pg-connection-string treats `require` as
    `verify-full`); the RDS CA rule (`DATABASE_CA_PEM`) still applies only to
    `.rds.amazonaws.com` hosts.
  - **pgvector 0.8.6.** Neon's PostgreSQL 18 ships 0.8.6 ("| pgvector | 0.8.0 | 0.8.0 | 0.8.0 |
    0.8.0 | 0.8.6 |", https://neon.com/docs/extensions/pg-extensions); the pin was 0.8.7.
    `EXPECTED_DB` now accepts both: the schema only installs the extension
    (`db/migrations/0000_enable_extensions.sql`) and has no vector column or index.
- **Media: Cloudflare R2, private bucket (no AWS).**
  - Free tier "10 GB-month / month" storage, egress "Free"
    (https://developers.cloudflare.com/r2/pricing/); "By default, buckets are never publicly
    accessible" (https://developers.cloudflare.com/r2/buckets/public-buckets/); "the region for
    an R2 bucket is `auto`" (https://developers.cloudflare.com/r2/api/s3/api/).
  - The existing S3 adapter already takes `MEDIA_S3_ENDPOINT` and path-style addressing; the CSP
    already derives the endpoint origin. One change: R2's checksum table lists SHA-256 only for
    multipart uploads (same S3 API page), so `HeadObject` may return no single-part SHA-256 and
    every upload would fail `checksum_mismatch`. `finalizeAssetUpload` now hashes the stored
    object on the server when the store reports none (`storedSha256`, bounded by the type's size
    limit). Figures still stream through `/figures` with the 768 px licence cap unchanged.
  - Rejected: Vercel Blob (new SDK and a third adapter), Postgres `bytea` (migration, database
    growth on a 1 GB plan), `public/` (bypasses licence gating).
- **Invite gate before CLI deploys.** `vercel.json`'s `ignoreCommand` is documented for Git
  commits ("for every commit pushed to your connected Git repository",
  https://vercel.com/docs/project-configuration/project-settings), so it is not relied on for
  `vercel deploy --prod`. `buildCommand` now runs `scripts/deploy/invite-gate.ts --if-production`
  before `npm run build` on every Vercel build, and preflight FAILs in production on the same
  check.
- **Not verified (needs a live test on Neon):** whether `pg_notify` from triggers through the
  pooled connection reaches the LISTEN on the direct connection (expected: NOTIFY is sent at
  commit inside the writer's transaction); whether an idle LISTEN connection keeps the compute
  awake (it would spend CU-hours); whether R2 accepts the signed `x-amz-checksum-sha256` header
  on a presigned PUT.
- **Consequences:** no participant-facing text in the repository names a storage location; the
  privacy page does not either, while the about page says it "describes what the platform
  records and where" (a gap, not a contradiction). The real consent text is entered per study in
  the console and must be checked by the team against Singapore storage. DR-054's "RDS and S3 in
  `ap-south-1`" no longer describes the first deployment; `docs/deploy/aws-resources.md` stays
  for a later move to AWS.
- **Equivalence check:** infrastructure only; both conditions read the same database and the same
  media store. No learning page, telemetry event or knowledge content changed.
- **Paper implications:** report the hosting (Vercel `sin1`, Neon `aws-ap-southeast-1`,
  Cloudflare R2) and that study data were stored in Singapore.
- **Addendum (integration of the prepared branches): the provider stays the
  deployer's choice.** The lead: "let him [Ankit] choose, he might choose AWS". The deploy kit no
  longer assumes Neon. `scripts/deploy/lib/topology.ts` detects the setup from the production env
  file, and preflight checks each provider as it is: RDS needs `ap-south-1`, functions in `bom1`
  and `DATABASE_CA_PEM`; Neon needs the function region of its region (`sin1` for
  `aws-ap-southeast-1`) and `DATABASE_URL_UNPOOLED`; R2 needs region `auto` and path-style
  addressing; AWS S3 needs the bucket in the database's region. `vercel.json` carries one
  `regions` value, `sin1` for the lead's Neon choice. Preflight prints the value the configured
  database needs and FAILs in production on a mismatch, so a deployer who picks RDS sets
  `"regions": ["bom1"]` and commits it before deploying. If RDS is chosen, the paper reports Mumbai
  (`bom1`, `ap-south-1`) instead of Singapore.

## DR-056: Playwright GPU Split: Low-Spec on the Intel GPU, Everything Else on the NVIDIA GPU (Adopted)

- **Context:** this laptop has an NVIDIA GeForce GTX 1650 and an Intel Iris Xe. Windows' per-app
  GPU preference (HKCU\Software\Microsoft\DirectX\UserGpuPreferences) picks the GPU per browser
  executable and overrides Chromium's `--force_low_power_gpu` / `--force_high_performance_gpu`.
  The full Chromium build is set to the NVIDIA GPU (`GpuPreference=2;`) and the headless shell to
  the Intel GPU (`GpuPreference=1;`). So `PW_GPU=low`, which only added `--force_low_power_gpu` to
  the full build, could not reach the Intel GPU. Also, the default run (no `PW_GPU`) rendered
  every spec in software (SwiftShader), and no run checked which GPU it actually used.
- **Options:** (a) keep the `PW_GPU` switch and only record the renderer; (b) one Playwright
  project per GPU, with the browser build chosen to match the per-app preference, plus a fixture
  that fails a run on the wrong GPU; (c) change the per-app preferences per run (a system setting,
  not changed by the test suite).
- **Decision: (b).** In `playwright.config.ts`, hardware mode is the local default:
  - project `chromium`: every spec, on the full Chromium (`channel: "chromium"`), with
    `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`; NVIDIA expected;
  - project `low-spec`: the headless shell with the same flags; Intel expected; CPU x4 through
    CDP (`Emulation.setCPUThrottlingRate`); 1366 x 768 at DPR 1. It runs
    `immersive-rendering.spec.ts` (low tier, with `IE_GPU=1`) and `gpu-renderer.spec.ts`.
  - `tests/e2e/fixtures.ts` is the shared `test` for every spec. Its automatic worker fixture reads
    the unmasked renderer (`WEBGL_debug_renderer_info`). It fails the worker on the other GPU, on
    SwiftShader or another software renderer, or when the renderer cannot be read. The message
    names the expected GPU, the renderer found, and the registry setting to fix. Its `page`
    fixture applies the project's CPU throttle. The rule is a pure module (`tests/e2e/gpu-mode.ts`)
    with unit tests (`tests/unit/e2e/gpu-mode.test.ts`).
  - CI (no GPU) and `PW_GPU=0` keep the previous software mode: one plain headless `chromium`
    project with no GPU expectation. `study-journey` and `telemetry-learning` force SwiftShader
    only in that mode.
  - Workers: at most 2 locally (was half the cores), 1 on CI.
- **Changed usage:** `PW_GPU=1` is no longer needed. `PW_GPU=low` is replaced by
  `--project low-spec`. Earlier results that cite `PW_GPU=low`
  (docs/architecture/immersive-rendering-results.md) ran on the full build. Their renderer
  string, recorded with each run, shows which GPU they actually used.
- **Not changed:** `scripts/museum/playwright.gpu.config.ts` (headed, `--force_*_gpu` flags) is
  left as it is. Under the per-app preferences its `low` project also runs on the NVIDIA GPU. The
  default config's `low-spec` project is now the route to the Intel GPU.
- **Equivalence check:** test infrastructure only; no app code, content or telemetry changes. Both
  conditions are tested in the same projects.
- **Paper implications:** report the low-spec rendering checks as run on the integrated GPU, with
  the renderer string verified by the suite, rather than only selected by flags.

## DR-057: Photo Ingest per Source: Credit, Licence and Conditions for Non-V&A Photographs; Kind A Held (Adopted under the lead's delegation; no photograph added)

- **Context:** `scripts/content/ingest-study-photos.ts` applied the V&A terms only. Kind A of the
  process-photo proposal (carved wooden printing blocks) can be completed from three other
  sources: Rick Bradley (Flickr, CC BY 2.0) for Ajrakh, Sahapedia (CC BY-NC-SA 4.0 with written
  permission, `docs/research/sahapedia-image-permission-reply.md`) for Machilipatnam Kalamkari, and
  Eric Parker (Flickr, CC BY-NC 2.0) for Sanganeri. PARI granted photos 04, 06 and 07 by Rahul
  Maganti (`docs/research/pari-image-permission-reply.md`) for later kinds.
- **Options:** (a) one script per source; (b) one script with a per-source table of credit,
  licence and conditions, chosen by a `source` field on each proposal; (c) free-text credit in each
  proposal. (c) lets a mistyped credit through, and (a) duplicates the pipeline steps.
- **Decision: (b).** `PHOTO_SOURCES` holds, for each source:
  - the licence the proposal must state, and the site its record page must be on;
  - the credit:
    - V&A: unchanged, "© Victoria and Albert Museum, London", plus "(cropped)" when a crop is noted;
    - Rick Bradley: `Photo: Rick Bradley, "<record title>", Flickr, CC BY 2.0`;
    - Eric Parker: `Photo: Eric Parker, Flickr, CC BY-NC 2.0`;
    - Sahapedia: `Photo: <name> / Sahapedia, CC BY-NC-SA 4.0`, the name Sahapedia confirms;
    - PARI: exactly "Photo: Rahul Maganti / People's Archive of Rural India (PARI). CC BY-NC-ND 4.0,
      used with permission." (third reply).
  - **Same for every source:** a 768 px cap and a 60-month term from first publication
    (`licenceTermMonths`; `stampFirstPublication` sets `licenceExpiresOn` from it, so the five
    years run from first publication, as both permissions say). Never a public plate.
  - **Refusals:**
    - a crop or edit note on Sahapedia or PARI, which must be shown uncropped and unaltered;
    - a missing or placeholder photographer ("[Photographer's Name]") on every source that credits
      one;
    - on PARI, Rick Bradley and Eric Parker, any photographer other than the one the licence or
      permission covers.
  - An entry with no `source` field that names the V&A keeps the V&A terms. The three DR-020
    plans are byte-identical to the earlier script's (compared as JSON).
- **Kind A proposals:** `content/review/process-photo-proposals.json` holds the three photographs
  with status **held**, which the ingest skips. Until curation verifies the anchor claims, each
  caption is the record's own wording, with the project's inference in square brackets
  ("Printing blocks, [Ajrakhpur], [Kutch]."). The captions add no craft fact. They are held until
  all of these hold:
  - Sahapedia sends the photographer's name;
  - curation verifies the anchor claims of all three tool concepts (DR-020 claim gate);
  - Eric Parker confirms authorship;
  - the 768 px derivatives are made (resizing only for Sahapedia) and their SHA-256 recorded.
  The alt texts are drafted from the verifiers' descriptions, so a curator checks them against
  the files before a status changes to proposed.
- **Paper implications:** report the credit and licence of each figure's source in the materials
  section. The photo set is still one V&A textile per tradition until kind A is proposed.

## DR-058: Visual Pass: Visible Gallery Light, Finished Floor and Ceiling, Portal Reveals, a Directory Board, and a Plan Plate Beside the Home Title (Adopted under the lead's delegation after the low-tier measurement, DR-062; the C5 views await a human look)

- **Context:** the finished 3D build reads flat. The wall wash fell only 3.5% at 0.3 m (rendered
  201.5 against 205) and rose only 4.8% at 3.1 m (212), both under the visible step for a gradual
  gradient. The ceiling was a uniform slab (sRGB 196, cove up-light 0.16). The floor grain had no
  hue (the neutral gain removes all of the map's chroma). The directory was five loose white rows on
  bare wall, with no heading and directions in words only. Door openings were holes with a hairline
  edge, and the fixed 2.2 m door signs ran 0.35 m past a 1.5 m opening. The home title block left
  columns 8 to 12 empty at 1024 px and wider.
- **Decision (3D, one parameter set, no zone, tradition or room key; `GALLERY_FINISH`):**
  - Wall wash `0.70 / 0.40 / 0.16 / 0.30` (floor, floor falloff, cove, cove falloff). Rendered:
    176.8 at 0.05 m, 190.6 at 0.3 m, 201.0 at 0.8 m, 205.0 at 1.9 m, 209.0 at 2.8 m, 215.8 at
    3.1 m, 219.8 at 3.2 m. The card band stays flat (1.13%; within 0.57% of the band level) and the
    cove slot (`coveLinear` 0.72) is unchanged, so clipping cannot rise from the wash.
  - Ceiling sRGB 188 with the cove up-light `0.32 / 0.70`: stored edge/centre 1.239; every room's
    edge texels (within 0.2 m of an edge) are 1.258 to 1.265 times its centre texels (more than
    2 m in). Every room's floor and ceiling mean stays 1 (within 1%).
  - Floor detail 0.70 and a new `floorChroma` 0.30: the floor shader mixes 0.30 of the map's own
    hue back in around the same luminance (`chromaGain`, luminance exactly 1; program key
    `ie-floor-v2`, still one floor program). Computed floor mean: CIELAB L* 42.4, a* 1.3, b* 5.1,
    C* 5.3, at sRGB 100. Walls stay neutral (a*, b* 0).
  - Floor contact `0.42 / 0.40`: one wall gives 0.63 at 5 cm and 0.88 at 0.5 m before
    normalising; room edges sit at 0.61 to 0.69 of the room mean.
  - Portals: reveal faces (the lining faces along the opening) at sRGB 182; the soffit keeps the
    wall plaster under the face shading `down` (about 165); the 20 mm `#3f454c` edge is unchanged;
    the threshold is a stone sill at sRGB 150 (0.5 x the wall's linear luminance), its tint divided
    by the wash at the floor and the top face shading. Door-sign width = clamp(opening + 2 x 0.10,
    1.40, 2.20) m, centred (1.70 m on the study's 1.5 m openings); the type is unchanged.
  - Lobby directory: one plaster board (the reading-stand board's tint and chamfer, 40 mm deep,
    0.12 m past the stack on every side) behind a "Directory" heading strip (0.18 m, em 0.13) and
    the rows (0.36 m, gap 0.012 m, title em 0.115, line em 0.085), all 3 mm proud of the board.
    Each row leads with a 0.20 m vector arrow from `directoryArrow` (wayfinding.ts): left and right
    for the side walls, both ways for "Doorways either side of this sign", up (straight on) for
    "Through the comparison hall", and a turn-back arrow for the opposite wall. The spec had "up"
    for the opposite wall too; the opposite wall is behind the reader, and one arrow for two opposite
    ways would mislead, so it was changed. The board is merged into the lobby's wall mesh (the same
    plaster material): the lobby has no plinths, so a plinth mesh there would have been a new draw
    call. A click on the board is a click on the directory.
  - Baked only: no new material, program, light, post pass, render target or prop.
- **Decision (home):** Plate 1, the plan of the museum the public demo walks (the demo study's
  manifest on the newest review snapshot, found as the demo finds it), in columns 8 to 12 at lg and
  up, drawn by the 3D plan's own code (`src/features/immersive/plan-drawing.ts`, which the minimap
  now imports): 1.5 px ink outlines, doorway gaps, every exhibit as a 3 px ink-2 square, section
  numbers of at least 12 px on the wing rooms, "Entrance" and "Comparison Hall" on leaders, and one
  2 px indigo route from the spawn to each wing's doorway (all three 5.5 m in the study layout). The
  drawing fills the title block's row and never makes it taller; the caption sits under it; hidden
  below lg. Amends DR-022 for the home title block only.
- **Rationale:** ERCO (uniform wall washing; a visible source at the cove); Smithsonian Guidelines
  (limit level changes: means stay normalised, C2b +/-5%); Mayer's coherence principle (data, not
  decoration, beside the title).
- **Found while implementing:**
  - At the 1440 x 900 spawn the two hall door signs on the directory wall are cut by the frame even
    at the new width (computed projection: west sign -74 to 301 px, east 1139 to 1514 px; at 2.2 m
    they were -129 to 356 and 1084 to 1569). They would have to be about 1.0 m wide to fit, under
    the 1.4 m minimum, so the "fully inside or fully outside" target is impossible in this hub
    layout at this width. Left to a compiler DR on the spawn pose; the spawn is not moved here.
  - The spec's legibility target "0.0328 rad, at least 27 px at 1440 x 900" mixes two numbers:
    0.0328 rad is 24.6 px at the centre of a 900 px, 62 degree view. The rows give 0.0343 rad
    (25.7 px) from the spawn, now that they hang 43 mm off the wall.
- **Checks:** unit (finish targets, lightMeans 1 +/- 1%, ceiling edge/centre >= 1.20, floor
  chroma and wall neutrality, reveal and sill tints, directory board, heading, arrows and
  stand-off, door-sign width, plan drawing and plate); GPU C1 to C12 plus the new finish targets
  on the GTX 1650 and the Iris Xe low tier (p95 <= 33 ms, and <= +1 ms against a same-session
  baseline); C5 baselines re-approved after a human look; public-pages, design-acceptance and
  alignment e2e; the 7-point equivalence check.
- **Stop rule:** if C2 clipping exceeds 0.5%, C2b leaves +/-5%, the low-tier p95 exceeds 33 ms or
  C1b shimmer appears, that parameter alone goes back to its previous value and is re-measured.
  Budget is not traded for looks.
- **Equivalence:** a navigation-only change in 3D; no content, citation or telemetry change; equal
  salience across wings (one parameter set, equal rows and arrows). Methodologist sign-off with
  DR-021/DR-023 before participant data. The home plate is a public page, not a study condition,
  and ships in the same release as the 3D change (DR-023's release-together rule).

## DR-059: The Lead's Verification Route for the First Release, Relationship Evidence in content/, and Bagh, Bagru and Dabu Out of the Release Pipeline (Adopted on the project lead's authorisation)

- **Context:**
  - **No release is possible today.** A study needs a published release: a review snapshot can
    never be published or pinned by a real study (migrations 0006 and 0007). A release is refused
    while anything in the review pipeline is unaccepted (SNAP002, REL001), or while any claim or
    relationship citation lacks a page/locator or a verbatim quotation (REL002).
    - **The database today:** a read-only readiness check of the main database found all six
      traditions, 442 concepts, 715 relationships and 112 sources unaccepted. No relationship
      citation had a locator or a quote.
    - **The format gap:** the content/ format could not carry relationship evidence at all.
      Relationships listed only `source_ids`, so every imported relationship citation arrived
      without a locator or quote, and no relationship could be verified
      (`rel_citation_incomplete`).
  - **Nobody else can verify in time.** DR-020 and its addendum assume that a second curator
    verifies in the CMS. The project lead, Saurav Kumar, chose to take that responsibility
    himself. The study is invite-only, login-gated and non-commercial, and the image permissions
    are in hand. On that basis he told the build team to do everything needed ("DO IT ALL you need
    to").
- **Options:**
  - **(a)** Wait for an independent human curator.
  - **(b)** Verify on the lead's authority, on mechanical evidence, under his own account, with
    the route stated in every verification record.
  - **(c)** Run the study on the review snapshot. The database refuses this (0007).
  - **(d)** Have the verification recorded under another person's account. Rejected outright:
    the audit log must not show a sign-off that did not happen.
- **Decision 1, the verification route: (b).**
  - **Evidence:** a mechanical source check by Claude.
    - **What it covered:** every concept, claim, quote and relationship of the three study
      traditions.
    - **What it checked against:** hash-checked archived copies of the sources (SHA-256 equal to
      `content/review/source-manifest.tsv`).
    - **How:** PDF quotes were matched page by page. Section locators were matched by heading
      order. The tool and method are the same as in the earlier six-concept pass.
  - **What may be accepted:**
    - content whose quotes are verbatim at their locators and whose claims say no more than
      their quotes ("pass");
    - content that has been fixed. A fix may only add verbatim text from the same cited source,
      or narrow a claim to what its source says. It never adds a new craft fact and never widens a
      claim.
  - **What leaves the release:** content in the "fail" group, and "fixable" content that has not
    been fixed, is withdrawn or archived.
  - **Who verifies:**
    - **The account:** the transitions run through the CMS's own service functions
      (`transition`, `reviewAsset`, `publishRelease`) under **Saurav Kumar's own curator
      account**.
    - **The reason:** every verification reason states "authorised by the project lead; based on
      Claude's mechanical source check", with a link to the check sheet.
    - **Edits in the CMS:** any such edit is made under an account named for what operates it
      ("Claude (AI assistant, operated by Saurav Kumar)"), never under a colleague's name.
  - **What the route does and does not establish:**
    - **Separation of duties:** the code guarantees only that the verifying account did not author
      the text. It does not supply a second human judgement.
    - **`sources_consulted` and `quotes_verbatim`:** these ticks rest on the mechanical check.
    - **`claims_supported` and `provenance_kind`:** these rest on the check's claim-width reading,
      which an AI assistant did, and on the lead's acceptance of it.
    - **No independent domain expert reviewed the content.**
- **Decision 2: relationship evidence lives in content/.**
  - **The format:** FORMAT v1 gains an optional per-relationship
    `evidence: [{ source_id, locator, quote }]` (content/FORMAT.md, "Relationship evidence").
    - Each `source_id` must be one of the relationship's `source_ids`.
    - Each source gets at most one entry, because `relationship_sources` holds one locator and
      one quote per citation.
    - A quote has at most 25 words (`relationship_sources_quote_ck`), a locator at most 200
      characters, and there is no `note`.
  - **The checks:** the file schema refuses an entry for a source the relationship does not cite
    (KG100). So does the graph validator (KG412), which also covers models built in code.
  - **The importer** (`src/server/content/import-content.ts`):
    - It writes the locator and quote into that citation, only for relationships that are not
      accepted.
    - It still never sets `verified` and never touches an accepted row.
    - A citation with no passage in the file keeps the locator and quote it already has (for
      example, one entered in the CMS), so a re-import never clears evidence.
  - **Why the files and not the CMS alone:**
    - the evidence is reviewable in git;
    - the same mechanical tool can re-check it;
    - a re-import cannot bring back an incomplete citation: an unsupported citation is removed
      from the file's `source_ids`, so it is not re-added on import.
  - **Ordering:** import the files before verifying relationships, because the importer leaves
    accepted relationships alone.
- **Decision 3: Bagh, Bagru and Dabu leave the release pipeline.**
  - **Why:** they are not study traditions and were not source-checked.
  - **`comparisons` leaves with them:** its concepts compare all six traditions. A simulation
    that kept it found 37 KG109 errors, which refused the snapshot.
  - **What is kept:** the `shared` craft-science package, which the study concepts link to.
  - **Measured scope** (read-only simulation, before execution): 244 concepts and 421
    relationships, 0 graph errors. Re-measure with `releaseReadiness()` when this is carried out.
  - **How rows leave, all through `transition()`, in this order:**
    1. under_review concepts and relationships are withdrawn to draft;
    2. needs_evidence ones are archived, with the reason "outside the scope of release-1 (study
       traditions only); not reviewed";
    3. the three `traditions` rows are withdrawn (otherwise REL005);
    4. their sources are withdrawn once nothing in the pipeline cites them (otherwise REL004 and
       SNAP002).
  - **Reversible, and nothing is deleted:**
    - archived rows can be restored to draft;
    - the importer keeps curator-decided states (DR-038), so a re-import does not bring them back;
    - the three traditions stay in content/ and can go through review for a later release.
- **Not adopted:**
  - **An "unverified release" for the invite-only study:** no such path exists, and adding one
    would undo DR-037 and DR-038.
  - **Relaxing REL002 for relationships:** the citation standard requires a locator and a
    verbatim quote for every citation.
- **Paper implications:**
  - **Methods:** describe this verification route as it is: a mechanical, AI-performed source
    check, accepted by the project lead under his own account, with no independent expert review
    (methods-notes.md §2, "Verification route for the study release").
  - **Corpus:** report the study corpus as the three study traditions plus the shared
    craft-science layer. Report Bagh, Bagru and Dabu as documented but outside the release.
  - **Limitations:** list the absence of an independent human curator.

## DR-060: Unsupported Links Stay in the Graph as needs_evidence; the Museum Structure Is Unchanged (Adopted under the lead's delegation; content round 3)

- **Context:**
  - **The study's top gate is equivalence.** The three wings must stay structurally equal, and
    the 2D and 3D conditions must show the same content.
  - **What round 2 did (commit 9a6e9a7).** Its source check found 18 relationships whose cited
    sources do not state the link. It took them out of content/, put them in
    `content/review/removed-relationships.json`, and renumbered the PRECEDES ordinals of the
    chains that remained.
  - **Why that broke the gate:**
    - Ajrakh's process chain split into three chains of 3, 2 and 9 stages, because
      `kasano -> khariyanu` (ordinal 3) and `kut -> pa` (ordinal 5) were gone.
    - Machilipatnam Kalamkari lost `block-carving -> scouring-dung-bleaching` (ordinal 1), and its
      chain was renumbered from 2..11 to 1..10.
    - The spatial compiler lays out process paths and stations from these chains, so the
      Ajrakh wing would have had a different process route from the other two wings.
- **Decision 1: the 18 links go back into content/, as needs_evidence.**
  - **Where and how:** each link is at its original place in its file, with its round-1 text,
    conditions, provenance kind and ordinal.
  - **What changes in each link:**
    - `verification_state` is `needs_evidence`;
    - there is no `evidence` array, so the graph claims no passage for the link;
    - **one narrowing:** the `gi-year` SIMILAR_TO link in `comparisons.json` no longer cites
      `sanganeri:S14`, an unverified-kind source. Round 2 took such sources out of every
      release-scope citation, and this keeps that rule. Its other three sources stay, because
      KG403 needs a cited source.
  - **Stage numbering:** the original numbering is restored: Ajrakh 1..13 and Machilipatnam
    Kalamkari 1..11.
  - **What stays from round 2:** every other change is kept: the added passages, the dropped
    citations, the narrowed claims, the removed claims, and the unverified-kind sources taken
    out.
- **Decision 2: a review list for the PI.**
  - **The file:** `content/review/unsupported-relationships.json` lists the 18 links. Each entry
    gives the file, its endpoints, its type, its state (now `needs_evidence`), its sources and the
    round-2 reason the source check gave (`unsupported_reason`).
  - **`removed-relationships.json`** goes back to its eight entries on `main`. Those eight are
    still out of content/. `verification.md` §V8, `decisions.md`, `methods-notes.md` and
    `tools/fix-batch4.js` refer to it.
- **Decision 3: the release waits for the PI.**
  - **Why:** under DR-059, a release is refused while anything in the review pipeline is
    unaccepted (SNAP002, REL001). A needs_evidence link cannot be accepted, and archiving one
    would bring back the broken chains.
  - **The ruling needed:** the PI decides whether the order of the section headings in the GI
    journal (S1) counts as evidence of stage order.
    - That ruling settles `ajrakh kasano -> khariyanu` and `kut -> pa`. The round-2 check found
      no sentence that orders these stages, only the heading order.
    - The other 16 links also need the PI's decision before release. One of them is the
      Machilipatnam Kalamkari `block-carving -> scouring-dung-bleaching` PRECEDES link: S4's stage
      list is not in time order.
  - **No other route:** no route is taken around this, and no link is accepted without a
    verbatim passage.
- **Check that the museum structure is unchanged**, against `main` (f108a4a):
  - **Relationships:** in all five touched files, the list of relationships (source, target,
    type, ordinal) is identical to `main`, in the same order: shared craft science 25,
    comparisons 80, Ajrakh 162, Machilipatnam Kalamkari 133, Sanganeri 87. The concept keys are
    identical too.
  - **The compiled manifest:** we compiled it from content files (`compile-content.ts` logic,
    seed `default`, the three study traditions) for `main` and for this branch. Both pass
    validation.

    | Wing | Rooms | Exhibits | Stations | Paths |
    |---|---|---|---|---|
    | Ajrakh | 7 = 7 | 61 = 61 | 18 = 18 | 3 = 3 |
    | Machilipatnam Kalamkari | 7 = 7 | 55 = 55 | 12 = 12 | 1 = 1 |
    | Sanganeri | 7 = 7 | 60 = 60 | 12 = 12 | 1 = 1 |
    | Comparison / shared / entrance | 1 / 1 / 1, equal | 12 / 22 / -, equal | - / 2 / -, equal | 3 / 1 / -, equal |

    All 27 portals are equal.
  - **Element ids and positions:** the ids are identical. Positions, bounds, walls, wall order,
    sequence and `encodes` differ for **0** elements.
  - **What does differ is text only,** from the round-1 and round-2 narrowings:
    - the labels and rationales of two Sanganeri open questions ("Who founded Sanganer?"; "GI
      registration year: 2009 or 2010?");
    - the hotspot text of five exhibits.

    The hotspot counts are equal. The manifest hash differs because of this text.
  - **Validator:** 0 errors, 0 warnings, 125 info. Round 2 had 2 warnings (KG800 for the
    orphaned `sanganeri.tool.mogri-mallet`, and KG316 for
    `machilipatnam-kalamkari.process_stage.block-carving`). Restoring the links clears both.
- **Not adopted:**
  - **Keeping the round-2 removal:** it changes the 3D layout of one wing only and breaks the
    equivalence gate.
  - **Restoring the links under their round-1 state (under_review):** it would present them as
    awaiting a routine check, when the source check has already found no supporting passage.
- **Paper implications:**
  - **Corpus:** report that 18 links in the study graph lack source support and are marked
    needs_evidence: 17 in the three study traditions and shared science, and 1 in comparisons,
    which is outside the release under DR-059. Report them as kept so that the wings stay
    structurally equal.
  - **Limitations:** state that the structure of the process chains rests partly on curators'
    reading of the source's stage order, pending the PI's ruling.

## DR-061: Integration of the Preparation Branches: Merge Order, DR Numbers, GPU Projects, the RTL Fixture and a Provider-Neutral Runbook (Adopted under the lead's delegation; merge of prep-all, prep-visual, prep-content and prep-verify)

- **Context:** four branches were prepared from f108a4a while the final review fix round
  (DR-047 to DR-053) landed on `main`. Each branch numbered its own records from DR-047 with
  "number to confirm at merge", so the same numbers meant different decisions on `main` and on
  the branches.
- **Decision 1: merge order and numbers.** `prep-all`, `prep-visual`, `prep-content`,
  `prep-verify`, each with `git merge --no-ff`. Provisional records were renumbered in merge
  order, and only in the lines a branch brought in, so `main`'s DR-047 to DR-053 references keep
  their meaning:

  | Branch | Provisional | Now |
  |---|---|---|
  | prep-all | DR-047 invite gate | DR-054 |
  | prep-all | DR-048 Neon and R2 | DR-055 |
  | prep-all | DR-049 GPU split | DR-056 |
  | prep-all | DR-050 photo ingest | DR-057 |
  | prep-visual | DR-047 visual pass | DR-058 |
  | prep-content | DR-047 verification route | DR-059 |
  | content round 3 (scratch text, not on the branch) | DR-048 structure | DR-060 |

  "Number to confirm at merge" is gone from code and documents. Dates were taken out of the
  DR-055 and DR-060 headings and the DR-055 addendum label (access dates of quoted pages stay).
  DR-055's heading now says what its addendum decided: Neon and R2 are the lead's default and the
  provider is the deployer's choice. The production data path (`db:seed:reference`,
  `content:bootstrap:remote` with its remote and migration guards, the `with-env` command guard;
  commits 748675e and 6a05826) had no record of its own; it is recorded here and in the runbook
  (section 5).
- **Decision 2: both intents where the visual pass met the fix round.** Git merged `minimap.tsx`
  and `labels.ts` without conflict; the result was read, not assumed:
  - the plan drawing keeps DR-053's click-to-walk (`onRoom`) on the `PlanDrawing` that now draws
    from `src/features/immersive/plan-drawing.ts` (DR-058, shared with the home page's Plate 1);
  - the category signs keep DR-053's shrink-to-fit on one line, next to DR-058's new directory
    heading kind and row arrows;
  - DR-053's enter-cue rule (`enterCuesOnCrossing`, `museum-scene.tsx`) is untouched by the
    visual pass, which changed only the directory geometry, door-sign width and finish values;
  - the home-title e2e keeps the invite gate's `newContext` (DR-054) with DR-058's Plate 1 test.
- **Decision 3: one GPU vocabulary, the DR-056 projects.** The visual pass's measurement text
  assumed `PW_GPU=1` / `PW_GPU=low`. Current usage now names the projects: `--project chromium`
  (full Chromium, NVIDIA GTX 1650) and `--project low-spec` (headless shell, Intel Iris Xe).
  Changed: the rendering spec header (C2c with `-g "C2c"` on either project),
  `exposure-parity.spec.ts` (it imported `@playwright/test` and opened a bare
  `browser.newContext`, so it bypassed both the renderer check and the invite cookie; it now uses
  `./fixtures` and `newContext`), the smoke script comment, the visual-system module, the runbook
  and `immersive-rendering-results.md` (a project-based command block; runs recorded with
  `PW_GPU` are kept as history, with their renderer strings).
- **Decision 4: the Arabic-script check runs on a fixture.** Content round 2 dropped the only
  Arabic-script quote (Ajrakh etymology, an unverified-kind source), so the old assertion "the
  curated content has at least one run" could no longer hold. `tests/fixtures/arabic-script-quotes.json`
  holds that quote verbatim (checked character for character against `main`'s content) with
  its expected runs (sd, fa, fa); it is a test string, never imported. The test still checks
  every Arabic-script quote content/ may hold for unchanged text, and the rendered
  `<span lang dir="rtl">` stays covered in `citation-disclosure.test.tsx`.
- **Decision 5: one provider-neutral runbook and research file.** `docs/deploy/RUNBOOK.md` is
  the handover runbook (both options, Ankit chooses; section 0 asks for the ethics check of data
  location first). The Neon and R2 notes join `docs/deploy/RESEARCH.md` as an addendum (N§1 to
  N§9). Every quote in both was matched mechanically (normalised whitespace, markup stripped)
  against saved vendor pages, the live pages fetched at merge, or the repository. Four did not
  match and were corrected to the page text:
  - Neon pricing: the Free column reads "$0 /month", Instant restore storage "Free with limited
    window/size", History window "Up to 6 hours or 1 GB of data changes", Snapshots "1 snapshot",
    Support "Community (Discord)"; the earlier "History window: 6 hours (1 GB limit)",
    "Snapshots (manual): 1" and "Instant restore: -" are not on the page;
  - AWS Free Tier FAQ: the sentence ends "continue using your account and associated services.";
  - Vercel Spend Management: the sentence continues "so Vercel pauses your projects when the
    amount is reached.";
  - Neon DPA: the Grafana sentence continues "in addition to all other listed subprocessors", so
    it is no longer called the "only location clause".
- **Decision 6: the invite form's use limit is a numeric text field.** The merged checks found
  one failure: the Atlas lint (DESIGN.md 9, `tests/unit/design/atlas-lint.test.ts`) refuses number
  spinners, and the invite form (DR-054) used `type="number"`. It is now `type="text"
  inputMode="numeric" pattern="[0-9]*"`, as the CMS's year and depth fields; the server schema
  (`createInviteInput`) still refuses anything but a whole number from 1 to 100000.
- **Not done here:** the e2e, rendering (C1 to C12, C2c) and low-spec runs, the parity run of
  record, and the database steps. DR-058 stays "Proposed; adopted after the low-tier
  measurement" until those runs. The local `vercel-deploy` skill (not in the repository) still
  describes RDS and `bom1` only.
- **Equivalence check:** (1) content: the merged content is round 3's (DR-060: structure equal
  to `main`, text narrowed); (2) exposure: unchanged; (3) citations: unchanged by the merge; (4)
  ease once a concept is open: unchanged; (5) navigation: DR-058 and DR-053 both kept, 3D only,
  navigation-only, pending the GPU measurements; (6) salience: one parameter set across wings;
  (7) telemetry: no event added or changed by the merge.

## DR-062: Full Verification of `main` After the Merge: One Shader Compiled Late, C2c Targets and Samplers Corrected, a Tour That Does Not Jump Over Frame Stalls (Adopted under the lead's delegation; verification of 2515cda)

- **Context:** one full verification of `main` after the merge (DR-061), in order: a production
  build served on :3300 (one server), the integration tests, the e2e set on the `chromium`
  project (NVIDIA GTX 1650, 2 workers), the rendering checks C1 to C12 and C2c on the GTX 1650
  (1 worker), the `low-spec` project on the Intel Iris Xe, and the 7-point equivalence check.
  Every browser was headless; each GPU run recorded its WebGL renderer string, and the suite's
  fixture fails a run on any other GPU.
- **First-pass results (build of 2515cda):**
  - integration: 29 files, 280 tests, all pass;
  - e2e, `chromium` project, 2 workers: 54 pass, 12 skipped (the GPU measurement checks, which
    run only with `IE_GPU=1`), 1 fail: design-acceptance "performance at a 4x CPU throttle",
    3D lightbox median 264 ms against 200 ms. Run alone (1 worker) it passed twice: 3D lightbox
    medians 136 and 120 ms, citation record 104 and 96 ms, 2D 72 to 136 ms, LCP 604 to 688 ms.
    The two workers share four cores, and the test itself notes that one sample at a 4x
    throttle spreads from 104 to 224 ms with the machine's other work. Recorded as load, not
    changed; a measurement of record for that test runs it alone;
  - GTX 1650: 3 of 11 checks failed: C5 (all six room views changed, as the visual pass
    intended), C2c (below) and C4 (16 programs before the first tour, 17 after);
  - Iris Xe: C2c and C3/C11 failed (below).
- **Decision 1: the unlettered-card program compiles before entry (C4).** The program the
  pipeline's target needs for the unlettered cards (`panel-blank`, sRGB-linear output) was
  compiled after entry, when the first wing room's blank cards were drawn: three.js's program
  list at entry and after each room showed exactly that one program appearing. The pre-change
  build (ec2c4f9) shows the same 16 to 17 on the Iris Xe, so it predates the merge. The fix
  follows the existing lettering keeper: `precompileHighlightAndRoute` adds a 1 cm plane with the
  shared card material below the floor for the entry pass only (`world.ts`, `blankKeeper`); the
  material lives for the whole visit, so the program does too. Unit test in
  `gallery-finish.test.ts`. After the fix: 17 programs before and after both tours on both GPUs.
- **Decision 2: two C2c targets corrected to the spec's own arithmetic.** The C2c samplers (DR-058)
  ran on a GPU for the first time here:
  - wall at 3.0 m against 1.9 m: measured 1.036 to 1.044, target 1.025 +/- 0.015. The spec's wash
    model gives 1.038 for the adopted wash (0.70 / 0.40 / 0.16 / 0.30) and 1.024 for the previous
    one (0.86 / 0.22 / 0.10 / 0.32): the target was the old wash's value. Now 1.038 +/- 0.015;
    the 0.3 m target (0.930, which the same model gives) is unchanged;
  - reveals: measured 177.2 to 177.5 on reveal faces normal to x and 181.7 to 182.0 on those
    normal to z, target 182 +/- 4. The fixed face shading darkens every face normal to x by
    `xFacing` 0.95, walls included (C2c already checks the wall spread per orientation for this
    reason); the same model gives 177.5. The probe now reports each reveal's normal, and the
    target is 182 (normal z) or 177.5 (normal x), +/- 4. The shading stays, so a reveal keeps the
    same step under the wall it sits in.
  Both are unit-tested against the renderer's own arithmetic (`gallery-finish.test.ts`).
- **Decision 3: the C2c samplers read only what the frame resolves.**
  - Floor contact (target: 5 cm from the wall at least 22 levels under 1.5 m out). From the
    centre of the deepest rooms (8.9 m to the wall) the 5 cm strip is about 0.55 px tall at
    1366 x 671, and from 23 (GTX 1650) and 22 (Iris Xe) of the 24 `#wall` views it is under 2 px, so the near read blended the
    floor with the skirting and the wall: on the
    Iris Xe, with fewer accumulated TAA samples, 8 rooms read the near floor 11 to 16 levels
    brighter than the far floor. On the GTX 1650 the one-column reads ran from 20.2 to 34.9 with
    the floor grain (floorDetail 0.70) against a model value of about 27. Now the near and far
    floor are each the mean of five columns 0.15 m apart (inside every clearance tier), and when
    the strip is under `FLOOR_STRIP_RESOLVED_PX` (2 px) from the view, the same column is read
    again from straight in front of the wall at the distance where it spans 2.5 px (about 4 m).
    The one-column values are kept in the results.
  - Door frame (target: at least 3:1 against the wall). Where the 20 mm edge spans 1.14 to 1.27 px
    from the room centre, no pixel is wholly the edge and the darkest pixel read 2.3 to 3.7:1;
    where it spans 1.64 px or more it read 5.92 to 6.04:1. A span of 2 px always contains a whole
    pixel, so a jamb is now measured only at `DOOR_EDGE_RESOLVED_PX` (2 px) or wider, and when no
    jamb is that wide from the view the edge is read again from the line to the doorway where it
    spans about 2.5 px. The room-centre reading is kept as `viewRatio`. The edge colour is
    unchanged since DR-023. That a 20 mm edge thins to about a pixel from the centre of a large
    room is a property of the design, left for the human look at the visual pass.
  After the change: floor contact 24.2 to 34.6 levels (GTX 1650) and 24.3 to 35.6 (Iris Xe);
  door frame 5.96 to 6.04:1 on both. Unit tests in `probe-geometry.test.ts`. No target was loosened: the two corrections in
  Decision 2 follow from arithmetic, and these change only where a sample is read.
- **Decision 4: the probe tour does not jump over frame stalls; the low-spec stall is recorded.**
  On the `low-spec` project (headless shell on the Iris Xe, CPU x4) the page received no
  animation frame for 77 to 127 s, two or three times a tour. A diagnostic run showed the main
  thread idle through the gap (no long task), no WebGL context loss and no console message; the
  pre-change build stalled the same way (102 and 120 s), and the high tier (full Chromium on the
  GTX 1650) never did. The tour's clock is wall time, so after a stall the visitor jumped ahead:
  21 to 23 of 24 rooms were visited, residency built several rooms at once (199 draw calls in one
  frame of one run) and C11 compared different end states (geometries 106 or 108 against 103, heap
  +27%). The tour now advances by an ordinary frame over any gap longer than 1 s
  (`TOUR_STALL_MS`), lists each stall, and keeps the gap in the frame deltas; the C3 test's limit
  is 50 min. After the change both tours visit all 24 rooms, and C3, C4 and C11 pass. The cause of
  the stall is not found: it is in the browser's frame production on this machine, not in the
  page's JavaScript, and it needs a separate look before the low tier is used as evidence of
  smoothness on integrated graphics.
- **Decision 5: C5 baselines.** The six high-tier views were regenerated: the old and new images
  and side-by-side pairs are kept for a human review (scratchpad
  `final-review/baselines-for-review/`). Checked by eye: the differences are the visual pass's
  (the wash gradient, the darker ceiling with the brighter cove band, the oak-toned floor, the
  directory board with its heading and arrows, the narrower door signs and the reveals); nothing
  else moved. The low-tier views were created again and, as before, not added to the repository.
- **Decision 6: DR-058 is adopted.** Its stop rule did not trigger, so no visual parameter was
  reverted: C2 clipped at most 0.26% (GTX 1650) and 0.49% (Iris Xe) against 0.5%; C2b within
  2.3% against +/-5% on both; C1b no spike on either; low-tier p95 16.8 ms on both tours against
  33 ms, and 16.8 ms on the pre-change build in the same session (+0.0 ms; the headless shell
  delivers frames at 60 Hz, so both sit on the 16.7 ms frame interval, and a 1 ms difference
  below that would not show). The Iris Xe clipping is close to its limit, so a later finish change
  must be measured on the low tier first.
- **Final results (production build with the fixes):** see `docs/architecture/immersive-rendering-results.md`,
  "Merge Verification Run (DR-062)". GTX 1650 (run `main-final-high`): 11 of 11 pass, C5 with 0 differing pixels against the regenerated views; the door-sign rule at 1440 x 900 stays `fixme` (DR-058). Iris Xe (run
  `main-final-low`): 12 of 12 pass after the C3 timeout change.
- **After the fixes:** unit and component tests 158 files, 1,912 tests, all pass (4 workers);
  ESLint and the typecheck pass; the 3D e2e set on the final build (immersive flow, parity quick,
  exposure parity, the GPU renderer check, public pages, the study journey; 2 workers) 24 of 24
  pass.
- **Not done here:** the full parity run of record (the quick parity run passed in the e2e set;
  the quick report is not kept, and `analysis/parity/interface-parity.json` is unchanged), the
  database steps, and the cause of the low-spec stall.
- **Equivalence check:** (1) content: unchanged; (2) exposure: unchanged (the keeper is drawn in
  the entry pass only, under the floor, before the visitor can see anything); (3) citations:
  unchanged; (4) ease once a concept is open: unchanged; (5) navigation: unchanged for the
  participant; one fewer shader compile after entry in 3D, which removes a possible hitch and
  handicaps neither condition; (6) salience: one parameter set, unchanged; (7) telemetry: no
  event added or changed. The probe and the tests change only measurement (`?probe=1`, outside
  study mode). Parity and immersive unit suites and the 3D e2e set were run after the changes
  (results in the run section).

## DR-063: Database Steps on `episteme`: Two Local Staff Accounts, 244 Concepts Verified Under Saurav's Account, Six Study Photographs Ingested and Reviewed, the Demo Kept on the Review Snapshot (Adopted on the project lead's authorisation; DR-059 route)

- **Context:** after the merge (DR-061, DR-062) the local development database `episteme` still
  held the content of 14 October: no staff account for the lead, 366 under_review and 76
  needs_evidence real concepts, and no study photograph. The lead authorised the verification
  route of DR-059 and the photo ingest ("DO IT ALL"). He also ruled that nothing structural is
  archived or withdrawn and no release is published tonight, so the demo runs from the REVIEW
  snapshot (DR-060).
- **Rehearsal first.** Every step below ran first on a throwaway database, `episteme_rehearsal`
  (migrate, `db:seed:reference`, `content:bootstrap:remote` on the local host, then the steps).
  The results were the same: 40 resubmitted, 244 verified, 0 refusals, 6 photographs verified and
  parity `a.figures` passing. The rehearsal database was then dropped. A `pg_dump` of `episteme`
  was taken before the run.
- **Accounts** (`scripts/content/create-curator.ts`, the same account path the CMS uses; the
  passwords are in a local file outside the repository and were never printed):
  - `saurav.curator@episteme.local`, "Saurav Kumar", role curator: the verifying account;
  - `photo-ingest@episteme.local`, "Photo ingest (automated)", role content_editor: the uploader,
    so that no photograph is reviewed by its uploader.
  - The `.local` addresses are placeholders, because no personal address may be stored
    (team-and-ethics). The lead can change them in the admin console.
- **Import:** `content:bootstrap:remote` against the local database (import, review snapshot,
  the four manifests, the demo study). The importer keeps the states curators decided.
- **Resubmission (needs_evidence → under_review):**
  - **Tool:** new `scripts/content/submit-concepts.ts`, which calls the CMS's `transition()` as
    Saurav.
  - **Rule:** a concept is resubmitted only when `citationProblems()` returns nothing, the same
    test verification applies. "Complete evidence" therefore means that every claim has a
    source, a locator, a verbatim quote and its passage.
  - **Result:** all 40 needs_evidence concepts in scope qualified (ajrakh 12,
    machilipatnam-kalamkari 15, sanganeri 9, shared 4); 0 refused.
  - **Separation of duties:** a submit is a workflow move, not authoring (`authorsOf` counts only
    `cms.concept.*` actions). It does not make Saurav an author of the text.
- **Verification:**
  - **Run:** `scripts/content/verify-concepts.ts --dry-run`, then `--apply --as
    saurav.curator@episteme.local`, over every under_review concept of the three study
    traditions and `shared`.
  - **Recorded reason:** "Authorised by the project lead; based on Claude's mechanical verbatim
    source check (release-content/round3)". This file is the evidence link.
  - **Result:** the dry run found 244 to verify and 0 refusals. The apply run verified **244, with
    0 refused** (ajrakh 80, machilipatnam-kalamkari 68, sanganeri 72, shared 24), each with all
    four evidence checks recorded.
  - **Not touched:** Bagh, Bagru, Dabu and `comparisons` (DR-060). Relationships, sources and
    traditions were not verified, because no tool for them exists yet (RELEASE-PACKAGE §5).
- **Photographs: kind A (carved blocks) proposed.** DR-057 held the three block photographs until
  four conditions held. Each is now met, or the lead has ruled on it:
  - **Sahapedia name:** the lead's instruction is to credit the source's own wording until
    Sahapedia replies.
    - The Wayback copy of sahapedia.org/kalamkari of 9 July 2016 gives, for 6_IMG_0046 ("Wooden
      blocks used for kalamkari printing in Machilipatnam"), `title="Image courtesy J. Niranjan,
      Srikalahasti, Andhra Pradesh"` (checked in the saved page).
    - The credit is therefore "Courtesy J. Niranjan, Srikalahasti / Sahapedia, CC BY-NC-SA 4.0".
      Replace it when Sahapedia names the photographer.
  - **Eric Parker's authorship:** established from the public Flickr records: his camera's serial
    number in his own Toronto stream, the unbroken frame sequence of the trip, and reposts that
    carry his own Photoshop export IDs. The lead accepted this in place of a reply.
  - **Anchor claims verified:** the three tool concepts are among the 244.
  - **Derivatives:** the SHA-256 of each 768 px file equals the derivative manifest (a219f8bc…,
    21f1dbc0…, cc2d233c…). The files are copied to
    `scripts/content/study-photos/<tradition>-blocks-768.jpg`.
  - **Alt texts** were checked against the files, and two were corrected to what is visible: the
    Ajrakh blocks stand in a row along the ledge, not side by side, and the Machilipatnam block
    fills about half the frame. The captions are unchanged (the record's own wording).
  - **Status:** the entries in `content/review/process-photo-proposals.json` are now `proposed`,
    with `conditionsMet` in place of `heldUntil`.
  - **Not ingested:** the PARI photographs, because they have no balanced kind.
- **Credit fix:**
  - **Bug:** the per-source credits of DR-057 began with "Photo: ", and the shared figure prints
    "Photo: <credit>." in both conditions. Every non-V&A credit would therefore have printed
    "Photo: Photo: …".
  - **Fix:** stored credits now omit the prefix, so the printed line is the line each source asks
    for. PARI's printed line equals its confirmed credit exactly.
  - **Test:** `tests/unit/knowledge/study-photo-sources.test.ts`.
- **Ingest and review:**
  - **Ingest:** `ingest-study-photos.ts --uploader photo-ingest@episteme.local` uploaded the three
    V&A textiles and the three block photographs to local storage. It linked each as the
    illustration after its anchor claim and submitted it for review.
  - **Review:** new `scripts/content/review-study-photos.ts` verified all six as Saurav through
    the CMS's `reviewAsset`, with all five media checks; 0 were refused.
  - **Separation of duties:** for every asset, the uploader and the reviewer differ.
- **Snapshot and manifests rebuilt:** `content:bootstrap:remote` ran again. It built review
  snapshot `review-682504158e51`, recompiled the four manifests and re-pinned the demo study
  (still draft, demo and non-experimental). `figures.photos` is on by default, so the demo study
  needed no change.
- **Parity (read-only report of the demo study):**
  - `a.figures` passes: 9 diagrams, 6 photographs, none held back.
  - Claims 717 = 717, citations 779 = 779, sources 74 = 74, and coverage 254 concepts = 254
    exhibits.
  - The 4 critical failures belong to the demo study itself and were identical before the run:
    the review snapshot is not a release, the manifest is not published, the journey has no
    battery, and exposure is self-paced.
- **On screen** (production build, full Chromium on the GTX 1650, renderer string checked): each
  of the six photo concepts was opened as a 2D concept page and as the 3D panel. **No photograph
  shows in either condition.**
  - **Why:** the learner read model serves an illustration only when two things hold. The asset
    must illustrate a concept in a *published real release*. A termed licence must also have its
    first-publication day recorded (`servableSql`, DR-037).
  - **Effect:** no real release is published, so all six are gated, identically in both
    conditions. Each side shows 0 figures and the same claims around the anchor.
  - **Decision: keep the gate.** Loosening it so that a review snapshot shows photographs would
    publish them. That would start the V&A and Sahapedia five-year terms and bypass the release
    the PI is to rule on. The photographs will appear in both conditions together on the day a
    release containing their verified anchor concepts is published.
  - **Finding:** the parity figure check counts approved illustration links without the
    published-release condition, so it reports 6 photographs where learners see 0. Balance holds
    either way, but the count should follow the read model. Deferred to the overnight phase.
- **Equivalence check:**
  1. Content: both conditions show the same claims, citations and figures (the photographs are
     gated in both).
  2. Exposure: unchanged.
  3. Citations: access unchanged.
  4. Ease once a concept is open: unchanged.
  5. Navigation: unchanged.
  6. Salience: once released, one photograph per tradition per kind (textile, blocks), all in the
     same sections.
  7. Telemetry: nothing new is logged.
  - **Tests:** the unit suites for parity, immersive, 2D learning, knowledge and research (61
    files, 509 tests) all pass.
- **Paper implications:**
  - Report that the verification route (DR-059) was executed as described: 244 concepts verified
    on the mechanical check under the lead's account, with 0 refusals. Report also that
    relationships, sources and traditions are not yet verified.
  - Report each figure's source, credit and licence. State that the Machilipatnam block
    photograph is credited from the source's 2016 courtesy line until the archive confirms the
    photographer.

## DR-064: Room Walk Times on the GTX 1650: the Three Wings Within 10%, the Same Section up to 23% Apart, the Layout Unchanged (Adopted under the lead's delegation; measurement of the main build)

- **Context:** the evening checklist asks for the walk time from the lobby spawn to every room and
  through each wing in its order, with the scene's own walk routes at the default speed. Target:
  the three wings within 10% of each other, and the same section compared across traditions. A
  wing out of tolerance is to be reported with a recommended layout change, not changed.
- **Method:**
  - `scripts/museum/walk-times.ts` loads the manifest the preview `/learn/immersive` shows
    (`findPreviewContent`, review snapshot review-682504158e51). It routes with `createRouter`
    exactly as `walkToRoom` and `walkThroughDoorway` do and advances the visitor with
    `stepVisitor` at a fixed 60 Hz step until the visitor stops. The pace is the default
    click-to-walk pace (1.35 m/s, brisk 2.3 m/s on long routes, `ROUTE_PACE`).
  - A wing is walked from the spawn through its seven rooms in the Plan's order (`planOrder`, the
    section order shared with the 2D pages), doorway to doorway.
  - `scripts/museum/walk-times-browser.mjs` checks it in the real scene: production server, one
    full Chromium on the GTX 1650 (renderer string "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ...
    D3D11)", checked before measuring), 1280 x 720 at DPR 1, high tier. For each of the 21 wing
    rooms the visitor is put back on the spawn and the room's Plan row is clicked; the time runs
    from the click to the last frame the visitor moved. All 21 agree with the simulation within
    0.14 s (the browser is slightly shorter: the simulation counts the final settle step).
- **Results** (`analysis/out/museum/walk-times.json`; table in
  `modules/immersive-3d.md`, Room Walk Times):
  - Wings: Ajrakh 52.8 s (76.5 m), Machilipatnam Kalamkari 48.2 s (66.1 m), Sanganeri 52.0 s
    (74.9 m). Longest over shortest 9.5%, at most 5.5% from the mean. **Within tolerance.**
  - Same section across traditions: longest over shortest 11% (tradition context, open
    questions) to 23% (materials and tools). Machilipatnam Kalamkari is the nearest in every
    section, by 0.7 to 3.3 s.
  - Cause: the north wing's first two rooms measure 14 m along the walking direction where the
    east and west wings' measure 18 m (materials and tools: 196 m² against 324 m²), so its routes
    are about 10 m shorter. Section order and doorway count are
    the same in all three wings.
- **Decision:** no layout change. The wing target is met, and the brief forbids changing the layout
  in this phase.
- **Recommended layout change, for the PI, if section times must match** (not applied): give every
  section the same footprint in all three wings (the largest of the three per section). The
  compiler's grid-wings layout would then place mirror-equal wings around the lobby, and the walk
  to the same section would differ only by the wings' distance from the spawn. Re-run both scripts
  after any layout change.
- **Equivalence check:**
  1. Content: unchanged.
  2. Exposure: unchanged.
  3. Citations: unchanged.
  4. Ease once a concept is open: unchanged.
  5. Navigation: unchanged; this is a measurement only.
  6. Salience: the wings' walk times are within 10%; the same section differs up to 23% (above).
  7. Telemetry: nothing new is logged.
- **Paper implications:** report the wing walk times and the 9.5% spread as the spatial balance
  of the three traditions. Report the section differences as a known asymmetry of the layout
  (Machilipatnam Kalamkari rooms nearer by up to 3.3 s), with the room-footprint cause.

## DR-065: The Final Before/After Set: the Four Original Desktop Shots Against the Final Build, Phone Views Without an Original (Adopted under the lead's delegation; finish of the evening phase)

- **Context:** the finish step asks for before/after images of the home page, a 2D concept, the 3D
  lobby and a room, and the research dashboard at 1440 px, plus 390 px views of 2D, 3D and a
  study page, labelled "BEFORE (original UI) | AFTER (final build)".
- **Sources:**
  - Before: the only original-UI shots are the four in `D:\Work\IIT-KGP\before-after_Paper_1`
    (public home, 2D concept page, 3D lobby, research dashboard). Each is a 2928 x 972 composite
    whose left panel is the original UI at 1440 x 900; that panel is cropped out unchanged.
  - After: the production build of `bdd9aac` (`next start`), one full Chromium on the GTX 1650
    (renderer "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ... D3D11)", checked before the 3D shots),
    DPR 1, 1440 x 900 and 390 x 844 (mobile emulation), high tier, the demo through the invite
    cookie. The 2D concept is the original's concept (Dhamadka as the Historic Centre); the room
    is the Ajrakh Process Sequence room. The dashboard was shot under a temporary
    `e2e-*@example.test` researcher account, retired at the end of the run (`retireE2eStaff`).
- **Decision:** no original exists for a wing room or for any phone width, so those panels say so
  instead of substituting another view. The set (eight images) is kept outside the repository with
  the other scratch evidence, not committed.
- **Observation, not changed in this phase:** at 390 px the lobby spawn view shows the directory
  sign wider than the screen (its left and right edges are cut off). Recorded for the 3D finish
  pass; the 2D pages and the Plan list the same rooms.
- **Equivalence check:** 1-7 unchanged; no code, content or telemetry changed.

## DR-066: Publishing to a Public GitHub Repository: One File Removed From History, Author Email Mapped to the GitHub Noreply Address, a Clean Secret Scan (Adopted on the project lead's instruction; publish phase)

- **Context:** the lead's words: "our job is till creating a Git repo, pushing this code there",
  "repo will be public and nothing will be held back" and "things are pushed on git repo you
  create". The pre-push scan had found two things in history that a public repository must not
  carry: the local test admin password in `_audit_shots.mjs` (added in `c43554a`, deleted in
  `78c59c2`), and a personal email address as author and committer of every commit (the standing
  rule allows only the institutional contact).
- **Backup first:** `git bundle create D:\Work\IIT-KGP\Paper_1-artifacts\pre-rewrite.bundle --all`;
  `git bundle verify` reports a complete history (43 commits, `c8bcb12` at the tip). The original
  history stays recoverable from that file.
- **Rewrite, in a fresh clone** (`git clone --no-local`), with git-filter-repo a40bce548d2c:
  - `--invert-paths --path _audit_shots.mjs`: the file is gone from every commit;
  - `--mailmap`: author and committer email of all 43 commits mapped to
    `123621147+the-sauravkumar@users.noreply.github.com` (the id from `gh api user`); names kept.
    No git config identity was changed.
  - The tip tree is byte-identical to the original tip (`c973d0f`, same tree id), so no code,
    content or test changed. Every commit id changed; `commit-map.txt` beside this file maps the
    ids cited in earlier records to the published ones.
- **Secret scan of the rewritten clone:**
  - gitleaks 8.30.1, the official Windows x64 release, SHA-256 checked against the release's
    checksums file (`d29144de...afc4e`, OK), kept in `C:\Tools\gitleaks\8.30.1`.
    `gitleaks git --log-opts=--all` and `gitleaks dir` each reported two findings, both the
    same made-up `BETTER_AUTH_SECRET` in the unit-test fixtures `tests/unit/deploy-neon.test.ts`
    and `tests/unit/deploy-source-changes.test.ts` (example.org URLs; it matches no real
    environment file). They are listed in `.gitleaksignore` with this reason; with it, both scans
    report no leaks.
  - All 3038 objects searched for the old test admin password and for the personal mail domain:
    no match.
  - Left in, by the lead's "nothing will be held back": the IIT AWS account id in the runbook
    (an identifier, not a credential) and the organisational contact addresses of the image
    providers in the permission letters.
- **Repository:** public `the-sauravkumar/immersive-episteme`, `main` pushed from the rewritten
  clone, with a description and topics. No collaborator was added (Ankit's GitHub username is not
  known) and no Vercel project was connected. The local working repository was reset to the
  rewritten `main` only after `git diff` against the old tip showed no difference, and now has
  the GitHub repository as `origin`.
- **Equivalence check:** 1-7 unchanged; the published tree equals the verified build's tree, and
  only the two files above (`.gitleaksignore`, `commit-map.txt`) and this record were added.

## DR-067: Study Invite Links Carry the Code and Target to the Redeem Route in Request Headers (Adopted; walkthrough phase)

- **Found by:** the walkthrough recording. Opening a study link `/study?code=<study slug>&invite=<code>`
  showed "Code Not Accepted"
  (`D:\Work\IIT-KGP\Paper_1-walkthrough\recordings\by-clip\02-a1\20261016-2226\failures\02-study-2d-01-open-the-study-link.png`).
- **Cause:** the proxy (`src/proxy.ts`) answered `?invite=` with `NextResponse.rewrite()` to
  `/invite/redeem?code=…&next=…`, but a rewrite keeps the ORIGINAL query string. The redeem route
  therefore read `code` from the study link (the study slug) as the invite code and refused it, and
  it never saw `next`, so every invite link also lost its target page. Links without a `code`
  parameter of their own still worked, which is why the gate tests did not catch it.
- **Decision:** the proxy sets the invite code and the target as URI-encoded request headers on its
  rewrite (`x-invite-redeem-code`, `x-invite-redeem-next`, `src/lib/access/invite-paths.ts`); the
  redeem route reads them first and falls back to the query. A client sending these headers itself
  gains nothing: the code is still checked by `redeemInvite`, and the target still goes through
  `inviteNextPath`, which only accepts same-site paths.
- **Tests:** `tests/unit/proxy-invite-gate.test.ts` asserts both headers on the rewrite of a study
  link; unit and integration suites pass (156 files, 1897 tests).

## DR-068: Deprecation and Build Warnings Removed; One Unfixable Advisory Recorded (Adopted on the project lead's instruction: "fix all the deprecated warnings as well")

- **ESLint 9 to 10.13.0.** `eslint@9.39.5` is deprecated on npm ("This version is no longer
  supported"). The installed Next.js docs (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`)
  state "`eslint-config-next` supports ESLint 9 and ESLint 10", and that some bundled plugins
  "don't list ESLint 10 in their peer dependencies yet": eslint-plugin-react 7.37.5,
  eslint-plugin-import 2.32.0 and eslint-plugin-jsx-a11y 6.10.2 (their latest releases) declare at
  most `^9`. Their peer range is satisfied with npm `overrides` (`"eslint": "$eslint"`), not
  `--legacy-peer-deps`. Checked: the full lint passes, and a probe file still draws a finding from
  each plugin (react-hooks, typescript-eslint, @next/next, jsx-a11y, the DESIGN.md 15 rules).
- **`@esbuild-kit/esm-loader` and `@esbuild-kit/core-utils`** (deprecated, "Merged into tsx") came
  only from drizzle-kit 0.31.11, the latest stable release. drizzle-kit lists the loader but its
  bundles (`bin.cjs`, `api.js`) never reference it, so an `overrides` entry points it at an empty
  local package, `tools/npm-stubs/esbuild-kit-esm-loader`, whose entry point throws if anything
  ever loads it. Both deprecated packages are gone from the lockfile. Drop the stub when
  drizzle-kit 1.0 is stable.
- **pg: "Calling client.query() when the client is already executing a query is deprecated and
  will be removed in pg@9.0".** Seven research services ran independent queries with `Promise.all`
  on a `Q` that may be a single client (a transaction, or the integration tests' client).
  `queryAll` (`src/server/research/db.ts`) now runs them concurrently on a pool (each query gets its
  own connection) and one after another on a single client. Results are unchanged; the suites pass
  with `--trace-deprecation` and print no deprecation.
- **Build: "Dynamic filesystem access causes tracing of the whole project"** (four places). Paths
  chosen at run time are marked `/*turbopackIgnore: true*/` (the media directory, the migrations
  journal, the parity report root), and the two data files the server reads are listed in
  `outputFileTracingIncludes` (`next.config.ts`). Checked in `.next/server/app/**/*.nft.json`: the
  journal and the report are traced for /admin, /research, /research/dashboard and /.
- **Build: "Failed to find font override values for font `Atkinson Hyperlegible Next`".** Next.js
  has no fallback metrics for this family, so no adjusted fallback face was ever generated.
  `adjustFontFallback: false` states that, and because Turbopack still reports the lookup, exactly
  that notice is filtered with `turbopack.ignoreIssue` (title match only for this family). Moving the
  font to `next/font/local` was rejected: Google serves it as two unicode-range files (Latin and
  Latin Extended), which `next/font/local` cannot reproduce, and diacritics would fall back.
- **npm 11 install-script notice** for `unrs-resolver` (from eslint-import-resolver-typescript): its
  postinstall only downloads a native binding when the platform package is missing. Recorded as an
  explicit `allowScripts` denial; the resolver works (lint above).
- **Not fixable: GHSA-vfj7-8cjw-p6xm** (`braces` <= 3.0.3, uncontrolled recursion, high). It is
  the single root of all 9 audit entries. The advisory lists no patched version and 3.0.3 is the
  latest on npm. `npm audit fix --force` would downgrade eslint-config-next to 14.2.35 and shadcn to
  1.0.0, so it was not run. Exploiting it needs attacker-supplied brace patterns; `braces` runs only
  in development tools (the shadcn CLI, eslint-plugin-next, ts-morph), never on visitor input, and
  `src/` does not import it. `shadcn` moved to devDependencies (the app only imports its CSS, at
  build time), so `npm audit --omit=dev` reports 0 vulnerabilities. Re-check when braces publishes
  a fix.
- **CI:** the three e2e tests that need a 3D participant to pass the study device check
  (study-journey, telemetry-learning, exposure-parity) now skip on runners without a hardware GPU,
  with the reason in the skip. The device check correctly refuses SwiftShader (DR-029), and GitHub's
  standard runners have no GPU; the tests keep running locally on the GTX 1650 (DR-056).
- **Left as they are (not ours, not deprecations):** the Postgres container's initdb "trust
  authentication" notice and git's default-branch hint during checkout.
- **Results:** clean `npm ci` with no deprecation notices; lint, typecheck, 156 test files / 1897
  tests pass; `next build` reports no warnings.

## DR-069: One Continuous Overview Video Instead of Five Clips; Local Test Admin Rotated Before Recording (Adopted on the project lead's instruction: "okay it shouldn't be longer than 15 to 20 mins"; walkthrough phase)

- **Change of plan:** the lead asked for one demo video of about 15 minutes (hard maximum 20)
  covering everything, instead of five clips. Clip 01 (welcome and access, recorded earlier) is kept
  as an extra; clips 02 to 05 are not recorded.
- **How it is recorded:** `walkthrough.mjs --overview` (local only, `D:\Work\IIT-KGP\Paper_1-walkthrough`,
  never in this repository) records ONE take in ONE browser context on the production build, on the
  NVIDIA GTX 1650 (renderer string checked first). It reuses the clip helpers in seven parts with
  time budgets: invite and home (1.5 min), Explore in 2D with a concept, its citation, a figure and
  a comparison (2.5), the 3D museum (3.5), the study in the 2D condition (3), the same study in the
  3D condition, said to differ only in medium (2.5), the staff side (3), and the 2D pages at 390 px
  (0.5). Optional steps of a part are dropped when the part is over budget or the take passes
  17 minutes, and no part starts after 19 minutes. A part that fails is tried once more and, if it
  fails again, is listed as a gap in `chapters.md`.
- **Phone part in the same file:** the page is resized to 390 x 844 inside the take. Playwright's
  recorder does not scale a smaller page up, so the phone view sits at the top left of the
  1440 x 900 frame (checked on a test frame). This was preferred to a separate file because the lead
  asked for one file where possible.
- **Demo museum layout for the journey studies:** the helper `compile-demo-museum.ts` stored the
  manifest as published before writing its element index, which the database refuses
  ("spatial_elements of a published spatial manifest are immutable"). It now stores a draft, writes
  the index and publishes it in the same transaction (demo rows only); the 3D journey now loads a
  walkable placeholder museum.
- **Local test admin rotated first:** the password of the local test admin was in pre-rewrite
  history (DR-066), and the old value was no longer in any local file. Rather than recover it, the
  password was rotated before recording (random 28 characters, Better Auth's own hash, all of the
  account's sessions revoked) and the recording used the new one from the environment. The value is
  stored only outside the repository; the memory note says where, never the value.
- **Result of the recording (take 2 of 2, the one retry):** `00-overview.webm`, 15:39, 1440 x 900, plays (checked in Chromium; a sampled frame shows the caption bar). Parts 1, 2, 3, 6 and 7 are in it: 2D shows a citation, a figure (on a process step) and a comparison; 3D shows the lobby, a doorway walk, the Plan, the In This Room rail and an exhibit with its citation, but no figure. The two study-journey parts failed twice in
  both takes at the same place: after the "questions before you start" page the walkthrough meets a
  second page under the same heading, and the pre-test page then hands on to the device check
  before the script answers it. Whether this is a walkthrough-script race or a study-engine
  behaviour is not settled; it is deferred to the overnight diagnosis and was not changed here.

## DR-070: The Overview Video Re-Recorded Complete; the Journey Failure Was the Walkthrough Script, Not the Study Engine; Study Photographs Shown Only in the Staff Part (Adopted on the project lead's instruction: "I need a single video which include everything and also the chapter approaches"; walkthrough phase)

- **Diagnosis of the DR-069 journey failure (script, not engine):** a reproduction against the
  local production build sampled the URL and the visible level-1 heading every 50 ms after the
  "Questions Before You Start" submit. The address passes `/study/session`, shows
  `/study/questionnaire/before` again for a moment while the old page is still on screen, and
  settles on `/study/pre-test` about 1.1 s after the click. The walkthrough read that transient
  address, ran its questionnaire handler a second time on what was by then the pre-test, and so
  answered the pre-test with the wrong handler; the engine then moved on to the device check and
  the pre-test handler timed out. The participant journal of the failed take confirms the engine
  was correct: the questionnaire was started and submitted once, the pre-test once (1 answered,
  1 skipped: the questionnaire handler fills radio buttons only), then allocation. A real
  participant sees each page once. No engine change and no regression test were needed.
- **Script fix (local, `D:\Work\IIT-KGP\Paper_1-walkthrough\walkthrough.mjs`, never in this
  repository):** the journey acts only on a study page whose path and visible heading agree and
  stay unchanged for 1.5 s, and does not treat the page it has just submitted as shown again unless
  it stays for 15 s. A test recording of the 2D journey then ran from the study link to
  completion (pre-test 2 answered, three questionnaires, post-test, transfer, session completed).
- **Study photographs are not shown to learners in the video:** the six photographs reach the
  2D and 3D learner pages only from a published real release (`servableSql`, DR-037, kept by
  DR-063, because publishing starts the licence terms). The recording publishes nothing and does
  not touch the gate. The 2D and 3D parts show the graph-derived diagram on the first process step
  (Ajrakh, step 1 of 14, the same figure in both conditions) and a caption says the photographs are
  shown to participants once the release is approved. The staff part shows them where staff see
  them: the CMS media library (credits, licences, size cap, Verified state), one photograph in
  detail (credit, licence, "uploaded by Photo ingest (automated)", its linked concept and anchor
  claim), and that concept's CMS page (`ajrakh.tool.wooden-blocks`: Verified, claims and evidence,
  proof). The audit log confirms the uploader/reviewer split (uploaded, linked and submitted by the
  ingest account; reviewed by a curator).
- **Phone part:** the phone view is now a 390 x 720 phone screen centred in the 1440 x 900 frame
  (the real site in a same-origin frame, which the learner pages allow), instead of a small page in
  the top-left corner.
- **Chapters:** every part opens on a title caption; the take writes `chapters.json` (part start
  times in ms, any failed attempts), and `make-chapters.mjs` makes the mp4 with one chapter marker
  per part and one file per part (re-encoded, frame-accurate), cutting out a failed attempt if
  there is one. ffmpeg is the BtbN Windows build `n9.0.2-28-g669f5ab083` (win64-gpl 9.0, release
  `autobuild-2026-10-16-13-04`), zip SHA-256
  `191415610e7ec846f9f01f68cabe8f9d8a5f49c9bcc1379df00b025433b5844c`, matching the release's
  `checksums.sha256`; unpacked to `C:\Tools\ffmpeg\n9.0.2-28-g669f5ab083` and called by full path.
- **Result (take 20261017-0018, one take, no retries):** 16:33, 1440 x 900, on the NVIDIA GTX 1650
  (renderer string checked; museum tier high). All seven parts complete, no gaps, no failed steps:
  Invite and Home 1:29, Explore in 2D 2:36, The 3D Museum 2:18, The Study in the 2D Condition 3:44,
  The Study in the 3D Condition 2:45, The Staff Side 2:56, On a Phone 0:42. `00-overview.mp4`
  (H.264, +faststart, no audio, as recorded) has 7 chapter markers whose start times match the
  take; the seven per-part files match their chapter lengths within 1 s and start on their title
  captions; all files decode without errors. The videos stay on D: only.
- **Server note:** the production server for recording must be started with
  `BETTER_AUTH_URL=http://localhost:3300`; without it staff sign-in is refused as an invalid origin
  (shown to the user as "do not match an active staff account"). RUN.md now says so.

## DR-071: Photo Placement Previewed on a Throwaway Copy of the Database; the Real Database and the Gate Unchanged (Adopted on the project lead's question: "once deployed, will the photos be in every tradition in 2D and 3D, in which section, with screenshots of where they will be")

- **Decision:** answer the question with preview screenshots from a throwaway copy of the database (`CREATE DATABASE episteme_photo_preview TEMPLATE episteme`), dropped afterwards.
  - On `episteme` itself, no release was published and no `first_published_on` was set.
  - No gate, read model or protocol switch was changed. DR-063 stands.
  - This follows the "Never" rule of the `enable-study-photos` skill.
- **What was bypassed, in the copy only:**
  - **Readiness refused**, as expected, because of the open PI rulings:
    - SNAP002: unaccepted traditions, concepts, relationships and sources;
    - REL001;
    - REL002: 312 relationship citations without a locator or quotation.
  - **Taken out of the pipeline:** 1 concept and 4 relationships, all Dabu, which the database refuses to accept because their provenance is "unverified".
  - **Set to `verified` by direct SQL:** every other pending row, as Saurav, with a preview reason. This skipped the per-row curator verification.
  - **Release:** `publishRelease` ran from a copy of `src/server/cms/release.ts` whose only change logs the readiness refusal instead of throwing it.
  - **Unchanged:** the promotion, the snapshot builder (kind "publishable", passed), the database publication triggers, `freezeReleaseFigures` (6 figures) and `stampFirstPublication` (6 assets).
- **Manifests:** four spatial manifests were compiled from that release with `compileAndStoreManifest`; all four were valid. The three-tradition manifest is identical, element for element, to the one the staff preview uses: 457 elements with the same ids, parent rooms and positions.
- **Result:** one production server ran on the copy, viewed in full Chromium on the NVIDIA GTX 1650 at 1440 x 900, with the renderer string checked.
  - **Placement:** every study tradition shows two photographs in both conditions, in the same numbered sections.
    - Section 1, "Tradition and Context": the V&A textile on the historical-context concept.
    - Section 2, "Materials and Tools": the printing blocks on the tool concept.
  - **2D:** the photo is on the concept page.
  - **3D:** the photo is on the exhibit panel in the room of the same name.
  - **Measured on all six:** each photo loaded (natural size equal to the stored 768 px derivative). The caption, credit, licence, alt text, source and displayed size (542 x 360.7 px) are identical in 2D and 3D.
- **Checks on `episteme`, before and after:**
  - published real releases: 0 → 0;
  - assets with `first_published_on`: 0 → 0.
- **Evidence:** in `D:\Work\IIT-KGP\Paper_1-artifacts\photo-placement\` (outside the repository):
  - `PHOTO-PLACEMENT.md`;
  - the screenshots for each tradition;
  - the contact sheets;
  - `measurements.json`;
  - the preview scripts.
- **Server note:** a production server serves locally stored media only when `MEDIA_LOCAL_DIR` is set explicitly. Without it the figure route fails with "Media storage: set MEDIA_S3_BUCKET (or MEDIA_LOCAL_DIR explicitly) in production", and the image box stays empty.

## DR-072: The Parity Run of Record at the Published Tip: 66 Runs, 1,803 Check Results, None Failed (Adopted under the lead's delegation; overnight phase)

- **Context:** the stored interface parity report (`analysis/parity/interface-parity.json`) was
  measured at `f108a4aaf379` (DR-062 era). Since then the merge fixes, the invite-header change
  (DR-067), the dependency and warning changes (DR-068) and the photo and walkthrough work
  (DR-069 to DR-071) landed. The Equivalence Monitor reads this file, so it must describe the
  code that is published.
- **How it was run:** a fresh production build (`next build`, `NODE_OPTIONS=--max-old-space-size=6144`)
  of `f819fc36ee7c` with a clean tree, served by `next start` on :3300 (the only server), then
  `PORT=3300 playwright test tests/e2e/parity.spec.ts --project chromium --workers 1` with
  `--global-timeout` of 8 hours, `PARITY_QUICK` and `PARITY_TRADITIONS` unset (all combinations).
  Full Chromium, headless; the renderer string was checked before the run and is recorded in the
  report: `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F9D) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
  Liveness was checked every 3 minutes (log length and the browser's CPU time, both growing).
- **Result:** 1 test passed in 38.8 min. The report, commit `f819fc36ee7c` (no `+uncommitted`),
  holds 66 runs (5 viewports x 4 themes x 3 traditions, plus the 1024 x 768 and 1920 x 1080 layout
  runs), 33 checks and 1,803 check results, 0 failed. 123 results are partial: P23, P24 and P29
  list their by-design not-measured parts, as in the previous run. Counts are identical to the
  previous run of record; the diff is 328 changed lines of measured values and identifiers.
- **One label to read with care:** the report's `environment` text says "dev server". It is fixed
  text in `tests/e2e/parity.spec.ts`; this run, like the previous one, was against a production
  build. Left unchanged here (changing the spec would change the commit the report names).
- **Equivalence check:** (1) content, (2) exposure, (3) citations, (4) ease once a concept is
  open, (5) navigation, (6) salience, (7) telemetry: all unchanged; only the measurement file
  changes. The parity run itself is the check of 1 to 6 at every viewport and theme.

## DR-073: The Low-Spec Frame Stalls Come From the Headless Shell's GPU Memory, Not the Museum; the Test Harness Is Not Changed Yet (Adopted under the lead's delegation; overnight diagnosis)

- **Context:**
  - On the `low-spec` project (Playwright's headless shell on the Iris Xe), the page received no animation frame for 40 to 120 s, two to five times per C3 tour.
  - The pre-change build showed the same (DR-062), and the GTX 1650 never did.
  - The cause was deferred to this phase.
- **Method:** five single tours on the C3 route, one at a time, on a production build of `065e05a`.
  The renderer string was read before each tour. Results and method are in
  `docs/architecture/immersive-rendering-results.md`, "Low-Spec Frame Stalls: Diagnosis".
- **Findings:**
  1. During a stall the page stays visible and focused, answers within 42 ms and keeps its timers
     running, and no long task is recorded. Only animation frames stop.
  2. The headless shell's GPU process holds shared GPU memory that grows by about 16 MB/s while
     frames are produced. Each stall begins when it reaches about 4.4 GB (4,407, 4,390 and
     4,410 MB). During the stall the Iris Xe's 3D engine is saturated (88% to 120%) and the GPU
     process barely runs. Afterwards memory is at 2.5 to 3.0 GB, and the climb starts again.
  3. The museum's own textures and render targets are 77 MB.
  4. The full Chromium build on the same Iris Xe, with the same page, throttle 4 and route, did not
     stall: 24 rooms, longest frame gap 250 ms. It is a copy of the installed build with no Windows
     GPU preference, which Windows gives the Iris Xe.
  5. With no CPU throttle, the headless shell still stalls, so the CPU throttle is not the cause.
  6. On the GTX 1650, the full build's GPU memory stays flat (shared 63 to 65 MB, dedicated 169 to 217 MB).
- **Decision:**
  - The stall is recorded as an artefact of the measurement browser on this machine, not a property of the museum. The exact component inside the headless shell is not established.
  - No rendering parameter and no test project was changed.
  - Low-tier frame-gap figures (C3 stalls, C4 frames over 50 ms) measured on the headless shell describe that browser. They are not evidence about smoothness on integrated graphics.
  - The p50 and p95 values between stalls (16.7 / 16.8 ms) stand.
- **Recommended route, for the lead (not applied):**
  - **Change:** move the `low-spec` project from the headless shell to a separate copy of the full Chromium build that Windows maps to the Iris Xe (a `GpuPreference=1;` entry for that copy, or no entry, as here), keeping CPU x4 and 1366 x 768.
  - **Then:** re-run the low-tier set and C3 as the run of record.
  - **DR-056:** its rule ("low-spec on the Iris Xe") is kept; only the browser build changes.
- **Equivalence check:** (1) to (7) unchanged. This is a diagnosis and a documentation change only;
  no code, content, exposure or telemetry changed.

## DR-074: The Stage Template, Cloth States, Product Images and Door 1 Course Built From One Record; the Merge Plan Is a Proposal (Proposed for the lead: the note's open Granularity decision; other choices adopted under the lead's delegation, "No questions")

- **Context:** the concept note (Sections 5, 6, 10) asks for a common stage template per tradition, captions from sourced claims, one set of images, and a panel course generated from the template. The drift audit (C1 to C5, K3, K8, K17, A3) found none of these. Note Section 12 leaves granularity open.
- **Merge plan (proposal, `content/study/merge-plan.json`):** nine stages per tradition, the top of the note's example range of 7 to 9, merging adjacent fine steps only. A test checks adjacency and every PRECEDES link.
  - **Ajrakh, 14 to 9:** saaj + washing; kasano; khariyanu + kut; pa + gach + dhori gach; indigo; washing out resists; red dyeing; tapano; vichharana + finishing. Pa + gach + dhori gach is the largest merge; the alternative is a tenth stage.
  - **Sanganeri, 13 to 9:** block carving; scouring + harda; mordant printing + ageing; washing + alizarin dyeing; sun-bleaching; dabu; indigo; yellow + alum; final washing.
  - **Machilipatnam Kalamkari, 12 to 9:** block carving; scouring; myrobalan; kasim + karam; curing + degumming; boiling + sun-drying; second printing; alum dip; soaping.
- **Sanganeri block carving:** it has no PRECEDES link. Options: Stage 1; merged into mordant printing; left out. Chosen: Stage 1, because its title says preparatory, mordant printing REQUIRES it, and Machilipatnam's chain opens with carving. Its place before scouring is this plan's reading, not a sourced order, so it should not be a scored pair in a Sequence item until the lead rules.
- **Names:** short forms copied from source titles, joined with `And`; a test rejects any short form the title does not contain. Local names are split mechanically: a bracket matching `local_terms` is the local name; a title that opens with a local term and a gloss in brackets swaps them; a bracket holding a comma list stays out of the label. `restoreTitle` rebuilds every title, tested.
- **Title Case:** the shared `titleCase` leaves minor words lower case ("and", "of"), while DESIGN Rule 17 says every word. Template names pass through the helper and then capitalise what remains, so they match DESIGN's own `Station N Of T`. The helper is unchanged because 200 existing call sites depend on it; the mismatch is for the lead.
- **Captions:** one or two whole existing claims, selected in the plan. Sources are the claims' evidence, unchanged, so OCR damage in the Sanganeri quotes is shown as it stands.
- **Items:** from USES links only. Links in `needs_evidence` are excluded under DESIGN Section 14 and DR-060: Ajrakh Tari (two stages), Sanganeri Mogri, Machilipatnam Buffalo Milk. Stages with no items: Ajrakh 9; Sanganeri 9; Machilipatnam 1, 5, 9. Door 1 then gives the cloth the object column's width. The Machilipatnam carving stage has no tool because its block is a PRODUCES link, not USES.
- **Model ids:** an explicit rule table in `scripts/content/build-stage-template.ts` maps each item to a catalogue stand-in. A material's stand-in form (powder, paste, liquid, lumps) is a visual placeholder and states nothing about the material.
- **Station kinds:** `boil` on Ajrakh red dyeing names the heated copper pot, though the source says gently heated. No kind names Sanganeri's mopping; `soak` names its alum dip. Kinds set station form only.
- **Cloth states:** proxies made by classifying each source photograph into colour layers and recolouring them per stage over a real linen weave (Poly Haven Rough Linen, CC0). Motif sources differ per tradition: MyKutch for Ajrakh, V&A O481213 for Sanganeri, Rooftop for Machilipatnam. Raw cloth is the linen scan neutralised to cream. Carving stages do not change the cloth, so their state equals raw. The colours follow claim wording where a claim names one and are otherwise agent judgement, so they make no craft claim and carry the `Proxy Cloth State` mark in review builds.
- **Products:** chosen on quality at the largest size (L9): Ajrakh 6, Sanganeri 3, Machilipatnam 6. The Met piece (4000 px tall) and the Commons coverlet were left out because their pages do not attribute them to Machilipatnam, which an Attribution item would rely on. `ProductImage` gained `widthPx` and `heightPx` so rails divide by real proportions without layout shift.
- **Door 1 beyond the specimen:** DESIGN Section 7 specimens one to three objects. Four to six use a two-column grid, with five giving the first object a full row. Rendered and looked at; the lead has not seen it.
- **Help and Pause text:** added in `src/features/process/domain/guidance.ts` so both doors can open the same words (Rule 13). This is agent-written interface wording, not a craft fact.
- **Equivalence:** Door 1 and Door 2 read one template and one set of files. Door 1 is not yet wired into the study engine, and no parity report was run.
- **Paper implications:** nine stages per tradition keeps the traditions comparable and is the template the Sequence and Cloth State items depend on. A change to the merge plan regenerates everything through `npm run content:stage-template`.

## DR-075: The Study Engine Follows Concept Note Rev2; Procedure, Pacing, Test Types, Delayed Test, Logging, Parity and Analysis (Adopted under the lead's delegation; "no questions, take the recommended route")

- **Context:** The drift audit (P, M, L and S items) found the engine running the earlier design: a concept map before learning, fixed time, free exploration, no delayed test, and a parity gate that refused the note's pacing. Concept Note rev2 sections 4, 5, 7, 8 and 9 and `DESIGN.md` sections 0, 3 and 11 bind this work.
- **Order of a session:** consent, background, pre-test, device check, allocation with the tradition order, entrance, practice, introduction, learning, common questions, immediate test, transfer, concept map, layout sketch, SUS, delayed test.
- **Decisions taken while the lead was away, for ruling:**
  1. **Device check before allocation, one rule for everyone.** The note asks that the check carries no door implication, so nobody can be told apart by device before assignment. A device that cannot render Door 2 is refused or retried for every participant, including those who would have drawn Door 1. This narrows the sample to people with a suitable device, and it removes differential exclusion. A failure after assignment still follows `webglFailurePolicy`.
  2. **Stratification.** Allocation is permuted blocks within two pre-test bands. The default cutoff is 2 correct items, a placeholder until the pilot shows the real distribution. A skewed split does not break balance, since blocks run inside each band.
  3. **Tradition order.** All six orders of the three traditions are used in permuted blocks of six, per condition and band, drawn from the allocation seed and stored on the session.
  4. **What counts as visited.** A stage counts once the server has recorded entry; there is no minimum dwell, because time is the outcome. The product panel or hall is a required stop of each tradition. A stop ahead of the first unvisited one is refused, and an earlier one is allowed.
  5. **Cap.** Thirty minutes on the server clock, with a warning 5 minutes before it, the same in both doors. At the cap the server ends learning and records the unvisited stops. Such a session stays in the data and is flagged through the `learning_ends` export table; the analysis rule for these sessions is still to be set.
  6. **Delayed test window.** Opens at day 6, reminder date day 7, closes day 14. The session stays `in_progress` until the delayed step is done or its window has closed, and a schedule row records the state. A window that closes with no return is recorded as missed once that session is next read; the export derives `missed` from the dates in the meantime.
  7. **Reminders.** The platform holds no contact data and gains no mail dependency. Staff export `delayed_test_schedule` and send reminders from their own participant list. The participant keeps a code and a return link. The code alone grants re-entry to that participant's session, so it should be treated as a credential; attempts share the enrolment throttle.
  8. **Primary outcomes.** H1 names two measures, so `test.sequence` and `test.stage_placement` are both primary. No multiplicity correction is applied yet; that belongs in the preregistration. The concept map becomes a secondary measure of relational structure.
  9. **Partial credit.** A sequence item earns the share of stage pairs in the right order; a cloth state item earns the share of images matched. An untouched sequence is recorded as skipped and scores 0, so the shuffled starting order earns nothing by chance.
  10. **Form separation.** Pre-test, immediate and delayed forms use different objects for identification and stage placement. An object is left out of identification when its model id is shared with another label, because its image could not tell them apart; with the stand-in catalogue this may remove many objects until real models exist. An object used at more than one stage is left out of stage placement.
  11. **Transfer.** The account is built only from the Bagru and Dabu records, marked `Sample Text` because neither tradition has been through the source check. An order question is asked only where the PRECEDES links form one chain. The audit's overlap risk stands: about 34% of Bagru's method text is verbatim Sanganeri's. Bagru is used for the immediate form and Dabu for the delayed one until the lead rules.
  12. **Motion sickness baseline.** The SSQ runs after learning for Door 2 only, as the note says. With assignment after the pre-test there can be no Door 2 only baseline, so the earlier pre and post comparison is given up.
  13. **Mixed model without a new dependency.** A random-intercept model fitted by REML with numpy and scipy, using all observed scores. Degrees of freedom are a residual approximation, and the output says so.
  14. **Power.** The 51 per door rests on d = .45 and rho = .6 from the earlier primary outcome. Computed now at n = 51: d = .38 gives power .66 (rho = .6) and .55 (rho = .4); d = .24 gives .32 and .26. For 80% power the n per door is 71 to 93 at d = .38 and 176 to 230 at d = .24. The note calls 51 a floor; the rho of the new pre-test is unknown until the pilot.
- **Parity checker:** The wing, room, manifest, claim and citation checks are gone. It now checks one template per tradition, stage order, byte-identical words and source references, one model id per item, one file hash per cloth state and product image, and that both doors are reachable. A door with no registered view fails, so no study can activate until both doors are merged.
- **Integration points left open by design:** `DOOR_SESSIONS` in `src/app/(learning)/learn/door-session.tsx` and `DOOR_VIEW_BUILDERS` in `src/server/research/parity/door-views.ts` are empty until `CourseSession` and `WalkthroughSession` are merged. The old learning UI still serves `/learn/*` until then.
- **Evidence:** the test counts for this change are in the commit report. Items that were not run are named there.

## DR-076: Both Doors Wired Into The Study, The Old Doors Deleted, The Whole Journey Run (Adopted under the lead's delegation; "no questions, take the recommended route")

- **Context:** DR-075 left `DOOR_SESSIONS` and `DOOR_VIEW_BUILDERS` empty, and `/learn/*` still served the old pages and the old museum. Concept Note rev2 sections 5, 7 and 10 and `DESIGN.md` sections 3, 4 and 11 bind this work.
- **Wiring:**
  - Thin adapters in `src/app/(learning)/learn/` (`course-door.tsx`, `walkthrough-door.tsx`, `practice-doors.tsx`, `door-progress.ts`) translate door events to `learning-progress`. On finish the learner goes to the `next` URL the server returns.
  - The product stop is `products`, number stages + 1, in both doors.
  - A refused entry (`stop_ahead`) returns Door 1 to the panel the learner was on and reports that panel again, so a lost report cannot lock the learner out. In Door 2 the server journal holds the refusal (`study.stage_refused`).
  - Progress reports are now sent one at a time. Sent together, a stop's "left" could reach the server before its "entered" and be lost.
- **Practice:** the 5 to 10 minute minimum is gone for both doors, with `familiarisation.minutes`. The start and the elapsed time stay in the journal, so practice is still timed apart.
- **Parity:** `courseView` reads Door 1's panel models and `walkthroughView` reads the painted words of Door 2's plan, so a door that paints or prints other words fails. Planted differences are tested in `tests/unit/research/door-views.test.ts`. Sources in Door 2 come from the template stage, as its Sources dialog does.
- **Tokens:** one file, `src/styles/walking-tokens.css`, one scope `.walking`, with the self-hosted fonts. The study shell now carries the scope, so study pages are `--vat` pages. Atlas components there take the turmeric, square corners and the two typefaces through aliases.
- **New telemetry event:** `source_opened`, both doors, because both sessions report it and no existing event fits (`citation_opened` needs a concept id).
- **New migration, not asked for:** `0023_manifest_not_required` drops the database rule that a study with an immersive condition needs a spatial manifest. With the compiler deleted, no study could otherwise activate. The manifest tables and columns stay. Their removal is for the lead.
- **Faults the journey found, all fixed:**
  1. Pressing Next on the second-last screen of a paged form submitted the form, because React reused the button and the click finished as a submit. The last question of the background form and pre-test was never asked.
  2. `/study/return` needed the participant cookie, so the delayed return link could not work from another browser.
  3. Three concept maps were owed but the loader always served the first, so a session could never leave that step. The editor also kept the previous map's concepts under the next map's prompt.
  4. The transfer account said "in no particular order" while each stage title kept its source number, which gave the answer.
  5. A returning browser restarted telemetry numbering at 0 and every delayed-test event was quarantined. The server now passes the next number.
  6. Study pages were a dark box on a white page. The sketch canvas pointed at a missing plaster file. Door 1 stills read as pasted patches on rough plaster, and the concept map opened as overlapping nodes running off the left edge.
- **Decisions taken while the lead was away, for ruling:**
  1. **Identification items.** With stand-in models almost no object has its own model, so the immediate and delayed forms had none. They now fall back to stand-in objects whose distractors have other models, and each carries a visible `Sample Text` mark. A real study needs real models first (DESIGN Section 13: no such mark in a final build).
  2. **Demo studies and the concept map.** A demo snapshot may not hold real concepts, so a demo study reads concept labels from the knowledge tables. A real study still reads its snapshot.
  3. **Door 1 cell ground.** A flat `#D2C4B6` replaces the rough plaster behind the stills, added to DESIGN Section 4. Section 7 asks for plaster, so the better answer is stills rendered on the plaster itself.
  4. **Interface parity report removed.** `analysis/parity/interface-parity.json` measured the deleted pages, so the Equivalence Monitor now reports no run. The monitor, its P1 to P33 list and the colophon table still describe the old suite and need replacing.
  5. **Kept for now:** the concept figure balance in the CMS media page, the knowledge components the CMS uses, and the exposure and navigation timing events. Nothing in either door uses them.
- **Equivalence check:** (1) content, words and files come from one template and are checked per door; (2) exposure, same 30-minute server cap; (3) sources, same list behind each caption and the product credits now in both; (4) ease, Help and Pause open the same text in both, with Door 2's movement line added; (5) navigation is the variable; (6) salience unchanged; (7) telemetry, the same stop events in both, with Door 2's extra movement events.
- **Open faults in Door 2's runtime, which the rebuild's main session owns, so they are not fixed here:**
  1. Ajrakh Station 4 arrives with no shed, walls or drying frames. The painted words float in the air in front of the horizon hills. It happened in both runs that reached it, and was still there 60 seconds after arrival.
  2. Pressing Back while the guided walk is still arriving stops the walk at the yard's first point, because `walkTo` does not clear `autoArriving`. Back also walks forward through the yard before it turns round.
- **Evidence:** the run numbers are in the commit report. Items that were not run are named there. The last full journey run was stopped by the system for low memory after Door 1 passed; Door 2 and the cap passed on an earlier build of this change.

## DR-077: Test Items And Telemetry Changed After The Final Adversarial Review (Adopted under the lead's delegation; "no questions, take the recommended route". For the lead's attention: every item below changes what a study delivers or records)

- **Context:** the final adversarial review confirmed faults in test validity and in what the doors record. Concept Note rev2 section 8 asks for "shuffled stage cards" and section 9 for time per stage, revisits, back-steps, total time, and for Door 2 path, dwell, approach, viewpoint changes, wrong turns and walking apart from viewing. It does not settle the items marked "conservative route".
- **Test items:**
  1. Stage Placement options no longer list the stages in process order, which exposed the Sequence answer. They are shuffled per participant and item.
  2. Pre-test options are shuffled per participant and item, with "I do not know" always last. Identification keys were always first and placement keys were always s1 or s2, so an always-first responder scored 5 of 8 and entered the high stratum.
  3. Cloth State stage selects are shuffled too. The review named only placement and identification; these lists showed the same process order, so the same reason applies (conservative route).
  4. Stand-in Identification items skip the objects used by the pre-test placement items, as DR-075 item 10 requires. The form sizes stay 12 and 6, overlap goes from 6 to 0.
  5. `db/seeds/study-test-items.generated.json` is regenerated. `seedTestBattery` skips an existing code and version, so a database already seeded keeps the old items until it is seeded with `--battery-version 2`. No participant data exists; if any did, its items would differ from these.
- **Telemetry and session state:**
  1. Door 1 `stage_left.activeMs` excludes Pause, Help, open Sources and a hidden tab, as Door 2 does. Moving to another panel closes Sources. Excluding open Sources in Door 1 follows the contract "paused time is excluded", though the panel stays visible beside the sources (conservative route: the same rule in both doors).
  2. Stop reports go through one ordered ledger (`src/features/study/stop-ledger.ts`). A lost report is retried with back-off, and nothing after it is sent first, so visit order stays true. The learner sees a notice while reports are delayed and is not stopped.
  3. A refused stop, or a finish refused for unvisited stops, returns the learner to the stop the server expects, in either door, with a notice. Nothing goes on unrecorded (conservative route: the note does not say what to do).
  4. `recordStageEntered` treats a repeat of the stop that is already the last visit as the same visit, so a retry whose first reply was lost adds no false revisit.
  5. `recordStageLeft` adds to `stage_visits.active_ms` and moves `left_at`, rather than overwriting. One visit can now have several exits: a reload, a resume, a refused finish. The same sum is what `stage.total_ms` reports from events.
  6. Resume continues at the session's last recorded visit, in the same tradition and stop, in both doors, with no `stage_entered`, so a technical restart adds no revisit or back-step. No event marks the restart; a gap in client time and a new path segment show it. The server clock keeps running during the gap, as before.
  7. `path_sampled` carries `metadata.segment`, and `walk.path_length_m` is measured within one segment and tradition. `STAGE_METRICS_VERSION` goes from 1 to 2. This removes about 300 m per tradition change.
  8. The exit of the open stop is emitted on unmount, on `pagehide` and on the cap, before the sink is released. `stage_left` in Door 2 now always comes from the runtime's counters, with its movement and viewpoint events, including the hall. A page restored from the back-forward cache reloads, because its stop was already closed.
  9. `TelemetryProvider` flushes and `LearningSessionFrame` unbinds in a microtask after unmount. React runs passive cleanups parent first, so doing this synchronously dropped the children's exit events.
  10. A refused or failed Door 1 finish reopens the stop and can be retried. Back works until the server accepts. `stepCourse` no longer has a terminal state.
  11. `learning_ended_at` is clamped to `learning_ends_at`, so a late return no longer records minutes beyond the cap. The reason stays `cap_reached`.
  12. The door pages pass `firstSeq` from the stored events, so a reload with no outbox cannot reuse sequence numbers.
- **WebGL failure:** a throwing engine constructor, a rejected `start()` or a lost context writes `study.webgl_failed` and applies `webglFailurePolicy`, in practice and in learning. A rejected `start()` can also mean a failed download rather than a GPU fault, and the entry cannot tell them apart. Under `exclude` that could exclude a participant over a network fault. Taken as instructed; the lead may prefer `retry` as the study's policy, which is the default.
- **Architecture:** `features/walkthrough/application/walk-engine.ts` is the port; `src/app/(learning)/learn/composed-walkthrough.tsx` composes the runtime. The architecture test now fails on any ui and infrastructure import in either direction, and a test plants violations to prove it.
- **Licensing record:** `tex/raw_cotton/diff.jpg` is classified CC0. It has the same pixel size as the Poly Haven Rough Linen colour map at its adding commit, with luminance correlation 0.988 at full scale, and differs in colour. The stills are this project's renders of CC0 inputs; `door1-first-panel.jpg`, seen through Door 1 in the entrance stills, was opened and shows only the practice panel and plain cotton, so the review's unverified worry about motifs there does not hold. Strips carry the status of the cloth file they are cropped from, so motif strips stay on the to-be-licensed list. Fonts are recorded from their shipped licence files; where each `woff2` was downloaded from is not recorded.
- **Rationale and evidence:** unit tests in `tests/unit/study`, `tests/unit/course`, `tests/unit/research/stage-metrics.test.ts` and `tests/unit/architecture.test.ts`. Nothing here has been run in a browser or against the real runtime; the runtime's new `dispose()` contract is coded against as stated by the main session.
- **Paper implications:** report that option order was randomised per participant with "I do not know" fixed last, that active time excludes pauses in both doors, and that a technical restart is not counted as a revisit. Any data gathered before this record is not comparable on these measures.

## DR-078: Materials Must Look Like Themselves; The Look Sheet And Asset List Corrected After Verification (Adopted under the lead's delegation; "no questions, take the recommended route". For the lead's attention: 46 of 58 material rows are rendered on an inferred or provisional colour)

- **Context:** the lead asked "are the materials stored in pot, or any utensils have same color as they do in real life? (like Camel Dung, Indian Madder, Indigo, etc)" and said "make sure materials are not overlapping, textures are not tearing when come close and nothing is of low and pixelated quality". Both are now rule L12 in `DESIGN.md` Section 0, with a Section 13 checklist item. Two research files were written for this and an adversarial check found neither fit to use: the quotes were real, but about 16 rows marked sourced had colours their evidence did not establish, and the asset list had unusable downloads and no liquids.
- **`docs/research/substance-looks.json` (58 rows, from 55):**
  1. New status `inferred`: the colour rests on analogy, another craft, another state, a low-reliability source or a result on cloth. Now 13 sourced, 27 inferred, 16 partial, 2 needs-lead.
  2. New fields: `renderHex` on every row, the value the renderer uses; `renderBasis` evidence, inferred or provisional (12, 26, 20); `renderNote`; `transparency` clear, translucent or opaque (10, 18, 30) with `transparencyBasis`; `surfaceBasis` (25 evidence, 33 inferred); `conflicts`. A null `colourHex` always means provisional. New evidence tags: `transparency`, and `context` for a quote kept for the record that does not establish the colour.
  3. Clean water and alum baths are clear with a null `colourHex`, so there is no invented tint and the rejected grey-blue cannot return. Wash and rinse water render as clear water, `#EEF1EC`, stated as provisional. Dung rows with no evidence of their own take the cow-dung row's dark brown, `#4A3A28`, stated as provisional. That row is itself inferred from a general encyclopaedia description of cow dung; its locator now names the Fertilizer section and each cow-dung row cites its craft.
  4. Rows with no colour left after checking: rice starch (the quote was about rinsing raw rice), tamarind paste (needs-lead), dhawai flowers (the quote was flowers on the living plant).
  5. Sanganeri harda rows cite Sanganeri's own S1 PDF p. 14 in place of Bagru text; the Bagru passage contrasted Bagru with Sanganer. Kalamkari's two myrobalan liquids and the Ajrakh and Sanganeri baths share one inferred hex, as no source justified a difference. The Sanganeri cloth takes the same inferred grey-cloth hex as the other two, as "gossamer white" described finished turbans.
  6. Machilipatnam `alizarin-and-red-roots` is split into alizarin (the template row, powder, sourced), madder root (inferred, species differs) and chay root (sourced colour, historic only, Sengupta p. 72). The two extra rows carry `partOfTemplateLabel`. A separate myrobalan solution row covers the second printing, where S4 p. 12 uses a solution, and the powder row now covers only its own stage.
  7. Conflicts now recorded on the row, not resolved: tamarind paste pale (supplier sheet) or red (dranshublog); kasim in earthen pots (Sengupta) or a stone pot in the ground (S4); karakkaya as flowers (S4) or fruit of Terminalia chebula (S6, Ajrakh GI); dhawri as galls or flowers, with Bagh naming dhavdi as Woodfordia; kut's two recipes; the alum type in Ajrakh. The `matt€r` OCR text is restored verbatim.
- **For the lead, every row with `renderBasis` other than evidence is a list to check by eye.** Filter the file on that field. Open questions most likely to change what is on screen: whether the printed tamarind paste is red; the colour of dung as held, for camel above all; the shade of the hot red baths, the least supported hex in the sheet. Every hex in the sheet is an estimate from words; none was sampled from a photograph.
- **`docs/research/asset-candidates.json` (119 rows, from 115):** each row now has `factsVerified`, `corrections`, `usableAsDownloaded`, `physicalSize` and `pxPerMetre`, and `isScan` has a basis and may be null. All 47 Fab rows are marked unverified. Bitumen is rejected at 205 px/m, and the Indian chulha scan is rejected as rough. The broom's bristles have no alpha, so it is unusable as downloaded. Brass Pot 02 is a 367 mm saucepan. Hessian has no mask and a 269 mm tile. The mineral specimens carry their sizes and the Wieliczka copyright note is flagged. Stone Well is 67k triangles. New rows record that liquids are shaded and not sourced, and which needs have no candidate.
- **`docs/research/needs-lead-account.md`** lists what would most improve realism behind a login or payment, Sketchfab free account first. Nothing was acquired.
- **Rationale and evidence:** `docs/research/tools/verify_substance_looks.py` checks every quote. Of 123 distinct quotes: 70 exact on the cited archived page, 8 on the cited page after normalising whitespace and punctuation, 10 on the thesis page, 7 in archived web copies of project sources, 4 in `tradition.json` only because no archived page exists (the Bagh GI alum line, whose Wayback PDF returned a stub, and three Krishna district lines), 24 in archived copies of web sources; 0 failures. All 40 template material items match exactly one row. Web copies are in `D:\Work\IIT-KGP\Paper_1-artifacts\looks-check`.
- **Not done by this record:** nothing here changes the running scenes. L12 and its checklist item cannot pass until the renderer uses these rows, fills join the scene check, and template models agree with material forms. Asset facts for Fab are unverified, and 3840 by 2160 was not used in the asset checks.
- **Paper implications:** describe material appearance in the environments as an estimate from cited words, with a stated share inferred or provisional, not as measured colour. No template label, caption or stage text changed.

## DR-079: Materials Built From The Look Sheet (Adopted under the lead's delegation, 2026-11-05)
- **Context:** rule L12 and DR-078. The scene coloured materials by form, used one blue material for every bath, rendered lumps as flat-shaded facets, took linear values as display colour, guessed fill sizes, and left fills out of the scene check. Door 1 used one image per model.
- **Decision, data:** `src/features/process/domain/substance-look-rows.ts` is generated from `docs/research/substance-looks.json` by `npm run content:look-rows`, and a test fails if the two differ. Form decides the vessel: liquid in a pot, paste and powder in a bowl, crystals in a bowl, dung, roots, flowers and leaves in a basket, cloth in an open crate.
- **Decision, template models:** only `modelId` changed in the three templates (14 values). One item keeps one model id, because the parity check requires it; it is the vessel of the item's first stage. An item whose form changes between stages (Kalamkari myrobalan and alum) shows the vessel of its own stage in both doors, from its look row. The generator takes vessels from the look rows. Hammer and spoon stand-ins are replaced by built washing-paddle, carving-chisels and brush-and-kalam models, still marked stand-in, and the hammer and spoon models are deleted.
- **Decision, colour:** hex goes through `THREE.Color` in sRGB, the filmic curve is inverted for the yard's sun, and rendered colour is measured against the row. The result is reported by form, and the per-form gains are the only tuning. Clear rows are judged by what shows through, not by delta E.
- **Decision, geometry:** vessel floors and inner walls are measured from the real mesh per angle and height. Liquids, pastes and powders are grids fitted to those radii, with a tuck of 1.5 mm into the wall. Piles are packed so that covering spheres, built from the actual vertices, never overlap. Scans are projected with a triplanar shader so nothing seams or stretches, and recoloured by luminance times the row colour.
- **Decision, baths:** vats, rings and tanks are now real sunk structures, floor at -0.72 m, with a real opening in the ground, because clear water must show a floor. The land disc moved to -0.9 m. The cloth now runs on continuously under the surface, changing from before to after at the mid-point. A stage with a copper vessel tool now gets a copper ring in Door 2, matching Door 1.
- **Decision, Door 1 and tests:** panels and test images use one still per material and one per bath or tray colour. This changes 47 test item images. Because the battery's selection rules read `modelId`, regenerating also changed its contents: 93 items became 95 (1 removed, 3 added) and 10 items changed their options. Both doors see the same images. The lead should confirm this before the battery is used; no participant data exists under the earlier battery as far as this agent can see.
- **Not resolved:** 46 of 58 rows still render on an inferred or provisional colour (DR-078). Scene shimmer on benches exceeds the slow-pan budget, mostly from cloth print, bricks and the basket scan. Copper uses a scanned patina metal, with a colour chosen for a dull working vessel and not sourced. Built tools are stand-ins.
- **Paper implications:** describe material appearance as rendered from cited words with the stated inferred share; the measured delta E is against that estimate, not against a photograph.


## DR-080: Mechanical Checks For Overlap, Tearing And Density (Adopted under the lead's delegation, 2026-11-05)
- **Context:** rule L12 asks that nothing overlaps, tears or pixelates. Earlier evidence was close-ups and a bounding-box scene check that covered only part of each scene. The lead named boundary walls, painted names, plaster and the printing table among others.
- **Decision, reach:** "nearest reachable" is derived, not assumed. `domain/reach.ts` floods the walkable cells from the walk line, using the colliders and the body radius, then takes a distance transform. The controls fix the eye at 1.6 m and only pitch changes, so a low or high camera does not exist for a learner. The body radius rose from 0.32 m to 0.6 m so that the code matches the 0.6 m in Section 10.1. Posts, frames, table legs, the folded stack, the sheets and any cloth at body height became colliders, because the camera could walk through them. Benches moved from 2.75 m to 3.2 m off the cloth line and the walk line from 1.85 m to 2.18 m to keep a channel, and the line now steps around the cloth where it falls past the gap.
- **Decision, overlap:** every fill vertex is raycast against the real vessel mesh with a triangle grid (`domain/mesh-probe.ts`): rays in 16 directions, each with tilts, plus a cone downwards. A vertex fails if it is not enclosed or if it sits inside a closed part of the wall. Woven and slatted vessels have gaps, so 11 of 16 directions are enough; a vertex just outside a wall covers about half. New rules are through-bench and unchecked-mesh, which fails any mesh not registered with the check. Every mesh in yards and the entrance is now registered. A further check casts rays behind each painted name.
- **Decision, tearing:** `tools/walkthrough-lab/surface-audit.ts` draws object ids and depth from the nearest eye position, twice, with a sub-pixel camera offset. It reports per object: pixels that swap to another object at nearly the same depth (depth fight), colour change between the offset renders, thin far-away gaps inside an object (cracks), and back faces seen on a single-sided material (missing faces). Limits are derived and sit in `domain/surface-density.ts`. Woven, slatted and piled things have real gaps and many tiny edges, so cracks do not count for them, their flicker limit is 3% and not 1%, and depth fight is not counted against instanced pieces.
- **Decision, density:** on-screen texels per pixel at the nearest reach at 3840 by 2160 come from real UV and world areas (5th area percentile, median for cloth, whose folds stretch area) and real texture sizes. Facet size is the sagitta of curved edges in pixels, 98th percentile, at each edge's own reach but never nearer than 0.6 m, limit 1 px.
- **Decision, surfaces:** a fine detail layer from existing scans now sits on earth, brick, limewash, timber, the crate and the basket, faded out by 6 m so that it adds no far shimmer. Painted words are a blurred coverage field thresholded in the shader, so their edges stay sharp at any distance; they are judged by the Section 8.3 floors and by eye, not by texels per pixel. Boxes have true bevels, where before a third of each face leaned into the corner. Plaster tile is 2 m everywhere. Bamboo poles and turned tools take their side count from their radius. The crate and basket get one pass of Phong tessellation. Cloth has 78 columns and adds rows only where it bends. No new assets were downloaded.
- **Decision, copper:** the colour is the measured copper reflectance (0.955, 0.638, 0.538 linear; Lagarde, "Feeding a physically based shading model"), squared. The plain value read as pale mauve under this sky. Squaring stands for light bouncing twice on a worn surface and is a judgement, not a measurement. The scan supplies only variation.
- **Faults the checks found:** root pieces were built inside out; the hall's followed-cloth label hung 0.35 m past its board; Kalamkari product names ran past their boards, so they now take two lines at 0.09 m (over the 0.085 m floor) without the middle dot; long next-station names ran across the gap; the vat floor had a 1 mm hole; piles sat in the woven floor; the fold wave lifted the cloth at the join on the printing table, which showed the table through a tear; the height field the cloth settles on had a 0.4 m cliff inside the baths, which tore submerged cloth into steps, now a continuous ramp to the bath floor.
- **Decision, shimmer:** far print and painted words sample with a larger mip bias (1.5 and 1.3), which only acts when minified. Translucent dye baths are now opaque, because at 0.975 opacity streaks from the submerged cloth showed; their rows' translucency is therefore not rendered in baths.
- **Not resolved:** printed textile photographs are limited by their sources, 512 to 1952 px/m against 3456 needed at 0.6 m, and rely on the weave normal up close. Cloth state files stay at about 590 px/m at design, with the weave as the fine layer. Tools built here are stand-ins of unsourced shape. Passing by detail layer means the fine grain is real scan data but not the base scan's own detail. Limits on tearing and facets are derived.
- **Paper implications:** report these checks as the method for visual quality claims, with the reach derivation and the limits stated as derived.


## DR-081: Door 1 Shows Each Material As Itself, In Files That Do Not Name It (Adopted under the lead's delegation, 2026-11-05)
- **Context:** rule L12. Door 1 already had one image per look row, but the images were small in a wide frame, baskets looked sparse, clear water looked like an empty tank, and the file names stated the answer. An identification item could carry `/walkthrough/stills/materials/ajrakh-harde-myrobalan.jpg` beside the question "What is this called?", and the path reaches the browser.
- **Decision, names:** every object still now lives at `/walkthrough/stills/objects/<hash>.jpg`, the FNV-1a hash of its id: the look row key for a material, the model id for a tool, the model and liquid colour for a bath. Door 1 cells and test items read the same path from `stageItemStillPath`. A hash can be reversed by anyone who hashes the known ids, so this stops reading the answer off the path, not a determined attacker.
- **Decision, test items:** only image paths changed in `db/seeds/study-test-items.generated.json`. Every other line is the same, so selection rules, item keys, options and counts are unchanged. `config.target.objectKey` still names the object in the stored item; `assessment-step.tsx` does not pass `target` to the browser, so it was left alone. Any database already seeded keeps the old paths, whose files are now deleted; `seedTestBattery` does not overwrite an existing assessment version, so a local demo study needs a new battery version.
- **Decision, framing:** `fitStillView` frames the mesh points that stand above the ground at 80 percent of the frame, from one fixed three-quarter direction, at field of view 24 degrees. The Door 1 cell mask fades the outer 8 percent of the image rather than 18 percent, so the tighter frame is not cut into. The Kalamkari alizarin, madder and chay item stands its three vessels in a triangle, not a row.
- **Decision, what a learner sees in the vessels (both doors):** pile pieces no longer hang on a steep wall. A piece must rest on the floor, on another piece near its centre or on two contacts, or on a wall that flares enough to hold it. Dung lumps are smaller and more numerous, crystals stop at 58 percent of the bowl height, pastes sit at 54 percent instead of 66 so the bowl's low rim keeps them in, and flowers keep a wider margin from the woven wall because three vertices touched it. Clear water has an opacity of 0.78 with a body at 0.1 of its row colour, because at 0.1 opacity a tank looked empty. Neerani's froth is more and finer bubbles. Dry loose dust uses its scan at a third of the scale, because at full scale it read as wood chips. None of these numbers is sourced; they are judgements about the form, and the row's hex is unchanged.
- **Decision, removed:** 19 named stills, the `materials` and `tools` folders and 21 manifest rows are gone, replaced by one `objects/*.jpg` row. Stills of models that no stage shows (for example `bucket`, `pot-brass`, `tub`) are deleted outright; `crate` stays as a hashed file because practice uses it. A test fails on any file in `objects` that no stage or practice panel uses.
- **Decision, lab:** `tools/walkthrough-lab/panel.tsx` renders the real practice panel component, so `door1-first-panel.jpg` now has a recorded way to be made. Before this it had none in the repository.
- **Not resolved:** the same pile, cloth or powder look appears for materials whose rows give the same form and colour: three dungs, three cotton cloths, three myrobalan powders, dusting agents and sawdust, dhawri and dhawai. Their still files are byte-identical. That is what the sheet says, and it is not a defect in the renderer, but learners cannot tell these apart by eye, and the lead may want the sheet to separate them. The identification test still excludes distractors sharing the target's model id, so a material's vessel can narrow its options; this existing rule was kept as asked. Clear water's tint is a judgement, not the row's colour measured: tanks now read as grey-green water and cloth under it is harder to see in Door 2. Seen in the stills and left: crystals read as rounded beads rather than broken lumps, and the wood shows between them; baskets stay sparse, with the weave visible under the pieces; pastes carry dried-mud scratches from their scan; Neerani's froth reads as separate white beads; madder highlights go pink; "Dhawri / Tamarisk Galls" draws as florets because its row's form is flowers, which the lead may want to check; the printing table's grain repeats visibly, as it does in the yard. Door 2 still shows objects in the scene while the test shows these files to both doors, which is the existing design (Section 11).
- **Paper implications:** report that test images are the same files for both doors and that Door 1 learners saw those exact images during learning while Door 2 learners saw the same look rows in 3D.

## DR-082: Liquids, Piles, Cloth And Checks After The Close Review (Adopted under the lead's delegation, 2026-11-05)

- **Trigger:** the lead asked whether stored materials have their real colour and asked that nothing overlap, tear or pixelate. A close review of commit 0ff15d6 found the faults below.
- **Decision, liquids:** clear rows draw no colour of their own. The surface shows only what it reflects, so cloth and floor keep their colour under it. Translucent rows have an opacity set by the depth of liquid at each point, so a pot is thin at its wall and full in the middle. Baths have a body layer 20 cm down. Cloth takes the liquid's colour with depth and reaches it at that layer, so no cut shows. Cloth carries a wet band above the surface. Foam and scum are drawn in the surface shader from the row's own words. Separate bubble meshes are gone.
- **Procedural, disclosed:** foam and scum are procedural shader marks, resolution independent. This departs from L4's scan preference for a close surface. No CC0 scan of froth was tried. The lather and scum colours have no source and stay flagged.
- **Decision, piles:** every pile rests on a bed of the same material in shade, so the vessel floor no longer shows. Pieces lean on one another. Pile shading darkens faces that look down, because the yard shadow map is too coarse for pieces this small. Crystals are irregular chips of varied size on a bed of the same matter, from the row's words "matte as powder". Florets are crumpled pieces, not stars, since the form is unsourced for dhawri. Camel dung's lump form stays unsourced and is flagged.
- **Decision, surfaces:** words in a row's surface now pick the surface, for example "granular", "fibrous", "sticky" and "coppery". Paste carries almost no scan relief, so different pastes share no scratch.
- **Decision, cloth:** cloth length is measured along each thread after the cloth settles, so weave and print no longer stretch at bends. Cloth lies straight over a ring rim and drops along a straight line, which removes the ridges. The print runs on from the piece before, and in baths the two states blend over about 1.2 m under the liquid. The weave baked into state files came from a linen scan shrunk 13 times too coarse. It is removed from the builder. The shipped files were cleared with a median filter, because the source photographs were not on this machine, so the builder has not been rerun.
- **Decision, structure:** the tie board stands outside the posts. The tray fits its bench. Final Wash And Finishing and Soaping And Final Sun-Drying change kind from finish to wash, so they have a tank. Stage names, captions and labels are unchanged. Camel Dung and Cow Dung at the bleaching stages now show their solution in a pot beside them, in both doors. A colour tray carries its stage's first paste, not the base cloth. No source says the pad looks like this, so it remains a rendering choice.
- **Decision, identification test (for the lead's ruling):** the rule read the vessel id, which no longer identifies an image. It now reads the still. A label is left out only if another label shares its still. Distractors come from the same vessel first, so the vessel cannot give the answer away. Items whose material colour is inferred or provisional keep the Sample Text mark. Other items lose it. The forms changed: 23 immediate items, 13 marked, and 9 delayed, 6 marked. The battery should not be used until the lead accepts this.
- **Decision, flags:** review builds of Door 1 now mark an object Colour Not Sourced when its row is inferred or provisional. Door 2 has no review mark and shows these colours like any other.
- **Decision, checks:** frame parts are checked against each other, with joints declared. Cloth is checked against boards. Tools are checked against their bench edge. The fill count is tied to the plan. Facets are measured on meshes of every size. Flat shading is a failure unless declared. The flicker allowance for open work is gone, and the crack exemption now belongs to woven vessels and piles by declaration. Check-only data is built only when a check asks for it.
- **Removed:** seven unused models (47.7 MB), their catalogue and manifest rows, and helpers used only by tests.
- **Not resolved:** whether any colour matches real material. The figures measure against the sheet's hex, and most rows are inferred or provisional. Printed textiles remain limited by their source photographs at nearest reach. Thread structure was added on top, but the print itself stays soft.
- **Paper implications:** report that translucency is a rendering model set by depth, and that the identification battery changed after these images changed.

## DR-083: Reference Photos Enter The Look Sheet As A Fourth Basis, "photo" (Adopted under the lead's delegation, 2026-11-05)

- **Trigger:** rule L12 and the lead's question whether stored materials have their real colour. Research gathered 225 reference entries across 65 assets. `docs/research/material-references.json` keeps source page, direct URL, author, licence, size, what each shows, sampled colours, size evidence, shape, surface and limits, with file names only. Local copies sit in the scratch folder and go to `D:/Work/IIT-KGP/Paper_1-artifacts/refs`.
- **Decision, basis:** `renderBasis` gains "photo": `renderHex` is the sampled middle value of a real photo of the material, with `photoFile`, `photoPage` and `photoLicence`. A photo of a material elsewhere is not evidence of what a workshop holds, so a photo row counts as unsettled exactly as inferred and provisional rows do. Door 1 review builds still mark it, and `status` did not change. Every `renderNote` says a camera value is not albedo. A test holds these rules.
- **Decision, rows moved (10):** camel dung #A3978E (dry pellets, Qatar); dusting agents #8E674A (Ajrakh floor under khattar, one of the three agents named, motion-blurred); dhawri #D8AA67 (Davdi in the pan, one sunlit Barmer photograph); both indigo vats #212531 (foam on a vat at Jangaon, Telangana); both cow dung rows #6B5F55 (dried lumps, Nandurbar); dhawai #964933 (a paper's Dry Flowers panel of Woodfordia fruticosa, about 200 px); sawdust #A27A5B (a basin, not a workshop); Kalamkari madder root #8C5F3A (cut pieces labelled Indian Madder, Rubia cordifolia, Bombay).
- **Decision, colourHex:** `colourHex` and `colourWords` still state what sources say and were left alone on moved rows. Only `renderHex` carries a camera value. The dhawri verify entry ruled that a photo reading must not enter `colourHex`, and the same logic applies to the others. So an indigo vat row now says amber to yellowish-green in words and #7C7A36 in `colourHex`, and renders #212531. That disagreement is real, stated in the note and left for the lead.
- **Decision, madder:** the first draft used a R. tinctorum bundle from Georgia at #6A523F because S4 names that species. S4 names it only among historic sources of red, that bundle is the grey outlier among the lots, and the lead asked about Indian madder. The Bombay lot was chosen and the Georgia reading stays in the note. The species this craft holds stays open.
- **Decision, dung liquids:** the four provisional dung liquids keep #4A3A28. No photo shows them. Their notes now say the value is what the cow-dung rows used to hold.
- **Scene change, one rule:** the sawdust scan was selected by the exact words "dry loose dust". It now matches the word "dust", so the sawdust and dusting rows keep that scan under their new surface words. Cow dung no longer says "fibrous", so it moves from the bark scan to the dry mud scan its cracked crust calls for. Regenerated from the rows: 11 stills, one renamed from `9ca5cfdd.jpg` to `243dedde.jpg` because a bath still is named by its colour, and two image paths in the test item seed. Any database already seeded keeps the old vat path.
- **Rows not moved, and why:** every proxy-only asset (gach, kut, syahi and iron black, red baths, plant additives, tamarisk galls). Sanganeri dabu paste stays #3D342C: pan slurry reads #B68E5C and printed dots read #2F261E to #383029, which fit the row, and whether they are one mix is not stated. Tamarind seed paste and gum binder have photos only of powder and lumps, not of the paste. Sanganeri indigo powder has no powder photo. Kalamkari myrobalan powder stays #B8985A with the two evidence rows for that material, against a pile photo at #8A6C53.
- **Evidence rows, photo differs, not changed, for the lead:** myrobalan powder #B8985A against #8A6C53; alum crystals #EEF0EC against #B5B4B4; chay root #A39B78 against #765B3F, where the median includes shadow between strands; Ajrakh madder #7E4632 against lots from #724429 to #995136; Ajrakh indigo #1F2A55 against a cake photo at #505F89, a different form. Camera values under unknown light do not by themselves overturn a sourced description, but the gaps are real.
- **Disagreement recorded:** the camel-dung verify entry would keep the row provisional at #4A3A28, and a low-grade page says dark brown or black, sometimes grey. Photos read from glossy black to pale buff and do not establish why. This row now renders the dry grey state as a rendering choice, flagged `needs-lead`, and the size 3 x 2 cm to 7 x 5 cm is one Jordanian lot of "pieces". A later row verification may move it.
- **Not resolved:** camera values fed in as base colour through existing surface gains do not reproduce the photo. The camel pellets read cream, not grey, and madder reads orange-tan, not brown. The dhawri pieces read as crumpled lumps at the basket wall, not as flakes, and the madder roots as smooth tubes. The vat shows soft brown blotches where the photo has lilac-silver foam islands. Forms and shading are later work. Six rows draw on photos with no stated licence; none of those photos entered `public/`.
- **Paper implications:** report "photo" as a separate basis from documentary evidence, and report that rendered colour was set from uncalibrated photographs of the material outside the studied workshops.

## DR-084: Verified Row Research Applied To The Look Sheet; Basis And Confidence Replace Flags (Adopted under the lead's delegation, 2026-11-05)

- **Trigger:** the lead's standing instruction that things are researched rather than flagged, and rule L12. Six family researchers answered all 46 non-evidence rows; an independent skeptic checked every answer, and seven conflict checks (kut, tamarind paste, karakkaya, dhawri, alum type, kasim vessel, camel dung) each had a research and a verify entry.
- **Decision, precedence:** where the skeptic upheld a row, the researcher's answer was used. Where it did not, the skeptic's corrected answer, basis and confidence won, and the researcher's fields stood only where undisputed. A skeptic's "keep this hex" was kept even where the researcher proposed a new one, and the reverse.
- **Decision, data model:** every row now records `basis` (the honest basis in words) and `confidence` (low, low-medium, medium, medium-high, high, or unassessed for the nine evidence rows not re-assessed in this round), with `confidenceNote` where words and hex differ. New fields: `formWords`, `surfaceWords` and `variation` hold the researched descriptions; `form` and `surface` stay the short keys the scene reads. `measurements` holds photo readings, which are not quotes. Each new quote names its archived copy in `archive`, under `D:/Work/IIT-KGP/Paper_1-artifacts/looks-check/rows-1105/` or an existing archive folder, so no local user path enters the repo. `conflicts` entries are now outcomes: question, outcome, and what stays unsettled. `frothHex` records the Ajrakh vat froth (#2B202B), which the scene does not yet read.
- **Decision, status:** `needs-lead` is gone. Tamarind paste and camel dung became `inferred`. The three dry alum rows moved from `sourced` and `evidence` to `inferred` and `provisional`, because the alum-type check found no source for #EEF0EC and only analogy for clear crystals. The verifier now fails a row marked sourced whose colour is not rendered on evidence.
- **Decision, renderHex (17 rows):** neerani #4A3A28 to #847055 (derived); Khariyanu resist #EDE9DD to #7A5F3C (middle of the Assal tray range; not white); tamarind paste #D9CBAA to #764E29 (one Flickr session); dhawri #D8AA67 to #C49353 (masked sunlit frame); scouring wash #EEF1EC to #77654C (water-only box); Ajrakh harde bath #AD9048 to #AE7B3E; Ajrakh indigo vat #212531 to #17181D (bare liquid); Ajrakh washing tanks #EEF1EC to #5D7685; both cow dung rows #6B5F55 to #4A3A28; Sanganeri indigo granules #1C2A5C to #28324F (derived, consistent with measured indigo); Sanganeri harda bath #AD9048 to #AE7B3E (carried from Ajrakh); Sanganeri indigo vat #212531 to #2B222B; Sanganeri final wash #EEF1EC to #332627 (screen-print analogue); gum #D7B57A to #F3DCC8 (upper-limit tint); plant additives #7E7148 to #7C6A3C (pressed specimen); Kalamkari indigo paste #27407A to #334659 (stand-in from the printed film).
- **Decision, transparency (16 rows):** to opaque: Ajrakh harde, indigo and red baths, camel dung solution, Sanganeri madder, haldi, harda and indigo baths, Kalamkari rice starch, dung, myrobalan and red baths. To translucent: Ajrakh scouring wash and washing tanks, Sanganeri final wash. Gum to clear.
- **Decision, conditional choices:** cow dung renders moist (#4A3A28) because at its stages the learner sees dung being mixed with water; the dried cake value #6B5F55 is kept in the note, and the state held is unsourced. The Sanganeri final wash renders dark because the learner sees cloth soaking for hours as its mud resist softens and both Sanganer photos show dark water; it is labelled a screen-print analogue. Sanganeri indigo granules take the derived #28324F, which fits every measured indigo body, over the old value, which was more saturated than all of them. The Kalamkari alum printing paste keeps #B86A52: the skeptic allowed the modelled #9C606D but showed that the only measured hue matches #B86A52.
- **Decision, labels:** no label, caption, key or stage text changed. Proposed corrections, with evidence, are in `docs/research/proposed-label-corrections.md` (dhawri as tamarisk galls, karakkaya as flowers, the kut and tamarind paste labels, Karam on the fixing dip, the buried stone kasim pot).
- **Checks:** `verify_substance_looks.py` matches 283 distinct quotes with no failures, and its new row checks (confidence, basis, status, photo fields, flag wording, local paths, conflict outcomes) catch a planted faulty row. The look-sheet test gains the same row checks; its vat still expectation follows the new hex.
- **Not resolved:** three tool stills (both indigo vats and the Ajrakh washing tank) are named by their liquid hex and must be re-rendered, and the generated test battery must be rebuilt to match; until then two look-sheet tests fail. Stills of materials whose hex changed show the old colour. The scene draws a paste as see-through only when translucent, so the clear gum renders opaque; moist cow dung still uses the dry-mud scan; the neerani vat loses its lather cap, as its row now says no foam is sourced on the vat. The alum's chemical type, whether the kasim pot is buried, the yellow material in Kalamkari, the dhawri identity at source and the tamarind marker's shade stay unknown.
- **Paper implications:** report that render values carry a recorded basis and confidence, that 36 of 58 rows render at low confidence, and that the look of most liquids rests on single uncalibrated photographs or derivations.

## DR-085: Clay Vessels, The Colour Tray And Hand Tools Built From The Reference Photos (Adopted under the lead's delegation, 2026-11-05)

- **Trigger:** the burl bowl and the flower pot read as Western stand-ins, the tray pad showed as a pale blue slab, and the tools were plain turned shapes. Rules L4, L5 and L12.
- **Decision, vessels:** `powder-bowl`, `paste-bowl` and `crystal-bowl` now use one code-built clay bowl, and `liquid-pot` uses one code-built pot (`domain/thrown-vessel.ts`, `infrastructure/built-vessels.ts`). Each is a single closed lathe skin, outer wall, rolled rim and a real inner wall down to a floor about 1 cm above the base, with low-order out-of-round (about 1 percent), a rim tilt of 2 to 3 mm, throwing rings in the geometry, rim wear and a few nicks. 128 segments by 150 or 190 rings. A test holds that the fill measurer finds the floor and an inner wall inside the outer one, and that the wall stays thicker than 4 mm.
- **Form basis, inferred:** the pot follows the Village Decor matka diagram (wide squat belly, short neck, plain rolled rim, flat base), a retail photograph and not a workshop one, scaled down to a 27 cm by 20 cm pot. The bowl is a wide flared open bowl. No workshop photograph of a handi, matka, kulhar or clay bowl in dye use was obtained, so both forms stay flagged for the lead.
- **Surface basis, proxy:** `tex/fired_clay` is a seamless 2048 tile cut from the outer body band of the CC0 Poly Haven Planter Pot Clay 4K scan by `scripts/walkthrough/build-fired-clay-tile.cjs`, projected triplanar at 0.36 m per repeat so nothing stretches, tinted toward the retail mid #c46d45 measured in the references. It is a European flower pot surface, not an Indian vessel. The 4K source maps stay out of `public/`.
- **Decision, tray:** the slab pad and its border are gone. The tray is a dark timber box with walls and a floor, holding three pad layers with irregular wandering edges: two under-layers, then a looped top cloth with a lifted hump, loaded with the stage colour from `trayPadLookOf` and darker where the edge has soaked, after kc-73, kc-79 and sanganeri-08. With no stage colour it shows a dull unloaded cloth. The wire-mesh sieve under the felt is named only in text (Meenal Design blog, Sanganer) and appears in no photo, so it is not modelled.
- **Decision, tools:** the block is cut to a motif-following outline with comb teeth at the face, air holes, and a faceted pale handle with two nail holes and an ink-darkened foot, after sanganeri-12 and kc-3-2. The chisels are fifteen handle-less forged rods with upset ends, after sanganeri-16, in one shared InstancedMesh per length. The kalam is a striated bamboo stick with a sharpened cone tip, an oblique back cut and a dark wrapped spindle with crossing threads, after sarmaya-A-kalam. The paddle is one lofted blade and grip, darkened where wet. No photograph shows a washing paddle or a date-palm brush: both stay unconfirmed forms, and the brush is 360 instanced tapered fibres bound with cord to a bamboo stub.
- **Removed:** the `bowl-wood` and `bowl-clay` catalogue rows, which nothing used, and the `wooden_bowl_01` and `planter_pot_clay` models with their manifest rows.
- **Not changed, for the lead:** the basket (`wicker_basket_01`) and crate (`wooden_crate_01`) stay as CC0 stand-ins. No Indian basket photo could be opened, and no workshop photo shows a wooden crate; the photos show cardboard boxes, plastic trays and metal drums. Replacing them needs photographs, not a guess.
- **Paper implications:** report the vessel forms as inferred from retail photographs and the clay surface as a proxy scan.

## DR-086: Pile Fills Built As Settled Instanced Heaps From The Reference Photos (Adopted under the lead's delegation, 2026-11-05; recorded after the fact for commit f41640d)

- **Trigger:** dung, roots, flowers and leaves were single displaced slabs. Rules L4 and L12.
- **Decision:** each pile row is packed from instanced pieces with tight sphere covers (`fill-pieces.ts`, `piece-dung.ts`, `piece-roots.ts`, `piece-plants.ts`, `domain/pile-packing.ts`). Buried pieces draw a coarse mesh.
- **Basis per surface:** `tex/camel_dung_skin` is quilted from the luminance of the asergeev.com camel pellet photo (licence not stated, permission needed) and recoloured to the look row; photo basis for form, row basis for colour. `tex/madder_root_bark` is quilted from Kew specimen K:EBC-000053847 (Rubia cordifolia, CC BY 4.0, 1600 px source quilted to a 2048 tile); it is the madder surface, and only a madder-bark proxy on chay root and on the dried Woodfordia flowers. `tex/dry_leaf_blade` is quilted from Kew herbarium sheet K004414905, a proxy species. Pellet and lump forms are inferred from photos; no Ajrakh source gives pellet size (see the camel-dung conflict research: Sidoroff 2019 pieces 3 to 7 cm, not Kutch dung).
- **Superseded in part by DR-089:** the dried cow-dung lumps, cakes, the wet slab, the dried-fruit pile and their two skins.

## DR-087: Powders As Heaps, Pastes As Worked Masses, Alum As Separate Lumps (Adopted under the lead's delegation, 2026-11-05; recorded after the fact for commit fdbe8e0)

- **Trigger:** powders and pastes were level discs. Rules L4 and L12.
- **Decision:** powders are off-centre heaps with slump scars, a grain normal by grain kind, crumbs and a dust film up the wall; pastes dome, creep up the wall, carry furrows by thickness and leave a wall smear; clear crystal rows are packed broken lumps over a powder bed.
- **Basis:** heap and paste forms are inferred from the reference photos in the material references; colours come from each look row. No new texture: the surfaces reuse the CC0 macro flour, wood chips and Poly Haven brown mud scans.

## DR-088: Cloth Wets Into The Bath; Liquids Reflect A Softened Open Sky (Adopted under the lead's delegation, 2026-11-05; recorded after the fact for commit 4782090)

- **Trigger:** sawtooth cloth where it met vat rims, and dead flat liquids. Rules L2, L4 and L8.
- **Decision:** the rim height field follows the round rim with a soft drape; cloth darkens and wicks above the bath line and takes the bath colour below it. Liquids reflect a second, sun-softened PMREM of the same CC0 sky HDR, with Fresnel, slow ripples and the row's foam and scum.
- **Basis:** wetting darkness and wick height are inferred, not measured. The second PMREM costs GPU memory for the library's lifetime and no per-frame work beyond one shared time uniform.

## DR-089: Close-Review Fixes To Dung, Roots, Flowers, Indigo, Alum, Pastes And Liquids (Adopted under the lead's delegation, 2026-11-05)

- **Trigger:** the real-life, close-up and code reviews of the Door 1 and Door 2 materials (rule L12).
- **Cow dung:** both real rows say "moist, soft, with plant fibre and a dull sheen at damp patches", so every non-camel dung row is now a mass of soft slumped moist lumps with straw fibres on a dung bed, using the CC0 brown mud scan. The dry lump, cake and wet-slab recipes and `tex/cow_dung_crust` (CC BY-SA) are deleted with their manifest and licence rows. The test reads the real rows' surface words.
- **Dried fruit:** no look row has the fruit form, so the fruit fill, its recipe and `tex/myrobalan_skin` (CC BY-SA) are deleted with their rows.
- **Dhawri:** the verified dhawri conflict ruling (verify entry: "drawing small tubular florets and no galls is the best available ruling") is followed, so every flower row is drawn as tubular calyces and the flake recipe is deleted. The dhawri row's colour stays as the sheet gives it until the row-verification run updates it.
- **Camel dung:** pellets are longer olives with a split, fibre-toned end, the pile settles under the rim with no crown, and the skin gain is neutral so the pellets no longer turn lilac. A unit test holds every pellet centre and sphere inside the basket footprint and below the rim.
- **Roots:** madder roots are about 1.7 times thicker with knobbly nodes and no dark bed; chay sheaves are finer and denser, pinched by one thinner tie, with their core ends hidden, and lie on the basket floor without a bed.
- **Indigo cake:** irregular flat slabs with rounded fracture edges replace the box-like pieces.
- **Alum:** fewer, larger lumps (about 2 to 3.5 cm), frosted rather than caustic-veined, settled under the rim.
- **Pastes:** the stroke count, furrow depth and fold direction now vary by row, so no two bowls carry the same relief. A clear paste (the gum binder) is drawn as a level, glossy liquid.
- **Liquids:** the honeycomb bubble stipple and hard-edged scum blotches are gone. Foam gathers in one soft round patch where the row names a flower, otherwise in a band along the walls; scum is a soft coppery sheen; the wall bevel is narrower. Dark-bath foam keeps a visible floor of brightness, and plum or violet rows tint it. Pale translucent baths absorb less light. The wall vector on the tank centre line and at the ring centre was zero, which drew a false wall line; it is fixed.
- **Cloth:** wet cloth takes less sky light, so dark dyed cloth no longer looks hazy; the earlier-state blend at the join is shorter; raw cotton keeps its weave sharp at reach. Folded cloth layers shift by a hash, not a regular sine, so their edges no longer step evenly.
- **Tray:** the pad layers now meet the tray wall with 0.7 mm clearance and follow its rounded corners.
- **Checks:** the wall films trusted a probe hit up to 25 percent beyond the measured wall, which put some film vertices inside the clay wall; they now trust it only within 4 percent, and the scene check passes on every scene. `reflectOpenSky` now throws if the sky has not loaded.
- **Not changed, with reasons:** the block handle stays pale, because the Sanganer workshop photo (sanganeri-12) shows a pale handle on a dark block. Vat lettering stays, because painted names on real surfaces are a Section 9 rule. Vats are not sunk to the rim, because the vat height carries the painted names, the cloth path and the checks. Colours flagged by the review (dabu, lime-gum resist, gach, tamarind, chay, dhawri, camel dung, the three indigo rows, myrobalan, Sanganeri final wash) come from the look sheet and are left to the row-verification run.

## DR-090: Grain Shading Evens Out Where A Piece Is Smaller Than A Pixel (Adopted under the lead's delegation, 2026-11-05)
- **Finding:** after DR-089 the tearing check failed on three piles at their nearest reachable point (about 1.3 m, 960 by 540): dhawri calyces (3.31 percent colour flicker), dhawai phool calyces (3.53 percent) and the Kalamkari alizarin and red roots (2.95 percent), against the 1 percent limit. A calyx there is about one pixel wide, so a 0.3 mm camera move changes which piece each sample hits, and the pixel jumps between neighbouring pieces' tones and between a calyx's lit and turned-away sides.
- **Measured causes, one at a time:** a paler calyx mouth and no contact shade on roots moved it little; no received shadow made it worse (1.96 percent); clamping albedo and dropping specular changed nothing. Bending the shading normal toward the heap's broad up where the normal turns faster than about 0.3 per pixel brought the roots under the limit and the calyces to 1.7 to 1.9 percent. Evening the per-piece and per-vertex tones and the scan contrast by 60 percent at that same sub-pixel scale brought every pile to 0.21 to 0.31 percent. A raised flower bed also passed but showed a flat red floor between sparse calyces at 0.6 m, so it was rejected.
- **Decision:** the shared along-grain pile shader measures `fwidth` of the view normal. Where a piece is resolved (every close view, including 0.6 m at 3840 by 2160) nothing changes. Where it is below a pixel, the normal leans toward the broad up, the contact shade follows it, and tone variation is evened toward its mean, which is what the eye would average at that size. It adds no shader program and no per-item cost.
- **Looked at:** 3840 by 2160 at 0.6 m and 1.0 m, and the standpoint, for dhawai phool, dhawri and the Kalamkari madder root, against the HEAD renders: the 0.6 m frames match, the standpoint reads the same.
- **Kalam stick normals:** the same run's density check failed the Kalamkari kalam stick with flat-shaded facets on 95 percent of its curved edges. `toCreasedNormals` welds corners on a 1 cm grid, so on a 4.8 mm stick every corner of a ring shared one averaged normal and neighbouring faces disagreed. A shared `creasedNormals` now creases at 100 times the size and scales back, which welds at 0.1 mm; the stick's share falls to 0.7 percent, all at the slanted cut. Every former `toCreasedNormals` user goes through it: the kalam stick and wrap, the carved block body, comb and handle, the paddle, the tray walls, and the broken-solid alum lumps and indigo cakes. Looked at 0.6 m against HEAD: the stick reads the same, the carved block's top edge now shades as a clean round instead of a smeared dark band, and alum facets are slightly crisper.
- **Route frames:** the 50 ms worst-frame budget already failed at HEAD (ajrakh legs 117 to 233 ms). A CPU profile of the worst leg put about 500 ms of long-frame time in the indigo-cake normals, whose 1 cm weld made every corner search a crowded cell; the helper above removes it. The next costs were the paste and powder surfaces, built in one go: `fittedSurfaceSteps` now yields after each ring and every caller runs it through `runGradually`. Cloth normals and tangents now yield between them.
- **Asset scripts as modules:** `npx eslint` failed this tree on `require()` in `scripts/walkthrough/optimize-assets.cjs` and `build-fired-clay-tile.cjs`. Both are now ES modules (`.mjs`) with `import`, no lint rule or ignore was widened, and the fired-clay manifest row and `docs/to_be_licensed.md` name the new file.

## DR-091: Station Loading Is Paced Across Frames, Warmed Before It Is Shown, And Decoded Off The Main Thread (Adopted under the lead's delegation, 2026-11-05)
- **Trigger:** Section 8.9 sets a 50 ms worst frame while walking. At dc828da the NVIDIA route walk measured 71 to 141 ms (Ajrakh), 109 ms (Sanganeri) and 110 ms (Kalamkari) on the worst legs, and `route.cjs` printed the figures but passed.
- **Measured causes (CPU profiles, Chrome traces and long-animation-frame attribution on the route walk):** yard building ran as long unbroken tasks and promise chains (cloth `computeVertexNormals` and `computeTangents` 50 to 60 ms each, single pile and grain pieces 16 to 148 ms each, the printing tray pads, painted-word batches); whole 2048 and 4096 pixel textures uploaded in one `texSubImage2D` (15 to 65 ms); shadow-pass depth programs were never compiled ahead, because `compileAsync` covers only the lit pass and three keys shadow programs on a fog-less scene, so a station's first shadow draw waited 20 to 48 ms in `getProgramInfoLog`; first draws of a new yard set up buffers and state in the visible frame; and the decode of the largest product photographs (3840 by 5772) finished on the main thread, stalling one frame for about 40 ms.
- **Decision:** one `WorkPacer` per material library gives build work a 5 ms slice per frame while walking (12 ms while loading) and gives each heavy step a slice of its own; every builder, fill generator and shared factory waits for it. Cloth normals and tangents are computed by a domain generator in steps, bit for bit equal to three.js (unit test). The heavy, vessel-independent piece recipes for the whole route are built during loading. `SceneWarmup` uploads each new yard's textures in 128-row strips, one strip per frame, compiles the lit and the shadow programs with `KHR_parallel_shader_compile`, then draws every mesh once into small targets of the main and shadow formats, a few per frame, before the yard joins the scene. Images are decoded in a worker and transferred. `route.cjs` now fails on any leg over 50 ms and prints worst frames and over-budget counts per leg, for any tradition.
- **Not done:** no quality, resolution, pixel ratio or geometry was lowered. Shadow map size and update rule are unchanged.
- **Result (NVIDIA, machine shared with another agent, so not a quiet-machine timing):** worst frame per leg, stations 2 to 10. Ajrakh 24, 28, 26, 40, 35, 22, 23, 17, 20. Kalamkari 37, 38, 28, 20, 22, 31, 29, 30, 33. Sanganeri 37, 32, 26, 28, 30, 27, 21, 17, 24. Every leg is within 50 ms in those runs. Two of four Sanganeri runs had one stray frame over budget, 53 ms on leg 7 and 68 ms on leg 2, and neither came back in the next run or in an attributed run of the same route. Reach views of nine stations across the three traditions are pixel-identical before and after; standpoint views differ only where `Math.random` paints horizon scrub and word wear, whose draw order shifted.
- **Iris Xe, indicative only (headless shell from `launchLowSpec`, machine not quiet):** one Ajrakh route. Load took 23.1 s. Worst frame per leg was 6632, 15174, 2751, 20361, 71, 21003, 29781, 47 and 3861 ms, with 0 to 4 frames over 50 ms per leg. The multi-second gaps are the headless-shell stalls in DR-073: the page gets no animation frames for seconds. Two legs had no stall, and their worst frames were 71 and 47 ms. These figures describe that browser build and are not a low-spec verdict.
- **Cost:** loading takes about 13 to 14 s, against about 11 to 12 s before, because the route's piece recipes are built up front.

## DR-092: Pile Colour Follows The Row's Hex, Froth From frothHex, Stated Spreads Drawn, Cloudy Soap Water (Adopted under the lead's delegation, 2026-11-05)
- **Froth:** `frothHex` was read by no code. Rows and looks now carry it, and a liquid with a `frothHex` takes its foam colour from it through the same display-albedo inverse as `renderHex`; foam without one keeps the derived lift. A surface saying "froth covers most" of it gives a 0.6 foam share. The Ajrakh indigo vat (frothHex #2B202B, "in a working tank plum froth covers most of the surface") now shows plum froth over most of the vat. Only that row has a `frothHex`.
- **Neerani lather cap not drawn:** the brief asked for a lather cap on the neerani vat. The neerani row says "no foam cap is sourced for the vat" and the upheld verify entry for that row says "do not put a foam cap on the vat as if sourced"; lather is sourced on the cloth. So the neerani pot keeps no foam, and a test holds it. The scouring rinse water keeps its soapy band where its row says "soapy".
- **LookStatus:** "needs-lead" is used by no row and is removed from the type; the sheet test that no row carries a lead flag stays, since it checks data.
- **Dhawri surface:** the row's `surface` said "small loose dry papery flakes" while DR-089 draws calyces on the verify ruling. It now reads "small dry tubular florets, no galls", with `surfaceWords` from the verify entry's wording, `surfaceBasis` inferred, `surfaceConfidence` medium and a `surfaceNote` quoting the ruling ("drawing small tubular florets and no galls is the best available ruling"). The dried colour stays on its photo basis.
- **Why piles were lifted:** every pile form carried a hand-set surface gain (roots 1.68 to 1.84, flowers 1.3 to 1.45, leaves up to 1.6, dung 1.2, camel 1.16) that had been tuned so the masked median seen from straight above, which is full of dark gaps, met `renderHex`. Seen at a standing angle, as at reach and in every Door 1 still, the gaps hide and the lifted surfaces show: the Kalamkari madder root read #AF7F4F in its still against #8C5F3A (deltaE 13.6), chay 12.9, Ajrakh madder 11.2, camel 6.5 and cow dung 6.4. The gains on green and blue above red also pulled the roots toward tan. Tone mapping and the sky were not the cause: powders and pastes, which carry no such gain, sit within about 4 of their rows in the stills.
- **Decision:** pile gains are deleted. Each pile recipe now measures the mean of its own per-vertex and per-piece tones, weighted by its blueprint counts, and the material divides that out, so the average piece surface has exactly the row's display albedo and only real shading (gaps, contact, sun angle) moves it. The bed under a pile takes no gain.
- **Spreads:** rows may carry a `spread` of hex values with shares, and each pile piece is given one of them (seeded by the row key), as a ratio to `renderHex`. Two rows have one, each recorded in a `spreadNote`: the Kalamkari madder root uses the two lot medians its variation names (Kew 53297 #5A3726, Kew 53829 #7F5236, a quarter each); dhawai phool uses the JAHM 'Dry flowers' panel itself, measured here (red-pink p50 #A24A3C 40 percent, in-between p50 #8C5B3D 33 percent, straw streaks mean #CCAD8C 12 percent), which is the row's "red to pink streaked with straw". Lot variation that only says lots differ (dhawri, myrobalan, cow dung states) is not drawn in one heap.
- **Soap water:** the Kalamkari soap water (#EEF1EC translucent, "wet, soapy") absorbed 3 per metre, so the white plaster read through as a flat pale floor. A pale soapy bath now scatters at 16 per metre with a stronger cloud film (0.55), so it reads as cloudy water with soft mottling; the cloth above the water is unchanged and the part just under it is veiled by about half, not hidden. The water stays pale because its row is near white.
- **Measured (lab colour tool, middle and lit tenth deltaE against renderHex; reach view from 0.55 m above, then the Door 1 still view):** Ajrakh madder 6.5/17.5 to 2.4/10.2, still 11.2/21.5 to 5.0/14.3. Kalamkari madder root 6.5/18.4 to 5.5/9.0, still 13.6/22.3 to 6.1/13.9 (now darker red-brown, toward the Kew lots). Chay 11.8/16.4 to 4.2/9.7, still 12.9/15.7 to 5.8/9.1. Camel dung 2.9/11.2 to 1.9/9.0, still 6.5/13.5 to 4.0/11.8. Cow dung 2.6/11.2 to 0.8/8.5, still 6.4/13.6 to 3.9/10.9. Plant additives 1.9/14.6 to 2.7/11.2, still 6.9/17.4 to 3.8/13.9. Dhawri 1.0/9.3 to 1.4/8.5, still 7.1/12.4 to 6.9/12.1. Dhawai phool 1.4/9.5 to 3.4/14.6, still 7.3/12.4 to 9.3/17.6: the distance from the single hex grew on purpose, because the heap now shows the reference's straw-and-pink spread instead of one orange-red. Powders, pastes and crystals were not changed and read the same: their open issues are the glossy pastes' lit tenth (kut 33.9, syahi 38.1, Kalamkari indigo 31.5), which is sun and sky reflection on a wet surface, the clear rows (alum 19.6 to 19.9, gum binder 45.9), whose hex is a clear substance's colour and not what shows through it, and the myrobalan powder, 10.9 from above but 3.9 in its still.
- **Looked at:** 3840 by 2160 at reach for the Kalamkari madder, chay and alizarin table, the dhawai phool basket, the Ajrakh indigo vat and the Kalamkari soap tank, before and after, and the dhawai heap next to the JAHM panel.

## DR-095: Learning Ends Only By The Finish Or The Cap; Delayed Returns After Closing; Sessions End By The Study's Timing; Excluded Sessions Stop; Stage Exits Bounded (Adopted under the lead's delegation, 2026-11-05)

- **Context:** an independent review of the study code reported six faults; a second reader tried to refute each, confirmed five and refuted one (the participant cap counting every enrolment row is the documented design, DR-033). Each of the five was confirmed again by reading the code before it was fixed. DR-091 and DR-092 may be taken on another branch, so this record is DR-095.
- **1. A hub visit ended learning.** `/study/session` called `getCurrentSession(true)`, and `syncPosition` ended learning on any arrival there once `learningMayEnd` allowed it. Paths other than the finish lead to the hub: `resumeStudy` ("Continue your session"), the exit route for a live session, the wrong-door redirect (`condition_mismatch`), the demo start with a live session, the withdraw page's way back and the stop ledger's `leave()`. With `NEW_STUDY_CONFIG` a participant who had visited every stage and then reopened the study after a crash lost the rest of their 30 minutes, and the step was journalled `finished`. With the schema default (no cap) any hub visit ended it.
  - **Decision:** `arrivedAtHub` is removed from `syncPosition` and `getCurrentSession`. Learning ends only by the participant's finish (`finishLearning`, reached through the `finish` request of `/api/study/learning-progress` that both doors and the cap timer send) or by the server clock at the cap. The hub during learning shows the link back to the learning task. Every redirect above keeps going to the hub, which is now harmless.
- **2. Closing a study blocked delayed tests.** `returnWithCode` looked the study up through `findEnrollableStudy`, which requires `active`, so after `closeStudy` ("Ends recruitment.") every return in days 6 to 14 was refused.
  - **Decision:** `findReturnableStudy` accepts `active` or `closed` and is used only by `returnWithCode`; `findEnrollableStudy` still requires `active`, so closing still stops new enrolment. The database already allows this: only new sessions and allocations need an active study (migrations 0005, 0011).
- **3. Sessions nobody can return to stayed `in_progress`.** Only exclusion, a period switch and a refused resume set `abandoned`, and a missed delayed test was only noticed when the session was next read. The purge refused such participants as "still taking part" and the retention list never reached them.
  - **Decision:** `closeStaleSessions(pool, studyId)` ends each open `in_progress` session whose end is already determined by the study's own timing, through the pure `sessionEndByTiming`. It writes nothing but the end (see the review corrections below):
    1. at the delayed-test step it stays live while the window is open or not yet open (`config.delayedTest`, days 6 to 14 by default); once the window has closed the test was missed and the session is `completed` at the later of the close and the last activity;
    2. with every step done and a delayed schedule, it is `completed` once the window has closed, at the later of the window's end (the delayed test's completion, or its close) and the last activity. DR-075 item 6 already said the session stays `in_progress` until the delayed step is done or its window has closed;
    3. otherwise it is ended once no participant cookie can still be valid: the last activity is older than the cookie lifetime (6 hours, `PARTICIPANT_SESSION_TTL_SECONDS`) or the learning cap (`config.exposure.minutes`), whichever is longer. With every step done it is `completed` at the last activity; otherwise it is `abandoned`, keeping its data.
    Each end is journalled as `study.session_completed` or `study.session_abandoned` with `closedBy: "timing"`, so the data says the participant did not press Finish. It runs once before `purgeParticipantData` (a request), once per `purgeRetentionDue` (inside its `listRetentionDue`), on `listRetentionDue` (the study page and `scripts/db/purge.ts`) and once per `buildExportBundleConsistent`. The existing statuses suffice; no migration.
  - **Judgement for the lead:** a session whose every answer is in but whose Finish was never pressed is `completed`, not `abandoned`, because nothing is missing from it.
- **4. An excluded live session kept passing the guards.** `excludeSession` sets only `excluded`; the lookup did not read it, so the step pages rendered while every action failed with "Something went wrong", and the learning page and the hub sent each other the participant in a loop.
  - **Decision:** `StudySessionRecord` carries `excluded`; `resolveParticipantSession`, `resolveLearningAccess` and `/study/allocate` deny it as a session that has ended. The participant sees "This study session has ended. Thank you for taking part." The reason is not shown: it is staff-only (security-05), and the participant is not told they were excluded from analysis. Their data is kept, as before. Withdrawal stays open to them (review correction a below).
- **5. Stage exits were unchecked and additive.** `recordStageLeft` added up to 24 hours per call to the stage's last visit with no session check, so a late, retried or second-tab exit inflated `stage_visits.active_ms` after learning ended and moved `left_at` past the next visit's entry.
  - **Decision:** under the session lock, the exit is recorded only while the session is open (not withdrawn, excluded, completed or abandoned) and only on the session's current visit (its last `stage_visits` row) of the named stage. Each exit adds at most the wall time from the visit's last recorded moment (its previous exit, or its entry) to now, capped by the end of learning (`learning_ended_at`, or `learning_ends_at`), and `left_at` only moves forward to that moment. A replayed exit therefore adds only the time since the exit it repeats, and nothing after learning has ended; the several exits of one visit that DR-077 item 5 allows (a reload, a resume, a refused finish) still add up. Strict once-only delivery would need an id per exit and a column for it; that is not taken, since the bound above already keeps every figure within wall time.
- **Documents corrected against HEAD:** `DESIGN.md` Section 4 named `src/features/walkthrough/scene/constants.ts` and Section 10.2 `src/features/walkthrough/catalogue.ts`, neither of which exists; they now name `domain/yard-plan.ts`, `infrastructure/solid-builders.ts` and `src/features/process/domain/asset-catalogue.ts`. Section 11's consent row now has the form's one checkbox and its buttons, "I do not want to take part" and "I agree to take part". Section 8.7 described a live 3D forecourt; `entrance-scene.tsx` shows three renders of the forecourt scene (shut, Door 1 open, Door 2 open). `git log` shows the stills arriving with commits 35b6473 and 9c2d75e on 2026-11-04, and no decision record chose stills over a live scene, so 8.7 now describes the stills and says so; a live forecourt stays possible. `docs/research/study-decisions.md` D5 said 30 minutes with no early finish; it now records the note's pacing, quoted from Concept Note rev2 Section 9 and matched against a text extraction of the note: "Pacing: self-paced with a 30-minute cap and every stage visited, with time recorded as an outcome. Fixed time would leave course learners rereading while walkthrough learners are still walking." `modules/study-engine.md` S27 is updated for item 1.
- **Review corrections (2026-11-05):** three independent reviewers read the diff of items 1 to 5; four findings were confirmed by reading the code and fixed at the root.
  - **a. Exclusion took away withdrawal (ethics).** With item 4, `withdrawFromStudy` found the session through `resolveParticipantSession`, which now refuses an excluded session, and the exit route cleared the cookie, so a participant excluded while in a session could not record their own withdrawal, which the consent text offers at any point. **Decision:** the participant cookie is resolved for one of two purposes. `resolveParticipantSession` (taking part: steps, learning, assessments) still refuses an excluded session; `resolveWithdrawalSession` (withdrawing) accepts it, and refuses only what has ended (withdrawn, completed, abandoned, a participant no longer active) or does not match. The withdrawal page moved out of the `(session)` group to `src/app/(study)/study/withdraw/page.tsx` (same URL) behind `requireWithdrawalSession`, and reads the session without bringing it up to date (`loadSessionState`, not `getCurrentSession`); `withdrawFromStudy` uses the same resolver. The exit route keeps the cookie of a session that can still withdraw, and `/study` then shows "Your study session has ended", "Thank you for taking part. You can still withdraw from the study." and the withdrawal link, still without the reason. The cookie's 6-hour lifetime bounds this, as it bounds every in-browser withdrawal; after it, withdrawal is through the facilitator, as before.
  - **b. The sweep could create the delayed-test window at the staff action.** `closeStaleSessions` ran `syncPosition`, which calls `ensureDelayedSchedule` for a session at the delayed step without a schedule row (a participant who closed the tab before `/study/session` rendered after the last immediate step). The window was then timed from the export or purge, not from the participant. **Decision:** the sweep no longer runs `syncPosition`. It reads the position from the records only (`positionFromRecords`: a learning phase that has ended or whose cap has passed, an assessment step with nothing to deliver and a reconstruction with every final map count as done, exactly the facts `syncPosition` would journal), and never inserts or updates `delayed_test_schedule`, the missed mark included. With no schedule row it computes the window in memory from the participant's own time, the completion of the last immediate step (`immediateStepsEndedAt`, `delayedWindowFrom`). `ensureDelayedSchedule` uses the same anchor, so a window created on a later visit by the participant is timed from the same moment and not from that visit. A missed window shows in the export through `closes_at` (the export's delayed status already reads `now() > closes_at` as missed) and in the end's journal entry (`position: "delayed_test"`).
  - **c, d. The sweep ran too often and locked live sessions.** It loaded and locked every `in_progress` session of the study, on every study page render and again inside each `purgeParticipantData`, so one retention purge made (due + 1) full passes. **Decision:** the candidate `SELECT` keeps only sessions that can have gone stale: with a delayed schedule, one whose window has closed; without one, one whose last activity is older than the reach (`sessionReachMs`: the cookie lifetime or the learning cap, whichever is longer). A session a participant can still be using is never loaded or locked. `purgeRetentionDue` sweeps once and purges each participant through the inner `purgeOne`, which does not sweep again. The study page keeps its sweep: a read alone would list too few participants as due, and with the filter the pass is one indexed `SELECT` when nothing is stale.
  - **Not changed:** `returnForDelayedTest` still finds a returning participant by their schedule row, so a participant who closed the tab before the hub rendered and whose cookie has expired cannot return by code until the row exists. That predates this record and is left for its own decision.
- **Evidence:** unit tests in `tests/unit/study/engine-rules.test.ts` (`sessionEndByTiming`, excluded sessions in both guards; withdrawal of an excluded session and of a pre-allocation cookie; a closed window at the delayed step; `sessionReachMs`; the window timed from the last immediate step), run and passing (31 tests). Integration tests written but not yet run, because a frame-timing measurement held the machine: `tests/integration/study-engine.test.ts` (hub visits and a resume keep learning open; stage exits; a closed study takes delayed returns and no enrolment; sessions ended by timing), `tests/integration/study-purge.test.ts` (stale sessions purged and listed as due; one sweep per retention purge), `tests/integration/auth-guards.test.ts` (excluded sessions; withdrawal still open to them), the sweep that never creates or moves a schedule in `study-engine.test.ts` and `tests/integration/study-engine-review-fixes.test.ts`.
- **Paper implications:** report that learning ended by the participant's finish after every stage was visited, or at the 30-minute cap; that a session nobody returned to was closed by the study's timing rules (`closedBy: "timing"` in the journal); and that stage times are bounded by wall time.

## DR-096: Staff May Sign In With Google; A New Google Account Gets No Role; Participants Never Sign In (Adopted under the lead's delegation, 2026-11-05)
- **Context:** staff asked for "Sign in with Google" and "Sign up with Google". Until now every staff account was made by an administrator (`scripts/create-admin.ts`, Admin → Users) and signed in with email and password (`emailAndPassword.disableSignUp`). Roles live in this app's `user_roles`, not in Better Auth.
- **Staff only:** the Google provider exists only in the staff auth (`src/server/auth/config.ts`), and the button only on `/sign-in`. Participants never sign in: they join with a study code and stay anonymous under ethics approval CXA/ETH/01, so no participant page, study step or learning door shows or calls Google, and no participant record can hold a Google identity. The provider is off unless both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; `src/lib/env.ts` refuses one without the other.
- **Role-less sign-up:** anyone with a Google account can reach the button, so a Google sign-up grants nothing. The account is made with no row in `user_roles`; with no role it acts as `public` (`src/lib/permissions/can.ts`), which opens no console area. `/console`, every area gate and every page gate send a signed-in account without roles to `/awaiting-access` ("Your account is waiting for an administrator") instead of `/forbidden`. Administrators see these accounts as "Awaiting access" in Admin → Users, filter for them, and grant roles with the existing row action (`grantRoleAction`, audited). A Google sign-up is refused outright when Google does not mark the email verified: `databaseHooks.user.create.before` refuses any user made through an auth endpoint without `emailVerified`; administrator-made accounts are made outside an endpoint and are verified by construction.
- **Linking only on a verified email:** `account.accountLinking` is on with no trusted providers, `requireLocalEmailVerified` and no different emails. Better Auth 1.7.7 (`dist/oauth2/link-account.mjs`) then joins a Google identity to an existing account only when the emails match and Google's `email_verified` is true; an unverified Google email returns `account_not_linked` and no session. Trusting Google by name was rejected because it skips that check. Profile data from Google does not overwrite the staff name (`updateUserInfoOnLink` off).
- **Refusals kept:** a locked account (`disabled_at`) gets no session by either method, because the existing `session.create.before` hook runs for every session. The per-account throttle stays on the email route; the social route has its own rate limit (10 a minute per IP). `/sign-in/social` accepts only `provider: "google"` with no extra scopes, no ID-token shortcut and no extra authorisation parameters, and `/link-social` is refused, so only `openid`, `email` and `profile` are ever requested (the scope list is set explicitly with `disableDefaultScope`, and `includeGrantedScopes` is off). The redirect URI is set explicitly to `BETTER_AUTH_URL` plus `/api/auth/callback/google`, the value registered with Google. OAuth tokens are stored encrypted (`encryptOAuthTokens`). Callback failures return to `/sign-in?error=<code>`, which explains each case in plain words.
- **Content-Security-Policy:** unchanged. The button posts to `/api/auth/sign-in/social` with `fetch` (`connect-src 'self'`); Better Auth's client then sets `window.location.href` to Google's authorisation URL, a top-level navigation that no CSP directive in `src/lib/security/csp.ts` governs (`form-action` covers form submissions only, and nothing here submits a form to Google). Google returns to `/api/auth/callback/google` on this origin. Adding `accounts.google.com` to `form-action` was rejected because it would loosen the rule that forms post only to this origin for no gain; a unit test holds the policy.
- **Button:** Google's branding guidelines (developers.google.com/identity/branding-guidelines, read 2026-11-05): "Continue with Google" is one of the recommended texts; "The button must always include the standard color for the Google "G""; light theme "Fill: #FFFFFF Stroke: #747775 | 1px | inside Font: #1F1F1F"; dark theme "Fill: #131314 Stroke: #8E918F | 1px | inside Font: #E3E3E3". Those values and the four logo colours are named tokens in `src/app/globals.css` and DESIGN.md Section 4. One deviation: the guidelines name Google Sans Medium, and DESIGN.md Section 12 forbids new typefaces, so the button uses the console face at medium weight. The button sits under the email form behind a hairline, 44 px tall like every console control.
- **Paper implications:** none for the study. Staff identity is not study data; participants remain anonymous and no sign-in path reaches them.

## DR-097: Next.js Moves From 16.4.0 To 16.4.5 By A Pinned Install; Route Handlers Stop Setting Content-Length (Adopted under the lead's delegation, 2026-11-05)
- **Trigger:** `next build` stopped with a `SecurityFatalError`: "Your version of Next.js is affected by a known security vulnerability." The npm bulk advisory endpoint flags 16.4.0 for GHSA-673q-mjm6-r5xr (critical, remote code execution in `use cache` functions returning typed arrays), GHSA-2464-fhr4-w9xw (critical, image optimisation with SVG on glibc Linux) and GHSA-p3m5-59mp-jv5r (high, denial of service through Server Actions, which this app uses), all with `vulnerable_versions` `>=16.0.0 <=16.4.0` and patched in 16.4.1.
- **Why 16.4.5:** the v16.4.5 release (2026-11-03) fixes seven more moderate advisories (GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8, GHSA-vvgp-ww4w-46vf, GHSA-rhh4-g77r-r9qj, GHSA-pc58-hwjq-p385, GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2) that the global advisory database did not yet list. Every one covers 16.4.0; mfr8, vc7v, vvgp and pc58 give open-ended repository ranges, so 16.4.1 to 16.4.4 stay exposed to them. 16.4.5 is npm `latest`, keeps the React peer range and `engines.node`, and is the version the CLI's own security target selection picks. The same POST for 16.4.5 returns `{}`.
- **How:** `npm install --save-exact next@16.4.5 eslint-config-next@16.4.5`. `next upgrade --agent=security` was not used: it re-executes through `npx next@canary` and hands the work to an unattended coding-agent session. Next's same-major guide says no codemod is needed. React stays 19.3.0 and sharp stays 0.35.5.
- **Behaviour change kept:** from 16.4.5, `sendResponse` drops `content-length`, `content-encoding` and `transfer-encoding` from route handler responses (`node_modules/next/dist/server/send-response.js`, `FORBIDDEN_HEADERS`), because a decoded upstream body would otherwise be framed wrongly. `/figures/[assetId]` and `/cms/media/file/[assetId]` set `Content-Length` themselves; that header is now discarded, so it is removed from both rather than left as code with no effect. The bodies go out chunked; images, attachments and the exports need no length to download.
- **Not changed:** `experimental.agentUpgrade` stays at its default `'security'`, so later advisories still stop the build. `docs/decisions/0002-feature-dependencies.md`, `docs/deploy/RESEARCH.md` and `docs/architecture/design-reuse-catalogue.md` keep 16.4.0, since they record what was read at the time.
- **Measured after the install (2026-11-06):** `next --version` 16.4.5; `npm ls` shows one `next` 16.4.5, `@next/env` 16.4.5, sharp 0.35.5; the bulk advisory POST for 16.4.5 returns `{}`. `tsc --noEmit` and ESLint pass (0 errors, 5 `no-img-element` warnings), 1844 unit and integration tests and 16 content tests pass, and a clean `next build` finishes with no security notice. Against `next start` on port 3100 with local media storage, signed in as a temporary staff account deleted afterwards: `/cms/media/file/<id>` answers 200 to HEAD and to GET with `Transfer-Encoding: chunked`, no `Content-Length`, and 293238 bytes whose sha256 equals the stored row; the JSON, CSV and zip exports, the dashboard CSV and both scoring exports answer 200 with their attachment names, chunked, and the zip opens with 16 entries. `/figures/<id>` answers 404 for all six stored photos because none is yet in a published release, so its 200 and 304 paths were not reached. No response carried `x-middleware-set-cookie`.
- **Seen, not changed:** the media file route's own `Content-Security-Policy` (`default-src 'none'; ... sandbox`) does not reach the client; the site-wide policy from `next.config.ts` is set first and `sendResponse` appends a route header only when that name is absent. The 16.4.5 patch to `send-response.ts` leaves that logic as it was.

## DR-098: Liquid And Paste Colours Are Judged As Seen In The Vessel; Opaque Liquid Surfaces Make Up The Sun-Softened Sky; Translucent Bodies And Alum Stay Physical (Adopted under the lead's delegation, 2026-11-06)
- **Trigger:** the colour run after DR-092 put many fills far from their rows (gum binder 45.9, Sanganeri alum bath 57.4, haldi 20.4, rice starch 20.2, red baths 16-17, kut lit tenth 33.9, alum lumps 19.6). Measured on NVIDIA (`ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ...)`) with `tools/walkthrough-lab/looks.cjs ... colour`.
- **What the rows mean, read from `docs/research/substance-looks.json`:** an opaque or translucent liquid's `renderHex` is the colour as seen (most `renderNote`s say "Camera value under that photo's own light"). A clear row's `renderHex` is "only the faint surface tint of a transparent body", and the gum binder's `#F3DCC8` is "an upper-limit tint at depth only"; its `colourWords` say "Colourless to faintly yellow, transparent". So a clear liquid or clear paste is judged against what lies under it multiplied by the row tint, not against the tint itself.
- **Measurement (`win.colourOfLook`, `looks.cjs`):** each row is read at reach (the 4K close-up camera, 55°) and from the stage standpoint. For a clear liquid or paste the frame is rendered again with that row's liquid meshes hidden, and the target per pixel is that frame times the row tint in linear light. The mask drops edge pixels and the paste smear on the vessel wall (a transparent, depth-less `substance` layer): the high paste lit tenths (kut 22.2, syahi 23.4, Kalamkari indigo 16.3 at reach) were that thin smear showing the terracotta, not a specular highlight; without it they read 2.0, 1.3 and 1.7. Under 200 pixels is not scored.
- **Cause found for opaque liquids:** the liquid surface takes its sky light from the open sky with the sun softened out (`reflectOpenSky`), so its diffuse term was lit less than the pastes and powders. The scene-light ratio between rendered and row was 0.70 to 0.79 per channel for haldi, harde, myrobalan, neerani and dung (computed through the filmic inverse). The old `DEEP_BODY` 0.72 and `PALE_BODY` 0.38 multipliers darkened them further. Fix: `liquidBodyColour` is the row's display albedo, capped at 0.98 like pastes, and the opaque surface colour carries `OPEN_SKY_FILL_MAKEUP` 1.28. Translucent surfaces keep the plain body, because their body mesh under the surface is lit by the scene sky. The cause of the shortfall is inferred from the code path; the 1.28 is the measured mean ratio.
- **Pale threshold:** "pale" (pale foam grain and low absorption) now means body albedo luminance above 0.5. At 0.23 the Kalamkari myrobalan solution (0.230) became pale, absorbed 3/m and showed the terracotta through (23.3).
- **Translucent bodies stay physical:** uncapped, the soap water body albedo was 1.85 and the tank read as a flat white slab hiding everything under it (0.4 from its hex, but no cloudiness). Capped at 0.98 it reads cloudy and pale with the tank shadows showing through, 8.0/7.1 at reach. Clarity is kept over the number.
- **Alum:** colourless crystal lumps were grey over a grey bed (18.9). The crystal body multiplier goes 0.42 to 0.55 and the crystal bed darkening 0.42 to 0.7, so the heap reads as milky lumps on white powder, as in the Commons photo of alum held by an Indian dyer and the Tawas powder photo; 11.6/8.0 at reach.
- **Left as they are, with reasons:** the red baths' lit tenths (15.8 to 27.5) and Kalamkari's 17.9 middle are grey-blue sky sheen on a rippled hot bath, which the rows name ("grey sky sheen"; the Kalamkari row attributes the duller photo readings to sheen). Clear baths (Sanganeri alum post-mordant 11.1, Kalamkari alum dip 17.5 middle, gum binder 11.2) differ from the tint target by the surface's sky reflection and light net, which the target leaves out; at reach they read as clear water. Standpoint figures on work tanks (Sanganeri final wash 40.4, clear washes 15.9 to 17.1) are grazing-angle sky reflection on still water. Harde and harda powder middles (11.5, 11.1) are the shaded slope of the heap; their lit tenths are 3.7 and 4.0. Sticky pastes (tamarind 18.0, dabu 14.6 lit) carry sheen their rows name.
- **Checks in this state:** tearing on 27 route stages passed (0 failing objects, all four planted faults caught per stage). Slow-pan shimmer (four-plus reversals) on ajrakh n=1 and 3, sanganeri n=7, kalamkari n=6 and 8: 0.158, 0.159, 0.147, 0.218, 0.289 per cent, against 0.158, 0.158, 0.147, 0.218, 0.289 on the previous rendering. `tsc` passes; 170 walkthrough, process and architecture tests pass.
- **Seen, not fixed:** a thin straight line across the Kalamkari soap tank at reach, present before this change (lighter) and darker now; it lies under the cloudy surface, probably where the cloth crosses the body plane. The tearing check does not flag it.

## DR-099: Walking Frames Carry No Unpaced Build Step Or Bulk Buffer Upload; The Remaining Strays Were Another Process On The GPU; Iris Xe Gaps Are The Headless Shell (Adopted under the lead's delegation, 2026-11-06)
- **Trigger:** after DR-091 the NVIDIA route walks still had intermittent strays (a 72 ms render-loop tick, a 33 ms paced step in `WorkPacer.yieldSlice`, 55 to 67 ms frames with no script), and on the Iris Xe headless shell multi-second gaps with its GPU process near 4.3 GB plus non-gap legs at 137, 68 and 55 ms.
- **Method:** long-animation-frame attribution joined to a log of every pacer turn, generator step, render call and slow GL call in the page; Chrome traces with `disabled-by-default-devtools.timeline`, `gpu` and `v8.gc`; GPU timer queries on the frame; per-process GPU engine counters; `renderer.info.memory` and a GL-level count of live textures, buffers and renderbuffers against the GPU process size, on every leg.
- **Causes found in our code:** (1) unpaced work between pacer turns in `buildYard`: the three lean-to poles after the loop, the turned ring and the liquid surface ran as one 29 to 33 ms task; each painted sign drew all its wear marks (up to about 10,000 ellipses) in one step, 29 ms for a large sign; (2) the warm-up's first draw of a mesh uploaded all its buffers in that draw, 10 to 19.5 MB in one task (10 to 17 ms), which also made the task wait on the GPU process (`CommandBufferProxyImpl::WaitForToken`); (3) the shadow stand-ins built as `InstancedMesh` were never disposed, so their instance buffers stayed on the card after their yard left.
- **Fix:** the extra poles, the ring and the liquid surface each wait for the pacer; painted words are drawn by a stepped generator (800 wear marks a step) through `paintWordsInTurn` and `paintCurvedInTurn` in the yard builder, and `paintWords` runs the same steps at once for the entrance and the lab; `SceneWarmup` sends a new yard's index and attribute buffers ahead of the warm-up draws, at most 4 MB and 96 buffers a turn, by drawing zero-count carrier geometries that share the buffers (the carriers are disposed with their geometry), and disposes the instanced stand-ins on release. GC was checked: no collection over 1 ms fell inside any long frame. No quality, resolution, pixel ratio or geometry changed; the scene check passes unchanged.
- **Not our code:** with the fixes, every remaining frame over 50 ms on NVIDIA had no script in it, and the trace showed the GPU process blocked in `DXGISwapChainImageBacking::Present` for 40 to 250 ms. Our frame costs 5.2 to 5.5 ms of GPU time on average (p95 7.2 to 8.8 ms, shadow update frame 7.5 to 9 ms). The strays came while another agent's browser rendered 4K stills on the same GTX 1650 (its GPU process at 37 to 40 percent of the 3D engine) and stopped when it finished.
- **Result, NVIDIA (renderer string confirmed, other GPU browsers 0, free RAM 8151 to 8543 MB, CPU 2 to 29 percent, user Chrome closed):** 5 consecutive `route.cjs` runs per tradition, all passed with no frame over 50 ms. Worst frame per leg over the 5 runs: Ajrakh 9 to 41 ms, Sanganeri 9 to 45 ms, Kalamkari 9 to 42 ms (45 legs each). Before the fix, with the GPU shared: up to 283 ms.
- **Leak check:** over a walk, live textures stay at 72 to 110, live GL texture memory at 1.54 to 2.06 GB and buffer memory at 60 to 103 MB, falling when a yard is released, on NVIDIA and on Iris Xe. Standing still with zero GL allocations by the page, the headless shell's GPU process on the Iris Xe grows 16.7 to 23.5 MB/s, while full Chromium on the same Iris Xe stays flat (-2.7 MB/s) and NVIDIA stays flat (-0.1 MB/s). The growth is the headless shell (DR-073), not a leak in our code.
- **Iris Xe:** the headless shell (`launchLowSpec`), Ajrakh: worst frame per leg 23, 15167, 10090, 35, 27416, 3125, 24291, 25 and 22 ms, its GPU process climbing from 5.7 to 8.9 GB private and free RAM down to 216 MB. Legs without a stall are now 22 to 35 ms (before: 137, 68 and 55 ms on such legs). Full Chromium on the same Iris Xe, not the shell: no multi-second gap on the whole route, worst frame per leg 50, 58, 60, 49, 55, 63, 44, 63 and 38 ms, mean 10 to 12.6 ms, p95 11.9 to 16.9 ms; five legs exceed 50 ms by 5 to 13 ms.
- **Open:** on the Iris Xe the GPU process holds about 5.4 to 6.5 GB for 1.5 to 2.1 GB of textures. Measured per 2048 px texture: three.js's immutable `texStorage2D` upload costs 58 to 97 MB in the Iris Xe GPU process, a mutable `texImage2D` upload with mipmaps 24 MB. Changing the upload path would save several GB on integrated graphics; it was not done here.

## DR-100: Integration Of DR-098 And DR-099; E2E Studies On Battery V4 With An Image Check; Door 1 Liquid Stills Re-Rendered; Hall Textile Shimmer Left For The Lead (Adopted under the lead's delegation, 2026-11-06)
- **Merges:** the liquid-colour branch (f4aab85) and the frame-stray branch (6cdecb0) both wrote DR-098. Both records are kept; the frame-stray record is renumbered DR-099. No code conflicted.
- **Door 1 asked for two missing stills.** The demo studies the e2e suite used pinned test battery v3, seeded before the Door 1 stills were re-rendered under new names, so two identification and placement items pointed at `8ba4da5b.jpg` and `9ca5cfdd.jpg`, which no longer exist. The generated battery (`db/seeds/study-test-items.generated.json`) was already current. **Decision:** the e2e studies take their slug from one battery version (now 4: `demo-walking-v4`, `demo-walking-cap-v4`), and the journey spec fails at setup if any image the pinned battery shows is missing from `public/`.
- **E2E coverage added:** resume and a hub visit keep learning open, then withdrawal (DR-095 item 1); an excluded session ends at once, says only that it ended, and can still withdraw (DR-095 item 4 and correction a); the invite gate (bad code refused, a one-use code refused the second time, a revoked code cannot start a study, a link code admits); a role-less account waits at `/awaiting-access` until an administrator grants a role (DR-096); a content editor uploads an image, a curator's verification is refused while its provenance is "unverified", the editor corrects it and resubmits, the curator verifies it, and a release on unready content publishes nothing. The research dashboard check now enrols its own participant instead of depending on the journey spec's leftovers, and every spec signs staff in through one helper that waits out the per-minute sign-in throttle instead of timing out.
- **Remote bucket, found and cleaned:** `next start` loads `.env.production.local`, which names the deployment's Neon object store, so three e2e test PNGs (18614 bytes each, random noise) were uploaded to bucket `episteme-media` during this work. All three objects were deleted (HEAD before: present; after: absent) and their rows removed. The e2e server now runs with the S3 variables blank and `MEDIA_LOCAL_DIR` in a scratch folder, and the upload test refuses to run unless the media page reports local disk.
- **Door 1 parity after DR-098:** Door 1 object stills are rendered from the same substance materials that DR-098 changed, and had not been re-rendered. All 53 were rendered again on NVIDIA; 15 changed (rice starch, neerani, turmeric, madder and myrobalan pots, the copper, vat and tank baths, alum in all three traditions; mean absolute change 0.13 to 5.24 per channel), and the 20 others differed only in JPEG bytes (mean change 0.00) and were left as committed. Both doors now show the same liquids.
- **Slow-pan shimmer (Section 8.9, at most 0.5 per cent):** measured on all 32 scenes. Eight are at or over: Ajrakh n=6 0.746 and n=9 1.457; Sanganeri n=1 0.500, n=4 0.527 and n=9 2.280; Kalamkari n=1 0.502, n=5 1.108 and n=9 2.564. The same eight read the same at a822ecb (within 0.003), so neither merge caused them. Hiding one object at a time (`window.shimmerByObject`) puts the halls on the printed product photographs (Kalamkari p1 to p6 together 2.23 of 2.56), and the bench scenes on the wicker basket scan (0.17 to 0.28) and the bamboo lean-to (0.19 to 0.23). Giving the hall photographs the cloth's far mip bias (1.5 beyond 5 m) brings the halls to 0.647, 0.274 and 0.472, but the six products then read visibly soft from the standpoint; 0.7 keeps them sharp but leaves 1.077, 0.742 and 1.138. Rule L4/L5 ranks above the derived budget, so nothing was changed. **For the lead:** choose between sharper products and the budget, or fund better-filtered product textures (pre-filtered mip levels) that could meet both. The detail-layer footprint fade was tried and had no effect, so it was not kept.
- **Iris Xe route:** two Ajrakh runs on the headless shell were stopped by a free-RAM guard; the second reached leg 3 with the largest headless-shell process at 7633 MB and free RAM at 291 MB (leg 2 worst frame 34 ms). This is DR-099's open texture-upload cost; the Sanganeri and Kalamkari Iris Xe routes were not attempted for that reason.
- **Removed:** the low-spec Playwright project matched `immersive-rendering.spec.ts`, deleted with the old doors in DR-076; it now matches only the renderer check.
- **Paper implications:** none for the study design. The e2e figures above are engineering checks of the study flow, not study data.

## DR-103: Slow-Pan Shimmer Brought Under Budget On 31 Of 32 Scenes: Kaiser-Filtered Product Mips, Far Normals For The Wicker Basket, A Bamboo Mat On The Lean-To; Strip Uploads Fixed (Adopted under the lead's delegation, 2026-11-06)
- **Trigger:** DR-100 left eight scenes over the Section 8.9 shimmer budget (at most 0.5 per cent of pixels reversing four or more times in 60 frames at a quarter pixel per frame, `tools/walkthrough-lab/flicker.cjs` pan mode, 1366 by 768, NVIDIA): Ajrakh n=6 0.746 and n=9 1.457; Sanganeri n=1 0.500, n=4 0.527 and n=9 2.280; Kalamkari n=1 0.502, n=5 1.108 and n=9 2.564. Re-measured at 7965b44 on `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ...)`: the same figures to 0.001. The measurement is deterministic (repeat runs agree to 0.003), so the figures below are single runs. They are not timings. They were taken with other agents running (free RAM 3 to 7 GB).
- **Method:** each cause was isolated in the running scene by changing one thing at a time on the same page and re-running the pan (shadows, normal map, colour map, roughness, geometry normals, sides, backing shells, contact lift, bloom downsample), and `window.shimmerByObject` was re-run after each fix. A `map = null` probe is not valid on the detail-layer materials: the shader then fails to compile and the mesh vanishes, which reads as "the map causes it". Those probes were discarded.
- **Hall photographs, cause:** the print itself. Shadows, the weave normal map and the fold geometry change nothing (2.566 to 2.550 and 2.559 at most); only the photo's filtering moves it. A pixel reverses four times only over high-contrast detail with a period under about 7.5 px, which a sharp print at 10 to 22 m on a 1366 by 768 frame has whatever the filter quality: GPU box mips at bias 0 read 2.563, Kaiser mips at bias 0 2.430. So the far view has to give up detail above about 0.15 cycles per pixel, and the choice is how much of the band below that survives.
- **Hall photographs, choice by measurement (Kalamkari n=9; mid band = RMS of the frame between Gaussian blurs of 1.2 and 4 px over the textile pixels, high band = RMS above the 1.2 px blur):**

  | Filter | Shimmer % | Mid band | High band |
  |---|---|---|---|
  | GPU mips, bias 0 (before) | 2.563 | 13.16 | 17.18 |
  | GPU mips, bias 1.0 | 0.491 | 11.40 | 7.94 |
  | GPU mips, bias 1.5 (DR-100's rejected trial) | 0.472 | 10.64 | 6.13 |
  | Kaiser mips, bias 1.0 | 0.499 | 11.45 | 7.66 |
  | Kaiser, sharpen 0.3, bias 1.25 | 0.505 | 11.98 | 7.89 |
  | Kaiser, sharpen 0.5, bias 1.5 | 0.522 | 12.34 | 8.26 |
  | **Kaiser, sharpen 0.6, bias 1.75 (adopted)** | **0.467** | 11.38 | 5.54 |
  | Kaiser, sharpen 1.0, bias 2.0 | 0.464 | 11.90 | 4.87 |

  Side by side at 2x, the adopted filter is clearly cleaner than GPU bias 1.5. Sharpen 1.0 at bias 2 keeps more mid band by the number but shows blocky texel steps, so it was rejected by eye. Sharpen 0.5 at bias 1.5 looks best but stays over budget. The adopted filter is still softer from the standpoint than the unfiltered print; no tested filter meets the budget without that.
- **Hall photographs, fix:** `domain/filtered-mips.ts` builds each product photo's mip chain with a separable Kaiser-windowed sinc (radius 3, beta 4), averaged in linear light and re-encoded to sRGB, each level then lifted by a 0.6 Laplacian sharpen. `BitmapDecoder.decodeFiltered` runs it in the decoder worker (the function's source text is carried into the worker, and a unit test proves it runs stand-alone), so it costs no main-thread time. `MaterialLibrary.textileMaterial` uploads the chain as the texture's own levels, and its far bias is 1.75, reached between 3 and 8 m (`PRODUCT_BIAS_RAMP`), so the bias is 0 at the products' nearest reach (0.62 m on every hall).
- **Wicker basket, cause:** shading of the woven geometry. Its colour map (Kaiser mips, bias 0.7 to 1.2), its normal map, shadows cast or received, roughness and sky light, a backing shell behind the open weave, lifting it off the bench and polygon offset all leave Kalamkari n=5 at 1.08 to 1.20. An unlit flat colour gives 0.608 and a lit flat colour 1.124; geometry normals smoothed over 5 cm with the normal map off give 0.839.
- **Wicker basket, fix:** `domain/far-normals.ts` averages the basket's vertex normals over 5 cm (grid-splatted, linear in vertex count) into a `farNormal` attribute, and the basket's shader blends its final normal toward it between 1.6 and 3.5 m. At its nearest reach (1.31 m) nothing changes.
- **Bamboo lean-to, cause:** the 25 open slats against the sky and wall behind them. Hiding the slats takes Ajrakh n=6 from 0.746 to 0.486. Map bias 1.5 or 2.5 on bamboo, a distance fade of its normal map, uniform roof normals and closer slats (0.074 m apart, 33 slats: 0.655) do not get it under budget.
- **Bamboo lean-to, fix:** a split-bamboo mat (12 mm, the same bamboo scan) lies on the slats, 2 mm clear of their widest node, as on a real lean-to roof. With the basket fix: Ajrakh n=6 0.452, n=9 0.352. Leaving the slats unshadowed as well gained 0.008 more and was not kept. From the yard the roof now reads as a flat pale mat rather than corrugated poles; the slats still show from under it.
- **Found and fixed on the way:** `SceneWarmup.uploadInStrips` copied a texture onto itself with `copyTextureToTexture`. On three 0.186.1 that is a framebuffer self-copy, so the texture keeps the empty storage it was allocated with: a lab test filled a texture red through the old path and read back `[0,0,0,255]`, and through a fresh carrier texture `[255,0,0,255]`. The strip upload now copies from a carrier, level by level, so the product mip levels are uploaded in strips as well. Whether the old path ever showed an empty texture in a real walk was not checked.
- **Tried and dropped:** a 4-tap filtered bloom downsample (1.109, 0.746, 0.527 on the scenes it was tried on, unchanged), a 1.5 or 2.5 far bias on bamboo, a bamboo normal fade, Kaiser mips for the basket colour map.
- **Result, all 32 scenes (`flicker.cjs` pan, NVIDIA):** practice 0.117, entrance 0.221; Ajrakh n=0 to 9: 0.258, 0.167, 0.173, 0.182, 0.117, 0.159, 0.456, 0.341, 0.173, 0.358; Sanganeri: 0.135, 0.373, 0.209, 0.258, 0.283, 0.150, 0.121, 0.155, 0.113, 0.113; Kalamkari: 0.097, 0.375, 0.205, 0.180, 0.174, **0.839**, 0.121, 0.233, 0.138, 0.307. 31 of 32 at or under 0.5.
- **Not met, Kalamkari n=5 (1.108 to 0.839):** after the basket fix the remaining shares are the shed caption paint 0.111, the cloth leaving the yard 0.105, the root piles in the baskets (chay root 0.104, plant additives 0.045, madder 0.039), the three baskets' silhouettes 0.028 to 0.042 and the shed wall 0.040. The piles are many thin root pieces at about 3 m; the caption already takes a 1.3 far bias. Each needs its own fix (far normals or a far form for pile pieces; a longer far bias for captions beyond the reading spot), and none was made here.
- **Close-ups at nearest reach, 3840 by 2160, NVIDIA (`tools/walkthrough-lab/closeups.cjs`; before from 7965b44, after from this change):** all 15 product photographs at 0.62 m, the four wicker baskets at 1.31 m and the lean-to at 0.64 to 0.65 m in five scenes. Products and baskets are unchanged at reach, looked at side by side (including the Kalamkari p4 print at 1:1). The lean-to's nearest view moved because the mat changed the nearest point; its slats and posts are as sharp as before.
- **Checks:** scene and overlap check on all 32 scenes, 0 hits, every planted fault caught. Tearing on the eight touched scenes: 0 failing objects, all four planted faults caught in each. Density on the same eight: 0 failing surfaces, planted faults caught in each; the product photographs read 2.18 to 2.24 colour texels per pixel at 0.62 m. `tsc` reports only the 43 missing generated Next route types (`PageProps`, `LayoutProps`, `RouteContext`), the same 43 as 7965b44 in a fresh worktree; ESLint is clean on `src/features/walkthrough`, `tools/walkthrough-lab` and the new tests; 92 walkthrough and architecture tests pass, 8 of them new (`filtered-mips.test.ts`, `far-normals.test.ts`).
- **Paper implications:** Door 2's hall photographs look softer from the hall standpoint than before (same files and words; Door 1 unchanged), and every lean-to roof gained a mat. See the methods note.

## DR-104: The Admin Users Result Is Announced By One Live Region Owned By The List; Long Timers Never Exceed The Timer Maximum (Adopted under the lead's delegation, 2026-11-06)
- **Defect 1, the vanishing confirmation:** in Admin → Users filtered to "Awaiting access", granting a role made the account match the filter no longer, so its row left the list with the refresh that carried the result. The success message lived in that row, in its own `sr-only` live region, so a screen-reader user heard nothing; sighted users saw nothing either, because the region was hidden. A unit test showed a second cause: the row's form reported success from an effect, and when the row is removed in the same commit that delivers the result, that effect never runs, so even a region outside the row would not have been told.
- **Decision:** `UserActionStatus` (`src/components/admin/user-forms.tsx`) is one polite live region (`role="status"`, `aria-live="polite"`) per page, rendered by the list in `src/app/(admin)/admin/users/page.tsx` above the table and the empty message, present and empty from the first render so assistive technology registers it before it changes. Each row reaches it through a context, and the announcement is made by the row's action call itself once the server answers, not by an effect in the row, so it arrives whether or not the row survives. The message names the account, because the row may no longer be there to give it context: "E2E Waiting (address): Researcher role granted." The grant and remove messages use the role's label instead of its key. A row outside the list throws, so a new page cannot drop the region by accident. The region is keyed by the filter and page, so a stale result does not follow the administrator into another view.
- **Visual form:** staff screens still use the Atlas tokens (DESIGN.md Section 1), and the console's existing success line is the `ActionForm` status paragraph (`text-body text-ink-2`, polite). The new region uses the same classes, so the result reads like every other console success. When empty it is `sr-only`, so it takes no space and adds no gap. The cotton toast of DESIGN.md Section 6 belongs to the rebuilt study surfaces; using it here would put a Section 4 surface on an Atlas screen.
- **Defect 2, the overflowing timer:** `LearningSessionFrame` passed the delay to the learning cap straight to `setTimeout`. A unit test with a cap of 2099-01-01 asked for about 2.28e12 ms, and Node printed `TimeoutOverflowWarning: ... does not fit into a 32-bit signed integer. Timeout duration was set to 1.` Browsers do the same, so the cap and its warning would have fired at once. A real cap is 30 minutes away, but `endsAt` comes from the server and a mis-set clock or a long cap must not end learning early.
- **Decision:** `setLongTimeout` (`src/lib/timers/long-timeout.ts`) is the one place that sets these timers. It never hands the platform more than `2^31 - 1` ms; a longer delay is re-armed in steps until the whole delay has passed, a past or unreadable delay runs at once, and it returns a cancel function. Refusing the delay was rejected because it would silently drop the cap; clamping alone would end learning about 24.8 days early.
- **Evidence:** `tests/unit/admin/user-action-status.test.tsx` (one region, present and empty; the confirmation stays after the granted row leaves a filtered list; a row outside the list is refused), `tests/unit/study/long-timeout.test.ts` (the 2099 cap reaches `setTimeout` as exactly `2^31 - 1` and raises no process warning; re-arming runs once after the full delay; past, unreadable and cancelled delays), and the learning-cap test in `tests/unit/study/test-item-fields.test.tsx`, which now fails on the old component with two `TimeoutOverflowWarning`s and passes on the new one. The e2e step in `tests/e2e/staff-and-access.spec.ts` checks that the region is empty before the grant and, after the row has left the filtered list, shows and announces the confirmation, against a production build on port 3500. Run 2026-11-06: `next build --webpack` (Turbopack refuses a worktree whose `node_modules` is a junction outside its root) and `next start -p 3500` with `BETTER_AUTH_URL` set to that port and media on local disk; the step passed in 5.6 s on full Chromium (the fixture's NVIDIA renderer check passed), free RAM 5645 MB before and 5321 MB after, under a 1 GB free-RAM guard. `tsc --noEmit` and ESLint pass; 175 unit tests in the admin, study, shell, design-scan and architecture suites pass. No timing or memory figure is claimed, so the quiet-machine wait did not apply.
- **Paper implications:** none for the study design. The learning cap behaves as specified (30 minutes with a warning); the fix only removes a failure mode for out-of-range caps.

## DR-105: The Invite Gate Admits Only Staff Roles; Withdrawal Covers Every Session; A Reassigned Participant Is Analysed Once; Clay Vessels Stop The Sun (Adopted under the lead's delegation, 2026-11-06)
- **Trigger:** seven review findings against `walking-the-process` at 7965b44. Each was confirmed by reading the code or by running it before anything was changed. DR-101 to DR-104 are left to the parallel workflow branches, one of which already uses DR-104.
- **Invite gate (confirmed, fixed).** `hasSiteAccess` let any signed-in Better Auth account through, so a Google sign-up with no role (DR-096) could start the public demo or enrol in a live study without an invite code. Now an account passes only when it holds a staff role (`roles.some(isStaffRole)`, the same test that `telemetry/principal.ts` and `learning-decision.ts` apply). The proxy still treats a session cookie as admitted, because it cannot read roles without the database. Such an account can read the public information pages and nothing more. RUNBOOK 6.4 now says this. Tests: `tests/unit/access/site-access.test.ts` (it fails against the old code), and the awaiting-access e2e signs a role-less account in from a browser with no invite. Opening the demo and entering a study code both end at `/invite`, and the browser receives no demo or study cookie.
- **Withdrawal (confirmed, fixed).** `withdraw` flagged only the session in the cookie. After a WebGL reassignment, the abandoned immersive session kept the pre-test and any learning data and stayed analysable. Withdrawal now flags every session of the participant. `withdrawn_at` is set once, and the existing terminal triggers allow this.
- **Attribution after a reassignment (confirmed, fixed).** Analytics took the condition from the row's own session. A reassigned participant's pre-test therefore counted under immersive and the post-test under 2D. `outcomeDistributions` now reads every score in the condition and scope of the participant's analysed session: the latest period with a condition, the same rule as `analysedSessionOf` on the dashboard. One value per participant and administration is kept. `behaviourDistributions`, `correspondenceSummary`, `transitionMatrices` and the dashboard telemetry summary count the analysed session only, so the abandoned session's partial learning telemetry leaves both arms. It stays in the export and in the data-quality figures. Test: the reassignment case in `tests/integration/study-engine-review-fixes.test.ts`, which fails on the old analytics and on the old withdrawal.
- **Sun through the clay bowl (confirmed, fixed).** Measured, not inferred. The vessel mesh is wound outward, so the cause is not the winding. A front-side material casts its shadow with its back faces. For a ray that reaches the ground just past the foot, the back face it leaves through is the lower outer wall, within 2 to 3 cm of the ground. The shadow bias (-0.00025 of a 119 m depth range, about 3 cm) erases that occluder. The fired-clay material now casts from both faces (`shadowSide = DoubleSide`), and its look and front-face rendering are unchanged. The renders below are on NVIDIA, with the renderer string confirmed. Alum still, at the leaking pixel (1100,1170): before 220,211,200, after 193,186,181, against the shadow beside it at 186,179,175. Harde still (1100,1180): before 219,209,198, after 190,183,179. Tearing check on Ajrakh n=2 to n=5: 0 failing objects of 62, 75, 50 and 48, with all four planted faults caught. All 53 Door 1 object stills were rendered again. 28 that hold a bowl or pot changed (mean absolute change 0.08 to 0.41 per channel) and were kept; 4 differed only in JPEG bytes (0.000 to 0.004) and were left as committed. Test: `tests/unit/walkthrough/vessel-shadow.test.ts`.
- **Commit email (confirmed, not changed).** 77 commits carry the personal Hotmail address as author and committer, including 67 that are not pushed (all of origin/main..HEAD). Removing it means rewriting history and changing the git identity. Both are the user's decisions, and the machine rules forbid an agent from switching identity. Nothing was rewritten. Before any push, the user decides whether to rewrite the history to the GitHub noreply address that other commits already use. Update, 2026-11-06: the user chose the noreply address. The 82 commits not yet on GitHub were rewritten to `123621147+the-sauravkumar@users.noreply.github.com` as author and committer, with identical trees, and the repository git config now uses it; the 9 commits already on GitHub keep the old address.
- **Hall shimmer and the Iris Xe frame budget (confirmed, not fixed here).** Both are real and stay open as DR-099 and DR-100 record them. They are being worked in parallel: a filtered-mip branch for the hall photographs and a texture-upload measurement for integrated graphics. A timing figure taken now would be invalid, because another heavy workflow was running on the machine.
- **Paper implications:** the withdrawal and attribution fixes change what the analytics count for any reassigned or withdrawn participant. Analyses should use the analysed-session rule above.

## DR-102: Colour Textures Are Stored Mutably And Their Decoded Pixels Released After Upload; The Remaining Iris Xe Growth Is The Headless Shell (Adopted under the lead's delegation, 2026-11-06)
- **Trigger:** DR-100's Iris Xe route (headless shell from `launchLowSpec`, Ajrakh) reached leg 3 with the largest headless-shell process at 7633 MB and free RAM at 291 MB. DR-099 called this the open texture-upload cost on integrated graphics. On integrated graphics the GPU uses system memory, so this is a question of whether an 8 GB laptop can hold the walk.
- **Method:** a GL ledger injected into the page (every `texStorage2D`, `texImage2D`, `texSubImage2D`, `copyTexSubImage2D`, buffer and renderbuffer call, with dimensions, internal format and levels) beside `renderer.info.memory`; an accounting of every scene texture's source (ImageBitmap, canvas, image) and size; per-process private memory of the browser's GPU and renderer processes every 1.5 s; and isolated upload benches of six 2048 px colour maps per upload path, on both GPUs, renderer strings confirmed (`ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ...)`, `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ...)`).
- **What was released and what was not:** yards behind the walker are released. Live GL textures stay at 72 to 108 and the GL texture ledger at 1.20 to 1.43 GB over a whole Ajrakh route, falling when a yard leaves (108 to 87 at the hall). There is one shadow map (4096 px depth, 64 MB) and the instanced shadow stand-ins are disposed (DR-099). Buffers are 61 to 104 MB, renderbuffers 53 MB. No texture is kept twice on the card: clones share one GL texture.
- **Cause 1, upload path (measured):** three.js 0.186 allocates every mip-mapped texture with immutable `texStorage2D`. Per 2048 px colour map with mips, the Iris Xe GPU process grew 61.2 MB through `texStorage2D` plus `texSubImage2D`, 45.3 MB for `texStorage2D` alone with no pixels, and 27.2 MB through mutable `texImage2D` (the texels are 21.3 MB). Deleting immutable textures returned 8 to 16 MB of the 61; four upload-and-delete cycles held 453 to 572 MB for six textures, while the mutable path fell back to 74 MB. On NVIDIA the same was 48.3 against 29.3 MB. Sixteen-bit, depth and single-level textures were not affected.
- **Cause 2, pixels kept after upload (measured):** every decoded ImageBitmap and every painted-word canvas stayed referenced by its texture after upload. With a yard standing, closing the 40 bitmaps (757 MB) and shrinking the 18 canvases (99 MB) took the renderer process from 1100 to 328 MB and the GPU process from 2425 to 2157 MB.
- **Not a cause:** no texture is uploaded at a size the density floors could lose; capping resolution was not needed and was not done (`npm run walkthrough:density` unchanged). The bitmap worker transfers each bitmap and keeps no buffer.
- **Decision:** `mutable-colour-storage.ts` wraps the renderer's context in `createRenderer`: a mip-mapped `RGBA8` or `SRGB8_ALPHA8` `texStorage2D` is recorded instead of allocated, and each level is defined by `texImage2D` on its first upload (whole, or an empty level before the first strip); `generateMipmap` waits until level 0 has pixels. `SceneWarmup` uploads each new image texture through a carrier (DR-103's fix, kept, extended to whole uploads while loading), then closes its bitmaps, including product mip levels, and shrinks its canvas. A texture whose pixels were released and that later needs a second GL texture throws, so this cannot fail silently.
- **Check of correctness:** a texture filled through each path (strips while walking, whole while loading, with and without the wrapper) was read back on both GPUs at levels 0, 2 and 5 against a direct upload: difference 0 for a 2048 px bitmap and a 700 by 515 canvas. Slow-pan shimmer on practice, Ajrakh n=3 and n=9, Sanganeri n=4 and Kalamkari n=9 reads 0.117, 0.182, 0.356, 0.282 and 0.307 per cent (DR-103: 0.117, 0.182, 0.358, 0.283, 0.307). Density and tearing on the same five scenes: 0 failing surfaces, 0 failing objects, every planted fault caught.
- **Result, NVIDIA, lab walk entry, Ajrakh, whole route (machine shared, free RAM 1.7 to 3.2 GB):** GPU process peak per leg 2619, 2720, 2759, 2808, 2837, 2878, 2947, 2986, 2741, 2918 MB; renderer process 840 MB at load, then 326 to 672 MB. Before (7965b44, three legs): GPU process 3607 to 4143 MB, renderer 1095 to 1284 MB. Cloth, painted words and hall photographs were looked at at stations 3, 4 and 10 and are drawn. In the production app (`next build --webpack`, `next start` on port 3300, a demo participant allocated Door 2, Sanganeri, NVIDIA) the screenshots at stations 4 and 5 show the printed cloth, vessel paint and bench names drawn; station 3's arrival view holds no cloth. A second app walk (Ajrakh) shows the six hall photographs and the followed cloth drawn 25 s after arrival in the hall. Worst frames 35, 102, 139, 78, 30, 37, 34, 24, 11 ms; legs 3 to 5 over 50 ms were measured while two other agents used the same GPU and RAM, so they are not a timing verdict.
- **Iris Xe, not completed:** the quiet-machine condition (8 GB free) did not occur in a 120-minute bounded wait (free RAM 1.9 to 7.8 GB). Every Iris route was stopped by the 1 GB free-RAM guard: on the headless shell, and on a copy of the full Chromium build that Windows gives the Iris Xe, free RAM fell by 6 GB within 20 s of loading while this page's processes held about 4.7 GB. The comparison against 525031a was stopped the same way. Standing still on the Iris Xe after load, the headless shell's GPU process grew from 3974 to 5714 MB in 42 s (about 41 MB/s) with no GL allocation by the page; the full Chromium copy stayed at 3633 to 3639 MB. The multi-gigabyte climb on a walk is therefore the headless shell (DR-073, DR-099), not textures.
- **Open:** the per-leg Iris Xe peaks for all three traditions and the NVIDIA quiet-machine route with no frame over 50 ms still have to be taken on a quiet machine, preferably on the full Chromium copy for Iris (DR-073's recommended route). No quality, resolution, mip filter or geometry changed.
- **Paper implications:** none for the study design. Fewer integrated-graphics participants should lose the tab; whether a device class is excluded is still decided by the existing GPU acceptance check.

## DR-107: The Look-Sheet Route Test Builds Its Three Routes Once, Outside The Test Timeout; Final Check Of df9633c (Adopted under the lead's delegation, 2026-11-06)
- **Defect:** in the final check of `walking-the-process` at df9633c, `npm test` (dom and node, 2 workers) failed one of 1868 tests: "keys Door 1 and Door 2 to the same look of the same material" in `tests/unit/process/substance-look.test.ts` timed out at 6869 ms against Vitest's 5000 ms default. Run alone, the file passed three times out of three. Measured inside the test, `buildRoute` takes 1015 to 1073 ms per template and `stagePanelModel` 0 to 1 ms for all nine stages, so the test spent about 3.2 s building the three routes; with another agent's Door 2 lab walks sharing the CPU, that crossed the limit. `src/features/walkthrough/domain/route-plan.ts` is unchanged since 7965b44, so the routes did not get slower; the test was always within 2 s of the limit.
- **Decision:** the test file builds the three routes once at module level, beside the three templates it already reads there, and the test only compares them. Import time is not counted against a test's timeout, so the comparison now takes 2 ms. No limit was raised and no assertion changed.
- **Evidence:** the test ran in 2 ms and the full `npm test` passed 1868 of 1868 in 140 files (110.7 s). The rest of the check on df9633c plus this fix: typecheck clean; lint 0 errors (5 existing `no-img-element` warnings); content tests 16 of 16; database up and both databases migrated (24 migrations each); integration suite 296 of 296 in 28 files with one worker; Python analysis tests 28 of 28; `npm run content:test-items` left the tree clean; a clean `next build` succeeded; with `next start` on port 3100 (media on local disk in a scratch folder, S3 variables blank) the full Playwright `chromium` project passed 39 of 39 with one worker on the NVIDIA GTX 1650 (21.6 min; the Door 2 learning walk took 12.8 min). The editor upload landed on local disk and was removed by the test. The Door 2 walk's hall screenshots for Ajrakh, Sanganeri and Machilipatnam Kalamkari (the tenth station of each, after nine stations) show the hall photographs and the followed cloth drawn, not black, as DR-103 intended; the walk reported no console errors, page errors or failed responses. No route timing walks and no Iris Xe walks were run, as the user ruled.
- **Paper implications:** none. Test code only.

## DR-106: Kalamkari n=5 Brought Under The Shimmer Budget, So All 32 Scenes Meet It: Wall-Plane Far Normals For The Basket, Sub-Pixel Gaps Closed In Open Weave, A Far Form For Pile Pieces, Filtered Coverage Mips For Painted Words (Adopted under the lead's delegation, 2026-11-06)
- **Trigger:** DR-103 left Kalamkari n=5 at 0.839 per cent against the Section 8.9 budget of 0.5 (`tools/walkthrough-lab/flicker.cjs` pan mode, 1366 by 768). `window.shimmerByObject` gave the shed name paint 0.111, the cloth leaving the yard 0.105, the root piles 0.104 (chay), 0.045 (plant additives) and 0.039 (madder), the basket outlines 0.028 to 0.042 and the shed wall 0.040. Re-measured at 525031a on `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ...)`: 0.839. Shimmer figures are deterministic (repeat runs agree to 0.001) and are not timings. Other agents were running, free RAM 4.9 to 6.8 GB.
- **Method:** each part was probed in the running scene, one change at a time, by patching its shader or textures on the live page and re-running the pan with the part hidden and shown. Probes that share a program cache key across materials reuse the first compiled shader; such runs were found, discarded and repeated with unique keys.
- **Basket, cause (a DR-103 defect):** DR-103's far normals averaged the vertex normals within 5 cm. The wicker wall is about 1 cm thick, so its inner and outer faces cancel and the far normal is close to zero or points inward. From the standpoint the baskets rendered nearly black. Masked mean colour of the chay basket from the standpoint: 75.5, 56.8, 41.0 with DR-103; 104.1, 78.3, 54.5 with no far normals; the same basket rendered at six times magnification from the same place (the reference for what the far view should average to) 101.1, 75.5, 51.1. The low shimmer DR-103 recorded for the basket came from this darkening.
- **Basket, fix:** `domain/far-normals.ts` (`wallPlaneNormals`) now takes, for each vertex, the flattest axis of the position spread within 5 cm (a 3 by 3 Jacobi eigen solve), which is the plane of the wall whatever the strands do, signed away from the model centre. The shader turns it towards the camera, so each side of the wall is lit as that side. An earlier trial using the dominant axis of the normals' orientation tensor left speckled normals (shimmer share 0.39) and was dropped. With wall-plane normals: share 0.071, masked mean 91.0, 67.7, 46.6. That is about 10 per cent darker than the magnified reference, because a mean normal cannot reproduce sunlit strand tops on a wall facing away from the sun. Blending only 60 to 90 per cent of the way brightened it (99.9 at 60 per cent) but brought shimmer back (0.200), so the full blend was kept. The ramp is unchanged (1.6 to 3.5 m), so nothing changes at the nearest reach (1.31 m).
- **Open weave, cause:** with shading fixed, the basket walls still shimmered where contents show through gaps between strands narrower than a pixel. A flat unlit basket hides more shimmer than it adds (share -0.197), so the cause is coverage, not colour.
- **Open weave, fix:** open-work models (`wicker_basket_01`, `wooden_crate_01`) move each vertex out along its normal by 0.2 of the pixel's footprint at that depth (`closeSubPixelGaps` in `material-library.ts`, pixel size from `pixel-footprint.ts`). The 0.2 setting was chosen from a sweep: 0.1 gave a basket share of 0.099, 0.2 gave 0.042, 0.3 gave 0.001 and 0.5 gave -0.054 (scene 0.526, 0.469, 0.428, 0.373). At 0.2 the weave still reads as weave from the standpoint. At 1.33 m on a 3840 by 2160 frame the offset is 0.13 mm.
- **Root piles, cause:** chay sheaves are bundles of 1 mm strands, about a fifth of a pixel at 3.8 m. A flat unlit chay pile keeps 0.079 of its 0.103 share, so coverage is the cause. Uniform normals, no colour map and no shadows changed less than 0.01. Madder pieces are wide enough. Their share is the per-ring bark tone along the root: without vertex colour, 0.054 of 0.106 remained; without vertex colour and with uniform normals, 0.030.
- **Root piles, fix (all pile pieces in every tradition: dung, roots, flowers, leaves):** `PieceMesh` now records each vertex's tube radius (`girth`) and a tone smoothed over 12 mm (`farColour`, from `domain/neighbourhood-grid.ts`). The grain shader widens any part thinner than half a pixel to half a pixel along its normal. It also blends the vertex tone to the smoothed tone once a pixel covers 2.5 to 4 mm. The pixel size comes from depth, not from `fwidth`, because `fwidth(vViewPosition)` is large on the grazing sides of thin strands and evened them at close range in a first version. The near tint rule is unchanged. Probe results: inflating the chay strands by 1, 1.5, 2 and 3 mm gave shares of 0.104, 0.091, 0.085 and 0.079 (from 0.175 once the basket was lit). The smoothed tone took madder from 0.106 to 0.044. The nearest view of the pile pieces is unchanged: a difference image of the chay basket at 1.33 m, 3840 by 2160, is black over the sheaves, and the only differences are sub-pixel shifts along the basket strands (mean absolute difference 1.03 of 255).
- **Painted words, cause:** the far path samples GPU box mips at bias 1.3. The name "Dye-Bath Boiling And Sun-Drying" at 16 m showed texel steps, and its shimmer runs along the letter rows. Raising the bias removes the shimmer (bias 2.0 gave 0.000) but makes the name unreadable from the standpoint, so it was rejected by eye. Bias 1.0 with Kaiser mips is sharper than before, but the share stays at 0.111.
- **Painted words, fix:** each paint layer's coverage is filtered in the decoder worker with the DR-103 Kaiser-windowed sinc (radius 3, beta 4, no sharpening) in straight, linear alpha (`filteredMips` with `coverage`, `BitmapDecoder.filterDrawing`, `MaterialLibrary.paintTexture`). The chain is uploaded as the texture's own levels, and the bias and the crisp near path are unchanged. Share 0.111 became 0.089. Seen from the standpoint the name has no texel steps and is no softer. The stage caption seen from the reading spot at 1366 by 768 reads the same as before or cleaner. Line pitch is 34 to 35 px, and layer sizes, pixels per metre and positions are unchanged, so the Section 8.3 text floors are as before. The synchronous `paintWords` was deleted. The entrance and the lab's planted paint now use `paintWordsInTurn` through the library.
- **Cloth leaving the yard, cause found, not changed:** the print itself. A flat albedo takes its share from 0.105 to 0.020, and the weave normal map and shadows do not move it. Kaiser mips did not help: 0.100 with sharpening 0, 0.254 with 0.6, and 0.379 at bias 1.0. Only blur helped: far bias 1.75 gave 0.045, 2.0 gave 0.030, and anisotropy 1 gave 0.036. Each of these makes every far cloth in every yard softer. Kalamkari n=5 meets the budget without them, so the cloth was left as it is.
- **Shed wall:** its share fell from 0.040 to 0.025 as the parts in front of it were fixed. It was not changed.
- **Result, all 32 scenes (`flicker.cjs` pan, NVIDIA, renderer string confirmed):** practice 0.099, entrance 0.194; Ajrakh n=0 to 9: 0.181, 0.135, 0.136, 0.173, 0.102, 0.150, 0.261, 0.292, 0.157, 0.354; Sanganeri: 0.116, 0.202, 0.185, 0.202, 0.193, 0.143, 0.106, 0.147, 0.108, 0.109; Kalamkari: 0.085, 0.191, 0.164, 0.173, 0.168, **0.470**, 0.125, 0.228, 0.141, 0.303. All 32 are at or under 0.5, and every scene is at or below its DR-103 figure. Kalamkari n=5, Ajrakh n=6 and Sanganeri n=3 were run again after the final pixel-size change: 0.470, 0.261 and 0.202.
- **Close-ups at nearest reach, 3840 by 2160, NVIDIA (`closeups.cjs`, before from 525031a in a clean export, after from this change):** 95 views (every pile, wicker basket, crate, name, caption and bench paint) in Ajrakh n=0, 6 and 7, Sanganeri n=1, 3 and 4, and Kalamkari n=1 and 5. Mean absolute difference is 0.00 to 0.95 grey levels. The high-band (Laplacian RMS) ratio after/before is 0.962 to 1.013. Paint differs slightly from load to load anyway, because its wear marks are random. The chay basket, the madder basket and the Kalamkari name were checked side by side: nothing is softer.
- **Checks:** scene and overlap check on all 32 scenes: 0 hits, every planted fault caught (paint off its surface included), walk reaches the end. Tearing on the entrance and the eight basket scenes (Ajrakh n=0, 6, 7; Sanganeri n=1, 3, 4; Kalamkari n=1, 5): 0 failing objects of 28 to 67, all four planted faults caught in each. Density on the same nine: 0 failing surfaces, planted faults caught in each. `tsc` reports only the 43 missing generated Next route types. ESLint is clean on `src/features/walkthrough`, `tools/walkthrough-lab` and `tests/unit/walkthrough`. The walkthrough and architecture unit tests pass, including new tests for wall-plane normals on a thin two-sided wall, coverage mips and the neighbourhood grid.
- **Paper implications:** from the standpoint the wicker baskets now read as wicker-brown, not near black. Thin roots and pile pieces read as a slightly more even mass beyond about 2.5 m (at 1366 by 768). Painted words look the same. Door 1 stills were not re-rendered.
- **Door 1 stills re-rendered after the merge (2026-11-06, 5c48d9d):** all 53 object stills were rendered again as DR-100 did (`tools/walkthrough-lab/render-stills.cjs objects`, renderer `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ...)`). 14 changed and were kept, all of them pile pieces in a wicker basket or open crates: the Kalamkari dye-bath root baskets 1.06, Ajrakh madder 0.95, the Kalamkari, Sanganeri and Ajrakh scouring dung 0.91, 0.91 and 0.87, Ajrakh galls 0.80, Sanganeri flowers 0.79, the Kalamkari plant additives 0.73, the closed crate 0.73, Sanganeri sun-bleaching dung 0.65, the three base-cloth crates 0.63 each, and Ajrakh dung soak 0.61 (mean absolute change per channel). Seen side by side, the wicker strands read slightly fuller and the crate edges a little firmer, which is the sub-pixel gap closing; the pile pieces, liquids and cloth look the same, with no artefacts. The other 39 differed by 0.005 or less (no pixel more than 8 levels apart), which is encoding only, and were restored as committed. Door 1 again matches the materials Door 2 renders. Checks on this tree: all unit tests 1873 of 1873 in 141 files (`vitest --project dom --project node --maxWorkers 2`, the parity unit tests included); lint 0 errors (the 5 existing `no-img-element` warnings); typecheck clean; scene check on all 32 scenes passed (0 hits, every planted, overlap and paint fault caught, every walk reached its end); `next build` succeeded; against `next start` on port 3100 (S3 variables blank, media on local disk in a scratch folder) the Door 1 template-words parity spec passed on full Chromium. Nothing failed, so no code changed.

## DR-108: Git Deploys Stamp Their Own Build Version; Short Pool Idle On Vercel; Media CORS Limited To The Site (Adopted under the lead's delegation, 2026-11-06)

**Context.** Preflight against the production values failed `APP_BUILD_VERSION present`, because the deploy catalogue still marked it required. On a Git deploy an explicit value goes stale on the next push, and `withBuildVersion` in `src/lib/env.ts` already takes the short SHA from `VERCEL_GIT_COMMIT_SHA` when it is unset. Preflight also listed source change S4 (short pool idle timeout, `docs/deploy/RESEARCH.md` section 13) as pending, and the Neon bucket answered every origin with `access-control-allow-origin: *`.

**Decision.** `APP_BUILD_VERSION` is optional in `scripts/deploy/lib/env-catalog.ts` and is left unset on Vercel; the catalogue's media sources now describe Neon Object Storage instead of R2 and RDS. `src/server/db/client.ts` closes idle pool clients after 5 s when `VERCEL` is set and after 30 s elsewhere. The bucket's CORS rule now allows only `https://immersive-episteme.vercel.app`, methods PUT, GET and HEAD, headers `content-type` and `x-amz-checksum-sha256`.

**Evidence.** A preflight from `https://immersive-episteme.vercel.app` returns 200 with that origin; one from another origin returns 403. The ten-step CMS storage check passes after the change: signed SHA-256 PUT, refusal of mismatched bytes, HEAD with SHA-256, range read, presigned GET, private bucket, delete. Typecheck, ESLint and the 60 deploy, database-client and auth tests pass.

**Scanner allowlist (same day).** gitleaks flagged 53 history and 43 tree lines in `db/seeds/study-test-items.generated.json` under `generic-api-key`; every one is an `itemKey` line such as `pre.place.machilipatnam-kalamkari.2.0`. `.gitleaks.toml` extends the default rules with a line allowlist for exactly that shape, so the pre-push scan exits 0 on real findings only.

**Ignored Build Step length (same day).** The first production deployment request was refused: "`ignoreCommand` should NOT be longer than 256 characters" (Vercel API, 400). The inline `node -e` check was 307 characters. It now lives in `scripts/deploy/invite-gate.ts --ignore-step`, which exits 0 (cancel) only when `VERCEL_ENV=production` and the gate is missing, and 1 (build) otherwise; `vercel.json` calls it in 48 characters, and preflight checks both the call and the 256-character limit.

## DR-109: The 3D Walk Renders At The Device Pixel Density, Capped At 2, Under A Frame-Budget Governor; Painted Words Keep The Far Bias Only Below Their Reading Size (Adopted under the lead's delegation, 2026-11-07)
- **Trigger, defect A:** `createRenderer` in `infrastructure/render-view.ts` called `renderer.setPixelRatio(1)`. On any screen with a device pixel ratio above 1 (Windows at 125, 150 or 200 per cent, most laptops) the canvas was drawn at CSS resolution and stretched, so every surface and painted word was blurred. The call came in with the Door 2 engine (20b77bc, 2026-11-04) with no recorded reason. What it protected is that the Section 8.9 budget, the shimmer budget and every lab measurement were set and met at CSS density, 1366 by 768. DR-091 and DR-099 both record that no pixel ratio was lowered, so 1 was never a measured choice.
- **Trigger, defect B:** painted words were soft at ordinary distances. Example: the station 4 heading "Printing Iron Mordant And Alum Mordant" seen from the arrival point (`D:/Work/IIT-KGP/Paper_1-artifacts/walkthrough/shots/door2-fixed-kalamkari-s4.png`, 1920 by 1080). The paint shader blended to a 1.3 mip-bias sample whenever a texel was minified past 1.4 to 2.4 texels a pixel, whatever the size of the letters on screen. That bias was added for shimmer on far names (DR-106), but it also blurred 20 to 40 px headings and captions at the reading spot.
- **Pixel density, decision:** the renderer draws at `min(devicePixelRatio, 2)` (`domain/render-scale.ts`, `topRenderScale`). The cap of 2 is the common three.js default. The React Three Fiber `Canvas` reference (https://r3f.docs.pmnd.rs/api/canvas, props table, row `dpr`) says "Pixel-ratio, use `window.devicePixelRatio`, or automatic: [min, max]", with default `[1, 2]`; the quote was checked against the fetched page. Above 2 the pixel cost grows with the square of the ratio, which is 2.25 times at 3 and 4 times at 4, for detail a viewer at normal distance cannot resolve. At a device pixel ratio of 1 the renderer is exactly as before.
- **Governor:** `RenderScaleGovernor` (domain, pure, unit-tested) starts at the top level and moves in steps of 0.25 between CSS density (1) and the top. Every frame it receives the frame interval and, where `EXT_disjoint_timer_query_webgl2` is exposed, the GPU time of the main render (`infrastructure/gpu-frame-timer.ts`, at most 6 queries in flight, disjoint results and results from before a scale change dropped). The extension is exposed on both GPUs here.
  - **Lowering:** over the last 15 frames, it lowers when the GPU median is above the 17.5 ms budget, or when the frame median is above 17.5 ms or the frame mean is above 1.5 times the budget, provided the GPU is the cause: its median is above 0.9 of the budget, or no timer exists. Frames over 250 ms count as stalls (a yard loading, a hidden tab) and are ignored. Once a timer has reported, frame time alone never lowers the scale. The new scale is the largest level whose pixel cost fits 0.75 of the budget, assuming cost grows with the pixel count.
  - **Raising:** it raises after 2 s at a level and only after 60 frames with the 90th percentile within the budget. With a timer, the measured GPU time scaled to the next level must also fit 0.75 of the budget. A level the governor dropped from is blocked for 8 s, and the block doubles after each further failure.
  - **Plumbing:** `WalkRuntime` applies a change through `setPixelRatio` and `setSize`. The `main` target and the quarter-size bloom targets are sized from the drawing buffer, and the bloom blur step is scaled by the pixel ratio, so the bloom radius in CSS pixels does not change. `trackPixelFootprint` (DR-106: closed sub-pixel gaps, grain widening) already reads the render target height, so it follows the drawing buffer.
- **Canvas buffers:** every frame reaches the canvas through the full-screen composite pass, so the canvas's own 4x MSAA colour and depth buffers did no work. The renderer is now created with `antialias: false` and `depth: false`. This frees 255 MB of GPU memory at 3840 by 2160 (Kalamkari n=3, measured with `nvidia-smi` while standing: 2342 MB with the buffers, 2087 MB without). A screenshot of the practice yard differs from the old settings by the same amount as two loads with the same settings differ from each other (mean absolute difference 0.081 against 0.081, from the random paint wear).
- **Painted words, decision:** the shader works out the on-screen em height of each layer in device pixels, from its em size in texels (`paintEmTexels`) and the screen gradient of the texture's v coordinate. It keeps the 1.3 far bias only while the em is below a text kind's reading size. The far bias blends out between 16 and 24 px for names, captions, local names and labels, and between 20 and 28 px for display lettering of 0.3 m or more (the shed names). Above that size the crisp path is used, the same one that already served magnified text. Because the measure is in device pixels, a HiDPI screen keeps words crisp to twice the distance.
- **Painted words, what was tried (shimmer share by paint kind, `window.shimmerByPaintKind`, 1366 by 768, device pixel ratio 1, NVIDIA; whole scene for Kalamkari n=5, Sanganeri n=2, Kalamkari n=3):**
  - At 692439a: 0.468, 0.185 and 0.172.
  - Crisp from 10 to 16 px for every kind (the stopped agent's version): 0.701, 0.676 and 0.578, and the full run put three scenes over 0.5. Rejected.
  - A linear coverage path at reading bias 0, 0.5, 0.75 or 1.0, from 16 to 24 px: 0.500, 0.494, 0.487 and 0.470. Side by side, bias 0.75 and 1.0 look as soft as before.
  - A contrast-stretched coverage path with edge widths of 0.75, 1.5 and 3 times `fwidth`: 0.515 to 0.520 on Kalamkari n=5, because the crisp shed name from the standpoint costs about 0.05.
  - So display lettering uses 20 to 28 px. At 1366 by 768 and a device pixel ratio of 1, the shed name is about 20 px from the standpoint and stays as soft as before. At 1920 by 1080 (about 28 px) or a device pixel ratio of 2 it is crisp.
- **Shimmer, all 32 scenes (`flicker.cjs` pan, NVIDIA `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 ...)`):**
  - **Device pixel ratio 1:** practice 0.099, entrance 0.207. Ajrakh n=0 to 9: 0.185, 0.136, 0.165, 0.188, 0.102, 0.150, 0.261, 0.292, 0.156, 0.354. Sanganeri: 0.130, 0.202, 0.210, 0.204, 0.193, 0.161, 0.106, 0.155, 0.108, 0.110. Kalamkari: 0.085, 0.192, 0.165, 0.190, 0.168, **0.469**, 0.142, 0.228, 0.141, 0.301.
  - **Device pixel ratio 2** (a quarter device pixel a frame): practice 0.020, entrance 0.023. Ajrakh: 0.069, 0.040, 0.073, 0.064, 0.036, 0.084, 0.238, 0.119, 0.031, 0.215. Sanganeri: 0.013, 0.074, 0.131, 0.102, 0.034, 0.052, 0.033, 0.088, 0.010, 0.078. Kalamkari: 0.006, 0.062, 0.057, 0.128, 0.012, **0.305**, 0.035, 0.125, 0.009, 0.109.
  - All 64 are at or under 0.5. Shimmer figures are deterministic and are not timings.
- **Crispness, before (692439a) and after:** `tools/walkthrough-lab/text-crispness.cjs` was run on Kalamkari n=3, Ajrakh n=0 and Sanganeri n=5, 1366 by 768, NVIDIA. It frames each painted layer from the arrival point, from 6 m, from 3.6 m and from the nearest reach, and reports the 99th-percentile neighbour step over the 2 to 98 per cent contrast (edge) and the Laplacian RMS over the same contrast (band), both per device pixel. Means, before/after:

  | Kind (n) | View | DPR 1 edge | DPR 2 edge | DPR 2 band |
  |---|---|---|---|---|
  | Heading (3) | arrival | 0.629/0.629 | 0.283/0.941 | 0.054/0.318 |
  | Heading | 6 m | 0.445/0.937 | 0.201/0.851 | 0.031/0.220 |
  | Heading | 3.6 m | 0.393/0.892 | 0.178/0.727 | 0.023/0.165 |
  | Heading | nearest | 0.692/0.830 | 0.270/0.661 | 0.041/0.147 |
  | Caption (3) | arrival | 0.414/0.414 | 0.198/0.388 | 0.063/0.137 |
  | Caption | 6 m | 0.385/0.385 | 0.182/0.963 | 0.044/0.342 |
  | Caption | 3.6 m | 0.700/0.954 | 0.314/0.882 | 0.060/0.251 |
  | Caption | nearest | 0.670/0.747 | 0.245/0.552 | 0.035/0.119 |
  | Local name (2) | 3.6 m | 0.510/0.974 | 0.237/0.867 | 0.044/0.259 |
  | Bench label (11) | arrival | 0.434/0.434 | 0.205/0.577 | 0.052/0.226 |
  | Bench label | 6 m | 0.431/0.432 | 0.222/0.541 | 0.065/0.233 |
  | Bench label | 3.6 m | 0.357/0.357 | 0.176/0.814 | 0.044/0.351 |
  | Bench label | nearest | 0.487/0.521 | 0.224/0.746 | 0.047/0.243 |

  The headings, captions, local names and bench labels were looked at side by side at all four distances at a device pixel ratio of 2. Before, every view is the stretched CSS-resolution image, and from the arrival point and 6 m it is also mip-blurred. After, the heading from the arrival point, the caption from 3.6 m and the bench label from 6 m have sharp stroke edges, with no stair-steps or broken strokes. At a device pixel ratio of 1, unchanged cells are text below its reading size, which still takes the far bias for the shimmer budget. The bench labels at 3.6 m are seen from above, so their em is under 16 px.
- **Section 8.3 floors:** layer sizes, pixels per metre and positions are unchanged, so the floors hold as before. A device pixel ratio above 1 only adds device pixels.
- **Scene, tearing and density checks:** on all 32 scenes at a device pixel ratio of 1, all passed, with 0 hits and every planted fault caught. At 2 the touched set (entrance, Kalamkari n=3 and n=5, Sanganeri n=2, Ajrakh n=0) also passed.
  - **Tearing camera offset:** the first run at a device pixel ratio of 2 failed 12 painted layers on colour flicker (1.1 to 3.5 per cent). The check's sub-pixel camera offset is a fixed angle, so at twice the density it moved crisp glyph edges by twice the share of a device pixel. `surface-audit.ts` now divides the offset by the pixel ratio, so it is the same fraction of a device pixel at any density. The check then passed (worst painted layer 0.94 per cent) and the planted faults were still caught.
- **Route walk, NVIDIA (the only one; Kalamkari, 1920 by 1080, device pixel ratio 2, drawing buffer 3840 by 2160; free RAM 6.0 GB and CPU 3 per cent before, 6.2 GB after):**
  - Load took 15.4 s.
  - Render scale at the end of each leg: 2, 2, 2, 2, 1.75, 2, 2, 2, 2. The governor dipped to 1.75 inside legs 2, 3, 6 and 7.
  - **Budget not met:** worst frame per leg, ms: 56, 106, 268, 176, 133, 298, 56, 51, 38. 1 to 5 frames per leg went over 50 ms. Hills, back, interrupted back, wrong turns and dispose all passed.
  - **Cause, not verified:** the spikes fall where the next yards stream in. Standing at station 1 the tab already used 2.3 GB of the 4 GB of GPU memory, so the canvas buffer change above was made after the walk. Whether it removes the spikes was not measured, because the lead allowed one route walk.
  - At a device pixel ratio of 1 the renderer is unchanged.
- **Iris Xe (the only check; headless shell `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ...)`, 1920 by 1080, device pixel ratio 2; free RAM 5.9 GB before, lowest 1.1 GB with the guard at 1 GB):**
  - Load took 19.8 s. The walk started at scale 2.
  - On the leg to station 2, the frame median was 16.3 ms but the mean was 60 ms. 153 of 956 frames were over 50 ms, and the worst was 1729 ms.
  - The first governor (median only) lowered 2, 1.5, 1.25, 1 only at frames 818 to 949. So it did lower the scale instead of staying at 2, but late.
  - **Fix after the check:** the mean rule and the timer gating above were added afterwards. A unit test replays that pattern (every third frame 150 ms) and lowers to 1 within one 15-frame window. A second unit test replays the GTX 1650 walk (GPU 14.4 ms, spikes of 56 to 298 ms) and keeps 2.
  - On NVIDIA, standing at 3840 by 2160, the final governor reads a GPU median of 14.3 ms from 60 of 60 frames and stays at 2.
  - Neither walk was repeated, as instructed.
- **Lab tools:** `each-scene.cjs`, `flicker.cjs` and `route.cjs` take `DPR`, and `route.cjs` takes `W` and `H`. `route.cjs` prints the render scale per leg. `lab.ts` renders at `topRenderScale(devicePixelRatio)` and has `paintViews`, `paintBox` and `shimmerByPaintKind`. `text-crispness.cjs` is new. The stopped agent's `zz-paint-share.cjs` probe was deleted.
- **Checks:**
  - `npm run typecheck` is clean.
  - ESLint has 0 errors and the 5 existing `no-img-element` warnings.
  - All unit tests pass, 1888 of 1888 in 142 files (`vitest --project dom --project node --maxWorkers 2`), including 15 governor tests. The parity unit tests pass, 30 of 30.
  - One earlier full run failed `invite-gate.test.ts` once on its tampered-signature case. That code was not touched here, and the test passed in three reruns and in the next full run.
  - `next build` succeeded.
  - The full Playwright `chromium` project passed, 39 of 39 with 1 worker. It ran against `next start` on port 3100, with every `MEDIA_S3_*` variable blank and media on local disk in a scratch folder.
- **Door 1 stills:** not re-rendered. Object stills have no painted words, they render at a device pixel ratio of 1, and the canvas buffer change is within load-to-load noise.
- **Paper implications:** Door 2 now renders at the participant's screen density, up to 2, and painted words read sharply wherever they are large enough to read. On a 1366 by 768 screen at a device pixel ratio of 1, the shed name from the standpoint is unchanged. The render scale can drop on weak GPUs, which changes sharpness but not content. Logging is unchanged.
- **Review of the governor and the bloom (2026-11-07):** three findings were checked against the code and replayed; all three were real and are fixed.
  - **Frame budget did not follow the display:** the 17.5 ms budget was fixed. On a display or browser that delivers frames below about 57 Hz (a 30 Hz battery-saver cap, a 50 Hz panel), the governor without a GPU timer lowered a scale the GPU did not need lowered (30 Hz, idle GPU: 2 to 1.25 to 1, kept for 120 s), and with a timer it could never raise again, because a frame interval over 17.5 ms returned before the raise path (one 25 ms GPU window at 30 Hz, then 5 ms for 300 s: stuck at 1.25). Fix in `domain/render-scale.ts`: once a GPU timer has reported, every decision rests on GPU time, and raising needs only the GPU headroom for the next level. Without a timer, a lowering made on frame time is a probe: if the next 15 frames at the lower level are not at least 15 per cent shorter, pixels were not the cost, so the governor goes back to the level it left, clears that level's block and takes the observed interval plus 10 per cent as its frame budget. It forgets that budget once 60 frames have their 90th percentile within 17.5 ms again. Replayed: 30 Hz without a timer, 2 to 1.25 and back to 2 within 1 s, then 2 for 120 s; 50 Hz, 2 to 1.5 and back within 0.6 s; 30 Hz with a timer, back to 2 by 8.5 s, the same as the 60 Hz control (8.3 s).
  - **The slowest devices were never lowered:** every frame over 250 ms was dropped as a stall, with its GPU time, so a device whose every frame takes longer than that gave no samples and stayed at scale 2. Fix: a long frame that carries a GPU time is a measurement and is kept; a long frame without one is ignored only while fewer than 3 come in a row (a yard loading, a hidden tab); from the third, the run counts as the device's pace. Replayed: 300 ms frames with a 290 ms GPU time now lower 2 to 1 at 4.5 s.
  - **Bloom became a dot grid on HiDPI screens:** the blur step was multiplied by the pixel ratio to keep the halo size in CSS pixels, which spread the 5 taps to about 3.9 and 9.0 texels at a ratio of 2 and left gaps between their bilinear footprints. A single bright texel became a 5 by 5 grid of dots; the 1.4-texel step also left banded gaps at a ratio of 1. Seen on screen: a 4 by 4 CSS px emitter at 4 times the white point, NVIDIA, shows the grid at a ratio of 2 and a banded cross at 1 before the fix (scratch `rev109/shots/point-compare.png`). Fix: `domain/bloom-blur.ts` holds the linear-sampled Gaussian taps (offsets 1.3846 and 3.2308 texels, weights 0.2270, 0.3162, 0.0703), which sample every texel at a step of one texel, and `bloomBlurPasses` repeats the separable blur so the halo keeps a spread of 2.3 bloom texels per CSS density step: passes = round((2.3 times the pixel ratio) squared over the variance of one pass, 2.854), which is 2 at a ratio of 1 and 7 at 2. After the fix both ratios show one smooth round halo of the same CSS size.
  - **Cost of the bloom fix:** GPU time of one full render (`EXT_disjoint_timer_query_webgl2`, median of 50, NVIDIA, 1366 by 768), before/after. Device pixel ratio 2: entrance 6.00/6.27 ms, Kalamkari n=5 9.71/10.02, Ajrakh n=6 9.25/9.67, practice 6.69/6.95. Ratio 1: 2.05/2.07, 4.58/4.35, 3.75/3.79, 2.38/2.44. So about 0.3 to 0.4 ms at a ratio of 2 and within noise at 1.
  - **Checks:** shimmer (`flicker.cjs` pan, NVIDIA) on the touched set is unchanged to the third decimal: ratio 1, entrance 0.206, Kalamkari n=3 0.190, n=5 0.470, Sanganeri n=2 0.210, Ajrakh n=0 0.185; ratio 2, 0.023, 0.129, 0.304, 0.132, 0.069. The tearing check at a ratio of 2 on the same set passed with 0 failing objects and every planted fault caught. `npm run typecheck` is clean, ESLint has 0 errors and the 5 existing warnings, and all unit tests pass, 1905 of 1905 in 143 files, with 6 new governor tests and a new bloom kernel test that blurs a single texel through the shader's taps at ratios 1 to 2 and requires a halo with no gaps and the same CSS spread. The 4 new governor tests that replay the findings fail on f0b7d31.
  - **End to end:** after `next build`, `study-journey.spec.ts` and `gpu-renderer.spec.ts` passed, 5 of 5 with 1 worker, against `next start` on port 3100 with every `MEDIA_S3_*` variable blank and media on local disk in a scratch folder. The Door 2 journey walked all 32 stations in 12.9 min. The route walk was not repeated, as instructed, so the governor's behaviour on the real route rests on the replays above.

## DR-110: The Participant Journey Keeps Its Promises: Required Answers, A Named Early-Finish Refusal, A Wall-Clock Cap Said Plainly, No WebGL Loop, A Schedule At The Last Submit, And Only The Settings The Engine Runs (Adopted under the lead's delegation, 2026-11-07)

**Context.** The static audit of 2026-11-07 (`D:/Work/IIT-KGP/Paper_1-artifacts/audit-2026-11-07/static-audit.json`) confirmed defects in the participant study engine and the study pages: confirmed #1, #3, #5 to #8, #10, #11, #13, #15 to #17, #24, #29, #30, #32, #33, #46 and #47, disputed #1 and gaps #1 and #2. Each was a control that did nothing, a refusal shown as a connection fault, or a page that told the participant something the code does not do.

**Decision.**

- **Required assessments (confirmed #1, #30).** The battery's Required box now means every question must be answered before the participant goes on. The form checks it before sending, and `submitAssessment` checks it again; each blank question gets "Answer this question to continue." in the error summary and on the question itself (`aria-describedby`). An assessment that is not required still stores blank questions as `skipped`. Every assessment in the battery is still delivered. Scoring is unchanged: a skipped keyed item counts 0 (DR-031). Basis: Concept Note rev2 step 2, as `DESIGN.md` section 11 puts it ("Includes `I do not know`"), so a required pre-test can always be answered. The console now explains the box.
- **Early finish (confirmed #10, #17).** `finishLearning` refuses a finish before the cap, in a study without `allowEarlyFinish`, as `learning_time_remaining`. The route returns 409 `{ reason: "time_remaining", endsAt }`, and both doors show "The questions open when the learning time is up. Until then you can go back to any stop you have visited." This was a 500 shown as "check the connection".
- **Refusals are not successes (confirmed #16).** The progress client now reads the HTTP status. A 400, 401 or 403 means the session has ended: Finish goes to the study hub, and a refused stage exit ends the walk instead of counting as delivered. A 5xx or an unreadable body means "unavailable" and is retried.
- **Pause and the cap (confirmed #11).** The cap is wall-clock, as D5 and Concept Note rev2 section 9 fix it (server clock, the same for both doors), so pausing does not stop it. Pause, Help and the introduction now say that a time limit keeps running during a pause. The 30-minute figure was hard-coded in Help and is gone from there.
- **Introduction text (gaps #1, #2).** `learningTaskRules(exposure)` writes the time rule from the study's own settings: no limit, a cap with early finish, or a fixed time. The per-condition onboarding text is deleted along with the code that read it. Nothing could write it, and the parity check (`condition_config_differs`, critical) already requires both conditions to have the same configuration.
- **Unused time budget (confirmed #13).** `LearningContext.learningTime`, `src/features/learning/time-budget.ts` and their unit test are deleted. The study clock is still stamped when the learning context loads.
- **Practice Begin (confirmed #15).** The practice finish sends one request at a time. A rejected request now shows "The study could not be told that the practice is over. Check the connection and press the button again."
- **Device check (confirmed #5, disputed #1).** A check that cannot reach the server now ends with "The check could not reach the study. Check the connection, then check again." and the button works again; before, the page stayed on "Checking" until a reload. Disputed #1 was half right. Before allocation, the DR-075 rule stands: one rule for everyone, and no door is implied. When the study allocates at enrolment, the door is already known. There, `reassign` now applies at the check: an immersive participant is moved to 2D through the existing `manual` allocation, and a 2D participant continues. This follows DR-075 ("A failure after assignment still follows `webglFailurePolicy`"). The client's `reassigned` branch was dead code before this; it now runs.
- **WebGL retry loop (confirmed #24).** Under `retry`, a second walkthrough failure in the same session ends it as excluded, with the reason `webgl_runtime_failure: the walkthrough failed 2 times on this device under webglFailurePolicy=retry`. This is the conservative choice. No design document caps retries. A device that fails twice under load would otherwise loop between the check and the walk with no way forward while its learning time runs. The journal numbers each failure.
- **Excluded after a render failure (confirmed #29).** The walkthrough sends an excluded participant to `/study/complete?status=excluded`, which says "This study cannot continue on this device". Before, it opened the empty entry form.
- **Delayed test (confirmed #32, #33).** After a step completes, `submitAssessment` brings the position up to date. The `delayed_test_schedule` row is therefore written when the last immediate step is submitted, timed from that step, and a return by code works even if the tab closed at once. The journal stamp of a completed step is now the database time of its transaction. The waiting page has a page heading, the withdrawal footer, the study code next to the participant code, and a full return link built from `BETTER_AUTH_URL`. It also says that on another device the site first asks for its invite code.
- **Pages (confirmed #7, #8).** The layout sketch and the open delayed test have a `PageHeader` h1. Opened with no status or an unknown one, `/study/complete` says there is no session result to show and links to the study page. It no longer tells everyone that their answers were recorded.
- **Withdrawal before consent (confirmed #6).** The enrolment-only branch of `withdrawFromStudy` is deleted. The withdraw page needs a participant session, and before consent the consent page offers "I do not want to take part". Neither the ethics text nor Concept Note rev2 asks for a second way out before consent.
- **Group choice (confirmed #3).** When a study allocates at enrolment by stratified blocks and the code was typed by hand, the entry form now asks for the group, before any enrolment-throttle slot is used. Before, enrolment failed with "This study cannot start right now".
- **Allocation settings (confirmed #46).** The console offers stratified blocks, blocks and simple randomisation, and every offered option works end to end. Choosing stratified blocks after the pre-test restores the pre-test stratification; any other choice removes it. Counterbalanced and manual are no longer offered, because the engine cannot draw them; manual stays only as the reassignment record. A new protocol rule fails parity for any algorithm the engine cannot draw. The Strata field is removed: the console allocates after the pre-test (D3), and there the researcher-entered strata are refused.
- **Within-subjects (confirmed #47).** D3 rejects the within-subjects design. It is removed from the create and configure forms, the console and contract schemas (now `between` only), and the parity check (`design_not_between`, critical). The Matched Content Sets field, the `contentSets` config field and the `content_set_code` export column existed only for that design and are removed too. The database enum and trigger stay, so that existing rows remain valid.

**Evidence.**
- New tests, each failing on the old code and passing on the new:
  - Integration (`study-engine-review-fixes.test.ts`): required refusal per item, the named early-finish refusal, the second-failure exclusion, reassignment at a known door, and return by code straight after the last submit. All five fail against the old `engine.ts`.
  - The delayed-schedule test in `study-engine.test.ts` now asserts that the row exists at submit.
  - Unit: `door-progress.test.tsx`, `entry-form.test.tsx`, `learning-task-rules.test.ts`, the required-form and device-check cases in `study-forms.test.tsx`, the refused-request cases in `learning-progress.test.ts` and `stop-ledger.test.ts`, the allocation cases in `study-form.test.ts`, and the design and algorithm cases in `parity-engine.test.ts`.
- Existing integration batteries that test skipped items now insert `required = false`.
- The e2e helper also fills text, number and checkbox questions, because the seeded batteries are required by default.
- The production build and the e2e suite run at integration, not here.

## DR-111: The Research Console Can Set Up A Real Study: Information Sheet And Versioned Consent, Every Item Kind, The Designed Battery, Questionnaire Choice; Self-Paced Only; Audited Scoring Exports (Adopted under the lead's delegation, 2026-11-07)
- **Trigger:** findings 43, 25, 26, 31, 49, 50, 51 and 52 of the static audit of 2026-11-07 (`static-audit.json`), each confirmed against the code before it was changed. Together they meant a study created in the console on the deployed database could be activated with a passing parity report but could never take consent, could not carry the designed test battery, and offered controls that failed or misled.
- **Consent and information sheet (finding 43, fixed).** The console edited only a top-level `consentVersion` that nothing read, while enrolment needs `config.consent` (`findEnrollableStudy`). That decoy field is removed from `studyConfigSchema` and the form. The study page now authors the participant information sheet, the consent version and the consent text, stored in `config.participantInformation` and `config.consent`, which the consent page shows verbatim and whose SHA-256 is recorded with each decision. Versioning: a version without text, or text without a version, is refused; `updateStudy` refuses a changed consent text or information sheet under an unchanged version (`consentChangeIssue`), so one version label always names one text. Line ends are normalised to `\n` before storing. The new critical parity check `base.consent` refuses a study without a non-blank consent text, version and information sheet, so activation is refused too. Existing stored text is not trimmed or rewritten, so the hash of an active study's consent is unchanged.
- **Every item kind (finding 26, fixed).** The item form and `itemFromForm` now author matching items (images as `id | path | alt` lines, options, an answer key per image), sketch items (stroke and size limits), the ranking answer key (correct order), and the image, account, sample-text mark and analysis target that single-choice, ranking and matching test items carry. `saveItem` now requires a matching key to name every image exactly once. The kind list labels Matching and Sketch.
- **The designed battery (finding 25, fixed).** `db/seeds/study-test-items.generated.json` is imported at build time (`DESIGNED_TEST_BATTERY`), so it ships with the deployment. "Attach the designed test battery" on a draft study's page loads any missing designed assessment and seeded instrument as a draft (`seedTestBattery`, `seedInstrumentDefinitions`, both idempotent), then puts the latest version of each in the battery at its designed phase and position, with the study's questionnaire instruments after them in the post phase. Other assessments keep their order after the designed ones. The researchers then review and publish (lock) each draft, as parity and the database already require for a non-demo study. The local demo seed uses the same import.
- **Questionnaire choice (finding 31, fixed).** The study form lists every questionnaire instrument with when it is given (before the pre-test, straight after learning, at the end, or not used), for which condition, which version, and in what order, written to `config.questionnaires`. The cognitive-load scale and UMUX-LITE can therefore be added. With allocation after the pre-test, an instrument given before it cannot be limited to one condition (`protocolIssues`), because no condition is known then. Stale wording about the old D7/D8 battery was corrected in the export dictionary and removed from the after-learning page; study-decisions D7 records the update.
- **Pacing (finding 50, fixed).** Concept Note rev2, Section 9, and D5 settle pacing as self-paced with a 30-minute cap, every stage visited, early finish once every stage is visited. The "Fixed time" option and the early-finish checkbox, whose hint named the wrong cause, are removed; the form edits only the cap, and the console always writes `self_paced`, `allowEarlyFinish: true`, `requireEveryStage: true`. Parity `e.exposure` now also refuses `allowEarlyFinish: false`, which would hold everyone to the cap. `fixed_time` stays in the shared schema because the learning clock and its tests implement it and the study engine is owned elsewhere; no console path writes it and parity refuses it.
- **Activation text (finding 51, fixed).** The text no longer claims a published manifest is required (migration 0023). It names what is checked: every critical parity check, including the information sheet and consent, and in the database a published release snapshot and, for a non-demo study, a locked battery. The hidden manifest field only carries a pinned manifest through a save and is not a control.
- **Stale-metrics advice (finding 52, fixed).** The permission is kept: recomputing writes derived data and stays with `study.configure`. The exports warning (`staleMetricsAdvice`) and the analytics page now tell a role without it to ask a researcher or the principal investigator, instead of pointing it at a button it does not have.
- **Scoring exports (finding 49, fixed).** `GET /research/scoring/export` now requires `exports.create`, like the dashboard CSV and the full export, writes an `export.scoring` audit row (dataset, format, scope, row count, assessment or "all") before the data leaves, and sends `no-store` on every answer. The Scoring page shows the export buttons only to roles that may export.
- **Not changed:** the study engine (`src/server/study/engine.ts`, owned by another agent) and the participant consent page needed no change: they already read `config.consent` and `config.participantInformation`.
- **Evidence:** unit tests `tests/unit/research/study-setup.test.ts`, `tests/unit/assessment-ui/item-from-form.test.ts`, `tests/unit/research/scoring-export-route.test.ts` and the extended `parity-engine.test.ts`; integration tests in `research-console.test.ts` (activation refused without consent, the version rule, the designed battery attached with every step's assessment and the five default instruments, idempotent on a second run) and `assessment-services.test.ts` (console-authored matching and sketch items saved, a partial matching key refused, both assessments published). Each fails on the code before this change.
- **Paper implications:** none for the design. Studies set up in the console now carry the approved information sheet and consent text with a version, the designed test battery and the instruments the protocol names; every scoring download appears in the audit log.

## DR-112: Both Doors Read The Study's Guidance And Time Limit; Settings Nothing Read Are Removed; The Under-Review Notice Is Rendered Again; Door 2 Logs Context Loss (Adopted under the lead's delegation, 2026-11-07)
- **Trigger:** the static audit of 2026-11-07 (`D:/Work/IIT-KGP/Paper_1-artifacts/audit-2026-11-07/static-audit.json`), confirmed findings 12, 14, 18, 19, 20, 21, 22, 23, 45, 56 and 59 and gap 4. Each one was confirmed in the code on `walking-the-process` at 692439a before anything was changed.
- **Help text (findings 12, 21, 22, 23; fixed).** Both doors showed the same fixed `HELP_LINES`. They named a 30-minute limit whatever the study set, and also in the demo and preview, where no cap runs. They promised a return to "any stage you have reached", which neither door allows across traditions. The practice in both doors showed the same lines, although the practice has no stages, no sources and no limit. `sessionHelpLines` in `src/features/process/domain/guidance.ts` now builds the lines from the session's real limit. The limit is `learning_budget_seconds` when `learning_ends_at` is set, which is the cap `LearningSessionFrame` enforces; otherwise there is none. The text has three forms: "Take the time you need, up to the session limit of N minutes. The session moves on by itself when the time is up." when an early finish is allowed; "The session lasts N minutes and moves on by itself when the time is up." when it is not; "There is no time limit. Take the time you need." when no cap runs. The first line now reads "You can go back to any stage you have reached in the tradition you are in.". Both doors already allow this. Going back across traditions was not built, because Door 2 would then have to reload an earlier tradition's yards inside `walk-runtime.ts`, which is outside this change (DR-109). Both practices show `PRACTICE_HELP_LINES` ("This is practice, with neutral content. Nothing here is part of the test." and "There is no time limit here. Go on when you are ready."). The limit reaches the doors through `LearningContext.guidance` (`doorGuidanceOf` in `src/server/learning/context-data.ts`). The page does not compute it again.
- **Last button in the demo (finding 59; fixed).** For anyone who is not a participant, both doors labelled the last button `Questions`, but the API sends them to `/explore`. `finishLabel(studyMode)` gives `Questions` in a study and `Finish` otherwise, in both doors. The study label is unchanged.
- **Guidance (findings 19, 45; implemented).** Concept Note rev2 lists "Same practice and hints" for both doors. Study decision D6 sets hybrid guidance, identical in both pathways, with an on-demand hint, a stall cue and every use logged. No door read the settings, and nothing emitted `guidance_cue_used`. Both doors now get `{ hint, stallSeconds }` from the learning context. The hint is the researchers' `hintText`, and only when `cueEnabled` is set. Both doors show a `Hint` control: an icon button beside Help and Pause in Door 1, a text button beside Sources, Help and Pause in Door 2. It opens the same text. The stall cue is the shared `StallCue` (`src/features/process/ui/stall-cue.tsx`). It appears after `stallSeconds` of active time without reaching a new stage. Active time excludes Help, Pause, Sources, the hint itself, a hidden tab and, in Door 2, loading. The cue offers `Open Hint` or `Not Now`, and the clock restarts after either. The clock is pure (`src/features/process/application/stall-clock.ts`) and both doors drive it through one hook (`src/features/process/ui/use-guidance.ts`). Each use is logged as `guidance_cue_used`: `shown`/`dismissed`/`followed` with `cueId` `stall`, and `followed` with `cueId` `hint`. The dashboard's guidance count and the export's `guidance_uses` column now count real events. The hint dialog pauses the stage clock and the walk, as Help does. The `policy` field (`none`, `exploration_first`, `guided`, `hybrid`) was removed from the schema, the form and the action. D6 fixes the policy as hybrid and not manipulated, and the other three values had no defined behaviour. `cueEnabled` is now the one switch ("Hint and stall cue on"). The activation rule is now "cueEnabled needs hintText". A stored `policy` key is dropped when the config is parsed. New studies keep the hint off, because the hint wording belongs to the researchers.
- **Mini-map (finding 18; removed).** `minimap` (on, off, toggle) belonged to the archived Atlas plan. DESIGN.md 8.6 says that in Door 2 "The learner's position is always shown", and the Door 1 strip is always shown, so a switch would break the equivalence of the two doors. The field was removed from the schema, the study form and the action. The parity override regex in `src/server/research/parity/engine.ts` still lists the key. It only flags a per-condition override, and the file was left alone.
- **Concept search, second consent version, inclusion and exclusion criteria (finding 45; removed).** Neither door has a search box, and no design document asks for one in Walking The Process. `searchEnabled` was removed from the schema, the form, the action and the public demo config. The unused read-model `search()` wrapper and its types were removed with it. `searchSnapshotConcepts` in the snapshot store is left, because the content-pipeline integration tests still exercise it and its index is in a migration. The top-level `consentVersion` was written but never read: consent uses `config.consent.version`. It was removed. `eligibility` was never read and screened no one. A participant learns who may take part from the participant information sheet (`participantInformation`). It was removed from the schema, the form, the action and `eligibilitySchema`. The conservative reading keeps participant data correct: the platform no longer records criteria it does not apply. Removing a key from a stored config causes no parse failure, because the schema strips unknown keys. The audit log keeps every earlier value.
- **Under-review notice (findings 14, 56; implemented).** Commit a7c04e4 (DR-076) deleted `UnverifiedContentNotice` and left its CSS and the AccessNotice "review" wording dead. DESIGN.md 1 requires that "Anything not yet checked keeps a visible ... mark", and the About page promises that records under review are labelled. `LearningContext.contentUnderReview` now carries `content_snapshots.includes_unverified` of the session's snapshot. For the demo and preview this is the review snapshot. `DoorContent` renders `UnverifiedContentNotice` (`src/components/learning/unverified-content-notice.tsx`, `data-slot="unverified-notice"`) above both doors. For a demo or preview visitor, the existing CSS hides the strip and switches the AccessNotice to its merged review wording. A participant whose study runs on unverified content sees the strip alone, the same in both doors. Both doors now start below either strip. The dead `museum-root` and `--notice-offset` rules, and the comments that described the deleted component, were removed. **Not fixed here:** the doors read captions from `content/study/*.template.json` and not from the snapshot. The notice therefore states the snapshot's verification state, not the state of each caption. A participant on a verified release would see no notice even while the template files hold claims still `under_review`. Closing this needs the templates to be built from the pinned snapshot, which is a content-pipeline change outside this area.
- **WebGL context loss (finding 20; fixed).** Nothing emitted `webgl_context_lost`, so the dashboard's `webgl_context_lost_events` check always read 0. The Door 2 session now reports a lost context through `onContextLost`, which logs `webgl_context_lost` before the existing failure path (`onRenderFailed`, `study.webgl_failed`) runs. A yard that fails to start is still a render failure only, not a context loss. The practice yard has no telemetry session, so a loss there is still recorded only by the failure path.
- **Course preview (gap 4; linked).** `/learn/course-preview` is the only screen that shows Door 1 with the Stand-In Model, Colour Not Sourced and Proxy Cloth State marks. DESIGN.md 11 asks for previews of content with proxy chips. The CMS Traditions page now links it as "Open the Door 1 preview" for staff who hold `learn.2d`. The preview no longer uses a hard-coded tradition list: it loads the same templates the doors load (`loadStageTemplates`), checked through `loadTemplates`. It still loops from practice to session and back. Staff leave it with the browser.
- **Equivalence check (7 points):** (1) Content: both doors show the same help lines, the same hint text and the same notice. (2) Exposure: the hint pauses active time in both doors, as Help does, and the stall cue does not pause either door. (3) Citations: unchanged. (4) Controls: Hint sits with each door's existing tool cluster, and the cue is one shared component. (5) Navigation: unchanged. (6) Tradition salience: unchanged. (7) Telemetry: `guidance_cue_used` is logged the same way in both doors. `webgl_context_lost` is technical and exists only in Door 2, where WebGL runs. The parity, research, course, walkthrough, study and process unit suites pass (772 tests in 50 files). Typecheck reports only the missing generated Next route types. ESLint shows the 5 existing `no-img-element` warnings.
- **Tests:** `tests/unit/process/guidance.test.ts` (help lines, practice lines, finish label, stall clock). `tests/unit/learning/door-guidance.test.ts` (guidance and review state from the learning context). `tests/unit/learning/unverified-notice.test.tsx`. In `tests/unit/course/course-session-ui.test.tsx` and `tests/unit/walkthrough/walkthrough-session-ui.test.tsx`: the help limit, `Finish` outside a study, the hint and the stall cue with their logging, the practice help, and the context-loss report. In `tests/unit/study/learning-progress.test.ts`: the new events pass the telemetry contract. `tests/unit/study/engine-rules.test.ts` and `tests/unit/research/study-form.test.ts` cover the removed settings. In `tests/e2e/staff-and-access.spec.ts`, the curator opens the Door 1 preview from Traditions (not run here). Integration: research console, learning clock, telemetry ingest, content pipeline, study engine and dashboard, 97 tests on a private test database.
- **Paper implications:** guidance now exists in the study as D6 describes it, but only when the researchers turn it on and write the hint. Its use is logged per door, so it can be reported as a covariate. Participants on unverified content are told so, the same in both doors.

## DR-113: The Research Dashboard Shows The Registered Primary Outcomes, Builds Its Session Figures From The Events Both Doors Send, Counts 3D View Failures, And Drops The Interface Parity Half Nothing Measures (Adopted under the lead's delegation, 2026-11-07)

**Context.** The 2026-11-07 static audit (`D:/Work/IIT-KGP/Paper_1-artifacts/audit-2026-11-07/static-audit.json`) confirmed four faults in the research dashboard and its neighbours and disputed one. Confirmed #44: the "Primary outcome" row paired `cmap.recall.dl` from a pre-test map with a post-learning map, but DR-075 item 8 made `test.sequence` and `test.stage_placement` the primary outcomes and the parity check `pre_concept_map` blocks any study with a map before learning, so the figures, the gain chart and the ANCOVA table were always empty or showed the wrong measure. Confirmed #9: the per-session figures read `exposure_*`, `navigation_*`, `concept_encountered`, `citation_opened`, `relationship_followed` and `guidance_cue_used`, which neither learning door sends; for every session Exposure, Navigation, Concepts, Coverage, Relations, Citations and Guidance were 0. Confirmed #20: the quality check `webgl_context_lost_events` counted a telemetry event no client sends, while a Door 2 failure is journalled only as `study.webgl_failed`. Confirmed #48 and #58: the interface half of the Equivalence Monitor, on Home, About, the Colophon, the research overview, the parity page and the dashboard, read `analysis/parity/interface-parity.json`, which nothing has written since DR-076, so it always printed "There is no current interface parity run", while the overview and the dashboard card still described checks P1-P33 as run and the Colophon promised "the measured equivalence of the two learning conditions". Disputed #2: Door 1 telemetry carries the CMS snapshot label as `content_version` although the stage course comes from `content/study/*.template.json`.

**Decision.**
- **Primary outcomes (#44).** `loadDashboard` reads `test.pre_test`, `test.sequence` and `test.stage_placement` from `derived_scores` at the version in `metric-definitions.ts`, keyed by participant (the pre-test may sit on a session that a reassignment closed), with the phase taken from the journey step stored with the score (`pre_test`, `post_test`, `delayed_test`) and, for a row without one, from the study's battery. The summary rows are the pre-test covariate (qualifier `covariate`), then each primary outcome at the immediate (`post`) and delayed (`follow_up`) test. The ANCOVA-ready table and its CSV (`dashboard_primary_ancova`) carry `pre_test`, `sequence_immediate`, `sequence_delayed`, `stage_placement_immediate`, `stage_placement_delayed`, as the analysis plan of DR-075 needs (ANCOVA at the immediate test with the pre-test as covariate, mixed model of immediate and delayed). Figures 1 and 2 show both outcomes at the immediate and the delayed test by condition. The change score `cmap.recall.dl.change`, its definition, the pre/post slope chart (`SlopeChart`, no longer used anywhere) and its test are deleted. `cmap.recall.dl` stays as the first concept-map secondary measure, grouped as secondary; the Definitions panel groups the two registered outcomes as primary. The data dictionary, the exports page, the dashboard note and the admin page text say the same, and `docs/research/study-decisions.md` D2 now opens with a note that DR-075 superseded its primary outcome.
- **Session figures (#9).** Chosen by `metric-definitions.ts` and DR-075 (time on the stages is an outcome of self-paced learning, the same in both doors): the per-session figures now come from the events both doors send through `learning-progress.ts`. Stage time is the sum of `stage_left.activeMs` (`computeStageMetrics`, as `stage.total_ms` is defined); stops visited, revisits and back-steps come from `stage_entered`; sources opened counts `source_opened`; pause time stays `timing_resumed.pausedMs`, which the tracker sends in both doors. Door 2's walk events are left out of this table so the two conditions are compared on the same figures; Analytics still derives them. Two definitions are added (`stage.stops_visited`, `stage.sources_opened`), and the seven definitions of figures no door can produce are removed (`time.exposure_total_ms`, `time.navigation_ms`, `exposure.concepts`, `exposure.coverage`, `nav.relationships_followed`, `citation.openings`, `guidance.uses`). The rollup cache changes columns in migration `0024_dashboard_stage_rollups` (it empties the cache first; the next load rebuilds it) and its version becomes `stage-2/timing-1/rollup-2`. The doors were not changed to emit the old exposure events: that would add a rule (when is content "exposed") that the note does not define and that the two doors would have to implement separately.
- **3D view failures (#20).** The quality section counts `study.webgl_failed` journal entries of the study's sessions, by the step they happened in, and the `webgl_context_lost` rollup column is dropped because nothing sends that event. The CSV check is now `webgl_failures` with the step as detail. The tile "Device / WebGL failures" adds them to failed device checks.
- **Interface parity (#48, #58).** The live parity engine checks content (one template, words, sources, model ids, file hashes, both doors reachable); it measures nothing about the interfaces, so mapping its output onto the P1-P33 interface table would present a measurement that does not exist. The interface half is therefore removed with every trace: `src/features/research/interface-parity.ts`, `readInterfaceParity`, `equivalenceSummary`, `getInterfaceParityReport`, the interface table and run line, Home section 5 ("Equivalence of the Two Conditions"), the About and Colophon tables, the parity page's interface section and its test. The component is renamed `content-parity.tsx` and keeps only the content table. The dashboard's confound-control card now shows this study's latest stored content parity report and says that interface measures are not compared. The overview and the Colophon subtitle no longer promise a measured equivalence; the About and Colophon prose still explain how the doors are kept equal.
- **Template version in telemetry (#2), verified, not a data fault.** The stage templates are bundled into the build (`outputFileTracingIncludes` in `next.config.ts`) and every event, batch and session row carries `app_build`, which on a Git deploy is the commit's short SHA (`withBuildVersion`, DR-108), so the templates served are identifiable. `content_version` cannot carry a template hash: the database trigger requires it to equal the session's snapshot label. The gap was the dictionary, which described `content_version` as the content version without saying the stage course is not in it; its `content_version` and `app_build` descriptions now say that `app_build` identifies the templates. The remaining risk is a hand-set, stale `APP_BUILD_VERSION` on a CLI deploy, which preflight already warns about.

**Evidence.** Regression tests, each failing on the code before this change: `tests/unit/research-dashboard/session-telemetry.test.ts` (figures from stage, source and pause events; the same figures for Door 2's events; no unregistered or unsent event type read), `tests/unit/research-dashboard/metric-definitions.test.ts` (primary group equals the registered outcomes, no definitions for unsent events, the dictionary names `app_build` as the template version), `tests/unit/research/content-parity.test.tsx` (no source reads an interface parity report or prints its run line; no public section or subtitle claims a measured equivalence), and `tests/integration/research-dashboard.test.ts` (primary summary and ANCOVA rows from test scores with the covariate, the excluded session left out; session figures from stage events; `study.webgl_failed` counted by step; the new CSV columns). `tests/e2e/public-pages.spec.ts` now expects no parity table on the Colophon and no equivalence section on Home (not run here; the integration step runs e2e). Run on an own database `episteme_test_research` (migrated with 0024, dropped afterwards): the dashboard, dashboard performance, ingest integrity, public dataset stats, engine review and purge integration tests pass; the research, research-dashboard, deploy-source and architecture unit tests pass.

**Paper implications.** The dashboard's results row now reports the measures H1 registers, with the pre-test as covariate, so a reader of the console sees the same outcomes as the preregistration and `analysis/episteme_stats`. The live session table describes how each door's course was used with figures both doors produce. No interface parity result is claimed anywhere; equivalence rests on the content parity report.

## DR-114: Staff Access, Admin, CMS And Public Pages Say And Do The Same Thing: Revocation And The Invite Gate Checked In The Database, Accurate Sign-In Locks With An Audited Admin Unlock, Change And Reset Password, Honest Settings, Sign-Out, Per-Citation Quotes, Candidate Imports, Caption Overrides, A CMS Review-Snapshot Rebuild, A Paged Media Library, Error And Not-Found Pages, Figure Outages, The Home Deck And Every Cookie (Adopted under the lead's delegation, 2026-11-07)

**Context.** The static audit of 2026-11-07 (`D:/Work/IIT-KGP/Paper_1-artifacts/audit-2026-11-07/static-audit.json`) confirmed fourteen defects in staff authentication, administration, access, the CMS and the public pages (confirmed #2, #4, #34 to #42, #55, #57, #60) and one gap (gaps #3). Each is fixed at its root with a regression test that fails on the old code.

**Decisions.**
- **Invite revocation (#2) and the staff-cookie bypass (#4).** `src/proxy.ts` (Next 16 proxies run on Node.js) now decides the invite gate against the database on every gated request: an invite cookie must verify AND its code must not be revoked (`inviteIsLive`, `src/server/access/gate-lookups.ts`), and a staff session must be confirmed by Better Auth (`getSession` with `disableRefresh`) for an unlocked account that holds a staff role. A revoked code therefore sends every browser that used it, including a participant part-way through a study, to `/invite` on its next request, and a forged `ie.session_token` cookie no longer opens anything. A role-less Google account no longer reads the public pages either (closing the read leak DR-105 had accepted). If the database cannot be reached the gate answers 503 with no-store rather than guessing. The admin toast, the revoke dialog, `invites.ts`, `invite-cookie.ts`, the proxy header and RUNBOOK 6.3 and the leak runbook now say exactly this. `scripts/deploy/invite-gate.ts` also refuses a production build whose proxy does not call `inviteIsLive`. Alternative rejected: a check in group layouts, because layouts are not re-rendered on client navigation, so revocation would not take effect on the next request.
- **Sign-in locks (#34).** The per-account lock message now comes from the server with the minutes left (`accountThrottledMessage`, `src/lib/access/sign-in-errors.ts`) and names Admin > Users; only the per-network limit keeps "Wait a minute". Admin > Users shows **Sign-in locked** with the end time and offers **Lift sign-in lock…** (`clearStaffSignInLock`: `admin.users`, a reason, one `admin.sign_in_lock_cleared` audit row; refused when there is no lock). `scripts/unlock-account.ts` stays as the command-line route.
- **Passwords (#35).** The console account menu has **Change password** (Better Auth `changePassword`, other sessions revoked), shown only to accounts with a password. Admin > Users has **Reset password…** for another account: Better Auth 1.7 needs no email for this, because its own hasher (`$context.password.hash`) writes the credential, as account creation already does. It needs typed confirmation of the email and a reason, ends every session of the account, writes `admin.password_reset` without the password, refuses the administrator's own account and Google-only accounts. The create-account hint now points to Change password.
- **Settings (#36).** Admin > Settings shows whether Google sign-in is on and, when it is, that any verified Google account that signs in gets a role-less account; "Self sign-up: off" is shown only when that is true.
- **Sign-out (#37).** `useSignOut` navigates only when Better Auth reports success; a refusal or a network failure leaves the page, re-enables the control and says the session is still open (an alert under the button, a dialog with Try again in the console menu).
- **Per-citation quotations (#38).** `getConcept` selects each citation's stored evidence and `claimDraftsOf` loads a single passage back into the editor's "Quotation from citation N" field of a multi-source claim; a citation with several imported passages says how many are kept. Saving the same quote keeps the stored passage (and its note), so a reworded claim keeps the quotation the curator can see. The read-only view lists the per-citation quotations, and the draft proof shows the stored passages.
- **Media candidates (#39).** The data model already had `imported` and `asset_id`; the design keeps candidates as named, licence-reviewed sources for uploads, so the step is implemented rather than removed: in the selected asset, **Made from a media candidate** records which approved candidate the uploaded file came from (`recordCandidateImport`: `media.upload`, approved candidates only, one `media.candidate_imported` audit row), and the candidate row then links to its asset. No file is downloaded. The unused `assetLinkInputSchema`, `mediaCandidateReviewSchema` and `assetLinkRoleSchema` were deleted.
- **Caption override (#40).** The link form and each existing link have a "Caption for this concept" field that sets or clears the override, under the existing caption rules and return-to-review rule; the link list shows the caption in force.
- **Review snapshot (#41).** CMS > Dataset versions has **Rebuild review snapshot** (`rebuildReviewSnapshot`, `content.publish`), stored with the staff member as creator and a user-attributed `snapshot.review_built` audit row; an unchanged pipeline returns the existing snapshot. The page and the Overview say when the snapshot was frozen and by whom. Because a CMS-built snapshot has no demo study or manifest, `findPreviewContent` now prefers the newest review snapshot that a demo study is pinned to, so `/explore` and staff preview keep their configuration. The unused `latestReviewSnapshotId` was deleted.
- **Media library (#42).** The library is paged (50 per page, `countAssets`, `Pager`), the caption gives the true total, and `?asset=<id>` opens any asset by id (`findAsset`), however old; an unknown id says so.
- **Error and not-found pages (#57).** `src/app/not-found.tsx` (public shell), `src/app/error.tsx` and `src/app/global-error.tsx` (own document, global styles, `main#main` for the skip link), and `error.tsx` for the public, study, CMS, research and admin groups and `not-found.tsx` for the three consoles, all from `StatePage` and `ErrorState` (Title Case heading, Try again, a way back, the server's reference digest, no error text).
- **Figure outages (#60).** `/figures/<id>` logs a database or storage failure and answers 503 with no-store and Retry-After; 404 stays for figures that may not be shown.
- **Home deck (#55).** The deck is built from the data (`homeDeck`): it names the traditions in the dataset, then the study traditions the two conditions teach (`STUDY_TRADITION_SLUGS`, study-decisions D1: Ajrakh, Machilipatnam Kalamkari, Sanganeri), and says the others stay in the knowledge base and are not taught in the study. The Figure 1 caption says the counts cover every tradition and the conditions teach only the study traditions. No craft fact was written.
- **Cookies (gaps #3).** The privacy page lists every cookie from one inventory (`src/server/public/cookie-inventory.ts`) with lifetimes read from the code: invite (30 days), study enrolment (2 hours), study session (6 hours), participation history (180 days), demo (4 hours), staff sign-in (12 hours), known device (90 days) and the Google sign-in check (5 minutes, Better Auth 1.7's `state` cookie). A test fails when the source sets a cookie the inventory does not describe. The staff section mentions Google sign-in and what Google shares.

**Ethics and data.** Revocation now also stops a participant mid-study; this follows the instruction that revocation takes effect for every holder, and the admin dialog and RUNBOOK say it before the administrator confirms. No participant data is deleted or changed by revocation. Nothing else changes for participants.

**Evidence.** Unit tests: proxy gate (revoked code locked out on the next request, forged staff cookie refused, 503 on a database failure), the deploy guard, sign-in and change-password messages, sign-out on refusal and network failure, the change-password dialog, the error boundary, admin row actions, the home deck, the cookie inventory and source scan, and the figure route's 503. Integration tests on a private database `episteme_test_staff`: sign-in lock listing and audited lift, password reset (old password refused, new one accepted, sessions ended, password absent from the audit row), the Settings rows, per-citation quotes loaded and kept through a reworded claim, the CMS rebuild of the review snapshot, previews kept on the demo-pinned snapshot, candidate import, paging and opening an old asset, and the caption override. The whole integration suite passed (28 files, 304 tests, one worker) and the whole unit suite passed (dom and node, 117 files, 1600 tests, one worker); ESLint is clean on the touched files; `tsc` reports only the 43 generated Next route types missing in a worktree without `.next`. No build, browser or e2e run was made here; the e2e invite test was updated to expect `/invite` for a revoked code on `/study`, `/explore` and `/study/consent`.

**Paper implications.** None for the study design or the measures. The access-control description in the methods (invite-only, revocable) is now exact: revocation applies to every holder on the next request.

## DR-115: Sample Text Forms Become Demo Assessments; No Test Option Can Be Found From The Question's Wording; Battery V5 (Adopted under the lead's delegation, 2026-11-07)

- **Trigger:** the 2026-11-07 static audit (`audit-2026-11-07/static-audit.json`, confirmed #27 and #28). #27: every transfer item and most identification items carry a visible `Sample Text` mark, and nothing stopped such a form reaching real participants. `seedTestBattery` wrote every generated form as a non-demo draft, which staff could lock and add to a real study. #28: in both transfer `tool` items, the keyed option repeats a word of the stage named in the question (`dabu`, `indigo`).
- **What the mark means:** DESIGN Section 1 says "Anything not yet checked keeps a visible `Sample Text` or proxy mark"; Section 13 allows no such mark in a final study build and requires it in a mock-up. The generator marks two kinds of item, and both marks are accurate:
  - **Transfer items.** The account and options come from the Bagru and Dabu records. DR-059 verified only the three study traditions and `shared`, and left Bagh, Bagru and Dabu unchecked. The content files cannot say otherwise: `content/FORMAT.md` never allows `verified` in them.
  - **Identification items whose material colour is inferred or provisional** (`itemColourIsUnsettled`, DR-082 and DR-084).
  No item built only from verified content carried the mark, so no mark was removed.
- **Decision, Sample Text (#27):** the generator writes any form that holds a `Sample Text` item as a demo assessment, with a `demo-` code and a `Demo:` title. `seedTestBattery` writes it with `is_demo = true`, read from the same items (`carriesSampleText`). The database already refuses a demo assessment in a non-demo study (`ie_study_protocol_children_guard`, migration 0003). It also refuses a demo flag that disagrees with the code (`assessments_demo_ck`), so a sampled form with a real code cannot be seeded at all. The demo study keeps every form and its marks, as Section 13 asks of a mock-up. The demo forms are:
  - the pre-test (4 of 12 items marked);
  - immediate identification (15 of 24) and delayed identification (6 of 10);
  - immediate transfer (3 of 3) and delayed transfer (2 of 2).
- **What this means for a real study (conservative route, for the lead):** until the unsettled colours are settled and an unseen tradition has passed the source check, no real study can hold a pre-test, identification or transfer form from this generator. *(2026-11-08, DR-124: the transfer restriction ended with DR-120, when Bagru and Dabu passed the source check; both transfer forms are now real. The pre-test and identification restriction stands while look rows stay unsettled.)* A study configured with those steps is refused at activation, because the step has no battery assessment. The rest of the battery stays usable: stage placement, sequence, cloth state, attribution, concept map and sketch. The documents do not settle whether a form may drop its unchecked items and run short. Dropping them would change the pre-test that sets the allocation bands (DR-075 item 2), so it was not done.
- **Decision, wording cues (#28):** a single-choice item is built only if no option shares a content word with its question. Words are compared case-folded, with `ing`, `ed`, `es` and `s` endings removed. A shorter word matches a longer one that starts with it, when the shorter word has at least 4 letters or the two differ by one letter. A short list of question-frame words is ignored (`sharesCue` in `src/features/study/test-items.ts`).
  - **Transfer `next` item:** the pairs are tried from the middle of the PRECEDES chain, as before. A pair whose next stage shares a word with the stage named in the question is skipped, and so are distractor stages that share one.
  - **Transfer `tool` item:** stages are tried from the same middle stage. The keyed tool must share no word with the question or with that stage's line of the account shown beside it, because the account would otherwise name the answer. Distractors follow the same rule. Bagru now asks about Harda treatment, keyed "Mogri (wooden mallet) and stone slab". Dabu asks about Preparing the resist paste, keyed "Mud / black clay (kali mitti)".
  - **Stage placement:** the audit named only the transfer items, but the same check found the same fault in stage placement, a primary outcome (DR-075 item 8). 26 of the 46 placeable objects were named after their own stage, for example "At which stage of Ajrakh is Indigo used?" against "Indigo Dyeing". These objects are left out. Where only distractor stages share a word, those stages are dropped from that item's list, so a participant can neither match nor rule out an option by its wording. Pre-test placement keeps two objects per tradition, chosen from the objects that pass.
- **Battery change:**
  - immediate stage placement goes from 28 items to 11, and delayed from 12 to 3. Delayed placement is now thin; the split between the forms (every third object after the pre-test goes to the delayed form, DR-075 item 10) was not changed;
  - three pre-test placement items name other objects;
  - both transfer `tool` items and the delayed `next` item changed.
  The other forms are unchanged item for item. `npm run content:test-items` regenerates `db/seeds/study-test-items.generated.json` and leaves the tree clean.
- **Version:** `seedTestBattery` does not overwrite an existing code and version, so the e2e studies move to battery v5 (`demo-walking-v5`, `demo-walking-cap-v5`). The journey spec now checks both studies for missing images and checks that the seeded items match the generated file (`batteryDriftFromGenerated`). A local demo study seeded at an earlier version keeps its old items.
- **Equivalence:** the battery is the same for both doors. Nothing here changes what either door shows or records.
- **Evidence:**
  - `tests/unit/study/test-items.test.ts` (19 tests). The overlap check over every single-choice item of the generated battery, the account-line check for both tool items and the demo-form check all failed on the battery at 692439a and pass on the regenerated one. Fixture tests cover a leaking tool, next stage, distractor and placement object.
  - `tests/integration/study-engine.test.ts` (30 tests, run on a separate test database). The new test failed on the old seeder (`assessments_demo_ck`). It now shows a sampled form seeded as a demo record, refused by a non-demo study, and a sampled form with a real code refused at seeding.
  - The generated battery was seeded at version 5 into that database inside a rolled-back transaction: 15 forms, the five listed above as demo.
  - Not run here: the production build and the e2e suite, which the integration step runs.
- **Paper implications:**
  - Report that test items were screened so that no option shares a content word with its question.
  - Report that stage placement lost the objects named after their own stage. Results gathered on battery v4 or earlier are not comparable on stage placement.
  - Report that the pre-test, identification and transfer forms stayed demo-only until their content was checked.

## DR-116: Integration Of DR-110 To DR-115; Settings No Study Can Use Are Removed; Per-Caption Review Notice; Template Hash Per Session; Analysts Recompute Metrics; Transfer Accounts That State No Order; Equal Placement Forms (Adopted under the lead's delegation, 2026-11-07)

- **Trigger:** the six fixer branches of 2026-11-07 (DR-110 engine, DR-111 console, DR-112 doors, DR-113 research, DR-114 staff, DR-115 items) were merged one at a time with `--no-ff`. Their reports listed items left undone; the lead asked for each to be finished.
- **Merge resolution:** `decisions.md` keeps every record in DR order. Where two branches changed the same code, the later decision wins only where it removes something the earlier one still carried:
  - the console form takes DR-110's allocation rule (`allocationFromForm`) and DR-111's consent, information sheet, questionnaires and learning cap;
  - DR-112's removal of the eligibility criteria, search and mini-map settings stands;
  - the doors' Help reads the cap from the study config (DR-112), because DR-110 deleted the client time budget it had read before.
- **Within-subjects (DR-110 left the enum and trigger).** Migration `0025_drop_within_design` rewrites `ie_allocations_insert` and `ie_study_sessions_guard` without content sets, drops `allocations.content_set_code` and `study_sessions.content_set_code`, and recreates `study_design` with `between` only. A draft study still marked `within` is set to `between` first. The engine's `unsupported_design` refusal, the parity check `design_not_between` and the Design column of the studies list are gone, because the database holds nothing else. Schema test: inserting `design = 'within'` is refused by the enum.
- **Allocation at enrolment and researcher strata (DR-110 kept them).** The console cannot set `allocation.point` or strata, and no script, seed or page sets them. `allocation.point`, `allocation.strata`, `allocateAndOpenSession`, `stratumChoiceNeeded`, the group question on the entry form and its server check are removed. The participant stratum comes only from the scored pre-test. Because the device check now always comes before allocation, the `webgl_reassign` verdict at the check could never fire and is removed; `reassign` still acts on a failure inside the walkthrough.
- **Self-paced only (DR-111 kept `fixed_time`).** The parity check already refused anything but a cap with every stage required and an early finish allowed, so no study could activate with `fixed_time`, `allowEarlyFinish = false` or `requireEveryStage = false`. `studyConfigSchema.exposure` is now `{ minutes? }`. Learning may end when the cap passes or when every stage is visited. The `learning_time_remaining` refusal, its 409 reply and notice, the fixed-time introduction text, `LearningFinishRefusedError` and the hub's minutes-left line (shown only without `requireEveryStage`) are removed. Migration `0026_learning_clock_template` drops the `fixed_time` check from the clock trigger. The refusal before the cap is now the stages-unvisited refusal, named in both doors.
- **Withdrawal after exclusion (DR-110 flagged it).** An exclusion (at the device check or after a second walkthrough failure) no longer clears the participant cookie, and `resolveWithdrawalSession` admits a session that is excluded with the participant `excluded`, which the database already lets move to `withdrawn` (`ie_participants_terminal`). The exclusion page offers "Withdraw from the study". Taking part stays refused.
- **Recompute (DR-111 kept it behind `study.configure`).** A new permission `metrics.recompute` is held by the principal investigator, researchers and research analysts. Like `parity.run` and pseudonymised exports, it only derives stored rows from data that already exists, so the analyst stays read-only on research data. Every role that can export can now recompute, so the "your role cannot recompute" advice is removed.
- **UMUX-LITE scale (DR-111 left it out).** `umux_lite.score` is scored as Lewis, Utesch & Maher (2013), CHI 2013, p. 2102 (PDF p. 4) describe: "subtract 1 from each 7-point item, add them together, then multiply by 100/12". Their regression to the SUS scale (.65 × score + 22.9) is not applied, because it was fitted on the original wording, which D7 changes. Scale-score version 1.2.0. The PDF is archived at `D:/Work/IIT-KGP/Paper_1-artifacts/sources/lewis-utesch-maher-2013-umux-lite.pdf` (sha256 `ed6e3f964ccb454bccee8f0805651575079d44d2a47646c42676eb5c707de709`); the quote was found with `pdftotext` on PDF page 4, and the quote and locator are in `study-decisions.md`, which the metric-definitions test checks.
- **Review notice per caption (DR-112 left it per snapshot).** The learning context now carries the process stages that the pinned snapshot holds as `verified` or `published`. A caption is under review when any stage it draws on (`sourceStageKeys`) is not among them. Door 1 prints "This caption is under review: a curator has not yet verified it." under the caption; Door 2 prints it on the route plate and in the Sources dialog. The page strip shows only when a caption the learner will see is under review. The template files are not changed.
- **Going back across traditions (DR-112 made the help text accurate).** Decided by the design: neither door returns to an earlier tradition. Each tradition is walked as one place from its first stage to its products, and both doors behave the same, so the help line "in the tradition you are in" is true for both. No change.
- **Context loss in the practice yard (DR-112).** In a study the practice now runs inside a telemetry provider for the participant's session, and the walkthrough practice reports `webgl_context_lost` before it reports the render failure.
- **Leftover settings (DR-112).** The parity override pattern no longer lists search, mini-map or content sets. The `cue_both_doors` warning is removed: both doors read one config (DR-112). `searchSnapshotConcepts`, used only by its own test since learner search was removed, is deleted with that test.
- **Template hash per session (DR-113).** `study_sessions.template_sha256` records the SHA-256 of the canonical JSON of the stage templates served, in the same statement that starts the learning clock. The clock trigger sets it once with the clock. It is in the sessions export, so a session's captions and stops are identified even when the build label is stale.
- **Stale wording (DR-113).** The stats package docstring names the registered primary outcomes. The dashboard's "Dwell time per layer" heatmap is removed with its CSV table (`dashboard_dwell`): it read `time.exposure_by_layer_ms`, which neither door has emitted since the walking-the-process doors, and its empty text pointed to a recompute that could never fill it. The living module documents (study engine, research console, condition equivalence, data and telemetry layer) now describe the self-paced cap, the template hash and the removed settings; dated records are left as history.
- **Proxy database lookup (DR-114).** Next 16 runs Proxy on the Node.js runtime by default (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, "Runtime"), so the invite and staff lookups stay in `src/proxy.ts`. The production build compiled it, and `next start` answered `/study` with a redirect to `/invite` and `/research` with a redirect to `/sign-in` before the e2e run.
- **Transfer account (DR-115).** An account line whose summary states an order (after, before, then, first, until and similar) shows only the stage title. A `next` item is built only if neither stage's line names the other, and every option of a `tool` item must share no word with the whole account. Bagru loses its tool item, because none passes; Bagru now asks what comes after resist printing, keyed Indigo dyeing.
- **Placement forms (DR-115).** After the pre-test objects, each placeable object goes to whichever of the immediate and delayed forms is shorter, and the immediate form is cut to the delayed count. Both forms now have 7 items (were 11 and 3). This replaces the every-third-object split of DR-075 item 10 for stage placement only. The e2e studies move to battery v6.
- **Designed battery and demo forms.** Attaching the designed battery to a real study now names the forms it leaves out because they still hold Sample Text (pre-test, identification, transfer), instead of leaving them out silently.
- **New e2e specs** (`tests/e2e/study-lifecycle.spec.ts`): the console sets up a study (cap, information sheet, consent, designed battery); a required question left blank is refused with its message and the form goes on once answered; a finish before every stage is visited is refused while the cap runs. The console spec does not pin a snapshot: the local database holds no non-demo release, and only a curator can make one; pinning is covered by the research-console integration tests.
- **Found by the e2e run:**
  - Closing the tab during the 3D walk counted as a WebGL failure: the browser drops the context as the page unloads, the walk reported a render failure, and under `retry` the session went back to the device check. Both the walk and the practice yard now ignore a failure after `pagehide`; a unit test covers it. This failure appeared in the resume spec only when the participant was allocated to Door 2.
  - Three specs written by the fixers but not run had stale expectations: the live dashboard spec now finds the events cell inside the Per-Session Telemetry table (DR-113 added a per-participant results table with the same row names); the awaiting-access spec now expects a signed-in account without a role to be sent to `/invite` from `/explore` and `/study` (DR-114 admits only a database-confirmed staff role).
- **Evidence:** `npm run typecheck` and `npm run lint` clean (5 existing `<img>` warnings). Vitest dom and node (2 workers, integration on `episteme_test` included): 156 files, 2020 tests passed. Clean `next build` passed. Playwright chromium project, 1 worker, against `next start` on port 3100: 34 passed, 3 failed and 5 did not run on the first full run; after the fixes above, a rebuild and a rerun of the affected files (`study-lifecycle`, `research-dashboard-live`, `staff-and-access`), every test passed, including the revoked-invite spec through the proxy's database lookup.
- **Equivalence:** every change applies to both doors identically: the cap and finish rule, the per-caption notice, the help text and the battery.

## DR-117: Streaming Stays Inside The Work Slice On Both GPUs: Paced Builders, A GPU Fence On The Pacer, One-Triangle Warm Draws, A Canvas That Only Grows, And A Governor That Starts From A Measured Floor (Adopted under the lead's delegation, 2026-11-08)

- **Trigger:** DR-109's route walk (Kalamkari, NVIDIA GTX 1650, 1920 by 1080, device pixel ratio 2) had worst frames of 56, 106, 268, 176, 133, 298, 56, 51 and 38 ms on legs 2 to 10, spiking where the next yards stream in. On the Iris Xe a leg stalled (worst 1729 ms) before the render-scale governor reacted. An earlier agent started the fix and was interrupted with 45 changed and 6 new files; this record covers its work and the rest.
- **Kept from the interrupted agent (read and checked):**
  - Builders that ran as one block now run as paced generator steps: cloth settling and bend refinement (cloth planning keeps the spec; `buildYard` settles it through the pacer), vertex normals, thrown vessels, fill surfaces, wall film, surface shading, pile packing, far normals and smoothed piece colours, and the tray, tool, vessel, dung, plant and root pieces.
  - Work moved off the main thread: the sky HDR is decoded and its sun softened in the decoder worker (`rgbe-sky.ts`), painted words are drawn in the worker (`painted-layer.ts`), and the horizon scrub is a baked PNG (`public/walkthrough/tex/horizon/scrub.png`, made by `tools/walkthrough-lab/bake-horizon.cjs` with a seeded generator) instead of a 4096 px canvas painted at load.
  - `SceneWarmup` compiles programs one object per paced step against the real lights and fog, draws at most one new program per batch, and uploads texture strips within a byte budget per slice. The surroundings (sky, hills, land) and the post-process passes are warmed before the first yard.
  - PMREM shaders and targets are compiled before the two environment maps are generated; the sun shadow uses `PCFShadowMap`.
  - `startingRenderScale` and a governor that starts at a given level; the main target renders into a region of a top-size target (`drawShare`), so lowering the scale does not reallocate it; the pixel-footprint uniform reads that region's height.
- **Found and fixed in this pass (each measured):**
  - **The canvas stayed at full device density.** With `drawShare` alone the canvas was always 3840 by 2160 at a ratio of 2. On the Iris Xe this gave frames of 0.9 to 1.1 s every one to two seconds while the scene itself rendered in about 10 ms; with the same scene and a canvas at ratio 1 the worst frame was 61 ms. Now the canvas pixel ratio follows the governor but only grows, and a lower scale renders into the region. A canvas resize costs 20 to 23 ms of main thread on the GTX 1650 at ratio 2, so it happens at most once per level reached.
  - **The governor started where the device could not hold.** It now measures the start view at the lowest level and extrapolates by pixel count (`startingRenderScale(ratio, sample, measuredAt)`); a measurement that fits the budget keeps that level at least. Without a GPU timer result the walk starts at the lowest level and the governor raises from there. On the NVIDIA route the timer returned no result during calibration, so the walk started at 1, reached 1.75 in leg 2 and 2 in leg 3.
  - **CPU-bounded slices could still queue unbounded GPU work.** On the Iris Xe the two PMREM generations queued 90 to 140 ms of GPU work that stalled a later frame. `WorkPacer.trackGpu` places a fence and does not open the next slice while the GPU is more than 10 ms (walking) or 80 ms (loading) behind; `settle()` waits for the GPU and is used after each PMREM. A strict one-slice rule made the NVIDIA load 29 s against 10.8 s without fences; the allowance above gives 13.6 s.
  - **Warm draws drew whole meshes.** The 64 px warm draw rendered every object in full (3.0 million triangles at the first station). It now draws one triangle and one instance per object, which compiles the same program variants and costs almost no GPU time.
  - **Main-thread steps over the slice while walking** (CPU profile of legs 4 to 7 on the GTX 1650): reading program and shader info logs on a program's first use blocked 54 to 68 ms, so three's shader error check is switched off once walking starts (shader errors still surface during loading and in the lab, which compile every material family; a program first built while walking is not checked); `phongTessellate` (47 ms in one step) and `medianUvPerMetre` are now paced steps; far-normal and smoothed-colour steps went from 2048 to 128 vertices.
  - **The main target and the shadow map** are allocated and used once during loading, in separate frames (`RenderView.prepare`), instead of on the first walking frame.
- **Proof (each once, renderer strings confirmed):**
  - **NVIDIA route** (`route.cjs`, Ajrakh, 1920 by 1080, ratio 2; free RAM 7165 MB and CPU 16 per cent before, 7204 MB after): load 13.6 s; worst frame per leg 29, 33, 42, 41, 47, 26, 40, 48 and 17 ms, no frame over 50 ms; render scale at the end of each leg 1.75, then 2; back, interrupted back, wrong turns and dispose passed. Two earlier runs of intermediate code had one 55 ms frame (leg 8, and legs 3 and 5 with a 66 ms one); the profile above traced those to the info-log reads and unpaced tessellation, fixed before this run.
  - **Iris Xe** (headless shell, the project's low-spec profile 1366 by 768 at ratio 1; free RAM 7118 MB, CPU 12 per cent before): load 10.8 s with a worst frame of 45 ms; the leg to station 2 had 1601 frames, median 16.7 ms, worst 27 ms. No frame over 100 ms.
  - **Scene checks** (NVIDIA, ratio 1; the changes reach every yard, the entrance and the practice yard, so all 32 scenes): density passed on 32 of 32 and tearing passed on 32 of 32, with 0 failing surfaces and every planted fault caught. Shimmer (`flicker.cjs`, share of pixels changing by four or more levels in a pan): Ajrakh n=4 0.102, n=2 0.165, n=5 0.150, n=9 0.353, practice 0.099, entrance 0.205 per cent (entrance 0.206 in DR-109).
  - **Unit tests:** the walkthrough suite passed, 157 of 157 in 17 files, including the starting-scale tests rewritten for the measured level. Typecheck has no errors outside the route types `next typegen` writes; ESLint is clean on every changed file.
- **Open:** on the Iris Xe at 1920 by 1080 and ratio 2 the lowest level (ratio 1, 1920 by 1080 pixels) does not hold: the leg had frames of 100 to 225 ms with the main thread idle, and even at half that resolution 6 frames passed 100 ms, so the cost is geometry (1.4 to 3.0 million triangles in view), not pixels. Holding that screen on integrated graphics needs geometry levels of detail, not a lower render scale.
- **Paper implications:** none for content or logging; loading on a fast GPU takes about 3 s longer.

## DR-118: Every Image Is Licensed For Public Use By CXA's Approval; Study Photographs At Full Size Reach Learners In Both Doors (Adopted under the lead's delegation, 2026-11-07)

- **Licence basis:** all product and study photographs, and every other third-party image the site uses, are licensed for public use by CXA's approval. The lead recorded this on 2026-11-07; no email evidence is needed. No image is "to be licensed" any more.
- **Records:**
  - `public/walkthrough/manifest.images.json`: every third-party row has status `cxa-approved` and the permission "Licensed for public use by CXA's approval (DR-118)". The contact routes, which existed only to write to holders, are removed. `scripts/content/build-walkthrough-images.ts` writes these values; `permissionFor`, the 768 px permission list and the contact list are deleted.
  - `public/walkthrough/manifest.scene.json`: the four non-CC0 texture sources (camel dung, madder bark, Kew herbarium leaves) carry the same permission; the note left for the lead on the Kew ruler is closed.
  - `docs/to_be_licensed.md` and its generator are replaced by `docs/image-credits.md` (`npm run content:image-credits`, `scripts/content/build-image-credits.ts`): every third-party file with its credit, source, size used and licence basis, the six study photographs with their sizes, then CC0 and open-font files. The generator refuses a row with no licence basis; `tests/unit/process/image-credits.test.ts` checks the file matches it.
  - DESIGN.md L9, 10.1, 10.5, 13, the product panel and hall (7, 8.8) and the product-photograph open point now say this. The proposal files (`content/review/*proposals*`) drop the 768 px display cap.
- **Limits that existed only for licensing are removed:**
  - **Files:** the six study photographs are the source originals at full size (2013 x 2500 to 4033 x 2778 px), each checked against the SHA-256 its proposal records; only the recorded crop of the Machilipatnam textile (325 px at the left, the museum's paper tag) is applied, at JPEG quality 95 with 4:4:4 chroma. `npm run content:study-photos` (`scripts/content/build-study-photos.ts`) makes them. The originals were fetched on 2026-11-07 from the V&A IIIF service, Sahapedia and Flickr (the Flickr CDN answers 429 without a browser referer; with one it served the originals), and all six hashes matched.
  - **Database:** migration `0027_drop_licence_governance` drops `assets.max_pixels`, `licence_expires_on`, `licence_term_months` and `first_published_on`. `stampFirstPublication`, the display-cap refusal at review (`exceeds_licence_cap`), the expiry-limited cache age (`figureMaxAge`), the CMS fields and library columns for cap and expiry, the parity checks `figure_below_cap` and `figure_licence_expired`, `STUDY_FIGURE_CAP`, `displayLongEdge` and `licenceValidOn` are deleted. Credits, licence names and the alteration rules of PARI and Sahapedia stay: they are attribution and fidelity to the record, not limits on quality.
  - **Gate:** `servableSql` no longer needs a published release for the live path, because that condition existed so that showing a photograph would not start a licence term (DR-063). A photograph is servable when it is approved, carries its credit, caption and alt text, and illustrates a real concept (or is a public plate); a published release still shows exactly the figures frozen into it (DR-037). The figure route, `loadLearnerFigure` and the photo lists no longer take a date.
- **Reaching learners:** the doors were built only from `content/study/*.template.json` and never read the gated read model. Now:
  - the learning context carries the snapshot the learner reads (the study's release, or the newest review snapshot for staff and demo previews) and the study's `figures.photos` switch;
  - the door session calls `listStudyPhotos(snapshotId)` (`src/server/knowledge/read-model.ts`, cached under the `media-figures` tag the media actions drop), which applies the anchor-concept gate in that snapshot (`photoFiguresOf`, through `conceptPhotosOf`);
  - `withStudyPhotos` (`src/features/process/domain/stage-template.ts`) adds each tradition's photographs to its template. A kind (concept type) missing for any tradition is dropped for all, so no tradition shows more. Names are uniform: "<Tradition> Textile" and "<Tradition> Printing Blocks"; the holder is the short form of the credit.
- **Where they show (equal exposure):** at each tradition's product stop, after its finished textiles, through one list (`exhibitImages`) that both doors and both parity door views read:
  - Door 1: in the product panel's rails, with the textiles' band; `Sources And Credits` gives the caption, the full credit and the licence;
  - Door 2: hung on a frame in the product hall like the textiles, name and holder painted on its board; the hall's `Sources And Credits` dialog gives the same lines.
  - **No duplicates:** two products were the same V&A records as two study photographs (Ajrakh 5473A(IS) and Sanganeri 4497(IS)). Each product now carries its source record (`record`, from the image manifest), and a study photograph of the same record takes that product's place, so each object shows once, with its curated caption. Ajrakh shows 6 images plus its blocks, Sanganeri 3 plus its blocks, Machilipatnam Kalamkari 6 plus its textile and blocks.
  - The parity store builds the same templates for a study's snapshot and hashes the photographs by their stored SHA-256, so the file-hash and same-files checks cover them.
- **Equivalence (7 points):**
  1. Content: the same six photographs, names, holders, captions and credits in both doors, from one list; the door-view parity tests pass with the photographs in.
  2. Exposure: both doors show them at the same stop, after the same textiles; neither adds a step.
  3. Citations: the caption and credit open from `Sources And Credits` in both doors.
  4. Ease: the same band or painted board, the same dialog or details.
  5. Navigation: unchanged.
  6. Tradition salience: two photographs per tradition, balanced by kind; a missing kind is dropped for all.
  7. Telemetry: nothing new is logged; the product stop is already a stop in both doors.
- **Deployment:** the skill `enable-study-photos` and RUNBOOK 7.1 describe the new path: ingest (which replaces the earlier 768 px rendition of the same record on its concept), a second curator's review, and a review-snapshot rebuild. Previews show the photographs at once; a study shows them once it pins a release published after that.
- **What is seen:** the V&A textile photographs keep the museum's studio ground around the object (dark for Ajrakh and Machilipatnam Kalamkari, white for Sanganeri), because the proposals record no crop beyond the Machilipatnam paper tag; in Door 2 that ground hangs as the edge of the printed sheet. In the hall's opening view the second row of frames stands behind the first, as the products did before.
- **Evidence:**
  - `npm run typecheck` and eslint on every changed file: clean (the 2 existing `<img>` warnings in the product panel).
  - Vitest (1 worker): 54 unit files, 546 tests passed (process, knowledge, research and parity, course, walkthrough session and scene rules, study, architecture); integration on a throwaway database: `cms-media`, `cms-release-governance`, `research-console`, `learning-clock`, `content-pipeline`, all passed, with migration 0027 applied.
  - Lab on the GTX 1650 (renderer string confirmed), the three halls with the study photographs hung: `walkthrough:check` 0 hits with every planted fault caught and the walk reaching the end; `walkthrough:density` 0 failing, the photographs listed as printed textiles at 628 to 1165 px/m (source-limited); `walkthrough:tearing` passed.
  - App (`next build`, `next start` on port 3300, a throwaway copy of the local database with the six full-size files ingested by the content editor and verified by a second curator), full Chromium on the GTX 1650 at 1366 x 768 and device pixel ratio 2, demo access: Door 1 shows both photographs of each tradition at their full files (2013 x 2500 to 4033 x 2778 px served by `/figures/<id>`, each answering 200) with the band and the Sources And Credits lines; Door 2 fetched the same six files, hung them in each hall, and its Sources And Credits dialog lists the same lines. No console errors. Screenshots of each photograph in each door, the panels, halls and dialogs: `D:/Work/IIT-KGP/Paper_1-artifacts/dr-118-study-photos/`.

## DR-119: One UI: Every Public, Study, CMS, Research And Admin Screen Moves To The DESIGN.md System; Atlas Is Deleted (Adopted under the lead's delegation, 2026-11-07)

- **Trigger:** only the doors used the binding DESIGN.md system (vat, turmeric, Eczar, Mukta). Every other screen still drew from the archived Atlas tokens in `src/app/globals.css`, while DESIGN.md Section 1 says it covers study and staff screens and that Atlas stays only until they are rebuilt. Study pages wore a `.walking` class that aliased Atlas names onto DESIGN values, so a screen read as DESIGN only where that wrapper happened to sit.
- **One token file:** `src/styles/walking-tokens.css` now declares every Section 4 value and named extra on `:root`, with the Eczar and Mukta faces. `src/app/globals.css` imports it, resets Tailwind's default palette, fonts, radii and shadows (`--color-*: initial` and the rest), and maps each token to a utility of the same name (`bg-vat`, `text-lime`, `border-line`, `bg-turmeric` ...). The `.walking` aliases, the light, `.dark`, `.a11y-contrast` and dark high-contrast blocks, the shadcn semantic layer, Atkinson Hyperlegible Next and Anek Latin are deleted. The two faces are preloaded from `/walkthrough/fonts`.
- **Type roles:** Section 5 roles are utilities: `t-h1`, `t-h2`, `t-h3`, `t-h4` (Eczar), `t-label` (Eczar 700 18 px, labels, buttons, tabs), `t-l`, `t-b`, `t-s`, `t-table` (Mukta, tabular figures) and `t-min`. Every Atlas type utility was mapped to its role in one codemod (`text-title` to `t-h3`, `text-reading` and `text-body` to `t-b`, `text-label` and `text-ui` to `t-label`, `text-caption`, `text-credit` and `text-source` to `t-s text-lime-dim`, `text-table` to `t-table`); colour utilities were mapped the same way (ground and field to vat, sunk to vat-2, wash to raised-hover, ink to lime, ink-2 and ink-3 to lime-dim, rule to line, rule-strong to lime-dim, indigo to turmeric, danger to madder or madder-text, warn to turmeric).
- **Shared components rebuilt on Section 6:** buttons (46 px, 2 px lime border, Eczar 19 px; primary turmeric with hover and pressed tones; danger madder; quiet underlined), fields and native selects (46 px on vat-2, lime-dim border, 17 px, turmeric chevron), 24 px checkboxes and radios turmeric when checked, option rows with a turmeric edge when chosen, Likert cells joined on vat-2 and turmeric when chosen, tables (15 px heading over a 2 px rule, 1 px row lines, row hover), tabs (Eczar 18 px, 4 px turmeric underline), dialogs and sheets (vat-2, 2 px lime border, max 520 px, the Section 4 backdrop), alerts (vat-2 with a 6 px status bar, icon and word), chips (1 px status border, words), toasts (cotton with stamp text), console and public navigation (current item turmeric), page headers, the wordmark in Eczar 800 and the study step strip (raw cloth strips on 12 px bands, current outlined turmeric, ahead as loose threads). Square corners and no shadows everywhere. The focus ring is the Section 6 ring: 3 px turmeric, offset 2.
- **Charts:** series 2D lime and 3D turmeric (still told apart by circle and square markers and solid and dashed lines); the heatmap ramp runs vat-2, line, thread, turmeric-lo, turmeric, turmeric-hi, with lime cell labels on the first three steps and vat on the last three. The chart reads the tokens once at mount, since nothing switches theme any more.
- **Figure 1 and the sign-in page:** Figure 1 is a vat-2 plate with lime outlines and one turmeric accent (a turmeric plate made the interface colour a large surface). Sign In shows the plaster wall beside the form, as Section 11 asks.
- **Display settings removed:** DESIGN.md defines one theme, so the Dark theme and High contrast switches, `next-themes`, the pre-paint boot script and the study's High contrast step are removed, with the `contrastAccommodation` field of the device report. The High contrast switch already changed nothing on study pages, because the `.walking` wrapper redeclared every colour under it. Body and secondary text are above 7:1 on every surface (lime 14.80 and lime-dim 8.91 on vat), so no second palette is needed. Reduced motion follows the operating system; study pages keep zero motion.
- **One contrast fix to Section 4:** the named danger hover `#C63A2E` gives lime text 4.24:1, below Rule 15. The danger button keeps its madder fill on hover and turns its border lime; `#C63A2E` is removed and DESIGN.md says so.
- **Rules that reject Atlas:** `tests/unit/design/design-lint.test.ts` fails on any Atlas or shadcn colour utility, custom property or type utility, any theme or high-contrast class, a retired font, a hex outside Section 4 in interface code, a radius other than radios, a shadow, a third family, uppercase or a left accent bar, and it asserts that `globals.css` maps only the DESIGN tokens. `eslint.config.mjs` rejects Atlas names in class strings through `no-restricted-syntax`. `tests/unit/contrast.test.ts` now checks that the token file holds exactly the Section 4 values and its named extras and that every pair the screens draw meets 4.5:1 for text and 3:1 for boundaries. The Atlas lint, dead-alias and four-theme contrast tests are replaced, and `docs/design/atlas-v1.md` is deleted (git keeps it).
- **Comments:** the Atlas-era comments in every touched code file cited the archived section numbers; they are removed with an AST pass (tool directives kept), per Section 0.1.
- **Evidence:** typecheck clean; lint clean (5 existing `<img>` warnings in Door 1); Vitest dom and node, 1 worker: 130 files and 1584 tests passed (25 integration files skipped without a test database). Production build (`next build --webpack`, because Turbopack does not resolve the junctioned `node_modules` of a worktree) served on port 3400 against a local database. Every public, console and detail screen, and the study entry, consent, questionnaire, pre-test, device check, entrance and session screens, were captured at 1366 and 400 px wide on the NVIDIA GTX 1650 (renderer string confirmed) and looked at beside the Door 1 practice panel. There is no light or dark variant to capture, because DESIGN defines one theme. Found and fixed from the captures: a long danger button forced a 4 px horizontal scroll at 400 px (buttons now wrap below 640 px and never exceed their container), and the admin health label "Directory" was overlapped by a long path.
- **Equivalence:** both doors are unchanged in look and data; the study screens around them now share their palette and type. The study's display step is removed for every participant alike.
- **Paper implications:** report that every participant saw one fixed palette (no theme or contrast option) on every study screen; sessions recorded before this change may carry a `contrastAccommodation` flag that no longer exists.

## DR-120: Content Verified On Its Own Recorded Sources (Adopted under the lead's delegation, 2026-11-07)

- **Ajrakh.** Every unverified item of `content/traditions/ajrakh/tradition.json` was checked only against the 15 sources the file records, each quote at its page or section and found verbatim by `content/review/tools/evidence/verify_tradition.py` in copies fetched again on 2026-11-07 and archived with `archive.json` at `D:/Work/IIT-KGP/Paper_1-artifacts/sources/ajrakh-2026-11-07/` (the GI Journal No. 188 PDF of application 1050, sha256 `aef5e0ee…d1fcd3`, is the one the 2026-10-16 check used; S3, S4, S5 and S11 hash equal to `source-manifest.tsv`; the other pages were fetched again because the 2026-10-14 copies are no longer on disk). Result: 511 of 511 quotes at their locator; 185 claims in 80 concepts each read against their quotes; 8 claims reworded to the source's own wording (Maldhari purchasers, alizarin "invented", the 1950s and 1970s dye history, the post-earthquake move, the artisan's iron figures, the rang paragraph, the double-sided "pinnacle", the GI migration dates); one kut quote replaced by the p. 6 "ironwater ... mixed with smooth tree gum paste" passage; two locators corrected (S10 byline to the article heading, S4 "Brief description" to "Object details"); 14 quotes that did not bear on their claim removed. Three relationships that no recorded source states were removed and archived in `content/review/removed-relationships.json` (khariyanu and pa USES tari: S1 describes the tari only in general; water-iron-content SCIENTIFICALLY_EXPLAINED_BY iron-tannin-black: S10 names no tannin and S1 states the reaction only for kut); the tari links were already outside the stage template, so the template and both doors are unchanged. The order of the stage headings in the GI method of production (PDF pp. 5–8, offsets strictly increasing in PRECEDES order) is taken as the source's statement of sequence, which settles the ruling DR-060 left open for kasano → khariyanu and kut → pa; the seven Ajrakh entries of `unsupported-relationships.json` are resolved and taken out of it. All 80 concepts and 150 relationships are `verified`; the 9 links to concepts of `content/shared/craft-science.json` stay `under_review` because KG206 refuses an accepted link to an unaccepted concept. To carry the state in the files, FORMAT v1 now admits `verified` (`IMPORTABLE_STATES`), and the importer stores it as `under_review` (`asImported`), because only a curator's recorded transition, such as `scripts/content/verify-concepts.ts` under the lead's account (DR-059), accepts a row in the database; the lossless-import test compares against the model as imported. Evidence table: `content/review/ajrakh-verification.md`. Checks: `npm run test:content`, the knowledge-graph, content-contract, stage-template, diagram and figure-balance unit tests, and the content-pipeline integration test on a throwaway `episteme_test` database, all passing.
- **Bagh (`content/traditions/bagh/tradition.json`, record `content/review/bagh-verification.md`):** the lead authorised verifying every item still `under_review` (104) or `needs_evidence` (20) on the sources the file already records. All 13 sources were fetched again and hashed: S1, S2, S7, S8, S10 and S11 are byte-identical to `source-manifest.tsv`; S3, S4, S5, S12 and S13 are the re-rendered live pages; S6 (now 404) and S9 (certificate revoked) come from Wayback copies. The copies and their list are archived in `D:/Work/IIT-KGP/Paper_1-artifacts/sources/bagh-2026-11-07/`. A new tool, `content/review/tools/evidence/verify_tradition_tsv.py` (it reuses `segment_sources.py`, now importable, and the normalisation of `verify_quotes.py`), found all 414 passages verbatim at their locators (406 passages and 8 claim quotes); every claim and explanation was then read against its passages. Verbatim passages that did not support their claim were replaced by the supporting passage of the same source (for example Navalgund durries and Kutch embroidery text from other GI applications in Journal 75); claims that said more than their sources were narrowed (Javad is a living centre in Asia InCH, not an extinct one; mengni water is 10–15 litres in one GI passage and 15–20 in another; statements about dhavda, drying light and river chemistry are attributed to the source that makes them); five local terms take the sources' spelling. Every relationship now carries one passage of at most 25 words per cited source; explanations were narrowed to those passages, S7 and S4 were dropped from links they do not support (castor oil in mengni karna; tarai and the white ground), and two links no cited source supports were removed and archived (`harara-tannin-ground → shared tannin-pre-mordanting`, `double-dye → over-dyeing`). Result: 60 of 60 concepts and 59 of 62 relationships `verified`; the other three stay `under_review` because their targets in `content/shared/craft-science.json` are not verified. To let a file record this, FORMAT v1 now accepts `verified` (never `published`) when such a record names the item: the content test checks the record, a passage for every cited source and verified concepts at both ends of a verified relationship. The loader reads `verified` as `under_review`, so the importer, the snapshots and the Sample Text and caption-review marks change only when a named curator accepts the concepts in the CMS or with `scripts/content/verify-concepts.ts --keys content/traditions/bagh/tradition.json`, which now takes the verified concepts of an interchange file.
- **Bagru.** Every concept (65), claim (174) and relationship (79) of `content/traditions/bagru/tradition.json` was checked against the sources the file already records, on the DR-059 standard: a quote counts only if a script re-finds it verbatim at its page or section in the archived text, and a claim or explanation may say no more than its quotes. The October archive is kept off the repository and was not on this machine, so the 13 sources were fetched again into scratch: the three PDFs (GI dossier S1, Kathju & Kashyap S3, Raj S4) are byte-identical to `source-manifest.tsv`; the web pages differ in bytes but still hold every October passage; the Titanwala page (S9) came from its Wayback capture of 2023-01-06 because the site returned 503. Tools: `content/review/tools/evidence/source_archive.py` (manifest, segmenter), `verify_from_manifest.py` (the check, repeatable), `find-in-source.py` (rewritten for the current manifest) and the one-shot `apply_bagru_verification.py`, which cuts every new passage from the archived text between literal anchors. Before: 253 of 253 claim passages verbatim, but no relationship citation had a passage. After: 268 of 268 claim passages and 110 of 110 relationship passages verbatim at their locators, every cited source covered. Twelve claims were narrowed to their sources (for example the Gazetteer's illegible phrase is no longer rendered as "chintzes", S1's "18 miles on the Agra-Ajmer road" sits beside S4's "30-35 km", the two indigo-vat depths are each given as one account, the "women's skirts" gloss for fadat is gone), 22 relationship explanations and one condition were narrowed, the seasonality link now cites S6, which actually describes the seasons, instead of five sources that do not, and one link (groundwater AFFECTED_BY final washing) was removed to `removed-relationships.json` because no recorded source ties the pollution to that stage. Every Bagru concept and relationship is now `verified` in the file. Because `content/FORMAT.md` had forbidden that state, the format now defines it as a passed source check, not an acceptance: `importedState()` in `src/features/knowledge/contracts.ts` makes the loader, and so the importer and every snapshot, read it as `under_review`, so the DB-side acceptance stays the CMS route of DR-059 (`scripts/content/verify-concepts.ts` under the lead's account), and a content test refuses a `verified` entry with a cited source that has no passage. The `Sample Text` mark now follows the file: the test-item generator marks a transfer item only while a stage, tool, material or link it draws on is unchecked, so the Bagru items lost the mark, the immediate transfer form is no longer a demo form (`test-transfer`), and the e2e studies move to battery v7; the delayed form (Dabu) keeps its mark. Evidence table: `content/review/bagru-verification.md`. Checks run: content tests (17), the knowledge-graph, content, knowledge, study, process, public-text and script unit tests (313), the content-pipeline integration test on a throwaway `episteme_test` database (18), typecheck and lint of the changed files. Paper: report Bagru as source-checked by the same mechanical route as the study traditions, with the archive provenance above and no independent expert review.
- **Dabu.** Every unverified item of `content/traditions/dabu/tradition.json` (46 concepts under_review, 16 needs_evidence; 73 relationships under_review, 12 needs_evidence) was checked only against the 23 sources the file records, each quote at its page or section and found verbatim by `content/review/tools/evidence/verify_tradition.py` in copies fetched again on 2026-11-07 and archived with `archive.json` at `D:/Work/IIT-KGP/Paper_1-artifacts/sources/dabu-2026-11-07/` (S5, S14 and the S23 PDF hash equal to `source-manifest.tsv`; the other pages were fetched again because the 2026-10-14 copies are no longer on disk; S24, read from a scratch copy in October because the Met returned HTTP 429, was fetched this time). The verifier now also checks a claim's own `quote` field against the claim's sources. Result: 427 of 427 quotes found (267 claim evidence quotes and 152 relationship quotes at their locator, 8 claim quotes in a cited source); 171 claims in 62 concepts each read against their quotes. 28 claim quotes that did not bear on their claim were removed (page chrome such as the S1 tag list, the S2 review form and the S10 maintenance banner, reader comments, and sentences from the right page that say something else) and 33 that carry the claim were added; 21 claims were reworded to the source's wording, chiefly by attribution where sources disagree or report (the Deccan Chronicle's "five hundred year old craft" and "Whether or not the story is true", AIACA's Khatri origin and 2023 GI tag, the Udaipur and Chittorgarh districts, Wikipedia's [citation needed] on "Chhipo ka Akola") and by tying the "stars in an indigo sky" claims to Gaatha's origin story; the 2009 self-help group is Alka Sharma's, not Aavaran's. Three titles were narrowed to what the sources say, and the local terms Dabbu, neel and chhapa, found in no recorded source, were removed. No Dabu relationship carried evidence before; each of the 84 kept links now has one quote of at most 25 words per cited source, and cited sources that do not state the link were replaced by recorded ones that do (for example the GI application now rests on the registry record S5, and the mud-resist barrier on S18's "prevents colour penetration while dyeing" rather than S12, which says the clay lets some colour through). The cloth sequence of the PRECEDES chain is S18's own order: the stage phrases sit at strictly increasing offsets in its "The Process" passage. One relationship that no recorded source states was removed and archived in `content/review/removed-relationships.json` (Chhipa communities PRACTITIONER_EXPLAINS resist printing: S1 and S2 say only that the Chippas print); the stage template and both doors are unaffected because no Dabu stage is in a study. All 62 concepts and 78 relationships are `verified`; the 6 links to concepts of `content/shared/craft-science.json` stay `under_review` (KG206), and the 3 of them that were needs_evidence now have passing quotes. The file states follow FORMAT v1 as amended for Ajrakh under this DR (`verified` admitted in the files, imported as `under_review`); the same contract, importer and test changes are carried on this branch. Evidence table: `content/review/dabu-verification.md`. Checks: `npm run test:content`, the knowledge-graph, content-contract, stage-template, diagram, figure-balance, study-photo and other unit tests that read the Dabu file, and the content-pipeline integration test on a throwaway `episteme_test` database, all passing.
- **Sanganeri.** Every unverified item of `content/traditions/sanganeri/tradition.json` (63 concepts under_review, 9 needs_evidence; 76 relationships under_review, 11 needs_evidence) was checked only against the 15 sources the file records, each quote at its page, section or abstract and found verbatim by `content/review/tools/evidence/verify_tradition.py` in the copies of the 2026-10-16 whole-tradition check, archived with `archive.json` at `D:/Work/IIT-KGP/Paper_1-artifacts/sources/sanganeri-2026-11-07/` (S1, S2, S4 and S10 PDFs and the S5, S6 and S7 V&A pages hash equal to `source-manifest.tsv`; S11 is the OpenAlex record of the abstract, the DOI being 404). The tool was extended rather than replaced: PDF pages now come from one `pdftotext` run split at form feeds, because xpdf 4.06 reports success for pages past the end; each page is read in both UTF-8 and Latin1 output, because the scanned S1 text layer maps glyphs outside Latin-1 (`r€move`, `„Beggar‟` in UTF-8, `rmove`, `,,Beggar` in Latin1, the text the 2026-10-14 extraction gave); `PDF pp. N-M` and `Abstract` locators are checked. Result: 448 of 448 quotes at their locator; 193 claims in 72 concepts each read against their quotes; 3 claims reworded to the source's wording (dhaura or shakur ka phool in red dyeing, the gentry's 'natural designs of wild flowers, leaves, creepers and plants', synthetic alizarine because of the shortage of vegetable alizarine); 16 quotes that did not bear on their claim removed, one quote completed, one added, one locator corrected; five relationship quotes restored to the archived text and six relationship locators corrected to real headings. Three relationships that no recorded source states were removed and archived in `content/review/removed-relationships.json`: harda-treatment USES mogri-mallet (S1 beats the harda cloth with 'a wooden mallet' and defines the mogri for moist finished cloth; the matching claim left the mogri concept and stays in harda-treatment), tapai-alkali-and-heat SCIENTIFICALLY_EXPLAINED_BY shared sun-bleaching (S1 gives alkali and solar heat, no light oxidation), and scouring DEPENDS_ON sun-and-semi-arid-climate (S1 states no dependence on sun or climate). Removing the first would have orphaned the mogri (KG800), so the mogri is linked BELONGS_TO the tradition on the GI tool list (S1 p. 13, 9.3.3), which states that link; the three Sanganeri entries of `unsupported-relationships.json` are resolved and taken out of it. All 72 concepts and 78 relationships are `verified`; the 7 links to concepts of `content/shared/craft-science.json` stay `under_review` because KG206 refuses an accepted link to an unaccepted concept. The study template was rebuilt (`npm run content:stage-template`): one caption passage dropped from the washing stage, with stage names, items and caption text unchanged, so both doors are unchanged. The file carries `verified` under the same FORMAT v1 change as the Ajrakh check, taken unchanged from it: `IMPORTABLE_STATES` admits `verified`, and the importer stores it as `under_review` through `asImported`, because only a curator's recorded transition accepts a row in the database. Evidence table: `content/review/sanganeri-verification.md`. Checks: `npm run test:content`; the knowledge-graph, content-contract, process (stage template), content, knowledge (diagrams, study photos), research door-view, figure-balance and content-parity, study and public unit tests; and the content-pipeline integration test on a throwaway `episteme_test` database (first run: one test timed out at 5 s under load from other agents; the rerun passed 18 of 18).
- **Machilipatnam Kalamkari.** Every unverified item of `content/traditions/machilipatnam-kalamkari/tradition.json` (53 concepts under_review, 15 needs_evidence; 123 relationships under_review, 10 needs_evidence) was checked only against the 16 sources the file records, each quote at its page or section and found verbatim by `content/review/tools/evidence/verify_tradition.py` in copies archived with `archive.json` at `D:/Work/IIT-KGP/Paper_1-artifacts/sources/machilipatnam-kalamkari-2026-11-08/` (S4, S6, S8, S9, S10 and S11 hash equal to `source-manifest.tsv`; the other pages were fetched again because the 2026-10-14 copies are no longer on disk; S7's PDF now returns 404, so its pages are the 2026-10-16 extraction of the manifest-equal copy). The Sanganeri version of the tool was extended twice: a `§` locator also matches a bold or italic subheading, as S12, S13, S15 and the V&A records mark their sections, and an archive entry may hold extracted per-page text for a PDF no longer served. Result: 531 of 531 quotes at their locator; 183 claims in 68 concepts each read against their quotes. Five claims were reworded to the source's wording (Pedana '13 km' from Machilipatnam; S7's 'trade proximity with Persia and Iran'; drying 'for one day'; the villagers' allegation about chemical colours; the Collector's 'notices to those using chemical colours'); 13 quotes that did not bear on their claim were removed, one replaced, an S7 quote split at a page footer, 17 S14 locators corrected to the page's one heading, and two local terms found in no recorded source removed. Twenty-one BELONGS_TO links that cited only the S4 title now quote the S4 passage naming the concept, and six more links got a quote that states them. Five relationships that no recorded source states were removed and archived in `content/review/removed-relationships.json` (coromandel-soil-water-plants BELONGS_TO the tradition, block-carving PRECEDES scouring, soaping PRODUCES colourfast textiles, indigo-no-mordant SIMILAR_TO shared vat reduction, scouring SCIENTIFICALLY_EXPLAINED_BY shared sun-bleaching), and curing-drying AFFECTED_BY sun-and-weather was re-sourced to S3, which states it; the six Machilipatnam entries of `unsupported-relationships.json` are resolved and taken out of it. All 68 concepts and 121 relationships are `verified`; the 6 links to shared concepts stay `under_review` (KG206). myrobalan-treatment USES buffalo-milk stays `needs_evidence` although its S15 quote passes: verifying it would add a Buffalo Milk item to the study's myrobalan stage in both doors, which needs a look row and a rendered still that this browserless check could not make, so the study template rebuilds unchanged. The file carries `verified` under the FORMAT v1 change taken unchanged from the Ajrakh and Sanganeri checks (`IMPORTABLE_STATES` admits `verified`; the importer stores it as `under_review` through `asImported`). Evidence table: `content/review/machilipatnam-kalamkari-verification.md`. Checks: `npm run test:content`; the knowledge-graph, content-contract, process (stage template, substance looks), walkthrough, study, content and knowledge unit tests (510 passed, one worker). The content-pipeline integration test was not run here: its importer change is byte-identical to the Sanganeri branch, which ran it.
- **Integration (2026-11-08).** The six branches carried the file's `verified` into the system two ways (four converted it in the importer, Bagh and Bagru in the loader). One way is kept: the loader reads a file's `verified` as `under_review` (`importedState` in `src/features/knowledge/contracts.ts`), so no model, snapshot or database row built from the files ever shows content as accepted, and the importer's own conversion (`asImported`) is removed as redundant. Only `scripts/content/build-test-items.ts` reads the raw file state, to drop the Sample Text mark from transfer items built wholly from checked content. The check scripts are kept as they ran: `verify_tradition.py` (Ajrakh, Dabu, Sanganeri, Machilipatnam Kalamkari; the Kalamkari copy, a superset of the others, plus Dabu's claim-quote check), `verify_tradition_tsv.py` (Bagh) and `verify_from_manifest.py` (Bagru), each named in its tradition's record. `removed-relationships.json` and `unsupported-relationships.json` hold every addition and removal of all six. Bagru had marked its 8 links to `content/shared/craft-science.json` concepts `verified`; they are set back to `under_review`, as Ajrakh did, because FORMAT.md verifies a relationship only when both of its concepts are. `tests/content/content-format.test.ts` reads each record with its code marks stripped, so every record names its verified items in the form it already used.
- **Correction (2026-11-08, DR-124).** The Bagru paragraph above says "the delayed form (Dabu) keeps its mark"; that was true only until Dabu was verified in this DR. Since commit 9f11266 the battery is regenerated from the verified files: both transfer forms are real forms (`test-transfer`, `test-transfer-delayed`), neither carries a `Sample Text` item, and the e2e studies use battery v8 (`BATTERY_VERSION = 8`, `tests/e2e/study-fixtures.ts`). One Dabu concept, `dabu.comparison.mud-resist-vs-wax-and-direct-print`, and its CONTRASTS_WITH link go back to `under_review` because its provenance is `unverified` (S19 is an unattributed Utsavpedia page), which the database refuses to accept; neither is in the battery.

## DR-122: The Shared Craft Science Is Verified On Its Own Sources, So The Links KG206 Held Are Verified; Buffalo Milk Joins The Kalamkari Myrobalan Stage In Both Doors (Adopted under the lead's delegation, 2026-11-08)

- **Root cause of the held links:** graph rule KG206 refuses an accepted relationship with an unaccepted endpoint. DR-120 verified the six tradition files but not `content/shared/craft-science.json`, where the shared mechanisms, materials and outcomes they link to are defined, so 31 links stayed `under_review` (Ajrakh 9, Bagh 3, Dabu 6, Machilipatnam Kalamkari 6, Sanganeri 7) and Bagru's 8, set `verified`, failed the content test's endpoint check.
- **Shared file verified by the DR-120 method:** the 17 recorded sources were fetched again on 2026-11-08 into `D:/Work/IIT-KGP/Paper_1-artifacts/sources/shared-2026-11-08/` (10 hash equal to `source-manifest.tsv`, including the 197 MB Wertz thesis) and checked with `verify_tradition.py`: 191 of 191 quotes verbatim at their locator (182 of 195 before). 10 claims reworded to their quotes; three S3 locators were printed page numbers; S16 and S13 headings no longer repeat; a misspelt S6 quote and a footer in an S7 quote replaced; off-topic quotes removed; two titles narrowed ('iron liquor' and 'harda' are in no recorded source). S5's 'tannin has a property of behaving as a mordant' cannot be found because that page's text layer is drawn twice and interleaved, so the claim is narrowed to what its other quotes carry. One link removed and archived: mud-resist-barrier CONTRASTS_WITH indigo-vat-reduction (S10 puts the two in sequence; its only contrast is mordant-dyed against resist-dyed), which also closes its `unsupported-relationships.json` entry. Two links gained a recorded source that states them (S1 on the iron open question, S17 on crack thickness); every explanation and condition says no more than its quotes. All 24 concepts and 24 relationships are `verified`. Record: `content/review/shared-verification.md`.
- **Tool faults fixed at their root (`verify_tradition.py`):** the tag-stripping pattern held a backspace and a control character where `` and `` belong, so script text was never stripped; and the section splitter returned each captured heading as an extra section, so `(occurrence k of n)` counted phantom copies (Dabu S2 'History:'). Sections are now cut between heading matches. With the fix every archived tradition still passes in full (Ajrakh 511, Dabu 419, Machilipatnam Kalamkari 531, Sanganeri 448; Bagh 406 at locator under `verify_tradition_tsv.py`).
- **The 31 held links:** each read again against its own quote (all found again at their locators) and set `verified`, explanations narrowed to the quote's wording; Kalamkari myrobalan-tannin-role SIMILAR_TO tannin-pre-mordanting and alum-fixing-dip SCIENTIFICALLY_EXPLAINED_BY alum-mordant-complexation now quote the S4 passages that state them (p. 7 even absorption of iron and alum salts; p. 12 'all the colors are fixed'). Every relationship in all six tradition files is now `verified`. Each tradition record has a DR-122 section; the content test now matches item names in a record with or without code marks, since four records name items in backticks.
- **Buffalo milk (Machilipatnam Kalamkari):** myrobalan-treatment USES buffalo-milk is verified on S15 ('treating the cloth with Myrobalan seeds and buffalo milk'). The study follows the evidence through the normal pipeline: a look row `machilipatnam-kalamkari-buffalo-milk` in `docs/research/substance-looks.json` (liquid, opaque, #EDEBDE: CIE L* 93.0, a* -1.7, b* 6.5, the buffalo's kefir measurement in Milovanovic et al. 2020, Table 9, a same-species analogue, with the absence of carotene from Abd El-Salam and El-Shibiny 2011 and milk's opaque white from Wikipedia 'Milk'; archived in `looks-check/buffalo-milk-2026-11-08/`; basis inferred, confidence low-medium), `npm run content:look-rows`, `npm run content:stage-template` (the myrobalan stage gains a Buffalo Milk item, model liquid-pot), the Door 1 still rendered on the NVIDIA GTX 1650 by the walkthrough lab (`/walkthrough/stills/objects/e52e09ef.jpg`: a clay pot of opaque white milk, clean rim) and the Door 2 pot placed on its own bench by the yard plan. Looked at in Door 2 at reach (1.3 m): the pot sits on the bench with its milk inside the rim; the lab scene check on that yard passed with 0 hits and every planted fault caught, and the walk reached the end. `npm run content:test-items` regenerated the battery, which now asks about Buffalo Milk in the Kalamkari placement and identification items.
- **Merge faults found and fixed:** `content/study/merge-plan.json` had renamed the Ajrakh last stage to `final-wash-and-washing` with kind `finish` in 9c5701a while the template kept `final-wash-and-finishing` with kind `wash` (DR-082), so rebuilding the template changed the Ajrakh course; the plan now matches the template. The baked horizon scrub of DR-117 (`public/walkthrough/tex/horizon/scrub.png`) had no image-manifest row, which the DR-118 credits test requires; it now has one (project-made from code, CC0) and `docs/image-credits.md` is regenerated.
- **Equivalence (7 points):** 1. Content: the same Buffalo Milk item, look and caption sources in both doors, from one template. 2. Exposure: both doors show it at the same stop, the myrobalan treatment. 3. Citations: unchanged; the stage caption is the same. 4. Ease: a still in Door 1, a labelled bench pot in Door 2, like every other material. 5. Navigation: unchanged. 6. Tradition salience: one added material in one Kalamkari stage, from evidence. 7. Telemetry: nothing new.
- **Checks:** `npm run test:content` 17 of 17; knowledge-graph, process, walkthrough and parity unit tests (content-parity, door-views, parity-engine, figure-balance) 346 of 346 after the manifest fix; study test-items and content unit tests 51 of 51. No timing was measured.
- **Paper:** the shared science is source-checked by the same mechanical route as the traditions, with no expert review; buffalo milk's colour is an analogue, not a measurement.

## DR-123: Door 2 Geometry Levels, Wall Culling, A Main Target That Only Grows, And No GPU Fence While Loading (Adopted under the lead's delegation, 2026-11-08)

- **Trigger:** DR-117 left the Iris Xe at 1920 by 1080 and device pixel ratio 2 with 100 to 225 ms frames at the lowest render scale, and NVIDIA loading at 13.6 s against 10.8 s because of the loading fence.
- **Profile (renderer.info of the main pass plus per-mesh counts, Ajrakh, NVIDIA, 1920 by 1080):** station 1 drew 2.99 million triangles in 207 calls. Per class: the camel-dung pile 713,180 (13 instanced pieces of up to 18,240 triangles each), the outgoing cloth 286,728 per yard, bamboo frame poles 253,056 (14,000 to 17,480 per pole) and lean-to slats 205,338 per yard, the harde pile 170,304, the wicker basket scan 89,104, thrown vessels 38,144 to 48,384; at station 7 the tamarisk twig pile drew 603,078 (hundreds of instances of 126 to 182 triangle pieces). Up to 1.1 million triangles in view belonged to the next yard behind the far wall. The shadow map was rendered with every full mesh.
- **Second cause, found by splitting the Iris frame:** with every yard hidden the Iris frame still spiked to 87 to 137 ms; with the main target allocated at ratio 1 instead of the top ratio the same view held a 20 ms worst frame. DR-117 drew a lowered scale into a region of a target allocated at the top ratio (3840 by 2160, half float, 4 times MSAA); three resolves the whole multisampled target every frame, and the allocation takes several hundred MB of shared memory. An empty page and a bare WebGL canvas at the same size and ratio hold 16.7 ms medians with an 18 to 25 ms worst, so the spikes are the page's own. Without levels the ratio-1 target alone still gave an 87 ms frame, so both causes are real.
- **Fix:**
  - `GeometryLevels` (`infrastructure/geometry-levels.ts`, worker `geometry-levels-worker.ts`) simplifies every geometry drawn at least 1024 times (triangles times instances) in a worker with three's meshoptimizer simplifier (`simplifyWithAttributes`, absolute error, normals and colours weighted 4), at errors of 0.25 mm doubling to 64 mm, keeping a level only when it saves a quarter of the triangles. Levels are extra index buffers over the same vertex buffer. `onBeforeRender` swaps the index to the coarsest level whose error projects to at most 0.5 px at the current viewport height from the nearest point of the bounds, and `onAfterRender` restores full detail, so every audit, raycast and density tool reads the full mesh. The shadow pass uses the coarsest level within one eighth of a shadow texel. Level indices are uploaded during warm-up by the existing carriers and freed with them.
  - The cloth is drawn in spans of 96 rows sharing one vertex buffer (vertices shared between spans are locked in simplification), so its far parts take levels and are frustum culled; the surface and its audit are unchanged.
  - `YardCulling` hides a yard whose bounds leave the frustum and, in the other yards, any mesh whose projection lies wholly on the brick of the wall between (`domain/wall-occlusion.ts`); everything is shown again in the frame that renders the shadow map, so casters behind a wall still cast.
  - The main target is allocated at the canvas ratio and grows with it, never at the top ratio; `RenderScaleGovernor.top` became unused and is deleted.
  - Loading has no GPU fence: the loading cover is static text, so loading frame pacing only affects responsiveness, and the fence made CPU and GPU work wait for each other. The pacer fences only while walking, and one `settle()` before calibration keeps queued loading work out of the first walking frames.
  - Merge note: the Machilipatnam Kalamkari branch and the DR-117 branch were merged into this one first (conflicts in `route-plan.ts`, the review lists and this log resolved by keeping both sides).
- **Proof so far (the machine was not quiet: another agent ran its suite; not a timing sweep):**
  - Triangles in the main pass at each Ajrakh standpoint, NVIDIA 1920 by 1080, before then after: 2.99M/0.88M, 1.81M/0.37M, 0.78M/0.19M, 2.10M/0.29M, station 5 not read (a warm-up draw was sampled), 0.83M/0.23M, 3.64M/1.47M, 2.26M/0.61M, 0.90M/0.26M, 0.68M/0.18M; the worst while walking each leg 2.99M/0.97M, 1.79M/1.03M, 3.53M/0.97M, 3.59M/1.04M, 1.98M/1.53M, 7.11M/3.26M, 4.12M/1.47M, 2.24M/0.60M, 3.10M/1.40M. These were taken before the instance-count threshold, which cut station 7 further to 1.29M.
  - Iris Xe, headless shell, 1920 by 1080, ratio 2, Ajrakh legs 2 to 4: 1594, 1641 and 1670 frames, worst 48, 48 and 57 ms, one frame over 50 ms; before this record a leg had 896 frames, 188 of them over 50 ms, and a 206 ms worst. Load 14.5 s.
  - Close-ups at nearest reach, 3840 by 2160, NVIDIA, 51 identical views in Ajrakh station 1 and Kalamkari station 4, before against after: at most 0.086 per cent of pixels change by 4 or more levels and none by 16 (a second before run against the first: 0). The largest change is a soft shadow patch, indistinguishable side by side. A first setting (shadow levels at half a texel, attribute weight 1) changed up to 2.8 per cent of pixels, mostly in shadows, and was rejected.
  - Unit tests: the walkthrough suite and the architecture test, 172 of 172 in 19 files, including the new `geometry-levels.test.ts` (full detail at 0.6 m on the review screen, the pixel bound, the shadow texel bound, wall occlusion). Typecheck clean outside the generated route types; ESLint clean on the changed files.
- **Not finished:** the quiet-machine timing runs (Iris full leg, NVIDIA route at ratio 2 with its load time) and the density, tearing, shimmer and scene checks on all 32 scenes did not complete before this record was closed; the scene check had passed its first 5 scenes with 0 hits and every planted fault caught. They must be run before this is reported as meeting the Section 8.9 budget. The production build with the module worker was not run.
- **Paper implications:** none for content or logging; distant geometry is drawn at a level whose error is under half a pixel.

## DR-124: Records Brought Back In Line With The Tree: The Battery Note, Database Acceptance Of The DR-120 Traditions, Sourced Alternative Names, The Bagru Archive, Media Licences, Literature Quotes, A Full-Size Lightbox, Delayed Return Without A Schedule, And The Deployment Handover (Adopted under the lead's delegation, 2026-11-08)

- **Trigger:** a sweep of `walking-the-process` at e36b9aa for records that contradict the tree and checks that were never run. None of the branches named for merging had unmerged work (their refs are gone, merged at fea672e..1a82cb3), so this DR works on that head alone.
- **Battery (DR-115, DR-120).** The regenerated battery was already committed in 9f11266 with the e2e studies at v8; regenerating it again from this tree gives the same file. DR-120's Bagru paragraph and DR-115 now carry dated corrections: both transfer forms are real, and the transfer restriction ended with DR-120. The pre-test and identification forms stay demo forms while look rows stay unsettled; that question is not settled here.
- **Database acceptance (DR-059 route).** On the local database, after a `pg_dump` (`D:/Work/IIT-KGP/Paper_1-artifacts/dr-124/episteme-before-verify.dump`), `db:migrate` and `db:seed:reference` (one event type was missing), `content:bootstrap:remote` re-imported the files and `scripts/content/verify-concepts.ts --as saurav.curator@episteme.local --keys content/traditions/<t>/tradition.json --evidence content/review/<t>-verification.md` ran first `--dry-run`, then `--apply`, for all six traditions, reason "Authorised by the project lead (DR-059); mechanical verbatim source check of DR-120". Result: Bagh 60 verified, Bagru 65, Dabu 61; Ajrakh, Sanganeri and Machilipatnam Kalamkari were already accepted in DR-059 (every key refused as already `verified`). The import itself needed no resubmission: concepts the importer had last set to `needs_evidence` follow the files to `under_review`.
  - **Refused, and why:** `dabu.comparison.mud-resist-vs-wax-and-direct-print` has provenance `unverified` (its only source, S19, is an unattributed Utsavpedia page, kind `unverified`), and the database refuses to accept such a concept. The file had marked it `verified`. It and its CONTRASTS_WITH link go back to `under_review` in the file and the record, and `tests/content/content-format.test.ts` now refuses a `verified` concept with `unverified` provenance.
  - **Import fault found and fixed:** the first bootstrap refused the review snapshot with KG310 (duplicate PRECEDES ordinal): `block-carving PRECEDES scouring-dung-bleaching`, removed from the Machilipatnam file in DR-120, stayed live in the database because an older review snapshot holds it, so the importer kept it as stale. The importer now sets such an edge to `archived` when it created the edge itself (`created_by` empty), so no later snapshot carries it; a curator's edge is still only reported. `tests/integration/content-pipeline.test.ts` has the case; re-adding the edge to a file restores it.
  - **Not carried:** the DR-120 rewording of claims in the three study traditions does not reach their database rows, because the importer never touches an accepted row (`keptAccepted`). Those rows hold the DR-059 text until a curator edits them in the CMS or reopens them for review. *(2026-11-08, DR-126: the importer now writes such changes into the accepted rows and returns them to review on the record, for a curator to accept again on the new evidence.)* Concepts of `content/shared` were not touched (KG206).
  - RUNBOOK 7.1 now names these keys files, evidence records and the reason, and `submit-concepts.ts` for any `needs_evidence` rows.
- **Alternative names (all six traditions).** Each `alt_names` entry was searched for as a whole word in the archived copies of the file's own sources (`D:/Work/IIT-KGP/Paper_1-artifacts/sources/<t>-<date>/`). Kept or replaced with a printed form, each with its source, locator and quote in a new Alternative Names table in `content/review/<t>-verification.md`:
  - Ajrakh: "Ajarakh" removed (printed only inside "Ajarakhpur").
  - Bagh: "Thappa Chhapai" → "Thappa Chappai" (S4, Gaatha); "Alizarin print" → "alizarin printing" (S6, "previously known as alizarin printing").
  - Bagru: "Syahi-Begar print" → "Syahi Begar" (S7); "Bagru dabu print" removed.
  - Sanganeri: "Sanganeri Hand Block Printing (GI)" → "Sanganeri Hand Block Printing" (S1); "Syahi-begar (red-and-black Sanganer style)" → "Syahi Begar" (S8).
  - Machilipatnam Kalamkari: "Masulipatnam kalamkari" → S4's "Kalamkari Cloth printing of Masulipatnam"; "Masulipatam chintz" removed.
  - A content test refuses any tradition alternative name that has no recorded quote from a recorded source containing it. FORMAT.md documents `alt_names` and `compares`, and names the importer.
- **Bagru archive.** The 13 Bagru sources were fetched again on 2026-11-08 into `D:/Work/IIT-KGP/Paper_1-artifacts/sources/bagru-2026-11-08/` with `archive.json` (hashes; S1, S3 and S4 equal to `source-manifest.tsv`; S9 is the Wayback capture 20230106084822 again, read decompressed, SHA-256 `374dfb60b1aa…`, the hash DR-120 recorded). `verify_from_manifest.py` against it: 268 of 268 claim passages and 110 of 110 relationship passages verbatim at their locators (`verify-result.json` beside the copies).
- **Comparisons (partial).** The tamarisk claim now reports the source: "The Ajrakh GI application says a handful of dried "tamansk" (tamarisk) flowers is added …" (the GI Journal's text), and the dhawri–dhawai link's condition names what each GI application says ("dhawai ka phool" (Wood Fordia Floribunda) for Bagru) instead of stating the plants as fact. The unsupported `gi-year SIMILAR_TO gi-registration-year` link is removed and archived in `removed-relationships.json`; `unsupported-relationships.json` keeps one entry, in `shared` (KG206); at integration DR-122 had already archived that entry in `removed-relationships.json`, so the file is empty. The full source check of `comparisons.json` was not run. *(2026-11-08, DR-126: run; every item of the file is now `verified`, `content/review/comparisons-verification.md`.)*
- **Media candidates.** Each Commons candidate's licence was read from its file page through the Commons API (`D:/Work/IIT-KGP/Paper_1-artifacts/dr-124/media-licences/`); all recorded licences match. The Bagru-village photo tagged as a Dabu tool is removed from the Dabu file (it stays in Bagru's), and the broadcaster video in the Bagru file is removed, because nothing recorded shows the uploader's right. The Met rumal's Commons credit states the Met donated it under its Open Access policy. `docs/research/content-dataset.md` (f) is rewritten to these results.
- **Photo credits.** Sahapedia's live kalamkari page gives the 6_IMG_0046 caption with an empty "Photograph by" field; the 2016 Wayback copy gives only "Image courtesy J. Niranjan, Srikalahasti, Andhra Pradesh". No photographer is named anywhere, so the interim credit stays. The Flickr page of the Sanganeri blocks photo is on the account `ericparker` (real name "Eric Parker"), licence CC BY-NC 2.0, "Taken on December 17, 2011"; no other evidence of authorship exists, so the credit stays as uploaded. Page copies: `D:/Work/IIT-KGP/Paper_1-artifacts/dr-124/photo-credits/`.
- **Lightbox (DR-118).** `LIGHTBOX_MAX_EDGE = 768` is deleted. A study photograph opens at its natural size, at most 90vw wide and 85dvh high, aspect kept; a diagram keeps its readable minimum width. One component serves both doors, so they stay equal. ADR 0003 is updated, and the Sahapedia, PARI and public-repository notes carry a dated "Superseded by DR-118" status above the verbatim replies, with the repository file paths corrected.
- **Delayed return without a schedule (DR-095).** `returnForDelayedTest` found a returning participant only through a `delayed_test_schedule` row. When none exists it now locks the participant's latest session in that study, settles its position, and, if the session is open and at the delayed step, lets `syncPosition` write the schedule (timed from the last immediate step) in the same transaction. A participant not yet at the delayed step is still refused as `participant_not_found` and gets no schedule. `tests/integration/study-engine.test.ts` covers both.
- **Literature (DESIGN.md 15.2).** All six sources were fetched and archived with hashes at `D:/Work/IIT-KGP/Paper_1-artifacts/sources/literature-2026-11-08/` (`check.json`); every quote was found verbatim by script (Rey through the ERIC API record, Ruddle and Legge through their OpenAlex abstracts, Darken at chi1995.chistatic.hosting.acm.org under "Environmental Design", Grossman in the CHI 2007 PDF under "Displaying Text in 3D Environments", where the text layer renders the degree sign as "o", WCAG 2.2 SC 1.4.3 from the W3C source file because w3.org answered 403). The UNVERIFIED banner is replaced by this result and two locators are corrected.
- **Open points (DESIGN.md 14).** The open-content row names the one remaining unbacked link and its owner. Next-stage cue: the name stays in both doors, because it is the same string at the same moment in each and so cannot favour either condition; the paper reports it as a cue present in both. Title: `Walking The Process` under Rule 17.
- **Deployment handover.** `https://immersive-episteme.vercel.app/` answers `X-Vercel-Error: DEPLOYMENT_NOT_FOUND` (checked 2026-11-08 05:21 UTC): nothing is deployed and the Vercel project is gone. A read-only check with the old production values found the Neon database still reachable and the bucket `episteme-media` still present (HeadBucket 200); the Google OAuth client still lists the old redirect URI. They were not deleted: the next deployer redoes them or the lead deletes them (RUNBOOK 8.4). The git-ignored `.env.production.local`, which `next start` loads and which pointed at that bucket, was moved out of the working tree to `%USERPROFILE%\.episteme\env.production.local.moved-2026-11-08`; no value was printed.
  - RUNBOOK: Neon Object Storage is the tested media route (new step B4-N, with DR-108's storage check and the expected preflight WARN quoted from `topology.ts`); R2 is marked untested; the 3.3 table lists both; the build-version rows say to leave it unset on Git deploys; Open Item 4 carries what a recipient needs from the local skill, which is git-ignored, and a new Open Item 5 records the state at handover. `.env.production.example` media block and build-stamp block match. README has a Deployment section and a rewritten content rule. The local skills (`vercel-deploy` state and smoke wording, `aws-provision` 768 px row) are updated; they are not in the repository.
- **Superseded documents.** `docs/architecture/immersive-rendering-results.md` and `spatial-compiler.md` carry a dated superseded header; the data-layer document's manifest section now describes the stage templates, `exhibitImages` and the DR-118 photo gate. `docs/research/concept-map-scoring.md` §8 marks questions 1 and 2 decided and 3 deferred to preregistration (study-decisions D2), and §9's status gap is recorded as out of scope.
- **Checks (this tree, 2026-11-08; not a quiet machine: other agents' builds and tests ran, about 2 GB free and 85 % CPU, so no timing here is a measurement):**
  - Section 13 scans: the design-lint rules (hex, fonts, radius, shadow, blur) and the Title Case scan through the shared `titleCase` helper are `tests/unit/design/design-lint.test.ts` and `title-case-scan.test.ts`; both pass in the unit run below. A direct grep of `src` for `Space Grotesk`, `backdrop-filter`, `box-shadow`, a quoted `Inter` and emoji finds only `box-shadow:none` in the chart tooltip.
  - `npm run typecheck`: clean. ESLint over the tree: 0 errors, 5 existing `<img>` warnings.
  - Vitest, one worker, dom, node and content projects without integration: 131 files. The first run failed 3 files (a comparison `body_md` no longer matched its reworded claim, KG601); after the fix those files pass (40 tests); 1,530 other tests passed.
  - Vitest integration on throwaway `episteme_test` databases, one worker: 28 files, 313 of 314 passed on the first run; the failure was the new delayed-return test's own query (a `uuid = text` comparison), fixed with explicit casts and rerun passing. The new content-pipeline archive test passed in that run. The parity tests (`tests/unit/research/parity-*`) and the door-view tests are in the unit run and pass.
  - `next build` was not run: in this worktree Turbopack refuses the junctioned `node_modules` ("Filesystem root used for resolution"), as DR-119 recorded, and the main tree belonged to other agents' builds. So `next start`, the Playwright e2e at one worker and the lightbox screenshots at 1366 and 400 px in both doors are left to the integration step.
- **Found, not changed here:** `npm run content:stage-template` on this tree rewrites Ajrakh stage 9's key and kind (`ajrakh.final-wash-and-washing`, `finish`) against the committed template (`ajrakh.final-wash-and-finishing`, `wash`); the same happens on the files at e36b9aa, so it predates this DR. The committed template was kept, because Door 2 reads the key.
- **Not done in this DR:** the 3840 by 2160 required-look stills and the Door 1 still colour figures, the flicker and route measurements (they need a quiet machine and the DR-123 LOD work), applying the look-sheet evidence rows and re-weighing the 9 `unassessed` rows (each needs re-rendered stills), the six label corrections of DR-084 (they need re-rendered stills and repainted names), the full source check of `comparisons.json`, and the Playwright e2e run.
- **Equivalence (7 points):** content, exposure, citations, navigation, tradition salience and telemetry are unchanged; ease changes the same way in both doors, because the one lightbox component that grew serves both. The next-stage cue stays identical in both.

## DR-128: Integration Of DR-122 To DR-124; Bagru's Links To The Verified Shared Science Follow The Source Check; The Image Record Counted Again (Adopted under the lead's delegation, 2026-11-08)

- **Merges:** the DR-122, DR-123 and DR-124 branches were merged into `walking-the-process` with `--no-ff`, one at a time. Conflicts were resolved by content: the `verify_tradition.py` tag-stripping and section-splitting fix of DR-122 kept with the claim-quote check of DR-120; the DR-122 and DR-124 sections of each tradition record both kept; `removed-relationships.json` holds both archived links (the shared resist/vat contrast of DR-122 and the GI-year link of DR-124), so `unsupported-relationships.json` is empty; DR-124's correction stays under DR-120.
- **Bagru's links to shared concepts:** DR-122 verified the shared concepts but not Bagru's 8 links to them, which the DR-120 integration had held at `under_review` only for that reason. Each was read again against its quote (found verbatim at its locator in the 2026-11-08 Bagru archive, DR-124). Seven are `verified`. `hari-sarana-scouring SCIENTIFICALLY_EXPLAINED_BY sun-bleaching` is removed and archived: S1 p. 9 describes sprinkling and drying on open ground until the cloth is white and names neither the sun nor bleaching, the reading that removed Sanganeri's scouring link in DR-120. `content/review/bagru-verification.md` records both.
- **Image record:** `docs/image-credits.md` still said 28 CC0 assets after the horizon scrub texture joined the scene manifest (e36b9aa); regenerated, it says 29.
- **Regenerated:** `content:look-rows`, `content:stage-template` and `content:test-items` write the committed files unchanged.
- **Checks:** `npm run typecheck` clean; ESLint 0 errors, the 5 existing `<img>` warnings; Vitest content 18 of 18; Vitest dom and node, 4 workers, 1,874 of 1,875 on the first run, the failure being the image record above, which passes after regeneration. Not a timing run.
- **Equivalence (7 points):** unchanged in both doors; the Bagru links reach neither door's text until a curator accepts them (DR-059).

## DR-125: The Look Sheet Settled On Evidence; An Identification Item Is Held Back Only When What It Shows Has No Basis; The DR-084 Names Applied; Door 1 Stills Measured (Adopted under the lead's delegation, 2026-11-08)

- **Root cause:** no real study could hold a pre-test or identification form. `itemColourIsUnsettled` marked every item whose look row was not rendered on documentary evidence as Sample Text, 50 of the 59 rows were not (22 inferred, 17 photo, 11 provisional), and `content:test-items` therefore wrote both forms as demo forms (DR-115). The rule asked the wrong question for a test item, and the sheet still held open work (DR-124's list).
- **What an identification item needs (decision).** The item shows one Door 1 still and asks "What is this called?"; the options are names, the key is the item's label, and the distractors are other labels (DR-082). DR-075 item 10 makes it a measure of whether a learner can name an object they met, from the same image in both doors (DR-081: the test image is the file Door 1 showed, and Door 2 drew the same look row). Its validity rests on three things: the name is verified (template items come only from verified USES links), the image is the one the learner saw, and no other label shares the image (`identifiable`). Whether the rendered colour matches a real workshop is a question about the depiction, which the paper reports through each row's basis and confidence (DR-084); it does not change what the item measures, because every learner is scored against the same name for the same image. So the mark now hinges on support, not on colour certainty: `itemLookIsUnsupported` holds an item out of real forms only when one of its looks is `provisional`, a stand-in with no source, measurement or derivation behind it. The analysis plan keeps sequence and stage placement as the primary outcomes (DR-075 item 8); identification stays secondary. Door 1's review mark (`itemColourIsUnsettled`, "Colour Not Sourced") is unchanged, because it tells reviewers something different.
- **Evidence rows applied** from `session-2026-11-05/prep/look-research.json`, each with an archived copy under `looks-check/rows-1108/` on the artifacts drive that the verifier re-reads: NPR 2017 on Ajrakhpur's murky blue tank water and the three washes (washing tanks) and on iron-rich wash water (final wash, variation); the 1918 US Dispensatory on gum mucilage (gum binder, colour words widened to semi-transparent); India Water Portal on the Amanishah drain (Sanganeri final wash, as context: it names no colour); Chemzip's "Dark blue granules or powder" (Sanganeri indigo). Not applied: the Malkha kora quote, which was never read at source (HTTP 429), so it fails the citation standard.
- **Dung baths:** no photograph of a dung bath exists in the references (DR-083), so the colour was derived from quoted colour words. Crookes 1874 (archive.org OCR, printed pp. 296-297) says a used cow-dung bath does not clear on standing, holds black greenish suspended matter over a dirty yellow filtrate, and turns mordants olive-green. Kubelka-Munk mixing in linear light of the filtrate, anchored on the olive dung liquid already measured on the Sanganeri row (#AD9B69), and an assumed near-black green (#2B2E22) at an assumed 30 per cent share gives #4B4E3A (range #575942 to #3C3F2F for 20 to 50 per cent). The Kalamkari dung bath and the Sanganeri dung solution take it as `inferred`, confidence low; #4A3A28 was the wet-dung value carried over and has a brown hue the analogue does not support. The Ajrakh camel dung solution keeps #4A3A28 and stays `provisional`: the analogue is cow dung, and the row already says olive has no camel-specific support; it gains the Crookes quote.
- **Alum crystals (3 rows) from `provisional` to `inferred`:** #EEF0EC reads sourced words (FAO/JECFA "transparent crystals ... or white crystalline powder"; Bagh GI "Alum is colourless"), and DR-083's photo of potash alum octahedra reads #DBDBDC lit (ΔE 7.6). That is a reading of sourced words by analogy, which is the sheet's definition of inferred; the chemical type stays open.
- **The 9 `unassessed` rows re-weighed against the DR-083 photo readings** (ΔE76 recorded in each `confidenceNote`): both harda powders medium (two supplier photos bracket #B8985A, ΔE 25.1 and 14.1); Ajrakh madder medium (inside the measured lot range, ΔE 5.8 to 10.9); chay root medium (lit value ΔE 10.5, the median includes inter-strand shadow); kasim medium (iron-black proxy ΔE 5.7); cotton base cloth medium and synthetic alizarin medium (sourced words, no photo); Kalamkari alizarin low-medium (general words only); Ajrakh indigo low-medium (every measured indigo body is lighter and less saturated: the Ajrakh bowl blocks ΔE 11.1). No hex changed. The sheet now reads 59 rows: 9 evidence, 17 photo, 27 inferred, 6 provisional (the camel dung solution and five clear or near-clear wash and dip waters, none of them an item a test shows); 15 medium, 8 low-medium, 36 low, none unassessed.
- **The six DR-084 label corrections, at their source** (`content/traditions/*/tradition.json`, then the look sheet, the templates and both doors, which paint names from the template at run time): "Dhawri Flowers" (Dhaori Na Phool) for "Dhawri / Tamarisk Galls"; "Iron-Water Black Paste" (Kut) for "Fermented Iron-Jaggery Black Paste", the short form because S1 names both thickeners; Tamarind Seed Paste's local name Pa for Kachika; Karam dropped at the alum fixing dip, by a new concept `machilipatnam-kalamkari.material.alum` whose claim and BELONGS_TO link quote S4 PDF p. 12 (`verify_tradition.py`: 538 of 538 quotes at their locators; recorded in `machilipatnam-kalamkari-verification.md`); "Earthen pot for kasim" for "Buried stone pot for kasim"; and karakkaya, where nothing a learner reads calls it flowers (S4's wording sits in an open question), so nothing changed. Keys are unchanged. `proposed-label-corrections.md` records each. The dip's alum now stands in a crystal bowl in Door 2, as its row's form says, instead of the printing paste's bowl it inherited.
- **Door 1 still colour measurement:** `tools/walkthrough-lab/still-colours.cjs` opens every Door 1 object still at its render size (1800 by 1440) and runs `colourOfStill` on each look the still shows (`stageItemLooks`, which `stageItemStillPath` now uses too), against `renderHex`, or against the colour seen through a clear look. Figures are in `D:/Work/IIT-KGP/Paper_1-artifacts/dr-125/still-colours.json` (GTX 1650, ANGLE D3D11): 52 looks in all stills, all measured; median ΔE 3.6 at the middle tenth, 40 within 5, 47 within 10, none above 20. The largest are by design: the three clear alum crystal rows (16.2: the bowl and wood show through clear crystal), the clear gum (11.5 against its seen-through target), and two translucent liquids whose pot shows through (Kalamkari myrobalan solution 10.6, Sanganeri dung solution 8.2). `looks.cjs` and the new tool share `colour-figures.cjs`.
- **Re-rendered and looked at:** the one Door 1 still whose look changed, Sanganeri Cow Dung at Sun-Bleaching (`objects/223711d0.jpg`): the pot now holds dark olive water instead of red-brown, with the basket and pot as before and nothing passing through anything. The Kalamkari dung bath has no Door 1 still; Door 2 draws it from the row.
- **Battery v9:** `content:look-rows`, `content:stage-template` and `content:test-items` were run. No generated form carries Sample Text now: pre-test 12, identification 26 and 11, stage placement 7 and 7, transfer 2 and 2. Identification gains the two Kalamkari alums, which became unique objects. The e2e studies move to v9; the console test no longer requires a demo form to exist.
- **Checks:** `verify_substance_looks.py` 298 distinct quotes, 0 failures, 0 row problems, every template material matched by one row; `npm run typecheck` clean; ESLint 0 errors; Vitest content 18 of 18; Vitest parity, process, walkthrough, study and course units 435 of 435 with one worker. Not a timing run.
- **Equivalence (7 points):** content, citations, navigation, tradition salience and telemetry are identical in both doors; the renamed items and the new dip concept reach both doors through the one template; exposure is unchanged; the dung bath colour changes in both, from the one row.
- **Numbering:** this record keeps DR-125, which the content files cite; the integration record above, cited by no file, became DR-128 at the merge (DR-127).
- **Paper implications:** report that identification items carry no colour-certainty condition, only a basis condition, and why; report the derived dung-bath colour as an analogue from a European source; report the Door 1 still figures as the measured gap between each rendered still and its sheet value.

## DR-126: The Importer Carries Verified Changes Into Accepted Rows And Returns Them To Review; The Comparisons File Passes The Source Check (Adopted under the lead's delegation, 2026-11-08)

- **Root cause 1 (importer).** `importContent` (`src/server/content/import-content.ts`) skipped every row a curator had accepted: the upsert carried `guardAccepted` (no update while `verified` or `published`), and claims, claim evidence, GI sources and relationship citations were written only for unaccepted parents (`editable`, `editableTradPkgs`, `editableRels`). So the DR-120 to DR-124 rewording of claims and passages in the three study traditions accepted under DR-059 never reached the database, and DR-124 recorded it as not carried. The guard and the editable filters are gone. An accepted row whose content, claims or evidence the files leave unchanged keeps its acceptance (`keptAccepted`). When the files change any of them, the row takes the files' content and its state becomes `under_review` in the same statement (sources included, which have no edit trigger), or through the existing `ie_evidence_changed` and GI-source triggers when only its evidence changed; `concepts_cascade_review` takes its accepted links with it. Each change is a `verification_records` row with the import's reason ("... accepted content the files changed returns to review for re-acceptance on its new evidence"), the summary and the `content.import` audit entry list every such row under `returnedToReview` (`npm run content:import` prints them), and the next review snapshot carries the new text with the new state, so its snapshot item hash changes. Only a curator's transition accepts the row again (`scripts/content/verify-concepts.ts`, DR-059). An accepted relationship the files dropped is archived (if the importer created it) or reported stale, never deleted.
- **Test:** `tests/integration/content-pipeline.test.ts` "updates accepted content the files changed and returns it to review on the record, until a curator accepts the new evidence (DR-126)", on a throwaway database under `episteme_test_importer`: a curator accepts a concept through the CMS `transition()`, an unchanged import keeps it, a changed claim and passage reach the row, the state, the verification record, the audit entry and a new review snapshot item, the curator accepts it again, and the same file then keeps it. It failed before the change (the summary had no `returnedToReview` and the row kept the old text) and passes after. The GI-evidence and relationship-citation cases that asserted the old skip now assert the reopening. The content-pipeline file passes 19 of 19.
- **Root cause 2 (comparisons).** `content/comparisons.json` restates claims of the six tradition files but never had the DR-120 check: 3 of 216 quotes failed at their locator and 66 of 79 relationships had no passage. `verify_tradition.py` was run on it with an archive map that points each `<tradition>:<id>` source at the copy archived for that tradition's own check (no new download; map and output in `D:/Work/IIT-KGP/Paper_1-artifacts/sources/comparisons-2026-11-08/`). Result: 360 of 360 quotes verbatim at their locator; 69 claims in 11 concepts read against their quotes, 26 reworded to what the quotes say, 19 off-topic quotes removed, 4 replaced or cut to the passage that carries the claim and 1 added; every relationship has one passage of at most 25 words per cited source, its explanation and conditions narrowed to them (conditions that only said an endpoint was `needs_evidence`, which DR-120 and DR-122 ended, are gone); no relationship needed removing. One claim and one link dropped a source their passages do not support (bagru:S4), and the uncited `dabu:S12` left the source list. All 11 concepts and 79 relationships are `verified`. Record: `content/review/comparisons-verification.md`.
- **Database:** nothing was run on the development database. Its next `content:import` will return the DR-059 rows whose files DR-120 to DR-124 changed to `under_review`, listed in the import output; `verify-concepts.ts --keys content/traditions/<t>/tradition.json` (and `--keys content/comparisons.json`) with the tradition's record accepts them again under a named curator.
- **Checks:** Vitest content 18 of 18; the knowledge-graph unit tests 65 of 65; the content-pipeline integration test 19 of 19 (1 worker); ESLint clean on the changed files; `tsc` reports only the route types Next generates at build, absent in a worktree.
- **Equivalence (7 points):** unchanged in both doors. Both doors read the same snapshot; the file's `verified` still loads as `under_review`, so no comparison text changes state for a learner until a curator accepts it, and both doors show the same text when it does.

## DR-127: Merge Of DR-125 And DR-126; Comments, Low-Value Tests, Dead Code And Duplicated Helpers Removed; Door 2 Sky Bytes, Chart Bundle And The Research Overview's Queries Cut At Their Cause; WebAssembly Allowed Again For The Geometry Levels (Adopted under the lead's delegation, 2026-11-08)

- **Merges:** the look-sheet branch and the importer branch were merged into `walking-the-process` with `--no-ff`; the only conflict was this file, resolved by keeping both records. DR-125 had been filed twice: the look-sheet record keeps DR-125 because the content files cite it, and the integration of DR-122 to DR-124 (commit 2297001) became DR-128 (numbering note at the head of this file). The merged tree failed one integration test: "writes relationship evidence into its citation" assumed its picked relationships carry no passage in the files, which DR-126 ended. The test now builds its model with those two relationships' file evidence cleared and checks that the other citations keep what they held; 19 of 19.
- **Comments:** stripped with parser-based passes (TypeScript's parser for TS and JS, with a per-file check that the token stream is unchanged; Python `tokenize` and `ast`, with an AST equality check, docstrings included; a quote- and dollar-quote-aware SQL pass that keeps Drizzle's `--> statement-breakpoint`; the PowerShell parser). 2,546 comments removed from 387 TS/JS files and 581 lines from 37 SQL and Python files. Kept: 25 eslint directives, 2 `@ts-expect-error`, 5 `turbopackIgnore` magic comments, `# noqa` and `# type: ignore`. No vendored licence header or "Adapted from virtual-walkthrough" attribution existed.
- **Tests and checks removed:** tests that grepped source or CSS (`architecture`, `design-lint`, `focus-ring`, `title-case-scan`, the source parts of `deploy-source-changes`, `deploy-production-data-path`, `google-sign-in`, `honest-public-text`, `content-parity`, `unverified-notice`, `viz-tokens`), class-name and exact-copy assertions (`button` sizes, Rule classes, one guidance sentence, the home deck sentence), and a test that asserted `n >= 0`. The token-value table in `contrast.test.ts` became WCAG threshold checks over every pair it listed. The comment-free rule left the architecture test with nothing but a source grep, so the layer rule moved into ESLint (`no-restricted-imports` per layer of the process, walkthrough and course features; checked against planted ui-to-infrastructure and domain-to-three imports). The `invite-gate.ts` build step and the preflight's source-readiness greps re-checked by text what `proxy-invite-gate.test.ts` and the deploy tests prove by behaviour, so they are gone and `vercel.json` builds with the default command. The preflight's S3 check no longer passes on `AWS_ROLE_ARN`, which `storage.ts` refuses. Kept: the TS/Python outcome-list parity check (data correctness of the analysis) and every generated-file sync test.
- **Dead code (knip 6.44.2, depcheck 1.4.7, jscpd 5.4.3):** 10 unused files, every unused export and the declarations only they used, and 10 unused dependencies (`@hookform/resolvers`, `react-hook-form`, seven `@tiptap/extension-*` packages and `@tiptap/extensions`, `@axe-core/playwright`). Duplicates: four copies of the transaction wrapper became `src/server/db/transaction.ts`; `bindToDbIds` exists once; the demo seed hashes with the graph's canonical JSON instead of its own copy. knip reports nothing left except `shadcn`, `tailwindcss` and `tw-animate-css`, which `globals.css` imports.
- **Speed, measured** (next build then next start, every route on the GTX 1650, a fresh browser context per route, server time the median of five document fetches; `D:/Work/IIT-KGP/Paper_1-artifacts/dr-127/perf-before.json` and `perf-after.json`):
  - Door 2 sky: `env.hdr` was 4,624,289 bytes served as `application/octet-stream`, which neither `next start` nor a CDN compresses. It is now stored gzip-compressed (`env.hdr.gz`, 2,605,413 bytes, lossless) and decompressed with `DecompressionStream` in the decoder worker. Door 2's first sky download falls from 5,555,472 to 3,536,596 bytes; the scene renders the same sky and light.
  - Research charts: `use-echart` imported `echarts/charts`, `components` and `renderers` as whole namespaces, so every chart type and both renderers shipped. `echarts-runtime.ts` imports the five charts, four components and the SVG renderer by name. Analytics and session pages: 639,113 to 451,849 bytes of JavaScript transferred (1,962,800 to 1,387,489 decoded).
  - Research overview: two queries per study (sessions and latest parity report, 107 studies on the dev database). `listSessions` takes a list of studies and `latestParityReports` reads every study's latest report with one `DISTINCT ON`; `contentParityRows` uses it too. Server time 125 to 85 ms.
  - SQL: the slowest statement on demo data, the claims query of `loadModelFromDb`, runs in 7.1 ms under EXPLAIN ANALYZE (1,246 claims, 137 shared buffers hit). No plan problem was found. The CMS concept proof (381 ms) spends its time building the whole review snapshot (load 45 ms, validate 30 ms, build and hash 150 to 200 ms), and the media library takes about 400 ms; both are staff-only and unchanged in this pass.
  - Unchanged and recorded: framework JavaScript 205 KB on every page; Door 1's first stage loads 4.4 MB of images (the 2048 px plaster at 980 KB and the 1800 by 1440 stills at 400 to 570 KB each).
- **WebAssembly:** DR-123's geometry levels run `MeshoptSimplifier`, a WebAssembly module, but DR-077 had removed `'wasm-unsafe-eval'` from the CSP when the KTX2 transcoder went, so the production build refused the module (console: "Compiling or instantiating WebAssembly module violates ... script-src"). `'wasm-unsafe-eval'` is back (it permits WebAssembly compilation only, not JavaScript eval) and the proxy test requires it. Door 2 loads with no console errors.
- **Checks:** `npm run typecheck` clean; ESLint 0 errors, 6 existing warnings; Vitest dom and node, integration included, 4 workers: 1,783 of 1,784 on the first run, the failure being the merge test above, which then passes 19 of 19; `next build` clean. Not a timing sweep: the machine was not quiesced, so the speed figures are comparisons on one machine within one hour, not absolute values.
- **Equivalence (7 points):** content, exposure, citations, navigation, salience and telemetry are unchanged in both doors; Door 2 loads a smaller sky file with the same decoded pixels (byte-identical after decompression), and both doors' text and images are untouched.
