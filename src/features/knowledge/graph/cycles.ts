/**
 * Directed-cycle detection. `stronglyConnectedComponents` is Tarjan's algorithm (iterative,
 * so deep process chains cannot overflow the stack). A component is cyclic when it has more
 * than one node or a self-edge. Output is deterministic: nodes are visited in sorted order
 * and each component is returned sorted.
 */

export interface DirectedEdge {
  from: string;
  to: string;
}

function adjacency(edges: readonly DirectedEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
  }
  for (const list of adj.values()) list.sort();
  return adj;
}

export function stronglyConnectedComponents(edges: readonly DirectedEdge[]): string[][] {
  const adj = adjacency(edges);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const root of [...adj.keys()].sort()) {
    if (index.has(root)) continue;
    // Each frame: node and position in its neighbour list.
    const work: { node: string; next: number }[] = [{ node: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const neighbours = adj.get(frame.node)!;
      if (frame.next < neighbours.length) {
        const w = neighbours[frame.next++]!;
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          work.push({ node: w, next: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(w)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== frame.node);
        components.push(component.sort());
      }
    }
  }
  return components;
}

/** Cyclic components only (size > 1, or a node with an edge to itself). */
export function findCycles(edges: readonly DirectedEdge[]): string[][] {
  const selfLoops = new Set(edges.filter((e) => e.from === e.to).map((e) => e.from));
  return stronglyConnectedComponents(edges)
    .filter((c) => c.length > 1 || selfLoops.has(c[0]!))
    .sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
}

export function hasCycle(edges: readonly DirectedEdge[]): boolean {
  return findCycles(edges).length > 0;
}
