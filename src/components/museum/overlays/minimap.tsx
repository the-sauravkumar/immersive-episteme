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
 * Hidden when the study sets `minimap: "off"`; the museum hides the minimap while the panel covers
 * the scene (under 1024 px).
 */
import { Maximize2, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { CSSProperties } from "react";

import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { roomAt, type SceneModel, type SceneRoom } from "@/features/immersive/scene-model";
import { compareTraditionSlugs } from "@/features/learning/labels";
import { sectionOfZoneGroup } from "@/features/learning/sections";
import { PLAN_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";


/**
 * Whether the plan is shown when the museum opens: it follows the protocol's `minimap` setting
 * (DR-021 lead decision; concept note "the map may be minimised"): "on" shows it, "toggle" starts
 * minimised behind the StudyBar's Plan button, "off" has no plan at all.
 */
export function planDefaultOpen(minimap: "on" | "off" | "toggle"): boolean {
  return minimap === "on";
}

/** Centres closer than this (metres) along z share a row of the plan. */
const ROW_TOLERANCE_M = 1;
/** Margin of the drawing around the rooms, in metres (room for the outline strokes). */
const PLAN_PAD_M = 0.4;
/** The eight compass points the heading arrow can show, for its accessible name. */
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
export function compassWord(deg: number): string {
  return COMPASS[(((Math.round(deg / 45) % 8) + 8) % 8)]!;
}
/** The arrow's outline in CSS px, pointing up (north) about the room's mark: 14 px tall, 12 px wide. */
const ARROW_PX = "M0,-8 L6,6 L0,3 L-6,6 Z";

/** Smallest room number drawn, in CSS px. A number that cannot be set this large clear of its outline is omitted. */
const MIN_LABEL_PX = 10;
/** The minimap's drawing box inside its 192 x 192 frame (44 px header, 28 px legend, 8 px sides). */
const MINIMAP_BOX = { w: 174, h: 118 } as const;

/**
 * The plan's room numbers (the same on the minimap and the full plan): a room built for a section
 * of the shared section map carries that section's number, so section n of a tradition is number n
 * in its 2D index and room n of its museum wing (DR-024). Rooms that are no section (the entrance
 * lobby, the shared commons) have none.
 */
export function roomNumbers(model: Pick<SceneModel, "rooms">): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of model.rooms) {
    const section = sectionOfZoneGroup(r.group);
    if (section) out.set(r.id, section.number);
  }
  return out;
}

/** The name the plan gives a room: its section's title (as in the 2D index), else the room's own label. */
export function planRoomName(room: Pick<SceneRoom, "id" | "group">, roomLabel: (roomId: string) => string): string {
  return sectionOfZoneGroup(room.group)?.title ?? roomLabel(room.id);
}

/**
 * The full plan's list order: the room the visitor enters by (the spawn) first; then each wing in
 * the canonical tradition order (DR-019), its rooms by section number; then the other numbered
 * rooms (the comparison hall) by number; then the rest in reading order of the plan (top to bottom,
 * then left to right).
 */
export function planOrder(model: Pick<SceneModel, "rooms"> & Partial<Pick<SceneModel, "spawn">>): SceneRoom[] {
  const numbers = roomNumbers(model);
  const entrance = model.spawn ? roomAt(model.rooms, model.spawn) : null;
  const cx = (r: SceneRoom) => (r.bounds.minX + r.bounds.maxX) / 2;
  const cz = (r: SceneRoom) => (r.bounds.minZ + r.bounds.maxZ) / 2;
  const rank = (r: SceneRoom) => (entrance && r.id === entrance.id ? 0 : r.traditionSlug && numbers.has(r.id) ? 1 : numbers.has(r.id) ? 2 : 3);
  return [...model.rooms].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) return compareTraditionSlugs(a.traditionSlug!, b.traditionSlug!) || numbers.get(a.id)! - numbers.get(b.id)!;
    if (ra === 2) return numbers.get(a.id)! - numbers.get(b.id)!;
    return Math.abs(cz(a) - cz(b)) > ROW_TOLERANCE_M ? cz(a) - cz(b) : cx(a) - cx(b);
  });
}

/**
 * Number size and placement inside a room, in CSS px of the drawing: at most `labelPx`, at least
 * `MIN_LABEL_PX`, with 3 px clearance from the outline; a number that does not fit is omitted. The
 * current room's 8 px dot sits under its number when the room is tall enough, beside it when it is
 * wide enough, and alone (without the number) otherwise.
 */
function roomLabelLayout(r: SceneRoom, n: number | undefined, here: boolean, mpp: number, labelPx: number) {
  const wPx = (r.bounds.maxX - r.bounds.minX) / mpp;
  const hPx = (r.bounds.maxZ - r.bounds.minZ) / mpp;
  const cx0 = (r.bounds.minX + r.bounds.maxX) / 2;
  const cz0 = (r.bounds.minZ + r.bounds.maxZ) / 2;
  // A room that is no section has no number: only the current room's dot, centred.
  if (n === undefined) return { fontPx: null, label: null, dot: here ? { x: cx0, y: cz0 } : null };
  const digits = String(n).length;
  // Digits are about 0.62 em wide and 0.73 em tall (lining); 3 px clearance on every side.
  const fit = Math.min(labelPx, (hPx - 6) / 0.73, (wPx - 6) / (digits * 0.62));
  const fontPx = fit >= MIN_LABEL_PX ? fit : null;
  const cx = (r.bounds.minX + r.bounds.maxX) / 2;
  const cz = (r.bounds.minZ + r.bounds.maxZ) / 2;
  if (!here) return { fontPx, label: fontPx ? { x: cx, y: cz } : null, dot: null };
  if (!fontPx) return { fontPx: null, label: null, dot: { x: cx, y: cz } };
  const numW = digits * 0.62 * fontPx;
  const numH = 0.73 * fontPx;
  // Number over dot: number, 4 px gap, 8 px dot, centred as one block.
  if (hPx >= numH + 4 + 8 + 6) {
    const block = numH + 4 + 8;
    return { fontPx, label: { x: cx, y: cz - (block / 2 - numH / 2) * mpp }, dot: { x: cx, y: cz + (block / 2 - 4) * mpp } };
  }
  // Number beside dot.
  if (wPx >= numW + 4 + 8 + 6) {
    const block = numW + 4 + 8;
    return { fontPx, label: { x: cx - (block / 2 - numW / 2) * mpp, y: cz }, dot: { x: cx + (block / 2 - 4) * mpp, y: cz } };
  }
  return { fontPx: null, label: null, dot: { x: cx, y: cz } };
}

/** The drawing's extent in metres: the museum's bounds plus a margin for the strokes. */
function planBox(model: SceneModel) {
  const b = model.bounds;
  return { x: b.minX - PLAN_PAD_M, y: b.minZ - PLAN_PAD_M, w: b.maxX - b.minX + 2 * PLAN_PAD_M, h: b.maxZ - b.minZ + 2 * PLAN_PAD_M };
}

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
  onRoom,
}: {
  model: SceneModel;
  roomId: string | null;
  headingDeg: number | null;
  boxPx: { w: number; h: number };
  labelPx: number;
  className?: string;
  style?: CSSProperties;
  /**
   * Full plan: a click on a room in the drawing walks there, as its row in the list does (the
   * dialog says "Select a room to walk there"; final review novice-3d-plan-drawing-not-clickable).
   * Pointer only: the drawing is aria-hidden and the list is the keyboard and screen-reader path.
   */
  onRoom?(roomId: string): void;
  /** Full plan: each room's name, shown on hover (an SVG title). */
  roomTitle?: (r: SceneRoom) => string;
}) {
  const v = planBox(model);
  const mpp = Math.max(v.w / boxPx.w, v.h / boxPx.h);
  const numbers = roomNumbers(model);
  const current = roomId ? model.rooms.find((r) => r.id === roomId) : undefined;
  const currentLayout = current ? roomLabelLayout(current, numbers.get(current.id), true, mpp, labelPx) : null;
  return (
    <svg
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      className={className}
      style={onRoom ? { ...style, cursor: "pointer" } : style}
      aria-hidden="true"
      focusable="false"
      data-slot="museum-plan-drawing"
      onClick={
        onRoom
          ? (e) => {
              // The room under the pointer, in plan coordinates (labels drawn over a room count as the room).
              const m = e.currentTarget.getScreenCTM();
              if (!m) return;
              const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
              const hit = model.rooms.find((r) => pt.x >= r.bounds.minX && pt.x <= r.bounds.maxX && pt.y >= r.bounds.minZ && pt.y <= r.bounds.maxZ);
              if (hit) onRoom(hit.id);
            }
          : undefined
      }
    >
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
              <PlanDrawing
                model={model}
                roomId={roomId}
                headingDeg={headingDeg}
                roomTitle={roomTitle}
                onRoom={(id) => {
                  onOpenChange(false);
                  onRoom(id);
                }}
                boxPx={{ w: 480, h: (480 * box.h) / box.w }}
                labelPx={13}
                className="block h-auto w-full"
                style={{ aspectRatio: `${box.w} / ${box.h}` }}
              />
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
