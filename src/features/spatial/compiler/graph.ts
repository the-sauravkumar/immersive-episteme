/**
 * Scope selection and graph analysis (pure, no geometry).
 *
 * Scope for a set of selected traditions:
 *   - every concept whose tradition is selected (these MUST all be placed);
 *   - shared concepts (no tradition, not comparisons) linked to an in-scope concept, closed
 *     transitively over shared-to-shared links (e.g. a mechanism depending on another);
 *   - comparison concepts whose `compares` list spans at least `minTraditions` selected
 *     traditions (their `compares` list is filtered to in-scope concepts);
 *   - every relationship whose two endpoints are in scope.
 * Everything else is recorded as out of scope with a reason, never silently dropped.
 */
import { compareStrings } from "./prng";
import type { CompilerGraph, GraphConcept, GraphRelationship } from "./types";

export interface ScopedGraph {
  selectedSlugs: string[];
  missingTraditionSlugs: string[];
  traditionBySlug: Map<string, { id: string; slug: string; name: string }>;
  slugByTraditionId: Map<string, string>;
  concepts: GraphConcept[];
  conceptByKey: Map<string, GraphConcept>;
  conceptById: Map<string, GraphConcept>;
  relationships: GraphRelationship[];
  /** Concepts not in scope, with the reason. */
  outOfScope: { concept: GraphConcept; reason: string }[];
  /** Relationships not in scope, with the reason. */
  relationshipsOutOfScope: { relationship: GraphRelationship; reason: string }[];
  /** Relationship endpoints / compares entries that name concepts missing from the graph. */
  danglingReferences: string[];
  /** Filtered `compares` lists for in-scope comparison concepts. */
  compares: Map<string, string[]>;
  /** Tradition slug of a concept, or null for shared / comparison concepts. */
  slugOf(concept: GraphConcept): string | null;
}

export function selectScope(graph: CompilerGraph, selected: readonly string[], minCompareTraditions: number): ScopedGraph {
  const selectedSlugs = [...new Set(selected)].sort(compareStrings);
  const traditionBySlug = new Map(graph.traditions.map((t) => [t.slug, t]));
  const slugByTraditionId = new Map(graph.traditions.map((t) => [t.id, t.slug]));
  const missingTraditionSlugs = selectedSlugs.filter((s) => !traditionBySlug.has(s));
  const selectedIds = new Set(selectedSlugs.flatMap((s) => (traditionBySlug.get(s) ? [traditionBySlug.get(s)!.id] : [])));

  const allByKey = new Map(graph.concepts.map((c) => [c.key, c]));
  const slugOf = (c: GraphConcept) => (c.traditionId ? (slugByTraditionId.get(c.traditionId) ?? null) : null);
  const danglingReferences: string[] = [];
  for (const r of graph.relationships) {
    for (const k of [r.source, r.target]) {
      if (!allByKey.has(k)) danglingReferences.push(`Relationship ${r.id} (${r.source} -${r.type}-> ${r.target}) references missing concept ${k}`);
    }
  }

  const inScope = new Set<string>();
  for (const c of graph.concepts) if (c.traditionId && selectedIds.has(c.traditionId)) inScope.add(c.key);

  // Shared concepts: transitive closure from in-scope tradition concepts over shared nodes.
  const isShared = (c: GraphConcept) => c.traditionId === null && c.type !== "comparison";
  const adjacency = new Map<string, string[]>();
  for (const r of graph.relationships) {
    if (!allByKey.has(r.source) || !allByKey.has(r.target)) continue;
    (adjacency.get(r.source) ?? adjacency.set(r.source, []).get(r.source)!).push(r.target);
    (adjacency.get(r.target) ?? adjacency.set(r.target, []).get(r.target)!).push(r.source);
  }
  const queue = [...inScope].sort(compareStrings);
  while (queue.length) {
    const k = queue.shift()!;
    for (const n of (adjacency.get(k) ?? []).slice().sort(compareStrings)) {
      const c = allByKey.get(n)!;
      if (!inScope.has(n) && isShared(c)) {
        inScope.add(n);
        queue.push(n);
      }
    }
  }

  // Comparison concepts.
  const compares = new Map<string, string[]>();
  for (const c of graph.concepts) {
    if (c.traditionId !== null || c.type !== "comparison") continue;
    for (const k of c.compares ?? []) {
      if (!allByKey.has(k)) danglingReferences.push(`Comparison ${c.key} compares missing concept ${k}`);
    }
    const kept = (c.compares ?? []).filter((k) => {
      const t = allByKey.get(k);
      return t?.traditionId != null && selectedIds.has(t.traditionId);
    });
    const traditions = new Set(kept.map((k) => allByKey.get(k)!.traditionId));
    if (traditions.size >= minCompareTraditions) {
      inScope.add(c.key);
      compares.set(c.key, [...kept].sort(compareStrings));
    }
  }
  for (const c of graph.concepts) {
    if (inScope.has(c.key) && c.type === "comparison" && !compares.has(c.key)) {
      compares.set(c.key, (c.compares ?? []).filter((k) => inScope.has(k)).sort(compareStrings));
    }
  }

  const concepts = graph.concepts.filter((c) => inScope.has(c.key)).sort((a, b) => compareStrings(a.key, b.key));
  const outOfScope = graph.concepts
    .filter((c) => !inScope.has(c.key))
    .sort((a, b) => compareStrings(a.key, b.key))
    .map((c) => ({
      concept: c,
      reason:
        c.traditionId !== null
          ? `Tradition ${slugOf(c) ?? c.traditionId} is not selected`
          : c.type === "comparison"
            ? `Compares fewer than ${minCompareTraditions} selected traditions`
            : "Shared concept not linked to any selected tradition",
    }));
  const relationships = graph.relationships
    .filter((r) => inScope.has(r.source) && inScope.has(r.target))
    .sort((a, b) => compareStrings(a.id, b.id));
  const relationshipsOutOfScope = graph.relationships
    .filter((r) => !(inScope.has(r.source) && inScope.has(r.target)))
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((r) => ({
      relationship: r,
      reason: !allByKey.has(r.source) || !allByKey.has(r.target) ? "Endpoint concept missing from the snapshot" : "Endpoint concept out of scope",
    }));

  return {
    selectedSlugs,
    missingTraditionSlugs,
    traditionBySlug,
    slugByTraditionId,
    concepts,
    conceptByKey: new Map(concepts.map((c) => [c.key, c])),
    conceptById: new Map(concepts.map((c) => [c.id, c])),
    relationships,
    outOfScope,
    relationshipsOutOfScope,
    danglingReferences: [...new Set(danglingReferences)].sort(compareStrings),
    compares,
    slugOf,
  };
}

// -----------------------------------------------------------------------------------------
// Process ordering (PRECEDES chains)
// -----------------------------------------------------------------------------------------

export interface Chain {
  /** Stable id: key of the first concept in order. */
  id: string;
  /** Concept keys in traversal order. */
  order: string[];
  /** Every sequence link of the chain (including accepted loop-backs). */
  relationshipIds: string[];
  /** Declared repeat loops: ordinal-less links from a later stage back to an earlier one. */
  loopBacks: { relationshipId: string; from: string; to: string }[];
  /** "ordinal": ordered by ordinals 1..n; "topological": derived (no ordinals). */
  orderSource: "ordinal" | "topological";
  errors: string[];
  warnings: string[];
}

/**
 * Group sequence links into chains and check their ordering.
 *
 * Errors: a cycle (other than an accepted loop-back), duplicate ordinals, a gap in 1..n, a
 * break in continuity (edge k does not start where edge k-1 ended), a node visited twice by
 * the ordinal chain, or ordinal-less links that are not loop-backs in a partly ordered chain.
 * Accepted loop-back (warning): when the type allows cycles (relationship-type registry) and
 * the ordinals form a valid chain, an ordinal-less link from a later stage back to an earlier
 * one is a declared repeat loop (e.g. "repeat for each colour"). It is encoded on the path.
 */
export function analyseChains(
  relationships: readonly GraphRelationship[],
  sequenceTypes: ReadonlySet<string>,
  cyclesAllowed: ReadonlySet<string> = new Set(),
): Chain[] {
  const edges = relationships.filter((r) => sequenceTypes.has(r.type)).sort((a, b) => compareStrings(a.id, b.id));
  // Undirected components (union-find, smaller key is the root).
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = x;
    while (parent.has(p) && parent.get(p) !== p) p = parent.get(p)!;
    return p;
  };
  for (const e of edges) {
    const a = find(e.source);
    const b = find(e.target);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const groups = new Map<string, GraphRelationship[]>();
  for (const e of edges) {
    const root = find(e.source);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(e);
  }

  const chains: Chain[] = [];
  for (const group of groups.values()) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const loopBacks: Chain["loopBacks"] = [];
    const nodes = [...new Set(group.flatMap((e) => [e.source, e.target]))].sort(compareStrings);

    let order: string[] | null = null;
    let orderSource: Chain["orderSource"] = "topological";
    const withOrdinal = group.filter((e) => e.ordinal != null).sort((a, b) => a.ordinal! - b.ordinal! || compareStrings(a.id, b.id));
    const loose = group.filter((e) => e.ordinal == null);
    let acyclicEdges = group;

    if (withOrdinal.length > 0) {
      const ordinalErrors: string[] = [];
      const seen = new Set<number>();
      withOrdinal.forEach((e, i) => {
        if (seen.has(e.ordinal!)) ordinalErrors.push(`Duplicate ordinal ${e.ordinal} (${e.source} -> ${e.target})`);
        seen.add(e.ordinal!);
        if (e.ordinal !== i + 1 && !ordinalErrors.some((m) => m.startsWith("Ordinal gap"))) {
          ordinalErrors.push(`Ordinal gap: expected ${i + 1}, found ${e.ordinal} (${e.source} -> ${e.target})`);
        }
        const prev = withOrdinal[i - 1];
        if (prev && prev.target !== e.source) ordinalErrors.push(`Broken chain at ordinal ${e.ordinal}: ${prev.target} is followed by ${e.source}`);
      });
      errors.push(...ordinalErrors);
      if (ordinalErrors.length === 0) {
        const chainOrder = [withOrdinal[0]!.source, ...withOrdinal.map((e) => e.target)];
        if (new Set(chainOrder).size !== chainOrder.length) {
          errors.push(`Cycle in process ordering: the ordinal chain from ${chainOrder[0]} revisits ${chainOrder.find((k, i) => chainOrder.indexOf(k) !== i)}`);
        } else {
          const pos = new Map(chainOrder.map((k, i) => [k, i]));
          const accepted = new Set<string>();
          for (const e of loose) {
            const ps = pos.get(e.source);
            const pt = pos.get(e.target);
            if (ps !== undefined && pt !== undefined && pt < ps && cyclesAllowed.has(e.type)) {
              accepted.add(e.id);
              loopBacks.push({ relationshipId: e.id, from: e.source, to: e.target });
              warnings.push(`Repeat loop: ${e.source} returns to ${e.target} (accepted; ${e.type} allows cycles)`);
            } else if (ps !== undefined && pt !== undefined && pt < ps) {
              errors.push(`Cycle in process ordering: ${e.source} -> ${e.target} returns to an earlier stage and ${e.type} does not allow cycles`);
            } else {
              errors.push(`Only ${withOrdinal.length} of ${group.length} sequence links from ${chainOrder[0]} carry an ordinal (${e.source} -> ${e.target} has none)`);
            }
          }
          acyclicEdges = group.filter((e) => !accepted.has(e.id));
          order = chainOrder;
          orderSource = "ordinal";
        }
      }
    } else {
      warnings.push(`No ordinals on ${group.length} sequence link(s) from ${nodes[0]}; order derived topologically`);
    }

    // Cycle detection (Kahn) on everything except accepted loop-backs.
    const deg = new Map<string, number>(nodes.map((n) => [n, 0]));
    const out = new Map<string, GraphRelationship[]>();
    for (const e of acyclicEdges) {
      (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
      deg.set(e.target, deg.get(e.target)! + 1);
    }
    const minOrdinal = (n: string) => Math.min(Number.MAX_SAFE_INTEGER, ...(out.get(n) ?? []).map((e) => e.ordinal ?? Number.MAX_SAFE_INTEGER));
    const ready = nodes.filter((n) => deg.get(n) === 0);
    const topo: string[] = [];
    while (ready.length) {
      ready.sort((a, b) => minOrdinal(a) - minOrdinal(b) || compareStrings(a, b));
      const n = ready.shift()!;
      topo.push(n);
      for (const e of out.get(n) ?? []) {
        deg.set(e.target, deg.get(e.target)! - 1);
        if (deg.get(e.target) === 0) ready.push(e.target);
      }
    }
    if (topo.length < nodes.length) {
      const cyclic = nodes.filter((n) => !topo.includes(n));
      if (!errors.some((m) => m.startsWith("Cycle"))) errors.push(`Cycle in process ordering through ${cyclic.join(", ")}`);
      topo.push(...cyclic);
    }
    for (const n of nodes) {
      const o = (out.get(n) ?? []).length;
      const i = acyclicEdges.filter((e) => e.target === n).length;
      if (o > 1) warnings.push(`${n} has ${o} successors (branching sequence)`);
      if (i > 1) warnings.push(`${n} has ${i} predecessors (merging sequence)`);
    }

    const finalOrder = order ?? topo;
    chains.push({
      id: finalOrder[0]!,
      order: [...new Set([...finalOrder, ...topo])],
      relationshipIds: group.map((e) => e.id).sort(compareStrings),
      loopBacks: loopBacks.sort((a, b) => compareStrings(a.relationshipId, b.relationshipId)),
      orderSource,
      errors,
      warnings,
    });
  }
  return chains.sort((a, b) => compareStrings(a.id, b.id));
}
