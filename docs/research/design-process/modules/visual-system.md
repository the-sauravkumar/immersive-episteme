# Visual System (Apparatus): Implementation Decisions

Module record for the implementation of `DESIGN.md` ("Apparatus"). Each work package appends its
own section. The spec is binding. This file records how it was realised, and any judgement taken
where the spec left room, so the paper can report the materials exactly.

## WP0a: Tokens, Fonts and UI Primitives

**Scope:**

- `src/app/globals.css` and `src/app/layout.tsx`.
- The `src/components/ui` primitives: button, card, booktabs table, badge, inputs, tabs, alert,
  dialog, sheet, dropdown and tooltip, plus progress, separator and skeleton.
- `tests/unit/contrast.test.ts` and `tests/unit/button.test.tsx`.

### Tokens

- **Values.** The palette, the high-contrast palettes and the non-colour tokens are exactly
  DESIGN.md 4.2, 4.4 and 4.6.
- **Ratios recomputed first.** Every ratio in the 4.3 and 4.4 tables was recomputed from the hex
  values before it was encoded, with the WCAG relative-luminance formula, truncated to two
  decimals and never rounded. All matched the spec. That includes the series-2d/series-3d
  luminance pair: 0.1127 vs 0.1112 light, 0.4194 vs 0.4203 dark.
- **The test asserts equality.** `tests/unit/contrast.test.ts` asserts each table value by
  equality, not only "at least". If someone edits a token, the CSS no longer matches the binding
  spec and the test fails, even when the new value would still pass AA.
- **What else the test asserts:**
  - the section 15 minimums;
  - AA for every shadcn semantic pair in all four themes;
  - 3:1 for control boundaries;
  - the watch pairs;
  - the sequential-ramp cell labels.
- **Yellow guard.** The guard is broadened from the single `#ffd400` literal to any saturated
  yellow: hue 45-70 degrees, saturation 0.6 or more and lightness 0.45 or more. The ochre tokens
  sit at about 40 degrees, so the guard does not catch them; the lint rule keeps them on public
  pages instead.
- **Semantic mapping in every block.** The shadcn mapping (`--background: var(--ground)`, and so
  on) is restated in all four blocks: `:root`, `.dark`, `.a11y-contrast` and
  `.dark.a11y-contrast`. A custom property that refers to another is resolved where it is
  declared. Without the restatement, a theme class placed on a subtree would keep the inherited
  light semantics.
- **Dark high contrast is complete.** The dark high-contrast block sets every key the light
  high-contrast block sets, and the test asserts this. On `<html class="dark a11y-contrast">`
  both blocks match, so a key missing from the dark block would show its light value.
- **Band lozenge.** The lozenge colour is a token, `--band-lozenge`: ground in light, `#EFE9DE`
  in dark. The spec uses a separate `.dark .ie-band__lozenge` fill rule instead. It renders the
  same.

### Deprecated Aliases (Residual Risk 6)

Other packages are migrating in parallel, so the old names keep working until WP8's dead-alias
test passes:

- **Colour aliases.** `paper`, `ink-soft`, `ink-muted`, `brand`, `brand-hover`, `card-warm`,
  `hairline`, `hairline-strong` and `panel` now resolve to Apparatus tokens.
- **Type and font aliases.**
  - `kicker` renders as the 13 px eyebrow.
  - `text-hero` uses the display-1 size.
  - `font-display` uses Source Serif 4.
- **Retired effects.**
  - The glass `panel` utility is now an opaque ground box with no blur and no shadow.
  - `--shadow-panel-v`, `shadow-card` and `shadow-panel` resolve to `none`.
- **Radius scale.** Tailwind's radius scale is collapsed to 2-3 px. Existing `rounded-lg` call
  sites are therefore square-cut immediately (DESIGN.md 2.6).
- **Button.** Sizes `xs`, `sm` and `lg` render at the 44 px default, and the `icon-*` sizes
  render at 44 x 44. Variant `secondary` renders as `outline`.
- **Badge.** `default`, `secondary`, `outline` and `ghost` render as `neutral`. `destructive`
  renders as `danger`.
- **Tabs.** Both the `default` and `line` variants render the underline style.

### Type Tokens and Class Merging

- **Type tokens.** The type tokens are `@utility` classes (`text-title`, `text-reading`,
  `text-eyebrow`, and so on). Each one sets family, size, line height, weight and the spec's
  colour in a single class. P1 compares exactly these computed properties, so one class per role
  makes them identical in both conditions.
- **Merge fix in `src/lib/utils.ts`.**
  - **Problem.** tailwind-merge read `text-eyebrow` as a text colour, so
    `cn("text-eyebrow", "text-ink")` dropped the type token.
  - **Fix.** The type tokens are now registered as their own merge group. `rounded-control`,
    `rounded-card` and `shadow-console` are added to the merge theme.
  - **Ownership.** `src/lib/utils.ts` is in no package's file list. This edit was needed for the
    primitives to be correct.
- **Measured in the dev server:**
  - `text-eyebrow` renders as 13/20, weight 600, uppercase, in `--ink-3`.
  - Adding `text-ink` overrides only the colour.
  - `text-claim-number` carries `tabular-nums lining-nums`.

### Fonts

- **The two font files.** Cormorant Garamond is removed. Two fonts are loaded, both roman only:
  - Source Serif 4, with variable weight and `axes: ["opsz"]`;
  - Inter, with variable weight.
- **Measured from the dev server.** Every audited page preloads exactly these 2 files: Inter at
  48,432 bytes and Source Serif 4 at 122,168 bytes, 170,600 bytes in all. The budget is 176,000
  bytes. The Source Serif 4 file is also under the 125,000-byte threshold at which DESIGN.md 5.1
  says to drop the opsz axis.
- **Deviation from DESIGN.md 5.1.**
  - The next/font CSS variables are named `--font-source-serif` and `--font-inter`, not
    `--font-serif` and `--font-sans`.
  - Those two names are Tailwind theme keys, and the theme wraps the next/font family in a
    fallback stack. Reusing the name would make the theme variable refer to itself.
  - The rendered families are unchanged.

### Focus, Motion and Study Roots

- **Focus.** One global `:focus-visible` rule draws the focus ring:
  - normally, a 2 px indigo outline at a 2 px offset, plus a 4 px ground halo;
  - in high contrast, the black and white double ring.
  
  Primitives no longer draw their own `ring-3` rings, which would have replaced the halo.
  Measured on a focused link: a solid 2 px rgb(36, 64, 110) outline with a 4 px
  rgb(245, 241, 232) halo.
- **Scroll padding.** `scroll-padding-top` is the height of the tallest study chrome: AccessNotice,
  StudyBar and the 2 px rule, 98 px in all. A focused control is therefore never hidden under the
  sticky bars on any page.
- **Study roots.**
  - `.study-root` and `[data-condition]` (the learning shell's existing attribute) get
    `font-synthesis: none`.
  - While a study root is mounted, a `:root:has(...)` rule sets `transition` and `animation` to
    `none` on every element. This also covers dialogs, sheets and tooltips portalled to
    `<body>`, which a descendant selector would miss.
  - Measured on `/learn/2d` pages: zero elements with a non-zero transition or animation
    duration.
- **Console overlays.**
  - Dialog, sheet, dropdown and select fade in over 150 ms with a 0.98 scale.
  - Sheets offset by 4 px; the old 40 px slide exceeds the 8 px public limit.
  - Nothing lifts on hover.
  - The skeleton pulse is replaced by a static `--sunk` block.

### Primitives: Judgements Within the Spec

- **Close buttons.**
  - **What was built.** Dialog and sheet close buttons are 44 px ghost buttons with a visible
    "Close" label, not an icon with a tooltip.
  - **Why.** DESIGN.md 9.18 allows either. A visible word needs no hover and no tooltip provider,
    and it reads the same with a pointer, a keyboard or a screen reader.
- **Card props.**
  - `parallel` reserves two lines for the title (`min-height: 2lh`).
  - `interactive` gives a card that is wholly a link a `--rule-strong` boundary and a `--sunk`
    hover.
  - `plate` adds the 2 px ink plate head; `CardEyebrow` supplies its eyebrow.
  - The footer keeps `mt-auto`, so `alignment.spec.ts` still passes. It loses its tinted band.
- **Table props.**
  - `caption` and `number` render "Table n." above the table. They also make the scroll box a
    labelled, focusable region.
  - `label` makes the scroll box a labelled region for a table without a caption.
  - `numeric` on a head or a cell right-aligns it with tabular figures.
  - `density="compact"` gives 36 px rows.
  - `rowRules={false}` drops the row hairlines on short public tables.
  - `hoverRows` adds the console row hover.
  - A selected row gets `--wash` and the 2 px indigo bar.
  - Body cells now wrap.
- **Badge.** The status variants (`ok`, `warn` and `danger`) are for the console only. The caller
  always supplies the word and the icon (R-A4).
- **Field errors.** `FieldError` and `FormMessage` render a 16 px alert icon beside the
  danger-coloured text.
- **Checkbox and radio.** Both are 20 px controls with a 44 x 44 hit area. A checked control has
  an indigo fill.

### Verification

- **Unit tests.**
  - `contrast.test.ts` runs 210 assertions.
  - `button.test.tsx` covers the 44 px sizes, the compact hit area, the absence of a press
    translate and the absence of ring classes.
  - Together with the suites that render the primitives, 286 tests pass.
- **End-to-end.** `smoke.spec.ts` and `alignment.spec.ts` pass against the dev server.
- **Screenshots and measurements.**
  - Taken at 1280 px and 390 px on public, 2D learning, research, CMS and admin pages.
  - The dark theme and both high-contrast themes were forced on a CMS table page.
  - No page scrolls horizontally at either width.
- **Remaining sub-44 px controls.** All of them are `h-10` overrides at call sites in other
  packages' files:
  - the learning-phase and hint buttons;
  - the 2D search;
  - the study entry form;
  - the admin user forms.
  
  They are reported to their owners rather than fought from the primitive.

## WP0b: Shells, Display Settings and Brand Components

**Scope:**

- `src/components/shell/*`: the public, console, study and learning shells, PageHeader,
  AccessNotice, the public and console navigation, the console user menu and Display Settings
  (new: `display-settings.tsx`, `display-preferences.ts`, `public-nav.tsx`,
  `console-user-menu.tsx`).
- `src/components/brand/*` (new): wordmark, knock-out band and field, registration ticks,
  outline-then-fill diagram, rule system and numbering.
- `src/components/knowledge/tradition-marker.tsx` (new): the neutral tradition marker.
- `src/components/ui/breadcrumb.tsx`: the 9.16 trail.
- `tests/unit/shell/shell-brand.test.tsx` (new).

### Study Semantics

- No gate, guard, redirect, session read or telemetry call changed. The shells changed only
  presentation: landmarks, classes, copy of the access notice, and the Display Settings sync.
- The access notice is now the same component, slot, copy and 40 px height in both conditions.
  Before, the 2D notice was constrained to the page column and the 3D notice spanned the
  viewport; that difference is removed (parity check P7).

### Display Settings and the Light-Only Study Rule (DR-019)

- **Storage.**
  - The theme stays with next-themes (key `theme`), whose pre-paint script already handles it
    on public and console pages.
  - High contrast and Reduce motion are one JSON value under `ie-display`. Every read and write
    is guarded, so blocked storage falls back to the defaults.
- **Zones.** Each shell mounts `DisplayPreferencesSync` with its zone.
  - Public and console apply every stored choice.
  - Study (`/learn/*`, `/study/*`) forces light and applies High contrast only. The reduce-motion
    class is not written there, because study has no motion and the classes on `<html>` must not
    differ for reasons that have no effect.
- **Why a guard.** next-themes applies its stored theme in an effect of the provider, which runs
  after the shells' effects on a hard load. While a study shell is mounted, a MutationObserver
  strips `dark` again whenever it is added. Leaving a study route gives the stored theme back.
- **First paint.** Effects run after the server HTML is painted. A visitor who chose dark on the
  public site would see one dark frame on a study page, and a high-contrast visitor one
  normal-contrast frame on any page. `DISPLAY_BOOT_SCRIPT` closes this: an inline script for the
  root layout's `<head>`, exported as a plain string from a non-client module. It is not wired
  in yet, because `src/app/layout.tsx` is outside this part (reported as a cross-package need).
  The shells cannot render it themselves: React warns about any `<script>` it creates on client
  navigation.
- **Study placement.** In the study zone the dialog shows only the High contrast switch. It
  reports every change through `onChange`, so the study engine can record the accommodation on
  the session (DR-019). The dialog's own copy is identical whichever condition follows.
- **The switch.** Each switch is a 44 px `role="switch"` button. The visible word "On" or "Off"
  carries the state; the square track (indigo when on) is a second cue, so colour is never the
  only one (R-A4).

### Shells

- **Public.**
  - Header links are exactly the 9.16 list: About, Explore, Accessibility, Privacy and
    "Staff sign in", which is now a plain text link, not a pill.
  - The earlier "Take Part" link is removed from the header, because 9.16 does not list it.
    Participants reach `/study` from the facilitator or the home page's own call to action.
  - The current page is underlined 2 px indigo and carries `aria-current`. Under 768 px the
    links fold into a 44 px "Menu" sheet.
  - The footer links "Image credits" to `/about#images-and-licences`, the About section WP1
    builds. Institution lines are omitted until `src/config/institution.ts` exists.
- **Console.**
  - The rail eyebrows are "Content Console", "Research Console" and "Admin Console" (9.16), not
    the longer route-table area labels. The area switcher uses short tab labels: Content,
    Research, Admin.
  - Under 768 px the rail becomes a top strip, and its links fold into a 44 px "Sections" sheet.
    The earlier horizontally scrolling link row is gone.
  - The user menu is a non-modal dropdown, so the Display Settings dialog opened from it takes
    focus cleanly.
- **Bands and rules above PageHeader.** `ConsolePage` derives this from the route:
  - research pages get the 48 px knock-out band, bled to the edges of the console main so it
    meets the top bar's running-head rule like a masthead;
  - CMS and admin pages get a plain 2 px ink rule.

  The band beneath a running-head rule draws no extra high-contrast rule (`hcRule={false}`), so
  high contrast shows one 2 px rule, not a doubled 4 px one.
- **Study.**
  - The column is 40rem plus gutters. While a React Flow canvas (the concept-map task) or a
    `data-study-wide` wrapper is on the page, it widens to 72rem, so the map keeps its working
    width without any change to the task.
  - "Step n of N" renders when a page passes it. The layout cannot know the step, so the shell
    takes an optional `step` prop and exports `StudyStepCount` for pages.
  - The root carries `study-root`, which turns on the WP0a zero-motion and font-synthesis rules.
- **Learning.**
  - The root sets `--notice-offset`: 40 px while the access notice is present, 0 otherwise.
    The StudyBar can then stick directly under the notice in both conditions.
  - The notice copy has three lengths, by viewport width, so the 40 px strip never wraps. The
    "End demo" ghost button keeps its 44 px target by overhanging the strip by 2 px each side;
    it has no visible box, so nothing shows outside the strip.
- **PlaceholderNotice.** It renders nothing and is kept only as a deprecated export, so the
  public pages that still import it compile until WP1 removes them. No dashed box is ever
  rendered.

### Brand Components

- **Knock-out band.** It reproduces the 7.2 tiles exactly:
  - the 24 px header band uses a 48 x 24 tile with one lozenge and one dot;
  - the 48 px console band is the top half of the 96 px field tile, so one row of lozenges and
    dots;
  - the field tile is on a straight grid (DR-019).

  Pattern ids come from `useId()`. `KnockoutField` rounds to whole 96 px cells, so the edges
  always seam.
- **Outline-then-fill diagram.**
  - Data-driven (nodes and edges). It renders a fill layer, then an outline layer with identical
    geometry, then text, as the rekh and datai blocks register (R-C8). The unit test asserts that
    the two layers' rectangles are identical.
  - Fills are limited by type to sunk, wash and indigo.
  - Draw-on edges are fully drawn on the server and on first paint. They animate only when the
    diagram starts outside the viewport and the visitor has not asked for reduced motion.
- **Rule.** Running-head, hairline and booktabs rules are borders, so they survive forced
  colours. The public madder section rule is deliberately not here: the section 15 lint keeps
  madder inside the public files.
- **Numbering.** One module formats "Fig. n", "Plate n", "Figure n", "Table n", claim numbers
  and "Step n of N", so the wording cannot drift between places.
- **Tradition marker.** It takes no styling input at all. `traditionKey` only adds a data
  attribute for tests. The unit test asserts byte-identical markup for all six keys (P17).
- **Breadcrumb.** `BreadcrumbTrail` collapses middle crumbs behind a 44 px "…" summary. It is a
  native `<details>`, so the trail works as a server component with no client JavaScript and can
  take a tracked link component. The trail keeps the full path in `title`, and under 520 px shows
  only "← Parent". The compositional parts keep their names and the `aria-label="breadcrumb"`
  that the 2D e2e test uses.

### Verification

- **Unit tests.** `tests/unit/shell/shell-brand.test.tsx` has 20 tests covering:
  - the Display Settings zones;
  - the light-only study guard and the boot script;
  - the study shell;
  - PageHeader bands and rules;
  - the brand components;
  - the breadcrumb.
- **Measured headless at 1280 and 390 px.**
  - No horizontal overflow on the home, explore, sign-in, study entry, 2D index and tradition
    pages, research, CMS concepts or admin users.
  - The access notice is 40 px in both widths.
  - Zero elements with a transition or animation on 2D study routes.
  - Dark chosen on the home page, then `/study` loaded: rendered light, `rgb(245, 241, 232)`.
  - High contrast stored: the public band is replaced by a single 2 px rule.
  - Study pages carry `a11y-contrast` and no `a11y-reduce-motion`.
  - Every shell control is at least 44 x 44. The remaining smaller controls are page content in
    other packages.

## WP0c: Shared Knowledge Components and Graph-Derived Diagrams

**Scope:**

- The shared knowledge components in `src/components/knowledge/`: `KnowledgeSheet`, `ClaimList`,
  `KnowledgeFigure`, `FigureLightbox`, `LayerTabs` and `LayeredField`, `RelatedConcepts`, `Pager`
  and the SVG renderer `StructureDiagramSvg`. Also `CitationNote` and `CitationRecord` in
  `src/components/citations/citation-disclosure.tsx`.
- The learning components in `src/components/learning/`: the new `StudyBar` and `Onboarding`,
  plus restyles of `guidance.tsx`, the timer in `learning-phase.tsx` and the "under review"
  notice.
- `src/features/learning/labels.ts` (layers, canonical order) and the new
  `src/features/learning/strings.ts`.
- The figure resolution in `src/features/knowledge/read/view.ts` and `read-model.ts`, and the new
  diagram generator `src/features/knowledge/read/diagrams.ts`.

### One Component Set, No Placement in the DOM

- **What placement changes.** `KnowledgeSheet` takes `placement="page" | "panel"`, but nothing in
  its DOM depends on it. The only difference between the two placements is what the caller puts
  in the reserved 44 x 44 action slot (Close in 3D, empty in 2D). The unit test renders both
  placements and compares the HTML.
- **Reading progress.** The progress bar finds its own scroll container: the nearest scrollable
  ancestor, else the window. So the 2D window and the 3D panel are measured by the same code, and
  the component needs no placement switch.
- **Padding doubles as the gutter.** The sheet's own padding (16 px under 520 px, 24 px above) is
  also the page gutter. A placement must therefore not add a gutter of its own. At 390 px the 2D
  column and a full-width 3D panel then give the claims the same measure (measured: 322 px in
  both). At 1280 px the claim box measured 544 px in the page and 543 px in a test panel whose
  container drew a 1 px left border inside 39.25rem. WP3 should draw that border outside the
  39.25rem.
- **Condition differences are behaviour, not style.** How a link behaves (navigate in 2D, walk in
  3D) is the only allowed difference (12.1 rule 3). `RelatedConcepts` and `Pager` take a
  `renderLink` callback that receives the same class names in both conditions, so the two
  conditions differ only in behaviour.
- **Focus on open.** The h1 has `tabindex="-1"` and takes focus when a concept opens, with
  `preventScroll`. The CMS proof turns this off with `autoFocusTitle={false}`.

### Citations

- **Short label.** `shortCitationLabel()` builds the label from the bundle's fields:
  - the first author, with any parenthetical removed, the first of several authors, and
    "Surname, Given" shortened to the surname;
  - else the publisher;
  - then the year (only a year above 0, because some records carry 0);
  - then the citation's own locator.
- **Cutting.** Long parts are cut only at a word boundary and marked with "…". Nothing is written
  into `content/`.
- **Accessible name.** The note button carries an explicit name, "Source: <label>". The visible
  text is "SOURCE" plus the label, so the name contains the visible label (WCAG label in name).
  The explicit name also gives the same result in every accessibility engine.
- **Quote.** The verbatim quote is set in `text-quote`, the same size as the claim, with a 2 px
  indigo rule. Each supporting passage is its own block, with its locator in `text-credit`.
- **Old name.** `CitationDisclosure` is kept as an alias of `CitationNote`, so existing call sites
  keep working.

### Graph-Derived Diagrams (DR-018)

The generator is pure and deterministic. It builds three diagram types per tradition from one
snapshot. The selection rules below are judgements, recorded here for the paper.

- **Process sequence.**
  - What it draws: the ordinalled PRECEDES edges between the tradition's process stages, in
    ordinal order, laid out three per row and wrapping at the end of each row.
  - Anchor: the first stage in the chain that has a claim.
- **Materials and tools.**
  - What it draws: the USES and REQUIRES edges from ONE stage to material and tool concepts.
    REQUIRES edges to other stages are excluded, because they are not materials or tools.
  - Which stage: the stage, other than the sequence anchor, with the most such edges; ties go to
    the stage that comes first in the chain.
  - Why one stage: drawing every stage's materials (27 USES edges for Ajrakh) cannot be read in a
    3:2 slot at the 544 px measure. One stage per figure also keeps "at most one figure per
    concept".
- **Colour mechanism.**
  - What it draws: every path from a stage or material of the tradition through one to three
    SCIENTIFICALLY_EXPLAINED_BY hops to a scientific mechanism that PRODUCES an outcome. Nothing
    else is drawn.
  - The anchor must be a science-section concept of the tradition (DESIGN.md 9.9). It is chosen
    by the first rule that applies:
    1. a science concept of the tradition that lies on a colour path (Sanganeri: "One Dye Bath,
       Two Colours");
    2. else one that a colour-path stage is explained by, with that edge added (Machilipatnam:
       "Mordant-Selective Colour Development");
    3. else the one that explains the process stage nearest in PRECEDES order to a colour-path
       stage, with that stage and edge added; ties go by concept key.
  - Ajrakh's colour paths run only through shared mechanisms, so rule 3 applies and gives "Lime
    Blocking of Alum and Iron" (Khariyanu, one step before Kut).
  - Columns follow depth along the drawn edges, so every arrow points right. Every edge in one
    column gap has the same type, so its label is printed once above that gap (a "band label").
    The per-edge labels used in the other two types do not fit in 40-48 px gaps.
- **Text.** Node labels are the concept titles in Title Case and nothing else. Edge and band
  labels are the registry's own labels ("precedes", "uses", "is scientifically explained by",
  "produces"). The alt text lists every node and edge in reading order. The caption names the
  tradition, the end points or outcomes and the anchor, and points to "statement 1" (every
  diagram anchors on claim 1). The credit line reads "Diagram generated from the project's
  knowledge graph (snapshot <label>)".
- **Balance.** A diagram type is kept only when every tradition in the balance set has it. The
  balance set is the study traditions in scope, else every tradition in scope. On the current
  content, all three study traditions get all three types, in the same sections: two in process,
  one in science. Bagh has no colour path, so outside a study whose scope includes it, Bagh shows
  two types.
- **Protocol switch.** `figures.structureDiagrams` is in the study contract (default on). It
  reaches both conditions through `settings.figures` and removes every diagram from both.
- **Layout.**
  - A 576 x 384 viewBox (3:2).
  - Text size steps down from 13 px to 12 px and then 11 px until the layout fits.
  - Box widths are estimated at 0.56 em per character, a safe margin over Inter's average. A word
    too long for a line breaks after its own hyphens; nothing else is cut.
  - Process rows are only as tall as their tallest label.
- **Drawing.** Ink outlines on the figure's `--sunk` mat and boxes on `--ground`. The anchor is
  the one indigo accent (a 2 px outline). All colours are tokens, so high contrast applies.
- **Limitation, the same in both conditions.** At 390 px the scaled diagram text is about 7 px.
  The text equivalent and the lightbox carry the content. On a desktop the inline text renders at
  about 11-12 px, and the 768 px lightbox at 15-17 px.
- **Photographs.** `photoFiguresOf()` and `resolveConceptFigures()` are in place, with at most one
  figure per concept, and the diagram takes the slot while the switch is on. No photograph is
  served to learners until WP6's figure route and licence governance exist.

### StudyBar, Guidance, Onboarding

- **StudyBar size.** It is 56 px plus a 2 px ink rule, and it is box-content, so the chrome
  height stays `--sticky-chrome`.
- **Narrow screens.** Under 768 px, in both conditions, the wordmark hides, Hint shows only its
  icon (still named "Hint"), and "Time left" shows only its digits. Measured at 390 px with three
  3D navigation buttons: nothing overflows, and every control is at least 44 x 44.
- **Finish.** The button reads "Finish", and its accessible name is "Finish learning" (or "Finish
  practice").
- **Stall cue in high contrast.** The stall cue uses the reserved yellow guidance cue only under
  `.a11y-contrast`: `#111111` on `#FFD400`, about 14:1. The yellow is in a component class, not in
  `globals.css`, so the contrast test's no-yellow guard still covers every token.
- **Onboarding.** It is one screen in both conditions, with numbered steps. Only the movement step
  differs: 36 words in 2D and 38 in 3D. The line-art key shows only the shared controls and one
  "Navigation" box, so the key is identical in both conditions too.

### Layers and Canonical Order

- **Layers.** `KNOWLEDGE_LAYERS` (Overview, Artisan, Process, Science, Compare) uses the museum's
  tab ids, so telemetry keeps its values. `LayeredField` can log the museum's existing events
  (`information_layer_opened`, `knowledge_layer_selected`), so either placement can emit the same
  events.
- **Canonical order.** `compareTraditions` sorts by display name, and
  `CANONICAL_TRADITION_SLUGS` lists the six traditions in that order. The bundle's names
  ("Ajrakh resist block printing (Kutch Ajrakh)", "Machilipatnam (Pedana) ...", "Sanganeri hand
  block printing") sort into the same order as the slugs.

### Verification

- **Tests.**
  - `tests/unit/knowledge/diagrams.test.ts` (23 tests, over the real content built into a review
    snapshot) checks:
    - every node is a concept and is labelled only with its title;
    - every edge is a relationship of the stated types between drawn nodes;
    - band labels only repeat edge labels;
    - the anchors lie in the right section;
    - no boxes overlap;
    - the output is deterministic;
    - the types and figure counts are equal per study tradition, 3 figures each;
    - balancing and the switch work.
  - `tests/unit/knowledge/knowledge-components.test.tsx` checks:
    - the sheet's DOM is the same in both placements;
    - the order of the sheet's parts and focus on the h1;
    - claims and citation notes;
    - the figure slot, Enlarge, the lightbox and focus return;
    - the layer keys;
    - grouping by verb;
    - StudyBar shared-group identity;
    - onboarding parity.
- **Headless check.** A headless check at 1280 and 390 px on a temporary preview route, removed
  afterwards, showed no horizontal overflow on any of the nine study figures.

## WP2: 2D Learning UI

**Scope:**

- The 2D routes under `src/app/(learning)/learn/2d/` (index, tradition, concept, categories,
  category, comparisons, search, practice).
- `src/features/learning-2d/` UI, `navigation.ts` and `server/data.ts`.
- `tests/unit/learning-2d/*` and `tests/e2e/learning-2d-browse.spec.ts`.

The 2D-only `claim-list.tsx`, `related-concepts.tsx`, `relation-details.tsx`, `pager.tsx` and
`reading-progress.tsx` are deleted. The concept page now imports `KnowledgeSheet`, `ClaimList`,
`RelatedConcepts` and `Pager` from `@/components/knowledge`, the modules the 3D panel uses.

### Chrome: the Shared StudyBar

- **One bar for both conditions.** The old 2D site header is replaced by the shared `StudyBar`.
  The 2D condition group holds Contents, then Search, then "Up to <parent>" on concept pages.
  Nothing else stacks above the content. Measured at 1280 and 390 px: the bar is 58 px (56 plus
  the 2 px rule) on every 2D route.
- **Contents.** A left sheet lists the study traditions in the canonical order, each with the
  neutral marker and its ten template sections, then the browse pages (Craft Traditions,
  Knowledge Categories, Comparisons). This matches the onboarding wording ("lists the traditions
  and their sections"). Every link is 44 px.
- **Search.** A top sheet with a 44 px labelled field. It is rendered only when
  `ctx.features.search` is on, which is off in study builds (DR-019).
- **Exposure while a sheet is open.** The open sheet covers the page, and an IntersectionObserver
  cannot see that. So `ChromeOverlayProvider` tells the page's `ExposureRegion` to count
  navigation ("menu") instead of exposure while a sheet is open, and to resume exposure when it
  closes. Event names and payloads are unchanged. Before this, opening Contents over a concept
  would have been logged as reading.
- **Location on the first paint.** The bar is rendered once by the layout, which cannot see the
  page's data. The layout therefore loads a compact index: the study traditions, plus each
  in-scope tradition concept and comparison by slug, with its title and parent. The bar resolves
  the location and parent from the URL with it (`studyBarPlace`). A concept page also names
  itself (`StudyBarLocation`). This covers shared concepts that are reached only through links.
- **"Up to <parent>".** The label is the concept's section ("Up to Process Sequence"). It is not
  the tradition name: the display names ("Ajrakh resist block printing (Kutch Ajrakh)") would
  crowd the bar. The link opens that section on the tradition page through the URL hash. The
  link uses `STUDY_BAR_LINK_CLASS` and `StudyBarLabel`, so it has the same style as the
  condition-group buttons. A comparison's parent is the comparisons page. A shared concept has
  no parent, so no control is shown.
- **Hash links on the page already shown.** The router changes the hash without a `hashchange`
  event. After a same-page section link in Contents, the bar waits (up to 60 frames) for the
  hash and then dispatches the event, so the section disclosure opens and takes focus.
- **Focus.** The concept h1 takes focus on open (the shared `SheetTitle`, P27). Other pages focus
  their h1 only after an in-app navigation. The bar counts navigations by comparing paths, so
  React Strict Mode's repeated effects in development do not count as navigations.

### Pages

- **One column.** Every 2D page is one column at the sheet's width: `min(39.25rem, 100%)` with
  16/24 px padding. Measured: the claim measure is 544 px at 1280 px and 322 px at 390 px, the
  same on concept, tradition and practice pages.
- **Concept page.**
  - The `KnowledgeSheet` sits directly under the chrome. There is no breadcrumb and no side rail.
  - **LayerTabs, as in 3D (DR-021, below).** The sheet carries the same layers as the 3D panel
    for the same concept, through the shared `LayerTabs`. One layer and one concept are shown at a
    time; a layer with several concepts shows the panel's chooser.
  - The shown concept's claims (with figures and comparison blocks) are the one `ExposureRegion`,
    attributed to that concept and `exposureLayerOf(its type)`, as in 3D. The region is a plain
    `<div>` (a measuring frame with data attributes, no role and no label). An earlier labelled
    `<section>` added a region landmark that the panel's field does not have, so screen-reader
    users met a different landmark tree for the same sheet.
  - **A pager only on a sequence station (DR-021).** The 3D panel renders a `Pager` only for a
    stop of an ordered sequence. 2D used to page every other concept through its template section
    ("Materials and Tools: previous and next", with the next concept's title), a 2D-only control
    and cue inside the equalised sheet that changed its length and Tab sequence (P18, P24, P25).
    `pagerFor` now returns a pager only for a station, with the shared default label, and the
    parity test checks pager presence and targets for every placed concept.
  - Related Concepts follows the concept shown, as in the panel.
  - Related concepts and the pager follow the field and are navigation, as before.
  - Figures come from `getConceptFigures(ctx.snapshotId, id, { traditionSlugs,
    structureDiagrams })`, the values the 3D payload passes.
  - The links keep their telemetry: `relationship_followed` for related links and sequence moves,
    `content_item_selected` for a sequence move with no in-scope PRECEDES link.
- **Index.**
  - The three study traditions are equal stacked cards in the canonical order. Each has the
    neutral marker, a title zone and one region line (state and country). There is no image slot
    and no count.
  - The title zone reserves two lines only while the column is narrower than the sheet width
    (under 628 px), where long display names wrap. At the full sheet width every study name fits
    on one line, so no empty band is left. Measured: 580 x 90 px for all three cards at 1280, and
    358 x 118 px for all three at 390.
  - Knowledge categories are a booktabs table of 44 px row links. The one-line descriptions come
    from the reference vocabulary (`KNOWLEDGE_CATEGORIES`), so no text was written for them.
  - Both browse tables have one fixed first-column width (9rem, 12rem from 520 px), so the
    category table and the comparisons row share one column edge (measured: 542 px at 1280 and
    160 px at 390, in both tables).
  - The comparisons entry is one row in a table of the same style.
- **Tradition page.**
  - A labelled `<dl>` gives Also Known As (one name per line), Region and GI Status.
  - The overview claims use the shared `ClaimList`, with the overview concept's figures.
  - The GI record is a `<dl>` (application, year, sources), not a run-on line.
  - The ten section disclosures follow 9.13: 56 px rows, a 20 px chevron in a 44 px box, the label
    in `text-h2`, no count, instant.
  - Section lists are 44 px link rows in the shared RelatedConcepts link style, with process steps
    numbered in the hang.
- **Comparisons page (11.5 as specified).** One block per aspect (a comparison concept): the
  aspect as an h2 and a "Read the comparison" link, then every study tradition in the canonical
  order as an h3 with the marker. Under each tradition come each compared concept's title (an h4
  that links to its page) and its claims, through the shared `ClaimList` with figures and
  `CitationNote`s, at the sheet measure. A tradition with none says "Not compared for this
  tradition." There are no matrix cells and no counts. This replaces the earlier link-only page,
  which departed from 11.5 without a DR.
  - **Exposure stays attributed to one concept (DR-015).** Each compared concept's claims are
    their own `ExposureRegion`. The page's `ExposureGroup` lets exactly one region count at a
    time: the in-view region with the most visible height (the first on a tie). With none in
    view, the page counts navigation ("catalogue"). Event names and payloads are unchanged.
  - **Aspects compared.** The page holds 12 aspects and over a hundred claims (about 27,000 px
    tall at 1280 px), so it opens with a one-column list of the aspect links ("Aspects
    Compared", an h2 in `text-h3`; 44 px rows; no claim text, no counts). Each link jumps to its
    aspect's h2 (the page's `scroll-padding-top` keeps it under the chrome). It is the 11.5
    overview without the four-column table, which would scroll sideways at 390 px. The links are
    plain in-page anchors: the page is not left, so nothing is logged as an entry or a selection;
    the `ExposureGroup` records what comes into view.
- **Comparison concept pages.** After the claims come "Compared Concepts" and "Similarities and
  Contrasts". The markup copies the 3D panel's `ComparisonBlocks` element for element: an h3 in
  `text-h3`, a flat list with a type and tradition line, bare titles and `SHEET_TEXT.statedBy`.
  The compared concepts themselves are under the Compare layer, as in 3D. The copy lives in
  `layer-parts.tsx` until WP0 moves the blocks into `src/components/knowledge`. Until then a
  change must be made in both files, and comparison concept pages are not counted as
  parity-clean.
- **Categories, category and search pages.** These group by tradition in the canonical order,
  with tradition-less items last (`byCanonicalTradition`). Search keeps its ranking within each
  tradition.
- **Counts are hidden in every mode.** This includes the public demo, so the demo shows reviewers
  exactly what a participant sees. The museum shows no counts either.
- **Content unavailable.** It uses the StateMessage layout (32 px outline icon, Source Serif h1,
  one `text-reading` sentence) and has no outbound action. The shared `StateMessage` component
  does not exist yet, so this layout is a stand-in until WP0 builds it.
- **Practice.** The practice item is the shared KnowledgeSheet, placed as on a concept page. It
  has the metadata list and step eyebrow, LayerTabs (Overview and Process), claims with a practice
  `CitationNote` (the platform is the source), a practice diagram in the figure frame with Enlarge
  and the lightbox, Related Concepts with "About these links", and the pager. The pager names the
  steps before and after the item (Practice Step 1 and Practice Step 3), as the eyebrow ("Step 2
  of 3") and the diagram do; practice has no step pages, so a move returns to the item's title.
  The related links point at the practice sections and are typed as explanations, so they never
  read as steps. The placeholder sections follow it. Every text is interface wording. Search should follow the protocol, but the
  practice context does not carry that setting yet, so Search stays off (the study default).
- **Search heading.** "Results for" is in Title Case; the learner's query is shown verbatim.
- **List rows.** In every concept list (category, search, sections) the type label sits on its
  own line under the link, so every row has the same structure. A link with a type line keeps a
  fixed 12 px above and below its text, so a one-line title still fills the 44 px row and a wrapped
  title does not run into its label. Earlier, a negative margin assumed one line and the label of a
  wrapped title touched it ("Block Set: Rekh (Outline), Datta (Filler) and Background Blocks" at
  390 px). Measured: the gap is 5 px on every labelled row of the Tools category (20 rows, 1
  wrapped) and of a search for "dye" (16 rows, 5 wrapped) at 390 and 1280 px.
- **Hidden previous route.** With `cacheComponents`, Next keeps the previous route in the DOM,
  hidden (`display: none`), for a while after a client navigation. So a concept page can briefly
  hold two sheets, one of them hidden. That copy has no layout: its exposure region does not
  intersect, and focus moves to the visible h1 (measured after three pager moves, by mouse and by
  keyboard). Probes and tests must select visible elements (`:visible`), not the last match in
  the DOM.
- **GI record.** The GI Source values are the full source titles (with the year), never a label
  cut mid-word (9.8).
- **Learning-task prompts never stack above the content (11.5).**
  - From 1024 px, the width at which the museum docks its panel and keeps the prompts over the
    scene (top left, persistent), the prompts are a persistent panel in the left margin, outside
    the reading column (166 px wide at 1024 px, up to 24rem). It is a margin column spanning the
    content with the panel sticky inside it, so it starts 1rem under the whole chrome (the "under
    review" strip included) and stays 1rem under the sticky chrome while the page scrolls. The
    earlier `fixed` panel sat under the AccessNotice offset only, so in the demo it overlapped the
    StudyBar by 24 px on the first paint. The
    earlier threshold, 1204 px, put them after the sheet between 1024 and 1203 px: persistent in
    3D but below the fold in 2D at common laptop widths (R-L5). The 2D margin panel is narrower
    than the museum's (363 px at 1024), so a prompt wraps onto more lines, but it is visible in
    both conditions at the same widths.
  - Narrower, on a concept page, they follow the sheet. Below 1024 px the museum's full-screen
    panel covers its prompts.
  - On the other pages, which have no measured 3D counterpart, they stay at the top of the column.
  - So P6 and P8 no longer depend on whether a protocol sets prompts.

### DR-021 (Proposed for the Decision Log): The Same Concept Layers and Pager in Both Conditions

(Numbered DR-021 because DR-020 in the decision log is the photograph decision. Code and test
comments cite DR-021.)

- **Context.** The 2D concept page showed one layer (the concept's own claims). The 3D panel
  showed LayerTabs with the exhibit's attached concepts (artisan, science, explanation, compare
  counterparts, process). DESIGN 9.6 makes LayerTabs the only layer navigation in BOTH conditions,
  and 12.1 rule 3 does not allow this difference. It changed P11 (switch layer), P13 (Tab stops
  from the h1) and the offset of the claim block (P8, P18).
- **Decision.** The 2D sheet builds the panel's layer set from the read model (`conceptLayers` in
  `src/features/learning-2d/navigation.ts`), with the mapping the compiled manifest uses:
  - artisan: the concepts that PRACTITIONER_EXPLAINS it;
  - science: the concepts it is SCIENTIFICALLY_EXPLAINED_BY;
  - an EXPLAINS explainer: under artisan, process or science by its type (`exposureLayerOf`);
  - compare: cross-tradition SIMILAR_TO / CONTRASTS_WITH counterparts, and the compared concepts
    of a comparison;
  - process: the concept, when it is a station of an ordered sequence (the tradition's process,
    another ordered PRECEDES sequence, or a shared one).
  - Entries keep the manifest's order, except the Compare layer, whose chooser lists its concepts
    in the canonical tradition order (DESIGN 12.3 rule 12, DR-019), stable within a tradition. The
    3D panel must apply the same sort (requested from WP3); until it does, the order of the
    Compare chooser differs between conditions for comparison concepts, and the parity test sorts
    the 3D list and carries an `it.fails` that turns red once the panel sorts.
  - Sequence stations also get the eyebrow "Step n of N" and the sequence pager, as in 3D. No
    other concept has a pager in either condition (the panel shows a `Pager` only for a sequence
    stop), so the sheet has the same length, controls and Tab sequence for every concept.
- **Evidence.**
  - `tests/unit/learning-2d/layers.test.ts` compiles the curated content into a manifest. For
    every placed concept it checks that `buildPanelModel` (3D) and `conceptLayers` (2D) give the
    same layer ids, concepts and order. It also checks that every station has the same ordered
    sequence and position, and that a concept has a pager in 2D exactly when the panel has one,
    with the same previous and next concepts.
  - Measured in the browser: the keyboard path from the h1 to the first CitationNote is 2 Tab
    stops (the selected tab, then the note) at 1280 and 390 px, as in the panel.
- **Telemetry.** Switching layers logs what the panel's `setTab` logs: `information_layer_closed`
  (previous layer, openMs), `information_layer_opened`, `knowledge_layer_selected` (artisan,
  process, science), and `concept_encountered` when another concept is shown. No event name or
  payload is new.
- **Not equalised.**
  - The 2D head of an attached concept offers "Go to this concept" where the panel offers "Walk to
    this exhibit" (12.1 rule 3: how a link acts).
  - Both conditions mark the current stop "This concept" (the panel's `PANEL_TEXT.thisConcept`).
    The remaining need is to move this and the other shared layer strings into `strings.ts`
    (WP0/WP3), so one string serves both.
- **Paper.** Report that both conditions present the same layers per concept, by construction and
  by test.

### Known Differences Left to Other Packages

- **Two notice strips in the demo.** The "under review" strip is rendered in the notice slot
  above the StudyBar. In the demo (always unverified) it stacks under the AccessNotice, so the
  chrome at the top of the page is 40 + 40 + 58 px. Merging the two strips (9.15) is a WP0 task.
  When it lands, the notice line in the frame goes.
- **Shared parts still copied.** `SequenceList`, `LayerConceptHead`, the concept chooser and
  `ComparisonBlocks` exist both in 2D (`layer-parts.tsx`, `concept-layers.tsx`) and in the 3D
  panel. They belong in `src/components/knowledge` (WP0).
- **Citation labels.** The "Stated by" names use the source's display label, as in 3D. That label
  (`sourceDisplayLabel` in `view.ts`) can cut a long publisher name mid-word. WP0 should cut it
  at a word boundary, which fixes both conditions at once.
- **High contrast arrives late on a hard load.** `DISPLAY_BOOT_SCRIPT`
  (`src/components/shell/display-preferences.ts`) is not rendered by any layout. So `.a11y-contrast`
  is set after hydration, 250 to 750 ms after DOMContentLoaded, on every 2D route (and, through the
  same root layout, in 3D). A high-contrast participant sees the light theme first. This is the
  same in both conditions, but it breaks the script's own promise ("never flashes the wrong
  theme"). Mounting the script in the root `<head>` is a WP0 task.
- **Numbered step titles.** Sanganeri's process stage titles start with their own number ("1.
  Scouring and Bleaching the Grey Cloth"), so the hang number and the title's number both show.
  The hang numbers stay for all three traditions (equal salience; the 3D sequence list shows the
  same pair). This is flagged to the curation effort; no content was edited.

### Verification

- **Unit tests** (`tests/unit/learning-2d`: 4 files, 40 tests and 1 expected failure). New in
  the review round: pager presence and targets per placed concept in both conditions; the Compare
  chooser in the canonical tradition order (with the `it.fails` that tracks the pending 3D sort);
  no pager for a non-station concept. Earlier in this package:
  - layer parity and sequence parity with the 3D panel over the curated content;
  - one exposure region at a time on a page with several (`ExposureGroup`);
  - prompts after a concept's sheet, and before the content on other pages;
  - LayerTabs with the chooser, Related Concepts following the shown concept, and the layer
    telemetry.
- Earlier unit tests:
  - verb grouping and Title Case link names, with `relationship_followed` unchanged;
  - Search shown only when enabled;
  - the location and "Up to" control derived from the URL;
  - the Contents order and sections, and navigation (not exposure) while Contents is open;
  - section disclosures with no counts;
  - canonical ordering, parents, and the 2D half of comparison reachability (residual risk 11).
- **e2e.** `tests/e2e/learning-2d-browse.spec.ts` (h1 focus, "Up to", LayerTabs by keyboard and
  the Process layer, `information_layer_opened`, a pager only on a station): 2 of 2 passed.
- **Review-round measurements** (headless, one browser):
  - a material concept has no pager at 1280 and 390 px, light and high contrast; a process stage
    has the sequence pager with the default label;
  - every exposure region is a `<div>`;
  - the comparisons page's aspect list has 12 rows, each at least 44 px; a jump puts the aspect
    h2 directly under the sticky chrome at both widths;
  - the practice pager reads "Practice Step 1" and "Practice Step 3";
  - prompts slot (the slot's own classes with a sample panel injected into a live concept page,
    because the demo protocol has no prompts): at 1024, 1100, 1203 and 1280 px it sits in the left
    margin 16 px under the whole chrome on the first paint and 16 px under the sticky chrome after
    scrolling, 40 px clear of the text column, with 0 px overflow; at 1023 px it is in flow after
    the sheet. A live run with a protocol that sets prompts is still open.
- **Headless audit** (one browser; 1280 and 390 px; light and high contrast), over index,
  tradition, concept, comparison concept, comparisons, categories, category, search and practice:
  - 0 px horizontal overflow;
  - 0 elements with a transition or animation;
  - no interactive element under 44 x 44, apart from the visually hidden skip links;
  - body `rgb(245, 241, 232)`.
- **Navigation flow** (client navigation, pager, Contents, a same-page hash link, "Up to",
  Search): the location and focus were correct at both widths.

## WP3: 3D Museum Overlays

**Scope:** the overlays of `/learn/immersive` and its practice room. The files are
`src/components/museum/overlays/` (info panel, StudyBar wrapper and room list, plan, screens) and
`museum-app.tsx`. The scene lettering is in `three/labels.ts` and the scene colours in
`three/resources.ts`. The panel content is built in `src/features/immersive/` (`panel-content.ts`,
`types.ts`, `server/payload.ts`). The immersive pages and their tests are also in scope.

### The Panel Is a Placement of the Shared Sheet

- **The museum has no knowledge markup of its own.** The information panel renders the shared
  `KnowledgeSheet`, `ClaimList`, `LayerTabs`, `RelatedConcepts` and `Pager`. The museum's inline
  claims, its own tabs and its copy of `RelationDetails` are deleted, and so is `PANEL_TAB_LABELS`.
  Layer ids, names and order come from `KNOWLEDGE_LAYERS`; `PANEL_TABS` is derived from it. A unit
  test checks the derivation.
- **Docked at 1024 px and wider.** The panel is docked right, full height below the chrome, on
  opaque `--ground`, with no radius, shadow or blur.
  - The 1 px `--rule-strong` left border sits outside the 39.25rem sheet, as WP0c asked.
  - The panel always shows its scrollbar (`overflow-y: scroll`), and the scrollbar's measured
    width is added to the panel width. So the sheet keeps its full 39.25rem in both conditions.
- **Why `scrollbar-gutter: stable` is not used.** Chromium reserved a 15 px gutter with it even
  where scrollbars overlay, which made the claims 529 px wide instead of 544. With the measured
  scrollbar the claim box is 544 px at 1280 and 322 px at 390, the same as the 2D column.
- **Below 1024 px.** The panel covers the whole scene below the chrome, exactly mirroring the 2D
  column. The scene overlays get `inert` meanwhile, and the plan is hidden.
  - The panel stays a complementary region, not an `aria-modal` dialog. The StudyBar above it
    (Hint, Time left, Finish) must stay reachable, and in 2D those controls are reachable from the
    content too (P24).
- **Focus.**
  - Opening an exhibit moves focus to the sheet h1, through the shared `SheetTitle`.
  - Escape or Close returns focus to the control that opened the panel. If that control is gone,
    focus goes to the exhibit's row in "In this room", else to the scene region.
  - Escape inside a dialog, such as the figure lightbox or the plan, closes only that dialog.
  - Each exhibit mounts a new panel, so an exhibit always opens at the top of its sheet.
- **No camera motion while the panel is open.** The camera's framing for the docked panel is set
  before the walk to the exhibit, so the walk ends already showing the framed view. Opening the
  panel then changes nothing on screen. Before, the camera turned after the panel had opened. (The
  framing is now a lens shift, not a turn; see the second review round.)
  Below 1024 px the panel covers the scene, so there is no offset; the old bottom-sheet tilt is
  removed with the bottom sheet.
- **Links walk, they never navigate.** Related-concept links and the pager are `<button>`s with
  the shared class names. They walk to the exhibit, which is the one allowed difference (12.1
  rule 3).
  - The pager pages through the station's process sequence, so its "Step n of N" matches the 2D
    pager of a process stage.
  - A related link whose relationship has a manifest "explain-and-guide" cue walks that cue's
    floor route and logs the cue as followed.
  - The panel's old "Leads to" block is removed. A 3D-only block between the claims and Related
    Concepts would have broken P18, and the same relationship, with its explanation, is already in
    Related Concepts.
- **Layer parts.** The process sequence list, the head of a concept shown under another concept's
  layer, the comparison blocks and the chooser between several concepts in one layer have no
  shared component yet. WP2 mirrors them element for element in `learning-2d/ui/layer-parts.tsx`.
  The marker of the current step reads "This concept" in both conditions. These parts should move
  to `src/components/knowledge`.
- **Same figures as 2D.** `buildMuseumPayload` calls `getFiguresByConcept` with the learning
  context's `traditionSlugs` and the protocol's `figures.structureDiagrams`, the same call and
  arguments as the 2D concept page. The figures are then limited to the concepts the panel can
  show. `ClaimList` places each figure after its anchor claim, as in 2D.
- **Comparison reachability (residual risk 11).** A unit test applies the 2D scope rule to the
  real content: the study traditions and the default `minCompareTraditions`.
  - Every comparison the 2D condition can open is an exhibit in the museum, and its panel shows the
    read model's claims in order.
  - The three comparisons outside the 2D scope (Bagru and Sanganer, the Bagru and Sanganeri
    parallel, Dabu mud resist) are reachable in neither condition.

### Chrome, Overlays and Screens

- **StudyBar.** The glass HUD is replaced by the shared `StudyBar`. The museum's condition group
  is Plan (only when the protocol makes the plan a toggle), Controls help and Pause, as 44 px
  `StudyBarButton`s. They are disabled while the museum loads, onboards or has failed.
  - The location is "Room · Zone" (first written "Zone: Room"; see the review round below).
  - It is the view's h1 while no concept is open. When a concept opens it becomes live text, and
    the sheet title is the h1 (9.11).
  - On screens that replace the museum (loading, onboarding, failure) it is plain text, so there is
    always exactly one h1.
- **The scene keeps its on-screen scale (revised in the review round below).** The first version
  put the canvas below the chrome with the same field of view, which shrank on-screen lettering by
  about 19% (wall-plate title contrast 13.9 fell to 7.4 in the same headless measurement). The
  second version ran the canvas up under the opaque chrome, which left a chrome-high band at the
  bottom of the scene. The final version crops the projection instead; see "Review Round".
- **One notice slot.** The "under review" notice is the 40 px strip above the StudyBar, as in 2D
  (9.15). It no longer sits in a HUD card.
- **In this room.** The list sits at the top left and every row is 44 px. The exhibit count is
  removed, because concept counts are shown in neither condition (12.3 rule 13). The list shrinks
  to leave room for the plan below it, so the two never overlap.
- **Plan (11.6).**
  - A 192 px plan at the bottom left, on opaque `--ground` with a 1 px `--rule-strong` border and
    the eyebrow "Plan".
  - Rooms are drawn as unfilled ink outlines, 1.5 px, numbered in tabular figures. The current room
    has a 2 px outline, an 8 px dot and the legend "You Are Here" (revised in the second review
    round).
  - The dot marks the room, not the live position. The old 4 Hz visitor arrow is removed, because
    overlay chrome never animates in study.
  - Room rectangles are too small for 44 px targets. So the plan itself is not interactive, and a
    44 px "Expand plan" button opens the full plan dialog. There every room is a 44 px button by
    number, name and zone, which is the keyboard route to any room.
  - Room numbers follow reading order of the plan (revised in the review round below).
- **Screens.** Loading, help, pause, context loss, failure and no WebGL now use the one study
  state-message layout (9.7). That is a 40rem column on opaque `--ground`, a 32 px outline icon, a
  Source Serif title, a `text-reading` sentence and 44 px actions.
  - There is no translucent scrim and no blur over the scene.
  - Onboarding is the shared `Onboarding` (`condition="immersive"`, with the minutes and the hint
    from the same providers as 2D). It replaces the museum's own "How to Move" screen. It is
    switched off until the 2D side shows it too (review round below).
  - `StateMessage` (9.7) does not exist yet, so the layout is local to `screens.tsx`, with its
    wording in one `SCREEN_TEXT` object.

### Scene Lettering and Colours

- **Font.** The atlas looked up `--font-cormorant`, which no longer exists after WP0a. So titles
  and plaques were drawn in the browser's generic serif, in 3D only. Lettering now uses Source
  Serif 4 600 through `--font-source-serif`. The atlas is built only after `document.fonts.ready`
  and an explicit load of each weight it draws (residual risk 7).
- **Plates.** Wall exhibit planes are identical typographic plates. Every plane measures 1.0 x
  0.7 m in the compiled manifest.
  - The ink is `--ink` #211D19 on `--ground` #F5F1E8. Before, it was #2B2621 on #FBF8F2.
  - A thin ink frame is drawn as coverage: 3 texels (5 mm), inset 12 texels (2 cm). It sits outside
    the lettering pad and outside the bands the legibility probe samples, so it never changes a
    measured contrast.
- **Plaques.** Room plaques (the doorway signs naming the room) are one fixed size for every
  room. The measured size is 1.4 x 0.3 m, because every doorway is 1.5 m wide. DESIGN.md 11.6 asks
  for 1.6 x 0.5 m, which is wider than a doorway; the size is set in `placement.ts`, outside WP3,
  and was not changed.
- **Selection frame and floor route.** These were a warm brown. They now use `--indigo`
  (#24406E), the study's only interactive accent (12.2 rule 5).
- **Measured.** SwiftShader, 1280 x 720, two wall plates at their approach points.
  - Title contrast: 12.7 and 13.7. With the old palette and no frame it was 11.9 and 12.7.
  - Kicker contrast: 3.1. With the old palette it was 3.0.
  - So the change improves both. The kicker measures under 4.5 in software rendering both before
    and after. The legibility check proper (`immersive-rendering.spec.ts`) needs a real GPU, a
    headed browser, and the GPU config; it was not run on this machine.
  - The kicker and footer were then removed from the plates (review round below).

### Measured (headless Chromium, SwiftShader, dev server, one browser)

- **Widths.** At 1280 and 390, in light and high contrast:
  - no horizontal overflow;
  - every control in the museum at least 44 x 44, apart from the visually hidden skip link;
  - StudyBar 58 px (56 plus the 2 px rule).
- **Panel.**
  - Panel background `rgb(245, 241, 232)` in light and `rgb(255, 253, 248)` in high contrast.
  - `backdrop-filter: none`.
  - The docked panel is 629 px wide with a 628 px sheet.
  - The h1 sits 48 px below the chrome, the same layout as the 2D sheet.
  - Focus is on the h1 after opening.
  - Reading progress reaches 100 at the end of the panel.
  - No transitions or animations in the panel.
  - Escape returns focus to the exhibit's row.
- **`tests/e2e/immersive-flow.spec.ts`.** The spec passes, with one worker.
  - It now checks the shared onboarding, the sheet, `--ground`, the focus on the h1, the claims
    and collapsed citation notes against the 2D page, focus return and 44 px targets.
  - It selects the exhibit at its approach point. Under SwiftShader a frame takes about 0.7 s
    here, so the old walk across a room took about 90 s and timed out at 60 s. That was the
    failure WP0b reported; it was not a broken panel.
  - It counts `render_quality_changed` by event id, because a retried telemetry batch repeats the
    same event.

### Review Round: Fixes After the Independent Review

- **The band under the scene.** The rendered scene stopped one chrome height (98 px) above the
  bottom of the canvas, and the page ground showed through.
  - Cause, measured: the WebGL output was correct. `readPixels` right after the final pass
    returned opaque floor in those rows, and a GL readback column matched the screenshot row for
    row above the band. Hiding the opaque chrome made the band disappear, and painting the museum
    root red turned the band red. So Chromium did not composite the canvas's bottom rows while an
    opaque layer covered its top. It is not geometry, viewport, render-target size or the
    post-processing pipeline.
  - Fix: the canvas starts below the chrome, so nothing opaque overlaps it. To keep the on-screen
    scale, the camera projects only the lower part of a virtual frame as tall as the museum
    (`installFrameCrop` in `museum-scene.tsx`). The field of view and aspect describe the virtual
    frame, and the projection is cropped to the rows below the chrome. Lettering, exhibits and the
    horizon sit exactly where they did on the full-height canvas. No pixel is rendered behind the
    chrome, so each frame also renders fewer pixels.
  - `setViewOffset` cannot carry the crop: the TAA pass jitters with it, ends with
    `clearViewOffset`, and `setViewOffset` overwrites `camera.aspect` with the drawing buffer's
    aspect. A first version that kept the aspect on the camera squeezed every plate horizontally
    to 87% (measured: 284 x 228 px for a 1.0 x 0.7 m plate). The crop and the virtual aspect are
    therefore held outside the camera, and the jitter is applied inside the cropped window. After
    the fix the same plate measures 326 x 228 px, the plate's own 1.43 ratio and the old size.
  - The pipeline is now created at the canvas size current when the scene finishes building, not
    the size when the build started.
  - Verified by screenshots looking down at the floor at 1280 x 700, 1280 x 800 and 390 x 844: the
    floor reaches the last row. `immersive-flow.spec.ts` now asserts that the canvas starts at the
    bottom of the chrome and ends at the bottom of the viewport, and that under 20% of the last
    four rows have the exact `--ground` colour while looking at the floor.
- **Plate lettering.** Wall plates now carry the concept title only, as 11.6 describes them. The
  kicker (type and step) and footer (tradition and category) are gone; the panel's header and
  metadata carry the same facts, identical to 2D. Secondary lettering at 0.88 coverage measured
  3.1:1, and the predicted 5.5:1 did not hold, because small type loses contrast to filtering.
  All lettering, including the doorway plaque's zone line, is now drawn at full ink coverage, and
  the `MUTED_COVERAGE` constant is deleted. A plaque no longer repeats its room name as the zone
  line ("Comparison Hall" over "Comparison Hall"). The rendering spec asserts title contrast only.
  The GPU baseline and the GPU run of that spec are still owed (project lead).
- **P13 and the reserved action slot (proposed for the decision log).** 9.11 puts Close in the
  sheet's reserved slot, which made the 3D path from the h1 to the first citation note one tab
  stop longer than 2D (Close, then Source). Section 12 wins over 9.11. So Close is now drawn over
  the reserved slot but placed after the sheet in the DOM, and the slot stays empty in both
  conditions.
  - The sheet's DOM is then identical in both placements, and the h1-to-first-note tab stops are
    equal. The e2e spec measures both pages for the same concept and requires equality.
  - Cost: a keyboard user reaches Close after the sheet's last control. Escape closes the panel
    from anywhere inside it, and Controls help lists Escape as the way to close a panel.
  - The alternatives were an equal focusable in the 2D slot (an extra control in 2D only, with no
    function) or redefining P13. Both were rejected. This needs the lead's confirmation.
- **Onboarding (P23).** The shared onboarding was shown only by the museum. 2D practice and 2D
  learning show none, so 3D learners saw one more screen. The museum's onboarding is switched off
  (`CONDITION_ONBOARDING` in `museum-app.tsx`) until the 2D side renders the same `<Onboarding>`
  under the same rule. The e2e spec counts onboarding screens on both practice routes and both
  learning entries and requires equal counts, so adding it to one side alone fails.
- **Help and Pause.** These were `role="dialog"` with `aria-modal` but trapped no focus. They are
  now labelled regions: focus moves to their action, the StudyBar stays reachable as in 2D, and
  the scene overlays and the panel they cover are `inert` meanwhile.
- **Framing with the room list open.** When the docked panel opens, the open "In this room" list
  collapses, so the framed exhibit is visible. It reopens when the panel closes, and focus returns
  to the exhibit's row.
- **Location.** It reads "Room · Zone", so a phone that truncates the line still shows the room.
- **Plan.** The plan dialog opens over an opaque `--ground` backdrop on an unshadowed `--surface`
  sheet, with no translucency on a study route (4.6, 12.2 rule 6). The zone line is omitted when it
  equals the room name. Rooms are numbered in reading order: zone by zone in the manifest's zone
  order, and within a zone row by row from the top, left to right. A room number is set smaller,
  never under 7 px, only when its room cannot hold it with 3 px clearance. The "You Are Here" dot
  moves beside the number in rooms too short to stack them.
- **Layer parts.** The museum's sequence list, layer-concept head and comparison blocks now use
  the same ids, classes and words as the 2D copies. The head's action reads "Go to this concept"
  with the same arrow icon in both conditions; it walks in 3D and navigates in 2D.
  `tests/unit/immersive/layer-parts-parity.test.tsx` renders both copies from equivalent data and
  requires identical DOM apart from that action. The 2D `ConceptChooser` is not exported, so it is
  not covered yet. The parts still belong in `src/components/knowledge`.

### Second Review Round

- **Keyboard focus on the museum's own controls (WCAG 2.4.7).** The WP0 `Button` base classes
  carry `outline-none`, which beats the global `:focus-visible` outline, so a focused Button showed
  only the ground-coloured halo. Until WP0 removes it, the museum's own Buttons take
  `focus-visible:outline-solid` (`MUSEUM_FOCUS_RING` in `overlays/hud.tsx`). That restores the
  global ring: 2 px indigo in light, the 3 px black ring with its white halo in high contrast.
  - It applies to panel Close, Expand plan, plan Close, Resume, Back to the museum, Try again, the
    screens' links and the cue actions. These controls exist only in 3D.
  - It is not applied to the shared StudyBar controls (Hint, Finish and the condition group).
    Restyling a shared component from one condition's file is ruled out (section 14), and both
    conditions should get the same fix from WP0. Those controls still show no ring in either
    condition.
  - Measured with real Tab and Enter presses at 1280 and 390, in light and high contrast:
    `:focus-visible` is true and the outline is solid, 2 px `rgb(36, 64, 110)` in light and 3 px
    black in high contrast, on Close, Expand plan and Resume. `immersive-flow.spec.ts` now asserts
    this on Resume.
- **Framing beside the docked panel: a lens shift, not a turn.** Before, the camera yawed so the
  exhibit sat left of the panel. A yawed image plane keystones a near plate, so the plate showed
  obliquely in the upper left, and the collapsed "In this room" toggle covered its corner.
  - The camera now keeps facing the exhibit square-on. The projection is shifted instead: an
    off-axis frustum in `installFrameCrop`. The optical axis then meets the canvas at the centre
    of the free area. That area lies left of the panel and below the toggle row (8 px under the
    toggle, read when the panel's inset is set). The vertical shift is capped at a quarter of the
    canvas height.
  - The shift eases in during the walk to the exhibit and is exact on arrival, when the panel
    opens. A standing visitor is framed at once. Nothing moves while the panel is open, as before.
  - Picking, hover and the probe use the same projection, so clicks still land on what is drawn.
  - Measured at 1280 x 800: the plate is drawn square-on, centred below the toggle and left of the
    panel, and it is clear of the toggle (screenshots `panel-d.png` and `panel-hc-d.png`).
- **Plaque and plate lettering at a reading optical size.** Source Serif 4 takes its optical size
  from the font size, and a canvas cannot set `font-variation-settings`. So titles drawn at 60-72
  texels came out in the Display cut, with hairlines that wash out once minified.
  - Each line is now set at a nominal size equal to the size it is read at on screen, then scaled
    up by the canvas transform. The glyphs are outlines, so nothing is lost in sharpness. Plaques
    use opsz 12, because they are read at about 10-16 px. Plates use opsz 18, the Text cut,
    because they are read at about 16-40 px.
  - Measured with headless SwiftShader at 1280 x 800, on the lobby spawn view of "Comparison Hall",
    the first view of every session. The measure is the plaque rectangle with a 6% side and 10% top
    and bottom inset, comparing the 90th percentile (paper) with the 1st percentile (ink). Results:
    1.80:1 at opsz 60 (the old behaviour), 2.49 at opsz 18, 3.03 at opsz 12 and 3.19 at opsz 8.
    At 390 x 844 the result is 2.57 at opsz 12, against 1.74 at opsz 60. This method is stricter
    than reading the darkest stroke, so its numbers run lower than the reviewer's.
  - At the 2.5 m signage distance of `placement.ts` (six plaques, square-on): 6.30 to 13.06.
    Plate titles at their approach points: 11.96, 12.51 and 15.35.
  - From room centres, the plaques are 100-260 px wide on screen and measure 1.23 to 8.58. So
    plaques meet the project's own 2.5 m rule but still read faint from across a room, in 3D only.
    The remaining lever is the plaque's size, which `placement.ts` (unowned) sets at 1.4 x 0.3 m
    with a 0.1 m name. 11.6 asks for 1.6 x 0.5 m, which would allow a larger name. That is the
    lead's decision.
  - A doorway plaque's name may now wrap to a second line when the plaque has no zone line, as 11.6
    describes ("Machilipatnam Kalamkari"). Before, it was cut with an ellipsis after one line.
- **Plaque check in the rendering spec.** The scene adds plaque helpers to the measurement probe
  (`installDoorSignProbe` in `museum-scene.tsx`, non-study modes only). They give a pose 2.5 m
  square-on in front of every plaque, the spawn view, and the page rectangle of every plaque that
  faces the camera in the camera's room. `immersive-rendering.spec.ts` gains "room plaque contrast
  at 2.5 m", which asserts at least 4.5:1 for every plaque. It uses the same percentile method as
  the plates and records, without asserting, the spawn view and every room-centre view. It needs
  the GPU run like the rest of the spec.
- **Plan at 192 x 192.** The minimap is now exactly 192 x 192: a 44 px header, the drawing fitted to
  a 174 x 118 box with a 0.4 m margin, and a one-line legend ("● You Are Here"). Screen readers also
  get the room's number and name. The room's name is the StudyBar location, so the visible legend
  no longer repeats it.
  - Room numbers are never under 10 px. A number that cannot be set at 10 px with 3 px clearance is
    omitted rather than shrunk. At 192 px that applies to 1 (the entrance), 2, 10 (the corridor)
    and 18; the full plan dialog lists every room by number and name.
  - The current room's dot sits under its number, else beside it, and otherwise alone, so it never
    crowds the outline.
  - The entrance, where every session starts, is room 1 in the minimap and the dialog. The rest of
    its zone follows, then the zones in the manifest's order.
  - A unit test (`tests/unit/immersive/minimap.test.tsx`) covers the numbering, the 10 px floor and
    the 192 px frame.
- **Telemetry assertions in the flow spec.** The spec waited a fixed 6.5 s for the tracker's 5 s
  flush. Under SwiftShader a resume batch arrived about 9 s after the click, so the run failed on
  `timing_resumed`. It now polls the captured events for each required type, up to 60 s each.
  The P13 count on the 2D page also had a race. A focus set on the h1 while the page was still
  streaming was lost when the h1 was replaced, and the count then started from the document (6
  instead of 1). The spec now waits for the page to settle and checks that the h1 holds focus
  before counting. Measured by hand on the same concept, both conditions take 1 tab stop.
- **Proposed for the decision log (lead to confirm; section 12 overrides 9.11 and 11.6 here).**
  1. Close is drawn over the reserved action slot but placed after the sheet in the DOM, so the
     tab stops from the h1 to the first citation note are equal in both conditions (P13). Escape
     closes the panel from anywhere inside it.
  2. Under 1024 px the panel covers the scene but is not modal. The scene overlays are `inert`, and
     the StudyBar (Hint, Time left, Finish) stays reachable, as it is from the 2D column (P24).
  3. Plaque size: 1.4 x 0.3 m, because doorways are 1.5 m wide, or the 11.6 size of 1.6 x 0.5 m
     with wider lintels. That change belongs to `placement.ts` and needs a GPU re-run.
- **Still open (other packages).** These are listed for WP0 and WP2:
  - `outline-none` in `ui/button.tsx`;
  - the shared onboarding at 2D practice, with `CONDITION_ONBOARDING` switched on in the same change;
  - `strings.ts` and `StateMessage`;
  - the shared layer parts with a `renderAction` prop;
  - the merged AccessNotice;
  - the citation label without an ellipsis;
  - more room for the location under 768 px;
  - the exported `ConceptChooser`.

## WP1: Public Pages

**Scope:**

- `src/app/(public)/*`: home, About, the new Colophon (`about/colophon`), Explore, Accessibility,
  Privacy, Sign-in, Sign-out and Forbidden.
- `src/components/public/*` (new): Figure 1, the condition schematics, plates and the claim
  specimen, the tradition plates, the dataset table, the identical-and-differs table, the editorial
  frame, sidenote, pull-quote and institution strip.
- `src/server/public/dataset-stats.ts` (new): every public read.
- Tests: `tests/e2e/public-pages.spec.ts`, plus `tests/integration/public-dataset-stats.test.ts`
  and `tests/unit/public/public-components.test.tsx` for the WP1 code only.

### Honesty: Every Number Is Read, Nothing Is Invented

- Every number on the home page comes from the database at request time. The reads call
  `connection()` and render inside `<Suspense>`. Each fallback is the same layout without numbers.
  This covers Figure 1's counts, the hero deck's count and list of traditions, the plate count and
  Table 1. On a read error the page shows a plain "could not be read" line, never a guess.
- Demonstration records (`is_demo`) are never counted or shown.
- The integration test seeds a throwaway database, reads it, grows the dataset and reads it again.
  The e2e test checks the rendered numbers against its own SQL counts on the development database.
- Records are labelled with their real curator status. Every live concept is still under review, so
  the Plate 1 specimen and the About pull-quote carry an "Under review" badge. Table 1's note gives
  the number of concepts that curators have verified or published (currently 0).
- The tradition names come from the dataset. The short names in the deck and on the typographic
  plates are derived from the dataset slugs ("machilipatnam-kalamkari" becomes "Machilipatnam
  Kalamkari"), so they are not hand-written.
- Platform facts on About and Privacy come from the code that implements them:
  - Figure 2 and its step list are generated from the study engine's default order (`DEFAULT_STEPS`,
    `BLIND_STEPS`, `STEP_LABEL`), and the learning time from `NEW_STUDY_CONFIG`.
  - The cookie lifetimes come from `DEMO_SESSION_TTL_SECONDS` and
    `PARTICIPANT_SESSION_TTL_SECONDS`.
  - "Nothing in the demo is written" follows `src/server/telemetry/ingest.ts`.
- **Deviation from 11.2 (honesty wins over the spec text):** the spec's Figure 2 shows "consent,
  pre-test, learning, post-test, delayed test". The engine has no delayed test, so the figure
  shows the actual default steps. Sections with no verified content are omitted: Team and
  Affiliations, Ethics, How to Cite and Contact. Privacy shows no contacts list and no retention
  period until the team supplies them.
- The About "Equivalence" section says "No parity run recorded yet." only while
  `analysis/parity/interface-parity.json` does not exist. When that report exists, the section
  states the run's commit and the number of checks that passed. Content parity reports belong to
  each study (staff only) and are not summarised on public pages.
- Swatch values on the Colophon are parsed from `src/app/globals.css` itself, so they cannot drift
  from the tokens. The font budget gives the spec's limits and the measurement WP0a made when the
  faces were adopted (2 files, 170,600 bytes), labelled as that measurement.

### Home (11.1)

- **Plate 1.** DR-020 keeps the V&A photographs off the home page and no other licensed photograph
  exists, so Plate 1 is the typographic specimen in a ticked 4:5 frame.
  - **Which claim:** never from a study tradition (`STUDY_TRADITION_SLUGS`). A visitor who reads
    the home page before a pre-test must not see a study fact, and no study tradition may get
    front-page salience. Candidates are claims of a non-study tradition's overview concept that
    cite exactly one source with a located passage. The claim may have at most 150 characters, the
    quote at most 180, both together at most 240, and the source title at most 90. Each tradition
    offers its shortest candidate (then the lowest position). The traditions are then taken in the
    canonical order and the home specimen uses the first. With the current dataset this is Bagru;
    Bagh's only candidate is too long for the frame. The About pull-quote is chosen separately
    (see "Continuation Round" below).
  - **What it shows:** the claim with its number and source line, then the verbatim quote at claim
    size behind the 2 px indigo rule. Next comes a three-row record (Title, Year, Locator), shown
    when the frame is at least 22rem wide inside its padding. "Open the source" is pinned to the
    foot of the frame. The full eight-row `CitationRecord` is not used here, because it cannot fit
    a 4:5 frame.
  - **Sizing:** the box is 4:5 at every tested width (390 to 1440 px; asserted at 390, 768, 1024
    and 1280). The content is fitted to the frame. It is never clipped: below 390 px the box grows
    rather than cut text.
  - **Hero composition:** from 1024 px the text column is centred vertically against the plate.
    Below 1024 px the plate stacks after the buttons, at most 28rem wide. At 1280 px Figure 1
    starts at 985 px, in the second screen.
- **Figure 1.**
  - Built from `OutlineDiagram` in two geometries: left to right from 768 px, vertical below. The
    page and plan miniatures are shared with the Explore schematics. Each miniature has one indigo
    accent of the same area. On the page it is the title bar. On the plan it is a square marker
    centred in the current room, whose side is the square root of the title bar's area in the same
    box. Every room, including the current one, is the same `--sunk` square. A unit test keeps the
    two areas within 5% in all three boxes used.
  - The two branch strokes draw on once when the figure enters the viewport, and are fully drawn
    with reduced motion (tested both ways).
  - Text equivalent: the count list, then two condition cards. The cards keep
    `section[aria-labelledby="conditions-heading"]` with an `/explore` action in each, as 9.2
    requires `alignment.spec.ts` to keep passing. They have the same anatomy as the Explore cards:
    the schematic, then the Title Case title, the reserved three-line description and the action.
  - Then the booktabs "Identical in Both Conditions / Differs by Design" table, as two grouped
    bodies of one two-column table.
- **Table numbering:** as 11.1 specifies, the dataset table is "Table 1". The identical-and-differs
  table is not numbered, because it is Figure 1's tabular companion and sits in Figure 1's
  section.
- **Dataset table at 390 px:** the four-column table fits 358 px without scrolling its region.
  The headers may wrap. Under 520 px the cells keep 8 px instead of 12 px of horizontal padding, and
  the header labels drop their 0.06em tracking. The column reads "Sources", and the table note
  says these are the distinct sources cited by the claims. A test asserts that `scrollWidth` does
  not exceed `clientWidth` on the home page and on About.
- **Traditions, titles:** the plate titles use the short display name, as in the deck, Table 1
  and the typographic plate, so every name fits the reserved two-line zone. The dataset's full
  name (for example "Bagh Print (Hand Block Printing of Bagh, Madhya Pradesh)") follows the region
  in `text-credit`. It comes last, so its length cannot move the aligned rows above it. A test
  asserts equal region-eyebrow tops in each row at 600, 768, 1024 and 1280 px.
- **Traditions, photographs:** the plates are typographic for all six, since no tradition has an
  approved public photograph. `photosForAll()` enforces the all-or-none rule, and `next/image` is ready for
  when a public-plate image route exists (WP6).
- **Institution strip:** renders nothing while its fields are null. `src/config/institution.ts`
  does not exist yet (WP0), so the page passes `NO_INSTITUTION`.
- **Buttons:** the hero buttons are 12rem each from 520 px and full width and stacked below. The
  former "Take part in a study" button is gone, as 11.1 specifies; participants arrive with a study
  link.

### Explore (11.3)

- The "What Is the Same" strip (`--surface`, 4 px indigo rule), then two parallel cards. In each
  card: a 16:10 schematic first, then a 26 px Source Serif title, a three-line reserved description
  and the 44 px primary button in `CardFooter` (mt-auto).
- The button names are unchanged ("Open conventional pages", "Open immersive museum"). Other specs
  click them, and the immersive specs need exactly one button matching /museum/i (asserted).
- "Before You Start" holds two booktabs tables of six rows each. The wording follows
  `ONBOARDING_TEXT` and the museum's controls help. The section ends with the Display Settings
  button.
- The two tables sit side by side from 768 px. There every body row reserves two lines (56 px), so
  a task that wraps in one table never pushes that table's rows below the other's. The 3D "Open an
  exhibit" entry is shortened to "A wall panel, or the “In this room” list", so no cell runs to
  three lines. A test asserts equal row bottoms within 1 px at 768, 1024, 1280 and 1440 px.

### Editorial Pages (11.2, 11.4)

- **Frame:** `EditorialFrame`, `EditorialSection` and `EditorialRow`: a 34rem column, a 3rem gap
  and a 15rem sidenote column at 1024 px and wider. Below that, each sidenote follows its paragraph.
- **Section heads:** a 2 px madder rule, then `text-h2`, rising to `text-display-2` from 768 px.
- **Links:** text links stand on their own line as 44 px targets, never inline in a sentence
  (section 15 counts every interactive element).
- **Colophon:**
  - Typefaces with specimens.
  - Fifteen swatches in registration-ticked frames, light and dark values in mono. Every swatch
    carries the label "Design interpretation; not a measured or historical dye colour", as 11.2
    specifies, not only the craft-derived ones. The label sits above the role line, so the labels
    of a row share one baseline.
  - The knock-out field with the "decorative pattern, not craft content" note.
  - The fixed 2D-first order.
  - All 27 parity checks with "No run recorded" until a stored report exists. The report reader
    validates the WP0 schema strictly and counts a check as passed only if it passed in every run.
- **Sign-in:** a 24rem surface card.
- **Sign-out and Forbidden:** the state-message layout: a 32 px outline icon, a Source Serif h1,
  one sentence and a 44 px primary action. Forbidden's primary action is the `/console`
  dispatcher.
- **Deviation from 9.7 (deliberate):** Forbidden also offers Sign out, as a 44 px outline button
  after the primary action. 9.7 gives the state message one action. But this page is reached by a
  signed-in staff member whose roles lack a permission, and signing in with another account is
  the other way forward. Without the button it would be two menus away. Forbidden is a public
  page, not a study surface, so condition parity is unaffected.
- **About, Images and Licences:** the figure statement is derived, not hard-coded. It reads the
  protocol default of the structure-diagram switch from the study contract (`studyConfigSchema`,
  `figures.structureDiagrams`) and says that a protocol can switch the diagrams off in both
  conditions together. The photograph sentence comes from the live list of verified image credits:
  "No photograph has been verified for the platform yet, so no figure is currently a photograph",
  or the count with the credits. So the text stays true when DR-020's photographs are adopted or
  the switch is turned off.

### Verification

- **Headless audit:** Chromium, one browser, `localhost:3300`. At 1280 and 390 px, every public
  page had 0 px horizontal overflow, exactly one h1, and no visible interactive element under
  44 x 44. The only exception is the visually hidden skip link.
- **Themes:** high contrast hides the band and the ticks. Dark and HC-dark were checked by eye.
- **LCP:** home at 4x CPU throttle on the dev server was 276 to 544 ms. The LCP element is the h1.
  After the review round, with Plate 1 fitted to its frame, it was re-measured on the same dev server
  (3 loads each, 4x CPU throttle, other packages' work running): 644 to 1,092 ms at 1280 px (the
  h1) and 1,080 to 1,620 ms at 390 px (the deck). All are within 2.5 s. It was not measured on a
  production build: the session limits allow one server only, the shared dev server on port 3300.
- **Tests:**
  - `tests/e2e/public-pages.spec.ts`: 7 tests.
  - `tests/integration/public-dataset-stats.test.ts`: 5 tests.
  - `tests/unit/public/public-components.test.tsx`: 7 tests.
  - `smoke.spec.ts` passes.

### Continuation Round

A second pass re-verified WP1 against the current dataset and the other packages' changes, and
made three corrections:

- **One definition of "sources" on the home page.** Figure 1 counted every source record (112)
  while Table 1 counts the distinct sources the claims cite (109). Both numbers were true, but one
  page showed two different source totals. Figure 1 now uses Table 1's definition. The e2e test
  checks both against one SQL count.
- **The About pull-quote never repeats the home specimen.** The content changed, and now only one
  non-study tradition (Bagru) has a claim short enough for the 4:5 specimen frame. The old
  "second tradition" rule clamped to the last candidate, so About showed the same Bagru claim as
  the home page. The pull-quote now has its own fit:
  - It is set at 28 px and shows only the claim and its source line, not the quote. So only the
    claim length is limited (at most 160 characters), and the quote limits are off.
  - The specimen's tradition is always excluded.
  - Traditions are taken in canonical order, so the current choice is Bagh.
  - A request beyond the qualifying traditions returns nothing instead of a repeat.

  The integration test covers all four rules.
- **High contrast draws every rule in ink (4.4).** The `.a11y-contrast` blocks do not redefine
  `--madder`, so the public section rules and the pull-quote bar stayed madder. These rules now
  carry `hc:border-ink`. The madder plate and figure numbers stay madder, because they are text
  (7.18:1 on HC ground), not rules. An e2e test asserts that the rules are `rgb(17, 17, 17)` in high
  contrast.
- **One Equivalence Monitor.** WP0 has since built the shared `EquivalenceMonitor` and
  `summary.ts`. WP1's own report reader, its summary type and its copy of the 27 check labels are
  deleted.
  - About embeds the monitor (run line only, neutral tone).
  - With a stored run, the Colophon shows the monitor's full per-check table.
  - With no stored run, the monitor prints "No parity run recorded yet." The Colophon then lists
    what each check compares, from WP0's `PARITY_CHECKS`, with no result column, so nothing reads
    as a result.

  Every surface now parses the stored report with the same strict schema.
- **Sign-in "no band" (11.4), interpretation.** The 24 px header band belongs to the public header
  on every public page (9.16, 11.1), and the shell owns it. On the sign-in page itself "no band"
  is read as: no extra band above the card (unlike the research console's 48 px band). The card
  sits directly under the header.

Re-verified in this round:
- A headless audit at 1280 and 390 px, light and high contrast (36 page views): 0 px horizontal
  overflow, one h1 each, and no visible interactive element under 44 x 44 apart from the visually
  hidden skip link.
- The public e2e, smoke, unit and integration suites pass.

### Review Round: Fixes After the Independent Review

An independent review raised one major issue, which belongs to WP0, and seven minor ones in WP1
files. All seven are fixed.

- **Focus ring on buttons (major, WP0 file).** The `Button` base class carries `outline-none`,
  which overrides the global `:focus-visible` ring. Every `Button` on the public pages, and the
  footer's Display settings button, shows only a halo in the colour of the ground. WP1 does not
  edit `ui/button.tsx` (it is a WP0 file), so this is passed to WP0. WP1 adds an e2e check that
  presses Tab through Home and Explore, in normal and in high contrast, and requires an outline of
  at least 2 px on every control it reaches. Links pass. The three Buttons on Home fail until WP0
  removes `outline-none`.
- **Figure 1 leaves from the whole model.** Both branches used to start at the right edge of the
  "Concepts" box, so the wide figure read as "concepts lead to the two conditions". A 1.5 px bracket
  now spans the whole cluster: on the right in the wide figure, underneath it in the tall one. The
  single trunk leaves from the bracket's midpoint, and a unit test checks that.
- **Diagram text is never rendered below 13 px (7.4).** The SVGs scale to their box, so labels
  authored at 13 px rendered at about 9 to 12 px wherever the box was narrower than the viewBox.
  Each geometry is now authored no wider than the narrowest box it is shown in:
  - Figure 1, wide: 856 units, shown from 1024 px (the box is 910 px there). From 768 to 1023 px
    the vertical flow is used instead, and 11.1 asks for that flow on phones anyway.
  - Figure 1, tall: 320 units (the box is 324 px at 390 px).
  - Figure 2 (About), wide: 762 units, shown from 1024 px (798 px box). Tall: 320 units.
  - Explore schematics: 288 x 180 units (296 px box with two cards at 768 px).

  Measured in the browser, the smallest label is 13.0 to 13.8 px at 390, 768, 1024 and 1280 px.
  A unit test pins each viewBox width to its narrowest box.
- **No third copy of the miniatures.** The home condition cards no longer draw the page and
  floor-plan schematics, because Figure 1 directly above already draws them. The cards keep their
  title, description and action, so the two actions still share a baseline, as `alignment.spec.ts`
  checks. Without the schematics the description no longer needs a reserved three-line height.
  Explore keeps its schematics, as 11.3 asks.
- **Figure 1 is numbered once.** The ochre "Figure 1" eyebrow above the h2 is removed. The number
  stays at the start of the caption, which 9.9 and 10 name as the place for figure numbers.
- **High contrast is flat ink, text included (4.4).** The ochre eyebrows ("A Research Platform",
  editorial eyebrows) and the madder "Plate 1." and "Figure n." labels now carry `hc:text-ink`. This
  reverses the previous round's choice to keep the madder numbers, because 4.4 makes high contrast
  flat ink and never uses yellow-gold, and a consistent rule is simpler. The e2e test asserts
  `rgb(17, 17, 17)` for every ochre or madder text on Home and About in high contrast.
- **Plate 1 has no empty band.** "Open the source" used to be pinned to the foot of the 4:5 frame,
  leaving about 140 px of empty frame above it at 1280 px. The link now follows the record
  directly. The claim block is centred in the space under the tradition and status row, so the spare
  room is shared above and below it. The frame stays an exact 4:5 box with nothing clipped, as the
  e2e test checks at 390, 768, 1024 and 1280 px.
- **Heading hierarchy on the inner public pages (lead decision).** On About, Colophon, Explore,
  Accessibility and Privacy, the PageHeader h1 is `text-title` (32 px, 9.16), but the editorial
  section h2s were `text-display-2` (40 px, 5.2). So "Purpose" was set larger than "About the
  Project". Both sizes follow the spec, so this was a conflict in the spec itself. It is resolved in
  WP1 files only:
  - The editorial h2s (and Explore's "Before You Start") are now `text-h2` (24 px, Source Serif
    600) at every width, under the 32 px h1.
  - `text-display-2` stays for the home page's section heads, where the h1 is `text-display-1`
    (44 to 80 px).

  Every public page now has h1 larger than h2. The shared PageHeader is unchanged.

Verification for this round:
- Headless audit with one browser at 390, 768, 1024 and 1280 px, light and high contrast, on Home,
  About, Explore, Colophon, Accessibility and Privacy: 0 px horizontal overflow on every page,
  the h1 larger than the h2 on every page, and HC accents in ink.
- Unit tests in `tests/unit/public`: 11 of 11 pass.
- `public-pages.spec.ts` and `smoke.spec.ts` pass, except the new focus-ring check, which waits
  on WP0.

### Second Review Round

- **Tradition plates: subgrid instead of a reserved two-line title zone.** The fixed
  `min-h-[2lh]` left a blank band of about 32 px under every title at widths where no name
  wraps, and in the single column at 390 px, where nothing needs aligning. Each plate is now a
  three-row CSS subgrid (plate, title, notes): the title row takes the height of the tallest
  title in its visual row, so the region eyebrows share one top where a name does wrap (two
  columns at 600 px, where "Machilipatnam Kalamkari" takes two lines) and no space is reserved
  anywhere else. Measured: the title-to-eyebrow gap is 12 px on every plate at 390, 600, 768,
  1024 and 1280 px. The eyebrow-row e2e test still guards the alignment.
- **Hero plate centred while stacked.** From 520 to 1023 px the hero stacks and Plate 1 is capped
  at 28rem. It now sits centred in the column (`mx-auto`), so no 270 px empty band sits to its
  right at tablet widths. A 12-column split at `md` was rejected: the plate column would be
  about 286 px, narrower than the 358 px it already fits at 390 px, and the two hero buttons
  would not fit beside each other in the deck column. From 1024 px the 7/5 grid is unchanged.
- **Explore: "What Is the Same" is a lead-in, not a heading.** The strip is a one-sentence callout
  above the cards, so its label is now a paragraph at the h3 size (the section still names
  itself through `aria-labelledby`). Explore's h2s are now the two card titles (26 px, fixed by
  11.3) and "Before You Start" (24 px, the editorial h2 size); the third, smaller h2 size is
  gone. Card titles stay 26 px because 11.3 fixes them.
- **Focus ring (open, WP0).** The Button and Input primitives still carry `outline-none`, which
  in the utilities layer overrides the global `:focus-visible` ring, so buttons and inputs on the
  public pages show no visible focus. This is a WP0 fix (remove `outline-none` from both). WP1
  does not patch it per use, so that every surface gets the same ring from one place. The
  Accessibility page's statement that every control shows a visible focus ring is correct only
  once WP0 lands, and WP1 is not signed off as WCAG 2.2 AA until then.
- **Citation locator break (open, WP0).** At 390 px "PDF p. 4" can break between "p." and "4".
  The fix belongs in `shortCitationLabel()` (a non-breaking space after the locator
  abbreviation), so both conditions get it alike. WP1 does not patch only the public plate.
- **Audit stability.** The 390 and 1280 px page audits in `public-pages.spec.ts` now load each
  route twice (the first load compiles it on the dev server) and wait for fonts before they
  measure. With `--repeat-each=3` and 1 worker, all 12 runs of the audits and layout checks pass.

## WP4: Study Pages

Scope: the participant pages under `/study/*` (entry, consent, the in-session steps, withdrawal,
the debrief) and the concept-map reconstruction task (DESIGN.md 11.7, 18 WP4). Answers,
allocation, step order and timing are unchanged; every change is presentation, plus one
additive field that records the High contrast accommodation.

### The High Contrast Accommodation (DR-019)

- **Where it is offered:** first on the consent page, before the pre-test, and again at the
  display and browser check (`/study/device-check`). The review round below explains why it
  moved forward. (Superseded in the Third Review Round: it is now offered only on the consent
  page, and the device check shows it read-only.)
  - The device check is the first page after allocation and comes before familiarisation and
    learning, in every protocol: the engine always runs the device check after allocation.
  - It is the same page for both conditions. `DeviceCheck` takes no props, so it cannot render
    anything condition-specific. The e2e journey compares its markup for a 2D and a 3D
    participant and requires them to be equal.
- **What is offered:** the shared Display Settings dialog in its study form (`zone="study"`). It
  shows only the High contrast switch, and study mode stays light. The page states the current
  choice in words ("High contrast: On/Off").
- **When it is recorded:** the check no longer runs on page load. It runs when the participant
  chooses "Check and continue", so the final choice is recorded with it, in
  `study_sessions.device.contrastAccommodation`.
  - This field is separate from `highContrast`, which still records the browser's own
    `prefers-contrast` or forced-colours setting.
  - A choice already stored on the device (for example from the public site) is read, shown and
    recorded the same way. Facilitators should reset shared lab browsers between participants.
    The page always states the setting, so it can be changed.
- **Unowned files edited:** recording needs one optional field in `src/server/study/actions.ts`
  (the device-report schema), `src/server/study/engine.ts` (`DeviceReport` and the stored device
  JSON) and `src/features/study/contracts.ts` (`sessionDeviceSchema`). These files are in no
  package list. The edit is additive, and the study-engine integration suite passes unchanged.

### Page Typography and Layout

- **Progress:** each in-session step page opens with "Step n of N" (tabular) and the 2 px
  ink-on-rule Progress line.
  - The count comes from the protocol's step list, so it is the same for every participant of a
    study.
  - Positions that are not protocol steps (allocation, the device check, the final confirmation)
    show no count rather than an invented one.
  - The shell's own `step` slot is not used: the study layout cannot read the session without
    putting the shell behind Suspense.
- **Questions:**
  - Each question opens with "Question n of N" (tabular, ink-3). The question text follows in
    Inter 20/28 600, and the legend or label holds both.
  - Choice options are full-row 56 px labels around a native 20 px control (`accent-color:
    --indigo`).
  - A chosen option takes `--wash`, a 2 px indigo bar and a check icon. The icon's space is
    reserved in every row, so choosing an option shifts nothing.
  - Native controls keep the existing `FormData` contract (`item:<id>`) and keyboard behaviour
    without a custom widget.
- **Likert scales:**
  - They become a row of equal columns: the number above the control, the end labels in
    `text-eyebrow` under the first and last columns. Under 520 px they stack as 56 px rows.
  - Scales of more than 7 points (the 0-10 load rating) switch at 640 px instead, so no column is
    ever narrower than 44 px.
  - A scale with labels on middle points shows every label under its number instead of folding
    them into the end row.
  - In the column layout the chosen point's bar runs along the bottom (a left bar in a narrow
    column reads as a divider). In the stacked layout it runs down the left, as for options.
  - Accessible names are "1 Not at all" and so on, with a space between the number and the
    label.
- **Errors (DESIGN.md 9.5):**
  - Field errors use `FieldError` (an icon and the words), linked through `aria-describedby`.
    Radios are not given `aria-invalid`, which is not a radio property; their fieldset carries
    the description.
  - After a refused submit, an error summary (the word "Error" and links to each flagged
    question) takes focus.
  - Action errors use a destructive Alert with the word "Error". The Alert's left border is
    `--danger`, never colour alone.
- **Action row (11.7):** 44 px buttons, with the primary action on the right and last in DOM and
  tab order. Consent puts "I do not want to take part" on the left and "I agree to take part" on
  the right. Withdrawal puts "Go back to the study" on the left and "Withdraw from the study" on
  the right. Under 520 px the buttons stack at full width in DOM order, so neither is left alone
  on a second line.
- **Assessment button label:** assessment forms keep "Submit answers" rather than "Continue".
  Submitting is final (answers cannot be changed), and the label says so. This is a deliberate
  wording choice.
- **Editorial column:**
  - Consent, the entry form and the debrief keep the 34rem measure for every block on the page,
    so text, rules and actions share one right edge.
  - Consent text opens with a 1 px rule on `--ground`. The confirmation row below draws its own
    rules, so the text has no closing rule. The study palette keeps `--surface` for the hint
    panel and dialogs only.
  - The consent heading keeps the version identifier verbatim, outside `titleCase()`.
- **Session hub progress list:** numbered 44 px rows, each with its status in words ("Done" with
  a check, "Current", "To do"). The current row carries a 2 px ink bar. It does not use
  `--wash`, which study keeps for a chosen option.
- **State messages:**
  - These are: not ready, allocation refused, enrolment not found, consent unavailable, the
    debrief outcomes, and the reconstruction states.
  - They use one layout: a 32 px outline icon, a Source Serif h2, one sentence in
    `text-reading`, an optional research-team line and at most one 44 px action.
  - The shared `knowledge/state-message.tsx` (WP0) does not exist yet. The layout lives in
    `src/components/study/state-message.tsx`, matching the 2D and 3D local versions, and should
    be swapped for the shared component when it lands.
- **Eyebrow:** the duplicate "Study" eyebrow is dropped from page headers, because the shell
  already shows it. The reconstruction page's eyebrow is the phase ("Before the Learning Task").
- **Codes:** participant codes are set in mono with `whitespace-nowrap`, so `P-…` never breaks
  at its hyphen.

### Concept-Map Task (11.7: Tokens, 44 px Controls, Zero Motion)

- **Behaviour:** unchanged. The reducer, edit log, autosave, zoom limits and the keyboard form
  are all as before. The opening view now has a zoom floor (see the review round below).
- **Canvas:**
  - An opaque `--ground` canvas with a 1 px `--rule-strong` frame, faint `--rule` dots, and
    square-cut concept boxes with a 1 px ink outline (indigo when selected).
  - Links are `--ink-3` at 1.5 px, with labels on `--ground`.
  - All colours are set through React Flow's own CSS variables mapped to the tokens, so high
    contrast and the console's dark theme follow without code.
- **Link handles:** the 12 px square handles get a 44 x 44 hit area from a pseudo-element. It
  extends away from the box, so the box itself stays draggable. Measured: hit-testing 4-20 px
  below a source handle returns the handle.
- **Zoom controls:** now 44 x 44. React Flow's base.css is unlayered and beats Tailwind layers,
  and Tailwind turns `_` in arbitrary selectors into spaces. So the controls are styled through
  the Controls panel's own `className`, with important size overrides.
- **Attribution link:** hidden for participants, because study pages carry no outbound
  navigation. It stays for raters in the console.
- **Relationship form and list:** native selects with the Input rules (44 px), 44 px Reverse and
  Delete buttons, and Title Case headings ("Add a Relationship", "Your Relationships (n)").
- **Known exception: concept boxes and edge labels on the canvas:**
  - These can render under 44 px. They scale with the view (0.8 to 0.82 when the map opens, at
    every width).
  - Fixing the zoom would change the task's behaviour, which WP4 must not do.
  - Every canvas action has a 44 px equivalent in the keyboard form and the relationship list on
    the same page. That meets WCAG 2.2 SC 2.5.5's "Equivalent" exception.

### Verification

- **Audit:** a headless Chromium script (one browser, closed afterwards) against localhost:3300
  walked two participants through every study route at 1280 and 390 px.
  - One participant used the default display.
  - The other used high contrast, both stored and chosen in the dialog.
  - It also covered the reconstruction task.
- **Every page at both widths:** 0 px horizontal overflow, 0 elements with a transition or
  animation, one visible h1, and no interactive element under 44 x 44. The only exception is the
  canvas items above.
- **High contrast:** with high contrast the page has `a11y-contrast` and never `dark`. The
  session row recorded `contrastAccommodation: true`.
- **Tests:**
  - `tests/unit/assessment-ui/study-forms.test.tsx`: 11 tests (question numbering and
    typography, option rows, the Likert scale and its names, free-text height, the action row,
    error-summary focus and links, the display step and its recording, `stepCountOf`).
  - `concept-map-editor.test.tsx`: 5 tests.
  - `study-journey.spec.ts`: 5 tests, including the identical display step for both allocations
    and the recorded accommodation.
  - `assessment-concept-map.spec.ts`: 1 test.
  - The study-engine integration and unit suites: 44 tests.

### Review Round: Fixes After the Independent Review

- **Focus ring on study buttons and fields (major; WCAG 2.4.7, DESIGN.md 9.1, R-A5):**
  - Cause: the shared primitives (Button, Input, Textarea, Select, the Radix radio and checkbox)
    carry the `outline-none` utility. It sits in the utilities layer and beats the base-layer
    `:focus-visible` ring in globals.css. A focused study button kept only the 4 px `--ground`
    halo on `--ground`, so nothing was visible.
  - The root fix belongs to WP0: drop `outline-none` from the primitives. It is reported as a
    cross-package need.
  - The study pages cannot wait for it. The study layout (`src/app/(study)/study/layout.tsx`)
    adds one unlayered rule:
    `html:has(.study-root) [data-slot]:focus-visible:not([tabindex="-1"]) { outline-style: solid }`.
    - It restores only the outline style. Width, colour and offset still come from the global
      ring, so high contrast keeps its 3 px black double ring.
    - Programmatic focus targets (`tabindex="-1"`: h1, `<main>`, dialogs, error summaries) keep
      no ring, as globals.css intends.
    - It is scoped to the study shell, including portalled dialogs. It never reaches `/learn/*`,
      so the two learning conditions stay alike until WP0's fix covers both.
    - Once WP0's fix lands, the rule changes nothing and can be deleted.
  - Two WP4 native selects (the entry stratum and the relationship form) had their own
    `outline-none`. It is removed.
  - Measured with Tab in headless Chromium: the study code field, Continue, both consent
    buttons, Submit answers, Display settings, and the dialog's Close in high contrast all match
    `:focus-visible` with a solid outline (2 px indigo at 2 px offset; 3 px black in high
    contrast). With the rule disabled, each computes `outline-style: none`.
  - `study-journey.spec.ts` now tabs to the primary, outline and destructive buttons (consent,
    questionnaire, withdrawal in high contrast) and asserts that the outline is drawn.
- **Likert points match the choice rows:**
  - A Likert cell set `border-rule` on all sides. tailwind-merge then dropped
    `border-l-transparent`, so under 520 px every unselected stacked row showed a 2 px rule on
    the left. The cell now sets only `border-b-rule`. Measured at 390 px: the left border is
    transparent except on the chosen point.
  - Each point now carries the same check icon as the choice rows (DESIGN.md 4.2, 11.7), with
    its space reserved. Stacked, it sits at the row end. In columns, it sits under the control,
    before any per-point label, so the icons of all columns share one line.
- **High contrast before the pre-test (DR-019):**
  - Problem: the accommodation was first offered at the device check, after the pre-test. A
    participant who needed it took the learning-gain baseline without it and the post-test with
    it. That favours neither condition, because the order is the same for both, but it adds
    noise to gain for accommodated participants.
  - Fix: the same control (`StudyDisplayChoice`: one sentence, the state in words, the study
    form of Display Settings) now opens the consent page. Consent comes before allocation and
    before the pre-test, so the page is identical for every participant by construction. The
    device check keeps the same control as the last point before learning.
  - What is recorded: `device.contrastAccommodation` holds the choice at the device check. A
    choice made on the consent page persists on the device and is recorded there unless it is
    changed. A participant who changes it between consent and the device check took the
    pre-test under the earlier state, and that change is not recorded separately. Recording the
    consent-time state would need a server change outside WP4. Analysts should treat the
    accommodation as a covariate and read this limitation with DR-019. A note for DR-019 is
    reported as a cross-package need.
- **Concept-map legibility (the canvas exception above still holds for targets):**
  - The opening view is floored at zoom 0.8 (`fitViewOptions.minZoom`), so 15 px labels are at
    least 12 px on screen. The participant's zoom range (0.3 to 2) is unchanged, and positions
    are flow coordinates, so the task and its data do not change.
  - The canvas is 32rem tall (was 28rem), so the default circle layout of six concepts still
    fits whole at 0.8 at 1280 px. Measured: zoom 0.818, labels 12.3 px, 6 of 6 concepts in view.
  - At 390 px the map is wider than the canvas at 0.8. It opens centred with the side concepts
    cut at the edges, and the participant pans. Measured: labels 12 px, 2 of 6 concepts fully in
    view. This is a deliberate trade: on a phone, fitting the whole map gave 7 px labels. The
    relationship form below the map lists every concept by name.
  - The zoom controls are one row (`orientation="horizontal"`, 134 x 46) at bottom left. The
    opening view keeps 72 px of bottom padding, so they never cover a fitted concept. Measured:
    0 overlaps at 1280 and 390 px.
- **Entry form width (kept, now documented):** the entry form keeps the editorial 34rem measure.
  Entry and consent are one onboarding pair, and consent must keep the editorial measure, so
  "Continue" and "I agree to take part" end at the same x. Widening entry to the 40rem column
  would move the primary action out, in and out again across the first three pages.
- **Consent rules:** the consent text keeps only its top rule. The confirmation row draws its
  own top and bottom rules, so two parallel hairlines no longer enclose an empty band.
- **Progress line in high contrast:** not fixed here. In high contrast `--rule` equals `--ink`,
  so the track and the indicator of the 2 px line read as one rule. "Step n of N" still carries
  the value in words. The fix belongs to WP0's Progress primitive and is reported there.
- **Verification (this round):**
  - A headless audit (one Chromium, closed afterwards) covered entry, consent, consent in high
    contrast, the Likert questionnaire, the device check and the reconstruction task, at 1280
    and 390 px. Every page had 0 px horizontal overflow, 0 moving elements and one h1. The only
    items under 44 px were the canvas concept boxes covered by the exception above.
  - `tests/unit/assessment-ui/study-forms.test.tsx` adds a test for the Likert check icon and
    border classes, and a test that the consent page's display choice matches the device
    check's.
  - `study-journey.spec.ts` (5) and `assessment-concept-map.spec.ts` (1) pass, as do the
    study-engine integration suite and the unit suites.

### Second Review Round

- **Withdrawal on the concept-map step (major; study requirement S16):** the reconstruction
  page was the one in-session step without the withdrawal footer. It now renders `StepFooter`
  after the task and after each of its state messages (task unavailable, no task, map already
  submitted), so a participant can withdraw at any point of the pre- and post-learning maps.
  The step is identical in both conditions, so this changes nothing between them.
  `assessment-concept-map.spec.ts` asserts the "Withdraw from the study" link.
- **Concept-map actions under 520 px:** in participant mode, "Add relationship" (with "Cancel
  drawn link" when a link was drawn) and "Submit map" now follow the study action row: under
  520 px they stack at full width in DOM order, as through `StudyActions` on every other step.
  `ConceptMapEditor` passes `fullWidthActions` to `RelationshipPanel` for participants only.
  The console rater view keeps its right-aligned, content-width row. The transient "Continue"
  after submission is full width on a phone too. Measured at 390 px: both buttons 358 px wide,
  the full content column; at 1280 px they stay right-aligned and content-width.
- **One rule between the relationship list and the save row:** the list (or its empty state)
  keeps its bottom rule, which closes it in every mode, including read-only views. The save
  row no longer draws its own top rule, so two parallel hairlines no longer enclose an empty
  band. The "Submitted" message keeps only its bottom rule for the same reason. Measured at
  1280 px: the empty list's rules at y 1206 and 1252, then no rule until the withdrawal footer.
- **The Finish label in the onboarding time rule:** the self-paced rule told participants to
  choose "Finish learning", which is only the button's accessible name; the StudyBar shows
  "Finish". The sentence now names the visible label, built from `PHASE_TEXT.learning.finish`
  in `src/features/learning/strings.ts` (DESIGN.md 12.1 rule 2), so the instruction and the
  button cannot drift apart. The fixed-time rule names it the same way when early finishing is
  allowed. `study-journey.spec.ts` asserts the sentence from the same constant.
- **Word-count parity of the condition onboarding on /study/task (DESIGN.md 9.20, P23):**
  - The page shows the researchers' per-condition onboarding text
    (`study_conditions.config.onboarding`). This is a second onboarding surface, besides the
    shared learning onboarding, and nothing checked its two versions.
  - The page now applies the P23 rule itself. It shows the condition text only when every
    condition of the study has one and their word counts differ by at most 10% (difference
    divided by the longer text, the same formula as the shared onboarding's unit test).
    Otherwise every participant gets the same procedural sentence, and the server logs the
    imbalance for the researchers.
  - Effect: an unbalanced protocol cannot give one condition more instruction than the other;
    it falls back to identical text for both. Condition configs are frozen once a study is
    active (database guard), so the outcome cannot change during data collection.
  - Measured with two demo studies: 10 against 20 words showed the fallback sentence to a 2D
    participant; 10 against 10 words showed the condition text.
  - The same check belongs in the console's pre-activation parity report, so researchers see
    it before activating a study, and in DR-019's notes. Both files are outside WP4 and are
    reported as cross-package needs.
- **Focus ring and the progress line in high contrast:** unchanged. Both root causes are in
  WP0's primitives and stay reported there; the study layout's focus-ring stopgap remains until
  WP0 removes `outline-none`.
- **Verification (this round):** a headless audit (one Chromium, closed afterwards) of the
  reconstruction step and the task onboarding at 1280 and 390 px: 0 px horizontal overflow, one
  h1, light theme, every control at least 44 px (apart from the documented canvas exception),
  and the withdrawal link present (44 px tall) on the editor and on the onboarding. The three
  state messages of the reconstruction page render the same footer through `BackToSession`; they
  were not screenshotted, because the engine redirects to the hub once the step is complete.

### Final Pass

- **Withdrawal confirmation in its own group:** the reason list closes on its own rule, and the
  confirmation row opened 32 px below it with a second rule, so the two parallel hairlines read
  as an empty sixth reason. The confirmation is now its own fieldset with the legend "Confirm
  Withdrawal" (text-h3, like "Reason (Optional)"), so a heading separates the two ruled blocks.
  Both legends pass through `titleCase()`. The controls, names and form data are unchanged.
- **Session hub footer:** the step list ends on its own closing rule, and the withdrawal footer
  drew a second rule 48 px below it (an empty band, most visible in high contrast). `StepFooter`
  takes `ruled={false}` for this case: the footer sits 24 px under the list's rule and draws
  none. Every other step keeps the ruled footer.
- **Concept map after a window resize:** a map opened at 1280 px and then narrowed to 390 px
  keeps its 1280 px view, so the concepts sit off to the right until the participant uses the
  44 px fit-view control. React Flow does not refit on resize, and refitting would change the
  task's view behaviour, so it is left as is. A map opened at 390 px is centred as documented
  above.
- **Verification:** a headless audit (one Chromium, closed afterwards) walked every `/study`
  route at 1280 and 390 px: entry (empty, unknown code, a reason note, the resume view),
  consent (and its field error), the three questionnaires, pre-test, device check (and its
  Display Settings dialog), withdrawal, task onboarding, post-test, transfer, the session hub,
  the five debrief outcomes and the reconstruction task. A second participant repeated the walk
  in high contrast. Every page had 0 px horizontal overflow, 0 moving elements, one visible h1,
  the light theme (with `a11y-contrast` only when chosen) and no control under 44 x 44 apart
  from the documented canvas exception. Every visible h1-h3 equals its `titleCase()` form except
  the consent heading's verbatim version identifier. Typecheck and lint are clean;
  `tests/unit/assessment-ui` (29), `study-journey.spec.ts` (5), `assessment-concept-map.spec.ts`
  (1) and the study-engine integration suite (14) pass.

### Third Review Round

- **Keyboard focus after a refused submit (WCAG 2.4.3; DESIGN.md 9.1 "aria-disabled and
  focusable"):** every study submit button carried the native `disabled` attribute while its
  action ran. Disabling the focused button dropped focus to `<body>`, so after a refused entry,
  consent or withdrawal the next Tab started from the end of the page.
  - The buttons now carry only `aria-disabled` while pending (grey label, still focusable). This
    covers the entry, consent (both buttons), withdrawal, `ActionForm` (task start, resume),
    `FinishForm`, the assessment form, the device check and the concept map's submit dialog.
  - A second submit while pending is ignored in `onSubmit`, because React does not run a form
    action whose submit event was default-prevented. The device check and the map dialog guard
    in their handlers.
  - After a refusal with a field error, focus moves to the first invalid control: the study
    code, or the consent or withdrawal confirmation. That control names its error through
    `aria-describedby`, and on consent Space then ticks the box. A form-level error ("No study
    has this code") leaves focus on the button that was pressed; its alert is announced. The
    assessment form keeps its focused error summary (9.5). The shared hook is
    `useStudyFormGuard` in `src/components/study/action-form.tsx`.
- **Nothing entered is lost on a refusal (found while testing the above):** React 19 resets a
  form after every completed form action, refusals included, by calling `form.reset()`.
  - A refused entry wiped the typed code.
  - A refused withdrawal (confirmation not ticked) silently put the chosen reason back to "I
    prefer not to say". If the participant then ticked the box and submitted, the wrong reason
    was recorded.
  - A refused assessment submit, such as a required question left out, wiped every answer
    already given.
  - The `reset` event is cancelable, so every study form cancels it (`keepEnteredValues`). A
    study form has no reset button, and a successful action navigates away. Unit tests cover the
    assessment answers and the withdrawal reason; the first fails without the fix.
- **High contrast is offered once (WP4 task 2; DR-019):** it was offered on the consent page and
  again at the device check, but only the final value was stored. A participant could take the
  pre-test in one display and the post-test in another without a record.
  - The choice is now offered only on the consent page, before any measured step.
  - The device check shows it read-only ("You chose the display before the study began. It stays
    the same for the rest of the study. If you cannot read the pages, tell the facilitator.")
    and records that value with the check.
  - Nothing in the study can change it after consent, so the one stored value is the display of
    the pre-test, the learning task and the post-test alike.
  - The offer is identical for both conditions (it comes before allocation), and the device
    check still takes no condition input.
  - Trade-off: a participant who finds the pages hard to read later cannot switch mid-study.
    The page tells them to ask the facilitator. A mid-study switch would make the baseline and
    the outcome tests differ in display, which the analysis could not see.
  - Limitation: the choice lives in the browser's storage, so a session resumed in another
    browser is recorded with that browser's setting.
  - DR-019's notes (WP0's decision log) should record this.
- **Progress line in high contrast:** high contrast sets `--rule` to `--ink`, so the 2 px track
  and its indicator were one solid rule. `StepProgress` now passes a high-contrast-only class
  (`hc:`), so the track becomes an 8 px `--sunk` channel with a 1 px ink outline that the ink
  indicator fills. Normal contrast is unchanged (2 px ink on rule). "Step n of N" still states
  the value in words. A fix in WP0's Progress primitive would make this class redundant.
- **Link-handle hit areas on the concept map:** the `::after` hit area of each handle is now 55 x
  55 flow px. That is 44 x 44 CSS px at the 0.8 floor of the opening fit, and larger at any
  higher zoom; measured, 45 px at the 0.818 fit at 1280 px. It extends 41 px away from the box
  and 4 px into it, as before, so the box stays free to drag. Below 0.8, which only the
  participant's own zoom-out reaches, the 44 px relationship form and list are the equivalent
  control (WCAG 2.5.5 exception). The concept boxes stay under the same documented exception.
- **Concept map on a phone:** unchanged. The 0.8 floor still opens the map centred with 2 of 6
  concepts fully in view at 390 px; fitting the whole map would set the labels at about 8 px.
  The map is also not refitted after a resize, as documented in the Final Pass. A study that
  includes a map step should set a minimum viewport that excludes phone widths; the device check
  already enforces the study's minimum viewport. That is a protocol setting, outside WP4.
- **Right edges of the onboarding pages:** `/study` and `/study/consent` held the whole page to
  the 34rem measure, so the action row ended at 864 px while the header's "Study" eyebrow ended
  at 960 px (at 1280). The forms, rules, confirmation row and action row now span the 40rem
  study column, as every in-session step does, and running text keeps the 34rem measure.
  Measured: the action row ends at the eyebrow's right edge on both pages, at 1280 px (960) and
  at 390 px (374). This replaces the earlier choice to keep entry at 34rem: the onboarding pair
  now matches the in-session steps, not only each other.
- **Map step width:** the concept-map editor now lets only the canvas break out of the 40rem
  column (centred, up to 72rem, gutters kept), so the prompt, the form and the action row can
  stay on the column. The study shell (WP0) still widens the whole page, header included,
  whenever a React Flow canvas is present, so the wordmark still moves from x = 320 to x = 56 on
  this step. Once WP0 stops widening the header and `<main>`, the breakout keeps the canvas wide
  with no further WP4 change.
- **Copy and titles:** every study page's metadata title is now `titleCase()` of its own h1, so
  the tab title and the heading agree. For example, the pre-test is "Questions Before Learning",
  and the map step is "Connect the Concepts".
  - The hub's description reads "Where you are in the study and what to do next.", which is
    true while learning is open and when all steps are done.
  - The debrief's h1 is the neutral "Thank You", which is also true after a declined consent,
    when no session started. The message heading under it names the outcome: "Your Session Is
    Complete", "You Chose Not to Take Part", "This Study Cannot Continue on This Device", and
    so on.
- **Relationship form rule:** the "Add a Relationship" form opened with a 2 px ink rule, which
  DESIGN 7.5 reserves for running heads. It is now a 1 px `--rule` hairline.
- **Verification:**
  - Typecheck and lint are clean on every WP4 file.
  - Vitest with 1 worker: `tests/unit/assessment-ui` (3 files, 33 tests) and
    `tests/unit/study` with title case (73 tests in all), and the study-engine integration suite
    (14), all pass.
  - Playwright with 1 worker against port 3300: `study-journey.spec.ts` (5) and
    `assessment-concept-map.spec.ts` (1) pass. The journey now asserts, by keyboard, that a
    refused entry (empty code, unknown code from the field and from the button), consent and
    withdrawal leave focus on the field, box or button and never on `<body>`, and that the typed
    code survives a refusal. It also asserts that the device check has no second display switch.
  - A headless audit (one Chromium, closed afterwards) repeated the full walk at 1280 and 390 px,
    in light and in high contrast. Every page had 0 px overflow, 0 moving elements and one h1.
    Metadata titles equal the h1s, and the right edges are as described above.

## WP5: Research Console and Dashboard

**Scope:**

- every page under `src/app/(research)/research`, its `_components` and the dashboard's
  `_components`;
- `src/components/analytics`: the charts, the ECharts hook and the condition encoding;
- the research-side assessment components: `map-viewer`, `rater-editor`, `item-form` and
  `action-form`;
- the WP5 tests.

No study (learner) surface is touched, so no WP5 change can differ between the 2D and 3D
conditions.

### Console Pages (11.8)

- **One set of building blocks.** Every research page now uses the blocks in
  `_components/common.tsx`:
  - `Section`: a 1 px ink rule, an optional eyebrow running head, a Title Case h2 in `text-h2`,
    a description in `text-body` ink-2 at 40rem, and actions right-aligned (wrapping under
    768 px);
  - `SummaryList`: a two-column `<dl>` that stacks under 520 px;
  - `StatRow`: the section 10 stat row as a numbered booktabs table;
  - `Empty`: one plain line, no box;
  - `Notice`: the 9.7 alert with an icon and a bold word;
  - status badges with a word and an icon, and the 44 px field, check-row and link classes.

  Two blocks were added for the pages that still had raw `<details>` and text download links: a
  server-safe `Disclosure` (44 px summary, instant open) and `LINK_BUTTON` (an anchor drawn as
  the 44 px outline button, for downloads).
- **Pages migrated in this round:**
  - the study detail page;
  - the three assessment pages: list, version detail and expert reference map;
  - exports and pathways;
  - the three scoring pages: list, concept-map breakdown and rubric rating.

  They still had the pre-Apparatus classes: `text-sm`, `rounded-lg` cards, `muted-foreground`,
  32 px selects, `size-4` checkboxes, pill version links and plain underlined text links. The
  overview, studies, sessions, participants, analytics, parity and dashboard pages were already
  on the blocks.
- **Detail pages open with a `<dl>` summary**, not an ad-hoc title line:
  - study: title, slug, status, protocol, design and activation time;
  - assessment version, reference map, concept-map breakdown and rubric.

  The page h1 stays the route label from the console route table, so each page has exactly one
  h1.
- **Headings never Title-Case a code.** Item keys, assessment codes and participant codes are
  identifiers; `titleCase()` would turn `pre.q1` into `Pre.q1`. Card headings are therefore
  written words ("Item 3: Single Choice", "Rubrics for Item 4") and the key follows as a
  `text-mono` line.
- **Every list is a booktabs table.** That covers conditions, battery, instruments, keyed
  assessments, rubrics, export tables, pairwise agreement, reference edges, concept-map scores
  and analysable sessions.
  - Each table has a numbered caption ("Table n.", in page order) and `scope="col"` headers.
  - Numbers are right-aligned `tabular-nums`, with fixed decimals per column: rates 3 dp,
    proportions 2 dp.
  - Undefined values print an en dash, never the word "undefined".
  - Wide tables scroll inside their own labelled region, never the page.
- **Battery table.** Its checkboxes sit in 44 x 44 label cells. Its phase selects and position
  inputs are the 44 px controls. The position input is right-aligned, with tabular figures.
- **Version switcher** (assessment detail). The pill links became underline tabs, as in 9.6,
  with a 3 px indigo bar on the current version. They are 44 px tall and sit inside a `nav`
  labelled "Versions".
- **Reference-map choice** (scoring). This is a ruled list of 44 px links. The current map
  carries a 3 px indigo left rule, ink 600 and the word "Selected", so the choice is never shown
  by colour alone (R-A4).
- **Status words.**
  - A tied consensus edge is a `warn` badge with an icon and "Tie: adjudicate".
  - The "ties remain" line is "Warning:" with an icon.
  - A configuration that does not validate, and stored scores that differ from a recomputation,
    use the error `Notice`.
  - The `--danger` text lines and the `bg-accent` row tint are gone.
- **The Demo data badge** (11.8). It now sits on every section of every detail page whose
  record is a demo one: assessment, reference map, study, session (`nonExperimental`) and
  concept-map breakdown (the reference's `isDemo`). The rubric page has no demo flag in its read
  model, so it shows none.
- **Canonical order.**
  - The study form lists the snapshot's traditions with `inCanonicalOrder` from `labels.ts`, not
    in slug order (DR-019).
  - Pathways puts the conditions 2D first (DESIGN.md 10) in three places: the correspondence
    table's columns, the transition matrices and the session list.
- **Downloads** are anchors with `download`. The full JSON bundle is a 44 px outline button in
  the section's action slot. The per-table CSVs are 44 px links in the export-tables table.

### Dashboard (11.9 and Section 10)

- **Row order** is now the 11.9 order:
  1. Table 1, Enrolment and Completion, with the live status at its right.
  2. The pre/post slope chart and the gain dot-and-interval chart, side by side.
  3. Dwell time per layer, then Table 2, Per-Item Statistics.
  4. The Interface Parity card.
  5. The descriptive tables, telemetry, data quality and definitions.

  Figures and tables are numbered in page order, so dwell time is "Figure 3" here and not 11.9's
  "Figure 4". Figure 3 of 11.9 is not drawn (see below), and 7.6 numbers figures per view.
- **Dwell time per layer** (new). It is drawn as a value heatmap on the sequential indigo ramp.
  - Every cell prints its value, to 1 dp, or an en dash when it is undefined.
  - Rows are the conditions, 2D first. Columns are the layers in the one `KNOWLEDGE_LAYERS`
    order, then "Citation", which telemetry also records as an exposure layer.
  - **Source:** the stored, versioned session metric `time.exposure_by_layer_ms` (its
    `details.byLayer`, from `src/features/telemetry/metrics.ts`), for in-scope sessions only
    (the dashboard's rule).
  - **Freshness:** the metric is written by the metrics pipeline, not by the live rollups, so
    the "How to read" line says the values are current as of the last metrics recompute.
  - **Missing layers:** a session that never opened a layer contributes 0 minutes to it; that is
    a recorded absence, not an imputed value. A condition with no session is undefined.
- **Table 2, Per-Item Statistics** (new). It is built from the stored per-answer score
  `item.key_match`.
  - Each session and item counts once (latest attempt, latest computation), the same way keyed
    scoring scores.
  - Each item gets n and the proportion correct (2 dp) per condition.
  - Items are ordered pre-test, post-test, transfer, then by position.
  - The read code is `dashboard/_components/dashboard-extras.ts`; its aggregation functions are
    pure and unit-tested.
- **Not drawn: Gain by Tradition (11.9 Figure 3).** (Superseded in the review round below: the
  figure is now drawn from the knowledge test.) The primary outcome (`cmap.recall.dl`) is
  one map-level score per participant.
  - No per-tradition outcome is defined in `metric-definitions.ts` or stored.
  - Inventing one, for example by splitting keyed items by their concept's tradition, would be a
    new, unregistered measure.
  - So the section is omitted, not shown empty. It needs a study decision that defines a
    per-tradition outcome; `assessment_items.concept_id` is the obvious data path for it.
- **Download CSV under every dashboard figure.**
  - Rows with a server CSV route (`/research/dashboard/csv`) keep it.
  - Dwell time and Table 2 have no server table in the export dictionary, so they use
    `CsvDataButton`. It builds the CSV in the browser from exactly the table on screen, with
    RFC 4180 quoting. Text that a spreadsheet would run as a formula gets a leading apostrophe.
  - The button is rendered only for staff with `exports.create` or `exports.identified`, the
    same gate as the server CSV links, so it opens no new download path.
- **Charts follow the tokens.** `use-echart.ts` builds the chart theme with `readVizTheme()`
  from `getComputedStyle(document.documentElement)`.
  - It reads the tokens at mount, and again whenever the `class`, `style` or `data-theme`
    attribute of `<html>` changes, so light, dark, HC light and HC dark all repaint.
  - `animation: false`, with the SVG renderer.
  - The old `#2a78d6` / `#eb6834` / `#1baf7a` palette does not exist anywhere in the chart code.
- **Condition encoding.**
  - 2D: `--series-2d`, a circle and a solid line.
  - 3D: `--series-3d`, a square and a 4-2 dashed line. Count bars draw the 3D bar with a dashed
    ink outline.
  - 2D is always first or left. Labels are direct, with no legends.
- **Keyboard access to chart values.** The ECharts tooltip is pointer-only. Keyboard and
  screen-reader users get the same values from:
  - the role="img" label, a sentence giving the centres and n;
  - the "Data table" disclosure under every figure, a booktabs table of exactly the plotted
    data.

  No focusable element sits inside a plot area. Series-2d against indigo is only 1.59:1, so
  section 10 forbids links there.

### Equivalence Monitor (Task 4)

- **`/research`** leads with the monitor: the interface run line, then the content parity table
  of the active studies.
- **`/research/parity`** shows the full per-check table (Check, What Is Compared, 2D, 3D, Delta,
  Tolerance, Runs Passed, Status) above the run form and the report history.
- **One source.** Both pages pass only `readInterfaceParity()` (the stored
  `analysis/parity/interface-parity.json`) to the WP0 component. With no file the monitor prints
  "No parity run recorded yet." and nothing else.
- **The dashboard's Interface Parity card** uses the same run line, or the same sentence.

### Tests

- `tests/unit/research/viz-tokens.test.ts`:
  - parses the four token blocks of `globals.css` and resolves them as the cascade does on
    `<html>`;
  - asserts that every colour `readVizTheme` returns equals the token's computed value in light,
    dark, HC light and HC dark;
  - checks the DESIGN.md 4.2 series and ramp values;
  - source guards: no colour literal or old palette in the chart code; `animation: false`; the
    theme re-read on `<html>` class changes; the marker and dash encoding; no legends;
  - checks the client CSV's quoting.
- `tests/unit/research/equivalence-monitor.test.tsx`:
  - a missing, malformed or empty report reads as null;
  - a fixture report file is summarised, and a check passes only if every run passed;
  - with no run, the monitor renders only the sentence; with a run, the fixture's real values;
  - both pages feed it only from `readInterfaceParity()`.
- `tests/unit/research/dashboard-extras.test.ts`:
  - the layer-column order;
  - the dwell-time means: 0 for an unopened layer, null for an empty condition;
  - the per-item proportions and their ordering.

### Fixes Found by the Visual Audit

- **Links inside prose were 20 px tall** ("Pathways" on Analytics, "Full export" on the
  dashboard). Each now stands as its own 44 px link after its sentence ("Open Pathways", "Open
  Full export"). The remaining inline links use the 44 px link class.
- **The concept-map breakdown overflowed by 56 px at 1280.** `MapViewer` reuses the participant
  editor, whose canvas breaks out of the 40rem study column to up to 72rem of the viewport. In
  the console that breakout ran past the rail. The wrapper now pins the breakout width to its
  container, which measures 0 px overflow. The editor itself (WP4) is unchanged.
- **Table 1's comparator line truncated** ("Demo: Conventional 2D 1 · Demo: I…"), which hid the
  3D value. It now wraps, and the label row keeps the values on one baseline.
- **Grouped count bars overprinted their labels**: full condition names at every bar, including
  zero bars. Under several series each bar now prints its value over a short key, "2D" or "3D",
  on two lines. Full names stay in the tooltip, the caption and the data table.
- **Sessions with no allocated condition** showed as "Null" (a pathways figure title) or as a
  blank cell (the analytics completeness table). They now read "Unallocated" in titles and "Not
  yet allocated" in cells. In titles the word "yet" would stay lower-case under `titleCase()`,
  so the titles use "Unallocated". These sessions sort after the conditions.
- **Badges inside a link were underlined** (the reference-map list on Scoring). Only the link
  text carries the underline now.

### Verification

- Typecheck (`tsc --noEmit`) and ESLint are clean on every WP5 file.
- **Vitest, 1 worker:** `tests/unit/research`, 11 files and 74 tests, all pass, including the
  three new WP5 files. The integration suites `research-dashboard.test.ts`,
  `research-dashboard-perf.test.ts` and `research-console.test.ts` (26 tests) pass.
- **Headless audit, one Chromium closed afterwards, against the dev server on port 3300:**
  - every research route at 1280 and 390 px: overview, studies, study, sessions, session,
    participants, analytics, pathways, dashboard, exports, parity, scoring, concept-map
    breakdown, assessments, assessment and reference map;
  - the main surfaces also in high contrast and dark;
  - result: every page has 0 px horizontal overflow and one h1. The only targets under 44 px are
    inside the shared concept-map editor (WP4): concept nodes 37-38 px tall, and the
    React Flow attribution link in rater mode.
  - Charts repaint in dark and high contrast, with the series, grid and ink taken from the
    tokens.
- **`research-dashboard-live.spec.ts`:** the live push works. Each inserted event appeared
  without a reload, and the page, probe, stream and CSV all carried no-store. The median latency
  assertion (under 2 s) missed in two runs (2134 ms, then 3725/2132/3252 ms) while another
  agent's browser audit drove the same dev server, which held 7.2 GB, at about 51% CPU. The two
  queries WP5 adds were timed at 1-3 ms each, in parallel with the existing read, so they do not
  account for the miss. The latency check needs a quiet machine.
- **Local data:** the local database holds no `time.exposure_by_layer_ms` or `item.key_match`
  rows, so dwell time and Table 2 rendered their empty states here. The aggregation is covered
  by the unit tests.

### Review Round: Fixes After the Independent Review

- **Chart accessible names (major).** ECharts' `aria` component replaced the `aria-label` on
  every `role="img"` plot with its own English description. That text mixed category indexes
  with values and carried no figure number. The `aria` option and `AriaComponent` are removed
  from `use-echart.ts`.
  - The accessible name is now the authored label: "Figure n. Title: values". Count bars read
    "Allocation by Condition: Demo: Conventional 2D, 7 participants; …".
  - Each small-multiple panel reads "Figure n. Title, Panel: 2D name, n = k: mean x, 95% CI a
    to b; …".
  - `tests/unit/research/chart-render.test.tsx` draws the charts with the real ECharts SVG
    renderer in jsdom and checks that the label survives. It fails if `aria` is put back
    (checked by re-adding it).
- **Direct group labels on dot-and-interval plots (major).** The x axis started its ticks at
  -0.5, so the labels at the integer group centres were never drawn.
  - Labels are now placed with `axisLabel.customValues` at 0..n-1, 2D left.
  - Each prints the condition key and n, for example "2D (n = 4)". Full condition names did
    not fit side by side under a small multiple and ran into each other. They stay in the
    caption's n line, the tooltip and the data table, as with the count bars.
  - Another kind of group prints its name.
- **Value axes (major).** Ticks were printed with the measure's decimals, which gave "-0.1,
  -0.0, 0.0, 0.0, 0.1". A duration axis also ran below zero while its caption said "from zero".
  - `niceScale()` (`encoding.ts`) now sets the bounds on a 1-2-5 step, and every tick prints
    with the decimals that step needs. Each tick prints once.
  - `fixed()` never prints a negative zero, and the console tables use it too.
  - With `zero`, the axis is pinned at 0. An interval end below zero is drawn at the axis; the
    tooltip and the data table keep the computed value. The captions now say "95% t interval,
    clipped at zero".
  - The slope chart uses the same scale.
- **Gain by Tradition (11.9 Figure 3) is now drawn.** Under the autonomous-decision rule the
  recommended route was the one that needs no new instrument: split the knowledge test that
  already exists.
  - The measure: for each session and tradition, the proportion of that tradition's keyed
    post-test items answered correctly, minus the same proportion on the pre-test. The scores
    are the stored `item.key_match` values, latest attempt.
  - An item's tradition is its concept's tradition (`assessment_items.concept_id` →
    `concepts.tradition_id`). Items with no concept, or with a shared concept, are not counted.
  - A session counts for a tradition only when it has scored items of that tradition in both
    tests.
  - It is drawn as small multiples on one y scale, traditions in the canonical (alphabetical)
    order and labelled by name, never by colour. Each panel shows every session, the mean and
    its 95% t interval.
  - The section says plainly: "a descriptive breakdown of the knowledge test, not a registered
    outcome; no causal reading". No value is imputed. With no linked items, the figure states
    what it needs and draws nothing.
  - The local database has no keyed items, so it renders its empty state here. The aggregation
    (`traditionGains`) is unit-tested. CSV: the client-built table, behind the same permission
    gate.
- **Stat rows without orphans.** `StatRow` picks a column count that divides the number of
  figures, with one row where it fits: 4 → 4, 6 → 3 or 6 (6 at 1280), 7 → 7, 8 → 4.
  - Measured at 1280: dashboard Table 1 is 4 in one row, Table 5 is 6 in one row, and Analytics
    Table 1 is 7 in one row.
  - Under `sm` two columns; an odd last figure spans both.
- **Metric keys wrap only at separators.** `breakableKey()` puts a `<wbr>` after each '.', '_',
  '/' and '-', and the cells use `overflow-wrap: break-word` instead of `break-all`. So
  "exploratory" and "time.exposure_total_ms" no longer split inside a word. This covers Table 3
  and the Definitions.
- **Per-Session Telemetry.** Condition and status cells no longer wrap, so a row is one line
  high.
- **Count bars.** Each allocation bar is coloured by its own condition (`kinds` per bar): 2D
  solid, 3D with the dashed outline. A zero bar draws no outline, so no dashed fragment shows
  under its "0".
  - The grid now contains the axis names (`outerBoundsMode: "same"`, `outerBoundsContain:
    "all"`, the ECharts 6 replacement for `containLabel`). Before, the y-axis name
    ("participants") sat outside the canvas.
- **Order and copy.** Analytics Table 2 orders 2D, 3D, then "Not yet allocated".
  - "Open the full export" and "Open pathways" are sentence case.
  - The Table 2 headers read "<condition> correct", as in the CSV.
  - Assessment items are numbered from 1 in the order participants see them, with the stored
    position on the key line ("ssq.1 · position 0").
  - The concept-map score table prints counts as integers, proportions to 2 decimals and "–"
    for undefined, instead of "1", "0" and "n/a".
- **Live status beside Table 1.** The caption sits on the 44 px row of the status and Refresh,
  on one line. The note runs under the status, right-aligned, and the whole status block stacks
  under the caption at 390 px.
- **Verification (this round).**
  - `tsc` and ESLint are clean.
  - Vitest with 1 worker: `tests/unit/research` passes, 12 files including the new
    `chart-render.test.tsx`. So do the three research integration suites.
  - Headless Chromium (one browser, closed afterwards) on analytics, dashboard, concept-map
    breakdown and assessment at 1280 and 390 px: 0 px overflow.
  - The figures were checked in light, dark and HC light. The probe read every plot's
    accessible name and SVG text: "2D (n = 4)" and "3D (n = 7)" under the groups, and ticks
    0.00, 0.05, 0.10, 0.15.

## WP6: CMS

Scope: `/cms/*`, the media governance of migration 0016, the content parity figure check, the Figure
Balance review gate and the learner figure route `/figures/[assetId]` (DESIGN.md 9.9, 11.10, 12.3
rules 8-10, 16; DR-018, DR-019, DR-020).

### Media Governance (Migration 0016)

- **New columns.** Assets gain `max_pixels` (the longest side the licence allows on screen; NULL
  means no cap), `licence_expires_on` (the last permitted day; NULL means no expiry) and
  `public_plate` (cleared for public-page plates as well as study figures). `source_url` already
  existed. An `illustration` link's `position` is the anchor claim index, and a check constraint
  keeps it non-negative. Drizzle generated the migration and its snapshot.
- **One set of rules.** `src/features/media/contracts.ts` holds the figure rules as pure
  functions, so the forms, the media service, the figure route and the parity engine use the same
  numbers:
  - the caption is at most 180 characters;
  - the alt text is 8 to 30 words (the target is about 15) and never repeats the caption (the
    comparison ignores case and punctuation);
  - the study cap is 768 px, equal to the lightbox cap;
  - the display edge is the stored size, limited by the licence cap.
  - **Judgement:** DESIGN.md says "about 15 words". The 8 to 30 word band is the tolerance we
    chose for "about".
- **Anchors.** The link form asks for the anchor claim by the number curators see in the proof
  (1, 2, 3 ...). The server stores it zero-based. It refuses an anchor that names no claim, and a
  second illustration on the same concept.
- **Upload form.** The alt text shows a live word count, and the caption a live character count
  against 180. Both turn into the server's own message when a rule breaks. The server re-checks
  everything; the counts only help.
- **Linking at upload (judgement).** DESIGN.md 11.10 lists "linked concept and anchor claim" among
  the upload fields. They stay a second step on the selected asset: the upload route is outside
  this package, and an asset can illustrate several concepts. The upload form says so, and its
  success message links straight to the asset.
- **Licence-expiry flag (judgement).** A licence that ends within 90 days is flagged "Expiring"
  with `--warn`, an icon and the word. An expired one is flagged "Expired" with `--danger`.

### The Learner Figure Route (`/figures/[assetId]`, Section 16)

- **What it serves.** The asset must be:
  - a real image, verified or published;
  - licence-valid on the request date;
  - no larger than its licence cap;
  - an illustration of a concept in a published release snapshot, or cleared for public plates.
- **Everything else** answers 404 with `no-store`, so an unservable asset looks like a missing one.
- **Caching.** `Cache-Control` is `public, max-age=31536000, immutable`, except that a licence
  with an expiry caps `max-age` at the time left in the licence, so no cache keeps a figure past
  its term.
- **Tests.** The integration test covers each condition. `cms-guards.spec.ts` checks that the
  proxy does not redirect the route and that unknown ids get 404.

### Figure Balance (11.10, 12.3 Rule 9)

- **Same rule as activation.** The content parity engine gains check `a.figures` (group a,
  critical, so it blocks activation). The CMS matrix displays the output of the same function,
  `figureBalance()`. It never counts on its own, so it cannot disagree with the gate.
- **How figures resolve.** Exactly as both conditions resolve them:
  - at most one figure per concept;
  - the structure diagram takes the slot while `figures.structureDiagrams` is on;
  - otherwise an approved, licence-valid illustration photograph whose anchor claim exists.
- **The issues it reports:**
  - a section whose counts differ across the study traditions;
  - a second approved illustration on one concept;
  - a photograph whose displayable long edge is below the 768 px cap (so no tradition's figures
    look sharper, R-C20);
  - an expired licence;
  - an anchor that names no claim.
- **Sections.** Sections are the `EPISTEMIC_SECTIONS` of the 2D tradition page. The science
  section holds both scientific mechanisms and explanations, so Sanganeri's colour diagram (which
  anchors on an explanation) balances against the other two traditions' (which anchor on
  mechanisms). The layer of a section is `exposureLayerOf` its types, so section balance also
  balances every layer and the total.
- **Loader.** `loadParityInput` (`src/server/research/parity/store.ts`) now passes every
  illustration link with its licence governance, and the day of the check. That file had no
  owner in section 18, and the engine needs the data, so it was edited minimally (as WP0a did
  with `utils.ts`).
- **Matrix presentation.**
  - A booktabs table: the three study traditions are the columns, in canonical order, under their
    short names with the neutral marker.
  - Sections are the rows, grouped under their layer. A total row follows.
  - Counts sit on the sequential indigo ramp, `--viz-seq-1..6` (0 is step 1, 5 or more is step
    6). The value is printed in every cell: ink on steps 1-3, on-indigo on steps 4-6, as 4.3
    computes.
  - An unbalanced row reads "Unbalanced: blocks publication to a study", with a danger icon.
- **Matrix views.** Two GET switches:
  - the bundle: the latest published release (what a study pins), or the review build (what the
    next release would carry);
  - structure diagrams on or off (the protocol switch, DR-018).
  The default is the latest release, or the review build while no release exists.
- **Caption placement (judgement).** On a phone the matrix scrolls inside its own labelled
  region (9.3). Its caption is set above the region, not inside the table, so the caption stays
  readable while the cells scroll.
- **Measured on the current review build.** 9 diagrams, 0 photographs: process sequence 2/2/2,
  scientific explanations 1/1/1, every other section 0/0/0. The matrix is balanced.

### Concept Editor Proof (11.10)

- **The real sheet.** The Proof renders the real shared `KnowledgeSheet` and `ClaimList`, inside
  a frame with registration ticks (7.3 allows ticks in the CMS proof frame).
- **Placement switch.** "Preview as: 2D column | 3D panel" changes only the container. The panel
  container is the docked panel's box: opaque `--ground`, a 1 px `--rule-strong` left border and
  an internal scroll, so the sheet's progress bar measures it.
- **Test.** `tests/unit/cms/proof-frame.test.tsx` checks that the sheet's DOM is identical in both
  placements, and that the proof does not move focus (`autoFocusTitle={false}`).
- **Layout.** Form and proof split 60/40 from 1280 px (`xl`). Below that, the proof follows the
  claims.
- **Figures.** The proof shows the graph-derived figure, balanced across the study traditions,
  exactly as both conditions would. It shows no photograph, because learners get none until the
  read model serves them (see the cross-package needs).

### Console Skin (11.10)

- **Tables.** Lists are dense booktabs tables (36 px compact rows, row hover `--sunk`). Links in
  them keep a 44 x 44 hit area (`hit-44`). Keys, ids, hashes and timestamps are mono with
  tabular figures, and counts are right-aligned.
- **Selection and status.** A selected row gets `--wash`, the 2 px indigo bar and a visible check
  with the word "Selected". Status badges always carry a word and an icon: review states,
  manifest states, candidate decisions and licence expiry.
- **Media library columns (11.10).** Thumbnail (a fixed 3:2 `--sunk` slot, `contain`), Asset,
  Credit, Licence, Max Pixels, Licence Expiry, Linked Concept, Anchor Claim, Tradition, Layer,
  State. An asset with several links spans one row per link.
- **Disclosures and choices.** Every `<summary>` is a 44 px indigo, underlined control
  (`SUMMARY`). Checkboxes and radios sit in full-row 44 px labels, with the indigo accent.
- **Spatial studio.** The studio now uses the console section, the 44 px select skin and outline
  buttons. Its tradition checkboxes list in canonical order.
- **Canonical order.** The traditions list is sorted in canonical order (12.3 rule 12, the same
  order as every learner list).
- **No madder or ochre** anywhere in the CMS (the lint rule passes).
- **Fix: React Flow controls.** The zoom controls and the attribution link of the relationship
  graph were 26 px. React Flow's stylesheet is unlayered, so it beats Tailwind's layered
  utilities, and Tailwind read the `__` in its class names as spaces. The selectors now escape
  the underscores and use `!`, which gives 44 px controls. The controls moved to the top left,
  so they no longer collide with the attribution.
- **Fix: client-module constants.** The media library, a server component, read constants from
  a `"use client"` module. In a server component those resolve to client references, not values,
  so the provenance labels printed raw and the check-row classes were missing. The constants
  moved to the server-safe `bits.tsx`.

### Verification

- Typecheck (`tsc --noEmit`) and ESLint are clean on every WP6 file.
- **Vitest, 1 worker:** `tests/unit/cms` (new `proof-frame.test.tsx`), the parity engine and
  figure-balance units, `tests/unit/knowledge`, and the integration suites `cms-media`,
  `cms-workflow`, `cms-spatial`, `research-console` and every `schema-*`. All pass.
- The migration applies on `episteme_test`, and `drizzle-kit check` is clean.
- **Playwright, 1 worker, port 3300:**
  - `cms-guards.spec.ts`: 11 tests pass, including the 2 new figure-route tests;
  - `alignment.spec.ts`, the 390 px no-overflow tests: pass.
- **Headless audit, one Chromium closed afterwards.** All CMS routes at 1280 and 390 px, in
  light and high contrast. Routes: overview, concepts, concept editor, traditions, sources,
  relations, review, media, media with an asset selected, datasets, spatial.
  - Every page: 0 px horizontal overflow and no interactive target under 44 x 44.
  - Below 44 x 44 before this package: React Flow controls (26 px), filter links (16-20 px),
    native selects (32 px), summaries (20 px) and row links (17 px).
- **Temporary fixture.** To check the library rows and the selected-asset view, one neutral
  grey test image was created and linked in the local database. It was deleted afterwards, with
  its stored file. Its audit-log rows remain, because that log is append-only.

### Review Fixes (Independent Review of WP6)

An independent reviewer audited the CMS after the first pass. These are the decisions taken in
response.

- **Keyboard focus was invisible on most controls (WCAG 2.4.7; 9.1, R-A5).** The global
  `:focus-visible` rule sits in the base layer. Tailwind's `outline-none` is a utility, sits in a
  later layer, and sets `outline-style: none`, so it won. Button, Input, Textarea, Checkbox,
  Radio, TabsTrigger, TabsContent and the CMS native select all carry it.
  - The CMS native select (`SELECT_CLASS` in `bits.tsx`) no longer carries `outline-none`.
  - The primitives belong to WP0. Until WP0 drops `outline-none`, the CMS layout wraps the
    console shell in a `display: contents` element. Its arbitrary variant
    `[&_:focus-visible:not([tabindex='-1'])]:outline-solid` restores only the outline *style*.
    Width, colour and offset still come from the global rule, so light mode keeps the 2 px indigo
    ring and high contrast keeps the 3 px black ring with its white halo. Programmatic focus
    targets (`tabindex="-1"`) still get no ring. Once WP0 removes the utility the wrapper is
    redundant, and it does no harm.
  - React Flow's unlayered stylesheet sets `outline: none` on nodes and edges. Nodes get the
    indigo ring back through `!` utilities. Edges are SVG groups, so a focused edge's path
    turns indigo at 3 px instead of drawing an outline.
  - The headless audit now checks focus. On each page at 1280 px it presses Tab until focus
    cycles (at most 400 stops). Every focused element must match `:focus-visible` and draw a
    non-none, non-transparent outline; a React Flow edge passes with a stroke of at least 3 px.
    The audit finishes the colour transition before measuring, because `transition-colors`
    animates `outline-color` too.
- **Figures without a credit or caption (9.9, 11.10, R-H5, honesty rule 13.3).** The upload
  contract is unchanged: credit stays optional when an asset is uploaded. Every gate after upload
  now requires it.
  - Verifying an image or texture needs a credit. Verifying an image needs a caption, unless it
    is explicitly decorative (empty alt text); a decorative image is never a figure.
  - The parity engine's `a.figures` check (critical) raises `figure_metadata` for any approved
    illustration with no credit, caption or alt text. That figure is not counted as shown,
    because the learner route will not serve it. The caption it reads is the link's caption
    override, else the asset's caption, as learners see it.
  - `loadLearnerFigure` refuses an asset with no credit, caption or alt text. This covers an
    asset approved before these fields became required.
  - The metadata form marks Credit as required for images and textures, and Caption as required
    for non-decorative images. The library's Credit column shows "Missing: blocks verification"
    with a danger icon for an image without one.
- **Figure Balance under 520 px.** The matrix becomes label/value blocks (9.3 allows this under
  640 px). Each block gives the section, its status (icon and word) and one row per study
  tradition, in canonical order, with the count on the same ramp. A curator on a phone can then
  compare the three traditions without scrolling sideways. From 520 px up the table shows. In
  the table header the neutral marker and the name share a flex row, so a two-line name
  ("Machilipatnam Kalamkari") wraps inside its own box and the marker never sits alone on a line.
  The Total row's status has an icon, like the row statuses.
- **Mono keys.** `Mono` no longer uses `break-all`. Line breaks may fall only after `.`, `-`, `_`,
  `/` or `:`, and every 16 characters inside a separator-free run such as a hex hash.
  `overflow-wrap: break-word` stays as a last resort, because unlike `break-all` it does not
  shrink a table column's min-content width. Keys therefore no longer split mid-word
  ("nat ural").
- **Dense tables.** The media-candidates table gives the title column a minimum width, so titles
  no longer wrap to five lines while the Decision column stays empty. Content packages show by
  name, not slug. The concepts list shows the tradition's package name and the shared concept-type
  display names (`CONCEPT_TYPE_LABELS`, the same wording learners see in both conditions).
- **No pre-selected review decision.** On an item under review, the first option of the decision
  form was "Withdraw to draft", and it was pre-selected. A slip of Enter could withdraw the item.
  The form now starts with nothing chosen. The confirm button reads "Confirm decision" and stays
  focusable, with `aria-disabled` and the description "Choose a decision first." Clicking it or
  pressing Enter does nothing until a decision is chosen. `ActionForm` gained a `submitBlocked`
  prop for this. The media review form likewise pre-selects nothing; its radios are `required`.
- **Demo badge.** A demo concept shows the `Demo` badge next to its state badge (11.10),
  followed by "Fixture, read-only, never publishable into a study".
- **Still open: two h1s in the concept editor.** The page h1 ("Concept") and the Proof sheet's
  h1 both exist. This waits for WP0 to add a heading-level prop to `KnowledgeSheet`.

## WP7: Admin

Scope: `/admin`, `/admin/users`, `/admin/roles`, `/admin/audit`, `/admin/settings` and
`src/components/admin/user-forms.tsx` (DESIGN.md 9.1-9.5, 9.18, 11.11). The admin skin is the
plainest console skin: `ConsolePage` draws the 2 px ink rule above every page header, with no band
and no madder or ochre anywhere.

### Shared Pieces

- **One console vocabulary.** The admin pages reuse the CMS helpers in `src/components/cms/bits.tsx`
  (`NativeSelect`, `FormField`, `Mono`, `Stamp`, `Section`, `Empty`, the link and disclosure
  classes) and the CMS `ActionForm`. They are read, not edited, so admin and CMS controls look and
  behave the same (44 px fields, the same error alert that takes focus, the same live status line).
- **Status words.** Every status is a badge with an icon and a word (`OK`, `Attention`,
  `Unavailable`, `Active`, `Locked`), coloured `--ok`, `--warn` or `--danger` only here in the
  console (R-A4).
- **No height overrides.** The old `h-10` and `min-h-10` classes on inputs, selects and buttons are
  gone, so every admin control renders at the 44 px default. Measured: no interactive element in
  `main` below 44 x 44 on any admin page at 1280 or 390 px, in light and in high contrast.

### Overview (`/admin`)

- **Health as equal cards.** Each check is a `Card` with a plate head (2 px ink top border), a
  Title Case h3 and its status badge on one line, then a label/value list. The grid stretches the
  cards to equal heights in each row. Numeric values (round trip, counts, lag) are right-aligned
  with tabular figures; text values stay text.
- **Sections list.** The admin sections are a booktabs-ruled list of 44 px links, each with one
  line on what it holds. The old row of bordered pills is gone.

### Users (`/admin/users`)

- **Booktabs table.** Table 1 lists name, email and account id; the role badges; the status;
  the creation time (mono, UTC); the active sessions (right-aligned, tabular); and a trailing
  44 px "Manage" menu button. The account id stays visible, because the audit log filters by it.
- **Row-action menu (judgement).** DESIGN.md asks for "a trailing 44 px row-action menu". The
  trigger is a labelled outline button ("Manage", accessible name "Manage <name> (<email>)") rather than an
  icon-only "…", so the action is named in words. Its items are "Add a role…", "Remove <role>…"
  for each held role, and "Lock account…" or "Unlock account…". For your own row, the lock item is
  a disabled line that says why.
- **Dialogs for every change.** Each item opens a dialog. Closing it (Cancel, Close, Escape or
  success) returns focus to the row's Manage button, because the menu item that opened it no
  longer exists. A polite live region in the row announces the server's result. Measured: focus
  is on "Manage <name>" after Cancel and after Escape.
- **Typed confirmation.** Removing a role and locking an account are destructive. Their dialogs
  ask the administrator to type the account's email address. Until it matches (case and outer
  spaces ignored), the filled danger button stays focusable with `aria-disabled` and a note that
  says why, and a click or Enter does nothing. Measured: a click on the inactive button leaves the
  dialog open; after typing, the button turns to the filled `--danger` with the on-indigo label
  (`rgb(163, 36, 44)` and `rgb(251, 248, 242)`). The filled danger variant appears only in these
  dialogs (9.1). Granting a role and unlocking are not destructive, so they have no typed step.
- **Client-side safeguard (limitation).** The typed confirmation is checked in the browser. The
  server actions (`src/server/admin/actions.ts`, which no work package owns) still enforce
  permissions, the last-administrator rule and self-protection, but they do not re-check the typed
  text. It is a guard against slips, not a security boundary.
- **Phones (9.3).** Under 640 px the table turns into stacked label/value cards. It keeps one
  DOM: the rows become two-column grids, with the name and the Manage button on top, then one
  line per column, with labels that only show there. Explicit ARIA table roles keep the table
  semantics when the display type changes, because some browsers drop them.

### Roles (`/admin/roles`)

- **Policy as a numbered list** at the 40rem measure.
- **Permission matrix.** It has booktabs rules, a check glyph with visually hidden "Yes", and a
  dash with hidden "No". The header row and the permission column are sticky.
- **Why not the Table primitive (judgement).** A sticky header sticks only inside its nearest
  scroll container, and the primitive's container scrolls only sideways. So the matrix has its
  own labelled region that scrolls both ways, capped at `min(44rem, 100dvh - 8rem)`. It keeps the
  primitive's booktabs styling. Sticky cells have an opaque `--ground` fill. Measured after
  scrolling the region 400 px down and 300 px across: the header stays at the region top and the
  first column at its left edge, at 1280 and at 390 px.

### Audit Log (`/admin/audit`)

- **Filter bar.** A labelled GET form of 44 px inputs and a native select in the Input skin, set
  on a 1-, 2- or 3-column grid so the fields line up. "Clear filters" appears only while a filter
  is set.
- **Table.** When (mono, tabular, to the second, because events can fall in one minute), actor,
  action (mono), entity and id (mono, breaking only at separators), reason and data. The before
  and after states sit behind one 44 px disclosure as `--sunk` mono blocks. Under 640 px the log
  stacks like the users table. The page range goes in the table note, and paging uses 44 px
  "Newer entries" and "Older entries" links.

### Settings (`/admin/settings`)

- **Sections.** Each group has a `text-eyebrow` running head over a 2 px ink rule, then a ruled
  label | value | source list. The source (an environment variable or a file) is mono and
  right-aligned.
- **No save bar and no Danger zone (judgement; DESIGN.md 13 over 11.11).** DESIGN.md 11.11 asks
  for "a sticky 'Save changes' bar, and a 'Danger zone' alert". There is no settings table:
  `src/server/admin/settings.ts` derives every value from the deployment or the code, and nothing
  here can be saved. A Save button or a destructive control that did nothing would misstate what
  the console can do. The page instead opens with a "Note: read-only" alert saying where each
  value is changed. If editable settings are ever added (a settings table and server actions,
  outside this package), the save bar and the Danger zone with typed confirmation should come
  with them. The admin's real destructive actions (lock, remove role) already use that pattern on
  the Users page.

### Review Fixes (Independent Review of WP7)

- **Keyboard focus on buttons and inputs (not fixed here).** The reviewer measured that the
  `Button` and `Input` primitives carry Tailwind's `outline-none`, which sits in the utilities
  layer and beats the global `:focus-visible` ring in the base layer. On every admin route a
  focused button or input therefore shows no visible indicator (WCAG 2.4.7, DESIGN.md 9.1). The
  fix belongs in the WP0 primitives (`src/components/ui/button.tsx`, `input.tsx` and the other
  primitives with `outline-none`), not in the admin pages, so it is reported as a cross-package
  need. No admin page overrides the outline itself.
- **Overview timestamps and keys in mono.** The telemetry "Last batch (UTC)" value is now a
  `<time>` in `text-mono`, like the "Checked" stamp and the users and audit times (5.2). The
  quarantine reason keys (`seq_conflict` and the like) are `Mono` with breaks only at separators.
  The database server version is mono and wraps only at its spaces, so a Debian build string such
  as `18.6-1.pgdg12+2` no longer splits after the hyphen.
- **Audit data blocks inside a hovered row.** The table's hover fill is `--sunk`, the same fill
  as the before/after blocks, so a hovered (or tapped, on touch) row lost the block's edge. The
  blocks now carry a 1 px `--rule` border. Hover stays on, because it helps track a row across
  five columns.
- **Matrix scroll hint.** Measured: the matrix has 1271 px of content in a 976 px frame at 1280 px
  and a 1136 px frame at 1440 px, so it scrolls sideways at most desktop widths, not only on
  phones. A credit-line note under the caption ("Scroll the table sideways to see all 9 roles.
  The Permission column and the role headings stay in place.") shows below 1536 px, and the
  scroll region points at it with `aria-describedby`. Role headers keep their full names: an
  abbreviation would need a key, which costs more reading than one sentence.
- **Users: filter and paging.** The list had grown past 100 accounts with no paging, many of them
  test accounts with the same name. The page now has the audit log's filter pattern (a labelled
  GET form: "Name or email contains", role, status; "Clear filters" only while one is set) and
  shows 25 accounts per page with the shared `Pager`. The table note gives the range, the number
  matching and the total. The filter runs over the full alphabetical list on the server, so the
  locked count in the note refers to the matching accounts.
- **Distinct row-menu names.** The Manage trigger's accessible name is now
  "Manage <name> (<email>)". Names repeat (several test accounts share one); emails do not. The
  visible word "Manage" still starts the name (label in name, 2.5.3).
- **Still open.** The settings save bar and Danger zone remain a recorded departure from 11.11
  until the lead signs it off in `decisions.md` or amends 11.11 (neither file is in this
  package). Server-side re-checking of the typed confirmation still needs a change in
  `src/server/admin/actions.ts`, which no package owns.

### Review Fixes (Second Review of WP7)

- **Proportional figures in settings values.** The settings value column had `tabular-nums`.
  Inter's `tnum` feature also swaps in a tabular hyphen, so "15-minute" and "x-forwarded-for"
  showed visible gaps around every hyphen. These values are sentences, not a numeric column, and
  none is compared vertically, so the column now uses the default proportional figures (5.2
  numeral policy: proportional in prose). Measured: `font-variant-numeric: normal` on all 12
  values at 1280 and 390 px.
- **Typed confirmation is posted.** The confirmation input in the lock and remove-role dialogs now
  has `name="confirm"`, so the server action receives the typed address. The action schemas
  (`lockInput`, `roleInput`) are non-strict Zod objects, so the extra field is ignored until
  `lockStaffAction` and `revokeRoleAction` compare it with the target email. That check lives in
  `src/server/admin/actions.ts`, which no package owns, and stays a cross-package need.
- **Still open, outside this package.** The focus indicator on `Button` and `Input` (and the other
  primitives that carry `outline-none`) is a WP0 fix. Re-checked: `button.tsx` line 33 and
  `input.tsx` line 16 still carry `outline-none`. The settings departure from 11.11 still needs
  a decision record or an amendment, and the test accounts piling up on `/admin/users` are WP8's
  to clean up.

## WP8: Verification and Cleanup

### Cross-Package Needs Resolved

- **One notice strip (9.15).** The demo and staff-preview AccessNotice and the "under review" notice
  are one 40 px strip in both conditions. The merge is CSS (globals.css, "AccessNotice merge"),
  because the AccessNotice is rendered by the learning gate before the condition knows whether its
  snapshot is unverified. While an AccessNotice is present, the separate strip is hidden and the
  AccessNotice shows its "review" wording, written at three widths so it never wraps. A participant
  on unverified content sees the "under review" strip alone, in the same slot. `--notice-offset`
  and the 3D scene top follow whichever strip is shown, so the 3D canvas never leaves a 40 px gap.
  The 2D frame therefore keeps rendering its UnverifiedContentNotice (WP2's request to remove it
  would have hidden the notice from participants on unverified content).
- **StateMessage (9.7)** is now `src/components/knowledge/state-message.tsx`. The 2D
  content-unavailable page, both practice-unavailable pages, every 3D screen (loading, help, pause,
  context loss, failure, no WebGL) and the 3D unavailable and preparing states use it; the study
  flow's StudyStateMessage is a thin adapter over it. The 3D unavailable state now uses the same
  title and sentence as the 2D one (P23). The loading screen no longer repeats its title as its
  body.
- **Layer parts (12.1 rule 1).** SequenceList, LayerConceptHead, ComparisonBlocks and
  ConceptChooser exist once, in `src/components/knowledge/layer-parts.tsx` and
  `concept-chooser.tsx`, with plain-data inputs. Each condition keeps a small adapter that maps its
  data and supplies how the head's action acts (`renderAction`: navigate in 2D, walk in 3D), as
  RelatedConcepts and Pager do with `renderLink`.
- **One string table (P20).** LAYER_TEXT, TASK_TEXT, ACCESS_NOTICE_TEXT, UNAVAILABLE_TEXT and the
  museum's MUSEUM_TEXT, PANEL_TEXT, ROOM_TEXT, PLAN_TEXT and SCREEN_TEXT moved into
  `src/features/learning/strings.ts`. The 3D-only tables live there too, so every learner-visible
  interface string of both conditions is in one module.
- **Compare layer order.** The 3D panel now sorts the Compare layer in the canonical tradition order,
  stable within a tradition, as 2D does; the `it.fails` in `layers.test.ts` is a normal test.
- **Focus.** `outline-none` is removed from Button, Input, Textarea, Select, Checkbox, Radio,
  Tabs, Dialog, Sheet and ScrollArea, so the global ring and the high-contrast double ring reach
  every area. The study-layout stopgap is deleted; the CMS guard is now redundant and harmless.
- **Pre-paint display classes.** DISPLAY_BOOT_SCRIPT is an inline script in the root `<head>`
  (a static string, safe under cacheComponents), so a high-contrast visitor never sees one light
  frame and a study page never one dark frame.
- **One skip link per view (P22).** The root "Skip to content" link hides whenever a StudyBar skip
  link is on the page (`:root:has([data-slot=study-skip-link])`), so learning routes have exactly
  one. The study shell keeps the root one (it has no StudyBar).
- **Study shell.** It no longer widens to 72rem while a React Flow canvas is present; the
  concept-map canvas breaks out of the 40rem column on its own, so the wordmark, eyebrow and footer
  stay put on every step.
- **Citation labels.** `sourceDisplayLabel` cuts long names only at word boundaries (the 2D and 3D
  "Stated by" lines), and a locator's abbreviation is bound to its number with no-break spaces
  ("PDF p. 4" never breaks inside).
- **Institution facts.** `src/config/institution.ts` holds the affiliation, ethics approval and
  contact address recorded with their provenance in `docs/research/study-decisions.md`; there is no
  paper yet, so the paper citation stays null. The home page strip and the public footer read it.
- **High contrast.** `--madder` and `--ochre` map to ink in both HC blocks (no second hue).
- **Smaller fixes.** The CMS Proof renders the sheet title as an h2 (`titleAs`), so the editor has
  one h1. The 2D practice receives the protocol's Search setting (`PracticeContext.features`). The
  admin lock and role-removal actions check the typed confirmation on the server against the
  account's email. Concept-map nodes are at least 56 px tall in flow units, so they are 44 px on
  screen at the 0.8 minimum fit zoom; React Flow's attribution link (rater and research views
  only) has a 44 px target. The learning-task prompts panel uses the 9.17 card styling.
- **Dashboard CSV for rows 3 and 4.** Gain by Tradition, Dwell Time per Layer and Per-Item
  Statistics now download from the server route like every other dashboard table
  (`dashboard_tradition_gain`, `dashboard_dwell`, `dashboard_items`; dictionary entries in
  `exports/dictionary.ts`, rows in `src/server/research/dashboard-extra-tables.ts`), with the `#`
  header naming the study, the server time and the metric versions, and with the download
  audited. They reuse the dashboard's own loaders and aggregations, so the CSV and the figure
  cannot disagree.

### Decisions Taken

- **Room plaques stay 1.4 x 0.3 m for now.** 11.6 asks for 1.6 x 0.5 m, but every doorway the
  plaques sit above is 1.5 m wide, so a 1.6 m plaque needs a placement change, and any change to
  in-scene lettering must be re-measured on a real GPU. All plaques are one size. The second pass
  measured them on the GTX 1650 (headless): 52 of 54 reach 4.5:1 at 2.5 m, but the Tradition
  Context doorway plaques of Ajrakh (4.22:1) and Machilipatnam Kalamkari (4.16:1) do not, while
  Sanganeri's does (4.53:1). One size is therefore not enough for equal legibility. The fix (plaque
  lettering optical size, light at those doorways) is open
  (`docs/architecture/immersive-rendering-results.md`, section 4).
- **Onboarding stays off in both conditions.** The 3D onboarding screen exists but is switched off
  (CONDITION_ONBOARDING), and the 2D condition has none, so both show the same number of screens
  (P23). Turning it on adds a screen before the learning clock in both conditions, which changes
  the study flow: that is the project lead's decision, not a design fix.
- **Dead aliases removed.** No file used the deprecated colour, font, shadow, size or variant
  names any more, so they are deleted from `globals.css` and the primitives, and
  `tests/unit/design/dead-aliases.test.ts` keeps them out. TypeScript now rejects the old Button,
  Badge, Tabs, Alert and Select names too.
- **Section 15 lint rules.** `eslint.config.mjs` now rejects madder and ochre utilities and
  variables outside the public files, raw Tailwind palette colours anywhere in `src/`, and
  transition, animate and duration utilities in study-mode code. They match class strings in
  literals and template parts, so prose in comments is unaffected.

### How the Parity Suite Measures (Choices Recorded in the Report)

- **Concept per tradition:** the first station of the tradition's 3D process room whose 2D page has
  a knowledge figure, so P14 compares a real figure. The same concept is open in both conditions.
- **Themes in study mode:** study routes are light only (DR-019). The dark and high-contrast dark
  runs set the stored preference a participant would set; the display sync then forces light, and
  each run records the effective theme it measured.
- **Once-per-tradition checks:** P19 (import graph), the static half of P20 (one string table) and
  P21 (the content parity engine's figure balance on the demo study's bundle) do not depend on a
  viewport, so they are measured once and recorded in the 1280 x 800 light run of each tradition.
- **P15:** 2D is the load CLS without recent input; 3D is every layout shift during the
  keyboard-triggered panel open (counting shifts with recent input, which CLS would exclude).
- **P16:** the study figures are graph-derived inline SVG diagrams (DR-018), which have no image
  decode step. The check records that, and the photograph path (image decode under a 4x CPU
  throttle) applies once photographs are in a study bundle.
- **P26:** 2D compares the study traditions' index cards, their comparison headings and the sheet
  titles; 3D compares the panel titles. Room plaques are one fixed size by construction
  (placement.ts) and are not measured in the browser.

### Second WP8 Pass: Focus, Shared Chrome Order and the Runs

This pass continued from the interrupted first one. Everything below was measured on this machine
against the development server on port 3300, one worker, one headless browser at a time.

**Approved dependency.** `@axe-core/playwright` 4.13.0 is pinned exactly in `devDependencies`. The
project lead approved the install in chat ("Yes, install it (Recommended)"). It is the only new
dependency of the redesign.

#### Focus Is Drawn Once, at the Source

- **The fix.** `outline-none` is gone from every primitive in `src/components/ui`, so the global
  `:focus-visible` rule (2 px indigo outline at 2 px, 4 px ground halo; high contrast: the black
  and white double ring) reaches every surface of both conditions, the consoles and the public
  pages.
- **Workarounds deleted.** `MUSEUM_FOCUS_RING` (hud, info panel, minimap, screens) and the CMS
  layout's `FOCUS_GUARD` did nothing once the primitives were fixed, so they are removed.
- **High contrast and programmatic focus.** The high-contrast ring outranked the rule that draws no
  ring on programmatic targets (`tabindex="-1"`), so the sheet h1 showed a ring on concept open in
  high contrast only. The rule is repeated after the high-contrast block. Equal in 2D and 3D before
  and after.
- **Date inputs.** Chromium gives a date input a fourth Tab stop, the picker button inside the
  input's own shadow tree. There the input matches `:focus-within` but not `:focus-visible`, so the
  audit's filter dates on `/admin/audit` showed no ring on that stop. `globals.css` now draws the
  same ring (and the high-contrast ring) for date and time inputs in that state.
- **Guard.** `tests/unit/design/focus-ring.test.ts` fails if a primitive carries `outline-none`,
  if any file removes the ring on `focus` or `focus-visible`, or if the global rules change.
- **Measured.** The acceptance focus test now presses Tab from the top of the document (the body
  is focused first; `blur()` alone left the starting point at the concept h1), at 1280 and 390 px,
  in light, dark, high-contrast light and high-contrast dark. It covers five public pages, the six
  2D study pages, the museum overlays, the open 3D panel and four console pages. It counts only the
  outline as a ring (the halo alone is the ground colour). Result: every stop shows a ring and none
  is under the sticky chrome. The Next.js development tools button is skipped: it exists only on
  the development server.

#### The Shared StudyBar Controls Sit Last (P22, P24)

- **What failed.** In the first full parity measurement P22 failed by 30 px at 1280: the shared
  group (Hint, Time left, Finish) sat between the location and the condition group. The 3D
  condition group (Plan, Mouse look, Controls help, Pause) is wider than the 2D one (Contents,
  Up to <parent>), so Finish and the timer moved. P24 failed for the same reason: from the sheet
  h1, Shift+Tab reached Finish in 4 presses in 2D and 6 in 3D.
- **Decision.** The shared controls come last, at the right edge, in the DOM and on screen. The
  condition group sits between the location and the shared controls. DESIGN.md 9.14 lists the
  shared controls before the condition group; section 12 (P22: boxes within 1 px; P24: equal tab
  stops) overrides it. Both conditions use the same component, so nothing else changes.
- **3D panel order.** The museum's panel now comes before the scene overlays (room contents, plan)
  in the DOM; it is drawn above them by z-index as before. From the panel h1, Shift+Tab reaches
  Finish in one press, as from the 2D sheet. The room list and the plan follow the panel in the Tab
  order.

#### Smaller Cross-Package Fixes

- `RelatedConcepts` links have a 44 px minimum width (a short title such as "Tools" was narrower).
- The 2 px reading-progress track (KnowledgeSheet) and the Progress primitive take `--sunk` in
  high contrast, where `--rule` equals `--ink` and filled and empty parts looked the same.
- Arabic-script runs in a verbatim quote ("Ajrak ( Sindhi : اجرڪ )") are set in
  `<span lang dir="rtl">` with the language the quote itself declares ("Sindhi" gives `sd`,
  "Persian" gives `fa`). The quote text is unchanged (`src/lib/text/script-runs.ts`; unit and
  render tests).
- Console action forms (research, assessment, CMS) keep a pending submit button focusable:
  `aria-disabled` instead of `disabled`, and the form refuses a second submission. A natively
  disabled focused button dropped focus to `<body>`.
- Study steps: the h1s now match the hub's step names ("Questions Before You Start", "Questions
  About the Learning Task", "Introduction to the Learning Task"), identically for both conditions.
- Research copy: counts read "1 session" or "4 sessions", never "session(s)"
  (`src/lib/text/plural.ts`).
- Dashboard live updates refresh 250 ms after a change instead of 750 ms; bursts still coalesce.
  Insert-to-screen median latency: 2194 ms before (fails the 2 s target), 1748 ms after.
- The e2e specs retire their throwaway staff accounts in `afterAll` (`retireE2eStaff` in
  `tests/e2e/study-fixtures.ts`: locked, roles removed, sessions ended). The 43 accounts that
  earlier runs had left active were retired the same way, and 131 role grants were removed.
  `/admin/roles` now counts 2 platform administrators.
- Two lint warnings in `tests/integration/research-dashboard.test.ts` are fixed (type-only imports).

#### GPU Runs Without a Window

`playwright.config.ts` takes `PW_GPU=1`. Headless Chromium then uses the full build (channel
"chromium") with ANGLE on Direct3D 11 and the discrete GPU. `PW_GPU=low` selects the integrated
GPU. The default projects are unchanged, so CI keeps SwiftShader. The WebGL renderer measured in
the parity run is `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F9D) Direct3D11 vs_5_0 ps_5_0,
D3D11)`, and the report records it. `immersive-rendering.spec.ts` runs this way with `IE_GPU=1`
(results in `docs/architecture/immersive-rendering-results.md`).

#### Decisions Recorded in This Pass

- **P19 and P21 once per tradition.** They are properties of the code and of the study bundle,
  not of a viewport, so they stay in the 1280 x 800 light run of each tradition. The stored report
  has 48 runs: 3 with 27 checks and 45 with 25. All 1206 checks pass. The Equivalence Monitor shows
  "27 of 27 checks pass". The value of a viewport-independent check is not copied into runs that
  did not measure it.
- **Per-condition onboarding text.** The content parity engine's check `d.protocol` fails a study
  whose condition configurations differ in any key. A per-condition `onboarding` text, which
  9.20 allows to differ by up to 10% of words, therefore blocks activation outright. No study
  uses one today. Whether `onboarding` should be exempt under the 10% rule is left to the project
  lead.
- **Local-term language.** 9.11 asks for each local term in `<span lang>`. The content format has
  no language field for local terms, and choosing one would be a claim about the craft.
  `KnowledgeSheet` takes `localTermsLang` and renders it when the content declares one.

#### Runs (Real Results, This Machine)

| Run | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 0 errors, 0 warnings |
| Vitest, full suite (dom, node, content; `--maxWorkers=2`), first run | 112 files, 1495 tests, all pass (the two new test files were written during the run and ran on their own: 4 + 7 pass) |
| Vitest, full suite, final run | 113 files, 1500 tests, all pass; no failure that needed a re-run alone |
| `parity.spec.ts`, GPU headless, final | 48 runs (3 traditions x 4 viewports x 4 themes), 1206 of 1206 checks pass, 28.8 min; report `analysis/parity/interface-parity.json`. An earlier full run after the StudyBar change gave the same 1206 of 1206. Before that change, quick runs (1280 x 800 light) failed P22 by 30 px and P24 with 4 vs 6 back-tabs. |
| `design-acceptance.spec.ts`, GPU headless, final | 9 of 10 pass: axe (4 themes), reflow, 44 px, text spacing, motion, fonts, images and CLS, focus, keyboard. The performance test fails: interaction latency on the development server at 4x CPU is 224 to 368 ms for the citation record and the lightbox, in both conditions (LCP passes) |
| alignment, telemetry-learning, study-journey, learning-2d-browse, smoke, public-pages, cms-guards | 37 of 37 pass |
| assessment-concept-map | failed on a stale heading selector ("Adjudicated reference (2 edges)"; the page sets the count in the description); selector updated, then pass |
| research-dashboard-live | failed at a 2194 ms median (target 2000); passed after the refresh delay change (1748 ms) |
| immersive-flow, GPU headless | 4 of 4 pass, three runs in a row |
| immersive-rendering, GPU headless (`IE_GPU=1`) | 6 of 10 pass; C1, C4, C11 (as written), C12 and the plaque contrast fail (see the results document) |

#### Section 15 Checklist

| Item | Status | Evidence or reason |
|---|---|---|
| contrast.test.ts, four blocks, minimum ratios | met | Vitest |
| No yellow outside the guidance cue; no `--faint` | met | contrast.test.ts |
| Lint: madder and ochre public-only; no raw palette colours | met | eslint.config.mjs; lint passes |
| Series-2d and series-3d luminance within 2% | met | contrast.test.ts |
| No horizontal scroll at 390 px and at 640 CSS px (200%) | met | design-acceptance, alignment, public-pages |
| Parallel-card actions within 1 px | met | alignment.spec.ts, public-pages |
| 44 x 44 targets everywhere (compact 36 px with 44 px hit area) | met | design-acceptance; P9 |
| Text spacing override: no clipping, both conditions | met | design-acceptance |
| P12 on all study routes | met | parity P12, design-acceptance |
| Reduced motion: no running animation; Figure 1 drawn | met | design-acceptance, public-pages |
| Fonts: 2 preloads, at most 176,000 bytes; at most 230,000 bytes; no third-party host | met | design-acceptance (/, a concept page, /learn/immersive) |
| No `font-variant-caps`, no `onum` | met | design-acceptance |
| Figure at most 70 KB; at most 250 KB per view; lightbox media only on open; CLS 0 | met | design-acceptance (study figures are inline SVG today) |
| LCP at most 2.5 s; interaction at most 200 ms (4x CPU) | not met | LCP passes. Interaction latency is 224 to 368 ms on the development server, in both conditions. Needs a production-build measurement, which the one-dev-server rule of this machine excludes. |
| 3D wall textures at most 512 px and 60 KB each, per room | not met as written | Plate lettering is drawn in the browser into one R8 atlas per room (2048 px pages, 600 texels per metre). Nothing is downloaded, so the 60 KB budget does not apply, and no plate is a separate texture. Per room: yes. |
| P1-P27 pass, report stored, Monitor shows it | met | 1206 of 1206; /research, /research/parity, /about and /about/colophon show the run |
| Study semantics unchanged (unit, integration, telemetry-learning) | met | Vitest; telemetry-learning.spec.ts |
| Content parity engine fails an unbalanced figure matrix | met | tests/unit/research/parity-figure-balance.test.ts |
| smoke.spec.ts unchanged and green | met | e2e |
| title-case test and the h1-h3 scan | met | title-case.test.ts, title-case-scan.test.ts |
| button.test.tsx | met | Vitest |
| Decision record: visual system, Inter, 768 px cap, panel width, canonical order | met | docs/decisions/0003-visual-system.md |
| axe: no WCAG 2.2 A or AA violation, four themes | met | design-acceptance |
| Focus indicator present and never obscured | met | design-acceptance (1280 and 390, four themes, Tab presses); focus-ring.test.ts |
| Keyboard: LayerTabs arrows, Escape closes the record and lightbox with focus return, skip link | met | design-acceptance |
| Local terms carry `lang`; the Sindhi/Persian quote is right-to-left with `lang` and `dir` | half met; needs content | The quote: met (script-runs). Local terms: the content format has no language field; curation must add one. |

#### Still Open

- A production-build measurement of interaction latency (citation record, lightbox) and of the
  rendering checks.
- Rendering on the high tier: C1 residual change at rest, C4 hitches, C12 wall-map SSIM, and the
  two Tradition Context plaques under 4.5:1 at 2.5 m. The low tier (`PW_GPU=low`) has not been
  run. The C5 baselines in `tests/e2e/immersive-baselines/high/` need a human review.
- Onboarding stays off in both conditions (lead decision). The engine's `d.protocol` blocks any
  per-condition `onboarding` text (see above).
- A language field for local terms (content curation).
- Photographs: the read model still passes `photos: []` (DR-020 ingestion comes after the rebuild).
- In-package minors from the final reviews that this pass did not take up:
  - CMS: the media candidates table at 1280 px, the relations filter at 390 px, the Figure Balance
    Total row, and the `loadLearnerFigure` caption rule.
  - Dashboard: Table 1 comparator lines and the Figure 5 precision.
  - Public: the tradition plates' reserved title line and the Plate 1 position at tablet widths.
  - Museum: the minimap size and the panel framing.
- `docs/research/design-process/decisions.md` has two DR-021, DR-022 and DR-023 entries (the
  adopted ones and the proposed next-phase ones). The project lead should renumber one set.
