/**
 * Integration: research console services against a throwaway database.
 *  - activation is blocked by a failing parity report and allowed by a passing one;
 *  - telemetry -> derived metrics (idempotent recomputation);
 *  - session integrity, annotations, deviations, exclusion;
 *  - export and re-import validation (joins, checksums, metric recomputation, CSV round trip);
 *  - pseudonymised vs identified export content;
 *  - versioning of an active (frozen) study.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analysable } from "../../src/server/research/analysis-scope";
import { studyOverview, transitionMatrices } from "../../src/server/research/analytics";
import { ResearchActionError } from "../../src/server/research/db";
import { buildExportBundle, bundleTableCsv, type ExportBundle } from "../../src/server/research/exports/build";
import { csvText, parseCsv } from "../../src/server/research/exports/csv";
import { validateExportBundle } from "../../src/server/research/exports/validate";
import { recomputeStudyMetrics, staleMetricSessions } from "../../src/server/research/metrics/pipeline";
import { listParityReports } from "../../src/server/research/parity/store";
import { addAnnotation, addDeviation, excludeSession, getSession, integrityFlags, listSessions } from "../../src/server/research/sessions";
import { activateStudy, createStudy, getStudy, newStudyVersion, researchStudyConfigSchema, setBattery, updateStudy, type UpdateStudyInput } from "../../src/server/research/studies";
import { compileAndStoreManifest } from "../../src/server/spatial/manifest-store";
import { ingestTelemetryBatch } from "../../src/server/telemetry/ingest";
import { TEST_URL, createRealGraph, createSession, createTestDatabase, createUser, one, withSettings, type TestDb } from "./schema-harness";

describe.skipIf(!TEST_URL)("research console", () => {
  let t: TestDb;
  let actor: { userId: string };
  let studyId: string;
  let snapshotId: string;
  let manifestId: string;
  let conceptIds: [string, string];
  let relationshipId: string;
  let assessmentId: string;
  let itemId: string;
  const label = "rc-release-1";
  let s2d: Awaited<ReturnType<typeof createSession>>;
  let s3d: Awaited<ReturnType<typeof createSession>>;

  beforeAll(async () => {
    t = await createTestDatabase("research");
    const curator = await createUser(t.pool);
    actor = { userId: await createUser(t.pool) };
    const g = await createRealGraph(t.pool, { prefix: "rc", acceptBy: curator });
    conceptIds = g.conceptIds;
    relationshipId = g.relationshipId;
    // The tradition's own overview concept (the compiler anchors the wing entry on it).
    const overview = await one<{ id: string }>(
      t.pool,
      `INSERT INTO concepts (key, slug, type, category_code, tradition_id, title, provenance_kind, verification_state)
       VALUES ('rc.tradition.rc', 'rc-tradition-rc', 'tradition', 'tradition_identity', $1, 'Test tradition overview', 'historical_documentation', 'under_review') RETURNING id`,
      [g.traditionId],
    );
    const oc = await one<{ id: string }>(t.pool, "INSERT INTO concept_claims (concept_id, position, text) VALUES ($1, 0, 'Test overview claim') RETURNING id", [overview.id]);
    await t.pool.query("INSERT INTO concept_claim_sources (claim_id, source_id) VALUES ($1, $2)", [oc.id, g.sourceId]);
    await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test verification" }, (c) => c.query("UPDATE concepts SET verification_state = 'verified' WHERE id = $1", [overview.id]));
    const allConceptIds = [...g.conceptIds, overview.id];

    // A complete knowledge bundle for the accepted graph, frozen as a published release snapshot.
    const tr = await one<Record<string, unknown>>(t.pool, "SELECT id, slug, name FROM traditions WHERE id = $1", [g.traditionId]);
    const src = await one<Record<string, unknown>>(t.pool, "SELECT id, kind::text AS kind, title FROM sources WHERE id = $1", [g.sourceId]);
    const cats = (await t.pool.query("SELECT code, label, template_group, position FROM knowledge_categories WHERE code IN ('process_stages', 'tradition_identity') ORDER BY position")).rows;
    const rt = await one<Record<string, unknown>>(t.pool, "SELECT code, label, inverse_label, semantics::text AS semantics, directed, ordered, allows_cycles FROM relationship_types WHERE code = 'PRECEDES'");
    const concepts = (await t.pool.query("SELECT id, key, slug, title FROM concepts WHERE id = ANY($1::uuid[]) ORDER BY key", [allConceptIds])).rows;
    const claims = (await t.pool.query("SELECT id, concept_id, text FROM concept_claims WHERE concept_id = ANY($1::uuid[])", [allConceptIds])).rows;
    const rel = await one<Record<string, unknown>>(t.pool, "SELECT id FROM relationships WHERE id = $1", [relationshipId]);
    const payload = {
      schemaVersion: 1,
      versionLabel: label,
      isDemo: false,
      includesUnverified: false,
      generatedAt: "2026-01-01T00:00:00.000Z",
      categories: cats.map((cat) => ({ code: cat.code, label: cat.label, templateGroup: cat.template_group, position: cat.position })),
      relationshipTypes: [{ code: rt.code, label: rt.label, inverseLabel: rt.inverse_label, semantics: rt.semantics, directed: rt.directed, ordered: rt.ordered, allowsCycles: rt.allows_cycles }],
      traditions: [{ id: tr.id, slug: tr.slug, name: tr.name, altNames: [], summary: null, region: { place: null, district: null, state: null, country: null, lat: null, lon: null }, gi: null, verificationState: "verified" }],
      sources: [{ id: src.id, kind: src.kind, title: src.title, author: null, publisher: null, year: null, url: null, accessedOn: null, reliability: null, verificationState: "verified" }],
      concepts: concepts.map((c) => ({
        id: c.id,
        key: c.key,
        slug: c.slug,
        type: c.key === "rc.tradition.rc" ? "tradition" : "process_stage",
        category: c.key === "rc.tradition.rc" ? "tradition_identity" : "process_stages",
        traditionId: tr.id,
        title: c.title,
        summary: "",
        body: null,
        bodyMd: null,
        localTerms: [],
        compares: [],
        provenanceKind: "historical_documentation",
        verificationState: "verified",
        claims: claims.filter((x) => x.concept_id === c.id).map((x) => ({ id: x.id, text: x.text, quote: null, sources: [{ sourceId: src.id, locator: null }] })),
        assetIds: [],
      })),
      relationships: [
        {
          id: rel.id,
          source: concepts.find((c) => c.id === conceptIds[0]).key,
          target: concepts.find((c) => c.id === conceptIds[1]).key,
          type: "PRECEDES",
          explanation: null,
          conditions: null,
          strength: null,
          ordinal: 1,
          provenanceKind: "historical_documentation",
          verificationState: "verified",
          sources: [{ sourceId: src.id, quote: null, locator: null }],
        },
      ],
    };
    const snap = await one<{ id: string }>(t.pool, "INSERT INTO content_snapshots (version_label, title, payload, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [label, `Snapshot ${label}`, JSON.stringify(payload), curator]);
    snapshotId = snap.id;
    const items: [string, string][] = [
      ...cats.map((cat) => ["category", String(cat.code)] as [string, string]),
      ["relationship_type", "PRECEDES"],
      ["tradition", String(tr.id)],
      ["source", String(src.id)],
      ...concepts.map((c) => ["concept", c.id] as [string, string]),
      ...claims.map((c) => ["claim", c.id] as [string, string]),
      ["relationship", String(rel.id)],
    ];
    for (const [kind, ref] of items) {
      await t.pool.query("INSERT INTO snapshot_items (snapshot_id, item_kind, entity_ref, item_sha256) VALUES ($1, $2, $3, $4)", [snapshotId, kind, ref, "a".repeat(64)]);
    }
    await t.pool.query("UPDATE content_snapshots SET status = 'published', published_by = $2 WHERE id = $1", [snapshotId, curator]);

    const client = await t.pool.connect();
    try {
      const m = await compileAndStoreManifest(client, { snapshotId, traditions: [String(tr.slug)] });
      manifestId = m.id;
    } finally {
      client.release();
    }
    await t.pool.query("UPDATE spatial_manifests SET status = 'published', published_by = $2 WHERE id = $1", [manifestId, curator]);

    // A locked post-learning concept-map assessment for the battery.
    const a = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ('rc-map', 1, 'reconstruction', 'Reconstruction') RETURNING id");
    assessmentId = a.id;
    const item = await one<{ id: string }>(
      t.pool,
      `INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, 'map', 0, 'concept_map', 'Connect the concepts', $2) RETURNING id`,
      [assessmentId, JSON.stringify({ kind: "concept_map", conceptKeys: concepts.map((c) => c.key), allowFreeNodes: false, relationshipTypes: [], directed: true })],
    );
    itemId = item.id;
    await t.pool.query("UPDATE assessments SET status = 'locked', locked_at = now() WHERE id = $1", [assessmentId]);
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  const baseUpdate = (config: Record<string, unknown>): UpdateStudyInput => ({
    title: "Research console study",
    description: null,
    protocolVersion: "p1",
    design: "between",
    snapshotId,
    manifestId,
    config: researchStudyConfigSchema.parse({ traditionSlugs: ["rc-tradition"], ...config }),
  });

  it("creates a draft study with both conditions and records its configuration history", async () => {
    studyId = await createStudy(t.pool, actor, { slug: "rc-study", title: "Research console study", protocolVersion: "p1", design: "between" });
    await updateStudy(t.pool, actor, studyId, baseUpdate({ exposure: { mode: "self_paced" }, eligibility: { inclusion: ["Adult"], exclusion: [] } }));
    await setBattery(t.pool, actor, studyId, [{ assessmentId, phase: "post", position: 0 }]);
    const s = await getStudy(t.pool, studyId);
    expect(s?.conditions.map((c) => c.interface).sort()).toEqual(["conventional_2d", "immersive_3d"]);
    expect(s?.config.eligibility.inclusion).toEqual(["Adult"]);
    expect(s?.battery.map((b) => b.phase)).toEqual(["post"]);
    const history = await t.pool.query("SELECT action FROM audit_log WHERE entity = 'study' AND entity_id = $1 ORDER BY occurred_at", [studyId]);
    expect(history.rows.map((r) => r.action)).toEqual(["study.create", "study.configure", "study.battery"]);
  });

  it("refuses activation while the parity report fails, and keeps the report", async () => {
    const r = await activateStudy(t.pool, actor, studyId);
    expect(r.activated).toBe(false);
    expect(r.failures.join(" ")).toMatch(/exposure budget/i);
    expect((await getStudy(t.pool, studyId))?.status).toBe("draft");
    const reports = await listParityReports(t.pool, studyId);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.report.passed).toBe(false);
    expect(reports[0]!.reportSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("activates once the parity report passes", async () => {
    await updateStudy(t.pool, actor, studyId, baseUpdate({ exposure: { mode: "fixed_time", minutes: 20 } }));
    const r = await activateStudy(t.pool, actor, studyId);
    expect(r.failures).toEqual([]);
    expect(r.activated).toBe(true);
    const s = await getStudy(t.pool, studyId);
    expect(s?.status).toBe("active");
    const reports = await listParityReports(t.pool, studyId);
    expect(reports[0]!.id).toBe(r.parityReportId);
    expect(reports[0]!.report.contentSet).toMatchObject({ concepts: 3, relationships: 1, claims: 3, sources: 1 });
    await expect(updateStudy(t.pool, actor, studyId, baseUpdate({ exposure: { mode: "fixed_time", minutes: 25 } }))).rejects.toBeInstanceOf(ResearchActionError);
  });

  it("derives metrics from telemetry, recomputes idempotently and flags stale sessions", async () => {
    s2d = await createSession(t.pool, studyId, (await getStudy(t.pool, studyId))!.conditions.find((c) => c.interface === "conventional_2d")!.id, "P-RC01", 0);
    s3d = await createSession(t.pool, studyId, (await getStudy(t.pool, studyId))!.conditions.find((c) => c.interface === "immersive_3d")!.id, "P-RC02", 1);
    const [a, b] = conceptIds;
    const send = async (s: typeof s2d, events: Record<string, unknown>[]) => {
      const r = await ingestTelemetryBatch(t.pool, { kind: "participant", participantId: s.participantId, sessionId: s.sessionId }, {
        idempotencyKey: `b:${s.sessionId}:${randomUUID().slice(0, 8)}`,
        sessionId: s.sessionId,
        schemaVersion: 1,
        appBuild: "test-build",
        contentVersion: label,
        clientSentAt: new Date().toISOString(),
        events: events.map((e, i) => ({ eventId: randomUUID(), schemaVersion: 1, sessionId: s.sessionId, seq: i, clientTs: new Date(Date.UTC(2026, 0, 1, 10, 0, i)).toISOString(), metadata: {}, ...e })),
      });
      expect(r.status === 200 && r.body.quarantined).toBe(0);
    };
    const exposure = (id: string, c: string, ms: number) => [
      { type: "exposure_started", conceptId: c, metadata: { intervalId: id, layer: "overview", startMonoMs: 0 } },
      { type: "exposure_ended", conceptId: c, metadata: { intervalId: id, layer: "overview", startMonoMs: 0, endMonoMs: ms, activeMs: ms, pausedMs: 0, reason: "switched" } },
    ];
    await send(s2d, [{ type: "page_entered", roomOrPageId: "home" }, ...exposure("i1", a, 4000), { type: "relationship_followed", metadata: { relationshipId, relationshipTypeCode: "PRECEDES", fromConceptId: a, toConceptId: b } }, ...exposure("i2", b, 3000)]);
    await send(s3d, [{ type: "room_entered", roomOrPageId: "room:x" }, ...exposure("j1", b, 2000), ...exposure("j2", a, 1000), ...exposure("j3", b, 500)]);

    // A final post-learning concept map for the 2D participant: a -> b (correct).
    const map = await one<{ id: string }>(
      t.pool,
      `INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, started_at)
       VALUES ($1, $2, $3, $4, 'post', $5, now()) RETURNING id`,
      [s2d.sessionId, s2d.participantId, assessmentId, itemId, JSON.stringify([{ key: "n1", conceptId: a, label: "A", x: 0, y: 0 }, { key: "n2", conceptId: b, label: "B", x: 1, y: 0 }])],
    );
    await t.pool.query(
      `INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key, source_concept_id, target_concept_id, relationship_type_code, directed)
       VALUES ($1, 'e1', 'n1', 'n2', $2, $3, 'PRECEDES', true)`,
      [map.id, a, b],
    );
    await t.pool.query("UPDATE concept_maps SET is_final = true, submitted_at = now(), revision = 2 WHERE id = $1", [map.id]);

    expect((await staleMetricSessions(t.pool, studyId)).stale).toBe(2);
    const first = await recomputeStudyMetrics(t.pool, studyId);
    expect(first.rowsWritten).toBeGreaterThan(0);
    const second = await recomputeStudyMetrics(t.pool, studyId);
    expect(second.rowsWritten).toBe(0);
    expect((await staleMetricSessions(t.pool, studyId)).stale).toBe(0);
    const metric = async (session: string, name: string) =>
      (await one<{ value: number | null; details: Record<string, unknown> }>(t.pool, "SELECT value, details FROM derived_metrics WHERE session_id = $1 AND metric_name = $2", [session, name]));
    expect((await metric(s2d.sessionId, "time.exposure_total_ms")).value).toBe(7000);
    expect((await metric(s3d.sessionId, "nav.path_length")).value).toBe(3);
    expect((await metric(s3d.sessionId, "nav.revisit_rate")).value).toBeCloseTo(1 / 3, 6);
    const corr = await metric(s2d.sessionId, "nav.map_correspondence");
    expect(corr.value).toBe(1);
    expect(corr.details).toMatchObject({ reconstructedCorrect: 1, correctAndFollowed: 1 });
    // derived_scores refuses timing metric names (DR-015): timings are never outcomes.
    await expect(
      t.pool.query("INSERT INTO derived_scores (session_id, participant_id, assessment_id, metric_name, metric_version, value, pipeline_version) VALUES ($1, $2, $3, 'time.exposure_total_ms', '1', 1, 'x')", [s2d.sessionId, s2d.participantId, assessmentId]),
    ).rejects.toThrow();
  });

  it("reports session integrity, annotations, deviations and exclusions", async () => {
    await addAnnotation(t.pool, actor, { sessionId: s3d.sessionId, kind: "observation", body: "Participant asked about controls" });
    await addDeviation(t.pool, actor, { studyId, sessionId: s3d.sessionId, category: "technical", severity: "minor", description: "Browser restarted once" });
    await excludeSession(t.pool, actor, { sessionId: s3d.sessionId, category: "technical_failure", detail: "Renderer crashed twice" });
    await expect(excludeSession(t.pool, actor, { sessionId: s3d.sessionId, category: "other", detail: "again" })).rejects.toBeInstanceOf(ResearchActionError);
    const s = (await getSession(t.pool, s3d.sessionId))!;
    expect(s).toMatchObject({ excluded: true, deviations: 1, annotations: 1, events: 7, openGaps: 0, participantCode: "P-RC02" });
    expect(integrityFlags(s).map((f) => f.level)).toContain("error");
    const list = await listSessions(t.pool, studyId);
    expect(list).toHaveLength(2);
    expect(analysable(list).map((x) => x.participantCode)).toEqual(["P-RC01"]);
    const overview = await studyOverview(t.pool, studyId);
    expect(overview.excluded).toBe(1);
    expect(overview.telemetry.reduce((n, x) => n + x.events, 0)).toBe(13);
    const matrices = await transitionMatrices(t.pool, studyId);
    expect(matrices.reduce((n, m) => n + m.transitions, 0)).toBe(1); // excluded 3D session not counted
  });

  it("exports pseudonymised data that re-imports with valid joins, checksums and recomputable metrics", async () => {
    const bundle = await buildExportBundle(t.pool, studyId, { scope: "pseudonymised", appBuild: "test" });
    expect(Object.keys(bundle.tables)).not.toContain("consent_records");
    expect(Object.keys(bundle.tables)).not.toContain("annotations");
    expect(bundle.tables.sessions!.find((r) => r.participant_code === "P-RC02")).toMatchObject({ excluded: true, exclusion_category: "technical_failure", exclusion_reason: null });
    expect(bundle.tables.deviations![0]).toMatchObject({ category: "technical", description: null });
    const text = JSON.stringify(bundle);
    expect(text).not.toContain("Renderer crashed twice");
    expect(text).not.toContain("Participant asked about controls");
    expect(text).not.toContain("@example.test");

    const reimported = JSON.parse(text) as ExportBundle;
    const v = validateExportBundle(reimported);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.recomputed.matched).toBe(v.recomputed.metrics);
    expect(v.recomputed.metrics).toBeGreaterThan(20);

    for (const table of Object.keys(bundle.tables)) {
      const parsed = parseCsv(bundleTableCsv(bundle, table));
      expect(parsed.rows).toHaveLength(bundle.tables[table]!.length);
      parsed.rows.forEach((row, i) => {
        for (const [k, val] of Object.entries(bundle.tables[table]![i]!)) expect(row[k]).toBe(csvText(val));
      });
    }
  });

  it("detects tampering and stale metrics on re-import", async () => {
    const bundle = await buildExportBundle(t.pool, studyId, { scope: "pseudonymised", appBuild: "test" });
    const tampered = JSON.parse(JSON.stringify(bundle)) as ExportBundle;
    tampered.tables.events![0]!.session_id = randomUUID();
    expect(validateExportBundle(tampered).errors.join("\n")).toMatch(/Checksum mismatch for table events[\s\S]*unknown session/);

    const { tableChecksum } = await import("../../src/server/research/exports/build");
    const wrongMetric = JSON.parse(JSON.stringify(bundle)) as ExportBundle;
    const row = wrongMetric.tables.derived_metrics!.find((r) => r.metric_name === "nav.path_length")!;
    row.value = 99;
    wrongMetric.checksums.derived_metrics = tableChecksum(wrongMetric.tables.derived_metrics!);
    expect(validateExportBundle(wrongMetric).errors.join("\n")).toMatch(/nav\.path_length#1: exported 99 but recomputed \d/);
  });

  it("adds consent records and free text only to identified exports", async () => {
    const bundle = await buildExportBundle(t.pool, studyId, { scope: "identified", appBuild: "test" });
    expect(bundle.tables.consent_records!.length).toBe(2);
    expect(bundle.tables.annotations![0]).toMatchObject({ body: "Participant asked about controls" });
    expect(bundle.tables.sessions!.find((r) => r.participant_code === "P-RC02")!.exclusion_reason).toBe("technical_failure: Renderer crashed twice");
    expect(validateExportBundle(JSON.parse(JSON.stringify(bundle)) as ExportBundle).ok).toBe(true);
  });

  it("versions a frozen study into a new draft", async () => {
    const id = await newStudyVersion(t.pool, actor, studyId, { slug: "rc-study-v2", protocolVersion: "p2" });
    const s = (await getStudy(t.pool, id))!;
    expect(s).toMatchObject({ status: "draft", protocolVersion: "p2", snapshotId, manifestId });
    expect(s.battery.map((b) => b.assessmentId)).toEqual([assessmentId]);
    expect(s.conditions).toHaveLength(2);
    expect((await getStudy(t.pool, studyId))!.status).toBe("active");
  });
});
