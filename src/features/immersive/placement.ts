/**
 * Placement and legibility of in-world text (lead requirement: "text and data in the 3D museum
 * must be neatly placed ... while staying equivalent to 2D").
 *
 * Every rule here is applied uniformly from the manifest (never per exhibit):
 *  - L1 type size: the lettering's em size in metres is derived from the farthest approach
 *    distance in the manifest so every line subtends at least the angle of 16 px body text on a
 *    1280 x 800 screen with the museum's 62 degree vertical field of view (`minTextEm`).
 *  - L2 door signs: every doorway gets a sign on each lintel face naming the room (and the zone,
 *    when it changes) it leads to, centred over the opening, 3 mm proud of the lintel.
 *  - In-world text carries titles only (exhibit title, type, step, tradition, room and zone
 *    names); claim text exists only in the tracked HTML panel, as on the 2D cards.
 *
 * `placementReport` measures the manifest + scene model against the placement checks (P1-P8) and
 * returns the numbers the C-series reports.
 */
import type { Point } from "@/features/spatial/compiler/types";

import { VISITOR, type CollisionWorld } from "./navigation";
import type { Facing, SceneModel, ScenePlane, ScenePortal } from "./scene-model";

export const LEGIBILITY = {
  /** Reference: 16 px body text on a 1280 x 800 screen. */
  referencePx: 16,
  referenceViewportHeight: 800,
  verticalFovDeg: VISITOR.fov,
} as const;

/** Angle (radians) subtended by `px` pixels at the centre of a viewport `h` pixels high with vertical FOV `fovDeg`. */
export function pixelAngle(px: number, h: number, fovDeg: number): number {
  const t = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return 2 * Math.atan((px / 2 / (h / 2)) * t);
}

export const MIN_TEXT_ANGLE = pixelAngle(LEGIBILITY.referencePx, LEGIBILITY.referenceViewportHeight, LEGIBILITY.verticalFovDeg);

/** Smallest em (metres) that subtends MIN_TEXT_ANGLE at distance d. */
export function emForDistance(d: number): number {
  return 2 * d * Math.tan(MIN_TEXT_ANGLE / 2);
}

/** Angle subtended by an em of `em` metres seen face-on at distance d. */
export function emAngle(em: number, d: number): number {
  return 2 * Math.atan(em / 2 / d);
}

const NORMAL: Record<Facing, [number, number, number]> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };

export function planeCentre(p: Pick<ScenePlane, "min" | "max">): [number, number, number] {
  return [(p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2];
}

/** Distance from the visitor's eye at `at` to the farthest corner of a wall plane. */
export function farthestDistance(at: Point, p: Pick<ScenePlane, "min" | "max">): number {
  let d = 0;
  for (const x of [p.min[0], p.max[0]]) for (const y of [p.min[1], p.max[1]]) for (const z of [p.min[2], p.max[2]]) d = Math.max(d, Math.hypot(x - at.x, y - VISITOR.eyeHeight, z - at.z));
  return d;
}

/** Type sizes (metres) applied to every exhibit panel, from the farthest approach distance. */
export function panelTypeScale(model: Pick<SceneModel, "exhibits">) {
  const dMax = Math.max(0, ...model.exhibits.map((e) => farthestDistance(e.approach, e.panel)));
  const em = Math.ceil(emForDistance(dMax) * 1000) / 1000;
  return { approachDistanceMax: dMax, kickerEm: em, footerEm: em, titleEm: Math.ceil(em * 1.9 * 1000) / 1000 };
}

/** Door-sign geometry: proud of the lintel, centred over the opening, between head lining and ceiling. */
export const DOOR_SIGN = { offset: 0.003, height: 0.3, maxWidth: 1.4, sideMargin: 0.05, gapAboveOpening: 0.08, kickerEm: 0.07, titleEm: 0.1 } as const;
/** Category signs (manifest `label` elements): one line of capitals at 30% of the sign height. */
export const CATEGORY_SIGN_EM_FRACTION = 0.3;

export interface SceneDoorSign {
  id: string;
  portalId: string;
  /** Room the sign is seen from (and is resident with). */
  roomId: string;
  /** Room it names. */
  toRoomId: string;
  sign: ScenePlane;
}

/** Two signs per doorway (one per lintel face), each naming the room on the other side. */
export function doorSigns(model: Pick<SceneModel, "portals" | "rooms">): SceneDoorSign[] {
  const rooms = new Map(model.rooms.map((r) => [r.id, r]));
  const out: SceneDoorSign[] = [];
  for (const p of model.portals) {
    if (!p.lintel) continue;
    const w = Math.min(DOOR_SIGN.maxWidth, p.width - 2 * DOOR_SIGN.sideMargin);
    const y0 = p.height + DOOR_SIGN.gapAboveOpening;
    const y1 = y0 + DOOR_SIGN.height;
    if (y1 > p.lintel.max[1] - 0.02 || w <= 0) continue;
    for (const roomId of p.connects) {
      const room = rooms.get(roomId);
      if (!room) continue;
      const toRoomId = p.connects.find((r) => r !== roomId) ?? roomId;
      const c = { x: (room.bounds.minX + room.bounds.maxX) / 2, z: (room.bounds.minZ + room.bounds.maxZ) / 2 };
      let sign: ScenePlane;
      if (p.axis === "z") {
        const side = c.x > p.position.x ? 1 : -1;
        const x = side > 0 ? p.lintel.max[0] + DOOR_SIGN.offset : p.lintel.min[0] - DOOR_SIGN.offset;
        sign = { id: `door-sign:${p.id}:${roomId}`, elementId: p.id, kind: "sign", facing: side > 0 ? "+x" : "-x", min: [x, y0, p.position.z - w / 2], max: [x, y1, p.position.z + w / 2], uv: "metre", wallOffset: DOOR_SIGN.offset, polygonOffset: { factor: -1, units: -1 }, aspectRatio: null, assetId: null };
      } else {
        const side = c.z > p.position.z ? 1 : -1;
        const z = side > 0 ? p.lintel.max[2] + DOOR_SIGN.offset : p.lintel.min[2] - DOOR_SIGN.offset;
        sign = { id: `door-sign:${p.id}:${roomId}`, elementId: p.id, kind: "sign", facing: side > 0 ? "+z" : "-z", min: [p.position.x - w / 2, y0, z], max: [p.position.x + w / 2, y1, z], uv: "metre", wallOffset: DOOR_SIGN.offset, polygonOffset: { factor: -1, units: -1 }, aspectRatio: null, assetId: null };
      }
      out.push({ id: sign.id, portalId: p.id, roomId, toRoomId, sign });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------

interface TextPlane {
  id: string;
  kind: "panel" | "sign" | "door-sign";
  roomId: string;
  plane: ScenePlane;
}

/** Plane coordinate (along the facing axis), u range along the wall, y range. */
function frame(p: Pick<ScenePlane, "min" | "max" | "facing">) {
  const ax = p.facing === "+x" || p.facing === "-x" ? 0 : 2;
  const ua = ax === 0 ? 2 : 0;
  return { at: p.min[ax]!, u0: p.min[ua]!, u1: p.max[ua]!, y0: p.min[1], y1: p.max[1], ax, ua };
}

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

export interface PlacementReport {
  textPlanes: { panels: number; categorySigns: number; doorSigns: number };
  /** P1 eye-height band: distinct y ranges of panels and of signage. */
  panelBands: string[];
  signageBands: string[];
  /** P2 offset from the wall (m). */
  offsets: number[];
  /** P3 panels on one wall share top and bottom (shared baseline): walls checked / walls failing. */
  sharedBaseline: { walls: number; failing: string[] };
  /** P4 spacing per wall: largest and smallest edge-to-edge gaps between neighbouring panels. */
  spacing: { walls: number; minGap: number; maxGap: number; maxSpreadWithinWall: number };
  /** P5 overlaps (label-label, label-exhibit, label-doorway, label clipping geometry). */
  overlaps: string[];
  /** P6 facing: largest angle between a panel's normal and the line to its approach point (deg). */
  maxFacingAngleDeg: number;
  /** P7 angular size at the approach point. */
  legibility: { minAngleRequiredRad: number; approachDistanceMax: number; kickerEm: number; titleEm: number; minKickerAngleRad: number; minTitleAngleRad: number; failing: string[] };
  /** P8 every doorway has a sign on each side naming where it leads, readable from 2.5 m in front. */
  doorSignage: { doorways: number; sides: number; signed: number; visibleFrom: number; minAngleRad: number; failing: string[] };
}

export function placementReport(model: SceneModel, world: CollisionWorld): PlacementReport {
  const signs = doorSigns(model);
  const planes: TextPlane[] = [
    ...model.exhibits.map((e) => ({ id: e.id, kind: "panel" as const, roomId: e.roomId, plane: e.panel })),
    ...model.labels.map((l) => ({ id: l.id, kind: "sign" as const, roomId: l.roomId, plane: l.sign })),
    ...signs.map((s) => ({ id: s.id, kind: "door-sign" as const, roomId: s.roomId, plane: s.sign })),
  ];
  const bands = (list: TextPlane[]) => [...new Set(list.map((t) => `${t.plane.min[1].toFixed(3)}-${t.plane.max[1].toFixed(3)}`))].sort();
  const offsets = [...new Set(planes.map((t) => t.plane.wallOffset ?? -1))].sort();

  // Walls: same room, same facing, same plane coordinate (within 1 cm).
  const walls = new Map<string, TextPlane[]>();
  for (const t of planes.filter((x) => x.kind === "panel")) {
    const f = frame(t.plane);
    const key = `${t.roomId}|${t.plane.facing}|${Math.round(f.at * 100)}`;
    (walls.get(key) ?? walls.set(key, []).get(key)!).push(t);
  }
  const baselineFailing: string[] = [];
  let minGap = Infinity;
  let maxGap = 0;
  let maxSpread = 0;
  for (const [key, list] of walls) {
    if (new Set(list.map((t) => `${t.plane.min[1]}|${t.plane.max[1]}`)).size > 1) baselineFailing.push(key);
    const sorted = [...list].sort((a, b) => frame(a.plane).u0 - frame(b.plane).u0);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = frame(sorted[i - 1]!.plane);
      const b = frame(sorted[i]!.plane);
      // A doorway between two panels ends a run of wall: spacing is measured within runs only.
      const doorBetween = model.portals.some((p) => {
        const along = p.axis === "z" ? 2 : 0;
        if (along !== a.ua) return false;
        const wallAt = along === 2 ? p.position.x : p.position.z;
        const centre = along === 0 ? p.position.x : p.position.z;
        return Math.abs(a.at - wallAt) <= 0.2 && centre > a.u1 && centre < b.u0;
      });
      if (!doorBetween) gaps.push(b.u0 - a.u1);
    }
    if (gaps.length) {
      minGap = Math.min(minGap, ...gaps);
      maxGap = Math.max(maxGap, ...gaps);
      maxSpread = Math.max(maxSpread, Math.max(...gaps) - Math.min(...gaps));
    }
  }

  // Overlaps between text planes on the same wall plane.
  const overlaps: string[] = [];
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      const a = planes[i]!.plane;
      const b = planes[j]!.plane;
      if (a.facing !== b.facing) continue;
      const fa = frame(a);
      const fb = frame(b);
      if (Math.abs(fa.at - fb.at) > 0.01) continue;
      if (overlap1(fa.u0, fa.u1, fb.u0, fb.u1) > 1e-6 && overlap1(fa.y0, fa.y1, fb.y0, fb.y1) > 1e-6) overlaps.push(`text overlap: ${planes[i]!.id} / ${planes[j]!.id}`);
    }
  }
  // Text over a doorway opening on the same wall.
  for (const t of planes.filter((x) => x.kind !== "door-sign")) {
    const f = frame(t.plane);
    for (const p of model.portals) {
      const along = p.axis === "z" ? 2 : 0;
      const across = p.axis === "z" ? 0 : 2;
      if (along !== f.ua) continue;
      const wallAt = across === 0 ? p.position.x : p.position.z;
      if (Math.abs(f.at - wallAt) > 0.2) continue;
      const o0 = Math.min(p.opening.a[along === 0 ? "x" : "z"], p.opening.b[along === 0 ? "x" : "z"]);
      const o1 = Math.max(p.opening.a[along === 0 ? "x" : "z"], p.opening.b[along === 0 ? "x" : "z"]);
      if (overlap1(f.u0, f.u1, o0, o1) > 1e-6 && f.y0 < p.height) overlaps.push(`text over doorway: ${t.id} / ${p.id}`);
    }
  }
  // Text clipping into geometry: every text plane must lie on a wall face (or lintel face) that covers it.
  const faces = [
    ...model.rooms.flatMap((r) => r.walls),
    ...model.portals.flatMap((p) => (p.lintel ? [p.lintel] : [])),
  ];
  for (const t of planes) {
    const f = frame(t.plane);
    const n = NORMAL[t.plane.facing];
    const behind = f.at - n[f.ax]! * (t.plane.wallOffset ?? 0);
    // The faces behind the text (wall pieces, posts and lintels abut along a wall) must cover it.
    const spans = faces
      .filter((b) => {
        const face = n[f.ax]! > 0 ? b.max[f.ax]! : b.min[f.ax]!;
        return Math.abs(face - behind) < 2e-3 && b.min[1] <= f.y0 + 1e-6 && b.max[1] >= f.y1 - 1e-6 && b.max[f.ua]! > f.u0 && b.min[f.ua]! < f.u1;
      })
      .map((b) => [b.min[f.ua]!, b.max[f.ua]!] as const)
      .sort((a, b) => a[0] - b[0]);
    let reach = f.u0;
    for (const [s0, s1] of spans) if (s0 <= reach + 1e-6) reach = Math.max(reach, s1);
    if (reach < f.u1 - 1e-6) overlaps.push(`text not backed by the wall (clips or overhangs): ${t.id}`);
  }
  // Plinths in front of panels must stay below them (label-exhibit).
  for (const e of model.exhibits) {
    if (e.plinth && e.plinth.max[1] > e.panel.min[1] + 1e-6) overlaps.push(`plinth rises into its panel: ${e.id}`);
  }

  // Facing and legibility at the approach point.
  const scale = panelTypeScale(model);
  let maxFacing = 0;
  let minKicker = Infinity;
  let minTitle = Infinity;
  const legFailing: string[] = [];
  for (const e of model.exhibits) {
    const c = planeCentre(e.panel);
    const n = NORMAL[e.panel.facing];
    const vx = e.approach.x - c[0];
    const vz = e.approach.z - c[2];
    const cos = (vx * n[0] + vz * n[2]) / Math.hypot(vx, vz);
    maxFacing = Math.max(maxFacing, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
    const d = farthestDistance(e.approach, e.panel);
    const k = emAngle(scale.kickerEm, d);
    const ti = emAngle(scale.titleEm, d);
    minKicker = Math.min(minKicker, k);
    minTitle = Math.min(minTitle, ti);
    if (k < MIN_TEXT_ANGLE - 1e-9) legFailing.push(e.id);
  }

  // Door signage: readable from 2.5 m in front of the doorway, line of sight clear.
  let visible = 0;
  let minSignAngle = Infinity;
  const doorFailing: string[] = [];
  // The smaller line (the zone kicker) decides.
  const signEm = DOOR_SIGN.kickerEm;
  for (const s of signs) {
    const p = model.portals.find((x) => x.id === s.portalId) as ScenePortal;
    const n = NORMAL[s.sign.facing];
    const at = { x: p.position.x + n[0] * 2.5, z: p.position.z + n[2] * 2.5 };
    const c = planeCentre(s.sign);
    const blocked = world.segmentBlocked(at.x, at.z, c[0] - n[0] * 0.15, c[2] - n[2] * 0.15);
    const a = emAngle(signEm, farthestDistance(at, s.sign));
    minSignAngle = Math.min(minSignAngle, a);
    if (!blocked && a >= MIN_TEXT_ANGLE) visible++;
    else doorFailing.push(`${s.id}${blocked ? " (blocked)" : ""}`);
  }

  return {
    textPlanes: { panels: model.exhibits.length, categorySigns: model.labels.length, doorSigns: signs.length },
    panelBands: bands(planes.filter((t) => t.kind === "panel")),
    signageBands: bands(planes.filter((t) => t.kind !== "panel")),
    offsets,
    sharedBaseline: { walls: walls.size, failing: baselineFailing },
    spacing: { walls: walls.size, minGap: Number.isFinite(minGap) ? minGap : 0, maxGap, maxSpreadWithinWall: maxSpread },
    overlaps,
    maxFacingAngleDeg: maxFacing,
    legibility: { minAngleRequiredRad: MIN_TEXT_ANGLE, approachDistanceMax: scale.approachDistanceMax, kickerEm: scale.kickerEm, titleEm: scale.titleEm, minKickerAngleRad: minKicker, minTitleAngleRad: minTitle, failing: legFailing },
    doorSignage: { doorways: model.portals.length, sides: model.portals.length * 2, signed: signs.length, visibleFrom: visible, minAngleRad: minSignAngle, failing: doorFailing },
  };
}
