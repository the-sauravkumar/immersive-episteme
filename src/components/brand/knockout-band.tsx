/**
 * Knock-out band and field (DESIGN.md 7.1, 7.2). Public and research-console chrome ONLY; never
 * in study mode, in either condition.
 *
 * Ground-coloured geometry reversed out of a solid `--band` field, as resist protects white
 * (R-C22). Built from the block module: an 8 px unit, a 96 px decorative cell, tiles meeting edge
 * to edge with exact seams. Flat and square-edged: no jitter, offset plates, grain, gradients or
 * shadows. Neutral units only (a lozenge and a dot) on a STRAIGHT grid (DR-019): no stars or
 * rosettes (R-C12), no floral butis or half-drop offset rows (R-C10), no tradition colours.
 *
 * Always inline SVG, `aria-hidden` and not focusable: "decorative pattern, not craft content".
 * In high contrast and forced colours the SVG is hidden and a 2 px ink rule takes its place
 * (globals.css `.ie-band`, `.ie-band-rule`). Pattern ids come from `useId()`, so several bands on
 * one page never collide.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

/** Block module (DESIGN.md 7.1). */
export const BLOCK_UNIT = 8;
export const BLOCK_CELL = 96;

/** A square lozenge (a square on its point) of half-diagonal 5 px centred on (cx, cy). */
function lozenge(cx: number, cy: number): string {
  return `M${cx} ${cy - 5} L${cx + 5} ${cy} L${cx} ${cy + 5} L${cx - 5} ${cy} Z`;
}

function safeId(prefix: string, reactId: string): string {
  return `${prefix}-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** The 24 px header band tile: 48 x 24, one lozenge and one dot (DESIGN.md 7.2). */
function HeaderTile({ id }: { id: string }) {
  return (
    <pattern id={id} width="48" height="24" patternUnits="userSpaceOnUse">
      <rect className="ie-band__field" width="48" height="24" />
      <path className="ie-band__lozenge" d={lozenge(12, 12)} />
      <circle className="ie-band__dot" cx="36" cy="12" r="2" />
    </pattern>
  );
}

/** The 96 px field tile on a straight grid: lozenges on one diagonal, dots on the other. */
function FieldTile({ id }: { id: string }) {
  return (
    <pattern id={id} width={BLOCK_CELL} height={BLOCK_CELL} patternUnits="userSpaceOnUse">
      <rect className="ie-band__field" width={BLOCK_CELL} height={BLOCK_CELL} />
      <path className="ie-band__lozenge" d={lozenge(24, 24)} />
      <path className="ie-band__lozenge" d={lozenge(72, 72)} />
      <circle className="ie-band__dot" cx="72" cy="24" r="2" />
      <circle className="ie-band__dot" cx="24" cy="72" r="2" />
    </pattern>
  );
}

/**
 * A full-width band. `size={24}` is the public header band; `size={48}` the research console
 * band above each PageHeader (the top half of the 96 px field tile: one row of lozenge and dot).
 */
export function KnockoutBand({
  size = 24,
  hcRule = true,
  className,
}: {
  size?: 24 | 48;
  /**
   * Draw the 2 px ink rule that replaces the band in high contrast. Pass `false` when the band
   * sits directly under a running-head rule, which then serves as that rule (no doubled 4 px line).
   */
  hcRule?: boolean;
  className?: string;
}) {
  const id = safeId(size === 24 ? "ie-band-24" : "ie-band-48", useId());
  return (
    <div data-slot="knockout-band" className={className}>
      <svg className="ie-band" aria-hidden="true" focusable="false" width="100%" height={size}>
        <defs>{size === 24 ? <HeaderTile id={id} /> : <FieldTile id={id} />}</defs>
        <rect width="100%" height={size} fill={`url(#${id})`} />
      </svg>
      {hcRule ? <div className="ie-band-rule" aria-hidden="true" /> : null}
    </div>
  );
}

/**
 * A field of whole 96 px cells (empty-state art, Colophon swatch frame). Width and height are
 * rounded down to whole cells so the tiles always seam exactly at the edges.
 */
export function KnockoutField({ columns, rows, className }: { columns: number; rows: number; className?: string }) {
  const id = safeId("ie-field-96", useId());
  const width = Math.max(1, Math.floor(columns)) * BLOCK_CELL;
  const height = Math.max(1, Math.floor(rows)) * BLOCK_CELL;
  return (
    <svg
      data-slot="knockout-field"
      className={cn("ie-field max-w-full", className)}
      aria-hidden="true"
      focusable="false"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <FieldTile id={id} />
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>
  );
}
