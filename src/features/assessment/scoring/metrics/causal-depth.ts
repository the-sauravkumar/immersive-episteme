import { cmp, type ScoringConfig } from "../config";
import type { CanonicalEdge } from "../types";

export interface CausalDepthResult {
  depth: number | null;
  path: string[];
  arcs: string[];
  budgetExceeded: boolean;
  steps: number;
}

export function causalArcs(edges: ReadonlyArray<CanonicalEdge>, config: Pick<ScoringConfig, "causalTypes">): Array<[string, string]> {
  const arcs = new Map<string, [string, string]>();
  for (const e of edges) {
    if (!e.directed || e.type === null) continue;
    const orientation = config.causalTypes[e.type];
    if (!orientation) continue;
    const arc: [string, string] = orientation === "forward" ? [e.source, e.target] : [e.target, e.source];
    arcs.set(`${arc[0]}>${arc[1]}`, arc);
  }
  return [...arcs.entries()].sort((a, b) => cmp(a[0], b[0])).map(([, a]) => a);
}

export function longestSimplePath(arcs: ReadonlyArray<[string, string]>, budget: number): CausalDepthResult {
  const adj = new Map<string, string[]>();
  for (const [a, b] of arcs) {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    if (!adj.has(b)) adj.set(b, []);
  }
  for (const list of adj.values()) list.sort(cmp);
  const nodes = [...adj.keys()].sort(cmp);
  let best: string[] = [];
  let steps = 0;
  let exceeded = false;
  const onPath = new Set<string>();
  const path: string[] = [];

  const better = (cand: string[]) => cand.length > best.length || (cand.length === best.length && cand.join("\u0000") < best.join("\u0000"));

  const dfs = (n: string): void => {
    if (exceeded) return;
    if (++steps > budget) {
      exceeded = true;
      return;
    }
    onPath.add(n);
    path.push(n);
    if (better(path)) best = [...path];
    for (const m of adj.get(n) ?? []) if (!onPath.has(m)) dfs(m);
    path.pop();
    onPath.delete(n);
  };
  for (const n of nodes) dfs(n);

  const arcKeys = arcs.map(([a, b]) => `${a}>${b}`);
  if (exceeded) return { depth: null, path: [], arcs: arcKeys, budgetExceeded: true, steps };
  return { depth: Math.max(0, best.length - 1), path: best, arcs: arcKeys, budgetExceeded: false, steps };
}

export function causalChainDepth(edges: ReadonlyArray<CanonicalEdge>, config: Pick<ScoringConfig, "causalTypes" | "causalDepthSearchBudget">): CausalDepthResult {
  return longestSimplePath(causalArcs(edges, config), config.causalDepthSearchBudget);
}
