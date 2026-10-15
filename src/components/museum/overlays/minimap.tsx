"use client";

/**
 * The plan (DESIGN.md 11.6; CN-11 "the map may be minimised").
 *
 *  - `Minimap`: bottom-left, a 192 x 192 px plan on opaque `--ground` with a 1 px `--rule-strong`
 *    border and the eyebrow "Plan". Rooms are 1.5 px `--ink` outlines, unfilled, labelled with their
 *    numbers (`tabular-nums`); the current room has a 2 px outline, an 8 px ink dot and the text
 *    "You Are Here". No fills, no tradition colour, and nothing moves: the dot marks the room, not
 *    the visitor's live position. A 44 px "Expand plan" button opens the full plan.
 *  - `PlanDialog`: the full plan with the same drawing and every room by number and name as a 44 px
 *    button that walks there (the keyboard route to any room). On a study route nothing may be
 *    translucent or shadowed (4.6, 12.2 rule 6), so it opens over an opaque `--ground` backdrop on
 *    an unshadowed `--surface` sheet.
 * Rooms are numbered in reading order of the plan, the entrance first: then zone by zone (the
 * manifest's zone order), and within a zone top to bottom, then left to right. Numbers are at least
 * 10 px; a room too small to hold its number clear of the outline shows none (the full plan lists
 * every room by number and name).
 * Hidden when the study sets `minimap: "off"`; the museum hides the minimap while the panel covers
 * the scene (under 1024 px).
 */
import { Maximize2, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { CSSProperties } from "react";

import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { roomAt, type SceneModel, type SceneRoom } from "@/features/immersive/scene-model";
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
/** Smallest room number drawn, in CSS px. A number that cannot be set this large clear of its outline is omitted. */
const MIN_LABEL_PX = 10;
/** The minimap's drawing box inside its 192 x 192 frame (44 px header, 28 px legend, 8 px sides). */
const MINIMAP_BOX = { w: 174, h: 118 } as const;

/**
 * Rooms numbered 1..n in reading order of the plan (the same numbers on the minimap and the full
 * plan). The room the visitor enters by (the spawn) is 1, and the rest of its zone follows; then
 * zone by zone in the manifest's zone order (a room without a zone is its own group), and within a
 * zone row by row from the top (smaller z), each row from the left (smaller x).
 */
export function roomNumbers(model: Pick<SceneModel, "rooms"> & Partial<Pick<SceneModel, "spawn">>): Map<string, number> {
  const groups = new Map<string, SceneRoom[]>();
  for (const r of model.rooms) {
    const key = r.zoneId ?? `room:${r.id}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const entrance = model.spawn ? roomAt(model.rooms, model.spawn) : null;
  const entranceKey = entrance ? (entrance.zoneId ?? `room:${entrance.id}`) : null;
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === entranceKey ? -1 : b === entranceKey ? 1 : 0));
  const cx = (r: SceneRoom) => (r.bounds.minX + r.bounds.maxX) / 2;
  const cz = (r: SceneRoom) => (r.bounds.minZ + r.bounds.maxZ) / 2;
  const out = new Map<string, number>();
  let n = 1;
  for (const [key, rooms] of ordered) {
    const byZ = [...rooms].sort((a, b) => cz(a) - cz(b) || cx(a) - cx(b));
    const rows: SceneRoom[][] = [];
    for (const r of byZ) {
      const row = rows[rows.length - 1];
      if (row && cz(r) - cz(row[0]!) <= ROW_TOLERANCE_M) row.push(r);
      else rows.push([r]);
    }
    const seq = rows.flatMap((row) => row.sort((a, b) => cx(a) - cx(b)));
    if (key === entranceKey && entrance) seq.sort((a, b) => (a.id === entrance.id ? -1 : b.id === entrance.id ? 1 : 0));
    for (const r of seq) out.set(r.id, n++);
  }
  return out;
}

/**
 * Number size and placement inside a room, in CSS px of the drawing: at most `labelPx`, at least
 * `MIN_LABEL_PX`, with 3 px clearance from the outline; a number that does not fit is omitted. The
 * current room's 8 px dot sits under its number when the room is tall enough, beside it when it is
 * wide enough, and alone (without the number) otherwise.
 */
function roomLabelLayout(r: SceneRoom, n: number, here: boolean, mpp: number, labelPx: number) {
  const wPx = (r.bounds.maxX - r.bounds.minX) / mpp;
  const hPx = (r.bounds.maxZ - r.bounds.minZ) / mpp;
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
function PlanDrawing({ model, roomId, boxPx, labelPx, className, style }: { model: SceneModel; roomId: string | null; boxPx: { w: number; h: number }; labelPx: number; className?: string; style?: CSSProperties }) {
  const v = planBox(model);
  const mpp = Math.max(v.w / boxPx.w, v.h / boxPx.h);
  const numbers = roomNumbers(model);
  const current = roomId ? model.rooms.find((r) => r.id === roomId) : undefined;
  const currentLayout = current ? roomLabelLayout(current, numbers.get(current.id) ?? 0, true, mpp, labelPx) : null;
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
            fill="none"
            style={{ stroke: "var(--ink)" }}
            strokeWidth={(here ? 2 : 1.5) * mpp}
          />
        );
      })}
      {model.portals.map((p) => (
        <line key={p.id} x1={p.opening.a.x} y1={p.opening.a.z} x2={p.opening.b.x} y2={p.opening.b.z} style={{ stroke: "var(--ground)" }} strokeWidth={3 * mpp} />
      ))}
      {model.rooms.map((r) => {
        const here = r.id === roomId;
        const layout = roomLabelLayout(r, numbers.get(r.id) ?? 0, here, mpp, labelPx);
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
      {currentLayout?.dot ? <circle cx={currentLayout.dot.x} cy={currentLayout.dot.y} r={4 * mpp} style={{ fill: "var(--ink)" }} /> : null}
    </svg>
  );
}

/**
 * 192 x 192: the 44 px header (eyebrow and Expand plan), the drawing fitted to a 174 x 118 box, and
 * the dot's legend. The room's name is the StudyBar location; screen readers also get it here.
 */
export function Minimap({ model, roomId, roomLabel, onExpand }: { model: SceneModel; roomId: string | null; roomLabel(roomId: string): string; onExpand(): void }) {
  const n = roomId ? roomNumbers(model).get(roomId) : undefined;
  return (
    <section aria-label={PLAN_TEXT.plan} data-museum-keys="ui" data-slot="museum-minimap" className="flex size-48 flex-col border border-rule-strong bg-ground">
      <div className="flex h-11 shrink-0 items-center justify-between pl-3">
        <p className="text-label">{PLAN_TEXT.plan}</p>
        <Button type="button" variant="ghost" size="icon" aria-label={PLAN_TEXT.expand} title={PLAN_TEXT.expand} onClick={onExpand}>
          <Maximize2 aria-hidden="true" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        <PlanDrawing model={model} roomId={roomId} boxPx={MINIMAP_BOX} labelPx={11} className="block" style={{ width: MINIMAP_BOX.w, height: MINIMAP_BOX.h }} />
      </div>
      <p className="flex h-7 shrink-0 items-center gap-2 px-3 pb-2 text-[0.8125rem] leading-5 text-ink">
        <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full bg-ink" />
        <span className="min-w-0">
          {PLAN_TEXT.youAreHere}
          {roomId && n ? (
            <span className="sr-only">
              : {n} {titleCase(roomLabel(roomId))}
            </span>
          ) : null}
        </span>
      </p>
    </section>
  );
}

export function PlanDialog({
  open,
  onOpenChange,
  model,
  roomId,
  roomLabel,
  zoneLabel,
  onRoom,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  model: SceneModel;
  roomId: string | null;
  roomLabel(roomId: string): string;
  zoneLabel(roomId: string): string | null;
  onRoom(roomId: string): void;
}) {
  const numbers = roomNumbers(model);
  const rooms = [...model.rooms].sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));
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
              <PlanDrawing model={model} roomId={roomId} boxPx={{ w: 480, h: (480 * box.h) / box.w }} labelPx={13} className="block h-auto w-full" style={{ aspectRatio: `${box.w} / ${box.h}` }} />
            </div>
            <ol aria-label={PLAN_TEXT.roomsLabel} className="list-none">
              {rooms.map((r) => {
                const here = r.id === roomId;
                const name = titleCase(roomLabel(r.id));
                // The zone line only when it adds something ("Comparison Hall" is its own zone).
                const zoneRaw = zoneLabel(r.id);
                const zone = zoneRaw && titleCase(zoneRaw) !== name ? zoneRaw : null;
                return (
                  <li key={r.id} className="border-t border-rule first:border-t-0">
                    <button
                      type="button"
                      aria-current={here ? "location" : undefined}
                      aria-label={`${numbers.get(r.id)}. ${name}${zone ? `, ${titleCase(zone)}` : ""}${here ? ` (${PLAN_TEXT.youAreHere})` : ""}. ${PLAN_TEXT.walkTo(name)}.`}
                      onClick={() => {
                        onOpenChange(false);
                        onRoom(r.id);
                      }}
                      className="text-ui flex min-h-11 w-full items-start gap-3 py-2 text-left text-ink hover:bg-sunk"
                    >
                      <span className="w-6 shrink-0 text-right text-ink-3 tabular-nums">{numbers.get(r.id)}</span>
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
