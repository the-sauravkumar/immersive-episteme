import { useId } from "react";

import { cn } from "@/lib/utils";

type DiagramFill = "raised" | "hover" | "accent" | "none";

export interface DiagramNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: DiagramFill;
  label?: string | readonly string[];
  face?: "sans" | "title" | "serif";
  align?: "start" | "middle";
}

export interface DiagramEdge {
  id: string;
  d: string;
  arrow?: boolean;
  draw?: boolean;
  label?: { text: string; x: number; y: number; anchor?: "start" | "middle" | "end" };
}

const FILL_VAR: Record<Exclude<DiagramFill, "none">, string> = {
  raised: "var(--vat-2)",
  hover: "var(--raised-hover)",
  accent: "var(--turmeric)",
};

const LINE_HEIGHT = { sans: 18, title: 22 } as const;

function lines(label: DiagramNode["label"]): readonly string[] {
  if (label === undefined) return [];
  return typeof label === "string" ? [label] : label;
}

export function OutlineDiagram({
  width,
  height,
  nodes,
  edges = [],
  label,
  className,
}: {
  width: number;
  height: number;
  nodes: readonly DiagramNode[];
  edges?: readonly DiagramEdge[];
  label?: string;
  className?: string;
}) {
  const markerId = `ie-od-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const line = "var(--lime)";
  const muted = "var(--lime-dim)";

  return (
    <svg
      data-slot="outline-diagram"
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block h-auto w-full", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      focusable="false"
    >
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke={line} strokeWidth="1.5" strokeLinecap="square" />
        </marker>
      </defs>

      <g data-layer="fill">
        {nodes.map((n) =>
          n.fill && n.fill !== "none" ? (
            <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} fill={FILL_VAR[n.fill]} />
          ) : null,
        )}
      </g>

      <g data-layer="outline" fill="none" stroke={line} strokeWidth="1.5" strokeLinecap="square">
        {nodes.map((n) => (
          <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} />
        ))}
        {edges.map((e) => (
          <path key={e.id} d={e.d} markerEnd={e.arrow ? `url(#${markerId})` : undefined} />
        ))}
      </g>

      <g data-layer="text" fontFamily="var(--body)">
        {nodes.map((n) => {
          const ls = lines(n.label);
          if (ls.length === 0) return null;
          const face = n.face === "title" || n.face === "serif" ? "title" : "sans";
          const lh = LINE_HEIGHT[face];
          const anchor = n.align ?? "middle";
          const x = anchor === "middle" ? n.x + n.width / 2 : n.x + 12;
          const firstBaseline = n.y + n.height / 2 - ((ls.length - 1) * lh) / 2 + (face === "title" ? 6 : 4.5);
          const onFill = n.fill === "accent";
          const fill = onFill ? "var(--vat)" : "var(--lime)";
          return (
            <text key={n.id} x={x} textAnchor={anchor} fill={fill} fontSize={face === "title" ? 18 : 13} fontWeight={face === "title" ? 700 : 600}>
              {ls.map((l, i) => (
                <tspan key={i} x={x} y={firstBaseline + i * lh}>
                  {l}
                </tspan>
              ))}
            </text>
          );
        })}
        {edges.map((e) =>
          e.label ? (
            <text key={e.id} x={e.label.x} y={e.label.y} textAnchor={e.label.anchor ?? "middle"} fill={muted} fontSize={13} fontWeight={600}>
              {e.label.text}
            </text>
          ) : null,
        )}
      </g>
    </svg>
  );
}
