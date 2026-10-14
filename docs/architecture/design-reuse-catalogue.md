# Design reuse catalogue: what Immersive Episteme takes from `virtual-walkthrough`

Status: proposal, 2026-10-14. Owner: tech lead.

**Scope rule.** `D:/Work/IIT-KGP/virtual-walkthrough` is a separate project, a hand-block-printing virtual museum (Next.js 16 + R3F). We do not extend it, fork it or inherit its architecture. It is a read-only reference. This document lists the design components (tokens, typography, UI primitives, 3D building blocks, materials and lighting, a11y patterns and small utilities) that fit Immersive Episteme and can be copied or re-implemented here.

Unless stated otherwise, all source paths are relative to the reference repo root. The 3D paths are relative to `src/museum/`. The reference was not modified.

Verdict key:
- **LIFT**: copy almost verbatim, after the licence check in section 6.
- **ADAPT**: re-implement against our props, stores and manifest, keeping the visual spec and algorithm.
- **SKIP**: do not reuse.

Effort key: **S** is under half a day, **M** is 1 to 2 days, **L** is 3 or more days.

---

## 1. Summary

1. **Most of the value is in the visual language.** That means:
   - the warm paper, ink and madder palette;
   - Cormorant Garamond for titles and long reading text, Inter for chrome;
   - one easing curve;
   - a few CSS primitives: panel, kicker, button, icon button, kbd, switch, the focus ring and the reduced-motion rules.

   These become our Tailwind v4 `@theme` plus a shadcn semantic layer (section 2). **Both learning conditions use the identical token set**, so palette and typography cannot become a confound.
2. **Almost no React UI component can be copied as-is.** Nearly all of them read the museum Zustand store (`useMuseum`), the museum content arrays (`ARTWORKS`, `EXHIBITS`, …) and the museum i18n. We rebuild them as props-driven shadcn/Radix components that reproduce the visual spec. The most valuable shells are:
   - InfoPanel, a side panel that becomes a bottom sheet, plus its `ViewModel`;
   - HelpOverlay;
   - WebGLUnsupported;
   - ProximityPrompt;
   - Minimap;
   - the EntryScreen progress bar.
3. **The 3D layer has many generic building blocks.** Examples:
   - geometry and kit: metre-UV box geometry, `StaticMerge`, the `Builder` part-merging kit, the `GLTFModel` loader;
   - materials: procedural PBR textures;
   - lighting: the SpotPool fixed-light pool;
   - navigation: the AABB collision resolver, the visibility-graph path planner, `VisitorController`;
   - other: zone culling, quality tiers, the async shader precompile.

   The reference's *layout* is hardcoded TypeScript constants. Its *types* (`WallBox`, `Zone`, `DisplaySurface`, door-split helpers) are good prior art for the spatial compiler's output manifest.
4. **There is no reusable content.** Every artwork, block, panel, film and artisan in the reference is an explicit placeholder. Nothing there can seed the knowledge graph.
5. **There is no LICENSE file** in the reference repo, and `package.json` has `"private": true` and no `license` field. Code reuse needs written confirmation from the repo owner (see Q1 in section 6.4). Until then, treat the code as a pattern to re-implement. Only the Poly Haven models are clearly reusable (CC0).
6. **Decorative motion must stay out of `/learn/*`.** This covers the arrival flight, turntables, sway, pulse/heart/sheen keyframes, time-of-day moods, ambient audio and photo mode. The reference already gates most of these on `reducedMotion`. In the learning routes we force that flag on.

---

## 2. Design tokens to port

### 2.1 Core palette (`src/styles.css:6-23`, `:root`)

Contrast ratios below come from the token audit.

| Token (source) | Value | Role | Contrast |
|---|---|---|---|
| `--paper` | `#f5f1e8` | page/panel base | — |
| `--paper-2` | `#efe9df` | body background, `themeColor` (`app/layout.tsx:41-46`) | — |
| `--ink` | `#2b2621` | text | 13.29:1 on paper |
| `--muted` | `#6f665c` | secondary text, kickers | 4.99:1 on paper; 4.66:1 on paper-2 (AA) |
| `--accent` | `#8a5a3b` | madder-brown primary | 5.17:1 on paper |
| `--accent-ink` | `#fbf7f0` | text on accent | 5.45:1 on accent |
| accent hover (`styles.css:212-215`) | `#744a2f` | button hover | 7.12:1 with `#fbf7f0` |
| `--hairline` | `rgba(43,38,33,0.14)` | dividers | — |
| `--hairline-strong` | `rgba(43,38,33,0.24)` | ghost button, kbd borders | — |
| `--panel` | `rgba(245,241,232,0.8)` | translucent panel over canvas | — |
| `--panel-solid` | `rgba(245,241,232,0.94)` | no-backdrop-filter fallback | — |
| `--shadow` | `0 1px 2px rgba(43,38,33,.06), 0 12px 32px -12px rgba(43,38,33,.22)` | panels | — |
| `--blur` | `saturate(1.2) blur(14px)` | panel backdrop | — |
| `--ease` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | museum UI easing (we adopt it as our only curve) | — |
| `--radius` / `--radius-sm` | `6px` / `4px` | panels / buttons, kbd | — |
| `--edge` | `18px` (12px at ≤640px) | overlay gutter (`:29,40-44`) | — |

Recurring hard-coded values:
- `#3a332c`: serif reading text.
- `#fbf8f2`: card or thumbnail well.
- `#fbf8f1`: travel-fade white.
- `rgba(43,38,33,0.05–0.07)`: hover fills.
- `rgba(43,38,33,0.9)`: tooltip background.
- A second easing curve, `cubic-bezier(0.2, 0.7, 0.2, 1)`, is used by the admin (`admin.css:31`) and the inspect modal (`InspectModal.css:44,114`). We do not port it.

**Categorical colours** (`src/museum/ui/entry.css:77-107`; these are the fills of the animated block-stamp SVG on the entry screen, cloth at `:78`): madder `#a34a33`, indigo `#34506e`, wood `#9b6a45`, dark wood `#6e472c`, cloth `#f8f2e6`. These are candidates for tradition or category colour-coding, for example in the concept-map editor and on the research console.
- **Rule:** never use colour as the only cue.
- **Rule:** reserve yellow for the optional guidance cue (requirements digest §9).

**Semantic colours** (`src/admin/admin.css:3-31`): `--danger #9b3326`, `--ok #3d6b45`, `--warn #7a5716`, `--paper-3 #e7dfd2`, `--card #fbf8f2`, `--field #fffdf9`. Admin radii are `10px` / `7px`.

Two traps in the admin set:
1. `--faint #7d7368` is commented as AA (`admin.css:11`), but it computes to **4.12:1** on `#f5f1e8`, which fails AA. Do not use it for text.
2. Admin `--accent-ink` means *dark accent* (`#6f4429`). Museum `--accent-ink` means *text on accent* (`#fbf7f0`). The new token names below avoid both meanings.

**Higher-contrast reading palette** (`app/guide/guide.css:6-16`): `--g-paper #f7f3ea`, `--g-card #fffdf8`, `--g-ink #1f1b17`, `--g-muted #5a5148` (7.01:1), `--g-accent #7a4a2c` (6.67:1), `--g-accent-strong #5e3620`, `--g-focus #1f4fa3`. This is the most accessible variant in the repo. It is a candidate *default* for long-form reading in **both** conditions (see Q3 in section 6.4). It must not be used in one condition only.

**Dark palette** (`src/museum/ui/deepzoom/DeepZoomViewer.css:4-8`, scoped to `.dz-root`): ground `#1a1714`, text `#f5f1e8`, muted `rgba(245,241,232,0.62)`, line `rgba(245,241,232,0.16)`, accent `#d9b48f` (9.24:1 on ground). Other dark values: inspect scrim `rgba(33,27,22,0.82)` + `blur(10px) saturate(0.9)` (`InspectModal.css:4-6,13`); landing night `#1b1713`.

**High-contrast override** (`src/museum/a11y/a11y.css:245-255`, `html.a11y-contrast`; per-component overrides `:256-280`):
- `--ink #111`, `--muted #3a342e`, `--accent #6b3f22`;
- hairlines `rgba(17,17,17,.45)` / `.7`;
- panels opaque `#fffdf8`, blur `none`;
- shadow `0 0 0 1px rgba(17,17,17,.55), 0 10px 26px -10px rgba(0,0,0,.45)`;
- focus ring `3px solid #000` + `0 0 0 5px #ffd400` (`:269-273`). Note that `#ffd400` is yellow, which clashes with the rule above that reserves yellow for the guidance cue.

**Public/landing tokens** (`app/landing/landing.css:7-22`): `--lp-ink #231e19`, `--lp-gutter clamp(20px,4.4vw,64px)`, `--lp-nav-h 76px`, wrap `1360px`. Public pages only.

### 2.2 Typography

- **Display:** `'Cormorant Garamond','Cormorant',Garamond,'Times New Roman',serif` (`styles.css:21`). Weights used: 300 (hero), 400, 500 (most headings), 400 italic.
- **UI:** `'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif` (`:22`). Weights used: 400, 500, 600.
- **Indic fallbacks** (`a11y.css:9-14`): Noto Sans/Serif Devanagari and Bengali, Nirmala UI, Mangal, Vrinda. Under `:lang(hi|bn)`:
  - `letter-spacing: normal !important`;
  - no uppercase transform;
  - kicker 12.5px, line-height 1.6;
  - no synthetic italics (`a11y.css:18-38, 321-335`).
- **Loading:** the reference uses `@fontsource` (`app/layout.tsx:3-12`). We use `next/font/google`:
  - `Cormorant_Garamond({ weight:['300','400','500','600'], style:['normal','italic'], subsets:['latin'], variable:'--font-cormorant' })`
  - `Inter({ subsets:['latin'], variable:'--font-inter' })`

Type scale, observed in the reference:

| Role | Spec |
|---|---|
| kicker | 10.5px / 500 / `0.22em` uppercase, muted (`styles.css:169-176`) |
| fact `dt` | 10.5px / 500 / 0.16em uppercase |
| badge | 10px / 500 / 0.14em uppercase |
| button label | 12px / 500 / 0.14em uppercase |
| UI body | 13–14px, `body { font-size:14px; line-height:1.5 }` |
| serif reading body | 18px / 1.5, `#3a332c` (17px on mobile) |
| guide body | 17px / 1.65 |
| HUD name | serif 20px / 500 / 1.1 |
| tour title | serif 25px / 500 / 1.15 |
| panel/dialog title | serif 30px / 500 / 1.08 (26px on mobile) |
| entry hero | `clamp(44px,8.4vw,86px)` / 300 / 0.98, `letter-spacing:-0.01em`, `text-wrap:balance` |
| landing hero | `clamp(58px,9.4vw,156px)` / 300 (public only) |

**Proposed rule.** In the experimental UIs, button labels are sentence case, not tracked uppercase. Uppercase stays for kickers. The 2D and immersive conditions share this type scale.

### 2.3 Motion

- **Durations in use:** tooltip 0.18s (after a 0.35s delay), hover 0.2s, dropdown 0.22s, button 0.25s, dialog 0.3–0.4s, travel fade 0.45s (`Minimap.tsx:14`), side panel 0.55s.
- **Functional keyframes** (`styles.css:1469-1487`): `ui-fade-in`, `ui-rise` (14px), `ui-rise-sm` (6px), `ui-drop` (-4px). **Keep** them, for state changes only.
- **Decorative keyframes:** `ui-boot-sweep` (`:323`), `ui-pulse` (`:2337`), `ui-heart` (`:1768`), `ui-photo-flash` (`:2614`), `ui-progress-sheen` (`entry.css:264`). **Banned in `/learn/*` and the study flow.**
- **Reduced motion:** the OS media query (`styles.css:110-117`) plus a user class `a11y-reduce-motion` (`a11y.css:232-238`). Lift both.

### 2.4 Layering and breakpoints

- **z-index:** the reference uses ad-hoc values from 2 to 1100 (see the tokens-ui audit). We replace them with a named scale: `canvas 0, hud 10, panel 20, drawer 30, modal 40, transition 50, viewer 60, skip-link 100`.
- **Breakpoints:** the reference is desktop-first, at 520 / 640 / 720 / 900 / 1100px. We go mobile-first with Tailwind's defaults plus `--breakpoint-xs: 32.5rem` (520px). The bottom-sheet switch (720px) maps to `md` (768px).
- **Hit targets:** `.ui-btn` has a 44px minimum height. The icon button is 38px, which passes WCAG 2.5.8 AA. We use 40px for icon buttons.

### 2.5 Proposed Tailwind v4 `@theme` (target: `app/globals.css`)

How the block is built:
- **Raw tokens live on `:root`** so that dark mode, high contrast and large text can override them at runtime.
- **`@theme inline` exposes them as utilities** under shadcn's semantic names, so shadcn/Radix components pick up the palette with no changes.
- **The madder accent is named `brand`/`primary`, never `accent`.** In shadcn, `accent` is the hover background. Reusing the name for madder would recolour every menu hover.

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where(.dark, .dark *));
@custom-variant hc   (&:where(.a11y-contrast, .a11y-contrast *));

/* ---- raw tokens (source: virtual-walkthrough src/styles.css:6-23, admin.css:3-31, entry.css:98-107) ---- */
:root {
  --paper: #f5f1e8;  --paper-2: #efe9df;  --paper-3: #e7dfd2;  --card-warm: #fbf8f2;
  --ink: #2b2621;    --ink-soft: #3a332c; --ink-muted: #6f665c;
  --brand: #8a5a3b;  --brand-hover: #744a2f; --brand-fg: #fbf7f0;
  --hairline: rgb(43 38 33 / .14); --hairline-strong: rgb(43 38 33 / .24);
  --panel-bg: rgb(245 241 232 / .8); --panel-bg-solid: rgb(245 241 232 / .94);
  --panel-blur: saturate(1.2) blur(14px);
  --shadow-panel-v: 0 1px 2px rgb(43 38 33 / .06), 0 12px 32px -12px rgb(43 38 33 / .22);

  /* shadcn semantic layer */
  --background: var(--paper);        --foreground: var(--ink);
  --card: var(--card-warm);          --card-foreground: var(--ink);
  --popover: var(--paper);           --popover-foreground: var(--ink);
  --primary: var(--brand);           --primary-foreground: var(--brand-fg);
  --secondary: var(--paper-2);       --secondary-foreground: var(--ink);
  --muted: var(--paper-2);           --muted-foreground: var(--ink-muted);
  --accent: rgb(43 38 33 / .06);     --accent-foreground: var(--ink);   /* hover fill */
  --destructive: #9b3326;
  --border: var(--hairline);         --input: var(--hairline-strong);   --ring: var(--brand);
  --radius: 6px;
}
.dark {                              /* ui/deepzoom/DeepZoomViewer.css:4-8 */
  --background: #1a1714; --foreground: #f5f1e8; --card: #221d19; --popover: #221d19;
  --primary: #d9b48f; --primary-foreground: #1a1714;
  --muted-foreground: rgb(245 241 232 / .62); --border: rgb(245 241 232 / .16); --ring: #d9b48f;
  --panel-bg: rgb(26 23 20 / .82); --panel-bg-solid: rgb(26 23 20 / .94);
}
.a11y-contrast {                     /* a11y.css:245-255 */
  --foreground: #111; --muted-foreground: #3a342e; --primary: #6b3f22; --ring: #000;
  --border: rgb(17 17 17 / .45); --input: rgb(17 17 17 / .7);
  --panel-bg: #fffdf8; --panel-bg-solid: #fffdf8; --panel-blur: none;
  --shadow-panel-v: 0 0 0 1px rgb(17 17 17 / .55), 0 10px 26px -10px rgb(0 0 0 / .45);
}

@theme inline {
  --color-background: var(--background);  --color-foreground: var(--foreground);
  --color-card: var(--card);              --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);        --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);        --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);    --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);            --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);          --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);          --color-input: var(--input);   --color-ring: var(--ring);
  --color-brand-hover: var(--brand-hover);
  --color-ink-soft: var(--ink-soft);
  --color-panel: var(--panel-bg);

  --font-display: var(--font-cormorant), 'Cormorant', Garamond, 'Noto Serif Devanagari', 'Noto Serif Bengali', 'Times New Roman', serif;
  --font-sans: var(--font-inter), 'Noto Sans Devanagari', 'Noto Sans Bengali', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;

  --radius-sm: 4px;
  --radius-md: var(--radius);
  --radius-lg: 10px;
  --shadow-panel: var(--shadow-panel-v);
}

@theme {
  --color-madder: #a34a33;  --color-indigo: #34506e;  --color-wood: #9b6a45;
  --color-ok: #3d6b45;      --color-warn: #7a5716;    --color-danger: #9b3326;
  --font-mono: ui-monospace, 'Cascadia Code', Consolas, monospace;

  --text-kicker: 0.65625rem;  --text-kicker--line-height: 1.4; --text-kicker--letter-spacing: 0.22em; --text-kicker--font-weight: 500;
  --text-label: 0.75rem;      --text-label--letter-spacing: 0.02em; --text-label--font-weight: 500;
  --text-reading: 1.125rem;   --text-reading--line-height: 1.5;
  --text-title: 1.875rem;     --text-title--line-height: 1.08;
  --text-hero: clamp(2.75rem, 8.4vw, 5.375rem); --text-hero--line-height: 0.98;   /* public only */

  --shadow-card: 0 1px 2px rgb(43 38 33 / .05), 0 1px 1px rgb(43 38 33 / .03);
  --shadow-pop:  0 12px 32px -12px rgb(43 38 33 / .28), 0 2px 6px rgb(43 38 33 / .06);
  --ease-museum: cubic-bezier(0.22, 0.61, 0.36, 1);
  --breakpoint-xs: 32.5rem;
  --spacing-edge: 18px;

  --animate-fade-in: fade-in .3s var(--ease-museum) both;
  --animate-rise-sm: rise-sm .35s var(--ease-museum) both;
  --animate-drop:    drop .22s var(--ease-museum) both;
  @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
  @keyframes rise-sm { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
  @keyframes drop    { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
}

@layer base {
  body { @apply bg-background text-foreground font-sans; font-size: 14px; line-height: 1.5;
         -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; box-shadow: 0 0 0 4px rgb(251 247 240 / .85); }
  .a11y-contrast :focus-visible { outline: 3px solid #000; box-shadow: 0 0 0 5px #ffd400; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
  .a11y-reduce-motion *, .a11y-reduce-motion *::before, .a11y-reduce-motion *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important;
  }
  :lang(hi), :lang(hi) *, :lang(bn), :lang(bn) * { letter-spacing: normal !important; text-transform: none !important; }
}

@utility panel {            /* .ui-panel, styles.css:154-167 — immersive overlays only */
  background: var(--panel-bg); backdrop-filter: var(--panel-blur); -webkit-backdrop-filter: var(--panel-blur);
  border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-panel-v);
  @supports not (backdrop-filter: blur(1px)) { background: var(--panel-bg-solid); }
}
@utility kicker {           /* .ui-kicker, styles.css:169-176 */
  font: 500 10.5px/1.4 var(--font-sans); letter-spacing: .22em; text-transform: uppercase; color: var(--muted-foreground);
}
```

Notes on this block:
- **Body lock.** The reference locks `html, body` with `overflow:hidden` (`styles.css:55-79`). We do **not** port that to `globals.css`. The lock lives only in the `/learn/immersive` layout, as an `.immersive-root` wrapper with `position:fixed; inset:0; overflow:hidden; overscroll-behavior:none`. Every other route keeps normal document scroll.
- **Viewport.** `viewport: { viewportFit: 'cover', themeColor: '#efe9df' }`. This is needed because overlays use `env(safe-area-inset-*)`.
- **Large text.** For DOM pages, scale the root `font-size`. Use `zoom: 1.2` (`a11y.css:298-320`) only on overlay cards over the canvas.
- **Verification.** The contrast ratios in section 2.1 come from the audit. Re-check the final token set with an automated contrast test (Vitest plus a WCAG-ratio helper) before freezing the study build.

---

## 3. 2D UI components

| Source (reference repo) | Verdict | Target in Immersive Episteme | Adaptation needed | Effort |
|---|---|---|---|---|
| `src/styles.css:6-117` tokens, focus, reduced motion; `a11y.css:9-92, 196-335` | ADAPT | `app/globals.css` (section 2.5) | Rename tokens, shadcn mapping, body lock scoped to immersive | S |
| `.ui-kicker` `styles.css:169-176` | LIFT | `kicker` utility | None | S |
| `.ui-panel` `styles.css:154-167` | LIFT | `panel` utility, **immersive overlays only** | 2D pages use opaque `Card` | S |
| `.ui-btn` / `--ghost` `styles.css:189-228` | ADAPT | shadcn `Button` cva variants `default`, `outline`, `ghost` | 44px min height, 22px horizontal padding; sentence case in `/learn/*` | S |
| `.ui-icon-btn` + `data-tip` `styles.css:230-295` | ADAPT | `Button size="icon"` + Radix `Tooltip` | The CSS tooltip is hover-only. Radix makes it keyboard-accessible. `aria-pressed` styling | S |
| `.ui-kbd` `styles.css:1106-1121` | LIFT | `components/ui/kbd.tsx` | 22px, `border-bottom-width:2px`, `--input` border | S |
| `.ui-switch` `a11y.css:196-225` + Toggle `A11ySettings.tsx:13-38` | ADAPT | shadcn `Switch` restyle | 38×22 track, 16px knob, off `rgba(43,38,33,.12)`, on `--primary` | S |
| `.ui-sr`, `.ui-sr-only` | SKIP | — | Tailwind `sr-only` | — |
| `src/museum/ui/icons.tsx` (216 lines; `Svg` wrapper `:6-20`) | ADAPT | `lucide-react` with `strokeWidth={1.5}`; `components/icons/extra.tsx` | Lift only `IconMouseLook`, `IconTour`, `IconCube` (`:90-143`). SKIP `Rosette` (craft motif) | S |
| **InfoPanel** `InfoPanel.tsx` (386 lines; `ViewModel` `:52-72`; CSS `styles.css:555-821, 1746-1798`) | ADAPT (highest value) | `components/content/ConceptPanel.tsx`, shared by both conditions: side panel in immersive, page body in 2D. Plus `FactList` and `StepList` | Presentational props `{open,onOpenChange,model,actions}`. Radix Dialog `modal={false}` / Sheet, bottom sheet below `md`. Keep `inert` + `aria-hidden` when closed, and focus-on-open only when the user is keyboard-focused (`:200-201`). Drop favourites, comments, share, maker card and video. Add layer tabs (artisan/process/science) and telemetry hooks. `ViewModel` becomes a Zod schema derived from graph nodes | M |
| Facts `<dl>` + numbered step chips (`styles.css:668-736`) | ADAPT | `FactList`, `StepList` | Make `StepList` an ordered `<ol>` that preserves the `precedes` order from the graph | S |
| **HelpOverlay** + HintStrip `HelpOverlay.tsx` (202 lines; CSS `:1026-1219`) | ADAPT | `components/onboarding/ControlsDialog.tsx` + study-engine tutorial step | shadcn Dialog + `ControlsList({rows})`. The hint strip becomes a fixed-duration one-time instruction (equal exposure), logged as an onboarding event | M |
| `isCoarsePointer()` `HelpOverlay.tsx:77-78`; pointer hook `TouchJoystick.tsx:9-19` | LIFT | `lib/device.ts` `usePointerCoarse()` | Merge both into a reactive hook | S |
| **WebGLUnsupported** `WebGLUnsupported.tsx` (41 lines; `hasWebGL()` `:4-14`) | LIFT `hasWebGL`; ADAPT component | `lib/webgl.ts`; `components/immersive/WebGLFallback.tsx` | New copy, no rosette. On failure, the study engine records `condition_unavailable` and routes per protocol (see Q in the requirements digest); never a silent fallback to 2D | S |
| **ProximityPrompt** `ProximityPrompt.tsx` (48 lines; CSS `:1221-1316`) | ADAPT | `components/immersive/ProximityPrompt.tsx` | Props `{title,visible,inputMode,onActivate}`. Keep "last item fades with its text" (`:18-20`). Telemetry for shown vs activated | S |
| **Minimap** `Minimap.tsx` (298 lines; CSS `:823-1007`) | ADAPT | `components/immersive/ImmersiveMap.tsx` | Fed by the compiler's `rooms`/`walls`. Keep SVG-from-bounds (viewBox +1.1 m padding, `:55-71`), the rAF view cone (34° half-angle, 4.6 m, `:100-140`) and zone `role=button` + `aria-current="location"`. The map is a **controlled variable** | M |
| `travel()` / `TravelFade` `Minimap.tsx:14-50`, `styles.css:1009-1024` | ADAPT | `components/immersive/TravelFade.tsx` | Zustand instead of a module `Set`. 450 + 120 ms fade, instant under reduced motion. Logs a teleport event | S |
| **TouchJoystick** `TouchJoystick.tsx` (126 lines; CSS `:1318-1401`) | ADAPT | `components/immersive/TouchJoystick.tsx` | `onChange({x,y})`. Dead-zone 0.08, travel 62%, 124 / 140px. Only if touch devices are allowed (open question) | S |
| **HUD** `HUD.tsx` (330 lines; title block CSS `styles.css:356-387`; `useFullscreen` `HUD.tsx:58-77`) | ADAPT shell only | `components/immersive/ImmersiveToolbar.tsx`, `hooks/useFullscreen.ts` | Fixed small action set: help, map, reset position, maybe fullscreen. SKIP photo, sound, time-of-day, quality picker, VR toggle and social | M |
| **EntryScreen** progress `entry.css:211-280`; staging `ASSET_SHARE` `EntryScreen.tsx:29` | ADAPT | `components/immersive/LoadingGate.tsx` | 2px track, `scaleX` bar, tabular-nums, `aria-valuenow`, slow-network messages at 9s / 22s. **Remove** tips (instructional confound), stamp motif and sheen. "Begin" = study task start, timestamped after `Precompile` | M |
| `.ui-boot` gradient `styles.css:303-331` | ADAPT | public `loading.tsx` only | Keep `radial-gradient(120% 90% at 50% 38%, rgba(255,252,245,.95) 0%, rgba(245,241,232,.97) 55%, rgba(233,225,212,.99) 100%)`. Sweep only on public pages | S |
| **TourOverlay** card (`styles.css:2256-2506`) | ADAPT | `components/content/PathStepCard.tsx` (immersive guided path) and the 2D process-timeline step header | Kicker + serif 25px title + serif 17px text, prev/next. Remove `ui-pulse` and narration | S |
| **InspectModal** shell (`InspectModal.tsx`, 328 lines) | ADAPT | see section 4 `ObjectInspector` | — | — |
| **DeepZoomViewer** `ui/deepzoom/DeepZoomViewer.tsx` (388 lines) + OpenSeadragon | SKIP for v1 | `ZoomableFigure` later, in **both** conditions | Decouple from R3F `_roots` | — |
| LanguageMenu / LanguageSwitch (125 lines; `a11y.css:95-122`) | SKIP unless multilingual | Radix `DropdownMenu` / `ToggleGroup` | Language is fixed per participant by the study engine, not switched in-UI | — |
| `A11ySettings.tsx` (63 lines) | ADAPT | `components/settings/A11ySettings.tsx` in pre-session setup | shadcn `Switch`. Settings are recorded as session covariates | S |
| `A11yLayer.tsx` (108 lines) | ADAPT | `components/immersive/A11yBridge.tsx` | html-class bridge, canvas `role="img"` + label, polite live region "Entered room X" from the room graph, skip link (target needs a protocol decision: it may cross conditions) | M |
| `a11y/focus.ts` `useFocusTrap` (89 lines) | LIFT | `lib/a11y/useFocusTrap.ts` | Only for non-Radix overlays over the canvas | S |
| `src/admin/ui.tsx:16-93` `useConfirm` (`ConfirmCtx` + `ToastProvider`) | ADAPT | `hooks/useConfirm.tsx` on shadcn `AlertDialog` | Keep the promise API | S |
| `src/admin/ui.tsx:222-246` `useUnsavedGuard` | ADAPT | `hooks/useUnsavedGuard.ts` (CMS editor, concept-map editor) | Only the `beforeunload` half works standalone. In-app navigation is guarded by the admin shell reading `hasUnsavedChanges()` (`:225`), and App Router has no built-in navigation blocker, so that half must be rebuilt | S |
| `src/admin/ui.tsx` `PageHeader`, `EmptyState`, `Skeleton`, `Spinner` | ADAPT | console/CMS components | Tailwind / shadcn `Skeleton` | S |
| `src/admin/ui.tsx` toasts | SKIP | `sonner` | — | — |
| `src/admin/ui.tsx:248-282` formatters | LIFT | `lib/format.ts` | Consider `Intl.RelativeTimeFormat` | S |
| `AnalyticsPage.tsx:130-220` `Stat`, `HBars`, `DailyChart`; `niceTicks`, `roundedTop` (`:207-220`) | ADAPT; LIFT pure helpers | `app/(console)/…`, `lib/chart/ticks.ts` | Sessions per condition per day, completion funnels | M |
| `CuratorAnalytics.tsx` `Heatmap` (`:240`), `Funnel` (`:304`), `Retention` (`:335`) | ADAPT idea | console positional heatmap over the compiled layout | Skimmed only; re-read before lifting | M |
| `admin.css` (510 lines) | ADAPT tokens only | shadcn `Badge` variants `ok`/`warn`/`danger`/`brand` | Do not copy the CSS | S |
| `app/guide/*` (`guide.css` 355 lines; print `:310-355`) | ADAPT (very relevant) | `/learn/2d` concept and catalogue page structure; print stylesheet for assessment materials | Skip link → `#main`, TOC, `<section aria-labelledby>`, `<article>`, `<dl>`, `<ol>`. Palette must be identical to immersive panels | M |
| `src/museum/ui/standalone.css` (160 lines; 760px column) | ADAPT | prose layout for about, consent and debrief + `@tailwindcss/typography` | — | S |
| `app/landing/*` (`landing.css` 1523 lines, `HeroMedia`) | ADAPT (public only) | `app/(public)` | `--lp-*` scale, motion gated on `prefers-reduced-motion: no-preference`. Skimmed only | M |
| `ArrivalOverlay`, `PhotoMode`, `AuthModal`, `GoogleSignInButton`, `Social/*`, `Comments/*`, `MakerCard`, `ItemLinks`, `ExhibitionPicker` | SKIP | — | Decorative, social, commerce or auth; Better Auth replaces auth | — |
| `UIOverlay.tsx` (195 lines) | SKIP code; ADAPT pattern | `components/immersive/ImmersiveOverlay.tsx` | One root at `z-10`, `pointer-events:none`, controls `auto` (`styles.css:122-152`) | S |
| `public/brand/iit-kharagpur.svg` (recoloured `#8a5a3b`) | conditional LIFT | header/footer | Check IIT-KGP brand rules on recolouring | S |
| other `public/brand/*`, `og-image.jpg`, `landing/*.jpg`, `hero.webm`, `app/qr/*` | SKIP | — | Museum-specific | — |
| i18n `core.ts` `loc()`, `index.ts` `rich()` (60 + 85 lines) | ADAPT if multilingual | Zod `i18n` field on graph nodes; `lib/i18n/rich.tsx` | Language comes from study assignment, not `localStorage`. Keep the type-enforced dictionary key parity idea | S |

---

## 4. 3D building blocks and assets

### 4.1 Code

Paths are relative to `src/museum/`.

| Source | Verdict | Target | Adaptation | Effort |
|---|---|---|---|---|
| `materials/geometry.ts` (93 lines): `createMeterBoxGeometry`, `getMeterBoxGeometry` | LIFT | `three/geometry/meterBox.ts` | — | S |
| `materials/noise.ts` (164 lines): `mulberry32`, `hash2`, `TileNoise.fbm` | LIFT | `lib/random/` + `three/textures/noise.ts` | Shared seeded PRNG for the compiler and for randomisation | S |
| `materials/proceduralTextures.ts` (1075 lines; `getTextureSet` L992) | ADAPT subset | `three/textures/procedural.ts` | Keep plaster 2.0 m, oakFloor 3.2, timber 1.2, stone 2.4, linen 0.2. Consider a worker | M |
| `materials/materials.ts` (290 lines; build L97–228, cache/dispose L234–290) | ADAPT | `three/materials/useMaterials.ts` | Trim the palette. Values are in section 4.3 | M |
| `materials/wallGraphics.ts` (901 lines): infra L36–100, `createLabelTexture` L856–901 | ADAPT | `three/text/labelTexture.ts` | Our fonts and tokens. **Mirror all text in the DOM** for a11y and parity. Drop the craft illustrations L302–690 | M |
| `effects/StaticMerge.tsx` (90 lines) | LIFT | `three/StaticMerge.tsx` | Essential for compiled architecture | S |
| `effects/Precompile.tsx` (52 lines) | ADAPT | `three/Precompile.tsx` | Gates `frameloop` and LoadingGate; emits timing telemetry. Not LIFT: it imports `withZonesVisible` from `navigation/zoneCulling` (`:10`, which pulls in `config/layout` and `lighting/SkyAndSun`) and writes `useMuseum.getState().setSceneCompiled` (`:11,23`) | S |
| `effects/PostFX.tsx` (25 lines) | ADAPT | `three/PostFX.tsx` | N8AO + SMAA only, no bloom, one fixed config for all participants | S |
| `models/kit.tsx` (333 lines; `Builder` L223–269, `useBuilt` L276–286) | LIFT | `three/kit/` | Plinths, cases, lecterns, panels | S |
| `models/GLTFModel.tsx` (129 lines; `dequantize` L34–43, `mergeScene` L45–94, fit L111–116) | LIFT | `three/assets/GLTFModel.tsx` | Drop `resolveModelUrl` (L28–31). **Host the Draco and meshopt decoders locally** (drei defaults to a CDN) | S |
| `models/sceneContext.ts` | LIFT | `three/kit/` | — | S |
| `models/types.ts`, `models/amenityLights.ts` | ADAPT | `three/kit/` | Not LIFT: both import `SceneObjectConfig` from the museum content config `config/objects` (`types.ts:1`, `amenityLights.ts:7`); `amenityLights` also imports `Vec3` from `config/museum` and registers with `SpotPool` (`:8-9`) | S |
| `models/display.tsx` (103 lines): `Vitrine` L25–76, `Pedestal` L79–103 | ADAPT | `three/exhibits/Plinth.tsx`, `Vitrine.tsx` | Remove the hand-block contents L56–68 | S |
| `models/SceneObjects.tsx` (257 lines): `viewingNormal` L81–105 (uses the layout's `wingCentre`), `InteractiveShell` L153+ with halo | ADAPT | `three/exhibits/ExhibitObject.tsx` | Iterate `manifest.exhibits`; register `conceptId`. Halo is the calm selection highlight | M |
| `models/index.ts` registry, `models/props.tsx`, `models/credits.tsx`, `models/library.tsx` (`ResourceBoard`, lectern) | ADAPT | kind→component registry; info stations | Drop the brand logo default | M |
| `models/modelMaterials.ts` (334 lines) | ADAPT `tinted()` (L146) | — | SKIP sway, foliage, liquid and `MODEL_TIME` | S |
| `models/textures.ts` `imageAtlas` (L391), `amenityTextures.ts` `cellUV` (L97) | LIFT functions | `three/textures/atlas.ts` | — | S |
| `exhibits/frameMath.ts` (53 lines) | LIFT | `three/exhibits/frameMath.ts` + Vitest | — | S |
| `config/frames.ts` (147 lines) | LIFT subset | `thin-black` (0.02 / 0.035 / mat 0.07 / `#1d1c1a`), `white`, `frameless` | — | S |
| `exhibits/artworkTexture.ts` (80 lines) | ADAPT | `three/assets/imageTexture.ts` | `.1024/.2048.webp` naming. Not LIFT: it picks the resolution from `useMuseum.getState().tier` (`:6,19`); pass the tier in | S |
| `exhibits/Artwork.tsx` (258 lines; frame L56–124, label L126–149, hover emissive 0.06 L78–83) | ADAPT | `three/exhibits/WallFigure.tsx` (concept diagram on a wall) | Manifest surface placement; drop deep zoom | M |
| `exhibits/Exhibit.tsx` (132 lines; `TableLabel` L41–59), `Artifact3D.tsx` (51), `WallGraphics.tsx` (131), `placement.ts` (24) | ADAPT | table exhibit, wall-text panel, shared placement function | One placement function feeds both render and collision | M |
| `interaction/registry.ts` (35 lines) | LIFT | `three/interaction/registry.ts` | `kind` → `conceptId` / `nodeType` | S |
| `config/layout.ts` types `WallBox` L26–37, door split L55–76, `DisplaySurface` L222–235, `surfacePoint` L310–317, `Zone` L325–334, `zoneAt` L362–364 | ADAPT (types and algorithms only) | `lib/compiler/manifest.ts` (Zod) + `lib/compiler/geometry.ts` | String IDs. `ZONE_VISIBILITY` and waypoints derived from thresholds. SKIP all constants | M |
| `architecture/Wall.tsx` (36 lines; shadow gap L28–33) | ADAPT (small) | `three/architecture/Wall.tsx` | Reads `MUSEUM.walls.shadowGapHeight` (`:24`) and `useMaterials()` (which reads the store tier, `materials.ts:11-12`); pass both as props | S |
| `architecture/Floor.tsx` (114 lines; click-to-walk L64–69, cursor ring L99–102) | ADAPT | `three/architecture/Floor.tsx` | Zone rects from the manifest. No `MeshReflectorMaterial` (Ultra-only visual difference) | S |
| `architecture/Wings.tsx` helpers `Box`, `slabCells`, `Slab` (L45–94), `RoofLight` (L97–112), `PooledLight`, `Pendant` | LIFT helpers | `three/architecture/` | SKIP the rooms | S |
| `architecture/CeilingAndSkylight.tsx` (202 lines; `Slats` L50–80) | ADAPT | optional ceiling style | Parameterise pitch and extents | M |
| `architecture/WallDecor.tsx` + `decorGeometry.ts` | SKIP v1 | — | Possible later as a generic dado | — |
| `architecture/Medallion.tsx`, `Landscape.tsx`, `Reception.tsx` | SKIP | — | Decorative or content-specific. Copy only the placeholder-texture precompile trick (Medallion L11–32) | — |
| `lighting/SpotPool.tsx` (123 lines) | ADAPT | `three/lighting/SpotPool.tsx` | Pool sizes 6 / 10 / 12 / 14 (`config/quality.ts:60,83,105,127`). Fix one size for the study. Not LIFT: it imports `segmentBlocked` from `navigation/collision` (`:14`), and that module builds `COLLIDERS` at import time from `WALLS`, `EXHIBITS`, `SCENE_OBJECTS` and `VIDEOS` (`collision.ts:6-10,47`). Inject the collision world | S |
| `lighting/TrackLight.tsx` (96 lines; `coverAngle` L93–96) | ADAPT | `three/lighting/TrackLight.tsx` | Not LIFT: it imports `LIGHTING` from `config/lighting`, `RAIL_Y` from `tracks`, `useMaterials` and `registerSpot` (`:9-13`) | S |
| `lighting/tracks.ts` (`mountFor` fallback L78–86) | ADAPT | per-zone rails from the manifest | — | S |
| `lighting/Lighting.tsx` (136 lines; `rectOrientation` L36–41, `AreaLight` L55–62) | ADAPT | `three/lighting/LightingRig.tsx` | One fixed preset; no per-zone mood differences beyond what the mapping rules justify | M |
| `lighting/GalleryEnvironment.tsx` (77 lines) | ADAPT | lightformer env derived from zone bounds | — | S |
| `config/lighting.ts` `kelvinToRGB` / `kelvinToHex` (L124–148) | LIFT | `three/lighting/kelvin.ts` | — | S |
| `lighting/SkyAndSun.tsx` | ADAPT public only | — | Learning condition is interior-only or uses a fixed neutral sky | — |
| `lighting/ZoneProbes.tsx`, `NightLights.tsx`, `nightSky.ts`, `timeOfDayState.ts` | SKIP | — | Time of day is a confound | — |
| `navigation/collision.ts` (119 lines; `resolveCircle` L50–86, `segmentBlocked` L89–119) | ADAPT (algorithm LIFT) | `three/navigation/collision.ts` → `buildColliders(manifest)` | AABB only, so the **compiler emits axis-aligned walls** in v1. The module-level `COLLIDERS = build()` (L16–47) reads the content arrays and must go | S |
| `navigation/VisitorController.tsx` (307 lines; proximity L276–303, FOV L39–47) | ADAPT | `three/navigation/VisitorController.tsx` | Inject the collision world, registry and visitor config. It reads `MUSEUM.visitor` (`:14`) and the museum store (`mouseLook`, subscriptions, `getState()` at L113–176). Emits proximity telemetry | M |
| `navigation/focus.ts` (35 lines) | ADAPT (small) | — | Instant cut under reduced motion is already there (L21–26). Imports `MUSEUM`, the registry and `useMuseum` (`:1-4`) | S |
| `navigation/zoneCulling.tsx` (115 lines) | ADAPT | manifest zones + derived visibility | — | S |
| `tour/pathing.ts` (107 lines; Dijkstra `planPath` L69–97) | ADAPT (algorithm LIFT) | `three/navigation/pathing.ts` | Nodes from the manifest's path graph. It imports the hand-authored `NAV_WAYPOINTS` (`config/tour`) and the module-level `COLLIDERS` (`:10-11`) | S |
| `tour/engine.ts` (440 lines) + `tour/TourOverlay.tsx` (160 lines) | ADAPT idea (not reviewed line by line) | guided-path stepper, if guidance policy Q-R5 allows one | Stop-to-stop walk, fade-teleport for long hops, pause on manual movement, `resume()` re-plans. Imports `config/tour`, the store, `Minimap.travel` and the tracker (`:9-14`). Drop `speechSynthesis` narration | M |
| `tour/navigate.ts` (150 lines) | ADAPT | `goToPose` walk-or-teleport | — | S |
| `state/visitor.ts` (56 lines) | LIFT (one change) | `three/state/visitor.ts` | Source for position telemetry sampling. Replace the initial pose read from `MUSEUM.visitor.start` (L19–23, L54) with the manifest spawn | S |
| `navigation/ArrivalFlight.tsx` (203 lines) | SKIP | — | Decorative, and it biases time-on-task | — |
| `ui/InspectModal.tsx` `StudioRig` (L34–87) + `StudioLights` (L118–151) | ADAPT | `three/ObjectInspector.tsx` | Autorotate **off**. Values: ambient 0.15; key `#fff4e6` 2.1; fill `#e8eef8` 0.55; rim `#ffe9d2` 1.1; ContactShadows opacity 0.5, blur 2.6, res 512, `#2b2621`; OrbitControls damping 0.08, no pan, maxPolar 0.58π | M |
| `MuseumScene.tsx` (122 lines) composition + `src/App.tsx` Canvas (L115–153), `AdaptiveQuality` (L39–79) | ADAPT pattern | `components/immersive/ImmersiveCanvas.tsx` | NeutralToneMapping, fov 58, near 0.05, `frameloop` gated, context-loss handling. For the study, **fix the tier or log it**; `AdaptiveQuality` may be disabled | M |
| `config/quality.ts` (219 lines) | LIFT | `three/quality.ts` | Log `gpuClass()` and tier as covariates | S |
| `state/store.ts` (185 lines) | ADAPT | split into `sceneStore` + `a11yStore` | Drop social and auth | S |
| `utils/ErrorBoundary.tsx`, `utils/useAsyncTexture.ts` | LIFT | — | — | S |
| `utils/errorReporter.ts` (172 lines) | ADAPT | links to study session id | — | S |
| `utils/vr.ts` (`?vr=1` freeze) | LIFT idea | Playwright screenshot determinism | — | S |
| `xr/xrStore.ts` | LIFT (deferred) | optional WebXR enhancement | Only if XR is in scope for the study (open question) | S |
| `xr/XRRoot.tsx`, `XRButtons.tsx` | ADAPT (deferred) | — | `XRRoot` renders `VRRig` (`:6`), itself ADAPT/L. `XRButtons` imports `useMuseum` and `liveToast` from the Supabase-backed `live/store` (`:3-4`) | S |
| `xr/VRRig.tsx` (429 lines), `vrCard.ts` | ADAPT (deferred) | — | — | L |
| `xr/ARView.tsx`, `effects/PathTracer.tsx`, `rayTraceStore.ts`, `utils/renderer.ts` (WebGPU), `studio/*`, all craft models (`courtyard`, `workshop`, `centrepiece`, `mapWall`, `printStudio`, `shop`, `artisan`), `exhibits/HandBlockPlaceholder`, `ImpressionSwatch`, `motifs.ts` (geometry part), `indiaGeometry.ts`, `decorMaterials.ts`, `decorTextures.ts`, all `config/*` content | SKIP | — | Content-specific, decorative or out of scope | — |

### 4.2 Reference stack versions (`package.json`)

For alignment, not as a constraint. These are the caret (`^`) lower bounds in `package.json`, not installed versions:
- next ^16.4.0, react ~19.3.0;
- three 0.186.1;
- @react-three/fiber 9.8.1;
- drei 10.7.9;
- @react-three/postprocessing 3.1.3, postprocessing 6.39.5;
- @react-three/xr 6.6.31;
- three-mesh-bvh 0.9.16;
- meshoptimizer 1.3.0;
- @gltf-transform 4.5.1;
- zustand 5.0.15.

### 4.3 Material and lighting values worth keeping (`materials.ts:148-181`, `config/lighting.ts`)

**Materials:**
- plaster `#ece6dc` (normalScale 0.25, env 0.6);
- plasterCeiling `#f0eee9`;
- oakFloor tint `#ffffff` (normal 0.35, env 0.8);
- timber `#f7ecdc`;
- paintBlack `#1d1c1b` r0.55;
- paintWhite `#f4f2ee` r0.7;
- shadowGap `#2d2a27` r0.9;
- trackBlack `#1a1a1a` r0.45 m0.6;
- steelWhite `#f2f1ee` r0.5 m0.2;
- deskTop `#f3f1ec` r0.32;
- brass `#b8955a` r0.32 m1;
- glass (MeshPhysical) `#d9ecf0` r0.03, opacity 0.16, ior 1.5, depthWrite false, DoubleSide.

**Lighting:**
- exposure 1.0;
- hemisphere `#e9eef2` / `#d2b692` at 0.45, environment 0.85;
- track 3000 K, chromaticAdaptation 0.45, artwork 22 cd, table 12 cd, penumbra 0.85, aim 30°;
- cove 3000 K 1.1, strip emissive 2.2;
- spot intensity scaled by `(dist/2.2)²` (Artwork.tsx L201).

**Visitor** (`config/museum.ts`):
- eyeHeight 1.62, collisionRadius 0.28;
- walkSpeed 1.35, briskSpeed 2.3, acceleration 7;
- fov 58, minHorizontalFov 62;
- lookSensitivity 0.0032, lookDamping 14, pitchLimit 55°.

**World convention:** 1 unit = 1 m, +y up, compass yaw 0 = north, `yawToRad(deg) = -deg·π/180`.

### 4.4 Assets

Sizes are from `du -sh`. Licence status comes from `public/models/cc0/CREDITS.json` unless noted.

| Path | Size | Licence | Verdict |
|---|---|---|---|
| `public/models/opt/cc0/*.glb` (14 optimised GLBs) | 8.5 MB total | CC0 1.0 (Poly Haven), credits in `public/models/cc0/CREDITS.json` (8 KB) | SKIP by default (decorative props are unwanted in a learning condition). If any are used, copy GLB + `CREDITS.json` and keep the visual load equal across conditions |
| `public/models/cc0/` (source glTF + textures) | 24 MB | CC0 | SKIP; re-download via the `scripts/download-cc0-models.mjs` pattern if needed |
| — `potted_plant_01` / `_02` | 1.3 MB / 916 KB opt; 96,030 / 69,806 polys | CC0 | heavy; avoid |
| — `potted_plant_04` | 640 KB; 6,097 polys | CC0 | only plausibly neutral ambient prop |
| — `wooden_stool_01`, `ceramic_vase_01` | 728 KB / 168 KB | CC0 | generic; optional |
| — `brass_diya_lantern` | 480 KB | CC0 | SKIP (culturally specific; could read as content) |
| `public/textures/` | 1 KB (README only) | — | Nothing to copy; textures are procedural |
| `public/decor/mandala.svg` | 35,856 B | **no provenance or licence found** | SKIP |
| `src/museum/exhibits/indiaGeometry.ts` (275 lines, DataMeet `india-osm.geojson`) | — | **licence not stated**; DataMeet terms unchecked | SKIP unless a map is needed and the licence is confirmed. Policy-sensitive (official GoI depiction) |
| `public/brand/iit-kharagpur.svg` | — | institutional mark | conditional (see section 3) |

**Note: no architecture or furniture GLBs exist.** All rooms, plinths and vitrines are procedural code. That suits a compiler-generated environment, since there are no downloads and the output is deterministic.

---

## 5. Utilities and patterns worth copying

| Source | Verdict | Target | Notes |
|---|---|---|---|
| `src/museum/analytics/outbox.ts` (116 lines) + `tests/unit/analytics-outbox.test.ts` (238 lines) | LIFT core, then extend | `lib/telemetry/outbox.ts` | Batches of up to 200 events, queue of up to 2000, stable batch-id retry, one request in flight, `sendBeacon` on hide. **Must add:** IndexedDB persistence, per-session `seq`, `performance.now()` monotonic time, schema version, participant/session/condition ids, and a counted, reported drop log. As written it silently drops the oldest events when full (L71-74) and discards 4xx batches |
| `src/museum/analytics/tracker.ts` lifecycle (`FLUSH_MS` L27, wiring L205-225) | ADAPT wiring; SKIP events | `lib/telemetry/client.ts` | 10s flush, flush on `pagehide`/`visibilitychange`. Our events are Zod-typed and versioned. **Do not copy** `if (!ok) outbox.clear()` (L207-211): when the backend health check fails the reference silently discards every queued event |
| `src/server/handlers/analytics.ts:39-112` + `analytics_batches` marker table | ADAPT | `app/api/telemetry/route.ts` + Drizzle | Marker `(session_id,batch_id)` with `onConflictDoNothing` in the same transaction; accept `text/plain`; ID regex `^[A-Za-z0-9_-]{8,64}$`; strip NUL. **Reject or quarantine unknown event types** (the reference silently skips them, L50); it also silently skips events outside its clock window (L52) and nulls `meta` longer than 500 characters (L59-62): do neither; retention per ethics protocol, and **do not port** `maybeAutoCleanup` (L106, from `curatorAnalytics.ts`), which deletes stored analytics automatically |
| `src/server/handlers/curatorAnalytics.ts:56-101` `HeatBatch` | ADAPT as a derived view only | console | Keep raw trajectories; aggregate afterwards |
| `src/museum/utils/errorReporter.ts` + `src/server/handlers/errors.ts` | ADAPT | `lib/errors/` | Tie to the session id; flags WebGL-failure sessions |
| `next.config.ts:24-44` security headers | LIFT then tighten | `next.config.ts` | HSTS `max-age=63072000; includeSubDomains`; `nosniff`; `strict-origin-when-cross-origin`; `X-Frame-Options SAMEORIGIN` (DENY on `/research`, `/admin`); `Permissions-Policy: xr-spatial-tracking=(self), camera=(self), microphone=(), geolocation=()` (tighten `camera` to `()` unless AR is in scope). The reference already sends `Content-Security-Policy: frame-ancestors 'self'` (`'none'` on `/admin`), but no other CSP directive: add a full CSP. SKIP the 500 MB body limit and the CloudFront fallback |
| `src/server/http.ts:47-59` CSRF origin check | ADAPT | middleware | Check overlap with Better Auth `trustedOrigins`. Note it lets through state-changing requests that carry no `Origin` header (L50-51) |
| `src/server/db/postgres.ts` (167 lines) | ADAPT | `lib/db/pool.ts` for Drizzle `node-postgres` | `max 5`, `idleTimeoutMillis 5000`, `connectionTimeoutMillis 10000`; destroy broken clients in tx (SQLSTATE `08xxx`, `57P01-03`). **Do not** map int8 to Number for event ids; use bigint mode |
| `src/server/db/tls.ts` (130 lines) + `scripts/db-tls-check.ts` | ADAPT; drop the Supabase rule | `lib/db/tls.ts` | SKIP `supabaseCa.ts` unless hosting on Supabase |
| `src/server/storage.ts` (183 lines), `src/server/handlers/media.ts:20-33,185-197` | ADAPT | `lib/storage/s3.ts` | `WHEN_REQUIRED` checksums; traversal guard. Use **presigned POST with `content-length-range`** (the reference's PUT does not enforce size); private buckets for research data |
| `scripts/optimize-assets.mjs` (244 lines) | ADAPT | `scripts/optimize-assets.ts` | dedup → prune → weld → WebP ≤ 1024 → meshopt + quantise. Replace the puppeteer image codec with `sharp` |
| `scripts/verify-optimized-models.mjs` (139 lines) | LIFT | `scripts/verify-models.ts` | pixelmatch, fails above 1% |
| `scripts/visual-regression.mjs` (211 lines) + `utils/vr.ts` | ADAPT to Playwright | `tests/visual/` | SwiftShader flags, `?vr=1` freeze, a test-only `window.__app` scene hook, fail on missing baseline. Also proves "no decorative animation" |
| `scripts/shader-count.mjs`, `load-profile.mjs` | ADAPT | perf parity checks | — |
| `motifs.ts:361-385` `mulberry32`, `hashString` | LIFT | `lib/random/` | Deterministic compiler and randomisation seeds |
| `content/artisans.ts:80` `safeUrl` | LIFT | CMS render layer | — |
| `src/server/util.ts:25-38` rate limiter | ADAPT | — | Per-instance only |
| `docs/CONTENT_CAPTURE.md` (166 lines) | ADAPT as methodology | `docs/content/capture-sop.md` (later) | Capture standards and the rule "leave a field empty rather than guess" (L7-8). It contains no domain facts |
| Content schema ideas (`artworks.ts:34-88` fields, `placeholder` + public-hiding `artisans.ts:59-62`) | ADAPT ideas only | Zod node schemas | Our provenance model goes further: source, citation, reviewer, verification state |
| Test style: `node:test` + `tsx` | — | Vitest | Mechanical port |

---

## 6. What NOT to reuse, and why

### 6.1 Architecture
- **App structure.** We do not reuse the hybrid Vite/Next layout (`vite.config.ts`, `tsconfig.app.json`, `src/App.tsx` composition root), the global `useMuseum` store or the `UIOverlay` composition. The master prompt rules out a Vite app. Our structure is Next App Router with route groups `(public)`, `learn/2d`, `learn/immersive`, `(console)` and `(cms)`.
- **Hardcoded layout.** `config/museum.ts`, `config/layout.ts` constants, `SurfaceId`/`ZoneId` literal unions and the hand-authored `ZONE_VISIBILITY`/`NAV_WAYPOINTS`: our layout is compiler output, never constants.
- **Content mutation.** The content loader mutates arrays in place (`src/museum/content/content.ts:55-79`: `splice` at `:62`, `push` at `:73`, `Object.assign` at `:74-79`) and couples placement to `SurfaceId`. That conflicts with a compiler that generates the layout.
- **Global document lock** (`styles.css:55-79`). It is scoped to the immersive route.
- **Museum migration runner** (`scripts/db-migrate.ts`, `_museum_migrations`). We use drizzle-kit. Keep the idea of a direct, non-pooled URL for DDL.
- **Feature surface:**
  - social, auth, favourites, comments, guestbook, live presence (`src/museum/live/*`), maker/commerce cards;
  - photo mode, path tracer, AR view, print studio;
  - time-of-day, ambient audio, arrival flight;
  - language switching in-UI.

  These are non-task features or decorative manipulations that would confound the experiment.

### 6.2 Supabase coupling
- **Real SDK dependency:** `src/museum/live/*` (Realtime client). **SKIP.**
- **Moderate:** `src/server/db/tls.ts` (`SUPABASE_HOST_RE`) and `src/server/db/supabaseCa.ts` (bundled root CA, valid to 2031-04-26). Drop both unless we host on Supabase.
- **Cosmetic:** the `supabase/migrations` folder name, comments in `storage.ts` and `config.ts`, and `enable row level security` in migrations. All other infrastructure is plain `pg` and AWS SDK v3, so there is no blocking coupling.

### 6.3 Content of unverified provenance
- **Placeholders.** All 41 bundled artworks (`config/artworks.ts:129-186`; the `work()` constructor sets `placeholder: true` at `:104-113`), 9 blocks, 2 artisans, 6 infographic panels (`body: PENDING`), films and workshop objects are explicit placeholders (`placeholder: true`). **Nothing is imported into the knowledge graph.**
- **Process labels.** `['Block','Cloth','Colour','Print','Finish']` (`config/infographics.ts:42`, repeated as a fallback in `materials/wallGraphics.ts:314`) is unsourced. Do not use it as a process sequence.
- **Dye names and hexes** (`studio/palette.ts`) are explicitly "COLOUR NAMES ONLY … no claim about recipes, mordants or chemistry". Not knowledge.
- **Motifs** (`motifs.ts:1-8`) are "NOT reproductions of any documented traditional block design". SKIP them; in a learning environment they could be mistaken for authentic designs.
- **Map assets.** India map pins are arbitrary. The outline geometry has an unchecked licence and is policy-sensitive.
- **Tradition names.** Only `TRADITION = 'Hand Block Printing'` appears in data. *Dabu*, *ajrakh* and *bagru* appear only as writing-guide examples, and do not establish the study's traditions.
- **Decorative assets.** `mandala.svg` has no provenance. Brand images are museum-specific.

### 6.4 Licence and permission (blocking for any verbatim copy)
- **Q1.** The reference repo has no LICENSE and is `"private": true`. Before any LIFT, get written permission from the repo owner. The DC Handicrafts / IIT-KGP project may be the same group, but that is not confirmed. Without permission, every LIFT becomes ADAPT: re-implemented from the documented behaviour and values, which are facts and specifications rather than copied expression.
- **Q2.** Should the IIT-KGP logo be used recoloured, or in its official colours?
- **Q3.** Should long-form reading text in both conditions use the guide palette (`--g-ink #1f1b17`, `--g-muted #5a5148`) or the museum palette? Either works, but it must be the same in both conditions.

---

## 7. Proposed copy order, aligned with the first vertical slice

**First vertical slice.** One seeded mini-graph: a placeholder tradition clearly labelled `unverified-demo`, about 10 concepts and 3 relationship types. The slice then runs:
1. Compiler produces a manifest with 2 rooms and 1 threshold.
2. `/learn/immersive` renders it: walk, select an exhibit, open the panel.
3. `/learn/2d` renders the same graph as a concept page.
4. One shared telemetry event stream lands in Postgres.
5. A study-engine stub assigns the condition.

| Step | Copy/adapt | Why now |
|---|---|---|
| 0 | Licence confirmation (Q1). Until it arrives, everything below is re-implemented, not copied | Blocks verbatim copying |
| 1 | `globals.css` tokens + `@theme` (section 2.5), `next/font` setup, `kicker`/`panel` utilities, Button/Kbd/Switch/Tooltip variants, focus ring, reduced-motion rules | Both conditions need parity from day one |
| 2 | `lib/random` (`mulberry32`, `hashString`), `lib/format`, `lib/device`, `lib/webgl`, `useFocusTrap` | Small and pure; the compiler needs seeded randomness |
| 3 | Compiler output types modelled on `WallBox`, `Zone`, `DisplaySurface`, door split, `surfacePoint`, `zoneAt` (Zod), with Vitest tests | The compiler is the core research artefact |
| 4 | `meterBox` geometry, procedural textures subset, `useMaterials`, `Wall`, `Floor`, `Box`/`Slab`, `StaticMerge`, `Precompile`, quality tiers (fixed tier), ErrorBoundary, GLTFModel (local decoders) | Render a compiled room shell |
| 5 | `collision` (`buildColliders(manifest)`), `visitor` state, `VisitorController`, `focus.ts`, `pathing.ts`, interaction registry | Walk, select, go-to-concept |
| 6 | `Pedestal`/`Vitrine`/kit `Builder`, `ExhibitObject` + `InteractiveShell` halo, `frameMath` + `WallFigure`, `labelTexture` (with DOM mirror) | Exhibits from graph nodes |
| 7 | `SpotPool`, `TrackLight`, `LightingRig` (one preset), `GalleryEnvironment`, `kelvin` helpers, `PostFX` (AO + SMAA) | Legible, consistent lighting |
| 8 | `ConceptPanel` (InfoPanel `ViewModel`), `FactList`/`StepList`, `ProximityPrompt`, `ImmersiveOverlay`, `LoadingGate`, `WebGLFallback`, `A11yBridge` | Immersive UI. The same `ConceptPanel` body powers the `/learn/2d` page, laid out after `app/guide/*` |
| 9 | Telemetry outbox (extended) + idempotent ingestion in Drizzle + error reporter | First events stored for both conditions |
| 10 | Security headers + CSRF check, pg pool/TLS helpers | Before any participant data |
| 11 | Visual-regression harness (Playwright, SwiftShader, freeze flag), model verifier | Lock parity and "no decoration" in CI |
| Later | `ImmersiveMap` + `TravelFade`, `ControlsDialog`, `A11ySettings`, `PathStepCard`, `ObjectInspector`, `TouchJoystick`, console charts and heatmap, `useConfirm`/`useUnsavedGuard` for the CMS and concept-map editor, S3 presign, asset optimiser, public landing (`--lp-*`), XR (if in scope) | After the slice is validated |
