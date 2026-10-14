/**
 * Relationship-type registry for validation. The registry itself is the reference data that
 * seeds `relationship_types` (db/seeds/reference-data.ts, typed by
 * `RelationshipTypeDefinition` from the contracts); it is reused here, not copied, so the
 * validator and the database always agree on semantics, direction, ordering and cycle rules.
 *
 * On top of the registry, the validator applies two policies from the master directive
 * (§6.4–6.5) that the registry rows cannot express:
 *
 *  - PRECEDES allows cycles in the registry because real process content has repeat loops,
 *    but a PRECEDES cycle is accepted only when one of its edges is an explicitly marked
 *    loop: an edge with no ordinal whose `conditions` names a loop/repeat.
 *  - DEPENDS_ON and REQUIRES together form the dependency graph, which must be acyclic: a
 *    mutual requirement makes a process unrealisable (REQUIRES alone allows cycles in the
 *    registry, so this is checked across both types here).
 */
import { RELATIONSHIP_TYPES } from "@db/seeds/reference-data";
import type { RelationshipTypeDefinition } from "@/features/knowledge/contracts";
import type { RelationshipSemantics } from "@/lib/validation/enums";

export type { RelationshipTypeDefinition };

export interface RelationshipTypeRegistry {
  get(code: string): RelationshipTypeDefinition | undefined;
  all(): readonly RelationshipTypeDefinition[];
}

export function createRegistry(types: readonly RelationshipTypeDefinition[]): RelationshipTypeRegistry {
  const byCode = new Map(types.map((t) => [t.code, t]));
  const sorted = [...types].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { get: (code) => byCode.get(code), all: () => sorted };
}

/** The registry seeded into `relationship_types` (14 FORMAT v1 core types + ASSOCIATED_WITH). */
export const DEFAULT_REGISTRY: RelationshipTypeRegistry = createRegistry(RELATIONSHIP_TYPES);

/** Types whose union must stay acyclic (process dependency graph). */
export const DEPENDENCY_TYPES: readonly string[] = ["DEPENDS_ON", "REQUIRES"];

/** The ordered sequential type whose ordinals form process chains. */
export const SEQUENCE_TYPE = "PRECEDES";

/** The type that FORMAT.md reserves for direct evidence. */
export const DIRECT_CAUSAL_TYPE = "CAUSES";

/** `conditions` text that marks an unordinalled PRECEDES edge as an intentional loop. */
export const LOOP_MARKER = /\b(loop|loops|repeat|repeats|repeated|cycle|cycles)\b/i;

export function isMarkedLoop(rel: { type: string; ordinal: number | null; conditions: string | null }): boolean {
  return rel.type === SEQUENCE_TYPE && rel.ordinal == null && rel.conditions != null && LOOP_MARKER.test(rel.conditions);
}

/**
 * Wording that belongs to a different semantics class than the relationship's type.
 * Used by the never-collapse check (warning only: the wording is a heuristic signal).
 */
export const SEMANTIC_WORDING: Partial<Record<RelationshipSemantics, RegExp>> = {
  causal: /\b(causes|caused by|leads to|led to|results in|resulted in|is responsible for|brings about)\b/i,
  associative: /\b(is associated with|are associated with|associated with|correlat\w*|is linked to|are linked to|coincides? with)\b/i,
};
