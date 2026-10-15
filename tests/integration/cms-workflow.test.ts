/**
 * Integration: CMS knowledge authoring, review workflow and release publishing against a
 * throwaway database (schema-harness). Covers the separation-of-duties rules, the citation
 * policy (page/locator + verbatim quote per claim), claims-only learner text and the refusal of
 * a release while anything in the review pipeline is unverified.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadSnapshotPayload } from "@/server/knowledge/snapshot-store";
import { CmsError, type Actor } from "@/server/cms/core";
import { diffBundles } from "@/server/cms/diff";
import { createConcept, saveClaims, saveCuratorNotes, saveRelationship, saveSource, saveTradition, setTraditionSource, updateConcept } from "@/server/cms/knowledge";
import { publishRelease, releaseReadiness } from "@/server/cms/release";
import { EVIDENCE_CHECK_KEYS, relationshipSchema, saveClaimsSchema, sourceSchema, traditionSchema } from "@/server/cms/schemas";
import { transition } from "@/server/cms/workflow";

import { TEST_URL, createTestDatabase, createUser, one, type TestDb } from "./schema-harness";

const ALL_CHECKS = [...EVIDENCE_CHECK_KEYS];

async function expectCmsError(p: Promise<unknown>, code: string): Promise<CmsError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(CmsError);
    expect((err as CmsError).code).toBe(code);
    return err as CmsError;
  }
  throw new Error(`expected CmsError ${code}`);
}

describe.skipIf(!TEST_URL)("CMS workflow and release", () => {
  let t: TestDb;
  let editor: Actor;
  let curatorA: Actor;
  let curatorB: Actor;
  let pi: Actor;
  let sourceId: string;
  let traditionId: string;
  let traditionConceptId: string;
  let materialId: string;
  let relId: string;

  const claim = (text: string, over: Partial<{ quote: string; locator: string }> = {}) => ({
    text,
    quote: over.quote ?? "Indigo is fermented in a vat for several days",
    sources: [{ sourceId, locator: over.locator ?? "p. 12 (PDF p. 4)" }],
  });
  const verify = (actor: Actor, entityKind: "tradition" | "concept" | "relationship" | "source", entityId: string) =>
    transition(t.pool, actor, { entityKind, entityId, to: "verified", reason: "checked against the archived PDF", evidenceChecked: ALL_CHECKS });
  const submit = (actor: Actor, entityKind: "tradition" | "concept" | "relationship" | "source", entityId: string) =>
    transition(t.pool, actor, { entityKind, entityId, to: "under_review", reason: null, evidenceChecked: [] });

  beforeAll(async () => {
    t = await createTestDatabase("cmswf");
    editor = { userId: await createUser(t.pool, "u_editor"), roles: ["content_editor"] };
    curatorA = { userId: await createUser(t.pool, "u_curator_a"), roles: ["curator"] };
    curatorB = { userId: await createUser(t.pool, "u_curator_b"), roles: ["curator"] };
    pi = { userId: await createUser(t.pool, "u_pi"), roles: ["principal_investigator"] };

    sourceId = (
      await saveSource(t.pool, curatorA, sourceSchema.parse({ kind: "historical_documentation", title: "Handbook of Indian dyeing", author: "A. Author", year: "2001", url: "https://example.org/handbook", reliability: "high" }))
    ).id;
    traditionId = (await saveTradition(t.pool, curatorA, traditionSchema.parse({ slug: "tst", name: "Test printing", giRegistered: "" }))).id;
    await setTraditionSource(t.pool, curatorA, { traditionId, sourceId, purpose: "general", remove: false });
    traditionConceptId = (await createConcept(t.pool, curatorA, { packageSlug: "tst", type: "tradition", name: "tst", categoryCode: "tradition_identity", title: "Test printing", provenanceKind: "historical_documentation", localTerms: [] })).id;
    materialId = (await createConcept(t.pool, curatorA, { packageSlug: "tst", type: "material", name: "indigo", categoryCode: "materials", title: "Indigo", provenanceKind: "historical_documentation", localTerms: ["nil"] })).id;
    await saveClaims(t.pool, curatorA, traditionConceptId, [claim("Test printing is a block-printing tradition.")]);
    await saveClaims(t.pool, curatorA, materialId, [claim("Indigo is fermented in a vat."), claim("The vat is kept warm.")]);
    relId = (
      await saveRelationship(
        t.pool,
        curatorA,
        relationshipSchema.parse({
          sourceConceptId: materialId,
          targetConceptId: traditionConceptId,
          typeCode: "BELONGS_TO",
          explanation: "Indigo is a material of this tradition.",
          provenanceKind: "historical_documentation",
          sources: JSON.stringify([{ sourceId, locator: "p. 12 (PDF p. 4)", quote: "Indigo is fermented in a vat" }]),
        }),
      )
    ).id;
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("generates the learner summary and body from claims only", async () => {
    const c = await one<{ summary: string; body_md: string; verification_state: string }>(t.pool, "SELECT summary, body_md, verification_state FROM concepts WHERE id = $1", [materialId]);
    expect(c.summary).toBe("Indigo is fermented in a vat.");
    expect(c.body_md).toBe("Indigo is fermented in a vat. [C1]\n\nThe vat is kept warm. [C1]");
    expect(c.verification_state).toBe("draft");
    const loc = await one<{ locator: string }>(t.pool, "SELECT cs.locator FROM concept_claim_sources cs JOIN concept_claims cc ON cc.id = cs.claim_id WHERE cc.concept_id = $1 LIMIT 1", [materialId]);
    expect(loc.locator).toBe("p. 12 (PDF p. 4)");
  });

  it("rejects a claim without a page/locator or without a verbatim quote", () => {
    const base = { text: "A claim.", quote: "a quote", sources: [{ sourceId: "00000000-0000-4000-8000-000000000000", locator: "p. 3" }] };
    const parse = (claims: unknown) => saveClaimsSchema.safeParse({ conceptId: materialId, claims: JSON.stringify(claims) });
    expect(parse([base]).success).toBe(true);
    const noLocator = parse([{ ...base, sources: [{ sourceId: base.sources[0]!.sourceId, locator: "  " }] }]);
    expect(noLocator.success).toBe(false);
    expect(JSON.stringify(noLocator.error?.issues)).toContain("page");
    expect(parse([{ ...base, quote: "" }]).success).toBe(false);
    expect(parse([{ ...base, sources: [] }]).success).toBe(false);
    expect(parse([{ ...base, quote: Array.from({ length: 26 }, () => "word").join(" ") }]).success).toBe(false);
    // Relationship citations follow the same rule.
    expect(relationshipSchema.safeParse({ sourceConceptId: materialId, targetConceptId: traditionConceptId, typeCode: "USES", provenanceKind: "hypothesis", sources: JSON.stringify([{ sourceId, locator: "p. 1", quote: "" }]) }).success).toBe(false);
  });

  it("refuses verification when a claim's citation is incomplete (imported-style claim)", async () => {
    const other = (await createConcept(t.pool, curatorA, { packageSlug: "tst", type: "tool", name: "block", categoryCode: "tools", title: "Block", provenanceKind: "historical_documentation", localTerms: [] })).id;
    await saveClaims(t.pool, curatorA, other, [claim("Blocks are carved from wood.")]);
    await submit(curatorA, "concept", other);
    // Simulate an imported claim without locator/quote (FORMAT v1 claims carry neither).
    await t.pool.query("UPDATE concept_claims SET quote = NULL WHERE concept_id = $1", [other]);
    const err = await expectCmsError(verify(curatorB, "concept", other), "citation_incomplete");
    expect(JSON.stringify(err.details)).toContain("claim_no_quote");
    // Take it out of the pipeline so it does not block the release below.
    await transition(t.pool, curatorB, { entityKind: "concept", entityId: other, to: "rejected", reason: "test fixture", evidenceChecked: [] });
  });

  it("an editor drafts and submits but cannot verify or publish", async () => {
    const id = (await createConcept(t.pool, editor, { packageSlug: "tst", type: "tool", name: "brush", categoryCode: "tools", title: "Brush", provenanceKind: "historical_documentation", localTerms: [] })).id;
    await saveClaims(t.pool, editor, id, [claim("A brush is used.")]);
    await submit(editor, "concept", id);
    await expectCmsError(verify(editor, "concept", id), "forbidden");
    await expectCmsError(transition(t.pool, editor, { entityKind: "concept", entityId: id, to: "rejected", reason: "no", evidenceChecked: [] }), "forbidden");
    await expectCmsError(publishRelease(t.pool, editor, { versionLabel: "release-x", title: "x", description: null }), "forbidden");
    await transition(t.pool, curatorB, { entityKind: "concept", entityId: id, to: "rejected", reason: "test fixture", evidenceChecked: [] });
  });

  it("nobody verifies their own work (even a curator)", async () => {
    for (const [kind, id] of [["source", sourceId], ["tradition", traditionId], ["concept", traditionConceptId], ["concept", materialId]] as const) {
      await submit(curatorA, kind, id);
    }
    await expectCmsError(verify(curatorA, "concept", materialId), "self_verification");
    // An edit makes the editor an author too.
    await updateConcept(t.pool, curatorB, { conceptId: materialId, categoryCode: "materials", title: "Indigo dye", provenanceKind: "historical_documentation", localTerms: ["nil"], compares: [] });
    await expectCmsError(verify(curatorB, "concept", materialId), "self_verification");
  });

  it("requires the evidence checklist and a reason; records actor, reason and checks", async () => {
    await expectCmsError(
      transition(t.pool, pi, { entityKind: "concept", entityId: materialId, to: "verified", reason: "checked", evidenceChecked: ["sources_consulted"] }),
      "evidence_unchecked",
    );
    await expectCmsError(transition(t.pool, pi, { entityKind: "concept", entityId: materialId, to: "needs_evidence", reason: null, evidenceChecked: [] }), "reason_required");
    await verify(pi, "concept", materialId);
    const vr = await one<{ actor_id: string; reason: string; to_state: string }>(
      t.pool,
      "SELECT actor_id, reason, to_state FROM verification_records WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [materialId],
    );
    expect(vr).toMatchObject({ actor_id: pi.userId, reason: "checked against the archived PDF", to_state: "verified" });
    const au = await one<{ after: { evidenceChecked: string[] } }>(t.pool, "SELECT after FROM audit_log WHERE action = 'cms.review.verify' AND entity_id = $1", [materialId]);
    expect(au.after.evidenceChecked).toEqual(ALL_CHECKS);
  });

  it("manual 'published' is refused: only a release publishes", async () => {
    await expectCmsError(transition(t.pool, pi, { entityKind: "concept", entityId: materialId, to: "published", reason: "x", evidenceChecked: [] }), "publish_via_release");
  });

  it("refuses to publish a release while anything in the pipeline is unverified", async () => {
    const readiness = await releaseReadiness(t.pool);
    expect(readiness.ok).toBe(false);
    expect(readiness.refusals.map((r) => r.code)).toContain("SNAP002");
    const err = await expectCmsError(publishRelease(t.pool, pi, { versionLabel: "release-1", title: "Release 1", description: null }), "release_refused");
    expect((err.details as { code: string }[]).some((d) => d.code === "SNAP002")).toBe(true);
    const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM content_snapshots WHERE kind = 'release'");
    expect(n.n).toBe(0);
  });

  it("publishes an immutable release once everything is verified, with locators and quotes", async () => {
    await verify(curatorB, "source", sourceId);
    await verify(curatorB, "tradition", traditionId);
    await verify(curatorB, "concept", traditionConceptId);
    await submit(curatorA, "relationship", relId);
    await verify(curatorB, "relationship", relId);
    const readiness = await releaseReadiness(t.pool);
    expect(readiness.refusals).toEqual([]);

    const r = await publishRelease(t.pool, pi, { versionLabel: "release-1", title: "Release 1", description: "first" }, { generatedAt: "2026-10-14T00:00:00.000Z" });
    const row = await one<{ status: string; kind: string; includes_unverified: boolean; published_by: string }>(t.pool, "SELECT status, kind, includes_unverified, published_by FROM content_snapshots WHERE id = $1", [r.id]);
    expect(row).toEqual({ status: "published", kind: "release", includes_unverified: false, published_by: pi.userId });
    const states = await t.pool.query<{ verification_state: string }>("SELECT DISTINCT verification_state FROM concepts WHERE id = ANY($1::uuid[])", [[materialId, traditionConceptId]]);
    expect(states.rows.map((s) => s.verification_state)).toEqual(["published"]);

    const bundle = await loadSnapshotPayload(t.pool, r.id);
    const indigo = bundle.concepts.find((c) => c.key === "tst.material.indigo")!;
    expect(indigo.claims[0]!.sources[0]!.locator).toBe("p. 12 (PDF p. 4)");
    expect(indigo.claims[0]!.quote).toBe("Indigo is fermented in a vat for several days");
    expect(indigo.body).toBeNull();
    expect(bundle.relationships[0]!.sources[0]).toMatchObject({ locator: "p. 12 (PDF p. 4)", quote: "Indigo is fermented in a vat" });

    // Immutable: the database refuses changes to a published snapshot.
    await expect(t.pool.query("UPDATE content_snapshots SET title = 'x' WHERE id = $1", [r.id])).rejects.toThrow(/immutable/);
    const audit = await one<{ actor_id: string }>(t.pool, "SELECT actor_id FROM audit_log WHERE action = 'cms.release.published' AND entity_id = $1", [r.id]);
    expect(audit.actor_id).toBe(pi.userId);
  });

  it("saving curator notes keeps a verified concept verified (notes are not learner-facing)", async () => {
    const before = await one<{ verification_state: string }>(t.pool, "SELECT verification_state FROM concepts WHERE id = $1", [materialId]);
    expect(["verified", "published"]).toContain(before.verification_state);
    const r = await saveCuratorNotes(t.pool, curatorA, materialId, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Check the vat temperature claim against the PDF." }] }] });
    expect(r.returnedToReview).toBe(false);
    const after = await one<{ verification_state: string }>(t.pool, "SELECT verification_state FROM concepts WHERE id = $1", [materialId]);
    expect(after.verification_state).toBe(before.verification_state);
  });

  it("editing published content returns it to review, and the next release diff shows it", async () => {
    await saveClaims(t.pool, curatorA, materialId, [claim("Indigo is fermented in a vat."), claim("The vat is kept warm."), claim("The vat is stirred daily.")]);
    const s = await one<{ verification_state: string }>(t.pool, "SELECT verification_state FROM concepts WHERE id = $1", [materialId]);
    expect(s.verification_state).toBe("under_review");
    await expectCmsError(verify(curatorB, "concept", materialId), "self_verification"); // edited it earlier
    await verify(pi, "concept", materialId);
    // The edge went back to review with its endpoint (trigger cascade).
    const rel = await one<{ verification_state: string }>(t.pool, "SELECT verification_state FROM relationships WHERE id = $1", [relId]);
    expect(rel.verification_state).toBe("under_review");
    await verify(curatorB, "relationship", relId);
    const r2 = await publishRelease(t.pool, pi, { versionLabel: "release-2", title: "Release 2", description: null });
    const a = await loadSnapshotPayload(t.pool, (await one<{ id: string }>(t.pool, "SELECT id FROM content_snapshots WHERE version_label = 'release-1'")).id);
    const b = await loadSnapshotPayload(t.pool, r2.id);
    const d = diffBundles(a, b);
    expect(d.claims.added.map((x) => x.key)).toEqual(["tst.material.indigo#3"]);
    expect(d.concepts.changed.find((c) => c.key === "tst.material.indigo")?.fields).toEqual(expect.arrayContaining(["bodyMd"]));
    await expectCmsError(publishRelease(t.pool, pi, { versionLabel: "release-2", title: "dup", description: null }), "label_taken");
  });
});
