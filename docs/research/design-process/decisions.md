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
  each attached to a context concept. The anchor claim of each one names that very object.
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
  - process, tool and place photographs were not shown for any tradition, and why.


## DR-021: The same concept layers and pager in both conditions (Adopted)

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


## DR-022: Dashboard Figure 3 "Gain by Tradition" is a descriptive breakdown (Proposed; the project lead or the analysis plan confirms or replaces the definition)

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


## DR-023: The admin settings page is read-only (Adopted; a departure from DESIGN.md 11.11)

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
