/**
 * Figure 1, "One Knowledge Model, Two Conditions" (DESIGN.md 3 signature 3, 11.1). Public home only.
 *
 * One indigo knock-out plate, the single place where the public pages spend their boldness
 * (DR-022): on-indigo linework (10.32:1) of a cluster labelled with the live dataset counts, then
 * two equal-weight branches to a miniature page (2D) and a miniature floor plan (3D). Static: no
 * draw-on motion.
 *
 * Two geometries: a left-to-right flow from 1024 px, and a vertical flow below it (11.1 "At 390 px
 * ... Figure 1 switches to a vertical flow"). Both SVGs are `aria-hidden`; the text equivalent sits
 * next to the figure (`FigureOneText`) and repeats every label and count.
 *
 * `counts` is null in the static fallback (prerender, database unavailable): the cluster then
 * shows its labels without numbers, never an invented value.
 */
import { OutlineDiagram, type DiagramEdge, type DiagramNode } from "@/components/brand/outline-diagram";

import { pageMiniature, planMiniature } from "./condition-schematic";

export interface FigureOneCounts {
  traditions: number;
  concepts: number;
  relationships: number;
  /** Distinct sources cited by the claims (Table 1's definition, so the page shows one total). */
  sources: number;
}

const COUNT_LABELS = [
  ["traditions", "Traditions"],
  ["concepts", "Concepts"],
  ["relationships", "Relations"],
  ["sources", "Sources"],
] as const;

/** Display formatting of a count (thousands separated, lining figures come from the face). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-GB").format(n);
}

/**
 * The cluster: the model node over a 2 x 2 grid of count boxes, `w` wide in total. Its bounding box
 * is (x, y) to (x + w, y + 240), and every branch leaves from a bracket that spans the whole of it,
 * so the figure reads "the knowledge model leads to two conditions", not "one count does".
 */
function clusterNodes(counts: FigureOneCounts | null, x: number, y: number, w: number): DiagramNode[] {
  const box = (w - 8) / 2;
  const nodes: DiagramNode[] = [{ id: "model", x, y, width: w, height: 48, fill: "indigo", face: "title", label: "One Knowledge Model" }];
  COUNT_LABELS.forEach(([key, label], i) => {
    nodes.push({
      id: `count-${key}`,
      x: x + (i % 2) * (box + 8),
      y: y + 64 + Math.floor(i / 2) * 96,
      width: box,
      height: 80,
      fill: "sunk",
      face: "title",
      label: counts ? [formatCount(counts[key]), label] : label,
    });
  });
  return nodes;
}

/*
 * Both geometries are authored at the size they render, so the 13 px labels (7.4) are never scaled
 * below 13 px: the wide one (856 units) shows from 1024 px, where its box is at least 910 px wide;
 * the tall one (320 units) fits the 324 px box at 390 px and grows from there.
 */
export const FIGURE_ONE_WIDE = { width: 856, height: 420 } as const;
export const FIGURE_ONE_TALL = { width: 320, height: 488 } as const;

function wide(counts: FigureOneCounts | null): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  // Cluster x 16-328, y 80-320; a bracket at x 344 spans it, and the trunk leaves from its midpoint.
  const nodes = [...clusterNodes(counts, 16, 80, 312), ...pageMiniature("f1-page", 608, 24, 232, 140), ...planMiniature("f1-plan", 608, 236, 232, 140)];
  const edges: DiagramEdge[] = [
    { id: "bracket", d: "M336 80 H344 V320 H336" },
    { id: "branch-2d", d: "M344 200 H472 V94 H600", arrow: true, label: { text: "2D: conventional pages", x: 724, y: 190 } },
    { id: "branch-3d", d: "M344 200 H472 V306 H600", arrow: true, label: { text: "3D: immersive museum", x: 724, y: 402 } },
  ];
  return { nodes, edges };
}

function tall(counts: FigureOneCounts | null): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  // Cluster x 8-312, y 16-256; a bracket under it at y 272, and the trunk leaves from its midpoint.
  const nodes = [...clusterNodes(counts, 8, 16, 304), ...pageMiniature("f1m-page", 8, 336, 144, 112), ...planMiniature("f1m-plan", 168, 336, 144, 112)];
  const edges: DiagramEdge[] = [
    { id: "bracket", d: "M8 264 V272 H312 V264" },
    { id: "branch-2d", d: "M160 272 V300 H80 V328", arrow: true, label: { text: "2D: pages", x: 80, y: 474 } },
    { id: "branch-3d", d: "M160 272 V300 H240 V328", arrow: true, label: { text: "3D: museum", x: 240, y: 474 } },
  ];
  return { nodes, edges };
}

export function FigureOneDiagram({ counts }: { counts: FigureOneCounts | null }) {
  const w = wide(counts);
  const t = tall(counts);
  return (
    <div data-slot="figure-one-diagram" data-counts={counts ? "live" : "none"} className="bg-indigo p-4 xs:p-8">
      <OutlineDiagram {...FIGURE_ONE_WIDE} nodes={w.nodes} edges={w.edges} tone="on-indigo" className="hidden lg:block" />
      <OutlineDiagram {...FIGURE_ONE_TALL} nodes={t.nodes} edges={t.edges} tone="on-indigo" className="mx-auto max-w-[24rem] lg:hidden" />
    </div>
  );
}

/** The text equivalent of the cluster (a list that repeats the diagram's counts). */
export function FigureOneCountList({ counts }: { counts: FigureOneCounts | null }) {
  if (!counts) return <p className="text-body text-ink-2">The counts of the knowledge model are read from the database when the page loads.</p>;
  return (
    <ul data-slot="figure-one-counts" className="text-body flex flex-wrap gap-x-6 gap-y-1 text-ink-2">
      {COUNT_LABELS.map(([key, label]) => (
        <li key={key}>
          <span className="font-bold text-ink tabular-nums">{formatCount(counts[key])}</span> {label.toLowerCase()}
        </li>
      ))}
    </ul>
  );
}
