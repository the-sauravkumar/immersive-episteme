"use client";

/**
 * The plan (DESIGN.md 11.6; CN-11 "the map may be minimised").
 *
 *  - `Minimap`: bottom-left, a 192 x 192 px plan on opaque `--ground` with a 1 px `--rule-strong`
 *    border and the eyebrow "Plan". Rooms are 1.5 px `--ink` outlines, unfilled, labelled with their
 *    numbers (`tabular-nums`); the current room has a 2 px outline, an ink arrow and the text
 *    "You Are Here". No fills, no tradition colour, and nothing slides: the arrow marks the room,
 *    not the visitor's live position, and points the way the visitor faces in eight compass steps
 *    (it turns only when the facing passes to another point), so the plan and the view can be
 *    matched (novice walkthrough: the plan had no facing arrow). A 44 px "Expand plan" button opens
 *    the full plan.
 *  - `PlanDialog`: the full plan with the same drawing (each room also names itself on hover) and
 *    every room by number and name as a 44 px button that walks there (the keyboard route to any room). On a study route nothing may be
 *    translucent or shadowed (4.6, 12.2 rule 6), so it opens over an opaque `--ground` backdrop on
 *    an unshadowed `--surface` sheet.
 * Rooms are numbered by the shared section map (DR-024): a wing room carries its section's number
 * and the comparison hall the cross-tradition section's number, the same numbers and names the 2D
 * index gives the same sections; the entrance lobby and the shared commons are no section and carry
 * no number. The full plan lists the entrance first, then each wing in the canonical tradition order
 * by section number, then the hall. Numbers are at least 10 px; a room too small to hold its number
 * clear of the outline shows none (the full plan lists every room by number and name).
 * The pure plan code (numbers, order, number fitting, the drawing's extent) lives in
 * src/features/immersive/plan-drawing.ts, which the home page's Plate 1 draws from too (DR-047,
 * number to confirm at merge), so the two plans can never differ.
 * Hidden when the study sets `minimap: "off"`; the museum hides the minimap while the panel covers
 * the scene (under 1024 px).
 */
import { Maximize2, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { CSSProperties } from "react";

import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ARROW_PX, compassWord, planBox, planOrder, planRoomName, roomLabelLayout, roomNumbers } from "@/features/immersive/plan-drawing";
import type { SceneModel, SceneRoom } from "@/features/immersive/scene-model";
import { sectionOfZoneGroup } from "@/features/learning/sections";
import { PLAN_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";

export { compassWord, planOrder, planRoomName, roomNumbers } from "@/features/immersive/plan-drawing";

/**
 * Whether the plan is shown when the museum opens: it follows the protocol's `minimap` setting
 * (DR-021 lead decision; concept note "the map may be minimised"): "on" shows it, "toggle" starts
 * minimised behind the StudyBar's Plan button, "off" has no plan at all.
 */
export function planDefaultOpen(minimap: "on" | "off" | "toggle"): boolean {
  return minimap === "on";
}

/** The minimap's drawing box inside its 192 x 192 frame (44 px header, 28 px legend, 8 px sides). */
const MINIMAP_BOX = { w: 174, h: 118 } as const;

/**
 * The plan drawing fitted (meet) into a box of `boxPx` CSS px. Strokes, the dot and the numbers are
 * sized in CSS px through the metres per pixel of that fit.
 */
function PlanDrawing({
  model,
  roomId,
  headingDeg,
  boxPx,
  labelPx,
  className,
  style,
  roomTitle,
}: {
  model: SceneModel;
  roomId: string | null;
  headingDeg: number | null;
  boxPx: { w: number; h: number };
  labelPx: number;
  className?: string;
  style?: CSSProperties;
  /** Full plan: each room's name, shown on hover (an SVG title). */
  roomTitle?: (r: SceneRoom) => string;
}) {
  const v = planBox(model);
  const mpp = Math.max(v.w / boxPx.w, v.h / boxPx.h);
  const numbers = roomNumbers(model);
  const current = roomId ? model.rooms.find((r) => r.id === roomId) : undefined;
  const currentLayout = current ? roomLabelLayout(current, numbers.get(current.id), true, mpp, labelPx) : null;
  return (
    <svg viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} className={className} style={style} aria-hidden="true" focusable="false" data-slot="museum-plan-drawing">
      {model.rooms.map((r) => {
        const here = r.id === roomId;
        return (
          <rect
            key={r.id}
            x={r.bounds.minX}
            y={r.bounds.minZ}
            width={r.bounds.maxX - r.bounds.minX}
            height={r.bounds.maxZ - r.bounds.minZ}
            fill={roomTitle ? "transparent" : "none"}
            style={{ stroke: "var(--ink)" }}
            strokeWidth={(here ? 2 : 1.5) * mpp}
          >
            {roomTitle ? <title>{roomTitle(r)}</title> : null}
          </rect>
        );
      })}
      {model.portals.map((p) => (
        <line key={p.id} x1={p.opening.a.x} y1={p.opening.a.z} x2={p.opening.b.x} y2={p.opening.b.z} style={{ stroke: "var(--ground)" }} strokeWidth={3 * mpp} />
      ))}
      {model.rooms.map((r) => {
        const here = r.id === roomId;
        const layout = roomLabelLayout(r, numbers.get(r.id), here, mpp, labelPx);
        if (!layout.label || !layout.fontPx) return null;
        return (
          <text
            key={`n:${r.id}`}
            x={layout.label.x}
            y={layout.label.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={layout.fontPx * mpp}
            fontWeight={here ? 600 : 500}
            style={{ fill: "var(--ink)", fontFamily: "var(--sans-stack)", fontVariantNumeric: "tabular-nums" }}
          >
            {numbers.get(r.id)}
          </text>
        );
      })}
      {currentLayout?.dot ? (
        headingDeg === null ? (
          <circle cx={currentLayout.dot.x} cy={currentLayout.dot.y} r={4 * mpp} style={{ fill: "var(--ink)" }} />
        ) : (
          <path
            d={ARROW_PX}
            transform={`translate(${currentLayout.dot.x} ${currentLayout.dot.y}) rotate(${headingDeg}) scale(${mpp})`}
            style={{ fill: "var(--ink)", stroke: "var(--ground)" }}
            strokeWidth={1}
            data-slot="museum-plan-heading"
            data-heading={headingDeg}
          />
        )
      ) : null}
    </svg>
  );
}

/**
 * 192 x 192: the 44 px header (eyebrow and Expand plan), the drawing fitted to a 174 x 118 box, and
 * the dot's legend. The room's name is the StudyBar location; screen readers also get it here.
 */
export function Minimap({ model, roomId, headingDeg = null, roomLabel, onExpand }: { model: SceneModel; roomId: string | null; headingDeg?: number | null; roomLabel(roomId: string): string; onExpand(): void }) {
  const n = roomId ? roomNumbers(model).get(roomId) : undefined;
  const room = roomId ? model.rooms.find((r) => r.id === roomId) : undefined;
  return (
    <section aria-label={PLAN_TEXT.plan} data-museum-keys="ui" data-slot="museum-minimap" className="flex size-48 flex-col border border-rule-strong bg-ground">
      <div className="flex h-11 shrink-0 items-center justify-between pl-3">
        <p className="text-label">{PLAN_TEXT.plan}</p>
        <Button type="button" variant="ghost" size="icon" aria-label={PLAN_TEXT.expand} title={PLAN_TEXT.expand} onClick={onExpand}>
          <Maximize2 aria-hidden="true" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        <PlanDrawing model={model} roomId={roomId} headingDeg={headingDeg} boxPx={MINIMAP_BOX} labelPx={11} className="block" style={{ width: MINIMAP_BOX.w, height: MINIMAP_BOX.h }} />
      </div>
      <p className="flex h-7 shrink-0 items-center gap-2 px-3 pb-2 text-[0.8125rem] leading-5 text-ink">
        <HereMark headingDeg={headingDeg} />
        <span className="min-w-0">
          {PLAN_TEXT.youAreHere}
          {room ? (
            <span className="sr-only">
              : {n ? `${n} ` : ""}
              {titleCase(planRoomName(room, roomLabel))}
              {headingDeg !== null ? `, facing ${compassWord(headingDeg)}` : ""}
            </span>
          ) : null}
        </span>
      </p>
    </section>
  );
}

/** The legend's mark: the arrow (pointing up, as on the plan when facing north) or, before the scene reports a heading, the dot. */
function HereMark({ headingDeg }: { headingDeg: number | null }) {
  if (headingDeg === null) return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full bg-ink" />;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="-7 -9 14 16" className="size-3.5 shrink-0" style={{ fill: "var(--ink)" }}>
      <path d={ARROW_PX} />
    </svg>
  );
}

export function PlanDialog({
  open,
  onOpenChange,
  model,
  roomId,
  headingDeg = null,
  roomLabel,
  zoneLabel,
  onRoom,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  model: SceneModel;
  roomId: string | null;
  headingDeg?: number | null;
  roomLabel(roomId: string): string;
  zoneLabel(roomId: string): string | null;
  onRoom(roomId: string): void;
}) {
  const roomTitle = (r: SceneRoom) => {
    const n = numbers.get(r.id);
    const name = titleCase(planRoomName(r, roomLabel));
    const zone = zoneLabel(r.id);
    return `${n ? `${n}. ` : ""}${name}${zone && titleCase(zone) !== name ? `, ${titleCase(zone)}` : ""}`;
  };
  const numbers = roomNumbers(model);
  const rooms = planOrder(model);
  const box = planBox(model);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Opaque, like the figure lightbox: nothing of the scene shows through on a study route. */}
        <DialogOverlay className="bg-ground" data-slot="museum-plan-backdrop" />
        <DialogPrimitive.Content
          data-museum-keys="ui"
          data-slot="museum-plan-dialog"
          className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[min(56rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-card border border-rule-strong bg-ground p-6 font-sans text-[0.9375rem] leading-6 text-ink outline-none max-xs:p-4"
        >
          <DialogHeader className="pr-24">
            <DialogTitle>{PLAN_TEXT.title}</DialogTitle>
            <DialogDescription>{PLAN_TEXT.description}</DialogDescription>
          </DialogHeader>
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="border border-rule bg-ground p-2">
              <PlanDrawing model={model} roomId={roomId} headingDeg={headingDeg} roomTitle={roomTitle} boxPx={{ w: 480, h: (480 * box.h) / box.w }} labelPx={13} className="block h-auto w-full" style={{ aspectRatio: `${box.w} / ${box.h}` }} />
            </div>
            <ol aria-label={PLAN_TEXT.roomsLabel} className="list-none">
              {rooms.map((r) => {
                const here = r.id === roomId;
                const n = numbers.get(r.id);
                const name = titleCase(planRoomName(r, roomLabel));
                // The zone line only when it adds something ("Comparison Hall" is its own zone).
                const zoneRaw = zoneLabel(r.id);
                const zone = zoneRaw && titleCase(zoneRaw) !== name ? zoneRaw : null;
                return (
                  <li key={r.id} className="border-t border-rule first:border-t-0">
                    <button
                      type="button"
                      aria-current={here ? "location" : undefined}
                      data-section={sectionOfZoneGroup(r.group)?.id}
                      data-tradition={r.traditionSlug ?? undefined}
                      aria-label={`${n ? `${n}. ` : ""}${name}${zone ? `, ${titleCase(zone)}` : ""}${here ? ` (${PLAN_TEXT.youAreHere})` : ""}. ${PLAN_TEXT.walkTo(name)}.`}
                      onClick={() => {
                        onOpenChange(false);
                        onRoom(r.id);
                      }}
                      className="text-ui flex min-h-11 w-full items-start gap-3 py-2 text-left text-ink hover:bg-sunk"
                    >
                      <span className="w-6 shrink-0 text-right text-ink-3 tabular-nums">{n ?? ""}</span>
                      <span className="min-w-0">
                        <span className={here ? "font-semibold" : undefined}>{name}</span>
                        {zone ? <span className="text-credit block">{titleCase(zone)}</span> : null}
                        {here ? <span className="block text-[0.8125rem] leading-5 font-semibold text-ink">{PLAN_TEXT.youAreHere}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" className="absolute top-3 right-3 px-3" data-slot="dialog-close-button">
              <XIcon aria-hidden="true" />
              {PLAN_TEXT.close}
            </Button>
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
