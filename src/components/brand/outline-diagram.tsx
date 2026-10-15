"use client";

/**
 * Outline-then-fill diagram (DESIGN.md 7.4). Public and console ONLY (Figure 1, the About
 * study-flow figure, Explore schematics, empty-state art); never in study mode.
 *
 * Drawn as two registered layers like the rekh (outline) and datai (fill) blocks (R-C8): a flat
 * fill layer, then a 1.5 px `--ink` outline layer exactly over it at 0 offset, then the text.
 * Fills are `--sunk`, `--wash` or `--indigo` only (never madder beside indigo). Text is Inter
 * 13/600 (or Source Serif 600 for titles); text on an indigo fill is `--on-indigo`.
 *
 * Every diagram needs a text equivalent (a list or table) next to it: the SVG is `aria-hidden`
 * unless `label` is given, in which case it is `role="img"` with that accessible name.
 *
 * Motion (DESIGN.md 8, public only): edges marked `draw` draw on once (stroke-dashoffset, 700 ms,
 * `--ease-museum`) when the diagram first enters the viewport. A diagram already in view at load,
 * a reduced-motion visitor (OS setting or Display Settings) and the server render all show it
 * fully drawn. Nothing loops.
 */
import { useEffect, useId, useRef, useState } from "react";

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
  /** `serif` for titles (Source Serif 4 600), otherwise Inter 13/600. */
  face?: "sans" | "serif";
  /** Text alignment inside the node; default centred. */
  align?: "start" | "middle";
}

export interface DiagramEdge {
  id: string;
  /** SVG path data in diagram units. */
  d: string;
  arrow?: boolean;
  /** Draw on once when the diagram enters the viewport (public pages only). */
  draw?: boolean;
  /** Optional small label (Inter 13/600 `--ink-3`) at an explicit position. */
  label?: { text: string; x: number; y: number; anchor?: "start" | "middle" | "end" };
}

const FILL_VAR: Record<Exclude<DiagramFill, "none">, string> = {
  sunk: "var(--sunk)",
  wash: "var(--wash)",
  indigo: "var(--indigo)",
};

const LINE_HEIGHT = { sans: 18, serif: 22 } as const;

function lines(label: DiagramNode["label"]): readonly string[] {
  if (label === undefined) return [];
  return typeof label === "string" ? [label] : label;
}

function prefersReducedMotion(): boolean {
  if (document.documentElement.classList.contains("a11y-reduce-motion")) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function OutlineDiagram({
  width,
  height,
  nodes,
  edges = [],
  label,
  className,
}: {
  /** viewBox width and height in diagram units; the SVG scales to its container width. */
  width: number;
  height: number;
  nodes: readonly DiagramNode[];
  edges?: readonly DiagramEdge[];
  /** Accessible name; omit when a text equivalent sits next to the diagram (the usual case). */
  label?: string;
  className?: string;
}) {
  const markerId = `ie-od-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ref = useRef<SVGSVGElement>(null);
  const hasDraw = edges.some((e) => e.draw);
  // "drawn" on the server and on first paint, so nothing is ever missing without JavaScript.
  const [phase, setPhase] = useState<"drawn" | "hidden" | "drawing">("drawn");

  useEffect(() => {
    const svg = ref.current;
    if (!hasDraw || !svg || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    const box = svg.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return; // already in view: stay drawn
    setPhase("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase("drawing");
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(svg);
    return () => io.disconnect();
  }, [hasDraw]);

  return (
    <svg
      ref={ref}
      data-slot="outline-diagram"
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block h-auto w-full", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      focusable="false"
    >
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="square" />
        </marker>
      </defs>

      {/* Layer 1, the fill (datai). */}
      <g data-layer="fill">
        {nodes.map((n) =>
          n.fill && n.fill !== "none" ? (
            <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} fill={FILL_VAR[n.fill]} />
          ) : null,
        )}
      </g>

      {/* Layer 2, the outline (rekh), registered exactly over the fill. */}
      <g data-layer="outline" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="square">
        {nodes.map((n) => (
          <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} />
        ))}
        {edges.map((e) => (
          <path
            key={e.id}
            d={e.d}
            markerEnd={e.arrow ? `url(#${markerId})` : undefined}
            {...(e.draw
              ? {
                  pathLength: 1,
                  "data-draw": phase,
                  style: {
                    strokeDasharray: 1,
                    strokeDashoffset: phase === "hidden" ? 1 : 0,
                    transition: phase === "drawing" ? "stroke-dashoffset 700ms var(--ease-museum)" : undefined,
                  },
                }
              : {})}
          />
        ))}
      </g>

      {/* Layer 3, the text. */}
      <g data-layer="text" fontFamily="var(--sans-stack)">
        {nodes.map((n) => {
          const ls = lines(n.label);
          if (ls.length === 0) return null;
          const face = n.face ?? "sans";
          const lh = LINE_HEIGHT[face];
          const anchor = n.align ?? "middle";
          const x = anchor === "middle" ? n.x + n.width / 2 : n.x + 12;
          const firstBaseline = n.y + n.height / 2 - ((ls.length - 1) * lh) / 2 + (face === "serif" ? 6 : 4.5);
          return (
            <text
              key={n.id}
              x={x}
              textAnchor={anchor}
              fill={n.fill === "indigo" ? "var(--on-indigo)" : "var(--ink)"}
              fontFamily={face === "serif" ? "var(--serif-stack)" : undefined}
              fontSize={face === "serif" ? 18 : 13}
              fontWeight={600}
            >
              {ls.map((line, i) => (
                <tspan key={i} x={x} y={firstBaseline + i * lh}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
        {edges.map((e) =>
          e.label ? (
            <text key={e.id} x={e.label.x} y={e.label.y} textAnchor={e.label.anchor ?? "middle"} fill="var(--ink-3)" fontSize={13} fontWeight={600}>
              {e.label.text}
            </text>
          ) : null,
        )}
      </g>
    </svg>
  );
}
