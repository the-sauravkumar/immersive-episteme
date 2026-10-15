/**
 * Load fixture for the research dashboard (bench: scripts/research/bench-dashboard.ts; test:
 * tests/integration/research-dashboard-perf.test.ts). Builds, in a THROWAWAY database made by
 * tests/integration/schema-harness.ts, an active study with `sessions` sessions across the two
 * conditions, each with about `eventsPerSession` telemetry events in realistic interval sequences
 * (navigation → exposure with pauses, citations, relationships, guidance), in batches of 100,
 * plus pre/post concept maps with stored scores, knowledge-test totals and the D7 questionnaire
 * answers. `activeSessions` stay in progress; the rest are completed. Never run against the
 * development database: it writes synthetic participants.
 */
import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { seedInstrumentDefinitions } from "../../src/server/study/instruments";
import { addSnapshotItem, createPublishedManifest, createRealGraph, createSnapshot, createStudy, createUser, one, publishSnapshot } from "../../tests/integration/schema-harness";

export interface FixtureOptions {
  sessions: number;
  eventsPerSession: number;
  activeSessions: number;
  /** Concepts in the study snapshot (pairs from createRealGraph). */
  concepts?: number;
}

export interface Fixture {
  studyId: string;
  snapshotLabel: string;
  conditions: { c2d: string; c3d: string };
  concepts: string[];
  sourceId: string;
  /** Sessions still in progress (events can be appended). */
  active: { sessionId: string; participantId: string; conditionId: string; nextSeq: number; clientMs: number }[];
  events: number;
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenEvent {
  seq: number;
  type: string;
  conceptId: string | null;
  metadata: Record<string, unknown>;
  clientMs: number;
}

/**
 * A realistic event sequence from `startSeq`: navigation interval, then an exposure interval with
 * occasional pause/resume, citation, relationship, guidance and concept_encountered events.
 */
export function generateEvents(seed: number, count: number, concepts: readonly string[], sourceId: string, startSeq = 0, startMs = 0): GenEvent[] {
  const r = rng(seed);
  const out: GenEvent[] = [];
  let seq = startSeq;
  let mono = startMs;
  let k = 0;
  const push = (type: string, metadata: Record<string, unknown>, conceptId: string | null = null) => out.push({ seq: seq++, type, conceptId, metadata, clientMs: mono });
  while (out.length < count) {
    k++;
    const nav = `n${seed}-${startSeq}-${k}`;
    const navMs = Math.round(2000 + r() * 8000);
    push("navigation_started", { intervalId: nav, startMonoMs: mono });
    mono += navMs;
    push("navigation_ended", { intervalId: nav, startMonoMs: mono - navMs, endMonoMs: mono, activeMs: navMs, pausedMs: 0, reason: "content" });
    const concept = concepts[Math.floor(r() * concepts.length)]!;
    const exp = `e${seed}-${startSeq}-${k}`;
    const layer = ["overview", "artisan", "process", "science"][Math.floor(r() * 4)]!;
    const start = mono;
    push("exposure_started", { intervalId: exp, layer, startMonoMs: mono }, concept);
    push("concept_encountered", { mode: "opened" }, concept);
    let paused = 0;
    if (r() < 0.2) {
      push("timing_paused", { cause: "hidden", intervalKind: "exposure" });
      const p = Math.round(1000 + r() * 5000);
      mono += p;
      paused += p;
      push("timing_resumed", { pausedMs: p });
    }
    if (r() < 0.15) push("citation_opened", { sourceId, claimIndex: 0 }, concept);
    if (r() < 0.25) push("relationship_followed", { relationshipTypeCode: "PRECEDES" });
    if (r() < 0.05) push("guidance_cue_used", { action: r() < 0.5 ? "followed" : "dismissed" });
    const active = Math.round(5000 + r() * 40000);
    mono += active;
    push("exposure_ended", { intervalId: exp, layer, startMonoMs: start, endMonoMs: mono, activeMs: active, pausedMs: paused, reason: "switched" }, concept);
  }
  return out.slice(0, count);
}

const BASE_TS = Date.UTC(2026, 0, 1, 9, 0, 0);

/** Inserts events for one session in batches of 100 (one telemetry_batches row each). */
export async function insertEvents(pool: Pool, s: { studyId: string; participantId: string; sessionId: string; conditionId: string }, events: readonly GenEvent[], snapshotLabel: string): Promise<void> {
  for (let i = 0; i < events.length; i += 100) {
    const chunk = events.slice(i, i + 100);
    const b = await one<{ id: string }>(
      pool,
      `INSERT INTO telemetry_batches (idempotency_key, session_id, schema_version, app_build, event_count, accepted_count, status)
       VALUES ($1, $2, 1, 'bench', $3, $3, 'accepted') RETURNING id`,
      [`bench:${randomUUID()}`, s.sessionId, chunk.length],
    );
    await pool.query(
      `INSERT INTO telemetry_events (event_id, batch_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, client_mono_ms, seq, event_type_code, concept_id, metadata, app_build, content_version)
       SELECT gen_random_uuid(), $1, 1, $2, $3, $4, $5, to_timestamp(t / 1000.0), t, seq, type, concept, meta, 'bench', $6
         FROM unnest($7::int[], $8::text[], $9::uuid[], $10::jsonb[], $11::float8[]) AS u(seq, type, concept, meta, t)`,
      [
        b.id,
        s.studyId,
        s.participantId,
        s.sessionId,
        s.conditionId,
        snapshotLabel,
        chunk.map((e) => e.seq),
        chunk.map((e) => e.type),
        chunk.map((e) => e.conceptId),
        chunk.map((e) => JSON.stringify(e.metadata)),
        chunk.map((e) => BASE_TS + e.clientMs),
      ],
    );
  }
}

export async function buildDashboardFixture(pool: Pool, opts: FixtureOptions): Promise<Fixture> {
  const curator = await createUser(pool);
  const conceptIds: string[] = [];
  let sourceId = "";
  for (let i = 0; i < Math.max(1, Math.ceil((opts.concepts ?? 40) / 2)); i++) {
    const g = await createRealGraph(pool, { prefix: `bench${i}`, acceptBy: curator });
    conceptIds.push(...g.conceptIds);
    sourceId ||= g.sourceId;
  }
  const snapshotLabel = `bench-${randomUUID().slice(0, 8)}`;
  const snap = await createSnapshot(pool, { label: snapshotLabel, createdBy: curator });
  for (const c of conceptIds) await addSnapshotItem(pool, snap, "concept", c);
  await publishSnapshot(pool, snap, curator);
  const manifestId = await createPublishedManifest(pool, snap, { by: curator });
  const st = await createStudy(pool, { slug: `bench-${randomUUID().slice(0, 6)}`, snapshotId: snap, manifestId });
  await pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [st.studyId]);
  const { c2d, c3d } = st.conditionIds;

  // Assessments: reconstruction map, pre/post knowledge tests, D7 instruments (latest versions).
  const map = await one<{ id: string }>(pool, "INSERT INTO assessments (code, version, kind, title) VALUES ($1, 1, 'reconstruction', 'Map') RETURNING id", [`${snapshotLabel}-map`]);
  const item = await one<{ id: string }>(
    pool,
    "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, 'map', 0, 'concept_map', 'Connect', $2) RETURNING id",
    [map.id, JSON.stringify({ kind: "concept_map", conceptKeys: [], allowFreeNodes: false, relationshipTypes: [], directed: true })],
  );
  const pre = await one<{ id: string }>(pool, "INSERT INTO assessments (code, version, kind, title) VALUES ($1, 1, 'pretest', 'Pre') RETURNING id", [`${snapshotLabel}-pre`]);
  const post = await one<{ id: string }>(pool, "INSERT INTO assessments (code, version, kind, title) VALUES ($1, 1, 'posttest', 'Post') RETURNING id", [`${snapshotLabel}-post`]);
  await seedInstrumentDefinitions(pool);
  const instruments = (
    await pool.query<{ code: string; id: string; keys: string[]; ids: string[] }>(
      `SELECT DISTINCT ON (a.code) a.code, a.id, array_agg(i.item_key ORDER BY i.position) AS keys, array_agg(i.id ORDER BY i.position) AS ids
         FROM assessments a JOIN assessment_items i ON i.assessment_id = a.id
        WHERE a.kind = 'questionnaire' AND a.code IN ('cognitive-load', 'sus', 'ssq', 'mps-physical-presence')
        GROUP BY a.code, a.id, a.version ORDER BY a.code, a.version DESC`,
    )
  ).rows;

  const r = rng(42);
  const active: Fixture["active"] = [];
  let events = 0;
  for (let i = 0; i < opts.sessions; i++) {
    const conditionId = i % 2 === 0 ? c2d : c3d;
    const code = `B${String(i).padStart(4, "0")}`;
    const p = await one<{ id: string }>(pool, "INSERT INTO participants (study_id, code, stratum) VALUES ($1, $2, $3) RETURNING id", [st.studyId, code, i % 4 < 2 ? "low" : "high"]);
    await pool.query("INSERT INTO consent_records (participant_id, consent_version, consent_text_sha256, decision) VALUES ($1, 'c1', $2, 'granted')", [p.id, "a".repeat(64)]);
    const a = await one<{ id: string }>(
      pool,
      "INSERT INTO allocations (study_id, participant_id, condition_id, algorithm, seed, sequence_index, study_protocol_version) VALUES ($1, $2, $3, 'block', 'bench', $4, 'p1') RETURNING id",
      [st.studyId, p.id, conditionId, i],
    );
    const s = await one<{ id: string }>(
      pool,
      `INSERT INTO study_sessions (study_id, participant_id, condition_id, allocation_id, app_build, status, started_at)
       VALUES ($1, $2, $3, $4, 'bench', 'in_progress', to_timestamp($5 / 1000.0)) RETURNING id`,
      [st.studyId, p.id, conditionId, a.id, BASE_TS - 60_000],
    );
    const ref = { studyId: st.studyId, participantId: p.id, sessionId: s.id, conditionId };
    const ev = generateEvents(i + 1, opts.eventsPerSession, conceptIds, sourceId);
    await insertEvents(pool, ref, ev, snapshotLabel);
    events += ev.length;

    // Concept maps with stored scores.
    for (const phase of ["pre", "post"] as const) {
      const m = await one<{ id: string }>(
        pool,
        "INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, started_at) VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id",
        [s.id, p.id, map.id, item.id, phase, JSON.stringify([{ key: "n1", conceptId: conceptIds[0], label: "A", x: 0, y: 0 }, { key: "n2", conceptId: conceptIds[1], label: "B", x: 1, y: 0 }])],
      );
      if (phase === "post") {
        await pool.query(
          "INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key, source_concept_id, target_concept_id, relationship_type_code, directed) VALUES ($1, 'e1', 'n1', 'n2', $2, $3, 'PRECEDES', true)",
          [m.id, conceptIds[0], conceptIds[1]],
        );
      }
      await pool.query("UPDATE concept_maps SET is_final = true, submitted_at = now(), revision = 2 WHERE id = $1", [m.id]);
      const base = phase === "pre" ? 0.2 : 0.5;
      const metrics = ["cmap.recall.dl", "cmap.recall.du", "cmap.precision.dl", "cmap.incorrect_relationships", "cmap.f1.dl", "cmap.cross_category.valid_normalised", "cmap.valid_relationships", "cmap.jaccard.dl"];
      await pool.query(
        `INSERT INTO derived_scores (session_id, participant_id, assessment_id, concept_map_id, metric_name, metric_version, value, pipeline_version)
         SELECT $1, $2, $3, $4, name, '1.0.0', v, 'bench' FROM unnest($5::text[], $6::float8[]) AS u(name, v)`,
        [s.id, p.id, map.id, m.id, metrics, metrics.map(() => Math.round((base + r() * 0.3) * 1000) / 1000)],
      );
    }
    for (const [aid, v] of [[pre.id, Math.floor(r() * 10)], [post.id, Math.floor(r() * 10)]] as const) {
      await pool.query(
        "INSERT INTO derived_scores (session_id, participant_id, assessment_id, metric_name, metric_version, value, pipeline_version) VALUES ($1, $2, $3, 'assessment.key_match_total', '1.0.0', $4, 'bench')",
        [s.id, p.id, aid, v],
      );
    }
    // Questionnaire answers (presence for 3D only; SSQ twice).
    for (const ins of instruments) {
      if (ins.code === "mps-physical-presence" && conditionId !== c3d) continue;
      const attempts = ins.code === "ssq" ? [1, 2] : [1];
      const max = ins.code === "cognitive-load" ? 10 : ins.code === "ssq" ? 3 : 5;
      const min = ins.code === "cognitive-load" || ins.code === "ssq" ? 0 : 1;
      for (const attempt of attempts) {
        await pool.query(
          `INSERT INTO responses (session_id, participant_id, assessment_id, item_id, attempt, status, raw, presented_at, answered_at)
           SELECT $1, $2, $3, item, $4, 'answered', jsonb_build_object('value', v, 'itemKind', 'likert', 'assessmentVersion', 2), now(), now()
             FROM unnest($5::uuid[], $6::int[]) AS u(item, v)`,
          [s.id, p.id, ins.id, attempt, ins.ids, ins.ids.map(() => min + Math.floor(r() * (max - min + 1)))],
        );
      }
    }
    if (i < opts.activeSessions) {
      const last = ev[ev.length - 1]!;
      active.push({ sessionId: s.id, participantId: p.id, conditionId, nextSeq: last.seq + 1, clientMs: last.clientMs + 1000 });
    } else {
      await pool.query("UPDATE study_sessions SET status = 'completed', completed_at = now(), last_activity_at = now() WHERE id = $1", [s.id]);
    }
  }
  // A little data-quality noise.
  const first = active[0];
  if (first) {
    await pool.query("INSERT INTO sequence_gaps (session_id, kind, from_seq, to_seq) VALUES ($1, 'gap', $2, $2)", [first.sessionId, first.nextSeq + 1000]);
    await pool.query("INSERT INTO telemetry_quarantine (session_id, reason, raw) VALUES ($1, 'seq_conflict: bench', '{}')", [first.sessionId]);
  }
  await pool.query("ANALYZE");
  return { studyId: st.studyId, snapshotLabel, conditions: { c2d, c3d }, concepts: conceptIds, sourceId, active, events };
}

/** Appends `count` events to an active session (as an ingest batch would). */
export async function appendEvents(pool: Pool, f: Fixture, index: number, count: number): Promise<void> {
  const a = f.active[index]!;
  const ev = generateEvents(1000 + index * 7 + a.nextSeq, count, f.concepts, f.sourceId, a.nextSeq, a.clientMs);
  await insertEvents(pool, { studyId: f.studyId, participantId: a.participantId, sessionId: a.sessionId, conditionId: a.conditionId }, ev, f.snapshotLabel);
  const last = ev[ev.length - 1]!;
  a.nextSeq = last.seq + 1;
  a.clientMs = last.clientMs + 1000;
}
