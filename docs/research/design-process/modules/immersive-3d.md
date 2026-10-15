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
| I-M5 | Door linings are derived from each portal's opening (two jambs and a head). They stand 12 mm proud of the wall and 30 mm into the opening. The jambs stop under the head lining. | No two coplanar same-facing faces overlap (test "builds door linings that never overlap each other"). | Jambs running to the lintel (found while writing the test: they overlapped the head lining with coplanar faces, a z-fighting risk). |

### I-R: rendering

| # | Decision | Rationale and evidence |
|---|---|---|
| I-R1 | **Renderer: WebGLRenderer with TAARenderPass accumulation at rest and SMAA, as the provisional choice.** The DR-014 decision rule needs the WebGPU+TRAA comparison measured on both backends. `scripts/museum/renderer-decision.ts` renders the same world (same textures, AO, lighting and unlettered cards) three ways: WebGL+TAA, WebGPU+TRAA, and WebGPU+TRAA forced onto its WebGL2 fallback. It measures C1, C1b and frame time. The run is **ready but not yet done**: the lead paused GPU measurement until the machine is quiet. The first attempt was interrupted and gave no valid numbers. | Reasons the WebGL path is provisional: it is the one that passes the C1 definition by construction. Once the 32 jitter samples are accumulated, three 0.186.1 TAARenderPass returns the stored accumulation unchanged (`TAARenderPass.js` `render()`), so a still view is pixel-stable. TRAANode jitters every frame (`TRAANode.js` `_haltonOffsets`, index advanced each frame), so stability at rest has to be measured, not assumed. The custom panel shader (`onBeforeCompile`) does not run under WebGPURenderer node materials, so the WebGPU path would also need the lettering shader ported to TSL. |
| I-R2 | Post-processing is TAA (at rest), then OutputPass (Neutral tone mapping, exposure 1.0, sRGB), then SMAA. Nothing else: no bloom, grain, vignette or SSAO. | C7 asserts the live pass list equals `STUDY_RENDER_CONFIG.postprocessing` (`src/components/museum/three/resources.ts`). SMAA runs on tone-mapped sRGB values (after OutputPass) and stays on at rest. This avoids an aliased first rest frame when accumulation starts from the aliased "hold" image. |
| I-R3 | No dynamic shadows on any tier. Contact shading comes from ambient occlusion baked from the manifest geometry. Floors and ceilings get a per-room AO map computed from the distance to every wall, post and plinth footprint. Walls, plinths and trims get one vertical AO profile. Ceilings add a constant bounce term (emissive). | Removes shadow acne, peter-panning and shimmer (spec §1). The bake is deterministic: a function of the manifest only. Lighting is the same in every zone: hemisphere 1.0, one non-shadowing key light of 1.2, RoomEnvironment PMREM at 0.8. That is the C2 cross-zone requirement. The first screenshots showed the ceiling as a dark brown lid; the bounce term fixed it. |
| I-R4 | Tiers are chosen once from the WebGL renderer string, `deviceMemory` and `hardwareConcurrency`. The choice is locked in `localStorage` under the telemetry session id and logged once (`render_quality_changed`, from `unset`). Tiers differ only in rest samples per frame (4 vs 2; both accumulate 32) and are otherwise identical: the same textures, resolution, DPR cap (2) and resident depth (2). | Spec §2d: texture quality never changes. Software renderers (SwiftShader, llvmpipe) get the designed fallback screen. The few-frame benchmark the spec mentions is **not implemented**; the tier heuristic uses the renderer string. |
| I-R5 | Render on demand: `frameloop="demand"`. A frame is requested only while the visitor moves, AA is converging or lettering is loading. A hidden tab, pause, onboarding, help or context loss sets the frameloop to `never`. | Unit test "reports no motion when the visitor is still". C10 measures idle and hidden frame counts. Resolution is never lowered in motion (render scale 1.0 always), so "sharp within 150 ms of stopping" holds by construction: every frame is full resolution. |
| I-R6 | All shaders are compiled and all textures uploaded before entry. `compileAsync` runs with one highlight and one route mesh present, `initTexture` is called on every material texture, and a full AA pass renders behind the loading screen. | C4 asserts no program count increase after entry. |

### I-T: textures and assets

| # | Decision | Evidence |
|---|---|---|
| I-T1 | Two CC0 Poly Haven sets: `beige_wall_001` (plaster: walls, lintels and ceilings) and `laminate_floor_02` (floor). Each has colour, OpenGL normal and ARM maps. | `public/museum/ASSETS.md` gives each asset page, source URL, author, the published md5 the pipeline verified, and the sha256 of every shipped file. |
| I-T2 | The authored resolution is 2048 x 2048 for every map on every tier. | The wall map covers 3.0 m (683 px/m) and the floor 1.7 m (1205 px/m). The densest demand is about 899 px/m: a wall at 1 m, 1080 px, 62 degree FOV (`scripts/museum/textures.config.ts`). |
| I-T3 | Encoding is KTX2 UASTC (quality 2), RDO lambda 0.5, Zstandard level 20 and a full mip chain (Lanczos, wrap). | Without RDO the six maps were 25.6 MB (file sizes of the first run), over the 25 MB first-download budget. With RDO they are 21,354,070 bytes (`ls public/museum/textures`). Encoder SSIM at level 0 is at least 0.9917 for every channel of every map, normals and ARM included (`analysis/out/museum/encode-report.json`). GPU-side SSIM is C12, which is pending. |
| I-T4 | GPU memory is computed at 4x (lead's correction: UASTC transcodes to 8 bits per pixel against 32 for RGBA8). Each 2048 x 2048 map with mips is 5,592,405 bytes. The six maps are 33.6 MB, against 134 MB as RGBA8. | Arithmetic: 2048 x 2048 x 4/3. |
| I-T5 | The lettering is a single-channel (R8) coverage atlas per room at 600 texels/m, built from the page's own fonts (Cormorant Garamond, Inter) and streamed with the room. The panel shader mixes paper and ink. | One byte per texel, against four for RGBA canvas textures. It uses the same typefaces as 2D. |
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
| P8 door signage | Each doorway carries a sign on each lintel face naming the room it leads to (and the zone, when it changes), readable from 2.5 m with a clear line of sight | 29 doorways, 58 of 58 sides signed and readable; smallest angle 0.03595 rad |
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
