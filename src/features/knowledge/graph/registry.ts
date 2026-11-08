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

export const DEFAULT_REGISTRY: RelationshipTypeRegistry = createRegistry(RELATIONSHIP_TYPES);

export const DEPENDENCY_TYPES: readonly string[] = ["DEPENDS_ON", "REQUIRES"];

export const SEQUENCE_TYPE = "PRECEDES";

export const DIRECT_CAUSAL_TYPE = "CAUSES";

export const LOOP_MARKER = /\b(loop|loops|repeat|repeats|repeated|cycle|cycles)\b/i;

export function isMarkedLoop(rel: { type: string; ordinal: number | null; conditions: string | null }): boolean {
  return rel.type === SEQUENCE_TYPE && rel.ordinal == null && rel.conditions != null && LOOP_MARKER.test(rel.conditions);
}

export const SEMANTIC_WORDING: Partial<Record<RelationshipSemantics, RegExp>> = {
  causal: /\b(causes|caused by|leads to|led to|results in|resulted in|is responsible for|brings about)\b/i,
  associative: /\b(is associated with|are associated with|associated with|correlat\w*|is linked to|are linked to|coincides? with)\b/i,
};
