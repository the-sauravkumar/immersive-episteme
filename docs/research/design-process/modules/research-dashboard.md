# Module record: research dashboard (score visibility, telemetry, data quality)

Request from the project lead's user: "make an admin dashboard as well for score visibility and
telemetry so that it can also be used as reference and data for research". Added requirements:
the dashboard shows real-time data, never stale data; exports and `analysis/episteme_stats`
mark the preregistered primary outcome.

Delivered as one page, `/research/dashboard` (route table label "Dashboard", first item of the
research sidebar, permission `analytics.view`), with a card on the `/admin` overview. Every
number below cites the test, command or file that produced it.

## Files

- Page: `src/app/(research)/research/dashboard/page.tsx`, with `_components/stats-table.tsx`
  and `_components/live-status.tsx` (client: live updates).
- CSV: `src/app/(research)/research/dashboard/csv/route.ts`. Live: SSE stream
  `src/app/api/research/dashboard/stream/route.ts`; fallback probe
  `src/app/api/research/dashboard/route.ts`.
- Read model: `src/server/research/dashboard.ts`; per-session rollups
  `src/server/research/dashboard-rollups.ts`; LISTEN notifier `src/server/research/dashboard-live.ts`;
  request coalescer `src/server/research/dashboard-cache.ts`; server wiring
  `src/server/research/dashboard-service.ts`.
- Migrations: `db/migrations/0013_dashboard_rollups.sql` (rollup table, two indexes; generated
  by drizzle-kit from `db/schema/telemetry.ts`), `db/migrations/0014_dashboard_notify.sql`
  (notify triggers; drizzle-kit custom migration).
- Benchmark: `scripts/research/bench-dashboard.ts` with the load fixture
  `scripts/research/dashboard-fixture.ts`.
- Shared definitions: `src/features/research/metric-definitions.ts` (metrics, versions,
  citations, preregistration roles); `src/features/research/descriptive.ts` (n, mean, SD,
  median, 95% t interval); `src/features/research/scale-scores.ts` (questionnaire scales).
- Data dictionary: `DASHBOARD_TABLES` and `exportMetricRoles` in
  `src/server/research/exports/dictionary.ts`; the export bundle gains `metricRoles`
  (`src/server/research/exports/build.ts`); the Exports page lists both.
- Analysis package: `analysis/episteme_stats/roles.py`; the `report` command states the metric's
  role and whether the request is the preregistered primary analysis.
- Route table: `src/lib/permissions/console-routes.ts`. Admin card:
  `src/app/(admin)/admin/page.tsx`.

## Decisions

### RD1. One read model over the existing services, no parallel data layer

- **Context.** The research console already had services for sessions and integrity
  (`listSessions`), study overview (`studyOverview`), time accounting (`computeTimingMetrics`),
  snapshot facts (`loadSnapshotFacts`) and the analysable-scope rule (`isAnalysable`).
- **Options.** (a) new SQL views for the dashboard; (b) read the stored `derived_metrics`;
  (c) a read model that calls the existing services and adds only the queries no service had.
- **Decision.** (c). `loadDashboard` calls the services above (later replaced for sessions and
  telemetry by indexed reads and rollups, RD9, because `listSessions` and `studyOverview` count
  every event of every session); the new queries are the
  study-scoped concept-map scores by phase, keyed-item totals, rubric ratings, questionnaire
  answers, sequence anomalies by kind and quarantine by reason. Time metrics are computed with
  the shared `computeTimingMetrics` on the raw events at read time instead of read from
  `derived_metrics`, because stored metrics are only as current as the last pipeline run
  ("Recompute metrics" on the Analytics page) and the dashboard must never be stale (RD6).
- **Found.** `outcomeDistributions` (`src/server/research/analytics.ts`) took the latest row per
  session, metric, version and assessment, so a session's pre and post map scores of the same
  assessment collapsed into one value. The dashboard keys concept-map scores by map and phase;
  the lead has since fixed `outcomeDistributions` to keep pre and post apart.

### RD2. Scope and labelling

- Every view is for one study (the shared study picker). Excluded and withdrawn sessions leave
  every distribution (`isAnalysable` with the study-level flag handled as a label): a demo or
  pilot study is shown, but labelled "Demo / pilot: not experimental data", because a pilot is
  exactly where these checks are needed. The data-quality section counts all sessions.
- Concept-map rows are keyed by participant: the condition-blind pre-test map can sit on an
  earlier session when a failed device check reassigned the participant
  (`reassignToConventional`, `src/server/study/engine.ts`); condition and scope come from the
  latest-period session with a condition.
- Change (post − pre) is computed only when both scores exist with the same reference map; a
  page note warns when scores from more than one reference map are present.
- Nothing is imputed: undefined values are counted as "missing" and shown.

### RD3. Descriptive statistics only

- n, mean, sample SD (n − 1), median (type 7), and the 95% interval of the mean with the
  Student t quantile computed from the regularised incomplete beta function (no table, no new
  dependency). Checked against standard table values t(0.975; 1, 4, 10, 30) = 12.706205,
  2.776445, 2.228139, 2.042272 (`tests/unit/research-dashboard/descriptive.test.ts`).
- The page states that inferential analysis (the ANCOVA of D2) runs in
  `analysis/episteme_stats`; the ANCOVA-ready table (participant code, condition, stratum, pre,
  post, change) is its input. Stratum = the latest allocation's stratum, else the enrolment
  stratum.

### RD4. Questionnaire scale scores are project definitions, scored only when complete

- **Context.** No service scored the D7 instruments; responses were stored raw.
- **Decision.** `scale-scores.ts` (version 1.0.0): cognitive-load subscale means (intrinsic,
  extraneous instructions / interaction / environment, item keys as seeded in
  `src/server/study/instruments.ts`), the conventional SUS rule (odd items response − 1, even
  items 5 − response, sum × 2.5), the physical-presence mean (3D condition only) and the SSQ,
  first administration pre and second post. A scale with any missing item is undefined (no
  proration).
- **SSQ.** First built as an unweighted symptom sum, because the Kennedy et al. (1993) weights
  were not quoted in `docs/research/study-decisions.md`. The lead replaced it with the Kennedy
  Table 4 total (`ssq.total`, `src/features/research/scale-scores.ts`). The SUS scoring rule is
  labelled a project definition (Brooke 1996 is not archived).

### RD5. One definitions table, citations verbatim from study-decisions.md

- `METRIC_DEFINITIONS` gives every metric on the page: name, version (from `METRIC_VERSIONS`,
  `TIMING_METRICS_VERSION`, `SCALE_SCORE_VERSION`, or the dashboard's own 1.0.0), role, what it
  measures, unit, computation, the computing file, and a citation or "Project definition".
- Citations are quoted only from `docs/research/study-decisions.md`, with its locators. The unit
  test checks every quote and locator against that file (whitespace-normalised) and that the
  two server-side versions it cannot import are pinned
  (`tests/unit/research-dashboard/metric-definitions.test.ts`). Where a citation supports only
  part of a definition (e.g. reliability, or an item of the scale), the panel says so.

### RD6. Real time, never stale

- **Decision.** No stale data: no `"use cache"`, `cacheLife`, `unstable_cache` or ISR; the page
  exports `instant = false` and reads the database per request; every route answers with
  `Cache-Control: no-store`. The in-process coalescer (RD9) is not a cache of stale data: it
  serves a stored result only under the same change key (fingerprint and notification version),
  i.e. only while nothing changed.
- **First version (replaced).** A 10 s poll of a fingerprint that counted rows
  (`count(*)` over the study's events and other tables). Measured on the 100-session fixture:
  37.7 ms per poll per open tab, seq scans on seven tables, and 10.7 s from insert to UI on
  the dev server (one e2e run). Replaced by push (RD9).
- **Now: push.** A commit that touches a table the dashboard reads sends `NOTIFY ie_dashboard`
  (migration 0014, one notification per statement and study); one LISTEN connection per server
  process fans it out to the open SSE streams (`/api/research/dashboard/stream`, permission
  `analytics.view` on connect, heartbeat 25 s, closed on client abort); the page schedules one
  `router.refresh()` 750 ms later (bursts coalesce, at most one refresh per 750 ms). On
  (re)connect the stream sends the current fingerprint and the page refreshes if it differs.
  The stream is closed while the tab is hidden. If the stream fails three times without an
  event, the page polls the fingerprint every 30 s instead.
- **What the viewer sees.** "Live · Updated HH:MM:SS UTC" (SERVER time of the latest render,
  stream event or poll), "Polling" in fallback, a Refresh button, and a "Stale" alert when no
  confirmation arrived for 30 s.
- **Evidence.** `tests/e2e/research-dashboard-live.spec.ts` against the dev server: three
  telemetry inserts after page load appeared without a reload after 1927, 1409 and 1374 ms
  (median 1409 ms; target < 2 s); page, probe, stream and CSV carry no-store; with the stream
  blocked the page switches to polling and does not show "Stale". Most of the latency is the
  750 ms coalescing delay plus the dev-mode render.

### RD7. Data for research: pseudonymised CSV per table, roles marked

- Each table has a CSV generated per request (`/research/dashboard/csv`), participant codes
  only (free-text exclusion details never appear; exclusions show their category), preceded by
  one `#` line naming the study, demo status, server time and `metric@version` list (read with
  `comment="#"`). Downloads are audited (`export.dashboard_csv`).
- **Permission.** CSV needs `analytics.view` and `exports.create` (or `exports.identified`):
  taking data out is an export. `platform_admin` holds `analytics.view` but not
  `exports.create` (`src/lib/permissions/matrix.ts`), so an administrator sees the dashboard
  but gets a 403 for CSV and a note on the page; permissions were not widened.
- The dashboard tables are added to the data dictionary (`DASHBOARD_TABLES`) and shown on the
  Exports page; "Full export" links there.
- **Preregistered roles.** `metricRole()` in the shared definitions table is the one source:
  primary = `cmap.recall.dl` (post, pre as covariate, ANCOVA, D2); secondary, in D2 order =
  `cmap.recall.du`, `cmap.precision.dl` with `cmap.edges_drawn`, `cmap.f1.dl`,
  `cmap.cross_category.valid_normalised`, `cmap.valid_relationships`; everything else
  exploratory. The export bundle carries `metricRoles` (primary outcome plus a role for every
  metric it contains), dashboard summary CSVs carry a `role` column, and
  `episteme_stats report` prints `metric_role` and `is_preregistered_primary_analysis`
  (`analysis/tests/test_roles.py`; a vitest check keeps its fallback list equal to the TS list).
- **Resolved.** D2 asks for "the incorrect count by class" next to precision; the lead has made
  `cmap.incorrect_relationships` a secondary outcome.

### RD8. Presentation

- Title Case headings via `titleCase`; equal-height stat tiles with fixed label / value / hint
  rows so values share a baseline (the shared `Stat` let values float when only some tiles had
  a hint, seen in the 390 px screenshots, so the page uses its own tile); CSV actions in each
  section header; numbers right-aligned with tabular figures; wide tables scroll inside their
  container, the page does not (document overflow 0 px at 390 and 1280, light and dark, for a
  study with telemetry, a study with scores and an empty study).
- Charts reuse `DistributionByCondition` (box plus every participant as a dot; condition and n
  in the axis labels) and `GroupedBars`; each has a data-table alternative and a legend, so
  colour is never the only cue.

### RD9. Fast and real-time retrieval (measured)

- **Context.** The user asked for retrieval that is "fast as well as realtime". The first design
  had three costs that grow with the study: every refresh read all telemetry events of the
  study and recomputed timing in Node; every open tab ran a counting fingerprint every 10 s; and
  up to 10 s of latency.
- **Method.** `scripts/research/bench-dashboard.ts` builds, in a throwaway database, 100
  sessions over two conditions with 3,000 realistic events each (300,000 events: navigation and
  exposure intervals, pauses, citations, relationships, guidance; batches of 100), pre/post maps
  with scores, knowledge totals and the D7 questionnaire answers; 5 sessions stay open. It
  measures loadDashboard (first run, then the median of 5 warm runs), a load after appending 50
  events to each of 3 open sessions, the fingerprint (median of 5), EXPLAIN (ANALYZE, BUFFERS)
  of the slowest statements, a 100-event ingest INSERT, and the push path. Same machine, same
  fixture size, before and after; `tests/integration/research-dashboard-perf.test.ts` runs a
  reduced version.
- **Changes.**
  1. *Push, not poll* (RD6): statement-level NOTIFY triggers, one LISTEN connection per
     process, SSE, 750 ms coalescing, fingerprint poll every 30 s only as a fallback.
  2. *Per-session rollups* (`session_telemetry_rollups`, migration 0013): the telemetry figures
     of each session, recomputed with the same `computeTimingMetrics` only when its watermark
     changed (max(seq) for every session through a backward probe of the `(session_id, seq)`
     unique index; count(*) for open sessions only, which also catches a late lower seq; status
     change). Ended sessions with unchanged max(seq) are never recomputed. Versioned with the
     timing-metrics version. The watermark is read before the events, so a concurrent ingest can
     only make a row look older (and be recomputed), never newer. Sessions are now read with
     one indexed query instead of `listSessions` / `studyOverview` (which counted every event).
  3. *Cheap fingerprint*: max(server_ts) of the study's events, a hash of the session and
     participant fields shown, and per-session maxima of the other tables through indexes led by
     session_id: O(log n) for events, O(sessions) probes for the rest.
  4. *Request coalescing*: single-flight plus a 16-entry LRU memo keyed by (study, fingerprint,
     notification version); no memo while the LISTEN connection is down; a result whose
     computation overlapped a notification is not memoised.
- **Measurements** (bench, 100 sessions × 3,000 events, 5 open; "before" = first design):

| Measure | Before | After |
|---|---|---|
| loadDashboard, warm (median of 5) | 1,718 ms (runs 935–1,797) | 50 ms (44–62) |
| Rows transferred per load | 297,609 | 8,056 |
| Load after 3 × 50 appended events | 942 ms, 297,752 rows | 66 ms, 16,886 rows (3 sessions recomputed) |
| First load ever (rollups empty, one-time) | 1,374 ms | 1,477 ms |
| Refresh with no change (memo hit) | n/a | 5.7 ms (fingerprint only) |
| 10 concurrent viewers after a change | 10 computations | 1 computation, 64 ms wall |
| Fingerprint per check | 37.7 ms, seq scans on 7 tables | 7.5 ms wall, 3.6 ms execution |
| Change detection per open tab | 1 fingerprint / 10 s | none (push); 1 / 30 s in fallback |
| NOTIFY delivery, commit → listener | n/a | 4.2 ms (median of 5) |
| Notify trigger cost, 100-event INSERT | n/a | 0.2 ms, 1 call (insert 11.7 ms vs 13.1 ms before) |
| Insert → UI on the dev server (e2e) | 10,674 ms (one run) | median 1,409 ms (1,374–1,927) |

- **Targets.** Refresh < 300 ms with a few active sessions: met (50 ms warm, 66 ms after
  appends). Insert-to-UI < 2 s: met in all three e2e measurements, but with little margin on
  the slowest (1,927 ms); the 750 ms coalescing delay and the development-mode render dominate.
  Not met and not targeted: the first load of a study after deployment (1.5 s) builds every
  rollup once.
- **Plans.** On the fixture the planner still seq-scans small tables (study_sessions: 100 rows;
  quarantine and gaps: a few rows) because that is cheaper; with `enable_seqscan = off` the
  fingerprint plan uses only index paths (study_sessions_study_idx, the participants
  (id, study) key, telemetry_batches_session_idx, telemetry_quarantine_session_idx,
  sequence_gaps_uq, derived_scores_uq, responses_attempt_uq, concept_maps_session_item_phase_uq)
  at the same 3.6 ms. max(server_ts) used the global `telemetry_events_server_ts_idx` because the
  fixture database holds one study; the new `(study_id, server_ts)` index serves it once the
  study is a fraction of the table. Neither path scans the study's events.
- **Trade-offs.** One more index on `telemetry_events` and one statement trigger per ingest
  statement (0.2 ms measured). One extra connection per server process for LISTEN, one open
  HTTP stream per visible dashboard tab. The rollup table is derived state that must be kept
  correct: it is versioned, rebuilt when its version changes, and a test checks that the rollup
  path equals a full recompute after appends, a late lower seq, a session ending and a version
  change. Known residual risk: an event written without the ingest path into an already ended
  session with a seq below its max(seq) is not picked up until the rollup version changes; the
  ingest refuses events after a session ends.

## Implications for the paper

- The dashboard is a monitoring and reference view, not an analysis: it reports descriptives by
  condition with the analysable-scope rule stated on the page; the confirmatory analysis is the
  preregistered ANCOVA in `analysis/episteme_stats`.
- Time on content, navigation and pause time are shown as covariates, separate from outcomes
  (DR-015); exposure coverage of the study snapshot is reported per condition (D5).
- Questionnaire scale scores are unvalidated project definitions after D7 rewording. The SSQ
  figure is the Kennedy et al. (1993) Total Score: unit weights on the Nausea, Oculomotor and
  Disorientation columns, TS = sum × 3.74 (Table 4, p. 212, PDF p. 11). Its weight matrix was
  read from the rendered page, because the OCR text of the table is scrambled. An earlier
  version of the dashboard used an unweighted sum.
