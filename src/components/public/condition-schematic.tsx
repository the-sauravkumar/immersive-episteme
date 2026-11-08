import { OutlineDiagram, type DiagramNode } from "@/components/brand/outline-diagram";

export type SchematicCondition = "2d" | "immersive";

function accentBar(w: number, h: number): { width: number; height: number } {
  return { width: Math.round(w * 0.55), height: Math.max(8, Math.round(h * 0.08)) };
}

export function pageMiniature(prefix: string, x: number, y: number, w: number, h: number, rows = 3): DiagramNode[] {
  const pad = Math.round(w * 0.08);
  const bar = accentBar(w, h);
  const nodes: DiagramNode[] = [
    { id: `${prefix}-page`, x, y, width: w, height: h, fill: "none" },
    { id: `${prefix}-title`, x: x + pad, y: y + pad, width: bar.width, height: bar.height, fill: "accent" },
  ];
  const top = y + pad + bar.height + Math.round(h * 0.1);
  const step = (y + h - pad - top) / rows;
  const box = Math.min(16, Math.round(step * 0.6));
  for (let i = 0; i < rows; i++) {
    const ry = Math.round(top + i * step);
    nodes.push({ id: `${prefix}-n${i}`, x: x + pad, y: ry, width: box, height: box, fill: "none", label: String(i + 1) });
    const lineX = x + pad + box + 8;
    const maxW = x + w - pad - lineX;
    nodes.push({ id: `${prefix}-l${i}`, x: lineX, y: ry + Math.round(box / 2) - 3, width: Math.round(maxW * (1 - i * 0.14)), height: 6, fill: "raised" });
  }
  return nodes;
}

export function routeMiniature(prefix: string, x: number, y: number, w: number, h: number, yards = 3): DiagramNode[] {
  const pad = Math.round(Math.min(w, h) * 0.1);
  const gap = Math.max(8, Math.round(w * 0.05));
  const size = Math.floor(Math.min((w - 2 * pad - (yards - 1) * gap) / yards, h - 2 * pad));
  const lineW = yards * size + (yards - 1) * gap;
  const x0 = Math.round(x + (w - lineW) / 2);
  const y0 = Math.round(y + (h - size) / 2);
  const nodes: DiagramNode[] = [
    { id: `${prefix}-route`, x, y, width: w, height: h, fill: "none" },
    { id: `${prefix}-path`, x: x0, y: y0 + Math.round(size / 2) - 3, width: lineW, height: 6, fill: "raised" },
  ];
  for (let i = 0; i < yards; i++) nodes.push({ id: `${prefix}-y${i}`, x: x0 + i * (size + gap), y: y0, width: size, height: size, fill: "raised" });
  const bar = accentBar(w, h);
  const marker = Math.min(size - 8, Math.round(Math.sqrt(bar.width * bar.height)));
  const inset = Math.round((size - marker) / 2);
  nodes.push({ id: `${prefix}-here`, x: x0 + inset, y: y0 + inset, width: marker, height: marker, fill: "accent" });
  return nodes;
}

export const SCHEMATIC_BOX = { width: 288, height: 192 } as const;

export function ConditionSchematic({ condition }: { condition: SchematicCondition }) {
  const nodes = condition === "2d" ? pageMiniature("s2d", 36, 24, 216, 144, 4) : routeMiniature("s3d", 36, 24, 216, 144);
  return (
    <div data-slot="condition-schematic" data-condition-schematic={condition} className="aspect-[3/2] w-full border border-line bg-vat">
      <OutlineDiagram {...SCHEMATIC_BOX} nodes={nodes} className="h-full" />
    </div>
  );
}
