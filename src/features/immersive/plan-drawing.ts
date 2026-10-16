/**
 * The museum plan as drawing data, shared by the 3D condition's plan (the minimap and the full plan,
 * src/components/museum/overlays/minimap.tsx) and the public home's Plate 1
 * (src/components/public/museum-plan-plate.tsx), so the two drawings can never differ: the same
 * room outlines, doorway gaps, section numbers and number fitting (DR-024; DR-047, number to
 * confirm at merge). Pure and framework-free, unit-tested in tests/unit/immersive/plan-drawing.test.ts.
 *
 * Coordinates are plan metres: x to the right, the manifest's z downwards (north up, as the
 * minimap). Nothing here is hard-coded per layout, wing or tradition: every outline, number, label
 * and route comes from the compiled scene model.
 */
import { compareTraditionSlugs } from "@/features/learning/labels";
import { sectionOfZoneGroup } from "@/features/learning/sections";

import { createRouter } from "./navigation";
import { roomAt, type SceneExhibit, type SceneModel, type SceneRoom } from "./scene-model";

/** Centres closer than this (metres) along z share a row of the plan. */
const ROW_TOLERANCE_M = 1;
/** Margin of the drawing around the rooms, in metres (room for the outline strokes). */
export const PLAN_PAD_M = 0.4;
/** The eight compass points the heading arrow can show, for its accessible name. */
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
export function compassWord(deg: number): string {
  return COMPASS[(((Math.round(deg / 45) % 8) + 8) % 8)]!;
}
/** The minimap arrow's outline in CSS px, pointing up (north) about the room's mark: 14 px tall, 12 px wide. */
export const ARROW_PX = "M0,-8 L6,6 L0,3 L-6,6 Z";

/** Smallest room number drawn, in CSS px. A number that cannot be set this large clear of its outline is omitted. */
export const MIN_LABEL_PX = 10;

/**
 * The plan's room numbers (the same on the minimap, the full plan and Plate 1): a room built for a
 * section of the shared section map carries that section's number, so section n of a tradition is
 * number n in its 2D index and room n of its museum wing (DR-024). Rooms that are no section (the
 * entrance lobby, the shared commons) have none.
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
 * `minPx`, with 3 px clearance from the outline; a number that does not fit is omitted. The current
 * room's 8 px dot sits under its number when the room is tall enough, beside it when it is wide
 * enough, and alone (without the number) otherwise.
 */
export function roomLabelLayout(r: Pick<SceneRoom, "bounds">, n: number | undefined, here: boolean, mpp: number, labelPx: number, minPx: number = MIN_LABEL_PX) {
  const wPx = (r.bounds.maxX - r.bounds.minX) / mpp;
  const hPx = (r.bounds.maxZ - r.bounds.minZ) / mpp;
  const cx = (r.bounds.minX + r.bounds.maxX) / 2;
  const cz = (r.bounds.minZ + r.bounds.maxZ) / 2;
  // A room that is no section has no number: only the current room's dot, centred.
  if (n === undefined) return { fontPx: null, label: null, dot: here ? { x: cx, y: cz } : null };
  const digits = String(n).length;
  // Digits are about 0.62 em wide and 0.73 em tall (lining); 3 px clearance on every side.
  const fit = Math.min(labelPx, (hPx - 6) / 0.73, (wPx - 6) / (digits * 0.62));
  const fontPx = fit >= minPx ? fit : null;
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
export function planBox(model: Pick<SceneModel, "bounds">) {
  const b = model.bounds;
  return { x: b.minX - PLAN_PAD_M, y: b.minZ - PLAN_PAD_M, w: b.maxX - b.minX + 2 * PLAN_PAD_M, h: b.maxZ - b.minZ + 2 * PLAN_PAD_M };
}

// ---------------------------------------------------------------------------------------
// Plate 1 (public home): the same plan, with the exhibits and the entrance routes
// ---------------------------------------------------------------------------------------

/**
 * Plate 1's drawing rules, in CSS px. The plate is drawn for a box at least `minWidthPx` wide (its
 * narrowest at 1024 px), so a type size given here in px is at least that size on screen; strokes
 * are non-scaling, so they are exactly these widths.
 */
export const PLAN_PLATE = {
  minWidthPx: 340,
  /** Room numbers: at most this size, never under `minNumberPx` (DR-047: >= 12 px). */
  numberPx: 13,
  minNumberPx: 12,
  /** The two room labels ("Entrance", "Comparison Hall"): the `text-label` size. */
  labelPx: 15,
  outlinePx: 1.5,
  gapPx: 3,
  exhibitPx: 3,
  routePx: 2,
  leaderPx: 1,
} as const;

export interface PlanPlateData {
  /** The drawing's viewBox (plan metres). */
  viewBox: { x: number; y: number; w: number; h: number };
  /** Metres per CSS px at the plate's narrowest width (type sizes are `px * mpp` in plan metres). */
  mpp: number;
  rooms: { id: string; x: number; y: number; w: number; h: number }[];
  /** Doorway openings, drawn as gaps in the outlines. */
  gaps: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  numbers: { roomId: string; n: number; x: number; y: number; fontSize: number }[];
  /** Every exhibit (a plate on a wall or a reading stand) at its scene position. */
  exhibits: { id: string; x: number; y: number }[];
  /** The click-to-walk routes from the entrance to each wing's doorway, in canonical wing order. */
  routes: { zoneId: string; points: { x: number; y: number }[]; length: number }[];
  /** Where the visit starts (the spawn), the routes' common start. */
  start: { x: number; y: number } | null;
  /** The entrance and the comparison hall, named outside the rooms on a leader. */
  labels: { roomId: string; text: string; x: number; y: number; fontSize: number; leader: { x1: number; y1: number; x2: number; y2: number } }[];
  /** For the accessible name: what the plan shows, counted from the model. */
  summary: { wings: number; roomsPerWing: number | null; entrance: boolean; hall: boolean; commons: boolean };
}

/** An exhibit mark's clearance from its room's outline (m), so a mark never sits on a wall line. */
export const EXHIBIT_MARK_INSET_M = 0.9;

/**
 * Where an exhibit stands on the plan: its stand or plinth footprint, else its wall plate, held
 * `EXHIBIT_MARK_INSET_M` inside its room so the mark reads apart from the wall line.
 */
export function exhibitPlanPoint(e: Pick<SceneExhibit, "panel" | "plinth">, room: Pick<SceneRoom, "bounds"> | null): { x: number; y: number } {
  const p = e.plinth ?? e.panel;
  const at = { x: (p.min[0] + p.max[0]) / 2, y: (p.min[2] + p.max[2]) / 2 };
  if (!room) return at;
  const b = room.bounds;
  const k = Math.min(EXHIBIT_MARK_INSET_M, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2);
  return { x: Math.min(Math.max(at.x, b.minX + k), b.maxX - k), y: Math.min(Math.max(at.y, b.minZ + k), b.maxZ - k) };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * A room label outside the rooms: the nearest free place (a 1 m search grid inside the plan's
 * bounds) where the label's box clears every room by `clear` metres and every label already placed,
 * with a leader from 1 m inside the room to the box. Null when no place is free.
 */
function placeLabel(room: SceneRoom, text: string, fontSize: number, rooms: readonly SceneRoom[], taken: readonly Box[], bounds: SceneModel["bounds"]) {
  const w = text.length * 0.6 * fontSize;
  const h = 1.25 * fontSize;
  const clear = 0.6;
  const b = room.bounds;
  const c = { x: (b.minX + b.maxX) / 2, y: (b.minZ + b.maxZ) / 2 };
  const roomBoxes = rooms.map((r) => ({ x0: r.bounds.minX - clear, y0: r.bounds.minZ - clear, x1: r.bounds.maxX + clear, y1: r.bounds.maxZ + clear }));
  let best: { box: Box; d: number } | null = null;
  for (let y0 = Math.ceil(bounds.minZ); y0 + h <= bounds.maxZ; y0 += 1) {
    for (let x0 = Math.ceil(bounds.minX); x0 + w <= bounds.maxX; x0 += 1) {
      const box = { x0, y0, x1: x0 + w, y1: y0 + h };
      if (roomBoxes.some((r) => overlaps(r, box)) || taken.some((t) => overlaps(t, box))) continue;
      const dx = Math.max(box.x0 - c.x, 0, c.x - box.x1);
      const dy = Math.max(box.y0 - c.y, 0, c.y - box.y1);
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d - 1e-9) best = { box, d };
    }
  }
  if (!best) return null;
  const box = best.box;
  const bc = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const inset = Math.min(1, (b.maxX - b.minX) / 4, (b.maxZ - b.minZ) / 4);
  const from = { x: Math.min(Math.max(bc.x, b.minX + inset), b.maxX - inset), y: Math.min(Math.max(bc.y, b.minZ + inset), b.maxZ - inset) };
  const to = { x: Math.min(Math.max(from.x, box.x0 - 0.3), box.x1 + 0.3), y: Math.min(Math.max(from.y, box.y0 - 0.3), box.y1 + 0.3) };
  return { box, x: box.x0, y: box.y0 + 0.92 * fontSize, leader: { x1: from.x, y1: from.y, x2: to.x, y2: to.y } };
}

const length = (pts: readonly { x: number; y: number }[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);

/**
 * Plate 1's drawing data: the minimap's rooms, gaps and section numbers (the same functions), plus
 * every exhibit as a mark, the click-to-walk route from the spawn to each wing's doorway (the
 * walkable-grid router the museum walks with; equal in the hub building, DR-043), and the entrance
 * and comparison hall named on leaders. No tradition is coloured, named or enlarged.
 */
export function planPlateData(model: Pick<SceneModel, "rooms" | "portals" | "exhibits" | "zones" | "spawn" | "bounds" | "colliders">, words: { entrance: string; hall: string } = { entrance: "Entrance", hall: "Comparison Hall" }): PlanPlateData {
  const viewBox = planBox(model);
  const mpp = viewBox.w / PLAN_PLATE.minWidthPx;
  const numbers = roomNumbers(model);
  const rooms = model.rooms.map((r) => ({ id: r.id, x: r.bounds.minX, y: r.bounds.minZ, w: r.bounds.maxX - r.bounds.minX, h: r.bounds.maxZ - r.bounds.minZ }));
  const gaps = model.portals.map((p) => ({ id: p.id, x1: p.opening.a.x, y1: p.opening.a.z, x2: p.opening.b.x, y2: p.opening.b.z }));
  const numberMarks: PlanPlateData["numbers"] = [];
  for (const r of model.rooms) {
    const n = numbers.get(r.id);
    const layout = roomLabelLayout(r, n, false, mpp, PLAN_PLATE.numberPx, PLAN_PLATE.minNumberPx);
    if (n !== undefined && layout.label && layout.fontPx) numberMarks.push({ roomId: r.id, n, x: layout.label.x, y: layout.label.y, fontSize: layout.fontPx * mpp });
  }
  const roomById = new Map(model.rooms.map((r) => [r.id, r]));
  const exhibits = model.exhibits.map((e) => ({ id: e.id, ...exhibitPlanPoint(e, roomById.get(e.roomId) ?? null) }));

  // Routes: from the spawn through each doorway of the entrance room that opens into a wing, in the
  // canonical wing order, as the museum's router walks them.
  const entrance = roomAt(model.rooms, model.spawn);
  const zoneOf = new Map(model.rooms.map((r) => [r.id, r.zoneId]));
  const wings = model.zones.filter((z) => z.traditionSlug).sort((a, b) => compareTraditionSlugs(a.traditionSlug!, b.traditionSlug!));
  const router = createRouter(model.rooms, model.colliders);
  const routes: PlanPlateData["routes"] = [];
  if (entrance) {
    for (const z of wings) {
      const door = model.portals
        .filter((p) => p.connects.includes(entrance.id) && p.connects.some((id) => id !== entrance.id && zoneOf.get(id) === z.id))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
      if (!door) continue;
      // The router's path runs between walkable-grid cell centres; its ends are the spawn and the
      // doorway themselves (the cells they fall in would bend each end by a few centimetres).
      const walked = router.route(model.spawn, door.position) ?? [model.spawn, door.position];
      const points = [model.spawn, ...walked.slice(1, -1), door.position].map((p) => ({ x: p.x, y: p.z }));
      routes.push({ zoneId: z.id, points, length: length(points) });
    }
  }

  // The two named rooms, outside the rooms on leaders, in this order (the entrance first).
  const labels: PlanPlateData["labels"] = [];
  const taken: Box[] = [];
  const hall = model.rooms.find((r) => r.roomKind === "hall");
  const named = [entrance ? { room: entrance, text: words.entrance } : null, hall ? { room: hall, text: words.hall } : null].filter((x): x is { room: SceneRoom; text: string } => x !== null);
  for (const { room, text } of named) {
    const fontSize = PLAN_PLATE.labelPx * mpp;
    const at = placeLabel(room, text, fontSize, model.rooms, taken, model.bounds);
    if (!at) continue;
    taken.push(at.box);
    labels.push({ roomId: room.id, text, x: at.x, y: at.y, fontSize, leader: at.leader });
  }

  const perWing = wings.map((z) => model.rooms.filter((r) => r.zoneId === z.id).length);
  return {
    viewBox,
    mpp,
    rooms,
    gaps,
    numbers: numberMarks,
    exhibits,
    routes,
    start: entrance ? { x: model.spawn.x, y: model.spawn.z } : null,
    labels,
    summary: {
      wings: wings.length,
      roomsPerWing: perWing.length > 0 && perWing.every((n) => n === perWing[0]) ? perWing[0]! : null,
      entrance: !!entrance,
      hall: !!hall,
      commons: model.rooms.some((r) => r.roomKind === "commons"),
    },
  };
}
