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
