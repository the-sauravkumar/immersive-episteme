import { useId } from "react";

import { estimateTextWidth, type StructureDiagram } from "@/features/knowledge/read/diagrams";
import { cn } from "@/lib/utils";

const SANS = { fontFamily: "var(--body)" } as const;

export function StructureDiagramSvg({ diagram, label, className }: { diagram: StructureDiagram; label: string; className?: string }) {
  const marker = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-arrow`;
  const { fontSize, lineHeight, labelSize } = diagram;
  return (
    <svg
      viewBox={`0 0 ${diagram.width} ${diagram.height}`}
      role="img"
      aria-label={label}
      data-slot="structure-diagram"
      data-diagram-type={diagram.type}
      className={cn("block h-full w-full select-text", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker id={marker} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M0 0.5 L7.5 4 L0 7.5 Z" style={{ fill: "var(--lime)" }} />
        </marker>
      </defs>
      <g data-layer="edges" fill="none" style={{ stroke: "var(--lime)" }} strokeWidth={1.25}>
        {diagram.edges.map((e) => (
          <path key={e.relationshipId} d={e.d} markerEnd={`url(#${marker})`} data-relationship-id={e.relationshipId} data-relationship-type={e.type} />
        ))}
      </g>
      <g data-layer="edge-labels" style={SANS}>
        {diagram.edges.map((e) => {
          if (!e.labelAt) return null;
          const w = estimateTextWidth(e.label, labelSize) + 6;
          const x = e.labelAt.anchor === "middle" ? e.labelAt.x - w / 2 : e.labelAt.anchor === "end" ? e.labelAt.x - w + 3 : e.labelAt.x - 3;
          return (
            <g key={e.relationshipId}>
              <rect x={x} y={e.labelAt.y - labelSize + 1} width={w} height={labelSize + 3} style={{ fill: "var(--vat-2)" }} />
              <text x={e.labelAt.x} y={e.labelAt.y} textAnchor={e.labelAt.anchor} fontSize={labelSize} style={{ fill: "var(--lime-dim)" }}>
                {e.label}
              </text>
            </g>
          );
        })}
        {diagram.bands.map((b, i) => (
          <text key={i} x={b.x} y={b.y} textAnchor="middle" fontSize={labelSize} fontWeight={600} style={{ fill: "var(--lime-dim)" }} data-slot="diagram-band">
            {b.label}
          </text>
        ))}
      </g>
      <g data-layer="nodes" style={SANS}>
        {diagram.nodes.map((n) => (
          <g key={n.id} data-concept-id={n.id} data-current={n.current || undefined}>
            <rect
              x={n.current ? n.x + 0.5 : n.x}
              y={n.current ? n.y + 0.5 : n.y}
              width={n.current ? n.w - 1 : n.w}
              height={n.current ? n.h - 1 : n.h}
              strokeWidth={n.current ? 2 : 1}
              style={{ fill: n.current ? "var(--turmeric)" : "var(--vat)", stroke: n.current ? "var(--turmeric)" : "var(--lime)" }}
            />
            <text fontSize={fontSize} fontWeight={500} style={{ fill: n.current ? "var(--vat)" : "var(--lime)" }}>
              {n.lines.map((line, i) => (
                <tspan key={i} x={n.x + 8} y={n.y + 6 + i * lineHeight + fontSize - (lineHeight - fontSize) / 2 + 1}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
