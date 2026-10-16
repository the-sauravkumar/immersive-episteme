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
