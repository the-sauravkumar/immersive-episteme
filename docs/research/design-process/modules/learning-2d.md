# Module record: conventional 2D learning pathway (condition A)

Concept-note pathway A ("menus, cards, headings and hyperlinks"; requirements digest §6),
master spec §7, the parity checklist (MP §11) and DR-015. Engineering reference:
`docs/architecture/data-and-telemetry-layer.md` §1–§4. Every number below cites the file
that defines it or the test that checks it.

## What was built

| Route (`src/app/(learning)/learn/2d/`) | Purpose |
|---|---|
| `page.tsx` | Catalogue: the study's traditions, the knowledge categories (with counts), the comparisons |
| `traditions/[traditionKey]/page.tsx` | Tradition page in the common epistemic template |
| `concepts/[conceptKey]/page.tsx` | Concept page: claims-only body, citations, typed related concepts, previous/next |
| `categories/page.tsx`, `categories/[category]/page.tsx` | Browse one knowledge category across the study's traditions |
| `comparisons/page.tsx` | Cross-tradition comparisons (`getComparisons`) |
| `search/page.tsx` | Search results; a 404 unless the study enables search |

Data access is only `getLearningContext("2d")` plus the snapshot read model by
`ctx.snapshotId` (`src/features/learning-2d/server/data.ts`). Shared with the 3D condition:
`src/components/learning/` (learning phase and timer, learning-task prompts, hybrid guidance,
practice session, unverified-content notice), `src/features/learning/` (interface labels and the
exposure-layer rule, protocol settings, the stall rule) and the existing `<CitationDisclosure>`.
The learning pages live in the route group `src/app/(learning)/learn/2d/(content)/`, whose
layout mounts the frame; the familiarisation practice `/learn/2d/practice` sits outside it.

## Decisions

| # | Decision | Context and options | Rationale and evidence |
|---|---|---|---|
| L1 | **Same concept scope as the 3D museum.** A learner can open a concept only if the spatial compiler would place it in the study's museum: concepts of the selected traditions, shared concepts reachable through shared concepts, and tradition-less comparisons comparing at least two selected traditions. Anything else is "not found", and links to it are not rendered. | Options: show the whole snapshot (rejected: the 2D condition would carry content the 3D condition does not have, a parity breach); filter by tradition only (rejected: drops cross-tradition comparisons the museum shows). | Mirrors `selectScope` in `src/features/spatial/compiler/graph.ts`. The comparison threshold is no longer a 2D constant: it is the `minTraditions` of the comparison-zone rule in the rule set of the study's pinned manifest, read by the learning context (`ctx.scope.minCompareTraditions`) with the compiler's own helper `comparisonMinTraditions` (`src/features/spatial/compiler/rules.ts`, which `compile.ts` now also calls), so a rule-set change moves both conditions together. Without a manifest the default rule set's value (2) applies. Tests: `tests/unit/learning-2d/scope-navigation.test.ts` ("2D scope", 4 tests, including "takes minTraditions from the rule set…", which sets it to 3 and to 1); `tests/integration/learning-settings-practice.test.ts` ("reads the comparison scope rule from the pinned manifest's rule set": 3 from a strict rule set, 2 from one without a comparison rule); e2e "traditions outside the session's study and unknown concepts are not served". |
| L2 | **Common epistemic template, fixed order, for every tradition.** Ten sections: context, materials and tools, process, artisan decisions, design principles, outcomes, scientific explanations, environmental conditions, comparisons, open questions. | Options: order by concept count, or per tradition (rejected: would present traditions differently). | `EPISTEMIC_SECTIONS` in `src/features/learning-2d/template.ts`; order asserted in `scope-navigation.test.ts`. |
| L3 | **Claim text appears only inside an exposure-tracked region.** Cards, lists, the process timeline and search results show titles and types, never summaries; a concept's claims appear on its own page (and the tradition's overview claims on the tradition page). | Options: cards with summaries (rejected: the summary is the first claim under the claims-only policy, so reading cards would be unmeasured content exposure). | Makes "exposure" in 2D the same unit as "information panel open" in 3D: the claims of one concept. `src/features/learning-2d/ui/concept-list.tsx`. |
| L4 | **Superseded by DR-050: one exposure rule for both conditions, on the shared KnowledgeSheet.** Exposure runs while the concept's sheet is open (2D: the concept page is shown; 3D: the panel is open) and no navigation overlay covers it (2D: Contents, Search; 3D: the full Plan), wherever the sheet is scrolled. Pages without a sheet (catalogue, tradition, categories, comparisons list, search) are navigation for as long as they are shown. | The earlier 2D-only rule ("at least half of the claims region, or half the viewport, in view") had no 3D counterpart: on opening a 2D concept the title, metadata, tabs and sequence list pushed the claims below the threshold, so 2D logged the first claims and the figure as navigation, and the reference list and Related Concepts as navigation in 2D but as exposure in 3D (final review equivalence-exposure-rule, measured on the :3300 build). | `src/features/telemetry/client/sheet-timing.ts` (`useSheetTiming`, `sheetTimingKind`), used by `src/features/learning-2d/ui/exposure.tsx` and `src/components/museum/museum-app.tsx`. `tests/unit/telemetry-client/sheet-timing.test.tsx`: the rule's truth table; both conditions use it and no in-view rule; the same scripted sequence (open, cover, uncover, close) gives the same exposure and navigation intervals in both. |
| L5 | **Exposure layer by concept type, one rule for both conditions.** Artisan decision → `artisan`; process stage → `process`; scientific mechanism and explanation → `science`; comparison → `comparison`; everything else → `overview`. Citation-open time stays inside the concept's exposure: `citation_opened/closed` events, no separate interval. | `EXPOSURE_LAYERS` now holds `comparison` and `citation` (`src/features/telemetry/contracts.ts`; no database check constrains the layer, so no migration). A separate citation interval was rejected: data-and-telemetry-layer §4c says "Opening a citation is part of the content: it does NOT pause or end exposure", and ending exposure on a citation would make a learner who checks sources look less exposed. `citation` is reserved in the enum and emitted by no client. | `exposureLayerOf`, moved with the type, category and relation labels to `src/features/learning/labels.ts`, which both conditions import (no re-export left in `template.ts`). Tests: "orders the template sections and maps types…" (comparison → `comparison`); `tests/unit/immersive/panel-content.test.ts` (the 3D panel reports the same rule). |
| L6 | **Progressive disclosure on the tradition page.** Template sections are collapsed headings (native buttons with `aria-expanded`); opening/closing logs `information_layer_opened/closed` with `layerId: section:<id>` and the open duration. Relationship explanations sit behind a native `<details>` ("About this link", `layerId: rel:<id>`). | Options: one long page with everything expanded (rejected: no measurable information layers, and a wall of lists); tabs (rejected: hide the template order). | `ui/disclosure-section.tsx`, `ui/relation-details.tsx`; test "toggles with the keyboard and logs information_layer_opened / closed". |
| L7 | **Typed, directed related links grouped by semantics class**, in `RELATIONSHIP_SEMANTICS` order (causal, sequential, associative, compositional, explanatory, comparative), each read from the current concept ("precedes", "follows"). Following one logs `relationship_followed` with id, type code, from/to and `forward`/`inverse`. | Options: a single "see also" list (rejected: master spec §6.4, a causal link must not look like an association); a graph explorer or map (rejected: a spatial representation in condition A). | `ui/related-concepts.tsx`; test "groups related concepts by semantics class and logs the followed relationship with its direction". |
| L8 | **Previous / next follow the process order.** Process stages page through `getProcessChain` steps and log the move as a `PRECEDES` traversal (the 2D analogue of walking a sequence path); other concepts page within their template section. | | `src/features/learning-2d/navigation.ts`; tests "follows the process order…" and "pages other concepts through their template section". |
| L9 | **Page-level telemetry** per page: `page_entered` (`via` start / link / navigation / search / resume, `fromId`), `page_exited` (`dwellMs`, `scrollDepth`), `concept_encountered` (`opened`), `item_revisited` (not on reload), `tradition_crossed`. The visit memory lives in sessionStorage per telemetry session. Exits are also logged on `pagehide` (capture phase, before the tracker's exit flush). React Strict Mode's simulated remount is absorbed so development data equal production data. | Spec names map to the registry: concept_viewed → `concept_encountered`, tradition_switched → `tradition_crossed`, search_performed → `query_submitted` (length and result count only, never the text). | `ui/page-telemetry.tsx`, `visit-store.ts`; tests in "page telemetry" and "visit memory". |
| L10 | **Shared learning phase.** One provider for both conditions: remaining time (fixed budget) from `useLearningTimeBudget`; "Finish learning" only when the budget allows it, with a confirming second press; at the end the open interval is closed with `budget_ended` (closed before the content unmounts, otherwise the unmount would close it as `closed`), the queue is flushed, content is replaced by a hand-back panel and a participant is sent to `/study/session`. Screen readers hear the 5- and 1-minute marks once. | First version closed the interval in an effect; the test showed the content's own unmount closed it first with reason `closed`. Fixed by closing during the render that ends the phase (idempotent per tracker). | `src/components/learning/learning-phase.tsx`; tests in "shared learning phase" (3). |
| L11 | **Search only when the study enables it.** No search box, no search route otherwise. | Q-R6 is open; studies default to `searchEnabled: false`. | `ui/site-header.tsx`, `search/page.tsx`; test "is absent when the study disables search and present when enabled". |
| L12 | **Fair comparator.** Design tokens and shadcn components, a reading column (`text-reading`, `max-w-prose`), breadcrumbs, focus moved to the new page's h1 after in-app navigation, sticky reading-progress bar, 44–48 px targets for primary controls, responsive layout down to 390 px, no decorative motion (the shell forces reduced motion). | Master spec §7.1: "Do not intentionally make it unattractive or difficult to navigate." | Screens checked at 1280 px and 390 px during development; e2e flow exercises the keyboard-operable disclosures and citations by role. |
| L13 | **Learning-task prompts shared and data-driven only.** The component renders the protocol's prompts verbatim, or nothing. In 2D they sit under the header, lined up with the page column, open by default and collapsible; the 3D museum shows the same component, open by default, under the room name. | `studies.config.learningPrompts` (`{id, text}[]`, unique ids, default empty) is read through the learning context (`ctx.settings.learningPrompts`); no prompt text is invented. | `src/components/learning/learning-task-prompts.tsx`, `ui/frame.tsx`; test "renders nothing without protocol prompts…"; integration "gives both conditions the same protocol settings through the learning context". |
| L14 | **Protocol settings only through the learning context.** `ctx.settings` carries `minimap`, `webglFailurePolicy`, `guidance` and `learningPrompts`; `ctx.features.search` carries `searchEnabled`. The 3D payload no longer reads `studies.config` by study id. | One read path per setting means the two conditions cannot drift apart through separate parsing. | `src/server/learning/context-data.ts`, `src/features/learning/settings.ts`; the integration test above asserts equal settings for a 2D and a 3D session. |
| L15 | **Hybrid guidance (D6), identical in both conditions, logged, not manipulated.** With `guidance.policy = "hybrid"` and `cueEnabled`: an always-available "Hint" button in the header next to the timer (the 3D top bar has the same component next to the same timer) opens a non-modal panel with the researchers' `guidance.hintText`; a stall cue ("You have not opened anything new for a while.", with "Show the hint") appears bottom right after `guidance.stallSeconds` (default 120, D6's provisional pilot value) of active time without a newly exposed concept. Otherwise nothing renders and nothing is logged. | The stall rule is one pure module (`src/features/learning/guidance.ts`) sampled once a second from the shared time accountant, so "a new concept was exposed" means the shared sheet-open rule (DR-050), as the timing metrics count it. Time while content is on screen and paused time do not count, so reading one long concept never triggers the cue; it shows once per stall. The hint text comes from the protocol (the engine refuses a hybrid protocol without `hintText`); the stall wording is interface text shared by both conditions. | `src/components/learning/guidance.tsx`. `tests/unit/learning/guidance.test.ts` (stall rule and settings, 7 tests) and `guidance-ui.test.tsx` (6 tests: the Hint sits in the timer's toolbar group in both the 2D header and the 3D top bar; identical `guidance_cue_used` metadata `{action: shown, followed or dismissed; cueId: guidance.hint or guidance.stall}` with no concept or page context; off unless hybrid with cueEnabled). |
| L16 | **Familiarisation practice (D5) at `/learn/2d/practice`.** The real chrome (header with the same menu labels, hint control and timer; breadcrumbs; disclosure sections; card links; previous and next links) around placeholder sections labelled "Practice", with interface text only. Menu, cards and pager are in-page anchors, so practice never opens a learning page. | The practice resolves its own context (`getPracticeContext`), which never stamps the learning clock, and starts the study engine's familiarisation step (`startFamiliarisation`, server time). The shared timer counts the practice minutes with practice wording; at the end the engine completes the step (`endFamiliarisation`) and the participant returns to `/study/session`. Telemetry goes to a separate practice telemetry session, which the ingestion endpoint acknowledges (`practice: true`) and never stores, so practice cannot enter learning metrics or the session's sequence numbering. | `src/features/learning-2d/ui/practice.tsx`, `src/components/learning/practice-session.tsx`, `src/server/learning/practice.ts`. Integration: the practice context leaves `learning_started_at` NULL; a practice batch is acknowledged and 0 rows are stored. E2E `study-journey.spec.ts`: the practice page follows allocation, onboarding is unreachable before the practice ends, and the learning clock is still unset after it. |

## Rejected or reverted

- A graph explorer, concept map or spatial overview in 2D: rejected (it would add a spatial
  representation to condition A, the manipulated variable).
- Summaries on cards: rejected (L3).
- A bare `<form method="get">` for search: replaced by `next/form`, so a search keeps the
  client session (tracker, visit memory) instead of reloading the page.
- An exit handler that read the current page from a ref: lost the exit of the previous concept
  when the router reused the page component for the next concept; replaced by a closure over
  each entry.

## What is measured (2D)

Navigation (`navigation_*`, surfaces `catalogue`, `menu`, `search`), exposure per concept and
layer (`exposure_*`), pauses (automatic), page entries/exits, concept encounters, revisits,
tradition crossings, typed relationship traversals, card/list selections
(`content_item_selected`, `elementKind`), disclosed layers, citation use, and queries when
enabled. The e2e test (`tests/e2e/learning-2d-browse.spec.ts`) checks that these batches reach
`POST /api/telemetry/batch` and are acknowledged with HTTP 200.

## Implications for the paper

- Condition A presents the same concepts as condition B for a study (L1), the same claims
  text and citations (DR-015), the same prompts and time budget (L10, L13); it differs in
  organisation: hierarchical pages, menus and hyperlinks instead of space.
- Report the operational definition of 2D exposure (L4) next to the 3D one (panel open), and
  that card and list surfaces carry no claim text (L3).
- Relationship traversal is comparable across conditions: a followed 2D link and a walked 3D
  path both log `relationship_followed` with the relationship's id and type.
- Guidance is the same intervention in both conditions (L15): the same hint text, control and
  place in the chrome, the same stall rule computed from the same exposure definition, the same
  logged events. It is a covariate (`guidance_cue_used` counts), not a manipulated factor.
- Familiarisation is condition-specific practice of the controls without craft content, timed by
  the server and kept out of learning time and telemetry metrics (L16).
- Limitations: exposure is "sheet open" in both conditions (DR-050), so a learner may look away
  while a sheet is open, in either condition alike; citation reading is not a separate
  exposure interval (L5); the practice has no citation to open, because no source may be shown
  that is not a real source.

## Open points for the researchers and the lead

- The stall threshold (`guidance.stallSeconds`, default 120) and the practice minutes
  (`familiarisation.minutes`, 5 for new studies) are pilot parameters.
- Research metrics: `nav.depth` names the layers "overview, artisan, process, science"
  (src/server/research/metrics/navigation.ts); comparison concepts now report `comparison`, so
  that definition should name the new layer.
- Media: the snapshot carries no licence-reviewed assets yet (`assetIds` empty) and the read
  model has no asset view, so no images are shown; parity with the manifest's exhibit images
  needs a media read path.
