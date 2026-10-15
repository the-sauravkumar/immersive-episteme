/**
 * Knowledge authoring services: traditions, sources, concepts, claims, curator notes and
 * relationships. Every function checks its permission (ensure), writes in one actor transaction
 * (inActorTx: the review triggers record who changed what) and appends an audit_log row.
 *
 * Rules implemented here (on top of the database triggers of migrations 0003/0005):
 *  - New content starts as `draft`; only the review workflow (./workflow.ts) changes states.
 *  - Claims-only learner text: `summary` and `body_md` are always regenerated from the claims
 *    (deriveLearnerText), never taken from a form.
 *  - Real content only: the CMS never creates demo rows (is_demo stays false).
 *  - Editing accepted content returns it to review: traditions/concepts/relationships by trigger
 *    (0005 ie_return_edited_to_review, ie_evidence_changed); sources here (no trigger exists).
 *
 * Not `server-only` (integration tests call these with their own pool).
 */
import type { Pool } from "pg";
import type { z } from "zod";

import { slugFromConceptKey } from "@/features/knowledge/contracts";

import { audit, CmsError, ensure, inActorTx, setChangeReason, type Actor, type Q } from "./core";
import { sanitizeDoc } from "./rich-text";
import type {
  cmsClaimSchema,
  conceptCreateSchema,
  conceptUpdateSchema,
  relationshipSchema,
  sourceSchema,
  traditionSchema,
  traditionSourceSchema,
} from "./schemas";

/** The CMS's own content package: holds sources authored in the CMS (local keys C1, C2, ...). */
export const CMS_PACKAGE_SLUG = "cms";

const ACCEPTED = new Set(["verified", "published"]);

// ---------------------------------------------------------------------------------------
// Learner text from claims (content/FORMAT.md "Learner-facing text is built from claims only")
// ---------------------------------------------------------------------------------------

/**
 * Same rule as the curation tool and the validator (deriveProseFromClaims in
 * src/features/knowledge/graph/validate.ts): summary = first claim; body = every claim followed by
 * its source ids in brackets, claims separated by blank lines. Source ids are the file-local
 * ids (sources.local_key), exactly as the importer stores imported concepts.
 */
export function deriveLearnerText(claims: readonly { text: string; sourceKeys: readonly string[] }[]): { summary: string; bodyMd: string } {
  const texts = claims.map((c) => c.text.trim());
  return {
    summary: texts[0] ?? "",
    bodyMd: texts.map((t, i) => `${t} [${claims[i]!.sourceKeys.join(", ")}]`).join("\n\n"),
  };
}

// ---------------------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------------------

async function cmsPackageId(q: Q): Promise<string> {
  const r = await q.query<{ id: string }>(
    `INSERT INTO content_packages (slug, kind, name, summary)
     VALUES ($1, 'cms', 'CMS-authored sources', 'Sources entered through the CMS (not from content/ files).')
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
    [CMS_PACKAGE_SLUG],
  );
  return r.rows[0]!.id;
}

// ---------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------

type SourceInput = z.infer<typeof sourceSchema>;
const SOURCE_FIELDS = ["kind", "title", "author", "publisher", "year", "url", "accessedOn", "reliability", "citation", "notes"] as const;

export async function saveSource(pool: Pool, actor: Actor, input: SourceInput): Promise<{ id: string; created: boolean; returnedToReview: boolean }> {
  ensure(actor, input.sourceId ? "content.edit" : ["content.draft", "content.edit"]);
  return inActorTx(pool, actor, null, async (c) => {
    const values = [input.kind, input.title, input.author, input.publisher, input.year, input.url, input.accessedOn, input.reliability, input.citation, input.notes];
    if (!input.sourceId) {
      const pkg = await cmsPackageId(c);
      await c.query("SELECT pg_advisory_xact_lock(hashtext('cms-source-local-key'))");
      const n = await c.query<{ next: number }>(
        `SELECT coalesce(max(substring(local_key FROM '^C([0-9]+)$')::int), 0) + 1 AS next FROM sources WHERE package_id = $1`,
        [pkg],
      );
      const localKey = `C${n.rows[0]!.next}`;
      const r = await c.query<{ id: string }>(
        `INSERT INTO sources (package_id, local_key, kind, title, author, publisher, year, url, accessed_on, reliability, citation, notes, verification_state, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13, $13) RETURNING id`,
        [pkg, localKey, ...values, actor.userId],
      );
      const id = r.rows[0]!.id;
      await audit(c, actor, { action: "cms.source.created", entity: "sources", entityId: id, after: { ...pick(input), localKey } });
      return { id, created: true, returnedToReview: false };
    }
    const before = await c.query<Record<string, unknown>>(
      `SELECT kind, title, author, publisher, year, url, to_char(accessed_on, 'YYYY-MM-DD') AS "accessedOn", reliability, citation, notes, verification_state, is_demo
         FROM sources WHERE id = $1 FOR UPDATE`,
      [input.sourceId],
    );
    const row = before.rows[0];
    if (!row) throw new CmsError("not_found", "Source not found", 404);
    if (row.is_demo) throw new CmsError("demo_readonly", "Demo sources are seeded fixtures and cannot be edited here", 409);
    const after = pick(input);
    const changed = SOURCE_FIELDS.some((f) => (row[f] ?? null) !== (after[f] ?? null));
    if (!changed) return { id: input.sourceId, created: false, returnedToReview: false };
    const back = ACCEPTED.has(String(row.verification_state));
    if (back) await setChangeReason(c, "returned to review: an accepted source was edited");
    await c.query(
      `UPDATE sources SET kind = $2, title = $3, author = $4, publisher = $5, year = $6, url = $7, accessed_on = $8, reliability = $9, citation = $10, notes = $11,
              updated_by = $12, verification_state = CASE WHEN $13 THEN 'under_review'::verification_state ELSE verification_state END
        WHERE id = $1`,
      [input.sourceId, ...values, actor.userId, back],
    );
    await audit(c, actor, { action: "cms.source.updated", entity: "sources", entityId: input.sourceId, before: strip(row), after, reason: back ? "accepted source edited: returned to review" : null });
    return { id: input.sourceId, created: false, returnedToReview: back };
  });
}

function pick(input: SourceInput): Record<(typeof SOURCE_FIELDS)[number], unknown> {
  return Object.fromEntries(SOURCE_FIELDS.map((f) => [f, input[f] ?? null])) as Record<(typeof SOURCE_FIELDS)[number], unknown>;
}

function strip(row: Record<string, unknown>): Record<string, unknown> {
  const { is_demo: _d, ...rest } = row;
  return rest;
}

// ---------------------------------------------------------------------------------------
// Traditions
// ---------------------------------------------------------------------------------------

type TraditionInput = z.infer<typeof traditionSchema>;

export async function saveTradition(pool: Pool, actor: Actor, input: TraditionInput): Promise<{ id: string; created: boolean }> {
  ensure(actor, input.traditionId ? "content.edit" : ["content.draft", "content.edit"]);
  if (input.slug.startsWith("demo")) throw new CmsError("demo_reserved", "Slugs starting with 'demo' are reserved for demo fixtures");
  const fields = [
    input.name, input.altNames, input.regionPlace, input.regionDistrict, input.regionState, input.regionCountry,
    input.latitude, input.longitude, input.giRegistered, input.giApplicationNo, input.giYear,
  ];
  return inActorTx(pool, actor, null, async (c) => {
    if (!input.traditionId) {
      const pkg = await c.query<{ id: string }>(
        `INSERT INTO content_packages (slug, kind, name, alt_names) VALUES ($1, 'tradition', $2, $3::text[]) RETURNING id`,
        [input.slug, input.name, input.altNames],
      );
      const r = await c.query<{ id: string }>(
        `INSERT INTO traditions (package_id, slug, name, alt_names, region_place, region_district, region_state, region_country, latitude, longitude,
                                 gi_registered, gi_application_no, gi_year, verification_state, created_by, updated_by)
         VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', $14, $14) RETURNING id`,
        [pkg.rows[0]!.id, input.slug, ...fields, actor.userId],
      );
      const id = r.rows[0]!.id;
      await audit(c, actor, { action: "cms.tradition.created", entity: "traditions", entityId: id, after: input });
      return { id, created: true };
    }
    const before = await c.query<Record<string, unknown>>("SELECT * FROM traditions WHERE id = $1 FOR UPDATE", [input.traditionId]);
    const row = before.rows[0];
    if (!row) throw new CmsError("not_found", "Tradition not found", 404);
    if (row.is_demo) throw new CmsError("demo_readonly", "Demo traditions cannot be edited here", 409);
    if (row.slug !== input.slug) throw new CmsError("slug_immutable", "A tradition's slug is part of every concept key and cannot change");
    await c.query(
      `UPDATE traditions SET name = $2, alt_names = $3::text[], region_place = $4, region_district = $5, region_state = $6, region_country = $7,
              latitude = $8, longitude = $9, gi_registered = $10, gi_application_no = $11, gi_year = $12, updated_by = $13
        WHERE id = $1`,
      [input.traditionId, ...fields, actor.userId],
    );
    await audit(c, actor, { action: "cms.tradition.updated", entity: "traditions", entityId: input.traditionId, before: row, after: input });
    return { id: input.traditionId, created: false };
  });
}

export async function setTraditionSource(pool: Pool, actor: Actor, input: z.infer<typeof traditionSourceSchema>): Promise<void> {
  ensure(actor, "content.edit");
  await inActorTx(pool, actor, null, async (c) => {
    if (input.remove) {
      await c.query("DELETE FROM tradition_sources WHERE tradition_id = $1 AND source_id = $2 AND purpose = $3", [input.traditionId, input.sourceId, input.purpose]);
    } else {
      await c.query(
        "INSERT INTO tradition_sources (tradition_id, source_id, purpose) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [input.traditionId, input.sourceId, input.purpose],
      );
    }
    // A change of the evidence behind an accepted tradition sends it back to review.
    const t = await c.query<{ verification_state: string }>("SELECT verification_state FROM traditions WHERE id = $1", [input.traditionId]);
    if (t.rows[0] && ACCEPTED.has(t.rows[0].verification_state)) {
      await setChangeReason(c, "returned to review: tradition evidence changed");
      await c.query("UPDATE traditions SET verification_state = 'under_review', updated_by = $2 WHERE id = $1", [input.traditionId, actor.userId]);
    }
    await audit(c, actor, {
      action: input.remove ? "cms.tradition.source_removed" : "cms.tradition.source_added",
      entity: "traditions",
      entityId: input.traditionId,
      after: { sourceId: input.sourceId, purpose: input.purpose },
    });
  });
}

// ---------------------------------------------------------------------------------------
// Concepts and claims
// ---------------------------------------------------------------------------------------

export async function createConcept(pool: Pool, actor: Actor, input: z.infer<typeof conceptCreateSchema>): Promise<{ id: string; key: string }> {
  ensure(actor, ["content.draft", "content.edit"]);
  if (input.packageSlug.startsWith("demo")) throw new CmsError("demo_reserved", "Demo packages are fixtures; the CMS authors real content only");
  const key = `${input.packageSlug}.${input.type}.${input.name}`;
  return inActorTx(pool, actor, null, async (c) => {
    const pkg = await c.query<{ id: string; kind: string }>("SELECT id, kind FROM content_packages WHERE slug = $1 AND NOT is_demo", [input.packageSlug]);
    if (!pkg.rows[0]) throw new CmsError("unknown_package", `No tradition or package "${input.packageSlug}"`, 404);
    if (pkg.rows[0].kind === "cms") throw new CmsError("wrong_package", "The cms package holds sources only; choose a tradition or the shared package");
    const t = await c.query<{ id: string }>("SELECT id FROM traditions WHERE slug = $1 AND NOT is_demo", [input.packageSlug]);
    const r = await c.query<{ id: string }>(
      `INSERT INTO concepts (key, slug, type, category_code, tradition_id, package_id, title, summary, local_terms, provenance_kind, verification_state, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8::text[], $9, 'draft', $10, $10) RETURNING id`,
      [key, slugFromConceptKey(key), input.type, input.categoryCode, t.rows[0]?.id ?? null, pkg.rows[0].id, input.title, input.localTerms, input.provenanceKind, actor.userId],
    );
    const id = r.rows[0]!.id;
    await audit(c, actor, { action: "cms.concept.created", entity: "concepts", entityId: id, after: { key, ...input } });
    return { id, key };
  });
}

export async function updateConcept(pool: Pool, actor: Actor, input: z.infer<typeof conceptUpdateSchema>): Promise<void> {
  ensure(actor, "content.edit");
  await inActorTx(pool, actor, null, async (c) => {
    const b = await c.query<Record<string, unknown>>(
      "SELECT key, type, category_code, title, local_terms, compares, provenance_kind, verification_state, is_demo FROM concepts WHERE id = $1 FOR UPDATE",
      [input.conceptId],
    );
    const row = b.rows[0];
    if (!row) throw new CmsError("not_found", "Concept not found", 404);
    if (row.is_demo) throw new CmsError("demo_readonly", "Demo concepts cannot be edited here", 409);
    if (input.compares.length > 0 && row.type !== "comparison") throw new CmsError("invalid_compares", "Only comparison concepts list compared concepts");
    await c.query(
      `UPDATE concepts SET category_code = $2, title = $3, local_terms = $4::text[], compares = $5::text[], provenance_kind = $6, updated_by = $7 WHERE id = $1`,
      [input.conceptId, input.categoryCode, input.title, input.localTerms, input.compares, input.provenanceKind, actor.userId],
    );
    await audit(c, actor, { action: "cms.concept.updated", entity: "concepts", entityId: input.conceptId, before: strip(row), after: input });
  });
}

/**
 * Replaces the concept's claims (positions 0..n-1) and their citations, then regenerates the
 * learner-facing summary/body from them. The quote and every locator are required (schemas.ts).
 */
export async function saveClaims(pool: Pool, actor: Actor, conceptId: string, claims: readonly z.infer<typeof cmsClaimSchema>[]): Promise<{ summary: string }> {
  ensure(actor, "content.edit");
  return inActorTx(pool, actor, null, async (c) => {
    const b = await c.query<{ is_demo: boolean; verification_state: string }>("SELECT is_demo, verification_state FROM concepts WHERE id = $1 FOR UPDATE", [conceptId]);
    if (!b.rows[0]) throw new CmsError("not_found", "Concept not found", 404);
    if (b.rows[0].is_demo) throw new CmsError("demo_readonly", "Demo concepts cannot be edited here", 409);
    const sourceIds = [...new Set(claims.flatMap((cl) => cl.sources.map((s) => s.sourceId)))];
    const src = await c.query<{ id: string; local_key: string | null; is_demo: boolean; verification_state: string }>(
      "SELECT id, local_key, is_demo, verification_state FROM sources WHERE id = ANY($1::uuid[])",
      [sourceIds],
    );
    const byId = new Map(src.rows.map((s) => [s.id, s]));
    for (const id of sourceIds) {
      const s = byId.get(id);
      if (!s || s.is_demo) throw new CmsError("unknown_source", `Source ${id} does not exist`, 404);
      if (s.verification_state === "rejected" || s.verification_state === "archived") {
        throw new CmsError("unusable_source", `Source ${s.local_key ?? id} is ${s.verification_state} and cannot be cited`);
      }
    }
    const before = await c.query("SELECT position, text, quote FROM concept_claims WHERE concept_id = $1 ORDER BY position", [conceptId]);
    if (ACCEPTED.has(b.rows[0].verification_state)) await setChangeReason(c, "returned to review: the claims of an accepted concept changed");
    // Located evidence passages (imported from content/) support a claim's exact wording: keep them
    // for a citation whose claim text and source are unchanged; a reworded claim loses them and
    // must be evidenced again.
    const kept = await c.query<{ text: string; source_id: string; evidence: unknown }>(
      `SELECT cc.text, cs.source_id::text AS source_id, cs.evidence
         FROM concept_claims cc JOIN concept_claim_sources cs ON cs.claim_id = cc.id
        WHERE cc.concept_id = $1 AND jsonb_array_length(cs.evidence) > 0`,
      [conceptId],
    );
    const evidenceFor = new Map(kept.rows.map((k) => [`${k.text}|${k.source_id}`, JSON.stringify(k.evidence)]));
    await c.query("DELETE FROM concept_claims WHERE concept_id = $1", [conceptId]);
    for (const [i, cl] of claims.entries()) {
      const r = await c.query<{ id: string }>("INSERT INTO concept_claims (concept_id, position, text, quote) VALUES ($1, $2, $3, $4) RETURNING id", [conceptId, i, cl.text, cl.quote]);
      for (const s of cl.sources) {
        await c.query("INSERT INTO concept_claim_sources (claim_id, source_id, locator, evidence) VALUES ($1, $2, $3, $4::jsonb)", [
          r.rows[0]!.id,
          s.sourceId,
          s.locator,
          evidenceFor.get(`${cl.text}|${s.sourceId}`) ?? "[]",
        ]);
      }
    }
    const derived = deriveLearnerText(claims.map((cl) => ({ text: cl.text, sourceKeys: cl.sources.map((s) => byId.get(s.sourceId)!.local_key ?? s.sourceId) })));
    await c.query("UPDATE concepts SET summary = $2, body_md = $3, updated_by = $4 WHERE id = $1", [conceptId, derived.summary, derived.bodyMd, actor.userId]);
    await audit(c, actor, {
      action: "cms.concept.claims_saved",
      entity: "concepts",
      entityId: conceptId,
      before: { claims: before.rows },
      after: { claims, summary: derived.summary },
    });
    return { summary: derived.summary };
  });
}

/**
 * Curator notes (Tiptap JSON, sanitised) in `concepts.body`. Never published to learners
 * (bundle body is always null). Saving notes never returns an accepted concept to review:
 * migration 0015 excludes `body` from ie_return_edited_to_review, because notes are not
 * learner-facing.
 */
export async function saveCuratorNotes(pool: Pool, actor: Actor, conceptId: string, rawDoc: unknown): Promise<{ returnedToReview: boolean }> {
  ensure(actor, ["content.edit", "content.review"]);
  const doc = sanitizeDoc(rawDoc);
  return inActorTx(pool, actor, "curator notes edited", async (c) => {
    const b = await c.query<{ body: unknown; is_demo: boolean; verification_state: string }>("SELECT body, is_demo, verification_state FROM concepts WHERE id = $1 FOR UPDATE", [conceptId]);
    if (!b.rows[0]) throw new CmsError("not_found", "Concept not found", 404);
    if (b.rows[0].is_demo) throw new CmsError("demo_readonly", "Demo concepts cannot be edited here", 409);
    await c.query("UPDATE concepts SET body = $2::jsonb, updated_by = $3 WHERE id = $1", [conceptId, JSON.stringify(doc), actor.userId]);
    const after = await c.query<{ verification_state: string }>("SELECT verification_state FROM concepts WHERE id = $1", [conceptId]);
    await audit(c, actor, { action: "cms.concept.notes_saved", entity: "concepts", entityId: conceptId, before: { body: b.rows[0].body }, after: { body: doc } });
    return { returnedToReview: after.rows[0]!.verification_state !== b.rows[0].verification_state };
  });
}

// ---------------------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------------------

type RelationshipInput = z.infer<typeof relationshipSchema>;

export async function saveRelationship(pool: Pool, actor: Actor, input: RelationshipInput): Promise<{ id: string; created: boolean }> {
  ensure(actor, "graph.edit");
  return inActorTx(pool, actor, null, async (c) => {
    const type = await c.query<{ code: string; ordered: boolean; requires_evidence: boolean }>("SELECT code, ordered, requires_evidence FROM relationship_types WHERE code = $1", [input.typeCode]);
    if (!type.rows[0]) throw new CmsError("unknown_type", `Relationship type ${input.typeCode} is not in the registry`);
    if (input.ordinal !== null && !type.rows[0].ordered) throw new CmsError("ordinal_unordered", `${input.typeCode} does not take an ordinal`);
    const ends = await c.query<{ id: string; package_id: string | null; is_demo: boolean; verification_state: string }>(
      "SELECT id, package_id, is_demo, verification_state FROM concepts WHERE id = ANY($1::uuid[])",
      [[input.sourceConceptId, input.targetConceptId]],
    );
    const src = ends.rows.find((r) => r.id === input.sourceConceptId);
    const tgt = ends.rows.find((r) => r.id === input.targetConceptId);
    if (!src || !tgt || src.is_demo || tgt.is_demo) throw new CmsError("unknown_concept", "Both endpoints must be existing (non-demo) concepts", 404);
    for (const e of [src, tgt]) {
      if (e.verification_state === "rejected" || e.verification_state === "archived") throw new CmsError("unusable_concept", `An endpoint is ${e.verification_state}`);
    }
    const cited = input.sources.map((s) => s.sourceId);
    if (new Set(cited).size !== cited.length) throw new CmsError("duplicate_citation", "Cite each source once");
    if (cited.length) {
      const ok = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM sources WHERE id = ANY($1::uuid[]) AND NOT is_demo AND verification_state NOT IN ('rejected','archived')", [cited]);
      if (ok.rows[0]!.n !== cited.length) throw new CmsError("unknown_source", "A cited source does not exist or cannot be cited", 404);
    }
    const fields = [input.sourceConceptId, input.targetConceptId, input.typeCode, input.explanation, input.conditions, input.strength, input.ordinal, input.provenanceKind];
    let id: string;
    let created = false;
    let before: unknown = null;
    if (!input.relationshipId) {
      const r = await c.query<{ id: string }>(
        `INSERT INTO relationships (source_concept_id, target_concept_id, type_code, explanation, conditions, strength, ordinal, provenance_kind, package_id, verification_state, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $10) RETURNING id`,
        [...fields, src.package_id, actor.userId],
      );
      id = r.rows[0]!.id;
      created = true;
    } else {
      const b = await c.query<Record<string, unknown>>("SELECT * FROM relationships WHERE id = $1 FOR UPDATE", [input.relationshipId]);
      if (!b.rows[0]) throw new CmsError("not_found", "Relationship not found", 404);
      if (b.rows[0].is_demo) throw new CmsError("demo_readonly", "Demo relationships cannot be edited here", 409);
      before = { ...b.rows[0], sources: (await c.query("SELECT source_id, locator, quote FROM relationship_sources WHERE relationship_id = $1", [input.relationshipId])).rows };
      if (ACCEPTED.has(String(b.rows[0].verification_state))) await setChangeReason(c, "returned to review: an accepted relationship was edited");
      await c.query(
        `UPDATE relationships SET source_concept_id = $2, target_concept_id = $3, type_code = $4, explanation = $5, conditions = $6, strength = $7, ordinal = $8,
                provenance_kind = $9, updated_by = $10 WHERE id = $1`,
        [input.relationshipId, ...fields, actor.userId],
      );
      id = input.relationshipId;
    }
    // Replace citations only when they differ (each change re-triggers review of an accepted edge).
    const current = await c.query<{ source_id: string; locator: string | null; quote: string | null }>("SELECT source_id, locator, quote FROM relationship_sources WHERE relationship_id = $1 ORDER BY source_id", [id]);
    const wanted = [...input.sources].sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1));
    const same = current.rows.length === wanted.length && current.rows.every((r, i) => r.source_id === wanted[i]!.sourceId && r.locator === wanted[i]!.locator && r.quote === wanted[i]!.quote);
    if (!same) {
      await c.query("DELETE FROM relationship_sources WHERE relationship_id = $1", [id]);
      for (const s of wanted) {
        await c.query("INSERT INTO relationship_sources (relationship_id, source_id, locator, quote) VALUES ($1, $2, $3, $4)", [id, s.sourceId, s.locator, s.quote]);
      }
    }
    await audit(c, actor, { action: created ? "cms.relationship.created" : "cms.relationship.updated", entity: "relationships", entityId: id, before, after: input });
    return { id, created };
  });
}

/** Deletes a relationship that was never accepted (draft / rejected / needs_evidence / archived). */
export async function deleteRelationship(pool: Pool, actor: Actor, relationshipId: string): Promise<void> {
  ensure(actor, "graph.edit");
  await inActorTx(pool, actor, null, async (c) => {
    const b = await c.query<Record<string, unknown>>("SELECT * FROM relationships WHERE id = $1 FOR UPDATE", [relationshipId]);
    const row = b.rows[0];
    if (!row) throw new CmsError("not_found", "Relationship not found", 404);
    if (row.is_demo) throw new CmsError("demo_readonly", "Demo relationships cannot be edited here", 409);
    if (!["draft", "rejected", "archived"].includes(String(row.verification_state))) {
      throw new CmsError("not_deletable", `A ${String(row.verification_state).replace("_", " ")} relationship cannot be deleted; reject or archive it through review`, 409);
    }
    const used = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM snapshot_items WHERE item_kind = 'relationship' AND entity_ref = $1", [relationshipId]);
    if (used.rows[0]!.n > 0) throw new CmsError("in_snapshot", "This relationship is part of a stored snapshot; archive it instead", 409);
    await c.query("DELETE FROM relationships WHERE id = $1", [relationshipId]);
    await audit(c, actor, { action: "cms.relationship.deleted", entity: "relationships", entityId: relationshipId, before: row });
  });
}
