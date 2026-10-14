/**
 * Integration: the knowledge schema's constraints and triggers reject invalid data
 * (own fresh database per run; see schema-harness.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_URL, createRealGraph, createTestDatabase, createUser, one, withSettings, type TestDb } from "./schema-harness";

describe.skipIf(!TEST_URL)("schema constraints", () => {
  let t: TestDb;
  let curator: string;

  beforeAll(async () => {
    t = await createTestDatabase("constraints");
    curator = await createUser(t.pool);
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  const insertConcept = (key: string, type: string, title: string, extra: { isDemo?: boolean; prov?: string; state?: string; category?: string } = {}) =>
    t.pool.query(
      `INSERT INTO concepts (key, slug, type, category_code, title, provenance_kind, verification_state, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        key,
        key.replace(/[._]/g, "-"),
        type,
        extra.category ?? "materials",
        title,
        extra.prov ?? "historical_documentation",
        extra.state ?? "under_review",
        extra.isDemo ?? false,
      ],
    );

  it("has the reference data", async () => {
    const r = await one<{ cats: number; types: number; events: number }>(
      t.pool,
      "SELECT (SELECT count(*) FROM knowledge_categories)::int AS cats, (SELECT count(*) FROM relationship_types)::int AS types, (SELECT count(*) FROM event_types)::int AS events",
    );
    expect(r.cats).toBe(14);
    expect(r.types).toBe(15);
    expect(r.events).toBeGreaterThanOrEqual(18);
    const sem = await t.pool.query("SELECT DISTINCT semantics::text AS semantics FROM relationship_types ORDER BY 1");
    expect(sem.rows.map((x) => x.semantics)).toEqual(["causal", "sequential", "associative", "compositional", "explanatory", "comparative"].sort());
  });

  it("rejects malformed concept keys, slugs and key/type mismatches", async () => {
    await expect(insertConcept("Bad Key", "material", "x")).rejects.toThrow(/concepts_(key|slug)_ck/);
    await expect(insertConcept("x1.tool.mallet", "material", "x")).rejects.toThrow(/concepts_key_ck/);
    await expect(
      t.pool.query(
        "INSERT INTO concepts (key, slug, type, category_code, title, provenance_kind) VALUES ('x1.material.a', 'Not A Slug', 'material', 'materials', 't', 'hypothesis')",
      ),
    ).rejects.toThrow(/concepts_slug_ck/);
    await expect(insertConcept("x1.material.blank", "material", "   ")).rejects.toThrow(/concepts_title_ck/);
  });

  it("rejects unknown categories, concept types and provenance kinds", async () => {
    await expect(insertConcept("x1.material.c1", "material", "t", { category: "no_such_category" })).rejects.toThrow(/foreign key/);
    await expect(insertConcept("x1.widget.c2", "widget", "t")).rejects.toThrow(/invalid input value for enum concept_type/);
    await expect(insertConcept("x1.material.c3", "material", "t", { prov: "rumour" })).rejects.toThrow(/invalid input value for enum provenance_kind/);
  });

  it("enforces the demo flagging rules", async () => {
    // demo key without demo flag, demo flag without demo key, demo without "Demo:" title
    await expect(insertConcept("demo-x.material.m1", "material", "Demo: m1")).rejects.toThrow(/concepts_demo_ck/);
    await expect(insertConcept("x2.material.m1", "material", "Demo: m1", { isDemo: true, prov: "unverified" })).rejects.toThrow(/concepts_demo_ck/);
    await expect(insertConcept("demo-x.material.m2", "material", "Material", { isDemo: true, prov: "unverified" })).rejects.toThrow(/concepts_demo_ck/);
    // demo content is always unverified provenance and never accepted
    await expect(insertConcept("demo-x.material.m3", "material", "Demo: m3", { isDemo: true })).rejects.toThrow(/concepts_demo_state_ck/);
    await expect(
      insertConcept("demo-x.material.m4", "material", "Demo: m4", { isDemo: true, prov: "unverified", state: "verified" }),
    ).rejects.toThrow(/concepts_demo_state_ck|cannot be accepted/);
    await expect(insertConcept("demo-x.material.ok", "material", "Demo: ok", { isDemo: true, prov: "unverified" })).resolves.toBeDefined();
  });

  it("keeps demo and real graphs disjoint via composite is_demo foreign keys", async () => {
    const real = await createRealGraph(t.pool, { prefix: "disjoint" });
    // A demo concept cannot belong to a real tradition.
    await expect(
      t.pool.query(
        `INSERT INTO concepts (key, slug, type, category_code, tradition_id, title, provenance_kind, is_demo)
         VALUES ('demo-y.tool.t1', 'demo-y-tool-t1', 'tool', 'tools', $1, 'Demo: t1', 'unverified', true)`,
        [real.traditionId],
      ),
    ).rejects.toThrow(/concepts_tradition_fk/);
    // A relationship cannot connect a demo concept to a real one.
    const demo = await insertConcept("demo-y.material.m1", "material", "Demo: m1", { isDemo: true, prov: "unverified" });
    await expect(
      t.pool.query(
        `INSERT INTO relationships (source_concept_id, target_concept_id, type_code, provenance_kind, is_demo)
         VALUES ($1, $2, 'USES', 'unverified', true)`,
        [real.conceptIds[0], demo.rows[0].id],
      ),
    ).rejects.toThrow(/relationships_source_fk/);
    // A real claim cannot cite a demo source.
    const demoSource = await one<{ id: string }>(
      t.pool,
      "INSERT INTO sources (kind, title, is_demo) VALUES ('unverified', 'Demo: s', true) RETURNING id",
    );
    const claim = await one<{ id: string }>(
      t.pool,
      "SELECT id FROM concept_claims WHERE concept_id = $1",
      [real.conceptIds[0]],
    );
    await expect(
      t.pool.query("INSERT INTO concept_claim_sources (claim_id, source_id) VALUES ($1, $2)", [claim.id, demoSource.id]),
    ).rejects.toThrow(/concept_claim_sources_source_fk/);
  });

  it("limits quotes to 25 words", async () => {
    const real = await createRealGraph(t.pool, { prefix: "quotes" });
    const long = Array.from({ length: 26 }, (_, i) => `w${i}`).join(" ");
    await expect(
      t.pool.query("INSERT INTO concept_claims (concept_id, position, text, quote) VALUES ($1, 5, 'c', $2)", [real.conceptIds[0], long]),
    ).rejects.toThrow(/concept_claims_quote_ck/);
    const ok = Array.from({ length: 25 }, (_, i) => `w${i}`).join(" ");
    await expect(
      t.pool.query("INSERT INTO concept_claims (concept_id, position, text, quote) VALUES ($1, 6, 'c', $2)", [real.conceptIds[0], ok]),
    ).resolves.toBeDefined();
  });

  describe("relationships", () => {
    let a: string;
    let b: string;
    let c: string;
    beforeAll(async () => {
      a = (await insertConcept("rel.process_stage.a", "process_stage", "A", { category: "process_stages" })).rows[0].id;
      b = (await insertConcept("rel.process_stage.b", "process_stage", "B", { category: "process_stages" })).rows[0].id;
      c = (await insertConcept("rel.process_stage.c", "process_stage", "C", { category: "process_stages" })).rows[0].id;
    });
    const rel = (s: string, tgt: string, type: string, extra: { ordinal?: number; strength?: number } = {}) =>
      t.pool.query(
        `INSERT INTO relationships (source_concept_id, target_concept_id, type_code, ordinal, strength, provenance_kind)
         VALUES ($1, $2, $3, $4, $5, 'historical_documentation') RETURNING id`,
        [s, tgt, type, extra.ordinal ?? null, extra.strength ?? null],
      );

    it("rejects self-loops, unknown types, bad strength and duplicate edges", async () => {
      await expect(rel(a, a, "USES")).rejects.toThrow(/relationships_no_self_loop_ck/);
      await expect(rel(a, b, "LIKES")).rejects.toThrow(/foreign key/);
      await expect(rel(a, b, "USES", { strength: 1.5 })).rejects.toThrow(/relationships_strength_ck/);
      await rel(a, b, "USES");
      await expect(rel(a, b, "USES")).rejects.toThrow(/relationships_edge_uq/);
    });

    it("accepts an ordinal only on ordered (sequential) types", async () => {
      await expect(rel(a, b, "PRODUCES", { ordinal: 1 })).rejects.toThrow(/does not take an ordinal/);
      await expect(rel(a, b, "PRECEDES", { ordinal: 0 })).rejects.toThrow(/relationships_ordinal_ck/);
      await expect(rel(a, b, "PRECEDES", { ordinal: 1 })).resolves.toBeDefined();
      // PRECEDES allows cycles: real process content has repeat loops.
      await expect(rel(b, a, "PRECEDES", { ordinal: 2 })).resolves.toBeDefined();
    });

    it("stores undirected edges once per pair", async () => {
      await rel(a, c, "SIMILAR_TO");
      await expect(rel(c, a, "SIMILAR_TO")).rejects.toThrow(/reverse direction/);
    });

    it("keeps acyclic types acyclic", async () => {
      await rel(a, b, "BELONGS_TO");
      await rel(b, c, "BELONGS_TO");
      await expect(rel(c, a, "BELONGS_TO")).rejects.toThrow(/must stay acyclic/);
    });
  });

  describe("review states", () => {
    it("records every state change and refuses acceptance without an actor", async () => {
      const g = await createRealGraph(t.pool, { prefix: "review" });
      const [c1] = g.conceptIds;
      await expect(t.pool.query("UPDATE concepts SET verification_state = 'verified' WHERE id = $1", [c1])).rejects.toThrow(
        /verification_records_actor_ck/,
      );
      await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "checked against source" }, (cl) =>
        cl.query("UPDATE concepts SET verification_state = 'verified' WHERE id = $1", [c1]),
      );
      const history = await t.pool.query(
        "SELECT from_state, to_state, actor_id, reason FROM verification_records WHERE entity_kind = 'concept' AND entity_id = $1 ORDER BY created_at, id",
        [c1],
      );
      expect(history.rows).toEqual([
        { from_state: null, to_state: "under_review", actor_id: null, reason: null },
        { from_state: "under_review", to_state: "verified", actor_id: curator, reason: "checked against source" },
      ]);
      await expect(t.pool.query("UPDATE verification_records SET reason = 'x'")).rejects.toThrow(/append-only/);
      await expect(t.pool.query("DELETE FROM verification_records")).rejects.toThrow(/append-only/);
    });

    it("refuses to accept a concept without a sourced claim or with unverified provenance", async () => {
      const bare = (await insertConcept("review.material.bare", "material", "Bare")).rows[0].id;
      await expect(
        withSettings(t.pool, { "app.actor_id": curator }, (cl) =>
          cl.query("UPDATE concepts SET verification_state = 'verified' WHERE id = $1", [bare]),
        ),
      ).rejects.toThrow(/needs at least one sourced claim/);
      const unv = (await insertConcept("review.material.unv", "material", "Unv", { prov: "unverified" })).rows[0].id;
      await expect(
        withSettings(t.pool, { "app.actor_id": curator }, (cl) =>
          cl.query("UPDATE concepts SET verification_state = 'verified' WHERE id = $1", [unv]),
        ),
      ).rejects.toThrow(/provenance "unverified"/);
    });

    it("refuses to accept an evidence-requiring relationship without a source", async () => {
      const g = await createRealGraph(t.pool, { prefix: "relreview" });
      await t.pool.query("DELETE FROM relationship_sources WHERE relationship_id = $1", [g.relationshipId]);
      await expect(
        withSettings(t.pool, { "app.actor_id": curator }, (cl) =>
          cl.query("UPDATE relationships SET verification_state = 'verified' WHERE id = $1", [g.relationshipId]),
        ),
      ).rejects.toThrow(/needs a source/);
    });
  });

  it("finds concepts by trigram and full-text search", async () => {
    await insertConcept("search.material.indigo-vat", "material", "Fermented vat", { category: "materials" });
    const tri = await t.pool.query("SELECT title FROM concepts WHERE title % 'Fermnted vat'");
    expect(tri.rows.map((r) => r.title)).toContain("Fermented vat");
    const fts = await t.pool.query("SELECT title FROM concepts WHERE search @@ plainto_tsquery('simple', 'fermented')");
    expect(fts.rows.map((r) => r.title)).toContain("Fermented vat");
  });

  it("rejects participant codes that look like personal data", async () => {
    const s = await one<{ id: string }>(
      t.pool,
      "INSERT INTO studies (slug, title, protocol_version, design) VALUES ('pii-check', 'PII check', 'p1', 'between') RETURNING id",
    );
    await expect(t.pool.query("INSERT INTO participants (study_id, code) VALUES ($1, 'jane.doe@example.com')", [s.id])).rejects.toThrow(
      /participants_code_ck/,
    );
    await expect(t.pool.query("INSERT INTO participants (study_id, code) VALUES ($1, 'Jane Doe')", [s.id])).rejects.toThrow(
      /participants_code_ck/,
    );
    await expect(t.pool.query("INSERT INTO participants (study_id, code) VALUES ($1, 'P-0001')", [s.id])).resolves.toBeDefined();
  });

  it("keeps the audit log append-only", async () => {
    await t.pool.query("INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id) VALUES ('user', $1, 'concept.update', 'concept', 'x')", [curator]);
    await expect(t.pool.query("UPDATE audit_log SET action = 'concept.delete'")).rejects.toThrow(/append-only/);
    await expect(t.pool.query("DELETE FROM audit_log")).rejects.toThrow(/append-only/);
    await expect(t.pool.query("TRUNCATE audit_log")).rejects.toThrow(/append-only/);
  });

  it("requires citations for instruments flagged as validated", async () => {
    await expect(
      t.pool.query("INSERT INTO assessments (code, version, kind, title, is_validated_instrument) VALUES ('ux', 1, 'questionnaire', 'UX', true)"),
    ).rejects.toThrow(/assessments_validated_ck/);
  });
});
