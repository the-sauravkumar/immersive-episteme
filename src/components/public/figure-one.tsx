import { OutlineDiagram, type DiagramEdge, type DiagramNode } from "@/components/brand/outline-diagram";

import { pageMiniature, routeMiniature } from "./condition-schematic";

export interface FigureOneCounts {
  traditions: number;
  concepts: number;
  relationships: number;
  sources: number;
}

const COUNT_LABELS = [
  ["traditions", "Traditions"],
  ["concepts", "Concepts"],
  ["relationships", "Relations"],
  ["sources", "Sources"],
] as const;

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-GB").format(n);
}

function clusterNodes(counts: FigureOneCounts | null, x: number, y: number, w: number): DiagramNode[] {
  const box = (w - 8) / 2;
  const nodes: DiagramNode[] = [{ id: "model", x, y, width: w, height: 48, fill: "accent", face: "title", label: "One Knowledge Model" }];
  COUNT_LABELS.forEach(([key, label], i) => {
    nodes.push({
      id: `count-${key}`,
      x: x + (i % 2) * (box + 8),
      y: y + 64 + Math.floor(i / 2) * 96,
      width: box,
      height: 80,
      fill: "raised",
      face: "title",
      label: counts ? [formatCount(counts[key]), label] : label,
    });
  });
  return nodes;
}

export const FIGURE_ONE_WIDE = { width: 856, height: 420 } as const;
export const FIGURE_ONE_TALL = { width: 320, height: 488 } as const;

function wide(counts: FigureOneCounts | null): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const nodes = [...clusterNodes(counts, 16, 80, 312), ...pageMiniature("f1-page", 608, 24, 232, 140), ...routeMiniature("f1-route", 608, 236, 232, 140)];
  const edges: DiagramEdge[] = [
    { id: "bracket", d: "M336 80 H344 V320 H336" },
    { id: "branch-2d", d: "M344 200 H472 V94 H600", arrow: true, label: { text: "2D: visual course", x: 724, y: 190 } },
    { id: "branch-3d", d: "M344 200 H472 V306 H600", arrow: true, label: { text: "3D: walkthrough", x: 724, y: 402 } },
  ];
  return { nodes, edges };
}

function tall(counts: FigureOneCounts | null): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const nodes = [...clusterNodes(counts, 8, 16, 304), ...pageMiniature("f1m-page", 8, 336, 144, 112), ...routeMiniature("f1m-route", 168, 336, 144, 112)];
  const edges: DiagramEdge[] = [
    { id: "bracket", d: "M8 264 V272 H312 V264" },
    { id: "branch-2d", d: "M160 272 V300 H80 V328", arrow: true, label: { text: "2D: visual course", x: 80, y: 474 } },
    { id: "branch-3d", d: "M160 272 V300 H240 V328", arrow: true, label: { text: "3D: walkthrough", x: 240, y: 474 } },
  ];
  return { nodes, edges };
}

export function FigureOneDiagram({ counts }: { counts: FigureOneCounts | null }) {
  const w = wide(counts);
  const t = tall(counts);
  return (
    <div data-slot="figure-one-diagram" data-counts={counts ? "live" : "none"} className="bg-vat-2 p-4 xs:p-8">
      <OutlineDiagram {...FIGURE_ONE_WIDE} nodes={w.nodes} edges={w.edges} className="hidden lg:block" />
      <OutlineDiagram {...FIGURE_ONE_TALL} nodes={t.nodes} edges={t.edges} className="mx-auto max-w-[24rem] lg:hidden" />
    </div>
  );
}

export function FigureOneCountList({ counts }: { counts: FigureOneCounts | null }) {
  if (!counts) return <p className="t-b text-lime-dim">The counts of the knowledge model are read from the database when the page loads.</p>;
  return (
    <ul data-slot="figure-one-counts" className="t-b flex flex-wrap gap-x-6 gap-y-1 text-lime-dim">
      {COUNT_LABELS.map(([key, label]) => (
        <li key={key}>
          <span className="font-bold text-lime tabular-nums">{formatCount(counts[key])}</span> {label.toLowerCase()}
        </li>
      ))}
    </ul>
  );
}
