# Immersive rendering quality: acceptance specification

Status: binding for every `/learn/immersive` build. Owner: tech lead. Added 2026-10-14
at the project lead's request: "no rendering issues, flickering, distorted and unnatural
lighting, lagging".

Why it matters scientifically: a visual defect that appears only in the 3D condition
(flicker, glare, lag) is an uncontrolled difference between conditions. It could
change learning outcomes, cognitive load and usability scores for reasons that have
nothing to do with spatial organisation. Rendering quality is part of experimental
validity, not polish.

A 3D build is accepted only when every automated check in section 3 passes for both
tiers (high on the reference lab desktop; low on the low-spec target or a throttled
browser, check C9), and the measured numbers are recorded in the release notes.
"Looks fine" is not evidence.

---

## 1. Defect classes: cause, prevention rule, check

| Defect | Typical cause | Prevention rule | Automated check (section 3) |
|---|---|---|---|
| **Flicker / z-fighting** | Coplanar or near-coplanar overlapping faces; poor depth precision | No coplanar overlapping surfaces in compiled geometry (spatial-compiler validation). Decals and wall text sit ≥ 1.5 mm proud **and** use `polygonOffset` (factor/units −1…−2), the pattern already used in `virtual-walkthrough` (`Artwork.tsx`, `WallDecor.tsx`). Camera `near` = 0.05 m, `far` ≤ 150 m (keeps the depth range tight). | Static-camera frame stability (C1) |
| **Transparency flicker** | Sorting order of overlapping transparent meshes changes with the view | Avoid overlapping transparent surfaces. Use `alphaTest` cutouts instead of blending. Decals: `depthWrite: false` plus an explicit `renderOrder`. | C1 at every room viewpoint |
| **Shadow acne, peter-panning, shimmering shadows** | Wrong bias; shadow camera too large; shadow map moving with the camera | **Prefer baked lighting** (lightmaps/AO baked in Blender) for architecture. At most one dynamic shadow-casting light. If used: fitted shadow camera, `bias` and `normalBias` tuned and recorded, shadow-camera position snapped to texels so shadows don't "swim". No dynamic shadows on the low tier. | C1, C2 |
| **Texture shimmer / moiré** | Missing mipmaps; minification aliasing | Mipmaps on every texture (KTX2 with mip chain). Anisotropy 8–16 on desktop. Metre-based UVs (the reference's metre-UV box geometry) so tiling density is uniform. | C1 while panning slowly (C1b) |
| **Jagged edges** | No anti-aliasing | MSAA (`antialias: true`) or SMAA; device-pixel-ratio capped per tier (reference tiers: 1–2). | Visual baseline (C5) |
| **Distortion** | Stretched textures; wrong aspect on resize; extreme FOV | Vertical FOV 60–70°. Aspect updated on resize. Exhibit images keep their native aspect ratio (loader asserts it; artwork planes are sized from image metadata). No non-uniform scaling of textured meshes. | Aspect assertions (C6); C5 |
| **Unnatural lighting** (blown highlights, crushed blacks, colour casts, rooms lit inconsistently) | Missing colour management; arbitrary light intensities; no environment lighting | `outputColorSpace = SRGB`. Colour textures sRGB, data maps (normal/roughness/AO) linear. One tone mapper (`NeutralToneMapping`, as in the reference) with a **fixed exposure per study build**. Physically based light units with documented intensities. An environment map for PBR reflections. Hemisphere fill so no surface is pure black. | Luminance checks (C2), C5 |
| **Lighting that differs between knowledge zones** | Per-room hand tuning | Zones may differ in hue and material (architecture), but measured mean luminance must stay within tolerance across zones, so no zone is harder to read. | C2 cross-zone check |
| **Lag / stutter / hitches** | Too many draw calls; shader compilation on first view; large texture uploads mid-walk; per-frame allocations; GC pauses | Budgets in section 2. Precompile all shaders and upload textures **before** the "enter museum" step (reference `Precompile.tsx` pattern). Merge static geometry (`StaticMerge`) and instance repeated props. No allocations in `useFrame`. Stream assets ahead of the visitor, never on the critical path. | Frame-time trace (C3), C4 |
| **Pop-in / LOD flicker** | LOD switching without hysteresis | Avoid LOD in the study build unless the budget requires it; if used, add hysteresis and cross-fade. | C3 trace during walkthrough |
| **Visual change mid-session** | Adaptive quality tier switching while a participant is learning | The quality tier is chosen once at session start, **locked for the session**, and logged as a covariate in telemetry. No mid-session downgrades in study sessions; public demos may adapt. | Telemetry assertion (C7) |
| **Distracting effects** | Bloom, vignettes, film grain, heavy SSAO, animated decoration | No bloom, grain or decorative animation in `/learn/immersive` (master spec §9.3, §18). Ambient occlusion only if baked. | Config assertion (C7) |
| **WebGL context loss** | Driver resets, memory pressure | Handle `webglcontextlost`/`restored`: pause, restore state, log `CLIENT_ERROR`. Never show a frozen frame as if live. | Forced context-loss test (C8) |

## 1b. Finish quality ("no rough edges")

Added the same day: "no rough edges, everything is of high quality but is able to run
even on low spec system". Finish applies to the whole experience, not just pixels:

- **Geometry and materials:** bevelled or chamfered visible edges where real
  architecture would have them (baked into normal maps rather than extra triangles),
  no visible seams or gaps where walls meet floors, no texture seams, consistent texel
  density between neighbouring surfaces.
- **Loading:** a real progress indicator tied to bytes and steps, no blank canvas, no
  layout shift when the canvas appears, and no first-frame pop as materials finish.
- **Interaction:** clear hover and selection states, no camera snapping or jitter,
  smooth acceleration and deceleration, and collision that slides along walls instead
  of stopping dead.
- **Overlays:** HTML panels use the design tokens, are keyboard operable and readable
  over any background, and never cover the exhibit the visitor is reading.
- **Errors:** a designed fallback for unsupported WebGL, context loss and asset
  failure. Never a raw error or a frozen frame.

Every one of these is checked in the manual sign-off (section 3), and C5 covers the
visual ones.

## 2. Performance budgets

Two named tiers, each with its own budget. **Both must pass.** High quality comes from
the high tier, and the low tier proves the experience still works on weak machines.
The same content, zones, exhibits and interactions exist in every tier; only rendering
cost changes (shadow and AO method, anti-aliasing method, how many zones stay resident,
and render resolution **while the camera is moving**). Texture resolution and quality
never change between tiers: see §2d.

| Tier | Target machine (define exact models before the pilot) |
|---|---|
| **High** | Lab desktop with a mid-range GPU |
| **Low** | 4–5-year-old laptop with an integrated GPU, 8 GB RAM, Chrome with other tabs open |

### 2a. Low-spec budgets (must pass)

| Metric | Low tier |
|---|---|
| Frame time p95 / p99 | ≤ 33 ms / ≤ 50 ms (30 fps floor) |
| Draw calls per frame | ≤ 120 |
| Triangles in view | ≤ 400 k |
| GPU texture memory | ≤ 192 MB resident, achieved by GPU compression and zone streaming, **never by lowering texture resolution** (§2d) |
| JS heap | ≤ 250 MB |
| First download before interactive | ≤ 25 MB (compressed), further zones streamed |
| Render resolution | full native resolution at rest; may drop to ≥ 0.75× only while the camera moves, then re-renders sharp within 150 ms of stopping (§2d) |
| Shadows / AO | baked only; no dynamic shadows |

### 2b. Being a good browser citizen (all tiers)

- **Render on demand.** When nothing moves, stop rendering (R3F `frameloop="demand"`,
  invalidate on input, animation or loading). An idle museum must use ~0% GPU.
- **Pause when hidden.** Stop the render loop and audio on `visibilitychange` (tab in the
  background) and when the window loses focus during a study pause. Resume without
  a hitch.
- **Respect the machine.** Pick the tier with a short GPU check at start-up (renderer
  string, a few-frame benchmark, `deviceMemory`, `hardwareConcurrency`), and honour
  `prefers-reduced-motion` and the OS low-power or data-saver hints. Study sessions
  lock the chosen tier and log it (section 1); public visits may step down if
  sustained frame time breaks the budget.
- **No waste.** Dispose geometries, materials and textures when a zone is unloaded. No
  per-frame allocations. No background timers or polling while idle. Load
  the 3D bundle only on `/learn/immersive` (dynamic import), so the 2D condition and
  public pages never pay for it.
- **Bounded downloads.** Meshopt-compressed GLB, KTX2 textures, HTTP caching with
  content hashes, and zone-by-zone streaming ahead of the visitor.

### 2d. Texture quality and definition are never compromised

Instruction from the project lead (2026-10-14): "never compromise with texture quality
and definition. We accommodate everyone." So:

- **One texture set for every tier.** Every exhibit, textile, block and wall texture
  ships at the same authored resolution and quality on every machine. No tier swaps
  in smaller textures, and no tier lowers mip bias or anisotropy below what the
  texture needs to look correct. Anisotropy is clamped only by what the GPU supports.
- **Low-spec machines are supported by other means:**
  - **GPU-compressed textures.** KTX2 with UASTC (high quality, chosen over ETC1S for
    exhibits and textile detail), transcoded to the GPU's native format. Same
    resolution, roughly 4–8× less GPU memory than uncompressed RGBA. Normal maps also
    use UASTC. Visual equivalence to the source is checked (C12).
  - **Streaming by proximity.** Textures for the visitor's current zone and its
    neighbours are resident at full resolution. Distant zones are unloaded and
    reloaded at full resolution ahead of the visitor (§2b). Memory budgets are met
    by what is resident, never by how sharp it is.
  - **Full-definition inspection.** Selecting an exhibit opens it at its full source
    resolution. Very large textile and archival images use tiled deep zoom, as the
    reference repo did with OpenSeadragon, so the full definition is available on any
    machine without loading it all into the GPU.
- **Sharp at rest.** Render resolution may fall to no less than 0.75× native only while the
  camera is moving, to keep motion smooth on weak GPUs. When the camera stops, the
  next frame renders at full native resolution (render-on-demand makes that one
  frame cheap). Anything a visitor reads or inspects is always seen at full definition.
- **No lossy shortcuts on content images.** Exhibit photographs and textile scans are
  never re-encoded below their source quality in the pipeline. The image that reaches
  the screen matches the curated asset.

### 2c. High-tier budgets (reference lab desktop)

The reference hardware must be named, and its GPU, driver and browser version recorded,
before the pilot. Until then, the defaults below target a mid-range integrated GPU.

| Metric | Budget |
|---|---|
| Frame time p95 during the scripted walkthrough | ≤ 16.7 ms (60 fps) |
| Frame time p99 | ≤ 25 ms |
| Frames > 50 ms after the scene becomes interactive | 0 |
| Draw calls per frame | ≤ 250 |
| Triangles in view | ≤ 1.5 M |
| GPU texture memory | ≤ 512 MB |
| Shader programs compiled after entry | 0 (all precompiled) |
| Time from "enter" to interactive | ≤ 8 s on the lab network |
| Input-to-frame latency (keyboard/mouse move) | ≤ 50 ms |
| JS heap growth over a 15-minute session | < 10% (no leaks) |

## 3. Verification protocol

Automated checks run in Playwright with a GPU-enabled Chromium against a production
build. They follow a **scripted camera path** that visits every zone, exhibit and
doorway in the compiled spatial manifest, and write a machine-readable report.

- **C1 Static-frame stability (flicker).** At each viewpoint, hold the camera still,
  render 30 consecutive frames, and pixel-diff each against the first. Pass:
  0 changed pixels (tolerance ≤ 0.01% for dithering). Any nonzero diff on a static
  camera is flicker by definition.
  - **C1b** repeats this with a slow yaw (0.1°/frame) and checks that frame-to-frame
    differences stay smooth (no isolated high-diff spikes = shimmer).
- **C2 Lighting/luminance.** Per viewpoint, compute the luminance histogram. Pass:
  clipped highlights (≥ 254) ≤ 0.5% of pixels; crushed blacks (≤ 2) ≤ 0.5%; mean
  luminance per zone within ±15% of the museum-wide mean.
- **C3 Frame-time trace.** Record `requestAnimationFrame` deltas and `renderer.info`
  (calls, triangles, textures, programs) along the whole path, and check against
  section 2.
- **C4 Hitch check.** No frame > 50 ms, and no increase in `renderer.info.programs`,
  after entry.
- **C5 Visual regression.** Baseline screenshots per viewpoint (deterministic: fixed
  seed, fixed DPR, fixed time). A diff above threshold needs human review and a new
  approved baseline. The reference repo's `visual-regression.mjs` approach can be adapted.
- **C6 Geometry and aspect assertions.** The loader asserts image-plane aspect equals
  source aspect (±0.5%), and that no textured mesh has non-uniform scale. The spatial
  compiler asserts no coplanar overlapping faces and no colliders that overlap
  walkable space.
- **C7 Study-mode configuration.** In a study session: tier locked and logged,
  post-processing list empty except anti-aliasing and tone mapping, exposure equal to
  the study build's recorded value.
- **C9 Low-spec run.** Repeat C1–C4 with the low tier forced, Chromium throttled
  (CPU ×4 slowdown, plus the low-tier hardware when available), and check against §2a.
- **C10 Idle and background cost.** With the camera still for 10 s, the frame count must
  stop increasing (render on demand). With the tab hidden, no frames are rendered.
  Measure CPU% in both states and record it.
- **C11 Memory and leaks.** Walk through all zones twice. After unloading, GPU texture
  and geometry counts return to their baseline, and JS heap growth is < 10%.
- **C12 Texture fidelity.** For every exhibit texture, compare the GPU-compressed
  texture with its source at full resolution (SSIM ≥ 0.98, and no visible block
  artefacts in a zoomed crop review). Assert that the low and high tiers load the
  **same** texture assets and dimensions. Assert that a stopped camera renders at
  native resolution within 150 ms.
- **C8 Context loss.** Force `WEBGL_lose_context`; the scene pauses, restores and logs
  `CLIENT_ERROR`.

Manual check on the reference hardware before each study release: a walk through every
zone at normal speed, checking flicker, shadow artefacts, colour, readability of
wall text, and comfort. Record GPU/driver/browser and sign off.

## 4. What gets reported

Every 3D release report includes the C1–C12 results with numbers (p95/p99 frame time,
max frame, draw calls, triangles, texture MB, luminance stats per zone, static-diff
counts), the hardware they were measured on, and any waivers with reasons. A
defect is not called fixed until the check that would have caught it passes.
