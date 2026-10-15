/**
 * Which concepts a learner may open in the 2D condition: the same scope the spatial compiler
 * gives the 3D museum (src/features/spatial/compiler/graph.ts `selectScope`), so both conditions
 * expose the same concepts for a study's tradition set:
 *  - every concept of a selected tradition;
 *  - shared concepts (no tradition, not a comparison) reachable from a selected tradition's
 *    concepts through other shared concepts;
 *  - tradition-less comparison concepts that compare concepts of at least `minCompareTraditions`
 *    selected traditions: the `minTraditions` of the comparison-zone rule in the rule set of the
 *    study's pinned manifest, read by the learning context (`ctx.scope`) with the compiler's own
 *    helper (comparisonMinTraditions), so both conditions use the same value.
 * Concepts of traditions outside the study are never linked or served (404).
 *
 * Pure: lookups are injected, so this runs over the read model on the server and over a
 * fixture view in tests.
 */
import type { ConceptRef } from "@/features/knowledge/read/view";

export interface ScopeLookups {
  /** Concept keys a comparison compares (as refs). */
  comparesOf(conceptId: string): Promise<ConceptRef[]>;
  /** Neighbours of a concept over any relationship. */
  neighboursOf(conceptId: string): Promise<ConceptRef[]>;
}

export interface ScopeChecker {
  readonly traditionSlugs: ReadonlySet<string>;
  isAccessible(concept: ConceptRef): Promise<boolean>;
}

export function createScopeChecker(traditionSlugs: readonly string[], lookups: ScopeLookups, rules: { minCompareTraditions: number }): ScopeChecker {
  const allowed = new Set(traditionSlugs);
  const memo = new Map<string, Promise<boolean>>();

  const comparisonInScope = async (c: ConceptRef) => {
    const compared = await lookups.comparesOf(c.id);
    const traditions = new Set(compared.filter((x) => x.traditionSlug && allowed.has(x.traditionSlug)).map((x) => x.traditionSlug));
    return traditions.size >= rules.minCompareTraditions;
  };

  // Breadth-first over shared (tradition-less, non-comparison) concepts until a selected
  // tradition's concept is found.
  const sharedReachable = async (start: ConceptRef) => {
    const seen = new Set([start.id]);
    let frontier = [start];
    while (frontier.length > 0) {
      const next: ConceptRef[] = [];
      for (const c of frontier) {
        for (const n of await lookups.neighboursOf(c.id)) {
          if (n.traditionSlug && allowed.has(n.traditionSlug)) return true;
          if (n.traditionSlug === null && n.type !== "comparison" && !seen.has(n.id)) {
            seen.add(n.id);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return false;
  };

  const decide = async (c: ConceptRef): Promise<boolean> => {
    if (c.traditionSlug !== null) return allowed.has(c.traditionSlug);
    if (c.type === "comparison") return comparisonInScope(c);
    return sharedReachable(c);
  };

  return {
    traditionSlugs: allowed,
    isAccessible(c) {
      let hit = memo.get(c.id);
      if (!hit) {
        hit = decide(c);
        memo.set(c.id, hit);
      }
      return hit;
    },
  };
}

/** Keeps the items whose concept is accessible, in order. */
export async function filterAccessible<T>(checker: ScopeChecker, items: readonly T[], conceptOf: (item: T) => ConceptRef | ConceptRef[]): Promise<T[]> {
  const keep = await Promise.all(
    items.map(async (item) => {
      const cs = conceptOf(item);
      const list = Array.isArray(cs) ? cs : [cs];
      return (await Promise.all(list.map((c) => checker.isAccessible(c)))).every(Boolean);
    }),
  );
  return items.filter((_, i) => keep[i]);
}
