# Immersive rendering: measured results

Companion to `immersive-rendering-quality.md` (the acceptance specification, checks C1–C12).
This document reports only what was measured, with the command that produced each number.
**Status: C1-C12 have been run on the high tier (GTX 1650), headless, against the development
server (section 4). After the matte-print change to the labels (section 4, "Plaques"), seven checks
pass and three fail (C1, C4, C12; C11 fails as written), with the numbers below. The low tier (Iris Xe,
CPU x4) and the DR-014 renderer decision are not run yet. A production-build run is still needed
before any number is quoted as final: the development server serves unminified code.**

## 1. Hardware and software on which the runs are prepared

| Item | Value | Source |
|---|---|---|
| Machine | Windows 11 Pro 10.0.26300, Intel Core i5-11300H (4 cores, 8 threads), 16 GB RAM | `Get-CimInstance Win32_Processor`, `Win32_ComputerSystem` |
| High-tier GPU | NVIDIA GeForce GTX 1650 (4 GB), driver 32.0.16.1742 | `Get-CimInstance Win32_VideoController` |
| Low-tier GPU | Intel Iris Xe Graphics, driver 30.0.101.1994 | same |
| WebGL renderer string seen by the app (high) | `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F9D) Direct3D11 vs_5_0 ps_5_0, D3D11)` | `window.__museumInfo().gpu` during development screenshots |
| Browser for the runs | Playwright Chromium build 1248 (156.0.8078.4), `--use-angle=d3d11`, `--force_high_performance_gpu` (high) or `--force_low_power_gpu` (low) | `node_modules/playwright-core/browsers.json`, `scripts/museum/gpu-browser.ts` |
| three / R3F | three 0.186.1, @react-three/fiber 9.8.1 | `package.json` |

The run records the browser version and renderer string itself (`environment` in each result file).

## 2. Measured so far (no GPU timing involved)

| Check | Result | Command / file |
|---|---|---|
| Texture set, one for all tiers | 6 KTX2 maps, all 2048 x 2048 with 12 mip levels, UASTC + Zstandard; 21,354,070 bytes in total | `npx tsx scripts/museum/build-textures.ts --ktx <ktx.exe>`; `public/museum/textures/index.json` |
| C12 (encoder side) | SSIM at level 0 per channel against the authored 8-bit source: wall colour 0.9925 to 0.9956; wall normal 0.9948 to 0.9978; wall ARM 0.9935 to 0.9996; floor colour 0.9991 to 0.9999; floor normal 0.9942 to 0.9995; floor ARM 0.9917 to 1.0000. All are at least 0.98. Normal and ARM (non-colour) maps are included, as the lead required. | `ktx create --compare-ssim` output, `analysis/out/museum/encode-report.json` |
| GPU texture memory (computed at 4x) | The 6 architecture maps take 33.6 MB as BC7/ASTC-class 8 bpp (5,592,405 bytes each with mips), against 134 MB as RGBA8. Lettering is R8 at about 5.6 MB per 2048 x 2048 page with mips, resident only for the visitor's room and rooms 2 doorways away. | arithmetic; measured resident totals come from C3/C11 (`textureBytes()`) |
| C6 (manifest side) | 0 non-uniform scales in the manifest (the compiler's `render.textures` check). 0 text overlaps or clipping over 351 text planes. Image planes are not drawn (licence unreviewed; reported per element). | `tests/unit/immersive/placement.test.ts`, `scene-model.test.ts` |
| Text placement and legibility (P1–P8) | See the module record, table I-P: one card band 1.55–2.25 m; 0 overlaps; maximum facing angle 0 degrees; smallest kicker angle 0.024209 rad (requirement 0.024033); 58 of 58 door-sign sides readable from 2.5 m. P4 even spacing: every gap between neighbouring cards on a run of wall is 1.20 m (spread 0.00 m over 87 walls), after compiler rule layout.even-spacing (spatial-compiler@1.1.0). Wayfinding order: 0 of 54 room pairs inverted against the 2D section order, after rule layout.template-order. Both are asserted in the test. | `npx vitest run tests/unit/immersive/placement.test.ts --reporter verbose` |
| Panel text equals the 2D read model | 254/254 concepts: identical claim text, order, citations, locators and quotes | `tests/unit/immersive/panel-content.test.ts`, `info-panel.test.tsx` |
| Production CSP and WASM | **Fails as shipped.** WebAssembly is blocked in the page and in blob workers by `script-src 'self' 'unsafe-inline'`, so the KTX2 transcoder cannot run in a production build and the museum shows its failure screen. With `'wasm-unsafe-eval'` added, both are allowed. | `npx tsx scripts/museum/csp-wasm-check.ts` and `FIX=1 ...` (headless Chromium) |
| Layout at 1280 x 800 and 390 x 844 | Screenshots checked by hand: the HUD, list, notes, the panel (side panel or bottom sheet), onboarding and door signs show no overflow or truncated titles after the fixes in the module record. The automated version is the e2e flow spec (not yet run). | headless Chromium with `?allowSoftware=1` against a development server |

## 3. Prepared and waiting for a quiet GPU slot

Run in this order, one server and one browser at a time, then fill in section 4. The steps use a
production build, with the CSP shared change applied first: without it the build cannot
transcode textures (section 2).

```bash
npm run build && npx next start -p 3000                                                    # one server
npx tsx --env-file=.env scripts/museum/renderer-decision.ts --gpu high                     # DR-014: C1, C1b, frame time for WebGL+TAA, WebGPU+TRAA, WebGPU(WebGL2 fallback)+TRAA
IE_GPU=1 npx playwright test -c scripts/museum/playwright.gpu.config.ts --project high     # C1-C12 + legibility contrast, high tier
IE_GPU=1 npx playwright test -c scripts/museum/playwright.gpu.config.ts --project low      # C9: Iris Xe, low tier, CPU x4
npx playwright test tests/e2e/immersive-flow.spec.ts                                       # functional flow, 2D/3D DOM text equality, 390/1280 layout
```

The first run writes the C5 baselines (`tests/e2e/immersive-baselines/<tier>/`, 640 x 360);
they need a human review before they count as approved.

Outputs: `analysis/out/museum/renderer-decision-high.json` and
`analysis/out/museum/rendering-high.json` / `rendering-low.json`, with every number below.

## 4. Results: High Tier, Headless on the GTX 1650

**How it was run.** `IE_MEASURE_ALL=1 IE_RUN_ID=<id> IE_GPU=1 PW_GPU=1 PORT=3300 node
node_modules/@playwright/test/cli.js test tests/e2e/immersive-rendering.spec.ts --workers=1`. The
table shows the run after the matte-print change (run id `wp8-fix-1792062394`, 27.8 min: 7 passed,
3 failed); the first run's values are given where they differ.

- **Browser and GPU.** Full Chromium 156.0.8078.4, headless (`playwright.config.ts`, PW_GPU=1).
  WebGL renderer `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F9D) Direct3D11 vs_5_0 ps_5_0,
  D3D11)`, drawing buffer 1280 x 622 at DPR 1.
- **Server.** The development server on port 3300, not a production build.
- **Output.** `analysis/out/museum/rendering-high.json` (git-ignored, regenerated by the command).
- **Measure-all mode.** `IE_MEASURE_ALL=1` keeps a failing check from skipping the later ones. The
  worker restarts after a failure and reloads the museum, so C3 to C8 ran on a fresh page.

| Check | Budget | High (GTX 1650, headless, dev server) | Status |
|---|---|---|---|
| C1 static frames, worst changed fraction over 98 viewpoints (30 frames each) | ≤ 0.01% | 0.0324% (258 px); 29 of 98 viewpoints above 0.01% (first run: 0.0304%, 27 of 98) | fail |
| C1b shimmer spikes (6 room views, 60 frames at 0.1°) | 0 | 0 | pass |
| C2 clipped / crushed pixels; zone mean deviation | ≤ 0.5% / ≤ 0.5%; ±15% | 0 / 0; at most 4.8% | pass |
| C3 frame time p95 / p99 (two full tours, 24 rooms each, about 105,000 frames each) | 16.7 / 25 ms | 7.1 / 7.2 ms and 7.1 / 7.3 ms (first run: 7.1 / 7.7 and 7.2 / 7.9) | pass |
| C3 draw calls / triangles (maximum) | 250 / 1.5 M | 101 / 45,118 | pass |
| C4 frames over 50 ms; programs compiled after entry | 0; 0 | 26 and 31 (maximum 83 ms); 0 (14 programs before and after). First run: 37 and 42, maximum 118 ms | fail (hitches) |
| C5 baseline difference (6 room views, 640 x 360) | ≤ 0.2% of pixels | at most 0.008% against the WP8 baselines; they include the "In This Room" overlay and need a human review | pass, baselines not approved |
| C6 non-uniform scale, transparent overlap | 0, 0 | 0, 0 (97 meshes) | pass |
| C7 tone mapping, exposure, passes, tier logged once | neutral, 1.0, TAA+output+SMAA, 1 event | neutral, 1, taa-accumulate + output + smaa, tier high, 1 event | pass |
| C8 context loss restores and logs | yes | restored (6 frames before, 26 after), 1 `webgl_context_lost` event | pass |
| C10 frames while idle 10 s / hidden 5 s | 0 / 0 | 0 idle (main thread 0.5% busy). Hidden is not measurable headless: minimising leaves the page "visible"; 0 frames | idle pass; hidden not measured |
| C11 counts after a second tour; heap growth | equal; < 10% | textures 70 to 69, geometries 93 to 92 (the tour ended with 3 resident rooms, not 4); heap -2.9% | fail as written (counts lower, not higher: no leak seen) |
| C12 GPU texture SSIM, 6 maps | ≥ 0.98 | wall colour 0.9746, wall normal 0.9784, wall ARM 0.9821, floor colour 0.9925, floor normal 0.9832, floor ARM 0.9837; native resolution always | fail (two wall maps) |
| Card title contrast at the approach point (23 exhibits) | ≥ 4.5:1 | minimum 10.34:1 (first run 9.19:1) | pass |
| Room plaque contrast at 2.5 m (54 plaques) | ≥ 4.5:1 | minimum 5.16:1. Lowest per study tradition: Ajrakh 5.16 (18 plaques), Machilipatnam Kalamkari 5.24 (18), Sanganeri 5.65 (14); the 4 shared-area plaques 5.91. From the spawn the minimum is 2.84:1, from room centres 1.19:1 (recorded, not asserted). First run, with glossy labels: minimum 4.16:1, two below 4.5 (Ajrakh 4.22, Machilipatnam Kalamkari 4.16; Sanganeri 4.53) | pass |

**What the failures mean.**

- **C1 and C4.** Small residual frame-to-frame change at rest (at most 0.03% of pixels) and hitches
  while walking. Both are 3D-only rendering costs, outside the 2D/3D interface parity checks.
  Whether the hitches come from the development server (unminified code, lettering atlas builds
  on room entry) needs a production-build run first.
- **C12.** The wall colour and normal maps lose a little more on the GPU than the encoder measured
  (0.99 and above). The KTX2 transcode target on this GPU should be checked.
- **Plaques (fixed).** In the first run two Tradition Context doorway plaques fell just under
  4.5:1 at the signage distance and Sanganeri's matching plaque did not: a small legibility
  difference between traditions, in 3D only. Close-up crops showed why. The low plaques face a
  room light, so the standard material's specular reflection added a veil of light to paper and
  ink alike; the lettering itself was the same. A brighter label light (emissive share 0.28 to
  0.40) was tried first and made it worse (minimum 3.96:1): the ink brightens with the light
  while the paper is already compressed by the tone mapping. The fix keeps the light and removes
  the specular terms from the label materials only ("matte print", `three/resources.ts`): every
  plaque now reads at least 5.16:1, and the lowest plaque of each study tradition is 5.16 to
  5.65. The same change applies to the unlettered stand-in cards, so lettering residency never
  changes a card's brightness. Interface parity check P26 now reads these plaques itself.
- **Low tier.** `PW_GPU=low` selects the Iris Xe with the same command, at CPU x4. It has not been
  run in this pass.

## 5. Known deviations, before measurement

- The tier choice uses the renderer string, `deviceMemory` and core count. The few-frame
  benchmark in spec §2b is not implemented.
- Render resolution is never reduced in motion. This is allowed (the spec says "may"), and it
  makes the 150 ms sharpness requirement hold by construction. If the low tier misses its
  frame-time budget, motion-time scaling is the first remedy.
- Architecture geometry and per-room AO maps stay resident for the whole visit: tens of
  kilobytes of geometry, AO at most 512 x 512 RGBA per room. Only the lettering, the dominant
  texture memory, is streamed and disposed per room.
