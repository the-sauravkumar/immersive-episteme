import { OutlineDiagram, type DiagramNode } from "@/components/brand/outline-diagram";

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

function clusterNodes(counts: FigureOneCounts | null, x: number, y: number, w: number, columns: 2 | 4): DiagramNode[] {
  const box = (w - (columns - 1) * 8) / columns;
  const nodes: DiagramNode[] = [{ id: "model", x, y, width: w, height: 48, fill: "accent", face: "title", label: "One Knowledge Model" }];
  COUNT_LABELS.forEach(([key, label], i) => {
    nodes.push({
      id: `count-${key}`,
      x: x + (i % columns) * (box + 8),
      y: y + 64 + Math.floor(i / columns) * 96,
      width: box,
      height: 80,
      fill: "raised",
      face: "title",
      label: counts ? [formatCount(counts[key]), label] : label,
    });
  });
  return nodes;
}

export const FIGURE_ONE_WIDE = { width: 856, height: 176 } as const;
export const FIGURE_ONE_TALL = { width: 320, height: 256 } as const;

export function FigureOneDiagram({ counts }: { counts: FigureOneCounts | null }) {
  return (
    <div data-slot="figure-one-diagram" data-counts={counts ? "live" : "none"} className="bg-vat-2 p-4 xs:p-8">
      <OutlineDiagram {...FIGURE_ONE_WIDE} nodes={clusterNodes(counts, 16, 16, 824, 4)} className="hidden lg:block" />
      <OutlineDiagram {...FIGURE_ONE_TALL} nodes={clusterNodes(counts, 8, 8, 304, 2)} className="mx-auto max-w-[24rem] lg:hidden" />
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
