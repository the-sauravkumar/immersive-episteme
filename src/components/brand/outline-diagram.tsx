/**
 * Line diagram (DESIGN.md 7.4, DR-022). Public and console ONLY (Figure 1, the About study-flow
 * figure, Explore schematics); never in study mode.
 *
 * Drawn as three layers: a flat fill, then a 1.5 px outline exactly over it at 0 offset, then the
 * text. Fills are `--sunk`, `--wash` or `--indigo` only. Text is Atkinson Hyperlegible Next 13/600
 * (titles 18/700); text on an indigo fill is `--on-indigo`. `tone="on-indigo"` draws the whole
 * diagram as on-indigo linework for the public Figure 1 plate (10.32:1).
 *
 * Every diagram needs a text equivalent (a list or table) next to it: the SVG is `aria-hidden`
 * unless `label` is given, in which case it is `role="img"` with that accessible name.
 *
 * Static: no draw-on or entrance motion in any zone (entrance motion is a stated tell, DR-022).
 * `draw` on an edge is accepted for older call sites and ignored.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

export type DiagramFill = "sunk" | "wash" | "indigo" | "none";

export interface DiagramNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: DiagramFill;
  /** One string per line. */
  label?: string | readonly string[];
  /** `title` (or the older name `serif`) sets the node's text at 18/700; otherwise 13/600. */
  face?: "sans" | "title" | "serif";
  /** Text alignment inside the node; default centred. */
  align?: "start" | "middle";
}

export interface DiagramEdge {
  id: string;
  /** SVG path data in diagram units. */
  d: string;
  arrow?: boolean;
  /** Ignored: diagrams are static (DR-022). */
  draw?: boolean;
  /** Optional small label (13/600 `--ink-3`) at an explicit position. */
  label?: { text: string; x: number; y: number; anchor?: "start" | "middle" | "end" };
}

const FILL_VAR: Record<Exclude<DiagramFill, "none">, string> = {
  sunk: "var(--sunk)",
  wash: "var(--wash)",
  indigo: "var(--indigo)",
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
  tone = "ink",
  className,
}: {
  /** viewBox width and height in diagram units; the SVG scales to its container width. */
  width: number;
  height: number;
  nodes: readonly DiagramNode[];
  edges?: readonly DiagramEdge[];
  /** Accessible name; omit when a text equivalent sits next to the diagram (the usual case). */
  label?: string;
  /** `on-indigo`: linework and text in --on-indigo, for a diagram set on an indigo plate. */
  tone?: "ink" | "on-indigo";
  className?: string;
}) {
  const markerId = `ie-od-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const line = tone === "on-indigo" ? "var(--on-indigo)" : "var(--ink)";
  const muted = tone === "on-indigo" ? "var(--on-indigo)" : "var(--ink-3)";

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

      {/* Layer 1, the fill. */}
      <g data-layer="fill">
        {nodes.map((n) =>
          // On an indigo plate only indigo nodes are filled (reversed to --on-indigo); the light
          // fills would carry on-indigo text, so they are drawn as outlines only.
          n.fill && n.fill !== "none" && (tone === "ink" || n.fill === "indigo") ? (
            <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} fill={tone === "on-indigo" ? "var(--on-indigo)" : FILL_VAR[n.fill]} />
          ) : null,
        )}
      </g>

      {/* Layer 2, the outline, registered exactly over the fill. */}
      <g data-layer="outline" fill="none" stroke={line} strokeWidth="1.5" strokeLinecap="square">
        {nodes.map((n) => (
          <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} />
        ))}
        {edges.map((e) => (
          <path key={e.id} d={e.d} markerEnd={e.arrow ? `url(#${markerId})` : undefined} />
        ))}
      </g>

      {/* Layer 3, the text. */}
      <g data-layer="text" fontFamily="var(--sans-stack)">
        {nodes.map((n) => {
          const ls = lines(n.label);
          if (ls.length === 0) return null;
          const face = n.face === "title" || n.face === "serif" ? "title" : "sans";
          const lh = LINE_HEIGHT[face];
          const anchor = n.align ?? "middle";
          const x = anchor === "middle" ? n.x + n.width / 2 : n.x + 12;
          const firstBaseline = n.y + n.height / 2 - ((ls.length - 1) * lh) / 2 + (face === "title" ? 6 : 4.5);
          const onFill = n.fill === "indigo";
          const fill = tone === "on-indigo" ? (onFill ? "var(--indigo)" : "var(--on-indigo)") : onFill ? "var(--on-indigo)" : "var(--ink)";
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
