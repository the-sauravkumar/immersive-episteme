import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CmsError, type Actor } from "@/server/cms/core";
import { createConcept, saveClaims, saveRelationship, saveSource, saveTradition, setTraditionSource } from "@/server/cms/knowledge";
import { createAssetFromBytes, linkAssetToConcept, MEDIA_EVIDENCE_CHECKS, reviewAsset, submitAssetForReview } from "@/server/cms/media/service";
import { createLocalStorage } from "@/server/cms/media/storage";
import { getConcept } from "@/server/cms/queries";
import { publishRelease, rebuildReviewSnapshot, releaseReadiness } from "@/server/cms/release";
import { claimDraftsOf } from "@/components/cms/claim-drafts";
import { EVIDENCE_CHECK_KEYS, relationshipSchema, sourceSchema, traditionSchema } from "@/server/cms/schemas";
import { citationProblems, transition } from "@/server/cms/workflow";
import { diffBundles } from "@/server/cms/diff";
import { buildReviewSnapshotFromDb } from "@/server/content/review-snapshot";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import type { KnowledgeBundle } from "@/features/knowledge/contracts";

import { TEST_URL, createTestDatabase, createUser, one, type TestDb } from "./schema-harness";

const ALL_CHECKS = [...EVIDENCE_CHECK_KEYS];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, salt: number) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 73, 72, 68, 82, ...be32(w), ...be32(h), 8, 2, 0, 0, 0, 0, 0, 0, 0, salt]);

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (err) {
    if (err instanceof CmsError) return err.code;
    throw err;
  }
}

describe.skipIf(!TEST_URL)("CMS release governance (final review)", () => {
  let t: TestDb;
  let dir: string;
  let editor: Actor;
  let curatorA: Actor;
  let curatorB: Actor;
  let pi: Actor;
  let s1: string;
  let traditionId: string;
  let identityId: string;
  let materialId: string;
  let assetId: string;

  const claim = (text: string, sources: { sourceId: string; locator?: string; quote?: string }[] = [{ sourceId: s1 }]) => ({
    text,
    quote: "Indigo is fermented in a vat for several days",
    sources: sources.map((s) => ({ sourceId: s.sourceId, locator: s.locator ?? "p. 12 (PDF p. 4)", ...(s.quote ? { quote: s.quote } : {}) })),
  });
  const verify = (actor: Actor, entityKind: "tradition" | "concept" | "relationship" | "source", entityId: string) =>
    transition(t.pool, actor, { entityKind, entityId, to: "verified", reason: "checked against the archived PDF", evidenceChecked: ALL_CHECKS });
  const move = (actor: Actor, entityKind: "tradition" | "concept" | "relationship" | "source", entityId: string, to: "under_review" | "archived" | "draft") =>
    transition(t.pool, actor, { entityKind, entityId, to, reason: to === "under_review" ? null : "test: taken out of the pipeline", evidenceChecked: [] });
  const stateOf = async (table: string, id: string) => (await one<{ s: string }>(t.pool, `SELECT verification_state::text AS s FROM ${table} WHERE id = $1`, [id])).s;
  const newSource = async (title: string) =>
    (await saveSource(t.pool, curatorA, sourceSchema.parse({ kind: "historical_documentation", title, author: "A. Author", year: "2001", url: `https://example.org/${encodeURIComponent(title)}`, reliability: "high" }))).id;

  beforeAll(async () => {
    t = await createTestDatabase("cmsgov");
    dir = await mkdtemp(join(tmpdir(), "ie-gov-"));
    editor = { userId: await createUser(t.pool, "g_editor"), roles: ["content_editor"] };
    curatorA = { userId: await createUser(t.pool, "g_curator_a"), roles: ["curator"] };
    curatorB = { userId: await createUser(t.pool, "g_curator_b"), roles: ["curator"] };
    pi = { userId: await createUser(t.pool, "g_pi"), roles: ["principal_investigator"] };

    s1 = await newSource("Handbook of Indian dyeing");
    traditionId = (await saveTradition(t.pool, curatorA, traditionSchema.parse({ slug: "gov", name: "Governance printing", giRegistered: "" }))).id;
    await setTraditionSource(t.pool, curatorA, { traditionId, sourceId: s1, purpose: "general", remove: false });
    identityId = (await createConcept(t.pool, curatorA, { packageSlug: "gov", type: "tradition", name: "gov", categoryCode: "tradition_identity", title: "Governance printing", provenanceKind: "historical_documentation", localTerms: [] })).id;
    materialId = (await createConcept(t.pool, curatorA, { packageSlug: "gov", type: "material", name: "indigo", categoryCode: "materials", title: "Indigo", provenanceKind: "historical_documentation", localTerms: [] })).id;
    await saveClaims(t.pool, curatorA, identityId, [claim("Governance printing is a block-printing tradition.")]);
    await saveClaims(t.pool, curatorA, materialId, [claim("Indigo is fermented in a vat."), claim("The vat is kept warm.")]);
    const relId = (
      await saveRelationship(
        t.pool,
        curatorA,
        relationshipSchema.parse({
          sourceConceptId: materialId,
          targetConceptId: identityId,
          typeCode: "BELONGS_TO",
          explanation: "Indigo is a material of this tradition.",
          provenanceKind: "historical_documentation",
          sources: JSON.stringify([{ sourceId: s1, locator: "p. 12 (PDF p. 4)", quote: "Indigo is fermented in a vat" }]),
        }),
      )
    ).id;
    for (const [kind, id] of [["source", s1], ["tradition", traditionId], ["concept", identityId], ["concept", materialId], ["relationship", relId]] as const) {
      await move(curatorA, kind, id, "under_review");
      await verify(curatorB, kind, id);
    }

    const storage = createLocalStorage(dir);
    const bytes = png(768, 512, 1);
    const asset = await createAssetFromBytes(t.pool, editor, storage, {
      bytes,
      declaredMime: "image/png",
      metadata: { title: "Indigo vat", altText: "A wide clay vat of dark blue dye standing in a sunlit courtyard", caption: "The vat that claim 2 describes.", credit: "Example Museum", licence: "CC BY 4.0", sourceUrl: "https://example.org/vat", provenanceKind: "historical_documentation" },
    });
    assetId = asset.id;
    expect(asset.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    await linkAssetToConcept(t.pool, editor, { assetId, conceptId: materialId, role: "illustration", position: 1 });
    await submitAssetForReview(t.pool, editor, { assetId });
    await reviewAsset(t.pool, curatorB, { assetId, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("freezes the servable study photograph into the release it publishes (knowledge-01)", async () => {
    expect((await releaseReadiness(t.pool)).refusals).toEqual([]);
    const r = await publishRelease(t.pool, pi, { versionLabel: "gov-1", title: "Governance 1", description: null });
    const fig = await one<{ asset_id: string; position: number; caption: string }>(t.pool, "SELECT asset_id, position, caption FROM snapshot_figures WHERE snapshot_id = $1", [r.id]);
    expect(fig).toEqual({ asset_id: assetId, position: 1, caption: "The vat that claim 2 describes." });
    const audit = await one<{ after: { figures: number } }>(t.pool, "SELECT after FROM audit_log WHERE action = 'cms.release.published' AND entity_id = $1", [r.id]);
    expect(audit.after.figures).toBe(1);
    const release = await one<{ payload: KnowledgeBundle }>(t.pool, "SELECT payload FROM content_snapshots WHERE id = $1", [r.id]);
    const review = await buildReviewSnapshotFromDb(t.pool, { hasher: nodeSha256, generatedAt: new Date().toISOString() });
    if (!review.ok) throw new Error("the review build failed");
    const diff = diffBundles(review.envelope.payload, release.payload, { citationDetail: false });
    expect([...diff.claims.changed, ...diff.relationships.changed].filter((c) => c.fields.includes("sources"))).toEqual([]);
  });

  it("moves a photograph's anchor with its claim, and returns the asset to review when the claim is reworded (knowledge-07)", async () => {
    const position = async () => (await one<{ position: number }>(t.pool, "SELECT position FROM asset_links WHERE asset_id = $1", [assetId])).position;
    await saveClaims(t.pool, curatorA, materialId, [claim("Indigo comes from the leaves of Indigofera."), claim("Indigo is fermented in a vat."), claim("The vat is kept warm.")]);
    expect(await position()).toBe(2);
    expect(await stateOf("assets", assetId)).toBe("verified");
    await saveClaims(t.pool, curatorA, materialId, [claim("Indigo comes from the leaves of Indigofera."), claim("Indigo is fermented in a vat."), claim("The vat is kept at body heat.")]);
    expect(await stateOf("assets", assetId)).toBe("under_review");
    const lost = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'media.anchor_lost' AND entity_id = $1", [assetId]);
    expect(lost.n).toBe(1);
    const frozen = await one<{ position: number }>(t.pool, "SELECT f.position FROM snapshot_figures f JOIN content_snapshots s ON s.id = f.snapshot_id WHERE s.version_label = 'gov-1'");
    expect(frozen.position).toBe(1);
  });

  it("requires a quote of its own for each citation of a multi-source claim (knowledge-06)", async () => {
    const s2 = await newSource("Second dyeing treatise");
    await move(curatorA, "source", s2, "under_review");
    const tool = (await createConcept(t.pool, curatorA, { packageSlug: "gov", type: "tool", name: "block", categoryCode: "tools", title: "Block", provenanceKind: "historical_documentation", localTerms: [] })).id;
    await saveClaims(t.pool, curatorA, tool, [claim("Blocks are carved from teak.", [{ sourceId: s1 }, { sourceId: s2 }])]);
    expect((await citationProblems(t.pool, "concept", tool)).map((p) => p.code)).toEqual(["claim_no_quote"]);
    await saveClaims(t.pool, curatorA, tool, [
      claim("Blocks are carved from teak.", [
        { sourceId: s1, quote: "blocks are carved from seasoned teak" },
        { sourceId: s2, quote: "the carver works the teak block" },
      ]),
    ]);
    expect(await citationProblems(t.pool, "concept", tool)).toEqual([]);
    await saveClaims(t.pool, curatorA, tool, [claim("Blocks are carved from teak.", [{ sourceId: s1 }, { sourceId: s2 }])]);
    expect(await citationProblems(t.pool, "concept", tool)).toEqual([]);
    await saveClaims(t.pool, curatorA, tool, [claim("Blocks are carved from teak.", [{ sourceId: s1, locator: "p. 13" }, { sourceId: s2 }])]);
    expect((await citationProblems(t.pool, "concept", tool)).map((p) => p.code)).toEqual(["claim_no_quote"]);
    await move(curatorA, "concept", tool, "under_review");
    await transition(t.pool, curatorB, { entityKind: "concept", entityId: tool, to: "rejected", reason: "test fixture", evidenceChecked: [] });
  });

  it("loads each citation's own quotation back into the editor and keeps it through a reworded claim (DR-114)", async () => {
    const s2 = await newSource("Fourth dyeing treatise");
    await move(curatorA, "source", s2, "under_review");
    const vat = (await createConcept(t.pool, curatorA, { packageSlug: "gov", type: "tool", name: "vat", categoryCode: "tools", title: "Vat", provenanceKind: "historical_documentation", localTerms: [] })).id;
    await saveClaims(t.pool, curatorA, vat, [
      claim("Vats are sunk in the ground.", [
        { sourceId: s1, quote: "the vats are sunk into the floor" },
        { sourceId: s2, quote: "earthen vats set in the ground" },
      ]),
    ]);
    const drafts = claimDraftsOf((await getConcept(t.pool, vat))!.claims);
    expect(drafts[0]!.sources.map((x) => x.quote).sort()).toEqual(["earthen vats set in the ground", "the vats are sunk into the floor"]);
    await saveClaims(t.pool, curatorA, vat, [{ ...drafts[0]!, text: "Vats are set into the ground." }]);
    expect(await citationProblems(t.pool, "concept", vat)).toEqual([]);
    expect(claimDraftsOf((await getConcept(t.pool, vat))!.claims)[0]!.sources.map((x) => x.quote).sort()).toEqual(["earthen vats set in the ground", "the vats are sunk into the floor"]);
    await move(curatorA, "concept", vat, "under_review");
    await transition(t.pool, curatorB, { entityKind: "concept", entityId: vat, to: "rejected", reason: "test fixture", evidenceChecked: [] });
  });

  it("rebuilds the review snapshot from the CMS, attributed and audited, and only when the pipeline changed (DR-114)", async () => {
    expect(await errorCode(rebuildReviewSnapshot(t.pool, editor))).toBe("forbidden");
    const first = await rebuildReviewSnapshot(t.pool, pi);
    const row = await one<{ kind: string; status: string; created_by: string }>(t.pool, "SELECT kind::text AS kind, status::text AS status, created_by FROM content_snapshots WHERE id = $1", [first.id]);
    expect(row).toEqual({ kind: "review", status: "draft", created_by: pi.userId });
    expect(await one(t.pool, "SELECT actor_kind::text AS actor_kind, actor_id FROM audit_log WHERE action = 'snapshot.review_built' AND entity_id = $1", [first.id])).toEqual({ actor_kind: "user", actor_id: pi.userId });
    expect((await rebuildReviewSnapshot(t.pool, pi)).created).toBe(false);
  });

  it("refuses to verify or release a claim citing a source outside the pipeline, and reopens what a leaving source supports (knowledge-03)", async () => {
    const draft = await newSource("Unreviewed notes");
    const dye = (await createConcept(t.pool, curatorA, { packageSlug: "gov", type: "material", name: "madder", categoryCode: "materials", title: "Madder", provenanceKind: "historical_documentation", localTerms: [] })).id;
    await saveClaims(t.pool, curatorA, dye, [claim("Madder gives red.", [{ sourceId: s1, quote: "madder gives a red dye" }, { sourceId: draft, quote: "red from madder root" }])]);
    await move(curatorA, "concept", dye, "under_review");
    const err = await verify(curatorB, "concept", dye).catch((e: CmsError) => e);
    expect(err).toBeInstanceOf(CmsError);
    expect(JSON.stringify((err as CmsError).details)).toContain("claim_source_unusable");
    const readiness = await releaseReadiness(t.pool);
    expect(readiness.refusals.filter((r) => r.code === "REL004").map((r) => r.message)).toEqual([expect.stringMatching(/^1 claim\(s\) cite a source that is draft/)]);
    expect(readiness.pending).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "cited source outside the pipeline", id: draft })]));
    await transition(t.pool, curatorB, { entityKind: "concept", entityId: dye, to: "rejected", reason: "test fixture", evidenceChecked: [] });

    const s3 = await newSource("Third treatise");
    await move(curatorA, "source", s3, "under_review");
    await verify(curatorB, "source", s3);
    const mordant = (await createConcept(t.pool, curatorA, { packageSlug: "gov", type: "material", name: "alum", categoryCode: "materials", title: "Alum", provenanceKind: "historical_documentation", localTerms: [] })).id;
    await saveClaims(t.pool, curatorA, mordant, [claim("Alum fixes the dye.", [{ sourceId: s3 }])]);
    await move(curatorA, "concept", mordant, "under_review");
    await verify(curatorB, "concept", mordant);
    expect(await stateOf("concepts", mordant)).toBe("verified");
    await move(curatorB, "source", s3, "archived");
    expect(await stateOf("concepts", mordant)).toBe("under_review");
    await transition(t.pool, curatorB, { entityKind: "concept", entityId: mordant, to: "rejected", reason: "test fixture", evidenceChecked: [] });
  });

  it("refuses a release whose concepts belong to a tradition outside the pipeline (knowledge-12)", async () => {
    expect((await releaseReadiness(t.pool)).refusals.map((r) => r.code)).not.toContain("REL005");
    await transition(t.pool, curatorB, { entityKind: "tradition", entityId: traditionId, to: "archived", reason: "test: tradition withdrawn", evidenceChecked: [] });
    const readiness = await releaseReadiness(t.pool);
    expect(readiness.ok).toBe(false);
    expect(readiness.refusals.map((r) => r.code)).toContain("REL005");
    expect(readiness.pending).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "concept of a tradition outside the pipeline", id: identityId })]));
    expect(await errorCode(publishRelease(t.pool, pi, { versionLabel: "gov-2", title: "Governance 2", description: null }))).toBe("release_refused");
  });
});
