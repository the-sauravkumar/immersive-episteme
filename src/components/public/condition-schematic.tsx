/**
 * Line-art schematics of the two learning conditions (DESIGN.md 7.4, 11.1, 11.3). Public pages
 * only. Drawn outline-then-fill through the shared `OutlineDiagram`, never a screenshot, so
 * neither condition looks richer than the other: both miniatures sit in the same box, use the
 * same outline weight, the same `--sunk` fills and exactly one indigo accent.
 *
 *  - The page miniature: a title bar, numbered claim lines (the 2D column).
 *  - The floor-plan miniature: rooms as squares (the 3D museum), the current room marked by an
 *    indigo square of the same area as the page's title bar.
 *
 * The builders are shared with Figure 1 (figure-one.tsx), so the home figure and the Explore
 * cards draw the same marks.
 */
import { OutlineDiagram, type DiagramNode } from "@/components/brand/outline-diagram";

export type SchematicCondition = "2d" | "immersive";

/**
 * The one indigo accent of a miniature in the box (w, h): the page's title bar. The plan's
 * current-room marker is a square of the same area, so in the same box both miniatures carry the
 * same amount of indigo and neither condition reads heavier (11.3; unit-tested).
 */
function accentBar(w: number, h: number): { width: number; height: number } {
  return { width: Math.round(w * 0.55), height: Math.max(8, Math.round(h * 0.08)) };
}

/** A page of numbered claims in the box (x, y, w, h). Ids are prefixed so several can share a diagram. */
export function pageMiniature(prefix: string, x: number, y: number, w: number, h: number, rows = 3): DiagramNode[] {
  const pad = Math.round(w * 0.08);
  const bar = accentBar(w, h);
  const nodes: DiagramNode[] = [
    { id: `${prefix}-page`, x, y, width: w, height: h, fill: "none" },
    { id: `${prefix}-title`, x: x + pad, y: y + pad, width: bar.width, height: bar.height, fill: "indigo" },
  ];
  const top = y + pad + bar.height + Math.round(h * 0.1);
  const step = (y + h - pad - top) / rows;
  const box = Math.min(16, Math.round(step * 0.6));
  for (let i = 0; i < rows; i++) {
    const ry = Math.round(top + i * step);
    nodes.push({ id: `${prefix}-n${i}`, x: x + pad, y: ry, width: box, height: box, fill: "none", label: String(i + 1) });
    const lineX = x + pad + box + 8;
    const maxW = x + w - pad - lineX;
    nodes.push({ id: `${prefix}-l${i}`, x: lineX, y: ry + Math.round(box / 2) - 3, width: Math.round(maxW * (1 - i * 0.14)), height: 6, fill: "sunk" });
  }
  return nodes;
}

/**
 * A floor plan of rooms (columns x rows) in the box (x, y, w, h). Every room is the same sunk
 * square; the first is the current room, marked by an indigo square centred in it whose area
 * equals the page miniature's title bar in the same box.
 */
export function planMiniature(prefix: string, x: number, y: number, w: number, h: number, columns = 3, rowsOfRooms = 2): DiagramNode[] {
  const pad = Math.round(Math.min(w, h) * 0.1);
  const gap = Math.max(8, Math.round(w * 0.05));
  const size = Math.floor(Math.min((w - 2 * pad - (columns - 1) * gap) / columns, (h - 2 * pad - (rowsOfRooms - 1) * gap) / rowsOfRooms));
  const gridW = columns * size + (columns - 1) * gap;
  const gridH = rowsOfRooms * size + (rowsOfRooms - 1) * gap;
  const x0 = Math.round(x + (w - gridW) / 2);
  const y0 = Math.round(y + (h - gridH) / 2);
  const nodes: DiagramNode[] = [{ id: `${prefix}-plan`, x, y, width: w, height: h, fill: "none" }];
  for (let r = 0; r < rowsOfRooms; r++) {
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c;
      nodes.push({ id: `${prefix}-r${i}`, x: x0 + c * (size + gap), y: y0 + r * (size + gap), width: size, height: size, fill: "sunk" });
    }
  }
  const bar = accentBar(w, h);
  const marker = Math.min(size - 8, Math.round(Math.sqrt(bar.width * bar.height)));
  const inset = Math.round((size - marker) / 2);
  nodes.push({ id: `${prefix}-here`, x: x0 + inset, y: y0 + inset, width: marker, height: marker, fill: "indigo" });
  return nodes;
}

/**
 * The 16:10 schematic on an Explore card (DESIGN.md 11.3). Decorative: the card text says the same.
 * The viewBox (288 units) is no wider than the narrowest box it renders in (296 px, two cards at
 * 768 px), so the 13 px claim numerals are never scaled below 13 px (7.4).
 */
export const SCHEMATIC_BOX = { width: 288, height: 180 } as const;

export function ConditionSchematic({ condition }: { condition: SchematicCondition }) {
  const nodes = condition === "2d" ? pageMiniature("s2d", 36, 18, 216, 144, 4) : planMiniature("s3d", 36, 18, 216, 144, 3, 2);
  return (
    <div data-slot="condition-schematic" data-condition-schematic={condition} className="aspect-[16/10] w-full border border-rule bg-ground">
      <OutlineDiagram {...SCHEMATIC_BOX} nodes={nodes} className="h-full" />
    </div>
  );
}
