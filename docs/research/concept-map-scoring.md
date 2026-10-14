# Concept-map scoring: definitions, matching rules and open questions

- **Status:** engineering draft for researcher review. None of the defaults below is a study decision.
- **Code:** `src/features/assessment/scoring/` (pure TypeScript). **Tests:** `tests/unit/assessment-scoring/`.
- **Pipeline version:** `cmap-scoring@1.0.0` (`SCORING_PIPELINE_VERSION`).
- **Related:** requirements digest §7 (AS-01..07), §12 open questions Q-R4, Q-R17 and Q-R18.

Reconstructing the relational concept map is the study's primary outcome. This document says
what each number means, how it is computed and where it stops being meaningful. **It does not
choose the primary metric.** The researchers choose that in the statistical analysis plan.

## 1. Reproducibility contract

- Every score is a `ScoreItem`: `metricName`, `metricVersion`, `value` (a number, or `null` when undefined), `parameters` and `details`.
  - `parameters` is the complete, resolved scoring configuration with keys sorted.
  - `details` is the itemised breakdown: which edges counted, the numerators and denominators, and the edit operations.
- `toDerivedScores()` maps items to `derived_scores` rows that satisfy `derivedScoreSchema`. `details` contains `parameters`, so every stored row can be explained and recomputed on its own.
- Each metric family has its own semantic version in `METRIC_VERSIONS`. Any change to a definition, a default or an edge case bumps that version, so old and new rows never get mixed up.
- The scorer is deterministic.
  - All edge sets are sorted by canonical key, and ties break on the edge key.
  - Changing the order of nodes, edges, reference edges, raters or equivalence rules leaves the output byte-identical. This is tested.
  - Re-scoring with the stored `parameters` reproduces the result exactly. This is also tested.
- An undefined ratio (0/0) is `null`. It is never 0 or 1. A `null` means "not measurable for this map" and must not be imputed silently.

## 2. Inputs

| Input | Source | Notes |
|---|---|---|
| Participant map | `conceptMapSubmissionSchema` (`nodes[]`, `edges[]`) | A node's `conceptId` may be null (a free node). An edge has `relationshipType` (nullable = untyped link) and `directed`. |
| Reference map | `reference_maps.nodes[].conceptId` + `referenceMapEdgeInputSchema[]` | The scorer also accepts an optional `status` per edge (`expected`/`optional`/`uncertain`/`disputed`). See §9. |
| Rater maps | `reference_map_raters.submission.edges` | Used for inter-rater agreement (§6) and the consensus map (§7). |
| Concept categories | `concepts.category_code`, keyed by concept id | Used only for the cross-category measures. |

## 3. Edge normalisation and matching

**Node identity is the concept id.** Labels and free text are never compared. Synonyms between
concepts do not arise: every concept in the protocol set has exactly one id.

Every edge (participant, reference or rater) is normalised in this order:

1. **Type equivalence (synonyms).** These rules are off by default.
   - A rule `{from, to, reverse}` rewrites `s -from-> t` to `s -to-> t`. With `reverse: true` it gives `t -to-> s` instead. Example: `A DEPENDS_ON B` ≈ `B ENABLES A`.
   - Rules apply to participant, reference and rater edges alike.
   - Rules may not chain: map every synonym directly to its canonical type. A `from` may have only one rule.
2. **Directedness.** An edge is undirected if its `directed` flag is false or its rewritten type is in `undirectedTypes`.
   - The default `undirectedTypes` are `SIMILAR_TO`, `CONTRASTS_WITH` and `ASSOCIATED_WITH`. These are the registry types with `directed = false`.
   - The endpoints of an undirected edge are sorted.
3. **Match keys.** Two edges match at a level exactly when their keys at that level are equal.

| Level | Key | Example | Ignores |
|---|---|---|---|
| `undirected_unlabelled` (uu) | sorted pair `A\|B` | `A→B` = `B→A` = `A–B` | direction, type |
| `directed_unlabelled` (du) | `A>B`, or `A~B` if undirected | `A→B` ≠ `B→A`; `A→B` ≠ `A–B` | type |
| `directed_labelled` (dl) | du key + `#TYPE` (`#` for an untyped link) | `A>B#CAUSES` ≠ `A>B#ENABLES` | nothing |

A directed and an undirected edge on the same pair match only at the uu level. The participant
did not commit to the expert's direction, or committed to one the expert did not.

**Scope.** The reference concept set is `reference.conceptIds` plus all reference edge endpoints. A participant edge is *out of scope* in three cases:

- An endpoint is a free node (`free_node`).
- An endpoint's concept is outside the set (`concept_not_in_reference`).
- Both of its nodes carry the same concept (`same_concept`).

`outOfScopeEdges` decides how out-of-scope edges count:

- `exclude` (the default): they are listed but not scored.
- `count_as_incorrect`: they count as incorrect. They add to the precision and Jaccard denominators, and each costs one edit deletion.

**Duplicates.** Participant edges with the same canonical labelled key are drawn once for
scoring. The edge with the smallest edge key is kept; the others are marked `duplicate` and not
counted.

## 4. Edge classes (per participant edge)

| Class | Meaning |
|---|---|
| `correct` | Matches an *expected* reference edge at dl. |
| `optional_match` | Matches only optional/uncertain reference edges at dl. |
| `wrong_type` | Best match is at du: the pair and direction are right, the type is wrong (an untyped link against a typed edge also lands here). |
| `wrong_direction` | Best match is at uu: the pair is right, but the direction or directedness is wrong. |
| `unsupported` | The pair does not appear in the reference at all. |
| `out_of_scope`, `duplicate` | See §3. |

**Validity** is judged at `validityLevel` (default dl).

- An edge is **valid** if it matches an expected reference edge at that level.
- It is also valid if it matches only optional edges and `optionalMatch = "valid"`.
- It is **incorrect** if it matches nothing at that level. Out-of-scope edges are incorrect only under `count_as_incorrect`.
- With `optionalMatch = "neutral"`, an optional-only match is neither valid nor incorrect.

**Reference edge status.**

- An explicit `status` wins.
- Otherwise `required: true` means expected.
- Otherwise `nonRequiredReferenceEdgeStatus` applies. Its default is `optional`, following the `reference_map_edges.required` comment: "Must appear for full credit (vs. acceptable-but-optional)".
- `uncertain` behaves like `optional`.
- `disputed` makes scoring throw (the default `disputedReferenceEdges = "error"`): adjudicate the edge first. The alternative setting `treat_as_optional` exists, but using it should be a recorded decision.
- Duplicate reference edges after normalisation are merged. The status keeps the most expected one and the weight keeps the maximum.

## 5. Metrics

All metrics are `1.0.0`. Notation used in the formulas:

- *P*: the set of distinct in-scope participant keys at the level.
- *E*: the expected reference keys.
- *O*: the optional/uncertain keys that are not in *E*.
- *X*: the number of out-of-scope edges counted incorrect (0 by default).

| Metric name | Definition | Measures | Limits |
|---|---|---|---|
| `cmap.valid_relationships` | Count of valid edges (§4). | AS-01 valid relations. | A raw count rewards drawing many edges. Read it next to the incorrect count and precision. |
| `cmap.incorrect_relationships` | Count of incorrect edges; `details.byClass` splits them into wrong_type, wrong_direction and unsupported. | AS-02 incorrect relations. | An "incorrect" edge may be a defensible relation that the experts left out. The reference is not ground truth. |
| `cmap.missing_expected_relationships` | Count of expected reference edges with no participant match at the validity level; `partialMatchLevel` shows near misses. | Omissions. | Depends on how complete the reference is. Optional and uncertain edges are never missing. |
| `cmap.direction_correctness` | Among in-scope edges whose pair matches a reference edge (uu): the share that also match at du. | Directional understanding. | `null` if no pair matches. The denominator differs between participants. |
| `cmap.type_correctness` | Among edges matching at du: the share that also match at dl. | Relationship-type understanding. | `null` if none matches at du. Sensitive to the synonym rules. |
| `cmap.precision.{uu,du,dl}` | `optionalMatch=valid`: \|P∩(E∪O)\| / (\|P\|+X). `neutral`: \|(P∖O)∩E\| / (\|P∖O\|+X). | Share of the participant's links that are supported. | `null` for an empty participant map. |
| `cmap.recall.{uu,du,dl}` | \|P∩E\| / \|E\| | Coverage of the expected structure (1 − missing rate). | `null` if the reference has no expected edges. |
| `cmap.f1.{uu,du,dl}` | 2pr/(p+r). It is 0 if p+r = 0, 0 if P is empty and E is not, and `null` if recall is undefined. | Balance of precision and recall. | Hides which of the two drives the value. |
| `cmap.jaccard.{uu,du,dl}` | \|P'∩E\| / (\|P'∪E\|+X), where P' = P∖O | Set overlap with the expected map; optional matches neither help nor hurt. | Like F1 it punishes extra and missing edges, but on a different scale. |
| `cmap.cross_category.total` | In-scope edges whose two concepts have different knowledge categories. | AS-05 cross-category linking (attempted). | `null` without category data. Uncategorised endpoints are listed and not counted. |
| `cmap.cross_category.valid` | The subset of those edges that are valid. | Correct cross-category linking. | As above. |
| `cmap.cross_category.valid_normalised` | valid ÷ expected cross-category reference edges | Coverage of the expert's cross-category links. | `null` if the reference has none. |
| `cmap.causal_chain_depth` | Number of edges on the longest simple directed path over **valid** participant edges whose canonical type is in `causalTypes` (§5.1). | AS-03 causal-chain depth. | Counts one chain only. A participant with two parallel chains of 2 scores 2. |
| `cmap.causal_chain_depth_normalised` | participant depth ÷ reference depth (expected edges) | Depth relative to what the content supports. | `null` if the reference has no causal chain. |
| `cmap.degree_profile_similarity` | Bray–Curtis similarity (§5.2) | Structural shape, e.g. hubs, sources and sinks. | Ignores *which* concepts are linked. A map can be wrong edge-by-edge yet similar in shape. |
| `cmap.edit_distance` | Minimum edit cost (§5.3) | Total transformation effort to reach the expected map. | Depends on the cost choices. |
| `cmap.edit_distance_normalised` | cost ÷ (\|P\|·delete + \|E\|·insert) ∈ [0,1] | A comparable form of the above. | `null` when both maps are empty. |

### 5.1 Causal-chain depth

- **Arcs.** Every valid participant edge whose type is in `causalTypes` becomes an arc in the direction of the causal flow.
  - The default `causalTypes` are `CAUSES`, `ENABLES` and `PRODUCES` (forward) and `AFFECTED_BY` (reverse, because `B AFFECTED_BY A` means A → B).
  - Undirected edges and parallel arcs are collapsed out.
- **Depth.** Depth is the edge count of the longest *simple* path, so no node is revisited.
  - The search is an exact depth-first enumeration, which terminates on cycles.
  - In general the problem is NP-hard. A step budget (`causalDepthSearchBudget`, default 10⁶) bounds the work. If the budget runs out the value is `null` with `budgetExceeded: true`, never a guess. Maps over a protocol-sized concept set (about 10–30 concepts) stay far below the budget.
- **Ties.** Equally long paths are broken by the lexicographically smallest node sequence. `details` holds the path.
- **Which edges count.** Only edges that are valid against the reference enter. A participant's invented causal chain does not count.

### 5.2 Degree-profile similarity

- For every concept *c* in the reference concept set, build the vector (out-degree, in-degree, undirected-degree) over distinct du keys.
  - The participant vector uses all in-scope edges, valid or not.
  - The reference vector uses expected edges only.
- Concatenate the vectors into p and r. Then S = 1 − Σ|pᵢ − rᵢ| / Σ(pᵢ + rᵢ).
- S is `null` when both maps have no edges. S = 1 means an identical degree sequence on every concept.

### 5.3 Edit distance (fixed node correspondence)

- Nodes are concept ids on both sides, so there are no node edits. This is not the general, NP-hard graph-edit distance: the node correspondence is given.
- **Edges compared.** Participant dl edges (minus edges that match only an optional reference edge) are transformed into the expected dl edges.
- **Costs.**
  - An exact match costs 0.
  - A substitution between two edges on the same concept pair costs `relabel·[type differs] + reverse·[direction/directedness differs]`, capped at `delete + insert`.
  - Each remaining participant edge costs `delete`, and each remaining reference edge costs `insert`.
- **Assignment.** The cheapest assignment within each concept pair is solved exactly with a bitmask dynamic program. `details.operations` lists every operation.
- **Defaults.** All four costs default to 1. With these defaults a reversed or retyped edge costs half as much as a missing edge plus a spurious one.

### 5.4 Pre/post change (`compareConceptMaps`, `cmap.change.*`)

This compares two submissions by concept id, with no reference involved.

- **Classes.** Each edge falls into one class.
  - `unchanged`: the same dl key appears in both submissions.
  - `retyped`: same pair and direction, different type.
  - `reoriented`: same pair, different direction or directedness.
  - `added`, `removed`: edges in only one submission.
- **Pairing.** Retyped and reoriented edges are paired in sorted key order.
- **Exclusions.** Free-node and same-concept edges are excluded and listed.
- **Score deltas.** With a reference, both maps are scored and each metric's `post − pre` is reported. The delta is `null` if either side is `null`.

## 6. Inter-rater agreement (`raterAgreement`, `cmap.rater_agreement`)

- **Items.** Items are candidate edges at a chosen level (default dl). Each rater includes an item or not.
- **Universe.**
  - `union` (the default): every edge proposed by at least one rater. There are no "both absent" items, so this choice is conservative.
  - `all_possible`: every possible edge over the concept set, plus the relationship types at dl. Trivial agreed absences inflate percent agreement here.
  - Always report which universe was used.
- **Percent agreement.** This is Fleiss' P̄, the mean share of agreeing rater pairs per item. For two raters it equals the plain proportion of agreement.
- **Fleiss' κ.** (P̄ − P̄e)/(1 − P̄e), with P̄e = Σⱼpⱼ². It is checked against Fleiss (1971) as reproduced on Wikipedia (κ ≈ 0.210).
- **Cohen's κ for every rater pair.** (pₒ − pₑ)/(1 − pₑ). It is checked against a 2×2 textbook case (κ = 0.4).
- **Undefined kappa.** κ is `null` when chance agreement is 1.
- **Per-edge agreement.** The share of raters including each edge is reported per edge. It maps to `reference_map_edges.agreement`.

## 7. Consensus reference map (`buildConsensus`, `cmap.consensus`)

For K raters and each candidate dl edge, let s be the number of raters including the edge and
x the number including it as expected.

| Condition | Decision |
|---|---|
| 2x > K | expected |
| 2s > K and 2x = K | **disputed** (an exact tie between expected and optional) |
| 2s > K | optional |
| 2s = K | **disputed** (an exact tie between including and excluding) |
| otherwise | excluded |

- **Resolving disputes.**
  - Disputed edges stay disputed until an `Adjudication` (`key`, `decision`, `adjudicatorId`, `note`) settles them.
  - An adjudication may also override a majority decision. Both the majority decision and the override are kept.
- **Completeness.** `isComplete` is true only when no dispute remains.
- **Scoring the result.** `referenceMap` can be scored directly. Disputed edges keep `status: "disputed"`, so scoring refuses an unadjudicated consensus.
- **Edge orientation.** Equivalence rules are applied before support is counted. Consensus edges are therefore expressed in canonical orientation.

## 8. Parameters the researchers must decide (open questions)

These extend Q-R4 and Q-R18. Until they are decided, the defaults are placeholders and every
stored score records the values that were actually used.

1. **Primary metric and match level.** Which of these is the primary outcome: F1/recall at dl, the valid count, edit distance, or something else? This belongs in the statistical analysis plan, not in code.
2. **Validity level.** Must an edge be correct in type (dl) to count as valid, or is pair-and-direction enough (du)? This depends on whether the editor offers typed links (Q-R4).
3. **Synonym rules.** Which type equivalences are pedagogically acceptable, for example ENABLES ≈ PRODUCES, or DEPENDS_ON ≈ reversed ENABLES or REQUIRES? None is enabled by default.
4. **Optional edges.** Should a match to an optional or uncertain edge count as valid, or be neutral?
5. **Meaning of `required = false`.** It currently means optional, following the schema comment. If most expert edges should be expected, either set `required` explicitly or change `nonRequiredReferenceEdgeStatus`.
6. **Out-of-scope edges.** Should edges to free nodes or concepts outside the reference set be excluded or counted as incorrect? This depends on whether the editor allows free nodes (`allowFreeNodes`).
7. **Causal types and orientation.** Should EXPLAINS, SCIENTIFICALLY_EXPLAINED_BY, REQUIRES or DEPENDS_ON count towards causal chains? Q-R17 asks which types the content actually uses.
8. **Edit costs.** Should a reversed or retyped edge cost less than a missing edge plus a spurious one?
9. **Edge weights.** `reference_map_edges.weight` is stored and reported but not yet used by any metric. Should the scores be weighted?
10. **Agreement universe and threshold.** Which universe (union or all-possible) and which level should agreement be reported at? What kappa is acceptable before adjudication? How many raters are needed? Is a strict majority the right consensus rule?
11. **Normalisation for pre/post comparisons.** Should change be analysed on raw deltas, on normalised deltas, or with the pre score as a covariate? This is a statistical-plan decision.

## 9. Known gaps against current contracts

- **Uncertain and disputed status.** `referenceMapEdgeInputSchema` has only `required`. The scorer accepts an extra optional `status` (`expected | optional | uncertain | disputed`), but it cannot yet be persisted. Proposal: add a `status` column/field, or store the status in `notes`/rater `submission` until then.
- **Uncategorised concepts.** Cross-category measures need concept → category data, which the caller must load. The pure scorer does not read the database.
- **Free-node edges.** Edges to free nodes, which have no concept id, are never matched. Matching labels to concepts is out of scope by design.
