# Data and telemetry layer (wave 0)

Status: current as of 2026-10-14. API reference for page authors of both learning conditions,
the study pages, the CMS and the research console. Companion to `knowledge-schema.md` (tables),
`foundation.md` (auth, participant sessions) and `spatial-compiler.md` (manifest format).

```
content/*.json ──content:import──▶ knowledge tables ──▶ REVIEW snapshot (content_snapshots, kind=review)
                                                              │
                     spatial:compile ◀────────────────────────┤
                     spatial_manifests (+ element index)      │
                                                              ▼
 request ─▶ getLearningContext(condition) ─▶ { snapshotId, manifestId, mode, ... }
              │                                  │
              │            read model (cached) ◀─┘   getManifest(manifestId) (cached)
              ▼
 <TelemetryProvider> ─▶ POST /api/telemetry/batch ─▶ telemetry_batches / _events / _quarantine / sequence_gaps
```

Rule for every page: **get the learning context first, then read knowledge only by
`ctx.snapshotId` and space only by `ctx.manifestId`.** Never query the live knowledge tables
from a learning page, never pick "the latest" snapshot yourself, never trust ids from the client.

## 1. Learning context — `src/server/learning/context.ts` (server-only)

```ts
getLearningContext(condition: "2d" | "immersive"): Promise<LearningContext>   // React-cached per request

interface LearningContext {
  mode: "study" | "demo" | "preview";
  condition: "2d" | "immersive";
  snapshotId: string;            // pass to every read-model call
  contentVersion: string;        // snapshot version label; telemetry `contentVersion`
  manifestId: string | null;     // pass to getManifest (immersive)
  sessionId: string | null;      // study_sessions.id (study mode only)
  participantPseudonym: string | null; // participant code, study mode only (never a name/email)
  studyId: string | null;
  nonExperimental: boolean;      // demo, preview, demo study or config.nonExperimental
  unverifiedContent: boolean;    // snapshot includes content no curator verified: SHOW A NOTICE
  traditionSlugs: string[];      // study config (demo/preview: the demo study's)
  features: { search: boolean }; // study config `searchEnabled` (demo/preview: true)
  settings: LearningSettings;    // minimap, webglFailurePolicy, guidance {policy, cueEnabled, stallSeconds, hintText}, learningPrompts
  scope: { minCompareTraditions: number }; // comparison-zone minTraditions of the pinned manifest's rule set
  telemetrySessionId: string;    // sessionId in study mode; stable uuid per demo cookie/staff user otherwise
  appBuild: string;              // APP_BUILD_VERSION
  learningTime: LearningTimeBudget; // §4e: same budget rule in both conditions, server timestamps
}
```

- Access comes from the existing guard `requireLearningAccess` (participant cookie decides;
  else staff preview; else public demo). A denied request **redirects** (throws) before rendering.
- `study`: the session's pinned snapshot and manifest (the database forces them to equal the
  study's). `demo` / `preview`: the newest review snapshot, the manifest and traditions of the
  demo study pinned to it (`demo-review-walkthrough`, created by `dev:bootstrap`), always
  `nonExperimental: true`, `unverifiedContent: true`.
- Throws `LearningContextUnavailableError` (`reason`: `no_review_snapshot` | `session_not_found` |
  `study_has_no_snapshot`) when there is nothing to show. Render a friendly message.
- Protocol settings are read ONLY here (`ctx.settings`, type in `src/features/learning/settings.ts`);
  no page reads `studies.config` itself. `ctx.scope.minCompareTraditions` comes from the rule set
  of the pinned manifest through the compiler's `comparisonMinTraditions` (default rule set
  without a manifest), so the 2D scope and the 3D museum use the same comparison rule.
- Familiarisation practice (D5): `getPracticeContext(condition)` (same guard and settings, never
  touches the learning clock, `telemetrySessionId` = `practiceTelemetrySessionId(sessionId)` in
  study mode) and `startPractice(condition)` in `src/server/learning/practice.ts`.
- It reads cookies and the DB: call it **inside `<Suspense>`** (cacheComponents is on) and pass
  the ids down as arguments. Pure core for tests: `resolveLearningContext(access, { data, appBuild })`
  and `pgLearningContextData(pool)` in `src/server/learning/context-data.ts`.

```tsx
// src/app/(learning)/learn/2d/traditions/[traditionKey]/page.tsx (sketch)
export default function Page({ params }: PageProps<"/learn/2d/traditions/[traditionKey]">) {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<Skeleton />}>
        <Tradition params={params} />
      </Suspense>
    </LearningPage>
  );
}
async function Tradition({ params }: { params: Promise<{ traditionKey: string }> }) {
  const ctx = await getLearningContext("2d");
  const { traditionKey } = await params;
  const tradition = await getTradition(ctx.snapshotId, traditionKey);
  if (!tradition) notFound();
  const chain = await getProcessChain(ctx.snapshotId, traditionKey);
  return <TraditionView tradition={tradition} chain={chain} unverified={ctx.unverifiedContent} />;
}
```

## 2. Knowledge read model — `src/server/knowledge/read-model.ts` (server-only)

All functions are `'use cache'`, tagged `knowledge` + `snapshot:<id>` (`snapshotCacheTag(id)`),
`cacheLife('max')`. Snapshots are immutable (published by trigger; review snapshots can never be
published and are never rewritten; draft `release` snapshots are refused), so entries never go
stale. Results are plain serialisable objects; types are exported from
`src/features/knowledge/read/view.ts` (client-safe, import types from there in client components).

| Function | Returns |
|---|---|
| `getSnapshotInfo(snapshotId)` | `{ versionLabel, isDemo, includesUnverified, generatedAt, counts }` |
| `listTraditions(snapshotId)` | `TraditionSummary[]` (by slug; `conceptCount`) |
| `getTradition(snapshotId, slug)` | `TraditionDetail \| null`: GI record with resolved sources, `overviewConcept`, `conceptsByType` |
| `getConcept(snapshotId, keyOrSlugOrId)` | `ConceptDetail \| null`: claims with `evidence: Citation[]`, distinct `sources`, `evidenceSummary` (by provenance kind and reliability), `compares`, `tradition` |
| `getProcessChain(snapshotId, traditionSlug)` | `ProcessChain \| null`: `steps` (process_stage concepts in PRECEDES ordinal order), `links`, `continuous`, `otherSequences` (e.g. historical chronologies), `unorderedLinks` (marked loops) |
| `getRelatedConcepts(snapshotId, keyOrSlugOrId)` | `RelatedConceptGroups \| null`: `[{ semantics, relations: RelatedConcept[] }]` in RELATIONSHIP_SEMANTICS order; each relation has `direction` (`outgoing`/`incoming`/`undirected`), a direction-aware `label`, `explanation`, `conditions`, `evidence` |
| `getComparisons(snapshotId, { traditionSlug? })` | `ComparisonView[]`: comparison concept, compared concepts, claims, SIMILAR_TO / CONTRASTS_WITH links |
| `getConceptRefs(snapshotId, ids)` | `ConceptRef[]` (search hits, manifest elements, telemetry) |
| `search(snapshotId, query, { enabled, limit?, traditionSlug? })` | `{ enabled: false }` or `{ enabled: true, query, hits: { concept, score }[] }` |

- **Search** runs over the snapshot payload, not the live tables: `websearch_to_tsquery('simple')`
  against the same weighted vector as `concepts.search` (title/local terms A, summary B, body C)
  plus trigram `similarity`/`word_similarity` on titles and local terms (partial and misspelt
  craft terms match). Score = 2 × ts_rank_cd + best trigram. Always pass
  `enabled: ctx.features.search`; a study switches it off with `config.searchEnabled = false`
  (the default for studies, Q-R6 open). Queries under 2 characters return no hits.
- Not-found keys return `null` (call `notFound()`); an unreadable snapshot throws
  `SnapshotNotReadableError`.
- Nothing in the read model writes or invents text: every string is from the snapshot. When
  `ctx.unverifiedContent` (or `info.includesUnverified`) is true, pages must label the content as
  not yet verified by a curator.
- DB-level helpers (not cached, usable from scripts/tests): `loadSnapshotPayload`,
  `searchSnapshotConcepts`, `latestReviewSnapshotId` in `src/server/knowledge/snapshot-store.ts`.

## 3. Spatial manifests

- `getManifest(manifestId): Promise<ManifestRecord | null>` — `src/server/spatial/manifests.ts`
  (server-only, `'use cache'`, tags `spatial` + `manifest:<id>`). `ManifestRecord` =
  `{ id, snapshotId, ruleSetId, compilerVersion, seed, traditions, status, isDemo, manifestHash,
  manifest: CompiledManifest, validation, createdAt }`. Element ids in the manifest are what
  telemetry `target` / `roomOrPageId` carry; `conceptId`s are snapshot concept ids (use
  `getConceptRefs(ctx.snapshotId, ids)`).
- `compileAndStoreManifest(client, { snapshotId, traditions, seed? })` and `loadManifest(q, id)` —
  `src/server/spatial/manifest-store.ts` (scripts/tests). Compiles from the stored snapshot
  payload with the frozen default rule set (`mapping_rule_sets` row `knowledge-to-space-default`
  v1), stores `manifest`, `manifest_hash` (sha256 of the jsonb, generated), `compiler_version`,
  `seed`, `traditions`, `validation` (compiler report + `compilerManifestHash`), status `valid` /
  `invalid`, and the traceability index (`spatial_elements`, `spatial_element_encodings`).
  Inputs `(snapshot, rule set, compiler version, seed, traditions)` are unique: recompiling
  returns the existing row.
- CLI: `npm run spatial:compile -- [--snapshot <id> | --label <label>] [--traditions a,b,c] [--seed s]`.
- A study pins one manifest (`studies.manifest_id`); sessions inherit it. A manifest from a review
  snapshot can never be published, and no non-demo study may reference it.
- Exhibit images come from `media_candidates` (licence **not yet reviewed**) and are frozen into
  the manifest with `width`/`height` so planes keep their aspect ratio. The knowledge snapshot
  carries no media yet (`assetIds` stay empty until licence-reviewed `assets` exist); the 2D
  condition must show the same images as the manifest if it shows any (parity).

## 4. Telemetry

### 4a. Ingestion — `POST /api/telemetry/batch`

Route `src/app/api/telemetry/batch/route.ts`; logic `src/server/telemetry/ingest.ts`
(`ingestTelemetryBatch(pool, principal, body, { receivedAt? })`). Body: `telemetryBatchSchema`
(header) with events validated one by one (`telemetryEventSchema`).

| Status | `error` | Meaning (client action) |
|---|---|---|
| 200 | — | `TelemetryIngestResponse` `{ batchId, status, replayed, accepted, duplicates, quarantined, persisted, nonExperimental, gaps, serverReceivedAt }` |
| 400 | `invalid_json`, `invalid_batch` | final: dead-letter |
| 401 | `unauthenticated` | no / invalid credential (final) |
| 403 | `session_mismatch` | batch for another session, foreign idempotency key, or cross-origin (final) |
| 410 | `session_closed` | withdrawn / excluded participant (final) |
| 413 | `payload_too_large` | > 512 KiB (`MAX_BATCH_BYTES`; client halves the batch) |
| 429 | `rate_limited` | `Retry-After` seconds (retry) |
| 500 | `server_error` | retry |

- Identity: participant cookie → `study_sessions` row (participant, study, condition come from the
  database; the client never sends them). A present-but-invalid participant cookie is refused, never
  downgraded. Staff → preview; demo cookie → demo. Demo/preview batches are validated and
  acknowledged with `persisted: false, nonExperimental: true`; nothing is stored (no study session).
  A participant's practice batch (sessionId = `practiceTelemetrySessionId(studySessionId)`) is
  acknowledged the same way with `practice: true`: practice never reaches the research tables.
- Idempotency: `telemetry_batches.idempotency_key` (replay → stored outcome, `replayed: true`) and
  `telemetry_events.event_id` (already stored → `duplicates`).
- Quarantine (`telemetry_quarantine.reason`): `schema: …`, `session_mismatch: …`,
  `seq_conflict: …` (+ `sequence_gaps` kind `duplicate`), `rejected: ie: …` (database rules: event
  scope vs condition, concept/tradition not in the session snapshot, events after the session
  ended, …).
- Gaps: seq starts at 0; missing ranges are upserted into `sequence_gaps` (kind `gap`, filled ones
  get `resolved_at`) and returned as `gaps`; arrivals below the previous maximum are recorded as
  `out_of_order`. `server_ts` = one receipt time per request. `study_sessions.last_activity_at` is
  bumped.
- Rate limit: in-process token bucket per principal (30 burst, 1 per 2 s). Single-instance only;
  move to Postgres before running several app instances.
- `nonExperimental` = demo study or `config.nonExperimental`; analytics must exclude those
  sessions (and `studies.is_demo`).

### 4b. Client — `src/features/telemetry/client` (client-safe)

```tsx
// server component, inside <Suspense>
const ctx = await getLearningContext("immersive");
return (
  <TelemetryProvider config={{ sessionId: ctx.telemetrySessionId, contentVersion: ctx.contentVersion, appBuild: ctx.appBuild, mode: ctx.mode }}>
    <Museum manifestId={ctx.manifestId} />
  </TelemetryProvider>
);

// client component
const t = useTelemetry();                    // throws outside a provider (by design)
t.roomEntered({ roomOrPageId: room.id, metadata: { via: "portal", fromId: prev.id } });
t.exhibitSelected({ conceptId, target: element.id });
t.relationshipFollowed({ metadata: { relationshipId, relationshipTypeCode: "PRECEDES", direction: "forward" } });
t.conceptEncountered({ conceptId, metadata: { mode: "opened" } });
t.track("knowledge_layer_selected", { metadata: { layer: "science" } }); // generic form
t.stats;                                     // { enqueued, acked, pending, dropped, invalid, retries, gaps, ... }
```

- One camelCase helper per event type in `EVENT_TYPE_REGISTRY` (33 codes: EVT-01..EVT-14, lifecycle,
  time accounting and citations), EXCEPT the six interval events, which only `tracker.timing`
  emits (§4c); the public `track` refuses them. Metadata keys are typed from
  `EVENT_METADATA_SCHEMAS`: a wrong key is a compile error. Never put free text in metadata.
- `createTelemetryTracker(options)` is the framework-free core (`TelemetryTrackerOptions`:
  `sessionId, contentVersion, appBuild, mode, endpoint?, storage?, fetchImpl?, sendBeacon?,
  batchSize? (50), flushIntervalMs? (5000), baseRetryDelayMs?, maxRetryDelayMs?, onDrop?, onError?`).
- Guarantees: per-session monotonic `seq` from 0, persisted with the outbox so it survives reloads;
  every event validated client-side (invalid → `stats.invalid` + `onDrop`, never silent); written to
  the outbox (IndexedDB `ie-telemetry`, fallback localStorage `ie-telemetry:v1:<sessionId>:*`, then
  memory) before upload; removed only after an acknowledged 200; retries with exponential backoff
  and jitter on network errors, 408, 429 (`Retry-After`) and 5xx, re-using the batch key
  `b:<sessionId>:<firstSeq>-<lastSeq>`; 413 halves the batch; other refusals move the events to a
  persisted dead-letter list counted in `stats.dropped` with the reason; `pagehide` /
  `visibilitychange: hidden` flush with `sendBeacon` (or `fetch` keepalive) while keeping events in
  the outbox until acknowledged. Within one page, consecutive trackers of a session (client-side
  navigation from a learning page to a study page unmounts one `<TelemetryProvider>` and mounts
  another) hand over the seq counter through a page-wide `SeqHandoff`: the new tracker waits for
  the previous one's outbox writes and continues after its highest seq. Without it, the new
  tracker could read the outbox before the last writes landed and reuse a seq, which the server
  quarantines as `seq_conflict` (found in the study-engine E2E run; regression test in
  `tests/unit/telemetry-client/tracker.test.ts`). Two tabs on one session share the outbox but
  number seqs independently: do not open a session in two tabs. Across full page loads, the
  seq high-water mark is also written synchronously to `localStorage`
  (`ie-telemetry:v1:<sessionId>:mark`) for every event. Events tracked while a page is being
  hidden are beaconed, but the page can unload before their asynchronous IndexedDB write
  commits. The dev database showed this as 5 `seq_conflict` rows after study-page loads, each
  a `task_started` colliding with the previous page's `timing_paused`. The next page now
  resumes after the mark. Regression test: "continues after a page unload whose last outbox
  write never committed". If `localStorage` is unavailable, a conflicting event is
  quarantined, not lost.
- Each batch carries `schemaVersion` (`TELEMETRY_SCHEMA_VERSION`), `appBuild`, `contentVersion`
  (must equal the session snapshot label, or the database rejects the events), `clientSentAt`.

### 4c. Time accounting: content exposure vs navigation (both conditions, same rules)

Lead requirement: equal exposure; navigation kept distinct and timed separately from outcomes
(design record: `docs/research/design-process/modules/condition-equivalence.md`).

| Interval | 2D | 3D | Hook |
|---|---|---|---|
| Content exposure | a concept page (or concept section) is in view | the concept's information panel is open | `useContentExposure(conceptId, layer, { active?, context? })` |
| Navigation | menus, catalogue, map, search results with no concept content open | walking between exhibits, no panel open | `useNavigationPhase(surface, { active?, context? })` |
| Pause | tab hidden, window blurred (automatic) or a non-content modal open | same | `usePauseWhile(open)` for settings/help/confirm dialogs |

```tsx
// 2D concept page (client component under <TelemetryProvider>)
useContentExposure(concept.id, "overview", { context: { roomOrPageId: `concept:${concept.key}` } });
// 2D catalogue / menu
useNavigationPhase("catalogue");
// 3D: walking unless a panel is open
useNavigationPhase("walk", { active: !panel });
useContentExposure(panel?.conceptId ?? null, panel?.layer ?? "overview", { active: !!panel, context: { roomOrPageId: room.id, target: panel?.elementId } });
// a help dialog that hides the content
usePauseWhile(helpOpen);
```

- `layer`: `overview | artisan | process | science | comparison | citation` (`EXPOSURE_LAYERS`;
  both conditions take it from `exposureLayerOf(concept.type)` in `src/features/learning/labels.ts`;
  `citation` is reserved, no client emits it); `surface`:
  `walk | menu | catalogue | map | search`.
- One interval at a time (`tracker.timing`, src/features/telemetry/client/timing.ts): opening one
  closes the other at the same `performance.now()` instant; idle = neither. Events:
  `exposure_started/ended` (conceptId, layer), `navigation_started/ended`; end events carry
  `startMonoMs`, `endMonoMs`, `activeMs` (pauses excluded), `pausedMs`, `reason`
  (`switched | closed | exit | budget_ended`). `timing_paused` (cause `hidden | blur | modal`) and
  `timing_resumed` (`pausedMs`, `causes`) log every pause. `tracker.timing.totals()` returns
  `elapsed = exposure + navigation + paused + idle` exactly (debug UI).
- Exit: events are queued synchronously; pagehide closes the open interval (`exit`), then the
  whole queue is beaconed (no loss). When the budget ends, call `tracker.timing.end("budget_ended")`.
- Opening a citation is part of the content: it does NOT pause or end exposure.

### 4d. Citations: `CitationDisclosure` (src/components/citations)

```tsx
{concept.claims.map((claim) => (
  <li key={claim.id}>
    {claim.text}
    {claim.evidence.map((c) => <CitationDisclosure key={c.id} citation={c} conceptId={concept.id} claimIndex={claim.position} />)}
  </li>
))}
```

Same component in the 2D page and the 3D information panel. Collapsed by default; native button
(Enter/Space; Escape closes and returns focus); inline, non-modal, never blocks content. Expanded:
title, author, publisher, year, locator, kind, reliability, accessed date, link, and the verbatim
quote (attached to a citation only when its claim cites exactly one source). The button shows
`Citation.label` ("Author Year", else "Publisher Year", else the shortened title, from
`sourceDisplayLabel` in the read view), never the uuid. Logs `citation_opened` /
`citation_closed` (conceptId, `metadata.sourceId`, `metadata.claimIndex`, `openMs`) when a
provider is present (`useOptionalTelemetry`).

### 4e. Learning time budget

- Config: `studies.config.exposure = { mode: "fixed_time" | "self_paced", minutes?, allowEarlyFinish = false }`
  (frozen when the study activates, so both conditions share it).
- Server: on the first learning-context resolution of a study session the database stamps
  `study_sessions.learning_started_at`; a trigger copies the budget from the config and sets
  `learning_ends_at`; all set once (migration 0009). `recordLearningEnded(pool, sessionId)`
  (context-data, for the study engine) sets `learning_ended_at` and throws
  `LearningFinishRefusedError` before the end unless `allowEarlyFinish`.
- Read: `getLearningTimeBudget(condition)` (server) or `ctx.learningTime`:
  `{ mode, budgetSeconds, allowEarlyFinish, startedAt, endsAt, endedAt, serverNow, persisted }`.
  Client: `useLearningTimeBudget(budget)` (src/features/learning) returns
  `{ remainingSeconds, elapsedSeconds, expired, canFinish }`, counting from the server clock plus
  monotonic time, so a wrong device clock cannot change it. Demo/preview: same rule from the demo
  study config, counted from `serverNow`, nothing stored.

### 4f. Derived timing metrics (v1)

`computeTimingMetrics(events)` and `TIMING_METRIC_DEFINITIONS` (src/features/telemetry/metrics.ts):
`time.exposure_total_ms`, `time.exposure_by_layer_ms`, `time.navigation_ms`,
`time.navigation_share`, `time.pause_ms`, `citation.openings`, version `1`, written to
`derived_metrics` only. `derived_scores` refuses such names (`derived_scores_no_timing_ck`) and
a test checks that no assessment/outcome table has a timing column. Unterminated intervals are
excluded and counted, never estimated.

### 4g. Change notifications and dashboard rollups (research dashboard)

- **Notify triggers (migration 0014).** Statement-level `AFTER` triggers with transition tables
  on `telemetry_events` (insert, delete), `telemetry_batches`, `telemetry_quarantine`,
  `sequence_gaps`, `study_sessions`, `participants`, `derived_metrics`, `concept_maps` (insert,
  update), `responses` and `derived_scores` (insert, delete) call `pg_notify('ie_dashboard',
  <study id>)` once per distinct study per statement (`ie_dashboard_notify`; session-keyed
  tables resolve the study through `study_sessions`). Notifications only, no writes; delivered
  at commit, never for a rolled-back transaction, deduplicated within a transaction. Cost on a
  100-event ingest INSERT: one trigger call (the bench reports its time).
- **Listener.** One `LISTEN ie_dashboard` connection per server process, outside the request
  pool (`src/server/research/dashboard-live.ts`), reconnecting with backoff; a reconnect wakes
  every subscribed study. It feeds the SSE stream `GET /api/research/dashboard/stream` and the
  request coalescer (`src/server/research/dashboard-cache.ts`).
- **Rollups (migration 0013).** `session_telemetry_rollups` holds, per session, the dashboard's
  telemetry figures (`computeSessionTelemetry`, built on `computeTimingMetrics`), with
  `metrics_version`, `session_status`, `last_seq` and `event_count`. A dashboard load reads
  max(seq) per session (backward probe on the `(session_id, seq)` unique index), count(*) for
  open sessions only, and recomputes just the sessions whose watermark changed
  (`src/server/research/dashboard-rollups.ts`). The table is a derived cache: it can be dropped
  and is rebuilt on the next load; a `metrics_version` change rebuilds every row.
- **Indexes added (0013).** `telemetry_events_study_server_ts_idx (study_id, server_ts)` (latest
  event of a study for the change fingerprint) and the partial
  `telemetry_batches_duplicates_idx (session_id) WHERE duplicate_count > 0`.

## 5. Content import and review snapshots

- `npm run content:import [-- --test] [-- --no-snapshot]` (`scripts/content/import.ts`; core
  `importContent(client, { model, issues, hasher })` in `src/server/content/import-content.ts`).
  Validates first (any error-level integrity issue aborts), upserts on natural keys with
  name-based ids for new rows (`contentIds()`, the snapshot builder's ids), copies review states
  exactly (`under_review`/`needs_evidence`; sources `under_review`), never sets
  verified/published, never touches curator-accepted rows (reported as `keptAccepted`), keeps
  `is_demo = false`, prunes claims/evidence/relationships/media that left the files, reports stale
  concepts/sources/traditions without deleting them, and writes `audit_log` (`content.import`).
- `storeReviewSnapshot(client, { hasher })` (`src/server/content/review-snapshot.ts`) adapts the
  database rows back into the knowledge-graph model, runs the same validators and
  `buildSnapshot({ kind: "review" })`, binds the bundle to the database ids and stores it as
  `content_snapshots` (`kind = 'review'`, `status = 'draft'`, `includes_unverified`, not demo)
  plus `snapshot_items`; label `review-<12 hex of the content hash>`; an existing label is reused.
  The bundle built from the database equals the one built from the files (same content hash):
  the import is lossless.
- Why a draft row and not a publishable one: migration 0006 adds `content_snapshots.kind` with
  `content_snapshots_review_ck` (a review snapshot is always draft and `includes_unverified`), and
  0007 makes `kind` immutable and stops any non-demo study from referencing a review snapshot or a
  manifest compiled from one. Activation already requires a published snapshot (0005), so a
  review snapshot is unusable by any active study, demo or not.

## 6. Dev bootstrap

`npm run dev:bootstrap`: `docker compose up -d --wait`, migrate main and test databases, seed
reference + demo data, import content, store the review snapshot, compile manifests for
ajrakh + sanganeri + machilipatnam-kalamkari (together, and each alone), and create/update the
draft demo study `demo-review-walkthrough` (is_demo, `config.nonExperimental`, search on) pinned
to the review snapshot and the combined manifest. Idempotent; prints row counts.

## 7. Known limits for later waves

- No real study can run yet: that needs curator-verified content in a published `release`
  snapshot (CMS wave). Until then study mode is exercised with test fixtures (see
  `tests/integration/telemetry-ingest.test.ts`).
- Media in the knowledge snapshot (`assetIds`) stays empty until licence-reviewed `assets` exist.
- The telemetry rate limiter and the read-model view memo are per process.
