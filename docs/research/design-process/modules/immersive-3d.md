# Module record: the immersive 3D museum (condition B)

Implements CN-10, CN-11 and CN-12 for the 3D condition, the rendering-quality specification
(`docs/architecture/immersive-rendering-quality.md`, DR-012 to DR-014) and the equivalence rules
of DR-015. Measured rendering results are in `docs/architecture/immersive-rendering-results.md`.
Every number below cites the test, command or file that produced it.

## Code map

| Part | Where |
|---|---|
| Route (server: learning context, manifest, read model) | `src/app/(learning)/learn/immersive/page.tsx`, `src/features/immersive/server/payload.ts` |
| Manifest -> scene model (pure) | `src/features/immersive/scene-model.ts` |
| Panel content and disclosure layers (pure) | `src/features/immersive/panel-content.ts`, `types.ts` |
| Text placement and legibility rules (pure) | `src/features/immersive/placement.ts` |
| Navigation, collision, routing (pure) | `src/features/immersive/navigation.ts`, `tour-path.ts` |
| Quality tiers | `src/features/immersive/quality.ts` |
| R3F canvas, scene, render pipeline, world, lettering, probe | `src/components/museum/**` |
| HTML overlays (panel, HUD, plan, screens) | `src/components/museum/overlays/**` |
| Texture pipeline and measurement tools | `scripts/museum/**`; assets and licences in `public/museum/ASSETS.md` |
| Tests | `tests/unit/immersive/**` (33 tests), `tests/e2e/immersive-flow.spec.ts`, `tests/e2e/immersive-rendering.spec.ts` |

## Decisions

### I-M: mapping the manifest to the scene

| # | Decision | Rationale and evidence | Alternatives rejected |
|---|---|---|---|
| I-M1 | The renderer reads only the stored manifest (`getManifest(ctx.manifestId)`) through one pure function, `buildSceneModel`. Every manifest element is either drawn by a named part of the scene or reported with a reason. | Traceability from knowledge to space must survive rendering. Test `scene-model.test.ts` "accounts for every manifest element exactly once" and "renders every element kind the compiler emits": 456/456 elements of the three-tradition manifest are accounted for, 0 unreported. | Hand-placed scene components per room (rejected: a hard-coded layout breaks traceability). |
| I-M2 | Image planes are declared by the manifest but not drawn. Their assets are media candidates whose licence is not reviewed, and the snapshot carries no media (data-and-telemetry-layer.md §3). | 15 exhibits declare an image plane; each is reported in the scene-model report with this reason (test "reports (does not draw) image planes ..."). The parity rule says both conditions show the same images, and neither shows unreviewed ones. | Showing Wikimedia candidates (rejected: licence unreviewed; would break parity with 2D). |
| I-M3 | Walls, posts and lintels are merged per zone and material. Plinths and door linings are chamfered boxes (30 triangles instead of 10). Floors and ceilings are one mesh per room with that room's baked AO. | Draw calls stay low and fixed: one wall, plinth and trim mesh per zone, and two planes per room. Chamfers catch light the way real edges do (lead: "no rough edges"). Unit test `geometry.test.ts`: every triangle winds outwards; the chamfered box has 30 triangles. | Normal-map bevels (rejected: a texture per box size); one draw call per box (rejected: hundreds of calls). |
| I-M4 | UVs are world-space metres on every face. | Texture continues across abutting wall pieces and posts with no seam (test "uses world-space metre UVs ... without a seam"). Texel density is equal on every wall. | Per-box UVs as in the reference repo (rejected: a visible seam at every junction). |
| I-M5 | **Superseded by I-G4 (flush 20 mm linings).** Door linings are derived from each portal's opening (two jambs and a head). They stand 12 mm proud of the wall and 30 mm into the opening. The jambs stop under the head lining. | No two coplanar same-facing faces overlap (test "builds door linings that never overlap each other"). | Jambs running to the lintel (found while writing the test: they overlapped the head lining with coplanar faces, a z-fighting risk). |

### I-R: rendering

| # | Decision | Rationale and evidence |
|---|---|---|
| I-R1 | **Renderer: WebGLRenderer with TAARenderPass accumulation at rest and SMAA, as the provisional choice.** The DR-014 decision rule needs the WebGPU+TRAA comparison measured on both backends. `scripts/museum/renderer-decision.ts` renders the same world (same textures, AO, lighting and unlettered cards) three ways: WebGL+TAA, WebGPU+TRAA, and WebGPU+TRAA forced onto its WebGL2 fallback. It measures C1, C1b and frame time. The run is **ready but not yet done**: the lead paused GPU measurement until the machine is quiet. The first attempt was interrupted and gave no valid numbers. | Reasons the WebGL path is provisional: it is the one that passes the C1 definition by construction. Once the 32 jitter samples are accumulated, three 0.186.1 TAARenderPass returns the stored accumulation unchanged (`TAARenderPass.js` `render()`), so a still view is pixel-stable. TRAANode jitters every frame (`TRAANode.js` `_haltonOffsets`, index advanced each frame), so stability at rest has to be measured, not assumed. The custom panel shader (`onBeforeCompile`) does not run under WebGPURenderer node materials, so the WebGPU path would also need the lettering shader ported to TSL. |
| I-R2 | **Superseded by I-R7 (SMAA in motion only).** Post-processing is TAA (at rest), then OutputPass (Neutral tone mapping, exposure 1.0, sRGB), then SMAA. Nothing else: no bloom, grain, vignette or SSAO. | C7 asserts the live pass list equals `STUDY_RENDER_CONFIG.postprocessing` (`src/components/museum/three/resources.ts`). SMAA runs on tone-mapped sRGB values (after OutputPass) and stays on at rest. This avoids an aliased first rest frame when accumulation starts from the aliased "hold" image. |
| I-R3 | **Superseded by I-G1 and I-G5 (unlit baked finish, no lights).** No dynamic shadows on any tier. Contact shading comes from ambient occlusion baked from the manifest geometry. Floors and ceilings get a per-room AO map computed from the distance to every wall, post and plinth footprint. Walls, plinths and trims get one vertical AO profile. Ceilings add a constant bounce term (emissive). | Removes shadow acne, peter-panning and shimmer (spec §1). The bake is deterministic: a function of the manifest only. Lighting is the same in every zone: hemisphere 1.0, one non-shadowing key light of 1.2, RoomEnvironment PMREM at 0.8. That is the C2 cross-zone requirement. The first screenshots showed the ceiling as a dark brown lid; the bounce term fixed it. |
| I-R4 | Tiers are chosen once from the WebGL renderer string, `deviceMemory` and `hardwareConcurrency`. The choice is locked in `localStorage` under the telemetry session id and logged once (`render_quality_changed`, from `unset`). Tiers differ only in rest samples per frame (4 vs 2; both accumulate 32) and are otherwise identical: the same textures, resolution, DPR cap (2) and resident depth (2). | Spec §2d: texture quality never changes. Software renderers (SwiftShader, llvmpipe) get the designed fallback screen. The few-frame benchmark the spec mentions is **not implemented**; the tier heuristic uses the renderer string. |
| I-R5 | Render on demand: `frameloop="demand"`. A frame is requested only while the visitor moves, AA is converging or lettering is loading. A hidden tab, pause, onboarding, help or context loss sets the frameloop to `never`. | Unit test "reports no motion when the visitor is still". C10 measures idle and hidden frame counts. Resolution is never lowered in motion (render scale 1.0 always), so "sharp within 150 ms of stopping" holds by construction: every frame is full resolution. |
| I-R7 | SMAA runs only in motion; at rest the TAA accumulation alone anti-aliases, and the composer's last pass does not swap. | C1: through SMAA a still view flipped between two images along thin edges; without it, 0 changed pixels over 98 viewpoints (gallery finish section). |  |
| I-R6 | All shaders are compiled and all textures uploaded before entry. `compileAsync` runs with one highlight and one route mesh present, `initTexture` is called on every material texture, and a full AA pass renders behind the loading screen. | C4 asserts no program count increase after entry. |

### I-T: textures and assets

| # | Decision | Evidence |
|---|---|---|
| I-T1 | **Superseded by I-G1 (only the colour maps are loaded).** Two CC0 Poly Haven sets: `beige_wall_001` (plaster: walls, lintels and ceilings) and `laminate_floor_02` (floor). Each has colour, OpenGL normal and ARM maps. | `public/museum/ASSETS.md` gives each asset page, source URL, author, the published md5 the pipeline verified, and the sha256 of every shipped file. |
| I-T2 | The authored resolution is 2048 x 2048 for every map on every tier. | The wall map covers 3.0 m (683 px/m) and the floor 1.7 m (1205 px/m). The densest demand is about 899 px/m: a wall at 1 m, 1080 px, 62 degree FOV (`scripts/museum/textures.config.ts`). |
| I-T3 | Encoding is KTX2 UASTC (quality 2), RDO lambda 0.5, Zstandard level 20 and a full mip chain (Lanczos, wrap). | Without RDO the six maps were 25.6 MB (file sizes of the first run), over the 25 MB first-download budget. With RDO they are 21,354,070 bytes (`ls public/museum/textures`). Encoder SSIM at level 0 is at least 0.9917 for every channel of every map, normals and ARM included (`analysis/out/museum/encode-report.json`). GPU-side SSIM is C12, which is pending. |
| I-T4 | **Now two maps (I-G1): 11.2 MB on the GPU.** GPU memory is computed at 4x (lead's correction: UASTC transcodes to 8 bits per pixel against 32 for RGBA8). Each 2048 x 2048 map with mips is 5,592,405 bytes. The six maps are 33.6 MB, against 134 MB as RGBA8. | Arithmetic: 2048 x 2048 x 4/3. |
| I-T5 | **Superseded by I-G3 and I-G8 (white and black, the --font-sans face).** The lettering is a single-channel (R8) coverage atlas per room at 600 texels/m, built from the page's own fonts (Cormorant Garamond, Inter) and streamed with the room. The panel shader mixes paper and ink. | One byte per texel, against four for RGBA canvas textures. It uses the same typefaces as 2D. |
| I-T6 | No meshes are downloaded. All geometry is generated from the manifest, so meshopt has nothing to compress. | Stated rather than measured: there are no `.glb` files in `public/museum`. |

### I-P: text placement and legibility (lead requirement)

All rules are applied uniformly from the manifest; none is tuned per exhibit. Measured by
`tests/unit/immersive/placement.test.ts`:

| Check | Rule | Measured (three-tradition manifest) |
|---|---|---|
| P1 eye-height band | All exhibit cards sit in one band; signage in its own band | Cards: one band, 1.550–2.250 m. Signage: category signs 2.40–2.70 m, door signs 2.48–2.78 m (two bands 8 cm apart: see the shared changes). |
| P2 offset | Every text plane is 3 mm proud | Offsets: {0.003 m} |
| P3 shared baseline | Cards on one wall share top and bottom; lettering is left-aligned on a fixed pad | 78 walls, 0 failing |
| P4 spacing | Neighbouring cards on a run of wall between doorways | First measurement: gaps 1.20–22.20 m, because the compiler filled wall slots in order. After the lead's compiler change (rule layout.even-spacing: each free wall segment gets a share of the room's exhibits in proportion to its capacity; they hang at the one standard 2.2 m centre spacing, centred on the segment): every gap 1.20 m, spread 0.00 m over 87 walls. **Met.** |
| P5 overlaps | Text vs text, plinth, doorway, and backing wall | 0 overlaps over 254 cards, 39 category signs and 58 door signs |
| P6 facing | Cards face their approach point | Maximum angle 0 degrees |
| P7 angular size | Every line subtends at least the angle of 16 px text at 1280 x 800 with a 62 degree vertical FOV (0.024033 rad). The em size is derived from the farthest approach distance (2.107 m): kicker and footer 0.051 m, title 0.097 m. | Smallest kicker 0.024209 rad and smallest title 0.046038 rad, both at least 0.024033. 0 failing. |
| P8 door signage | Each doorway carries a sign on each lintel face naming the room it leads to (and the zone, when it changes), readable from 2.5 m with a clear line of sight | 29 doorways, 58 of 58 sides signed and readable; smallest angle 0.03595 rad. Superseded in size by I-W5 (2.2 x 0.46 m, name readable from 6 m). |
| Contrast | WCAG 2.2 AA under the scene lighting, measured on the rendered frame at every exhibit approach | Pending GPU run. Design value: secondary lettering at 0.88 coverage gives about 5.3:1 by the shader's linear mix (`MUTED_COVERAGE` in `labels.ts`). The first value, 0.72, would have given about 3.0:1 and was changed. |
| Wayfinding order | Wing room order against the 2D section order (context, materials and tools, process, artisan, design, outcomes, science, ...) | First measurement: 24 of 54 ordered room pairs inverted (greedy cross-category grouping). After the lead's compiler change (rule layout.template-order, the default; the old ordering stays available as `groupOrder: "connection"`): 0 of 54. **Met.** Door signs and the "In this room" doorway list still name every destination. |

In-world text carries titles only: the exhibit title, its type, its step number and its
tradition and category; category signs; door destinations. Claim text exists only in the
tracked HTML panel, as on the 2D cards. Exposure is measured only while that panel is open.

### I-E: equivalence with 2D (CN-12, DR-015)

| # | Decision | Evidence |
|---|---|---|
| I-E1 | The panel shows the read model's claims for the concept: the same text, order, citations, locators and quotes, under the 2D headings "From the Sources", "Related Concepts", "Compared Concepts" and "Similarities and Contrasts" (Title Case through the shared `titleCase`). It uses the same `CitationDisclosure` and the same relation detail ("About this link", logged as `rel:<id>`). | `panel-content.test.ts`: claims identical for all 254 placed concepts; every displayed title or claim is a read-model string. `info-panel.test.tsx`: the rendered list equals the read model; citations are collapsed. `immersive-flow.spec.ts` compares the DOM claims of the 3D panel with the 2D concept page for the same concept (e2e; not yet run, see the results document). |
| I-E2 | Related concepts, compared concepts and comparison links are limited to the study scope (the manifest's placed concepts). This is the scope the 2D condition serves (`src/features/learning-2d/scope.ts`). | Test "keeps related concepts inside the study scope, in read-model order". |
| I-E3 | The exposure layer is `exposureLayerOf(type)` of the concept whose claims are shown, imported from the module both conditions share (`src/features/learning/labels.ts`, which also holds the type, category and relation labels used on exhibits and in the panel), so the same concept always counts as the same layer in both conditions. Comparison concepts report `comparison` in both. The panel tabs (Overview, Artisan, Process, Science, Compare) are disclosure UI, logged as `information_layer_opened/closed` with `layerId`. | Test "uses the 2D type -> exposure layer rule". |
| I-E4 | Time accounting uses the shared hooks unchanged: exposure while the panel is open (`useContentExposure`), navigation while walking or with the plan open (`useNavigationPhase("walk" | "map")`), and pauses for onboarding, help, pause and context loss (`usePauseWhile`). The learning phase uses the shared `LearningPhaseProvider` and `LearningTimer`. | The e2e flow asserts that exposure, navigation and timing pause events are emitted. |
| I-E5 | Walking anywhere (WASD, dragging, clicking the floor) closes the panel. | No interval counts as exposure while the visitor walks. |
| I-E6 | Study settings come only from the learning context: `ctx.settings` (`minimap`, `webglFailurePolicy`, `guidance`, `learningPrompts`). The payload builder no longer queries `studies.config` by study id, so the museum and the 2D pages read one parsed protocol. | `src/features/immersive/server/payload.ts` (`immersiveSettingsOf`); `tests/integration/learning-settings-practice.test.ts` asserts equal settings for a 2D and a 3D session. |
| I-E7 | The learning-task prompts are the shared `LearningTaskPrompts` (verbatim protocol text, open by default, collapsible), under the room name in the top-left column; the 2D pages show the same component under the header. | `src/components/museum/overlays/hud.tsx` (`prompts` slot). |
| I-E8 | Hybrid guidance (D6) is the shared module and components: the "Hint" button sits in the top bar next to the shared timer, as in the 2D header, and opens the researchers' `guidance.hintText`; the stall cue appears bottom right (beside the manifest's cue notes) after `guidance.stallSeconds` of active time without a newly exposed concept, computed from the same time accountant as 2D, so "exposed" means the open panel here and 50% in view there. Both log `guidance_cue_used` with `cueId` `guidance.hint` or `guidance.stall` and no room context, identical to 2D. Off unless `policy = "hybrid"` with `cueEnabled`. | `src/components/learning/guidance.tsx`, `src/features/learning/guidance.ts`; `tests/unit/learning/guidance-ui.test.tsx` renders the 3D top bar and the 2D header and finds the Hint in the timer's toolbar group in both. |

### I-I: interaction and guidance (CN-11)

- Controls: WASD and arrow keys (Shift for brisk), drag to look, click or tap the floor to walk
  there (grid route), click a card or plinth to walk to the exhibit and open its panel. Keyboard:
  "In this room" lists the exhibits and doorways as buttons; the panel tabs follow the WAI-ARIA tab
  pattern; Escape closes the panel or the plan. Collision slides along walls (test "slides along a
  wall instead of stopping dead"). Adapted from virtual-walkthrough `navigation/collision.ts` and
  `navigation/VisitorController.tsx`.
- The onboarding card appears once per session and never again after "Enter the museum". It
  pauses timing while shown. The same controls stay available on request from the Controls button.
- The plan is minimised by default and toggled (`studies.config.minimap`); rooms on it are
  buttons. The HUD shows the room and zone name, the shared timer, Controls and Pause. There are
  no social or live features.
- The manifest's cues are structural signalling, not the hybrid guidance of I-E8 (study-decisions.md
  D6: "Always-on structural signalling: 2D section headings and process timeline; 3D zone signage
  and the process path."), so the guidance policy does not switch them off.
  They follow the compiler's encodings. A causal cue appears in the cause's panel
  ("Leads to", with the read-model relation label and explanation, and "Show the way" drawing the
  routed progression). A threshold cue gives a prerequisite note. A sequence-start cue reveals the
  sequence route. Wing entry is announced. Every cue is logged as `guidance_cue_used`
  (shown, followed or dismissed).
- When there is no WebGL 2, or only software rendering, a designed fallback follows the study's
  `webglFailurePolicy` (retry, reassign or exclude) and never switches silently to 2D.
- Context loss pauses the visit, logs `webgl_context_lost` and restores. C8 forces it.

### I-F: familiarisation practice (D5)

- `/learn/immersive/practice` renders a small practice room with the SAME runtime (`MuseumApp`:
  renderer, controls, information panel, minimap, hint control and timer) and the study's
  settings. The room is compiled from a fixed practice graph (an entrance concept, two objects
  and a three-step PRECEDES sequence, all titled "Practice …") by the same compiler and default
  rule set, so it has the lobby, wing rooms, doorways and a sequence path of the real museum.
  Panels show two sentences of practice wording; there are no sources or citations.
  `src/features/immersive/practice-room.ts`; `tests/unit/immersive/practice-room.test.ts`
  (every title and text is practice wording, a sequence path exists, compiling twice gives the
  same manifest).
- Timing and telemetry are those of the 2D practice (learning-2d record, L16): the practice
  context never starts the learning clock, the study engine times the step on the server, the
  shared timer counts it with practice wording and hands back to `/study/session`, and events go
  to a practice telemetry session that is acknowledged and never stored.
- The onboarding (controls) card is keyed to the STUDY session, which practice and learning
  share. Practice teaches the controls, so the timed learning phase does not show the card again.
  A first version keyed it to the telemetry session, which differs between practice and learning,
  so the card reappeared at the start of learning. That cost 3D participants learning time the 2D
  condition does not spend, an interface confound. (Onboarding pauses interval timing, I-E4, but
  the learning clock keeps running.) Demo and preview have no practice step, so they key to
  their own telemetry session.

## What was tried and changed

- The panel material was first cloned per atlas page. `Material.clone()` does not copy
  `onBeforeCompile`, so the lettering rendered as red text on black. It is now created per page.
- The walk-to-exhibit final turn never completed, because the facing step ran only while
  waypoints remained, and the panel never opened. Fixed; covered by "walks a route to an exhibit,
  arrives and faces it".
- Notes from cues stayed on screen after the visitor left. Approach cues are now re-armed
  wherever the visitor is, checks also run after every 0.1 m of movement, and notes raised by
  entering a room end when the visitor leaves it.
- The HUD originally pushed overlays off screen below the demo notice, and the room chip was
  truncated at 390 px. The museum root now fits the space under the shell notice, the HUD stacks
  on narrow screens, and the panel becomes a bottom sheet with the exhibit framed above it.

## Implications for the paper

- The 3D condition's text equals the 2D condition's at claim level (automated tests over all 254
  concepts). In-world text is limited to titles, so exposure to claims is measured identically:
  the panel open in 3D, the content in view in 2D.
- Report the placement and legibility rules (P1–P8) as part of the condition's design. Rendering
  quality (C1–C12) is reported per GPU tier with the hardware (results document).
- Guidance (I-E8) and the learning-task prompts (I-E7) are the same components, text and rules
  in both conditions; the practice room (I-F) trains the controls without craft content and is
  kept out of learning time and metrics.
- Limitations to report: no exhibit images are shown in either condition until licences are
  reviewed. (Room order and card spacing were fixed in the compiler: 0/54 pairs inverted, and
  1.20 m gaps everywhere.) The renderer choice awaits the DR-014 measurement.

## Walking must never be an obstacle

**Requirement (project lead):** "users shouldn't get stuck if they are moving diagonally or when they hit wall corners. Walking feature shouldn't act as obstacle otherwise the skewdness will be in the design." A clumsy walk would handicap the 3D condition for reasons unrelated to spatial knowledge, which would confound the comparison.

**Measurement.** `tests/unit/immersive/movement-snag.test.ts` drives the visitor through the real compiled museum:
- **Doorways:** approaches from 0 to 60 degrees, aimed anywhere across the 1.5 m opening out to the frame, with forward and W+A / W+D diagonal input.
- **Random walk:** a seeded random walk of about 2,100 trials, with forward, diagonal, strafe, backward-diagonal and brisk input from random places and headings. A snag is speed below 15% of the requested speed for 0.3 s while a free direction within 70 degrees exists.
- **Routes:** click-to-walk routes from the spawn to every exhibit and between exhibits, which must arrive within 1.6 times the walking time plus 4 s.

**Finding.**
- Doorways and routes already passed.
- The random walk found snags at the tips of exposed corners: plinth corners and wall ends at doorways. Walking nearly straight at a corner tip, the collision push points back at the visitor. Sliding then crawled at about 0.19 m/s (14% of walking speed), or stopped.

**Change: corner slip** (`stepVisitor`, `src/features/immersive/navigation.ts`). Two conditions must both hold:
- the contact is an exposed corner: a vertex, or a face point within one body radius of the face's end, with free space just beyond it;
- progress falls below half of the requested travel.

When they do, the visitor steps around the corner on the side they are already on. A slip is accepted only if it moves further and loses little ground in the walking direction. Two cases are left alone, and tests guard both:
- flat walls: walking head-on into a wall does not drift sideways;
- room inside corners: they settle without jitter.

**Result:** 0 snags in about 2,100 trials, every doorway approach passes, and every route arrives.

## Mouse and keyboard together

**Requirement (project lead):** camera control with the mouse "just like AAA games", in combination with keys, and sprint with Shift together with W or S.

**Before:** W/A/S/D and the arrows walked, with ← → turning. Shift already sped up every key movement, from 1.35 to 2.3 m/s. Left-drag looked around (grab the view, as in Street View), and clicking the floor or an exhibit walked there.

**Added: hold the right mouse button to look.** The cursor is captured (pointer lock) and the mouse steers the view first-person style while W/A/S/D walk. Releasing returns the cursor for clicking.
- The sensitivity is 0.0025 rad per pixel, one fixed value for every participant.
- The convention is the one used by common 3D editors and games. It needs no mode switch, and no Esc trap.
- The controls help now lists sprint (Shift with any walking key, for example W or S) and right-button mouse look.

The sprint speed stays at 2.3 m/s. A faster sprint would raise the risk of simulator sickness, which the study measures with the SSQ.

**Equivalence check:**
- Both changes concern navigation, the manipulated variable, and only remove friction from it.
- Content, the knowledge sheet, citation access, exposure and navigation timing rules, and tradition balance are unchanged. The parity-engine, figure-balance, 2D and immersive suites pass.
- The practice room must teach drag-look and right-button look equally.
- **Pending:** logging which look method each participant used (a covariate) is scheduled with the next telemetry change.

## Free mouse look (no button held)

**Requirement (project lead):** "is the feature to move camera as user moves mouse/touchpad (if laptop) up, down, left, right there?" Holding a button while moving is awkward on a touchpad.

**Added: a free-look toggle.** It is switched by the "Mouse look" button in the museum's condition navigation group, or the L key.
- **While on:**
  - the cursor is captured (pointer lock), and any mouse or touchpad movement turns the view first-person style: right turns right, up looks up;
  - W/A/S/D walk, and a small ink crosshair marks the centre;
  - a click acts on what is under the crosshair (opens an exhibit, or walks to a floor point).
- **Switching off:** Esc, L, opening an exhibit panel (reading needs the cursor), or a pause.
- **Defaults:** off by default, so novices meet the familiar drag-to-look first. The sensitivity is the same fixed 0.0025 rad per pixel as right-button look.
- **Keys:** while captured, keys reach the walk even if focus stayed on the bar button.

**Verified on the GTX 1650 (headless Chromium):**
- the button shows as pressed, the cursor is captured and the crosshair appears;
- 150 px right turned the view right by 0.375 rad, and 30 px up tilted it up by 0.075 rad;
- W walked while captured;
- L released the cursor and switched the mode off.

**Equivalence check:**
- **Navigation only:** this is the manipulated variable. The added bar button sits in the condition navigation group, the one bar area allowed to differ between conditions, at the same size and style as its neighbours.
- **Unchanged:** content, the knowledge sheet, citation access, exposure and navigation timing rules, and tradition balance. The parity-engine, figure-balance, 2D and immersive suites pass.
- **Covariate:** which look method a participant used is a covariate. Its logging is scheduled with the next telemetry change, and the practice room must teach all three look methods (drag, right-button, free look) equally.

## One key map for walking (arrows = W/A/S/D)

**Requirement (project lead):** "add the all 4 arrows along with the W, A, S, D because we don't want a non-gamer to have to remember a new set of details just to navigate and that'll skew the experiment."

**Before:** ↑/↓ walked like W/S, but ←/→ turned while A/D stepped sideways. "Left" had two meanings.

**Change:** `moveInputFromKeys` in `src/features/immersive/navigation.ts` (unit-tested).
- **Default:** W = ↑ forward, S = ↓ back, A = ← turn left, D = → turn right. One meaning per direction for both key sets, and keyboard-only users can turn.
- **While mouse look is active** (right button held, or free look): the mouse turns, so A/D and ←/→ step sideways, as in first-person games. This is the convention Second Life uses for mixed audiences.
- **Shift** sprints with any walking key.
- **Help text:** the Controls help, the onboarding movement line and the Explore page now show the walk keys (W S or ↑ ↓) and the turn keys (A D or ← →) as keycaps.

**Equivalence check:**
- Navigation only, the manipulated variable. The change lowers what a novice has to learn to navigate.
- Content, the knowledge sheet, citation access, timing rules and tradition balance are unchanged.
- The immersive, 2D and parity suites pass (126 tests).

## Gallery finish (DR-023, package 3D-A)

The museum rendered as a flat beige box (DR-023 context). The finish below replaces the lit PBR
look with a restrained, unlit, baked gallery: one parameter set (`GALLERY_FINISH` in
`src/components/museum/three/resources.ts`) with no zone, tradition or room key, so every wing is
finished identically by construction. It is credible rather than "fancy" (concept note §7): no
props, no new post pass, no imagery on the walls.

| ID | Decision | Evidence | Alternatives |
|---|---|---|---|
| I-G1 | **Unlit architecture with baked light.** Walls, posts, lintels, reveals and plinths share one `MeshBasicMaterial`: the plaster colour map with a neutral gain, one shared wall-wash profile as a lightmap on uv1, and per-face shading baked into vertex colours. Floors and ceilings have one light map per room. No lights, no environment map. Only the two colour maps are downloaded; normal and ORM maps stay in the index, unused. | gallery3d X2 correction: a lightmap only adds irradiance and three.js has no per-material light exclusion, so the wash needs unlit materials. Light no longer depends on orientation or position at run time, which is what makes the wings identical. The first download falls from 21.4 MB to 7.06 MB (`public/museum/textures`). | Keeping the PBR rig and adding a lightmap (rejected: the X2 correction). Per-zone light values (rejected: DR-023 one parameter set). |
| I-G2 | **Targets are rendered values, reached by construction.** Each target is an 8-bit display value; `preToneMap` inverts three 0.186.1 `NeutralToneMapping` at exposure 1 and the material colour divides by the colour map's measured linear mean. Wall 205 (card band), floor 100, ceiling 196, plinth 226, shadow gap and plinth toe 40, door edge `#3F454C`, cove 0.72 linear. | Unit test `gallery-finish.test.ts`: the inverse round-trips to 1e-9; wall 200-210; floor luminance 0.21 x the wall (limit 0.3), Smithsonian contrast 79% (at least 70%); door edge at least 3:1 on walls of 200-210. Measured on the GTX 1650 frame (see the results document): wall 203-205.5, a\* and b\* within ±0.15; floor 103.6; ceiling 194. | A test-and-adjust grade by eye (rejected: not reproducible). |
| I-G3 | **Plates, plaques and signs are display-referred white and black.** The label materials are unlit and write alpha 0; the pipeline's OutputPass tone maps by alpha, so label pixels skip the tone mapping. The TAA pass clears with alpha 0 so the flag survives accumulation. | three applies `toneMapped: false` only when a material renders straight to the canvas; here the scene renders into the composer's linear target, so a white plate first rendered at sRGB 240 (measured). After the change: paper 255, measured. Plate to wall 1.58:1 at 205 (F2 floor 1.5). | Paper pushed to scene value about 15 so the tone mapping returns near-white (rejected: glyph edges would bloom to white and thin the strokes). |
| I-G4 | **Junctions:** 150 mm ceiling cove 80 mm deep (walls run up into it; the slot and its lip are the cove surface); a 25 mm high, 15 mm deep shadow-gap skirting under every wall and post; door openings with plaster reveals and a 20 mm flush edge (linings 20 mm deep, flush with both wall faces, no architrave); a 30 mm toe recessed 20 mm under every plinth; door thresholds at the floor value. | DESIGN-v2 §11 F5 to F8. `scene-model.test.ts` still finds no overlapping linings; C1 (below) finds no flicker. | Proud dark linings (removed: 8.8 to 9.4:1, the most salient objects in view, gallery3d S6). |
| I-G5 | **Wall wash and room light maps.** One 1 x 256 profile over the room height: flat within 0.5% across the 1.55 to 2.25 m card band, 0.86 at the skirting, up to 1.10 at the cove. Floors: contact shading from walls and plinths; ceilings: the cove's up-light near the walls. Each map is normalised so its mean is exactly 1. | `gallery-finish.test.ts`: the card band is flat within 3%; every room's stored floor and ceiling mean is within 1% of the others; every wall, plinth and reveal mesh references the one profile instance. | A 64 x 256 half-float profile (the proposal's estimate): u is unused and 8 bits with 2x headroom interpolate without banding, so 1 x 256 RGBA8. |
| I-G6 | **Plate lines from one shared function.** `src/features/immersive/plaque-text.ts` gives "Step n of N" above the title of every sequence station and "Start" or "Last step" under the first and last; other plates show the title only. The scene uses it directly (the host's `describe` prop was removed at the merge), so the 2D rail can show the same words. | `plaque-text.test.ts`: one Start and one Last step per ordered path; every sequence numbered 1..N without gaps; step 1 is the first station clockwise from the room's entrance doorway (found by breadth-first search from the lobby) and later steps follow round the room without reversal; a continuation into another room passes through a doorway between the two. | Kicker in capitals with letter-spacing (removed: "no uppercase eyebrows"). |
| I-G7 | **Visited marking.** `controller.setVisited(ids)` adds the word "Visited" at the foot of each visited plate (right-aligned, 600 weight, full ink), the in-world form of the 2D visited marking. Resident rooms are redrawn at once; others when they next load. | Same kind of mark in both conditions is a 2D-side contract (see the 2D track). | A coloured tick or a tinted plate (rejected: colour would be a new accent near content). |
| I-G8 | **Lettering face.** The atlas reads the page's `--font-sans` token (Atkinson Hyperlegible Next), falling back to `--font-atkinson`, titles 700 and secondary lines 600; category signs in Title Case, no capitals or tracking. | The 2D page and the 3D lettering always use the same face. | The serif display face (removed with DR-022). |
| I-G9 | **Look-method telemetry contract.** The scene emits `inputMethodUsed(method)` (keys, drag, rmb, freelook, click; "list" through `controller.noteInputMethod`) for the first move of each navigation interval and on every switch of method after it; `controller.startNavigationInterval()` starts a new interval. (Changed at the merge from "once per method per interval"; see the merge section below.) | The event is optional on `SceneEvents`, so a host without a handler still compiles. | — |

### Rendering checks fixed in this package

- **C1 (residual change at rest).** Two renders of the same converged still view differed along
  thin edges (the skirting and door edges here; up to 274 pixels). Diagnosis with a per-frame probe
  (`stabilityDetail`): the composer's targets swapped roles every frame (three swaps per frame),
  and SMAA's edge and weight targets were never cleared (three 0.186.1 `SMAAPass` clears only when
  `clear` is set). With both fixed the flips remained, and with SMAA off every view was identical.
  SMAA now runs in motion only; at rest the 32-sample accumulation is the anti-aliasing. Measured:
  0 changed pixels over 98 viewpoints x 10 frames (was 29 of 98 failing).
- **C4 (hitches).** A room's lettering was drawn, read back and uploaded in one frame when it
  entered the resident set. It is now drawn item by item in slices of at most 5 ms per frame into
  the page data, and its pages are uploaded one per frame (`initTexture`) before the room's
  lettering is shown; the blank cards show meanwhile. Two GPU tours: 1 frame over 50 ms in the
  first (62.5 ms), 0 in the second, against 26 and 31 before (dev server; results document §6).
- **C12 (texture SSIM), not fixed.** Transcoding the colour maps to uncompressed RGBA8 instead of
  BC7 changed nothing (wall colour 0.9753 against 0.9746), so it was reverted. The GPU texels
  differ from the authored source by the UASTC + RDO encode itself: mean absolute error 0.95 (wall)
  and 0.90 (floor) sRGB levels, 81% of texels within ±1. The floor passes (0.9935); the wall fails
  because the plaster is nearly flat (standard deviation about 4 levels), where SSIM punishes the
  same ±1 error far more. The fix is a re-encode of the wall colour map without RDO (one
  `scripts/museum/build-textures.ts` run with KTX-Software 4.4.2, not installed on this machine).
  The normal and ORM maps are no longer loaded, so C12 now covers the two maps the finish uses.
- **C2 clipping.** The plate paper is white by design (F2) and exactly sRGB 255, which no
  tone-mapped surface reaches; the probe now counts it as paper, not as a clipped highlight.
- **C11.** The memory snapshots are now taken at the same place (the spawn view), so the same
  rooms are resident in each; before, the tours ended in different rooms and the counts differed.
- **Plaque contrast.** Plaques are now white on black ink at every wall, so the imbalance between
  traditions at 2.5 m cannot arise from lighting.

## Wayfinding and Intuitive Navigation (package 3D-B)

The lead asked whether the 3D world is intuitive to navigate ("it should be"). This package adds
the in-world wayfinding the plan names and measures it with a scripted novice on the GTX 1650.
Everything is derived from the compiled manifest (`src/features/immersive/wayfinding.ts`) with no
wing, tradition or room key.

| ID | Decision | Evidence | Alternatives |
|---|---|---|---|
| I-W1 | **Numbered process plaques.** Every sequence station's plate carries "Step n of N" above the title in full ink, and "Start" or "Last step" under it on the first and last stage (`plaque-text.ts`, shared wording with the 2D rail). | GPU render: card titles at the approach point at least 20.14:1; the step line on the sampled stations at least 7.46:1 (WCAG AA 4.5:1). A unit test locks the hanging order: step 1 is the first station clockwise from the room's entrance doorway, the steps follow round the room with no gap or reversal, and a sequence that runs on into another room passes through a doorway between the two (`plaque-text.test.ts`). | Step numbers in the HTML rail only (rejected: the room itself would not show where a sequence starts). |
| I-W2 | **Lobby: a directory, not a symmetric lobby.** The spawn view looks through the lobby's only doorway, so the directory hangs on the first wall that view meets, on the spawn axis, facing the spawn and framed by the doorway. One equal-size row per wing in canonical (slug) order, which is also the wings' order along the hall, then the shared commons. Each row gives the destination's name (its zone label, as on the door signs) and the doorway that leads there, said from where the reader stands ("Second doorway on the right", "Behind you, on the right"). Rows are unlit white paper with black ink: 11.7 to 15.1:1 measured at 3.5 m. | Symmetric wing portals were attempted on paper and rejected as not clean: (1) the stored study manifest would have to be recompiled and republished in the shared database, and a published manifest is pinned to its study; (2) with three wings, any symmetric axis lands on the middle wing's doorway, which centres one tradition in the spawn view, the salience problem the rule exists to prevent; (3) the layout tests sit outside this package. The lead's fallback ("a directory wall only") applies. | A directory on the lobby's own north wall (rejected: the doorway is at the centre of that wall, so a plate there cannot face the spawn). |
| I-W3 | **Clicking a sign you cannot read walks you up to it.** Clicking the directory from outside its room walks the visitor to its reading point, facing it: 3.5 m away, or further when the view is too narrow for the rows (a phone). Clicking a row in the hall walks the visitor through that row's doorway. | The novice's first click is the directory (it is the focus of the spawn view); from 11 m its rows are 20 px tall and unreadable. At 390 px the reading point moves back so all four rows fit the view. | Clicking an unreadable row walks into that wing (rejected: the visitor could not know which wing they chose). |
| I-W4 | **Clickable doorways.** A click on a door sign, on a doorway's frame (within 0.3 m of the opening, below the lintel top) or on a directory row walks the visitor through the doorway, ending 2 m inside the far room and facing into it; the cursor shows a pointer over them. `controller.walkThroughDoorway(portalId, toRoomId)` is also on the bridge for a host doorway list. | Unit test: every doorway, in both directions, has a walkable target inside the far room, reachable from the near side, facing into the room. A click through the open doorway onto the far floor already walked there. | — |
| I-W5 | **Door signs readable from mid-room.** One size for every doorway: 2.2 x 0.46 m, the room name at 0.15 m (L1 from 6 m), the zone line at 0.106 m (L1 from 4.4 m). The sign runs 0.35 m onto the wall either side of a 1.5 m opening, inside the compiler's 0.6 m door clearance. | Walkthrough run 1: at 0.1 m the names were legible only from about 4 m, so a visitor stepping into a 14 x 18 m wing room could not read which doorway led on and tried rooms at random (3 wrong turns). GPU plaque contrast at 2.5 m: at least 20.38:1 over 54 plaques (was 13.77:1). Long names fit: the zone line wraps to two lines, the room name to two when there is no zone line. | Larger type on the existing 1.4 m sign (rejected: "Tradition and Context" no longer fits on one line). |
| I-W6 | **Brisk pace on long click-to-walk routes.** A route walks at the keys' Shift pace (2.3 m/s) and eases to the walking pace (1.35 m/s) over the last 3 to 8 m; short routes stay at the walking pace. | The 63 m walk from the directory to the far wing took 45 s at the walking pace; it takes 31 s now. Unit test on `stepVisitor`. | A faster pace (rejected: comfort, and it would hide the distance asymmetry below rather than fix it). |
| I-W7 | **Visited marking.** `controller.setVisited(exhibitIds)` puts a quiet "Visited" at the foot of each visited plate, the in-world form of the 2D visited links. | Screenshot in package 3D-A. | — |
| I-W8 | **No in-world image planes in study builds.** `IN_WORLD_IMAGES = false` in `scene-model.ts`. The compiler may declare an image surface; the scene model reports it as not drawn whatever its licence or review state, and the renderer has no image-plane path. Images appear only inside the KnowledgeSheet (DR-020 addendum). | `image-planes.test.ts` compiles the study manifest with a reviewed, licensed figure for one concept of each tradition, then checks the report, the built museum's meshes, materials and textures, and that no vertex lies on an image surface. | — |
| I-W9 | **Look-method telemetry.** The bridge emits `inputMethodUsed(keys, drag, rmb, freelook, click, list)` on the first move of a navigation interval and on each switch of method (package 3D-A, switch rule set at the merge). Clicks on signs and doorway frames count as "click". | — | — |

### Novice Walkthrough (GTX 1650, Default Controls Only)

A scripted visitor using only the default controls: clicks on the floor, an exhibit or a sign, and
drag-look. It reads only the words on screen that are unoccluded and large enough to read
(`probe.textRects`). Each task card names a concept and its tradition and section, as the 2D task
does. The steps: start at the spawn, find the concept, open it, open a citation, go to the next
step, finish. Times run from the first frame at the spawn; a wrong turn is a room entered that is
not on the shortest doorway path. The script, the logs and the screenshots are kept in the step 3
3D-B scratch folder.

| Run | Target (mid-sequence step) | Open (s) | Next step (s) | Finish (s) | Clicks | Drags | Wrong turns | Directory to wing doorway (s) |
|---|---|---|---|---|---|---|---|---|
| Before the fixes | Ajrakh, step 6 of 14 | 92.9 | 99.7 | 100.2 | 9 | 27 | 3 | 7.4 |
| After | Ajrakh, step 6 of 14 | 43.6 | 50.3 | 50.9 | 8 | 5 | 0 | 5.9 |
| After | Machilipatnam Kalamkari, step 6 of 12 | 52.3 | 59.0 | 59.6 | 7 | 5 | 0 | 19.3 |
| After | Sanganeri, step 6 of 12 | 68.5 | 78.2 | 78.8 | 8 | 5 | 0 | 31.4 |

Each run's clicks include three for the citation, the sheet's next-step pager and Finish.

**Friction found and fixed:**
1. The lobby had nothing to read, so the visitor turned round looking for a sign. Fixed by the
   directory (I-W2) and the walk-up (I-W3).
2. In a wing room the far door signs could not be read, so the visitor tried rooms at random.
   Fixed by I-W5.
3. Long walks down the hall. Shortened by I-W6.

**Open finding for the lead (gate 1):** the wings are not equally far from the entrance. From the
directory to each wing's doorway takes 5.9 s (Ajrakh), 19.3 s (Machilipatnam Kalamkari) and
31.4 s (Sanganeri). The compiler lays the wings out in slug order along a 91.5 m hall and puts the
lobby at its west end. This is a wing-order effect on navigation time, not on content. It is
already a stated limitation (DR-019), and it is now measured. Making it equal needs a compiler
change (the lobby centred on the wing span, with two doorways either side of the directory) and a
republished manifest, which is outside this package. The alternatives are counterbalancing wing
order across participants, or reporting time-to-wing per tradition as a covariate.

**Remaining friction, not fixed:**
- In the target room the novice made five 60-degree turns before the target plate was close
  enough to read. The plates keep the 2.5 m reading design; the "Start" plate marks where the
  sequence begins.
- On a 390 px phone the directory's direction line renders at about 8 px at the reading point,
  because the L1 rule is set for 1280 x 800.
- The walkthrough ran on the dev server, so its times include compile-on-visit stalls. It is a
  relative measure: before against after, and wing against wing.

## Merge of the 2D and 3D Tracks: Contracts Wired

**Question.** How do the two tracks' scene contracts meet in the one museum host
(`src/components/museum/museum-app.tsx`) without changing what either condition shows?

| Decision | Reason | Alternative rejected |
|---|---|---|
| **Input-method reports are switches.** The scene reports the first move of each navigation interval and then every change of method (keys, drag, rmb, freelook, click, list); a run of one method is one report. The host logs each report as `input_method_used` with the method before it as `previous`, and calls `startNavigationInterval()` when a concept closes. Rail and Plan rows report "list" through `noteInputMethod`. | The telemetry contract (2D track) defined the event as a switch, and the host infers keyboard against scene as the navigation source of a room entry from the latest method. With "first use per interval" the latest report could be stale (keys, then drag, then keys again reports nothing for the second keys run). The switch stream still gives the per-interval set: every interval starts with a report. | Keeping "once per method per interval" and logging a second event for the source (rejected: two events for one fact). |
| **Visited marks follow the rail's state.** The host keeps one visited set (the rail's marks) and mirrors it with `controller.setVisited` whenever it changes and after a scene reload, instead of calling the controller inside a state updater. | One source of truth for both marks; a reloaded scene (a new attempt) gets its marks back. | — |
| **Exhibit framing clears the rail.** New `controller.setRailInset(fraction)`: while a panel is docked, the exhibit is framed at the centre of the free area between the PlaceRail and the panel. With no panel open the lens is never shifted, so showing or hiding the rail moves nothing while the visitor walks. The host measures the rail's width when it is shown (docked or drawer) and on resize. | With the rail open an exhibit could be framed partly behind it (2D-B contract need). | Shifting the view whenever the rail is shown (rejected: the whole scene would jump when the rail is toggled). |
| **Plate lines.** `plaqueText` is called by the world itself, so the host's unused `describe` prop is removed from the canvas and the scene. | One source for the plate lines in both conditions. | — |
| **Rail doorway rows walk through the doorway** (`walkThroughDoorway`, falling back to `walkToRoom`), the same walk a click on the doorway makes. | The visitor ends inside the next room facing into it, as with the scene's own doorway click. | — |
| **The 3D practice room carries the practice instruction and a practice citation.** The first panel line is `PRACTICE_TEXT.tryControls.immersive`; the practice statements cite the same platform practice source the 2D practice cites, so the instruction "open a citation number" can be followed in both. | 2D-D left the 3D line to the merge; without a citation the 3D practice could not practise the marker. | — |
| **The lettering reads `--font-atkinson`** as its fallback; the `--font-inter` and `--font-source-serif` aliases are removed from `globals.css`. | 2D-A contract need. | — |

**Equivalence check.** Content: unchanged (no claim, title or plate wording changed; the practice
room is not learning content). Exposure and timing: unchanged. Citation access: unchanged in the
study; the 3D practice now practises it as the 2D practice does. Ease once a concept is open: the
exhibit is framed clear of the rail, so the sheet and the exhibit are not covered; no sheet change.
Natural navigation only: no new control. Tradition salience: unchanged; the wing-distance finding
above stays open. Telemetry: `input_method_used` keeps its name and fields; its rule is now stated
as "first move of an interval, then each switch", and its registry description says so.

## Review Fix Round: Wayfinding Words, Walking Through Doorways, Plates

**Question.** Which of the review's 3D findings can be fixed without a change to the building
scheme, and what stays open?

| Decision | Reason | Alternative rejected |
|---|---|---|
| **Directory directions are said by wall:** "Far wall, first doorway to the right", "Entrance wall, to the right". The far wall is the directory's own, the entrance wall the one the visitor came through; left and right are as one enters, which is also as one reads the directory. | Novice walkthrough: "First doorway on the right" and "Behind you, on the right" only made sense while facing the directory. Naming the wall keeps a direction true after the visitor turns away. | Compass words (rejected: the museum has no north for a visitor). |
| **A click on the next room's wall or sign, seen through a doorway, walks through that doorway** (`doorwayToRoomSeen`: the hit is read 0.2 m back towards the visitor; of several doorways into that room, the one nearest the line of sight). Unit test: every doorway in both directions, clicked from the walk-through point on the far wall straight through it. | The review clicked the far wall through a doorway and nothing happened; only the frame, its sign or a plaque responded. | Walking to the clicked wall point (rejected: a wall point is not walkable; the doorway walk already ends inside the room, facing into it). |
| **No "Visited" on the plates** (`PLATE_VISITED_MARK = false`; DR-021 Addendum B). The plate keeps its title, step and Start or Last step lines. | The full-ink word was a stronger, always-visible revisit cue in 3D only. | None. |
| **The museum's height comes from CSS** (flex column, `flex-1 min-h-0`), so a notice that arrives after the museum mounts never pushes the scene or the strip off screen. | Soft navigation from Explore left the root scrolled by 40 px (review). | None. |

**Not changed in this round (recorded, minor).** The visitor still arrives at the hall directory
facing it (a); the Plan still shows numbers without names or a facing arrow (d); the "Step n of N"
line keeps its size (e); a plaque clicked through a doorway still takes a long walk and arrives at
an angle (f); and the finish items (plinths, lobby, plaster specks, baked lighting variation) are
as they were. Each needs a scene or Plan change with rendering re-baselines on the GTX 1650 and
Iris Xe; they are listed for the next 3D package. The wing distances stay open (DR-023 Addendum B).

**Equivalence check.** Content: unchanged. Exposure and timing: unchanged. Citation access:
unchanged. Ease once a concept is open: unchanged. Natural navigation only: the doorway click is 3D
navigation (the manipulated variable) and adds no control; the directory words are wayfinding copy,
not content. Tradition salience: the directory rows keep equal size and canonical order; the
wing-distance confound is unchanged and open. Telemetry: a walk through a doorway seen beyond is a
click (`input_method_used` "click") with the same room-entry events as any doorway walk.
