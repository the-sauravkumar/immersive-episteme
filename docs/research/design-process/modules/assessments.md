# Module record: assessments (concept-map reconstruction, reference maps, scoring)

Covers the participant concept-map editor (the primary outcome, CN-15/CN-16), expert
reference-map authoring with inter-rater agreement and adjudication, assessment definitions
(pre/post tests, transfer tasks, the reconstruction concept set) and scoring. Engineering entry
points: `src/components/assessment/` (editor and console widgets), `src/server/assessment/`
(services, not `server-only`, so the integration tests call them directly; server actions in
`participant-actions.ts` and `research-actions.ts`), `src/app/(study)/study/(session)/reconstruction/`,
`src/app/(research)/research/assessments/`, `src/app/(research)/research/scoring/`. The scoring
mathematics is the existing library `src/features/assessment/scoring/` (definitions:
`docs/research/concept-map-scoring.md`); this module calls it and does not change it.

## Why it matters for the paper

Relational reconstruction is the primary outcome. What the paper can claim depends on three
properties implemented here:

1. **The instrument is the same in both conditions.** The editor component takes no learning
   condition as input. Both conditions get the same concept set, labels, vocabulary, layout,
   controls and wording. Test: "denies cross-participant access …" asserts that a 2D and a 3D
   session receive identical task input (`tests/integration/assessment-services.test.ts`).
2. **What is stored is the raw structure, not a score.** Positions, typed and directed edges and
   a timestamped edit log are stored. Every saved state is also kept as a revision. Scores are
   separate, versioned rows that can be recomputed from the raw map.
3. **The yardstick is an expert consensus with a recorded procedure.** It is not one person's
   map. Agreement statistics, tie handling, the adjudicator and the adjudication reasons are all
   stored.

## Decisions

| # | Context | Options considered | Decision | Rationale and evidence |
|---|---|---|---|---|
| A1 | The editor must be part of the assessment, not of the learning condition (lead brief). | (a) Embed the map in each condition's UI; (b) one study-flow page shared by both. | (b) `/study/reconstruction` renders `ConceptMapEditor`. Its props (`concepts`, `relationshipTypes`, `directedLinks`, `initial`, `onSave`) contain no condition. The study shell is the same for both conditions. | Same component and props, so the instrument cannot differ between arms. Integration test asserts equal `set`, `itemId`, `prompt` and `phase` for a 2D and a 3D participant. |
| A2 | Fixed concept set (CN-15/Concept §9). Q-R4 leaves open whether it is per tradition. | Free nodes; a fixed set from the item config. | Fixed set: `conceptKeys` of the item's `concept_map` config, in protocol order. Concepts cannot be added or deleted, only moved. `allowFreeNodes` is always written as false by the console. | Every node has a concept id, so scoring compares by identity, not by label (`concept-map-scoring.md` §3). Labels come from the session's pinned snapshot (`conceptSetFromSnapshot`), the same knowledge bundle both conditions read. Client-sent labels are discarded (test "refuses tampered payloads and overwrites client labels"). |
| A3 | Initial layout could bias which links are drawn. | Random shuffle per participant; fixed order. | Deterministic circle in protocol order (`initialNodes`, `map-state.ts`). The researcher controls the order through the item config. | The same starting picture for every participant in both arms, and reproducible. Unit test "lays out the fixed concept set deterministically". Whether to counterbalance the order is left to the researchers (see Open questions). |
| A4 | Typed, directed links "where justified" (MP:627). | Untyped links; free-text labels; types from the registry. | The protocol chooses the vocabulary: `relationshipTypes` in the item config, a subset of the `relationship_types` registry. Directedness follows the registry `directed` flag. An item can also make every link undirected (`directed: false`). An empty vocabulary gives untyped links. | Matches the scorer's three match levels (pair / direction / type). Symmetric types (registry `directed = false`, e.g. SIMILAR_TO) are stored undirected and cannot be reversed (unit test "revises, reverses and deletes edges …"). |
| A5 | Keyboard and screen-reader access (WCAG 2.2 AA). A canvas alone is mouse-only. | Rely on React Flow's keyboard support; add a full form path. | Both. A form with three labelled native selects (From / Relationship / To) creates any relationship. A list of every relationship, each with a labelled type select, Reverse and Delete, revises it. The canvas has `ariaLabel`s on concepts and links and arrow-key moves of a focused concept. A link drawn on the canvas pre-fills the form, so the type is always chosen in one accessible place. | The keyboard-only path is tested with labelled controls (`tests/unit/assessment-ui/concept-map-editor.test.tsx`). Tried and changed: visually hidden spans inside buttons gave Chromium accessible names with a stray space ("Reverse : …"; seen in the e2e error context). Replaced by `aria-label`s that start with the visible text (WCAG 2.5.3 label in name). |
| A6 | Raw data, never only a score. Revisions must survive autosave. | Store final edges only; store every save. | Stored on every save (`saveParticipantMap`): `concept_maps.nodes` (key, concept id, label, x, y), `raw = { format: "cmap-editor/1", edges, editLog }`, and normalised `concept_map_edges`. The database copies each state to the append-only `concept_map_revisions` (migration 0005 trigger) and freezes the row once `is_final`. | Test "saves and reloads the raw map with its edit log …": round trip is exact; revisions are 1, 2, 3; a save after submission is refused (`immutable`); no derived score exists for an unscored map. |
| A7 | Edit history as process data. | Diff successive saves; an explicit operation log. | Each edit appends `{ seq, at, op, via, … }` (`EDIT_OPS`: add, retype, reverse, delete, move, set_required). `at` is the client's wall clock. `via` is `canvas` or `form`. The server accepts a save only if the new log extends the stored one entry for entry (`extendsLog`, independent of jsonb key order). | Gives an ordered trace of how the map was built, which can be related to navigation (RQ3) without diffing. It also blocks a stale second tab from overwriting history (test: stale log → `conflict`). The timestamps are editing events, not exposure or navigation timings, so the lead rule "never log timings into outcome data" is kept. No duration is computed or stored. |
| A8 | Pre- and post-learning administrations (CN-15 "Before and after learning"; conflict C7 open). | Separate pages; one page that chooses the phase. | One page. The study engine's `requireReconstructionStep()` decides whether the page may render and in which phase (`pre_reconstruction` → pre, `reconstruction` → post). The assessment service independently derives the phase from the server learning clock (`learning_started_at` null → pre), and the page refuses to show the task if the two disagree. The task is the battery's `reconstruction` assessment for that `study_assessments.phase`. | The client never chooses a phase. A protocol that lists the same assessment in both phases gets the same concept set twice. The post map starts from the same blank layout, not from the pre map, so the post map is not anchored to the pre map. Test "switches to the post administration once learning has started". |
| A9 | Participants may only see and save their own map. | Pass map ids from the client; key everything on the verified session. | The server action reads the participant cookie, re-verifies it against `study_sessions` (`resolveParticipantSession`) and passes `{participantId, sessionId}` to the service. The service requires that the session row belongs to that participant. The client sends only the item it was shown, which must equal the server's current item. | Test "denies cross-participant access": a forged identity (participant B with session A) is refused (`forbidden`), and A's map is unchanged. Validation refuses payloads the editor cannot produce: unknown type, wrong direction flag, `required` set by a participant, or missing concepts (`validateMapPayload`). |
| A10 | Expert reference map by several raters (lead brief; Q-R4 "who builds it"). | One researcher-authored map; several raters plus consensus. | Each rater authors a map with the same editor in rater mode, which adds an "Expected" flag per relationship and saves only on submit. Rater maps are stored per rater in `reference_map_raters.submission` (edges + editor payload). Raters work blind: agreement and consensus are shown only after the viewer has submitted their own map. | Uses the library's `raterAgreement` (percent agreement = Fleiss' P̄, Fleiss' κ, pairwise Cohen's κ, `union` universe at the typed level by default) and `buildConsensus` (strict majority). Test: two raters with three candidate edges give percent agreement 2/3 (`assessment-services.test.ts`). |
| A11 | Ties need a human decision, and the decision must be recorded. | Break ties automatically; adjudicate. | Ties (library rule `strict_majority_ties_disputed`) are flagged "Tie: adjudicate". One adjudicator per reference-map version records each decision (expected / optional / exclude) with a reason, in the adjudicator row (`decision`, `adjudicatorId`, `note`, `decidedAt`). Majority decisions may also be overridden; the library keeps both. Finalising is refused while any tie is unresolved. It writes `reference_map_edges` (`required` = expected, `agreement` = share of raters, `notes = consensus:<decision>`) and `adjudicated_by/at`, and the notes record κ, level and universe. | Test "builds a consensus reference map, flags ties …": 1 tie found; finalise refused; adjudication recorded with the adjudicator; a second adjudicator is refused; 2 edges written with agreement 1. Adjudication, finalising, locking, publishing and scoring runs are written to `audit_log`. |
| A12 | Reference maps must be versioned and immutable once used. | Edit in place; versions. | A new version is a new `reference_maps` row (`version` = max + 1). It can only be created for a published assessment, so the concept set is fixed. After finalising, rater and adjudicator edits are refused. Locking makes it immutable in the database (`ie_lockable_guard`). Demo maps must stay `draft` (`reference_maps_demo_ck`), so a demo map is finalised with `adjudicated_at` set and status `draft`. Scoring accepts any map with `adjudicated_at`. | A score's reference cannot change underneath it. Each score row also carries a SHA-256 fingerprint of the reference edges (`details.reference.fingerprint`). Test: update of a locked reference map rejected by the database. |
| A13 | Definitions: items, scoring rules, versions; published versions immutable. | JSON editing; structured forms. | Structured forms per item kind (`item-form.tsx`, `forms.ts`). Answer keys are the scoring rule for keyed items (single choice = option id, multiple choice = exact set, numeric = value ± tolerance), validated against the item's options. Free-text items get versioned rubrics (levels: value, label, descriptor). Publishing locks the version (database trigger), and "new version" copies it as a draft with version + 1. The concept-map scoring configuration is stored resolved (`configParameters`) in `assessments.config.scoring`. | Test "keeps published definitions immutable and versions them": service refuses edits (`immutable`); direct SQL updates are refused by the triggers; v2 is a draft with the copied item. No item content is seeded. Demo assessments need a `demo` code and a "Demo:" title (service + `assessments_demo_ck`). An instrument can be flagged validated only with a name and a citation (MP:593). |
| A14 | Scoring must use the verified library and be reproducible. | Re-implement scores; call the library. | `scoreConceptMaps` runs `scoreConceptMap(raw map, adjudicated reference, frozen config, concept categories)` for every final map of the assessment, and `compareConceptMaps` for every session with both a pre and a post map. Rows come from `toDerivedScores` (metric name, metric version, value, parameters + itemised details, pipeline `cmap-scoring@1.0.0`), inserted append-only with `ON CONFLICT DO NOTHING`. Only maps from studies with the same demo flag as the reference are scored. | Known case (test): reference = {s1 PRECEDES s2, s2 PRECEDES s3}; post map = {s1 PRECEDES s2, s3 PRECEDES s2, s2 USES s3, s4 SIMILAR_TO s3} gives valid 1, incorrect 3, missing 1, cross-category total 3. Classes: correct / wrong_direction / wrong_type / unsupported. A re-run inserts 0 rows. The breakdown recomputes from the raw map with the stored parameters and reports any mismatch (0 in the test and in the e2e run). |
| A15 | Multiple raters for transfer and free-text answers, with agreement. `derived_scores` has no rater column, and its unique key allows one row per metric. | Shared schema change (rater column / table); encode the rater in the metric name. | Interim: one row per rater and answer with metric `rubric.rating.r<first 16 hex of sha256(rater id)>`. The rater id is in `details.raterId`. Ratings are immutable once saved, and the rubric must be published first. Raters see answers without participant code or condition, in a fixed hashed order, and only their own ratings. Agreement uses the library's `cohensKappa` (each rater pair, shared answers) and `fleissKappa` (answers rated by every rater; levels as categories). | Test: 2 raters × 2 answers give exact agreement 0.5. A duplicate rating is refused; an off-rubric value is refused. The proper schema change is listed under "Shared changes needed". Unweighted κ ignores the ordinal distance between levels (see Open questions). |
| A16 | Export-ready. | Only the console export page (another module); a route here. | `GET /research/scoring/export?dataset=scores\|map-edges&format=csv\|json[&assessment=]`. Requires `assessments.score` or `exports.create`. Long format, joinable on participant code, session id and condition. `study_is_demo` and `non_experimental` are flagged, not filtered. Cells starting with a formula character are prefixed with `'` (`toCsv`). | e2e: the CSV contains the participant code and `cmap.valid_relationships`. |
| A17 | Keyed items need the participant's answer, which the study engine writes into `responses.raw`. | Agree a format first; read tolerantly. | Tolerant reader (`extractAnswer`): a string or number, or an object with `optionId`, `optionIds`, `values` or `value`. Anything else gets value `null` with `reason: unrecognised_answer`, never a guess. Metric `item.key_match` 1.0.0. | Test: two keyed answers give values 1 and 0. |

## What is measured and how (for the methods section)

- **Instrument.** A fixed set of protocol concepts arranged on a 2D canvas. Participants create
  directed, typed relationships from the protocol's vocabulary, and may revise, reverse or delete
  them before submitting once. It is given before learning (`pre_reconstruction`, opt-in per
  protocol) and after learning (`reconstruction`). The same editor is used in both conditions.
- **Raw data.** Final graph, every intermediate saved state (`concept_map_revisions`), and an
  ordered edit log with client timestamps and the input path (canvas or form).
- **Reference.** The consensus of ≥ 2 independent expert raters. Ties are adjudicated by one
  named adjudicator with written reasons. Agreement is reported as Fleiss' κ, pairwise Cohen's κ
  and percent agreement at the typed-and-directed level, over the union of proposed edges.
- **Scores.** Valid and incorrect relationships, missing expected relationships, direction and
  type correctness, precision/recall/F1/Jaccard at three match levels, causal-chain depth,
  degree-profile (structural) similarity, edit distance, cross-category relationships (total,
  valid, normalised), and pre→post change (added, removed, retyped, reoriented, unchanged, plus
  per-metric deltas). Definitions: `docs/research/concept-map-scoring.md`. Each stored score has
  its metric version and full parameters.

## Rejected or reverted

- Letting the client choose the phase or the session (A8, A9).
- Starting the post map from the pre map (A8): it would anchor the second administration.
- Showing other raters' maps or the consensus before a rater has submitted (A10).
- Screen-reader text inside buttons via hidden spans, replaced by `aria-label` (A5).
- Reading the whole snapshot bundle through the full bundle schema to label concepts. The
  service reads only the concept and relationship-type slices of the immutable payload.

## Open questions for the researchers

1. Counterbalance or randomise the initial concept order per participant (A3)?
2. Is the pre-learning map part of the protocol (Q-R4 / C7)? The engine supports both.
3. Rubric agreement: is unweighted κ acceptable, or should weighted κ / ICC be reported for ordinal levels?
4. Minimum number of expert raters and the κ threshold before adjudication (`concept-map-scoring.md` §8 item 10).
5. Which scoring parameters (validity level, optional-edge handling, synonyms) apply? They are frozen with the assessment version.

## Shared changes needed (not made)

- `derived_scores`: a nullable `rater_id` column in the unique key, or a `rubric_ratings`
  table, replacing the metric-name encoding (A15).
- `reference_map_edges`: a `status` column (expected / optional / uncertain), replacing the
  `notes = consensus:<decision>` convention (`concept-map-scoring.md` §9).
- Console route table: the new detail routes reuse the parent's permission through
  `ConsolePage path="/research/assessments"` or `"/research/scoring"`. Adding them to
  `CONSOLE_ROUTES` would give exact `next=` redirects.

## Tests

- `tests/unit/assessment-ui/map-state.test.ts`: reducer, edit log and research forms.
- `tests/unit/assessment-ui/concept-map-editor.test.tsx`: keyboard path, revise/reverse/delete, submit payload, autosave and error state.
- `tests/integration/assessment-services.test.ts`: save/load round trip with the edit log, phases, cross-participant denial, tampering, immutability and versions, consensus with ties and adjudication, typed/directed scoring through the library, rubric agreement, keyed items.
- `tests/e2e/assessment-concept-map.spec.ts`: a participant builds a map (form and canvas) and submits it; a researcher adjudicates, finalises, scores, opens the breakdown and exports.
