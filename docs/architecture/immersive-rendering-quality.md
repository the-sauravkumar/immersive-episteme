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
| **Flicker / z-fighting** | Coplanar or near-coplanar overlapping faces; poor depth precision (**UNVERIFIED** as stated: no primary source on depth precision was archived; the Khronos OpenGL wiki page refused download with HTTP 403. The acceptance criterion is our own measurement, C1) | No coplanar overlapping surfaces in compiled geometry (spatial-compiler validation). Decals and wall text sit ≥ 1.5 mm proud **and** use `polygonOffset` (factor/units −1…−2), the pattern already used in `virtual-walkthrough` (`Artwork.tsx`, `WallDecor.tsx`). [three] `src/materials/Material.js` L369–370: "Can be useful for rendering hidden-line images, for applying decals to surfaces". Camera `near` = 0.05 m, `far` ≤ 150 m (keeps the depth range tight: **UNVERIFIED**, same reason; our requirement is that C1 passes with these values). | Static-camera frame stability (C1) |
| **Transparency flicker** | Sorting order of overlapping transparent meshes changes with the view (**UNVERIFIED**: no primary source archived; our requirement is that C1 passes at every viewpoint) | Avoid overlapping transparent surfaces. Use `alphaTest` cutouts instead of blending. Decals: `depthWrite: false` plus an explicit `renderOrder`. | C1 at every room viewpoint |
| **Shadow acne, peter-panning, shimmering shadows** | Wrong bias; shadow camera too large; shadow map moving with the camera | **Prefer baked lighting** (lightmaps/AO baked in Blender) for architecture. [Epic-GPULM] § "GPU Lightmass Global Illumination": "GPU Lightmass (GPULM) is a light-baking solution that precomputes complex light interactions from lights which have their mobility set to Stationary or Static, and stores that data in generated lightmap textures that are applied to scene geometry." At most one dynamic shadow-casting light. If used: fitted shadow camera, `bias` and `normalBias` tuned and recorded. [three] `src/lights/LightShadow.js` L67–69: "Increasing this value can be used to reduce shadow acne especially in large scenes where light shines onto geometry at a shallow angle. The cost is that shadows may appear distorted." Shadow-camera position snapped to texels so shadows don't "swim" (**UNVERIFIED**: no primary source archived; our requirement is that C1b passes). No dynamic shadows on the low tier. | C1, C2 |
| **Texture shimmer / moiré** | Missing mipmaps; minification aliasing. [Epic-TSR] § "Moire Patterns": "the texture would use mipmaps for lower resolutions at farther distances mitigating any undesirable artifacts." | Mipmaps on every texture (KTX2 with mip chain). The format does not guarantee a full chain, so the pipeline must assert it. [KTX2] § "3.7. levelCount": "A KTX file does not need to contain a complete mipmap pyramid." Anisotropy 8–16 on desktop (our setting; no source gives these values). Anisotropic filtering fixes the blur that mipmapping causes at oblique angles; it is not itself a shimmer fix. [GL-ANISO] § "Overview": "mipmap filtering severely blurs images on surfaces angled obliquely away from the viewer." Metre-based UVs (the reference's metre-UV box geometry) so tiling density is uniform. | C1 while panning slowly (C1b) |
| **Jagged edges** | No anti-aliasing | MSAA (`antialias: true`) or SMAA; device-pixel-ratio capped per tier (reference tiers: 1–2). Prefer integer DPR values. [MDN-BP] § "devicePixelRatio and high-dpi rendering": "this will cause moire artifacts with non-integer values of devicePixelRatio". With TRAA (DR-014), MSAA must be off. [three] `examples/jsm/tsl/display/TRAANode.js` L18: "Note: MSAA must be disabled when TRAA is in use." | Visual baseline (C5) |
| **Distortion** | Stretched textures; wrong aspect on resize; extreme FOV | Vertical FOV 60–70° (**UNVERIFIED** as a sourced range: it is our design choice, checked through C5 and C6). Aspect updated on resize. Exhibit images keep their native aspect ratio (loader asserts it; artwork planes are sized from image metadata). No non-uniform scaling of textured meshes. | Aspect assertions (C6); C5 |
| **Unnatural lighting** (blown highlights, crushed blacks, colour casts, rooms lit inconsistently) | Missing colour management; arbitrary light intensities; no environment lighting | `outputColorSpace = SRGB`. Colour textures sRGB, data maps (normal/roughness/AO) linear. [glTF] § "3.9.2. Metallic-Roughness Material": "The base color texture MUST contain 8-bit values encoded with the sRGB opto-electronic transfer function". [glTF] § "3.9.3. Additional Textures": "The texture encodes XYZ components of a normal vector in tangent space as RGB values stored with linear transfer function." One tone mapper (`NeutralToneMapping`, as in the reference) with a **fixed exposure per study build**. Physically based light units with documented intensities. An environment map for PBR reflections. Hemisphere fill so no surface is pure black. | Luminance checks (C2), C5 |
| **Lighting that differs between knowledge zones** | Per-room hand tuning | Zones may differ in hue and material (architecture), but measured mean luminance must stay within tolerance across zones, so no zone is harder to read. (Our own requirement, measured by C2.) | C2 cross-zone check |
| **Lag / stutter / hitches** | Too many draw calls; shader compilation on first view; large texture uploads mid-walk; per-frame allocations; GC pauses. [MDN-BP] § "Batch draw calls": "“Batching” draw calls into fewer, larger draw calls will generally improve performance." [MDN-BP] § "texImage/texSubImage uploads (esp. videos) can cause pipeline flushes": "Most texture uploads from DOM elements will incur a processing pass that will temporarily switch GL Programs internally, causing a pipeline flush." [R3F-PIT] § "Don't re-create objects in loops", subsection "Bad news for the GC": "This creates a new vector 60 times a second, which allocates memory and forces the GC to eventually kick in." | Budgets in section 2. Precompile all shaders and upload textures **before** the "enter museum" step (reference `Precompile.tsx` pattern). [three] `src/renderers/WebGLRenderer.js` L1385–1386: "This is useful to precompile shaders before the first rendering." L3590–3591: "Useful for preloading a texture rather than waiting until first render (which can cause noticeable lags due to decode and GPU upload overhead)." Merge static geometry (`StaticMerge`) and instance repeated props. No allocations in `useFrame`. Stream assets ahead of the visitor, never on the critical path. | Frame-time trace (C3), C4 |
| **Pop-in / LOD flicker** | LOD switching without hysteresis. [three] `src/objects/LOD.js` L113: "Threshold used to avoid flickering at LOD boundaries, as a fraction of distance." | Avoid LOD in the study build unless the budget requires it; if used, add hysteresis and cross-fade. [Courrèges] § "G-Buffer Generation": "It’s not about performance, it’s about LOD transition: this dithering pattern makes opaque meshes look a bit transparent when they transition between LODs." | C3 trace during walkthrough |
| **Visual change mid-session** | Adaptive quality tier switching while a participant is learning | The quality tier is chosen once at session start, **locked for the session**, and logged as a covariate in telemetry. No mid-session downgrades in study sessions; public demos may adapt. | Telemetry assertion (C7) |
| **Distracting effects** | Bloom, vignettes, film grain, heavy SSAO, animated decoration | No bloom, grain or decorative animation in `/learn/immersive` (master spec §9.3, §18). Ambient occlusion only if baked. | Config assertion (C7) |
| **WebGL context loss** | Driver resets, memory pressure (**UNVERIFIED**: the WebGL spec does not name these causes). The spec names others. [WebGL] § "Detecting context lost events": "Occurrences such as power events on mobile devices may cause the WebGL rendering context to be lost at any time and require the application to rebuild it". [WebGL] § "Context creation parameters": "User Agents are very likely to decide to lose background high-performance contexts." | Handle `webglcontextlost`/`restored`: pause, restore state, log `CLIENT_ERROR`. [MDN-LOST] § "HTMLCanvasElement: webglcontextlost event": "The webglcontextlost event of the WebGL API is fired if the user agent detects that the drawing buffer associated with a WebGLRenderingContext object has been lost." The lost handler must call `preventDefault()`, or the restored event never arrives. [WebGL] § "The Context Lost Event": "The following code prevents the default behavior of the webglcontextlost event and enables the webglcontextrestored event to be delivered". Never show a frozen frame as if live. | Forced context-loss test (C8) |

## 1b. Finish quality ("no rough edges")

Added the same day: "no rough edges, everything is of high quality but is able to run
even on low spec system". Finish applies to the whole experience, not just pixels:

- **Geometry and materials:** bevelled or chamfered visible edges where real
  architecture would have them (baked into normal maps rather than extra triangles; note
  that [Nanite] § "Benefits of Nanite" advises the opposite for engines with virtualized
  geometry: "Use high-poly detailing rather than baking detail into normal map textures".
  three.js has no such system, so the triangle budgets in section 2 still govern),
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

**Status of the numbers.** Every budget in §2a and §2c is our own requirement, measured by
C3, C4 and C9–C12. None is presented as industry practice, and no external source was used
for any threshold. 16.7 ms and 33 ms are simply 1000/60 and 1000/30. The low-tier machine
description is a target definition, not a claim about typical hardware. GPU texture memory
cannot be read from the browser, so it must be estimated from the resident textures'
formats and dimensions. [MDN-BP] § "Estimate a per-pixel VRAM Budget": "WebGL doesn't
offer APIs to query the maximum amount of video memory on the system because such queries
are not portable."

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
  invalidate on input, animation or loading). [R3F-PERF] § "On-demand rendering": "you
  can opt into on-demand rendering, which will only render when necessary. This saves
  battery and keeps noisy fans in check." An idle museum must use ~0% GPU (our own
  requirement, measured by C10).
- **Pause when hidden.** Stop the render loop and audio on `visibilitychange` (tab in the
  background) and when the window loses focus during a study pause. Resume without
  a hitch. [MDN-VIS] § "Usage notes": "The transition to hidden is also a good point at
  which pages can stop making UI updates and stop any tasks that the user doesn't want to
  have running in the background." Browsers already throttle the loop in background tabs.
  [MDN-RAF] § "Window: requestAnimationFrame() method": "requestAnimationFrame() calls are
  paused in most browsers when running in background tabs or hidden <iframe>s, in order
  to improve performance and battery life."
- **Respect the machine.** Pick the tier with a short GPU check at start-up (renderer
  string, a few-frame benchmark, `deviceMemory`, `hardwareConcurrency`), and honour
  `prefers-reduced-motion` and the OS low-power or data-saver hints. Study sessions
  lock the chosen tier and log it (section 1); public visits may step down if
  sustained frame time breaks the budget. `deviceMemory` is coarse, so it cannot be the
  only signal. [MDN-MEM] § "Navigator: deviceMemory property": "The reported value is
  imprecise to curtail fingerprinting." [MDN-PRM] § "prefers-reduced-motion CSS media
  feature": "The prefers-reduced-motion CSS media feature is used to detect if a user has
  enabled a setting on their device to minimize the amount of non-essential motion."
- **No waste.** Dispose geometries, materials and textures when a zone is unloaded.
  [MDN-BP] § "Delete objects eagerly": "Don't wait for the garbage collector/cycle
  collector to realize objects are orphaned and destroy them." No per-frame allocations
  (see [R3F-PIT] in section 1). No background timers or polling while idle. Load
  the 3D bundle only on `/learn/immersive` (dynamic import), so the 2D condition and
  public pages never pay for it.
- **Bounded downloads.** Meshopt-compressed GLB, KTX2 textures, HTTP caching with
  content hashes, and zone-by-zone streaming ahead of the visitor.
  - [MESHOPT] § "Mesh compression": "Note: this compression scheme is available as a glTF
    extension". § "Vertex compression": "Compression ratio depends on the data; vertex
    data compression ratio is typically around 2-4x (compared to already quantized and
    optimally packed data)."
  - three.js 0.186.1 loads it. [three] `examples/jsm/loaders/GLTFLoader.js` L650:
    "EXT_MESHOPT_COMPRESSION: 'EXT_meshopt_compression',".
  - [KTX2] § "Abstract": "the possibility of streaming, through sending small mip levels
    first, universal textures using Basis Universal technology and supercompression."
  - Streaming as AAA practice: see DR-014 (Courrèges 2015; Nanite docs).

### 2d. Texture quality and definition are never compromised

Instruction from the project lead (2026-10-14): "never compromise with texture quality
and definition. We accommodate everyone." So:

- **One texture set for every tier.** Every exhibit, textile, block and wall texture
  ships at the same authored resolution and quality on every machine. No tier swaps
  in smaller textures, and no tier lowers mip bias or anisotropy below what the
  texture needs to look correct. Anisotropy is clamped only by what the GPU supports.
  [GL-ANISO] § "Overview": "Implementations are free to clamp the specified degree of
  anisotropy to the implementation's maximum supported degree of anisotropy."
- **Low-spec machines are supported by other means:**
  - **GPU-compressed textures.** KTX2 with UASTC (high quality, chosen over ETC1S for
    exhibits and textile detail), transcoded to the GPU's native format.
    - Transcoding: [KTX-GUIDE] § "KTX Artist Guide" (introduction): "KTX is compressed
      into a machine-friendly universal format, and is automatically translated at loading
      time into the optimal format for each hardware device."
    - UASTC over ETC1S: [KTX-GUIDE] § "Why use KTX?": "ETC1S offers greater compression
      and works better with large areas of solid colors or mostly monochromatic values; it
      doesn’t produce quality results on complex textures". Same section: "UASTC offers
      higher visual quality for high-contrast high-detail color textures."
    - Same resolution, about 4× less GPU memory than uncompressed RGBA (corrected from "4–8×"; see below).
      **Partly contradicted:** the source supports about 4×, not up to 8×, for UASTC at
      its high-quality targets. [BASISU] § "Supported Texture Compression/Supercompression
      Modes" describes UASTC LDR 4x4 as "An 8 bits/pixel LDR high quality mode."
      § "Supported LDR GPU Texture Formats" lists the target "ASTC LDR 4x4 L/LA/RGB/RGBA
      8bpp". Against 32-bit RGBA8 (4 channels × 8 bits) that is 4×. A ratio of 8× needs a
      4 bpp target such as BC1 or ETC1, which lowers quality. The memory budget (§2a)
      should be computed at 4×.
    - Normal maps also use UASTC. [KTX-GUIDE] § "Why use KTX?": "It works better with
      “packed” textures that have very different values in RGB channels, including
      Occlusion/Roughness/Metalness (ORM), Normal". **Sources disagree:** [MDN-BP]
      § "Consider compressed texture formats" says "compressed texture formats have worse
      quality than JPG, and are generally only acceptable for colors (not e.g., normals or
      coordinates)." MDN speaks of GPU formats in general; the Khronos guide is specific to
      UASTC. C12 must therefore cover normal maps too, not only colour textures.
    - Visual equivalence to the source is checked (C12). [KTX-GUIDE] § "Why use KTX?":
      "Authoring compressed GPU textures often requires more careful tuning to maintain
      image quality".
  - **Streaming by proximity.** Textures for the visitor's current zone and its
    neighbours are resident at full resolution. Distant zones are unloaded and
    reloaded at full resolution ahead of the visitor (§2b). Memory budgets are met
    by what is resident, never by how sharp it is. Comparable engine practice: [Nanite]
    § "How does Nanite work?": "Data is streamed in on demand so that only visible detail
    needs to reside in memory."
  - **Full-definition inspection.** Selecting an exhibit opens it at its full source
    resolution. Very large textile and archival images use tiled deep zoom, as the
    reference repo did with OpenSeadragon, so the full definition is available on any
    machine without loading it all into the GPU.
- **Sharp at rest.** Render resolution may fall to no less than 0.75× native only while the
  camera is moving, to keep motion smooth on weak GPUs. When the camera stops, the
  next frame renders at full native resolution (render-on-demand makes that one
  frame cheap). Anything a visitor reads or inspects is always seen at full definition.
  The technique is standard. [MDN-BP] § "Consider rendering to a smaller back buffer": "A
  common (and easy) way to trade off quality for speed is rendering into a smaller back
  buffer, and upscaling the result." The 0.75× floor is our own setting, and the 150 ms
  recovery is our own requirement, measured by C12.
- **No lossy shortcuts on content images.** Exhibit photographs and textile scans are
  never re-encoded below their source quality in the pipeline. The image that reaches
  the screen matches the curated asset. **Contradicted for in-scene textures:** KTX2/UASTC
  (above) is a lossy encoding. [KTX-GUIDE] § "glTF Texture Formats", KTX entry: "Good
  image quality. Lossy compression, can be blocky." In the 3D scene, a texture can
  therefore only approximate the curated asset, within the C12 tolerance. A literal match
  holds only for the full-definition inspection view, if it serves the source image.
  **Resolved by the lead:**
  - The literal rule applies to the full-definition inspection view, which serves the source
    image itself.
  - In-scene textures may use UASTC, provided each passes C12 visual equivalence against its
    source (SSIM ≥ 0.98 and no visible blocking).
  - Non-colour maps (normals and the like) are either kept uncompressed or included in C12 with
    a measured result.

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
  artefacts in a zoomed crop review). SSIM is a full-reference measure. [SSIM] p. 1
  (PDF p. 1): "we develop a Structural Similarity Index and demonstrate its promise through
  a set of intuitive examples, as well as comparison to both subjective ratings and
  state-of-the-art objective methods". p. 5 (PDF p. 5): "Unique maximum: S(x, y) = 1 if
  and only if x = y". Per-texture scores are means of local SSIM. p. 8 (PDF p. 8): "In
  practice, one usually requires a single overall quality measure of the entire image. We
  use a mean SSIM (MSSIM) index to evaluate the overall image quality". The 0.98 threshold
  is our own requirement; the paper sets no pass threshold. Assert that the low and high tiers load the
  **same** texture assets and dimensions. Assert that a stopped camera renders at
  native resolution within 150 ms.
- **C8 Context loss.** Force `WEBGL_lose_context`; the scene pauses, restores and logs
  `CLIENT_ERROR`. [WEBGL-LOSE] § "Overview": "This extension exposes new functions which
  simulate losing and restoring the WebGL context, even on platforms where the context can
  never be lost." [three] `src/renderers/WebGLRenderer.js` L605: "Simulates a loss of the
  WebGL context. This requires support for the `WEBGL_lose_context` extension."

Manual check on the reference hardware before each study release: a walk through every
zone at normal speed, checking flicker, shadow artefacts, colour, readability of
wall text, and comfort. Record GPU/driver/browser and sign off.

## 4. What gets reported

Every 3D release report includes the C1–C12 results with numbers (p95/p99 frame time,
max frame, draw calls, triangles, texture MB, luminance stats per zone, static-diff
counts), the hardware they were measured on, and any waivers with reasons. A
defect is not called fixed until the check that would have caught it passes.

## 5. Sources and verification

Inline citations use the keys below and give a locator and a verbatim quotation. Web pages
were accessed and archived on 2026-10-14. Every quotation was checked verbatim on its stated
page, section or source line:
- PDFs: `docs/research/tools/verify_quotes.py`, 6/6 passed.
- Web pages and code: a section-scoped check that imports the same `norm()`/`loose()`
  normalisation; for code it also strips JSDoc `*` prefixes. 59/59 passed.
- Negative controls (a correct quote placed under the wrong page or section) failed as
  expected.

Archive: the session scratchpad `rendering-cites/`, one file per source as named below.

| Key | Source | Archive file |
|---|---|---|
| three | three.js 0.186.1 source, `node_modules/three` (version pinned in `package.json`); file and line given inline | (local package) |
| Courrèges | Courrèges, A. (2015). "GTA V - Graphics Study". https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/ | `courreges2015.html` / `.txt` |
| Epic-GPULM | Epic Games. "GPU Lightmass Global Illumination in Unreal Engine". UE 5.8 docs. https://dev.epicgames.com/documentation/en-us/unreal-engine/gpu-lightmass-global-illumination-in-unreal-engine | `epic-gpulightmass.html` / `.txt` |
| Epic-TSR | Epic Games. "Temporal Super Resolution in Unreal Engine". UE 5.8 docs. https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-in-unreal-engine | `epic-tsr.html` / `.txt` |
| Nanite | Epic Games. "Nanite Virtualized Geometry in Unreal Engine". UE 5.8 docs. https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine | `epic-nanite.html` / `.txt` |
| TAA survey | Yang, L., Liu, S. & Salvi, M. (2020). "A Survey of Temporal Antialiasing Techniques". *Computer Graphics Forum* 39(2), 607–621. doi:10.1111/cgf.14018. Author's accepted version, linked from https://research.nvidia.com/labs/rtr/publication/yang2020survey/: http://behindthepixels.io/assets/files/TemporalAA.pdf (cited in DR-014) | `yang2020-taa-survey.pdf` |
| SSIM | Wang, Z., Bovik, A. C., Sheikh, H. R. & Simoncelli, E. P. (2004). "Image Quality Assessment: From Error Visibility to Structural Similarity". *IEEE Trans. Image Processing* 13(4), 600–612. Authors' preprint, https://www.cns.nyu.edu/pub/lcv/wang03-preprint.pdf (page numbers are the preprint's) | `wang2004-ssim.pdf` |
| KTX2 | Khronos. "KTX File Format Specification" (2.0). https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html | `ktx2-spec.html` / `.txt` |
| KTX-GUIDE | Khronos 3D Formats Guidelines. "KTX Artist Guide". https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md | `ktx-artist-guide.md` |
| BASISU | Binomial. Basis Universal README. https://github.com/BinomialLLC/basis_universal (master README) | `basisu-README.md` |
| MESHOPT | Kapoulkine, A. meshoptimizer README. https://github.com/zeux/meshoptimizer (master README) | `meshoptimizer-README.md` |
| glTF | Khronos. "glTF 2.0 Specification". https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html | `gltf2-spec.html` / `.txt` |
| WebGL | Khronos. "WebGL Specification" 1.0 (latest). https://registry.khronos.org/webgl/specs/latest/1.0/ | `webgl1-spec.html` / `.txt` |
| WEBGL-LOSE | Khronos WebGL extension registry. "WEBGL_lose_context". https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/ | `webgl-lose-context.html` / `.txt` |
| GL-ANISO | Khronos OpenGL registry. "EXT_texture_filter_anisotropic". https://registry.khronos.org/OpenGL/extensions/EXT/EXT_texture_filter_anisotropic.txt (the WebGL wrapper, `webgl-anisotropic.html`, defers to it) | `gl-ext-anisotropic.txt` |
| MDN-BP | MDN. "WebGL best practices". https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices | `mdn-webgl-best-practices.html` / `.txt` |
| MDN-LOST | MDN. "HTMLCanvasElement: webglcontextlost event". https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event | `mdn-webglcontextlost.html` / `.txt` |
| MDN-RAF | MDN. "Window: requestAnimationFrame() method". https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame | `mdn-raf.html` / `.txt` |
| MDN-VIS | MDN. "Document: visibilitychange event". https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event | `mdn-visibilitychange.html` / `.txt` |
| MDN-MEM | MDN. "Navigator: deviceMemory property". https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory | `mdn-devicememory.html` / `.txt` |
| MDN-PRM | MDN. "prefers-reduced-motion". https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion | `mdn-reduced-motion.html` / `.txt` |
| R3F-PERF | pmndrs. React Three Fiber docs, "Scaling performance", tag v9.8.1 (the installed version). https://github.com/pmndrs/react-three-fiber/blob/v9.8.1/docs/advanced/scaling-performance.mdx | `r3f-scaling-performance-v9.8.1.mdx` |
| R3F-PIT | pmndrs. React Three Fiber docs, "Performance pitfalls", tag v9.8.1. https://github.com/pmndrs/react-three-fiber/blob/v9.8.1/docs/advanced/pitfalls.mdx | `r3f-pitfalls-v9.8.1.mdx` |

Not archived: the Khronos OpenGL wiki pages "Depth Buffer Precision" and "Transparency
Sorting" (HTTP 403). The claims that would have rested on them are marked **UNVERIFIED** in
section 1.
