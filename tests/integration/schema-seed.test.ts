/**
 * Integration: the demo seed runs on a fresh database, is idempotent, flags every row as demo
 * and covers every concept type and relationship semantics class. Its snapshot payload
 * satisfies the knowledge-bundle contract.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_SNAPSHOT_LABEL, DEMO_STUDY_SLUG, seedDemo } from "../../db/seeds/demo";
import { knowledgeBundleSchema } from "../../src/features/knowledge/contracts";
import { CONCEPT_TYPES, RELATIONSHIP_SEMANTICS } from "../../src/lib/validation/enums";
import { TEST_URL, createTestDatabase, one, type TestDb } from "./schema-harness";

describe.skipIf(!TEST_URL)("schema: demo seed", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDatabase("seed");
    await seedDemo(t.db);
    await seedDemo(t.db); // idempotent
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("flags every knowledge row as demo with a Demo: title", async () => {
    const r = await one<{ bad: number }>(
      t.pool,
      `SELECT (
         (SELECT count(*) FROM concepts WHERE NOT is_demo OR title NOT LIKE 'Demo:%' OR provenance_kind <> 'unverified') +
         (SELECT count(*) FROM traditions WHERE NOT is_demo OR name NOT LIKE 'Demo:%') +
         (SELECT count(*) FROM sources WHERE NOT is_demo OR title NOT LIKE 'Demo:%') +
         (SELECT count(*) FROM relationships WHERE NOT is_demo) +
         (SELECT count(*) FROM content_snapshots WHERE NOT is_demo) +
         (SELECT count(*) FROM studies WHERE NOT is_demo OR title NOT LIKE 'Demo:%') +
         (SELECT count(*) FROM assessments WHERE NOT is_demo OR title NOT LIKE 'Demo:%')
       )::int AS bad`,
    );
    expect(r.bad).toBe(0);
    const accepted = await one<{ n: number }>(
      t.pool,
      "SELECT count(*)::int AS n FROM concepts WHERE verification_state IN ('verified', 'published')",
    );
    expect(accepted.n).toBe(0);
  });

  it("covers every concept type, every semantics class and every registry type once seeded twice", async () => {
    const types = await t.pool.query("SELECT DISTINCT type::text AS v FROM concepts");
    expect(types.rows.map((r) => r.v).sort()).toEqual([...CONCEPT_TYPES].sort());
    const sem = await t.pool.query(
      "SELECT DISTINCT rt.semantics::text AS v FROM relationships r JOIN relationship_types rt ON rt.code = r.type_code",
    );
    expect(sem.rows.map((r) => r.v).sort()).toEqual([...RELATIONSHIP_SEMANTICS].sort());
    const unusedTypes = await one<{ n: number }>(
      t.pool,
      "SELECT count(*)::int AS n FROM relationship_types rt WHERE NOT EXISTS (SELECT 1 FROM relationships r WHERE r.type_code = rt.code)",
    );
    expect(unusedTypes.n).toBe(0);
    const packages = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM content_packages");
    expect(packages.n).toBe(5);
  });

  it("has an ordered process sequence per tradition and cross-tradition links", async () => {
    const seq = await t.pool.query(
      `SELECT tr.slug, array_agg(r.ordinal ORDER BY r.ordinal) AS ords
         FROM relationships r JOIN concepts c ON c.id = r.source_concept_id JOIN traditions tr ON tr.id = c.tradition_id
        WHERE r.type_code = 'PRECEDES' GROUP BY tr.slug ORDER BY tr.slug`,
    );
    expect(seq.rows).toEqual([
      { slug: "demo-tradition-a", ords: [1, 2, 3] },
      { slug: "demo-tradition-b", ords: [1, 2, 3] },
      { slug: "demo-tradition-c", ords: [1, 2, 3] },
    ]);
    const cross = await one<{ n: number }>(
      t.pool,
      `SELECT count(*)::int AS n FROM relationships r
         JOIN concepts s ON s.id = r.source_concept_id JOIN concepts g ON g.id = r.target_concept_id
        WHERE s.tradition_id <> g.tradition_id`,
    );
    expect(cross.n).toBeGreaterThanOrEqual(3);
  });

  it("publishes a demo snapshot whose payload satisfies the bundle contract", async () => {
    const snap = await one<{ status: string; payload: unknown; item_count: number; includes_unverified: boolean }>(
      t.pool,
      "SELECT status, payload, item_count, includes_unverified FROM content_snapshots WHERE version_label = $1",
      [DEMO_SNAPSHOT_LABEL],
    );
    expect(snap.status).toBe("published");
    expect(snap.includes_unverified).toBe(true);
    const bundle = knowledgeBundleSchema.parse(snap.payload);
    expect(bundle.isDemo).toBe(true);
    expect(snap.item_count).toBe(
      bundle.categories.length +
        bundle.relationshipTypes.length +
        bundle.traditions.length +
        bundle.sources.length +
        bundle.concepts.length +
        bundle.concepts.reduce((n, c) => n + c.claims.length, 0) +
        bundle.relationships.length,
    );
  });

  it("creates a draft demo study with both conditions and an assessment battery", async () => {
    const s = await one<{ id: string; status: string }>(t.pool, "SELECT id, status FROM studies WHERE slug = $1", [DEMO_STUDY_SLUG]);
    expect(s.status).toBe("draft");
    const conds = await t.pool.query("SELECT interface::text AS i FROM study_conditions WHERE study_id = $1 ORDER BY position", [s.id]);
    expect(conds.rows.map((r) => r.i)).toEqual(["conventional_2d", "immersive_3d"]);
    const battery = await t.pool.query(
      `SELECT sa.phase::text AS phase, a.kind::text AS kind FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id
        WHERE sa.study_id = $1 ORDER BY sa.phase, sa.position`,
      [s.id],
    );
    expect(battery.rows).toEqual([
      { phase: "pre", kind: "pretest" },
      { phase: "pre", kind: "reconstruction" },
      { phase: "post", kind: "posttest" },
      { phase: "post", kind: "reconstruction" },
      { phase: "post", kind: "transfer" },
      { phase: "post", kind: "questionnaire" },
    ]);
  });

  it("cannot be attached to a non-demo study", async () => {
    const snap = await one<{ id: string }>(t.pool, "SELECT id FROM content_snapshots WHERE version_label = $1", [DEMO_SNAPSHOT_LABEL]);
    await expect(
      t.pool.query(
        "INSERT INTO studies (slug, title, protocol_version, design, snapshot_id) VALUES ('real-study', 'Real study', 'p1', 'between', $1)",
        [snap.id],
      ),
    ).rejects.toThrow(/non-demo study cannot use a demo content snapshot/);
  });
});
