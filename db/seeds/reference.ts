/**
 * Reference-data seed (idempotent upserts): knowledge categories, relationship types and
 * telemetry event types. Not demo data: real content needs these too.
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { eventTypes, knowledgeCategories, relationshipTypes } from "../schema";
import { EVENT_TYPE_REGISTRY, KNOWLEDGE_CATEGORIES, RELATIONSHIP_TYPES } from "./reference-data";

export async function seedReferenceData(db: NodePgDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(knowledgeCategories)
      .values(KNOWLEDGE_CATEGORIES.map((c, i) => ({ ...c, position: i + 1 })))
      .onConflictDoUpdate({
        target: knowledgeCategories.code,
        set: {
          label: sql`excluded.label`,
          description: sql`excluded.description`,
          templateGroup: sql`excluded.template_group`,
          position: sql`excluded.position`,
        },
      });

    await tx
      .insert(relationshipTypes)
      .values(RELATIONSHIP_TYPES.map((t) => ({ ...t, inverseLabel: t.inverseLabel ?? null })))
      .onConflictDoUpdate({
        target: relationshipTypes.code,
        set: {
          label: sql`excluded.label`,
          inverseLabel: sql`excluded.inverse_label`,
          description: sql`excluded.description`,
          semantics: sql`excluded.semantics`,
          directed: sql`excluded.directed`,
          allowsCycles: sql`excluded.allows_cycles`,
          ordered: sql`excluded.ordered`,
          requiresEvidence: sql`excluded.requires_evidence`,
          isCore: sql`excluded.is_core`,
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(eventTypes)
      .values(
        EVENT_TYPE_REGISTRY.map((e) => ({
          code: e.code,
          label: e.label,
          description: e.description,
          analyticConcept: e.analyticConcept,
          scope: e.scope,
          requirementRefs: [...e.requirementRefs],
          isTechnical: "isTechnical" in e ? e.isTechnical : false,
        })),
      )
      .onConflictDoUpdate({
        target: eventTypes.code,
        set: {
          label: sql`excluded.label`,
          description: sql`excluded.description`,
          analyticConcept: sql`excluded.analytic_concept`,
          scope: sql`excluded.scope`,
          requirementRefs: sql`excluded.requirement_refs`,
          isTechnical: sql`excluded.is_technical`,
        },
      });
  });
}
