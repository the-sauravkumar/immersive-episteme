/**
 * Public dataset reads (src/server/public/dataset-stats.ts; DESIGN.md 11.1, WP1 acceptance "No
 * number on the home page is hard-coded: a test seeds a different dataset and the counts change").
 *
 * A throwaway database is seeded with a small dataset, read, then grown, and read again: every
 * count follows the data, demonstration records are never counted, the traditions come back in
 * the canonical alphabetical order, and the featured claim is a real seeded claim with its source.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { countWord, displayNameFromSlug, loadDatasetStats, loadFeaturedClaim, loadImageCredits, type Queryable } from "@/server/public/dataset-stats";

import { createTestDatabase, TEST_URL, type TestDb } from "./schema-harness";

const run = TEST_URL ? describe : describe.skip;

run("public dataset reads", () => {
  let t: TestDb;
  let q: Queryable;

  async function tradition(slug: string, name: string, isDemo = false): Promise<string> {
    const r = await t.pool.query<{ id: string }>(
      `INSERT INTO traditions (slug, name, region_district, region_state, verification_state, is_demo) VALUES ($1, $2, 'District', 'State', 'under_review', $3) RETURNING id`,
      [slug, name, isDemo],
    );
    return r.rows[0]!.id;
  }

  async function concept(key: string, title: string, traditionId: string | null, type = "tradition", isDemo = false): Promise<string> {
    const r = await t.pool.query<{ id: string }>(
      `INSERT INTO concepts (key, slug, type, category_code, tradition_id, title, provenance_kind, verification_state, is_demo)
       VALUES ($1, replace($1, '.', '-'), $2, (SELECT code FROM knowledge_categories ORDER BY code LIMIT 1), $3, $4, $5, 'under_review', $6) RETURNING id`,
      [key, type, traditionId, title, isDemo ? "unverified" : "historical_documentation", isDemo],
    );
    return r.rows[0]!.id;
  }

  async function source(title: string): Promise<string> {
    const r = await t.pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, author, year, verification_state) VALUES ('historical_documentation', $1, 'Author, A.', 2020, 'under_review') RETURNING id`,
      [title],
    );
    return r.rows[0]!.id;
  }

  async function claim(conceptId: string, position: number, text: string, sourceId: string, quote: string): Promise<void> {
    const r = await t.pool.query<{ id: string }>(`INSERT INTO concept_claims (concept_id, position, text) VALUES ($1, $2, $3) RETURNING id`, [conceptId, position, text]);
    await t.pool.query(`INSERT INTO concept_claim_sources (claim_id, source_id, locator, evidence) VALUES ($1, $2, 'p. 1', $3)`, [
      r.rows[0]!.id,
      sourceId,
      JSON.stringify([{ locator: "p. 1", quote }]),
    ]);
  }

  beforeAll(async () => {
    t = await createTestDatabase("public_stats");
    q = t.pool as unknown as Queryable;
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("counts follow the seeded dataset and exclude demonstration records", async () => {
    const s1 = await source("Source One");
    const sanganeri = await tradition("sanganeri", "Seeded Sanganeri");
    const ajrakh = await tradition("ajrakh", "Seeded Ajrakh");
    const cS = await concept("sanganeri.tradition.seeded", "Seeded Sanganeri Overview", sanganeri);
    const cA = await concept("ajrakh.tradition.seeded", "Seeded Ajrakh Overview", ajrakh);
    await claim(cA, 0, "Seeded claim A.", s1, "Seeded quote A.");
    await claim(cS, 0, "Seeded claim S.", s1, "Seeded quote S.");
    // A demo tradition must never be counted.
    await tradition("demo-x", "Demo: Tradition X", true);

    const before = await loadDatasetStats(q);
    expect(before.totals).toMatchObject({ traditions: 2, concepts: 2, claims: 2, sources: 1, sourcesCited: 1, citedClaims: 2, evidencedClaims: 2, relationships: 0 });
    expect(before.traditions.map((x) => x.slug)).toEqual(["ajrakh", "sanganeri"]);
    expect(before.traditions[0]).toMatchObject({ shortName: "Ajrakh", region: "District, State", concepts: 1, claims: 1, sourcesCited: 1 });

    // Grow the dataset: another tradition, a shared concept, a second source, a relationship.
    const s2 = await source("Source Two");
    const bagh = await tradition("bagh", "Seeded Bagh");
    const cB = await concept("bagh.tradition.seeded", "Seeded Bagh Overview", bagh);
    await claim(cB, 0, "Seeded claim B.", s2, "Seeded quote B.");
    const shared = await concept("shared.material.seeded", "Seeded Shared Material", null, "material");
    await claim(shared, 0, "Seeded shared claim.", s2, "Seeded shared quote.");
    await t.pool.query(`INSERT INTO relationships (source_concept_id, target_concept_id, type_code, provenance_kind) VALUES ($1, $2, 'USES', 'historical_documentation')`, [cB, shared]);

    const after = await loadDatasetStats(q);
    expect(after.totals).toMatchObject({ traditions: 3, concepts: 4, claims: 4, sources: 2, sourcesCited: 2, relationships: 1 });
    expect(after.traditions.map((x) => x.slug)).toEqual(["ajrakh", "bagh", "sanganeri"]);
    expect(after.shared).toEqual({ concepts: 1, claims: 1, sourcesCited: 1 });
    expect(after.totals).not.toEqual(before.totals);
  });

  it("the featured claim is a real seeded claim from a non-study tradition, chosen in canonical order", async () => {
    // Ajrakh and Sanganeri are study traditions: their claims are never featured on public pages.
    const first = await loadFeaturedClaim(q);
    expect(first).toMatchObject({ traditionSlug: "bagh", text: "Seeded claim B.", position: 0 });
    expect(first?.citation).toMatchObject({ title: "Source Two", quote: "Seeded quote B.", locator: "p. 1" });

    // Another non-study tradition: its shortest candidate is taken, not its first by position.
    const s3 = await source("Source Three");
    const dabu = await tradition("dabu", "Seeded Dabu");
    const cD = await concept("dabu.tradition.seeded", "Seeded Dabu Overview", dabu);
    await claim(cD, 0, "A longer seeded Dabu claim that comes first by position.", s3, "A longer seeded Dabu quote.");
    await claim(cD, 1, "Short Dabu claim.", s3, "Short quote.");
    // Too long for the specimen frame: never chosen.
    await claim(cD, 2, "x".repeat(140), s3, "y".repeat(150));

    expect((await loadFeaturedClaim(q))?.traditionSlug).toBe("bagh");
    const second = await loadFeaturedClaim(q, { skip: 1 });
    expect(second).toMatchObject({ traditionSlug: "dabu", text: "Short Dabu claim.", position: 1 });
    for (const skip of [0, 1, 2, 3]) {
      expect(["ajrakh", "machilipatnam-kalamkari", "sanganeri"]).not.toContain((await loadFeaturedClaim(q, { skip }))?.traditionSlug);
    }
    // Fewer qualifying traditions than `skip`: nothing, never a repeat of an earlier claim.
    expect(await loadFeaturedClaim(q, { skip: 2 })).toBeNull();

    // The About pull-quote never repeats the specimen's tradition. It sets only the claim, so a
    // quote too long for the specimen frame does not rule a claim out, and the shortest claim wins.
    const s4 = await source("Source Four");
    const bagru = await tradition("bagru", "Seeded Bagru");
    const cB = await concept("bagru.tradition.seeded", "Seeded Bagru Overview", bagru);
    await claim(cB, 0, "A Bagru claim with a long quote.", s4, "q".repeat(400));
    // Too long a quote for the specimen frame: the specimen order is unchanged.
    expect((await loadFeaturedClaim(q, { skip: 1 }))?.traditionSlug).toBe("dabu");
    const pull = await loadFeaturedClaim(q, { fit: "pull-quote", excludeSlugs: ["bagh"] });
    expect(pull).toMatchObject({ traditionSlug: "bagru", text: "A Bagru claim with a long quote." });
    const pullNoBagru = await loadFeaturedClaim(q, { fit: "pull-quote", excludeSlugs: ["bagh", "bagru"] });
    expect(pullNoBagru).toMatchObject({ traditionSlug: "dabu", text: "Short Dabu claim." });
  });

  it("lists no image credits while no image is verified", async () => {
    expect(await loadImageCredits(q)).toEqual([]);
  });
});

describe("public read helpers", () => {
  it("derives display names and count words", () => {
    expect(displayNameFromSlug("machilipatnam-kalamkari")).toBe("Machilipatnam Kalamkari");
    expect(countWord(6)).toBe("six");
    expect(countWord(42)).toBe("42");
  });
});
