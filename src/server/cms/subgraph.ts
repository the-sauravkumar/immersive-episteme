/**
 * Subgraph views for the relationship editor (pure).
 *  - tradition: only concepts of that tradition/package and the edges among them;
 *  - types / states: only edges of those relationship types / review states;
 *  - focus + depth: the neighbourhood (both directions) of one concept, across traditions.
 */
import type { GraphEdge, GraphNode } from "./queries";

export interface SubgraphFilter {
  tradition?: string;
  types?: readonly string[];
  states?: readonly string[];
  focus?: string;
  depth?: number;
}

export function subgraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[], f: SubgraphFilter): { nodes: GraphNode[]; edges: GraphEdge[] } {
  let es = edges.filter((e) => (!f.types?.length || f.types.includes(e.type)) && (!f.states?.length || f.states.includes(e.state)));
  if (f.focus && nodes.some((n) => n.id === f.focus)) {
    const depth = Math.min(Math.max(f.depth ?? 1, 1), 4);
    const reached = new Set([f.focus]);
    let frontier = new Set([f.focus]);
    for (let d = 0; d < depth; d++) {
      const next = new Set<string>();
      for (const e of es) {
        if (frontier.has(e.source) && !reached.has(e.target)) next.add(e.target);
        if (frontier.has(e.target) && !reached.has(e.source)) next.add(e.source);
      }
      for (const n of next) reached.add(n);
      frontier = next;
    }
    es = es.filter((e) => reached.has(e.source) && reached.has(e.target));
    return { nodes: nodes.filter((n) => reached.has(n.id)), edges: es };
  }
  const ns = f.tradition ? nodes.filter((n) => n.tradition === f.tradition) : [...nodes];
  const ids = new Set(ns.map((n) => n.id));
  return { nodes: ns, edges: es.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}
