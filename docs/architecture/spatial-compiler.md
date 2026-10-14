# Spatial compiler

The spatial compiler is the main research artefact. It turns a validated knowledge graph
into a navigable 3D museum layout, the *spatial manifest*. The transformation is
deterministic and inspectable, so a researcher can always explain why an element is
where it is.

```
manifest = compile(snapshot graph, selected traditions, mapping rule set, seed, COMPILER_VERSION)
```

| Item | Path |
|---|---|
| Code (pure TypeScript: no React, no DB, no Node APIs) | `src/features/spatial/compiler/` |
| Contracts it conforms to | `src/features/spatial/contracts.ts` |
| CLI (reads `content/`) | `scripts/spatial/compile-content.ts` |
| Tests | `tests/unit/spatial/` |

```bash
npx tsx scripts/spatial/compile-content.ts --traditions ajrakh,sanganeri,machilipatnam-kalamkari \
  [--seed default] [--out analysis/out/spatial/<name>] [--snapshot-version label]
```

The CLI writes `manifest.json` (canonical JSON; its sha256 is the manifest hash) and
`validation.json` under the gitignored `analysis/out/`. It prints a summary and exits
with code 1 when validation fails.

## 1. Inputs

| Input | Where it comes from |
|---|---|
| Published knowledge snapshot | `CompilerGraph`, a structural subset of `KnowledgeBundle`. A snapshot payload can be passed in directly. For content files, `contentToGraph()` derives RFC 9562 v8 name-based UUIDs from the concept keys. |
| Selected traditions | Slugs. Tradition names never appear in code. |
| Typed relationships, PRECEDES ordinals, categories | Taken from the graph. Relationship-type semantics and `allowsCycles` come from the snapshot's type registry. |
| Exhibit assets | `ExhibitAsset[]`, with optional `width`/`height` used for the aspect ratio. |
| Spatial config, accessibility and complexity limits | `ruleSet.config.layout`, validated by `layoutConfigSchema` (strict: unknown keys are rejected). |
| Mapping rules | `ruleSet.config.rules`, validated by `mappingRuleSetConfigSchema`. |
| Seed, compiler version | `seed`; `COMPILER_VERSION` and `LAYOUT_VERSION` in `version.ts`. |
| Assessment constructs (optional) | `assessmentConstructs[ruleId]`, or `emit.params.assessmentConstructIds`. |

## 2. Mapping rules (default rule set `knowledge-to-space-default` v1)

Rules are data. A rule's `emit.params.strategy` selects an algorithm from the registry in
`rules.ts`. Researchers can remap relationship types to strategies without touching
layout or rendering code.

| Rule id | Matches | Strategy → encoding | Spatial result | Learner interaction (telemetry event) |
|---|---|---|---|---|
| `containment.tradition-wing` | concept type `tradition`; `BELONGS_TO` | tradition-wing → containment | One wing (zone) per selected tradition. BELONGS_TO is encoded by the wing that contains the exhibit. | enter wing (`room_entered`) |
| `classification.zone` | all concept types | category-zone → containment | Categories are grouped into the template's zone groups, one room each per wing. Each category gets a contiguous, labelled wall run (`label` element). | enter room, read sign |
| `layout.circulation` | all concept types | circulation | Lobby, comparison hall, and a spanning tree of doorways. | walk through doorway |
| `sequence.path` | `PRECEDES` | sequence-path → sequence_path | Stations in consecutive wall slots, plus a routed `path` that visits them in ordinal order. A start cue on the first station. | follow path (`relationship_followed`) |
| `dependency.threshold` | `DEPENDS_ON`, `REQUIRES` | threshold → threshold | A threshold cue on the doorway between the two rooms if one exists. Otherwise the cue is at the dependent exhibit and names the prerequisite. | cross threshold |
| `association.adjacency` | `SIMILAR_TO`, `CONTRASTS_WITH`, `USES`, associative | adjacency → adjacency \| explicit_link | Exhibits are chained by association strength so related ones share neighbouring slots. Adjacency is recorded only when approach points are ≤ 3.5 m apart in one room; otherwise it becomes a link hotspot. | select neighbours (`exhibit_selected`) |
| `comparison.connected-zones` | cross-tradition `SIMILAR_TO`/`CONTRASTS_WITH`; `comparison` concepts | comparison-zone → juxtaposition | All wings open onto one comparison hall. Each comparison exhibit stands nearest the mean x of the wings it compares. A comparison `path` joins each pair of related wing entrances. | compare (`tradition_crossed`) |
| `causality.explanatory-progression` | semantics `causal` (CAUSES, ENABLES, PRODUCES, AFFECTED_BY) | explanation-trigger → explicit_link | A cue is triggered by **selecting** the cause. It reveals the explanation and a routed progression to the effect. **Never proximity alone.** `AFFECTED_BY` reverses cause and effect. | `guidance_cue_used` |
| `science.contextual-depth` | `SCIENTIFICALLY_EXPLAINED_BY` | progressive-layer → layer | A science layer on the explained exhibit (progressive disclosure), plus a back-link from the mechanism. | `knowledge_layer_selected` |
| `explanation.contextual-depth` | `PRACTITIONER_EXPLAINS`, `EXPLAINS` | progressive-layer → layer | A practitioner or explanation layer. | `knowledge_layer_selected` |
| `cross-category.connection` | every semantics (secondary rule) | architectural-connection → adjacency | Related category rooms are made grid neighbours and joined by a doorway that records the relationships it carries. | walk through doorway |

**Resolution.** For each relationship, the primary rule is the highest-priority matching
rule whose strategy applies. `comparison-zone` applies only across traditions. If two
equal-priority rules with different strategies both match, that is a *contradictory
mapping*: it is reported, and the lowest rule id wins. The secondary cross-category rule
is added whenever the two endpoints sit in different rooms joined by a doorway.

## 3. Algorithm

1. **Scope** (`graph.ts`). Scope covers:
   - all concepts of the selected traditions;
   - shared concepts linked to them, closed transitively over shared links;
   - comparison concepts whose `compares` list spans at least 2 selected traditions;
   - relationships whose two endpoints are both in scope.

   Everything else is listed in `traceability.concepts` with a reason.
2. **Process ordering.** PRECEDES links form chains (connected components). Ordinals must
   run 1..n, contiguously, with each link starting where the previous one ended.
   - An ordinal-less link from a later stage back to an earlier one is accepted as a
     declared **repeat loop** only when the type `allowsCycles` (as Dabu's
     `repeat-cycles → resist-printing` does). It is reported as a warning and recorded
     in the path's `loops`.
   - Any other cycle is an error.
   - Chains with no ordinals are ordered topologically, with a warning.
3. **Zone groups** (`layout.ts`). The group order is shared by all wings, so a category sits
   in the same relative place in every wing.
   - Slot 0 is the entrance group.
   - Each next grid slot (`wingColumns` = 2, row-major, row 0 touching the hall) takes the
     group with the most cross-category relationships to its already-placed grid
     neighbours. Ties go to the seeded PRNG.
4. **Doorways.** Each wing gets:
   - a breadth-first spanning tree over its grid from the entrance room;
   - a doorway between every other pair of grid neighbours that have cross-category links;
   - one entrance from the hall.

   The lobby and the shared commons open onto the hall.
5. **Sizing.** Each room is the smallest square of at least `minRoomSize` whose wall slots
   hold its exhibits.
   - A grid column takes its widest room and a row its deepest, so walls align.
   - Rooms, and the hall, grow until every exhibit has a slot.
6. **Walls** (`geometry.ts`, adapted from virtual-walkthrough `WallBox` and door split).
   - Room sides merge into wall lines, and every junction gets a t×t post.
   - Wall pieces are shortened by t/2 at each junction, and doorways cut openings.
   - The colliders are therefore axis-aligned and disjoint by construction.
7. **Exhibits.** Slots keep `cornerClearance` and `doorClearance` free and are ordered
   clockwise from the room's entrance doorway. The order within a room is:
   - category blocks first;
   - within a block, the tradition concept, then PRECEDES chains in order, then the
     remaining concepts chained greedily by association (ties go to the PRNG).
8. **Routing** (`navgrid.ts`). Routing uses a walkable grid at 0.25 m: room interiors minus
   colliders inflated by the visitor radius of 0.28 m. Search is 4-connected
   breadth-first with greedy line-of-sight smoothing. It is used for sequence paths,
   causal progressions and comparison routes.
9. **Emission** (`compile.ts`). Elements are sorted by id, and every element carries a
   `rationale` and a `trace`.
10. **Render model and streaming** (`render.ts`, `streaming.ts`). See sections 6 and 7.
11. **Validation** (`validate.ts`, `validate-render.ts`). See section 5.

## 4. Determinism and traceability

**Determinism guarantees**
- No clock, no `Math.random`, no `localeCompare` and no I/O in the compiler.
- Every collection is sorted by a stable key. The output does not depend on the order of
  input concepts, relationships, traditions or assets (tested).
- Coordinates are rounded to mm and `-0` is normalised.
- The manifest hash is the sha256 (pure-TS implementation) of the canonical JSON: sorted
  keys and no whitespace.
- The seed reaches only PRNG streams (mulberry32, adapted from virtual-walkthrough). Each
  stream is derived per decision area (`group-order`, `room-order:<room>`), so a changed
  tie in one room cannot cascade. Ties are always ordered canonically before a pick.
- A different seed changes only tie-broken placements. Element ids, kinds, rooms,
  concepts, rules, station order and sequence stops stay identical (tested).
- Element ids are stable. They are derived from concept keys, slugs, group ids and
  relationship-id hashes, never from the seed.

**Traceability.** Each element records:
- `ruleId`;
- `encodes[]` (relationship → rule → encoding);
- `trace` (`conceptIds`, `relationshipIds`, `ruleIds`, `interactions` given as telemetry
  event codes plus actions, `assessmentConstructIds`);
- a human-readable `rationale`.

The manifest carries a `traceability` index, which the validator checks in both
directions:
- `relationships[]`: status, primary rule, encodings → element ids → interaction →
  constructs, or the reason it is unencoded;
- `concepts[]`: placed or out of scope, with reasons.

## 5. Validation catalogue

Geometric checks rebuild everything from the manifest alone, so they verify the output
rather than trusting the layout engine. `revalidateManifest(input, manifest)` re-checks
an edited manifest, for example after manual overrides.

| Check id | Severity | Catches |
|---|---|---|
| `manifest.schema` | error | Manifest does not conform to `spatialManifestSchema` |
| `rules.supported` / `rules.references` | error / warn | Unknown strategy; encoding the strategy cannot emit; missing required strategy; rule matches a type the snapshot lacks |
| `rules.consistent` | error | Contradictory equal-priority mappings; a causal type mapped to a proximity-only strategy |
| `rules.categories` | warn | Concept category not in any zone group (the fallback group is used) |
| `content.versions` | error | Requested snapshot differs from graph; unregistered relationship types or categories |
| `concepts.missing` | error | Relationship or `compares` entry naming a missing concept; unknown or empty selected tradition |
| `concepts.placed` | error | An in-scope concept without exactly one exhibit |
| `refs.concept-exhibit` | error | Broken concept ↔ exhibit references, hotspot targets or traceability pointers |
| `relationships.encoded` | error | An in-scope relationship that no element encodes |
| `causality.explicit` | error | A causal link encoded only by proximity rules |
| `process.ordering` (+ `-warnings`) | error (warn) | PRECEDES cycles, ordinal gaps, duplicates, broken continuity, partial ordinals (warn: repeat loops, derived order, branches) |
| `paths.ordered` | error | Path stops out of chain order; waypoints not visiting stations in order |
| `paths.continuity` | error | Unroutable legs; any path or route segment crossing a collider |
| `geometry.colliders` | error | Degenerate or overlapping collision boxes |
| `accessibility.doorways` | error | Doorway narrower than `minDoorWidth` (default 0.9 m); opening not on both rooms' boundaries; opening blocked |
| `navigation.reachability` | error | Room, exhibit approach point or doorway unreachable over walkable cells from the spawn |
| `zones.accessible` | error | Room without a doorway or not connected to the entrance; zone without an accessible room |
| `navigation.complexity` | configurable (warn) | Rooms > 40, doorways per room > 6, door hops > 8, exhibits per room > 24, room side > 24 m, path leg > 60 m |
| `assets.refs` | warn | Concept asset ids with no asset; assets depicting unknown concepts |
| `traceability.complete` | error | Element without an in-set rule, rationale, trace, interaction or source; index/element disagreement |
| `layout.engine` | error | Construction problems (a doorway not fitting a wall piece, sizing not converging) |
| `render.coplanar-faces` | error | Parallel, same-facing faces within 1 mm whose projections overlap with positive area. Lists `offendingElementIds`. |
| `render.panel-offset` | error | Panel, sign or image less than 1.5 mm proud of the surface behind it, or missing `wallOffset`/`polygonOffset` |
| `render.textures` | error | Non-uniform `scale`; undeclared UV mapping; image plane w/h more than 0.5% off its declared aspect |
| `render.image-aspect-declared` | warn | Image plane whose asset has no pixel size |
| `render.axis-aligned` | error | Non-axis-aligned yaw; a plane not perpendicular to its facing axis; degenerate box; box without a typed part |
| `streaming.units` | error | Room without a streaming unit; element in no unit; asymmetric adjacency; doorway missing from a unit |
| `streaming.unit-budget` | warn | A streaming unit (room) holding more exhibits than `unitExhibitBudget` (default 24) |

The manifest **passes** when every error-severity check passes.

## 6. Rendering-quality model (immersive-rendering-quality.md §1, C6)

- **Boxes.** Walls, posts, plinths and door lintels are axis-aligned boxes in metres with a
  typed `part` and a `partKey` (part plus dimensions). Identical parts share geometry:
  all plinths have one key, and 19 keys cover the default build.
- **Planes.** Floors and ceilings span only the interior faces, so they never share a
  plane region with wall tops or bottoms. Door thresholds fill the floor under each
  opening.
- **Wall-mounted planes.** Each exhibit has a text panel 3 mm proud of its wall. An image
  plane, when there is an asset, sits a further 3 mm proud. Category signs are 3 mm proud.
  All record `wallOffset` and `polygonOffset {factor:-1, units:-1}` for the renderer.
- **Scale and UVs.** `scale` is always `[1,1,1]`. UVs are `"metre"` for architecture and
  `"image"` for image planes. Image planes are sized to the declared aspect within the
  maximum box.
- **Coplanarity rule.** Coplanarity compares same-facing faces. Opposite-facing coincident
  faces are the hidden contact faces of touching boxes, and with single-sided materials
  one of each pair is always culled.

## 7. Streaming units (§2a–2b)

- **Room units.** Every room element has a `streaming` block with:
  - `bounds` and `elementIds` (walls, exhibits, labels, cues, paths and both rooms'
    doorways);
  - `neighbours` (room plus the portal leading to it);
  - `counts` (exhibits, wall panels, image planes, signs, doorways, wall segments, posts,
    plinths, lintels);
  - `parts` (partKey → instance count).
- **Zone summaries.** Every zone has `streaming` with its `roomIds`, the union of their
  element ids, neighbouring zones with the connecting portals, and aggregated counts.
- **Renderer contract.** The renderer keeps the current and neighbouring rooms or zones
  resident and disposes of the rest.

## 8. Known limitations

- **Layout scheme.** There is one building scheme (grid wings around one hall).
  - Wings are ordered by slug, not by comparison strength.
  - The hall grows linearly with the number of traditions. All six traditions give
    45 rooms, which raises a complexity warning.
- **Room shape.** Rooms are squares and grid-aligned, so some are larger than they need to
  be. Exhibits stand only along walls; there are no island displays.
- **Adjacency.** Associations are optimised greedily within a room. A cross-category
  relationship between rooms that are not grid neighbours gets a link hotspot, not a
  doorway.
- **Routing.** Paths are grid routes smoothed by line of sight. They are not shortest in
  continuous space.
- **Manual overrides.** `manual_overrides` are not applied yet. Use `revalidateManifest`
  to check a manually edited manifest.
- **Image aspect ratios.** Content media candidates carry no pixel sizes, so their image
  planes have `aspectRatio: null` (a warning). The loader must still fit them until
  dimensions are recorded.
- **Renderer-side quality checks.** Lighting, luminance, frame time, LOD and texture
  budgets are renderer checks (C1–C5, C7–C11). The compiler only supplies the data they
  need.
- **Hash scope.** `configSha256` and `manifestHash` use this module's canonical JSON. They
  are not the database's `ie_jsonb_sha256`.
