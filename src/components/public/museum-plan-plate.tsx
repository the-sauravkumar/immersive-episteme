/**
 * Plate 1, beside the home title (DR-047, number to confirm at merge; amends DR-022 for the home
 * title block only): a fine-line plan of the compiled demo museum, the same scene model the 3D
 * condition walks, drawn with the 3D plan's own code (src/features/immersive/plan-drawing.ts).
 *
 *  - Rooms as 1.5 px `--ink` outlines, unfilled; doorways as gaps; every exhibit as a 3 px
 *    `--ink-2` square; each wing room carries its section number (the numbers of the 2D index,
 *    DR-024), at least 12 px, in tabular figures.
 *  - One `--indigo` 2 px route from the entrance to each wing's doorway, as the museum's
 *    click-to-walk router walks it: the hub geometry of DR-043, so the routes are visibly equal.
 *  - "Entrance" and "Comparison Hall" in the `text-label` face on a leader; the wings carry
 *    numbers only, so no tradition is named, coloured or enlarged.
 *  - Static; the tokens only, so the dark and high-contrast themes follow; strokes are
 *    non-scaling, so they keep their widths at any plate size.
 *
 * Layout (lg and up only; hidden below, where Figure 1 follows the title directly): columns 8 to 12
 * of the title grid, spanning its two rows as a subgrid. The drawing fills the first row, whose
 * height is the title block's (`h-0 min-h-full`: it never makes the row taller), so the plan is
 * never taller than the title; the caption takes the second row. The fallback is the same frame
 * and caption with nothing drawn, so nothing shifts when the plan arrives.
 */
import { plateLabel } from "@/components/brand/numbering";
import { PLAN_PLATE, type PlanPlateData } from "@/features/immersive/plan-drawing";
import { titleCase } from "@/lib/text/title-case";
import { countWord } from "@/server/public/dataset-stats";
import { getDemoMuseumPlan } from "@/server/public/demo-plan";

/** The plate's caption (set in Title Case through `titleCase`). */
export const PLATE_CAPTION = "The demo museum's plan, compiled from the same knowledge model: each numbered room is a section of the 2D index.";

/** The accessible name, counted from the model (never a fixed count). */
export function planAccessibleName(summary: PlanPlateData["summary"]): string {
  const parts: string[] = [];
  if (summary.entrance) parts.push("an entrance lobby");
  if (summary.wings > 0) {
    const wings = `${countWord(summary.wings)} wing${summary.wings === 1 ? "" : "s"}`;
    parts.push(summary.roomsPerWing ? `${wings} of ${countWord(summary.roomsPerWing)} numbered rooms each` : `${wings} of numbered rooms`);
  }
  if (summary.hall) parts.push("a comparison hall");
  if (summary.commons) parts.push("a shared commons");
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
  return list ? `Plan of the demo museum: ${list}` : "Plan of the demo museum";
}

const NON_SCALING = { vectorEffect: "non-scaling-stroke" } as const;

function PlanSvg({ plan }: { plan: PlanPlateData }) {
  const v = plan.viewBox;
  const marks = plan.exhibits.map((e) => `M${e.x.toFixed(2)} ${e.y.toFixed(2)}h0`).join("");
  return (
    <svg
      role="img"
      aria-label={planAccessibleName(plan.summary)}
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute top-3 left-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]"
      data-slot="museum-plan-plate-drawing"
    >
      <g style={{ fill: "none", stroke: "var(--ink)" }} strokeWidth={PLAN_PLATE.outlinePx}>
        {plan.rooms.map((r) => (
          <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} style={NON_SCALING} />
        ))}
      </g>
      <g style={{ stroke: "var(--ground)" }} strokeWidth={PLAN_PLATE.gapPx}>
        {plan.gaps.map((g) => (
          <line key={g.id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} style={NON_SCALING} />
        ))}
      </g>
      {marks ? <path d={marks} style={{ fill: "none", stroke: "var(--ink-2)", ...NON_SCALING }} strokeWidth={PLAN_PLATE.exhibitPx} strokeLinecap="square" data-slot="museum-plan-plate-exhibits" /> : null}
      <g style={{ fill: "none", stroke: "var(--indigo)" }} strokeWidth={PLAN_PLATE.routePx} strokeLinejoin="round" strokeLinecap="round" data-slot="museum-plan-plate-routes">
        {plan.routes.map((r) => (
          <polyline key={r.zoneId} points={r.points.map((p) => `${p.x},${p.y}`).join(" ")} style={NON_SCALING} />
        ))}
      </g>
      {plan.start ? <circle cx={plan.start.x} cy={plan.start.y} r={3 * plan.mpp} style={{ fill: "var(--indigo)" }} /> : null}
      <g style={{ stroke: "var(--ink-2)" }} strokeWidth={PLAN_PLATE.leaderPx}>
        {plan.labels.map((l) => (
          <line key={l.roomId} x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} style={NON_SCALING} />
        ))}
      </g>
      {plan.labels.map((l) => (
        <text key={`label:${l.roomId}`} x={l.x} y={l.y} fontSize={l.fontSize} fontWeight={700} style={{ fill: "var(--ink-2)", fontFamily: "var(--sans-stack)" }}>
          {titleCase(l.text)}
        </text>
      ))}
      {plan.numbers.map((n) => (
        <text
          key={`n:${n.roomId}`}
          x={n.x}
          y={n.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={n.fontSize}
          fontWeight={500}
          style={{ fill: "var(--ink)", fontFamily: "var(--sans-stack)", fontVariantNumeric: "tabular-nums" }}
        >
          {n.n}
        </text>
      ))}
    </svg>
  );
}

/** The plate: the frame (with the plan when there is one) in the title row, the caption under it. */
export function MuseumPlanPlateFrame({ plan }: { plan: PlanPlateData | null }) {
  return (
    <figure className="hidden lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:grid lg:grid-rows-subgrid" data-slot="museum-plan-plate" data-live={plan ? "true" : undefined}>
      <div className="flex h-0 min-h-full flex-col self-start pt-4">
        <div className="relative min-h-0 flex-1 border border-rule bg-ground">{plan ? <PlanSvg plan={plan} /> : null}</div>
      </div>
      <figcaption className="text-caption pt-3">
        <span className="font-bold text-ink">{plateLabel(1)}.</span> {titleCase(PLATE_CAPTION)}
      </figcaption>
    </figure>
  );
}

/** Reads the demo museum's plan at request time (inside <Suspense>). */
export async function MuseumPlanPlate() {
  const plan = await getDemoMuseumPlan();
  return <MuseumPlanPlateFrame plan={plan} />;
}
