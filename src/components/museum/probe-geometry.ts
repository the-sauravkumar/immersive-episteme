/**
 * Pure helpers for the C2c surface samplers in probe.ts (immersive-rendering.spec.ts, DR-058 visual
 * pass): which world points to read on a wall, floor, ceiling, door reveal, threshold or door edge
 * for a viewpoint, the pitch that brings them into the frame, and the colour arithmetic applied to
 * the pixels read back. No three.js and no DOM, so every rule here is unit-tested
 * (tests/unit/immersive/probe-geometry.test.ts) before a GPU run uses it.
 *
 * World convention (spatial compiler): 1 unit = 1 m, +y up, x east, z south, yaw 0 = north (-z).
 * Camera convention (museum-scene.tsx): rotation (pitch, yaw, 0) in "YXZ" order, so the view
 * direction is (-sin yaw cos pitch, sin pitch, -cos yaw cos pitch); positive pitch looks up.
 */
import type { Point, Vec3 } from "@/features/spatial/compiler/types";
import { doorSigns } from "@/features/immersive/placement";
import type { SceneBox, SceneModel, ScenePlane, ScenePortal, SceneRoom } from "@/features/immersive/scene-model";
import { entranceDirectory } from "@/features/immersive/wayfinding";

// ---------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------

/** sRGB 8-bit code to display-linear. */
export function srgb8ToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Luma in 8-bit sRGB levels (Rec. 709 weights on the codes), the unit of probe.ts `luminance` and of the C2c "levels". */
export function lumaLevels(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG relative luminance of an 8-bit sRGB colour. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgb8ToLinear(r) + 0.7152 * srgb8ToLinear(g) + 0.0722 * srgb8ToLinear(b);
}

/** WCAG 2.2 contrast ratio of two relative luminances. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * CIELAB (D65) of a display-linear sRGB colour: the same arithmetic as gallery-finish.test.ts, so
 * the rendered floor and walls are judged by the rule their unit targets were computed with.
 */
export function labOfLinear(rgb: readonly number[]): { L: number; a: number; b: number; C: number } {
  const [r, g, b] = rgb as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const L = 116 * f(Y) - 16;
  const a = 500 * (f(X) - f(Y));
  const bb = 200 * (f(Y) - f(Z));
  return { L, a, b: bb, C: Math.hypot(a, bb) };
}

/** Value at fraction `f` of an ascending list (the probe's percentile rule: index floor(f n)). */
export function quantile(sorted: readonly number[], f: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(f * sorted.length)))]!;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

// ---------------------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------------------

export interface ViewPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** A world point in camera space (x right, y up, looking down -z) for a pose with the eye at `eyeY`. */
export function cameraSpace(pose: ViewPose, eyeY: number, p: Vec3): Vec3 {
  const dx = p[0] - pose.x;
  const dy = p[1] - eyeY;
  const dz = p[2] - pose.z;
  // Undo the yaw (about +y), then the pitch (about +x).
  const cy = Math.cos(pose.yaw);
  const sy = Math.sin(pose.yaw);
  const x1 = cy * dx - sy * dz;
  const z1 = sy * dx + cy * dz;
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  return [x1, cp * dy + sp * z1, -sp * dy + cp * z1];
}

/** Normalised device coordinates of a world point (null behind the eye). */
export function projectToNdc(pose: ViewPose, eyeY: number, p: Vec3, vfovDeg: number, aspect: number): { x: number; y: number } | null {
  const [x, y, z] = cameraSpace(pose, eyeY, p);
  if (z >= -1e-6) return null;
  const t = Math.tan((vfovDeg * Math.PI) / 360);
  return { x: x / -z / (t * aspect), y: y / -z / t };
}

/**
 * The pitch that brings every point into the frame (inside `margin` of NDC), keeping the pose's
 * own pitch when it already does: the baked surfaces render the same whatever the pitch (unlit,
 * no exposure adaptation; immersive-rendering-quality.md §1), so tilting only moves them on screen.
 * Null when no pitch within `limit` fits them all.
 */
export function fitPitch(pose: ViewPose, eyeY: number, points: readonly Vec3[], vfovDeg: number, aspect: number, opts: { margin?: number; limit?: number } = {}): number | null {
  const margin = opts.margin ?? 0.88;
  const limit = opts.limit ?? (55 * Math.PI) / 180;
  const fits = (pitch: number) =>
    points.every((p) => {
      const n = projectToNdc({ ...pose, pitch }, eyeY, p, vfovDeg, aspect);
      return !!n && Math.abs(n.x) <= margin && Math.abs(n.y) <= margin;
    });
  if (points.length === 0) return pose.pitch;
  if (fits(pose.pitch)) return pose.pitch;
  // Elevation of each point in the yawed (unpitched) frame.
  const els: number[] = [];
  for (const p of points) {
    const [, y, z] = cameraSpace({ ...pose, pitch: 0 }, eyeY, p);
    if (z >= -1e-6) return null;
    els.push(Math.atan2(y, -z));
  }
  const pitch = Math.max(-limit, Math.min(limit, (Math.max(...els) + Math.min(...els)) / 2));
  return fits(pitch) ? pitch : null;
}

/**
 * `fitPitch` at the view's own yaw, else turned to face the points' plan centroid (for a column far
 * off the view axis): the camera stays where the viewpoint puts it, and only its direction changes,
 * which the baked surfaces do not depend on. Null when neither frames every point.
 */
export function fitView(pose: ViewPose, eyeY: number, points: readonly Vec3[], vfovDeg: number, aspect: number, opts: { margin?: number; limit?: number } = {}): { yaw: number; pitch: number } | null {
  const own = fitPitch(pose, eyeY, points, vfovDeg, aspect, opts);
  if (own !== null) return { yaw: pose.yaw, pitch: own };
  if (points.length === 0) return null;
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cz = points.reduce((s, p) => s + p[2], 0) / points.length;
  if (Math.hypot(cx - pose.x, cz - pose.z) < 1e-6) return null;
  const yaw = Math.atan2(-(cx - pose.x), -(cz - pose.z));
  const pitch = fitPitch({ ...pose, yaw, pitch: 0 }, eyeY, points, vfovDeg, aspect, opts);
  return pitch === null ? null : { yaw, pitch };
}

// ---------------------------------------------------------------------------------------
// Walls, floor and ceiling of a room-wall view
// ---------------------------------------------------------------------------------------

type Facing = "+x" | "-x" | "+z" | "-z";

export interface WallFace {
  roomId: string;
  /** Unit plan direction of the view (axis-aligned). */
  forward: Point;
  /** Unit plan direction to the right of `forward`. */
  right: Point;
  /** The wall face's coordinate along `forward` (the face is the plane `p . forward = depth`). */
  depth: number;
  /** The camera's coordinates along `right` and `forward`. */
  cameraLateral: number;
  cameraDepth: number;
  /** The face's outward normal (towards the camera), and the horizontal axis it lies along. */
  facing: Facing;
  normalAxis: "x" | "z";
  /** The room's interior along `right`. */
  lateral: [number, number];
  floorY: number;
  ceilingY: number | null;
}

export interface WallColumn {
  /** Coordinate along `right` (world metres). */
  lateral: number;
  /** Signed distance from the view axis (m). */
  offset: number;
  /** 0 = the strictest clearances; higher tiers relax them (see WALL_CLEARANCE). */
  tier: number;
}

/**
 * Clearances round a sampling column, strictest first: wall-mounted things (plates, plaques, door
 * signs, the directory board) within `wall` m along the wall; a doorway within `portal` m of its
 * opening; anything standing on the floor in front of the wall (plinths, stands, posts, side walls)
 * within `floor` m along the wall, out to `stripDepth` m from the face. A tier is used only when
 * no column clears the stricter ones; the tier is recorded with each measurement.
 */
export const WALL_CLEARANCE = {
  tiers: [
    { wall: 0.5, portal: 0.6, floor: 1.0 },
    { wall: 0.3, portal: 0.5, floor: 0.6 },
    { wall: 0.15, portal: 0.4, floor: 0.35 },
  ],
  stripDepth: 2.3,
  /** Spacing of the candidate columns along the wall (m). */
  step: 0.1,
  /** A wall box counts as the face when its face is within this of the room's interior edge (m). */
  faceTolerance: 0.003,
} as const;

/** The C2c sample heights and distances (DR-058 visual pass, spec §A1-A3). */
export const C2C = {
  wallHeights: [0.3, 1.9, 3.0] as const,
  /** Wall band for the CIELAB check (card band, F2). */
  wallBand: { y0: 1.55, y1: 2.25, halfWidth: 0.1 },
  floorNear: 0.05,
  floorFar: 1.5,
  /**
   * Extra floor columns either side of the sampling column (m along the wall), for the near and far
   * reads: the floor's grain (floorDetail 0.70) moves a single 7 x 1 px read by several levels, so
   * the contact delta is the mean over five columns (DR-062). Inside every tier's floor clearance.
   */
  floorAlong: [-0.3, -0.15, 0.15, 0.3],
  /** Floor region for the CIELAB check, past most of the contact shading. */
  floorRegion: { out0: 0.6, out1: 1.6, halfWidth: 0.2 },
  /** Ceiling "near the cove" (within 0.3 m of its inner edge) and "2 m in", from the wall face. */
  ceilingNear: 0.25,
  ceilingIn: 2.0,
  /**
   * Columns tried per group (nearest the view axis first, strictest tier first) before the group is
   * reported unmeasured. A column whose points no pitch can frame costs no frame.
   */
  maxColumns: 12,
} as const;

const dot = (a: Point, b: Point) => a.x * b.x + a.z * b.z;

function axisForward(yaw: number): Point | null {
  const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const ax = Math.abs(f.x);
  const az = Math.abs(f.z);
  if (Math.abs(ax - 1) < 1e-6) return { x: Math.sign(f.x), z: 0 };
  if (Math.abs(az - 1) < 1e-6) return { x: 0, z: Math.sign(f.z) };
  return null;
}

function interiorRect(room: SceneRoom) {
  const p = room.floor;
  return p ? { minX: p.min[0], maxX: p.max[0], minZ: p.min[2], maxZ: p.max[2] } : room.bounds;
}

/** A box's extent along a plan direction. */
function extent(b: { min: readonly number[]; max: readonly number[] }, d: Point): [number, number] {
  const xs = [b.min[0]! * d.x + b.min[2]! * d.z, b.max[0]! * d.x + b.max[2]! * d.z, b.min[0]! * d.x + b.max[2]! * d.z, b.max[0]! * d.x + b.min[2]! * d.z];
  return [Math.min(...xs), Math.max(...xs)];
}

/** World point at (`lateral`, `depth`) in a face's plan frame, at height y. */
export function facePoint(face: Pick<WallFace, "forward" | "right">, lateral: number, depth: number, y: number): Vec3 {
  return [lateral * face.right.x + depth * face.forward.x, y, lateral * face.right.z + depth * face.forward.z];
}

/** On the wall face (2 mm proud of it, towards the camera). */
export const wallPoint = (face: WallFace, lateral: number, y: number): Vec3 => facePoint(face, lateral, face.depth - 0.002, y);
/** On the floor, `out` m from the wall face. */
export const floorPoint = (face: WallFace, lateral: number, out: number): Vec3 => facePoint(face, lateral, face.depth - out, face.floorY + 0.001);
/** On the ceiling, `out` m from the wall face (null when the room has no ceiling). */
export const ceilingPoint = (face: WallFace, lateral: number, out: number): Vec3 | null => (face.ceilingY === null ? null : facePoint(face, lateral, face.depth - out, face.ceilingY - 0.001));

/**
 * The wall a room-wall view looks at (`room:<id>#wall`: room centre, yaw a multiple of 90 degrees)
 * and the columns on it where the wall, the floor in front of it and the ceiling above it can be
 * read clear of everything else, nearest the view axis first.
 */
export function planWallColumns(model: Pick<SceneModel, "rooms" | "portals" | "exhibits" | "labels" | "colliders" | "zones" | "spawn">, roomId: string, pose: ViewPose): { face: WallFace; columns: WallColumn[] } | { reason: string } {
  const room = model.rooms.find((r) => r.id === roomId);
  if (!room) return { reason: `no room ${roomId}` };
  const forward = axisForward(pose.yaw);
  if (!forward) return { reason: "view is not axis-aligned" };
  const right = { x: -forward.z, z: forward.x };
  const rect = interiorRect(room);
  const corners: Point[] = [
    { x: rect.minX, z: rect.minZ },
    { x: rect.maxX, z: rect.maxZ },
  ];
  const depth = Math.max(...corners.map((c) => dot(c, forward)));
  const lat = corners.map((c) => dot(c, right));
  const lateral: [number, number] = [Math.min(...lat), Math.max(...lat)];
  const cam = { x: pose.x, z: pose.z };
  const cameraDepth = dot(cam, forward);
  const cameraLateral = dot(cam, right);
  if (depth - cameraDepth < 0.5) return { reason: "camera is at the wall" };
  const facing: Facing = forward.x !== 0 ? (forward.x > 0 ? "-x" : "+x") : forward.z > 0 ? "-z" : "+z";
  const face: WallFace = {
    roomId,
    forward,
    right,
    depth,
    cameraLateral,
    cameraDepth,
    facing,
    normalAxis: forward.x !== 0 ? "x" : "z",
    lateral,
    floorY: room.floor ? room.floor.min[1] : 0,
    ceilingY: room.ceiling ? room.ceiling.min[1] : null,
  };

  // Every wall box in the museum (a wall shared by two rooms is filed under one of them only).
  const walls: SceneBox[] = model.rooms.flatMap((r) => r.walls);
  // Plan extents of a box in the face's frame.
  const frame = (b: { min: readonly number[]; max: readonly number[] }) => ({ lat: extent(b, right), dep: extent(b, forward) });
  const wallFrames = walls.map((w) => ({ w, ...frame(w) }));
  /** The nearest wall box ahead of the camera at lateral u, as the view ray at u meets it. */
  const faceAt = (u: number) => {
    let best: (typeof wallFrames)[number] | null = null;
    for (const f of wallFrames) {
      if (u <= f.lat[0] + 1e-6 || u >= f.lat[1] - 1e-6) continue;
      if (f.dep[0] <= cameraDepth + 0.05) continue;
      if (!best || f.dep[0] < best.dep[0]) best = f;
    }
    return best;
  };

  const directory = entranceDirectory(model).directory;
  const mounted: { lat: [number, number]; dep: [number, number] }[] = [
    ...model.exhibits.map((e) => e.panel),
    ...model.exhibits.flatMap((e) => (e.image ? [e.image] : [])),
    ...model.labels.map((l) => l.sign),
    ...doorSigns(model).map((s) => s.sign),
    ...(directory ? [directory.heading.sign, ...directory.rows.map((r) => r.sign), directory.board] : []),
  ].map(frame);
  const near = (dep: [number, number]) => dep[1] >= depth - 0.7 && dep[0] <= depth + 0.05;
  const mountedNear = mounted.filter((m) => near(m.dep));
  const portalsNear = model.portals
    .map((p) => ({ p, lat: extent({ min: [p.opening.a.x, 0, p.opening.a.z], max: [p.opening.b.x, 0, p.opening.b.z] }, right), dep: dot(p.position, forward) }))
    .filter((x) => Math.abs(x.dep - depth) <= 0.7);
  // What stands on the floor in front of the face: plinths and stands, colliders, walls and posts
  // (the face's own wall lies at or beyond `depth` and is not in the strip).
  const standing = [...model.exhibits.flatMap((e) => (e.plinth ? [e.plinth] : [])), ...model.colliders, ...walls]
    .map(frame)
    .filter((f) => f.dep[1] > depth - WALL_CLEARANCE.stripDepth && f.dep[0] < depth - 0.001);

  const gap = (u: number, iv: [number, number]) => (u < iv[0] ? iv[0] - u : u > iv[1] ? u - iv[1] : 0);
  const candidates: number[] = [];
  for (let u = lateral[0] + WALL_CLEARANCE.step; u <= lateral[1] - WALL_CLEARANCE.step + 1e-9; u += WALL_CLEARANCE.step) candidates.push(Math.round(u * 1000) / 1000);
  candidates.sort((a, b) => Math.abs(a - cameraLateral) - Math.abs(b - cameraLateral) || a - b);

  const onFace = candidates.filter((u) => {
    const hit = faceAt(u);
    return !!hit && hit.w.part === "wall-segment" && Math.abs(hit.dep[0] - depth) <= WALL_CLEARANCE.faceTolerance && hit.w.min[1] <= 0.05 && (face.ceilingY === null || hit.w.max[1] >= face.ceilingY - 0.05);
  });
  const columns: WallColumn[] = [];
  const used = new Set<number>();
  WALL_CLEARANCE.tiers.forEach((t, tier) => {
    for (const u of onFace) {
      if (used.has(u)) continue;
      if (mountedNear.some((m) => gap(u, m.lat) < t.wall)) continue;
      if (portalsNear.some((p) => gap(u, p.lat) < t.portal)) continue;
      if (standing.some((s) => gap(u, s.lat) < t.floor)) continue;
      used.add(u);
      columns.push({ lateral: u, offset: Math.round((u - cameraLateral) * 1000) / 1000, tier });
    }
  });
  if (columns.length === 0) return { reason: "no clear column on the wall ahead" };
  return { face, columns };
}

/** The C2c points for one column: the wall at the three heights, the floor near and far (and at `floorAlong` either side), the ceiling near and in. */
export function columnPoints(face: WallFace, column: Pick<WallColumn, "lateral">) {
  const u = column.lateral;
  const wall = C2C.wallHeights.map((y) => ({ key: `wall@${y}`, p: wallPoint(face, u, y) }));
  const band: { key: string; p: Vec3 }[] = [];
  for (const du of [-1, 0, 1]) for (let i = 0; i <= 4; i++) {
    const y = C2C.wallBand.y0 + ((C2C.wallBand.y1 - C2C.wallBand.y0) * i) / 4;
    band.push({ key: `band:${du}:${i}`, p: wallPoint(face, u + du * C2C.wallBand.halfWidth, y) });
  }
  const floor = [
    { key: "floor@near", p: floorPoint(face, u, C2C.floorNear) },
    { key: "floor@far", p: floorPoint(face, u, C2C.floorFar) },
  ];
  const floorLine: { key: string; p: Vec3 }[] = [];
  for (const du of C2C.floorAlong) {
    floorLine.push({ key: `floor@near:${du}`, p: floorPoint(face, u + du, C2C.floorNear) });
    floorLine.push({ key: `floor@far:${du}`, p: floorPoint(face, u + du, C2C.floorFar) });
  }
  const floorRegion: { key: string; p: Vec3 }[] = [];
  for (const du of [-1, 0, 1]) for (let i = 0; i <= 4; i++) {
    const out = C2C.floorRegion.out0 + ((C2C.floorRegion.out1 - C2C.floorRegion.out0) * i) / 4;
    floorRegion.push({ key: `floorRegion:${du}:${i}`, p: floorPoint(face, u + du * C2C.floorRegion.halfWidth, out) });
  }
  const cNear = ceilingPoint(face, u, C2C.ceilingNear);
  const cIn = ceilingPoint(face, u, C2C.ceilingIn);
  const ceiling = cNear && cIn ? [
    { key: "ceiling@near", p: cNear },
    { key: "ceiling@in", p: cIn },
  ] : [];
  return { wall, band, floor, floorLine, floorRegion, ceiling };
}

/**
 * A grid over the ceiling in front of the face (for "nothing on the ceiling at or above 250"): from
 * the cove's inner edge out to `maxOut` m, `halfWidth` m either side of the column.
 */
export function ceilingGrid(face: WallFace, column: Pick<WallColumn, "lateral">, opts: { cove: number; maxOut: number; halfWidth: number; step: number }): { key: string; p: Vec3 }[] {
  if (face.ceilingY === null) return [];
  const out: { key: string; p: Vec3 }[] = [];
  const reach = Math.min(opts.maxOut, face.depth - face.cameraDepth - 0.5);
  for (let d = opts.cove + 0.02; d <= reach + 1e-9; d += opts.step) {
    for (let du = -opts.halfWidth; du <= opts.halfWidth + 1e-9; du += opts.step) {
      const u = column.lateral + du;
      if (u < face.lateral[0] + opts.cove + 0.02 || u > face.lateral[1] - opts.cove - 0.02) continue;
      out.push({ key: `ceilingGrid:${du.toFixed(2)}:${d.toFixed(2)}`, p: ceilingPoint(face, u, d)! });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Doorways
// ---------------------------------------------------------------------------------------

const alongIndex = (p: Pick<ScenePortal, "axis">) => (p.axis === "z" ? 2 : 0);
const acrossIndex = (p: Pick<ScenePortal, "axis">) => (p.axis === "z" ? 0 : 2);

/** The two jamb linings of a doorway (ids `lining:<portal>:a` and `:b`), lower along-coordinate first. */
export function jambs(portal: Pick<ScenePortal, "linings" | "axis">): { jamb: "a" | "b"; box: SceneBox }[] {
  const ai = alongIndex(portal);
  return portal.linings
    .filter((l) => /:(a|b)$/.test(l.id))
    .map((l) => ({ jamb: (l.id.endsWith(":a") ? "a" : "b") as "a" | "b", box: l }))
    .sort((p, q) => p.box.min[ai]! - q.box.min[ai]!);
}

/** Heights at which the reveal and the door edge are read: the body of the jamb, past the floor's contact falloff. */
export const PORTAL_SAMPLE_HEIGHTS = [0.8, 1.1, 1.4, 1.7, 1.9] as const;

/**
 * Points on each jamb's reveal (the lining face along the opening, facing into it), 1 mm off the
 * face into the opening, across 20-80% of the wall thickness at PORTAL_SAMPLE_HEIGHTS (only those
 * under the head lining).
 */
export function revealPoints(portal: Pick<ScenePortal, "linings" | "axis">): { jamb: "a" | "b"; points: Vec3[] }[] {
  const ai = alongIndex(portal);
  const ci = acrossIndex(portal);
  return jambs(portal).map(({ jamb, box }, i, all) => {
    // The face towards the other jamb.
    const towards = all.length === 2 ? (i === 0 ? 1 : -1) : jamb === "a" ? 1 : -1;
    const along = (towards > 0 ? box.max[ai]! : box.min[ai]!) + towards * 0.001;
    const points: Vec3[] = [];
    for (const y of PORTAL_SAMPLE_HEIGHTS) {
      if (y > box.max[1] - 0.05) continue;
      for (const f of [0.2, 0.5, 0.8]) {
        const across = box.min[ci]! + (box.max[ci]! - box.min[ci]!) * f;
        const p: Vec3 = [0, y, 0];
        p[ai] = along;
        p[ci] = across;
        points.push(p);
      }
    }
    return { jamb, points };
  });
}

/** Points on a doorway's threshold (sill) plane, inset 20% from its edges. */
export function thresholdPoints(threshold: Pick<ScenePlane, "min" | "max"> | null): Vec3[] {
  if (!threshold) return [];
  const out: Vec3[] = [];
  const y = threshold.max[1] + 0.001;
  for (const fx of [0.2, 0.4, 0.6, 0.8]) for (const fz of [0.2, 0.5, 0.8]) out.push([threshold.min[0] + (threshold.max[0] - threshold.min[0]) * fx, y, threshold.min[2] + (threshold.max[2] - threshold.min[2]) * fz]);
  return out;
}

/**
 * The door edge seen from a room (the 20 mm room-facing face of each jamb lining) and the wall
 * beside it: for each jamb and height, the edge face's two bounds (the probe reads the darkest
 * pixel between them) and a wall point `wallOffset` m beyond the opening on the same face.
 */
export function doorEdgePoints(portal: Pick<ScenePortal, "linings" | "axis">, camera: Point, wallOffset = 0.25): { jamb: "a" | "b"; rows: { y: number; edge: [Vec3, Vec3]; wall: Vec3 }[] }[] {
  const ai = alongIndex(portal);
  const ci = acrossIndex(portal);
  const cam = [camera.x, 0, camera.z];
  return jambs(portal).map(({ jamb, box }, i) => {
    // The room-facing face nearer the camera, 1 mm proud of it.
    const lo = box.min[ci]!;
    const hi = box.max[ci]!;
    const faceAt = Math.abs(cam[ci]! - lo) < Math.abs(cam[ci]! - hi) ? lo - 0.001 : hi + 0.001;
    const outward = i === 0 ? -1 : 1;
    const wallAlong = (outward < 0 ? box.min[ai]! : box.max[ai]!) + outward * wallOffset;
    const rows: { y: number; edge: [Vec3, Vec3]; wall: Vec3 }[] = [];
    for (const y of PORTAL_SAMPLE_HEIGHTS) {
      if (y > box.max[1] - 0.05) continue;
      const at = (along: number): Vec3 => {
        const p: Vec3 = [0, y, 0];
        p[ai] = along;
        p[ci] = faceAt;
        return p;
      };
      rows.push({ y, edge: [at(box.min[ai]!), at(box.max[ai]!)], wall: at(wallAlong) });
    }
    return { jamb, rows };
  });
}

/**
 * The shortest on-screen height (px) at which the floor's near strip (the `C2C.floorNear` metres in
 * front of the wall base) is read. Seen level from the room centre of a deep room the strip is under
 * a pixel tall, so the near read blends the floor with the skirting and the wall (DR-062).
 */
export const FLOOR_STRIP_RESOLVED_PX = 2;

/** On-screen height (px) of the floor between `out` m and the wall base, seen square-on from `distance` m (eye `eye` m, focal length `focalPx`). */
export function floorStripPx(focalPx: number, eye: number, distance: number, out: number): number {
  if (distance <= out) return Infinity;
  return focalPx * (Math.atan(eye / (distance - out)) - Math.atan(eye / distance));
}

/** The largest square-on distance from the wall (at most `maxDistance`) at which that strip spans `px` (bisection; the height falls with distance). */
export function wallDistanceForStripPx(focalPx: number, eye: number, out: number, px: number, maxDistance: number): number {
  if (floorStripPx(focalPx, eye, maxDistance, out) >= px) return maxDistance;
  let lo = out + 1e-3;
  let hi = maxDistance;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (floorStripPx(focalPx, eye, mid, out) >= px) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The narrowest on-screen width (px) at which the 20 mm door edge is read: a span of 2 px always
 * covers at least one whole pixel, whatever its alignment, so the darkest pixel there is the edge's
 * own colour and not a blend with the reveal or the wall (DR-062).
 */
export const DOOR_EDGE_RESOLVED_PX = 2;

/** The portal a `room:<id>#door` view looks at (the same rule as tour-path.ts `viewpoints`). */
export function doorOfRoom(model: Pick<SceneModel, "portals">, roomId: string): ScenePortal | null {
  return model.portals.find((p) => p.connects.includes(roomId)) ?? null;
}

/** Room id of a viewpoint id (`room:…#wall`, `room:…#door`), portal id of a `…#through` view. */
export function viewTarget(id: string): { kind: "wall" | "door" | "through" | "other"; target: string } {
  const m = /^(.*)#(wall|door|through)$/.exec(id);
  return m ? { kind: m[2] as "wall" | "door" | "through", target: m[1]! } : { kind: "other", target: id };
}

/**
 * A plane's screen rectangle in drawing-buffer pixels (rows counted from the bottom, as
 * `readPixels` returns them) from its corners' NDC, clipped to the buffer; null when off screen.
 */
export function ndcRectToPixels(ndc: readonly { x: number; y: number }[], width: number, height: number): { x0: number; x1: number; y0: number; y1: number; clipped: boolean } | null {
  const xs = ndc.map((v) => ((v.x + 1) / 2) * width);
  const ys = ndc.map((v) => ((v.y + 1) / 2) * height);
  const rx0 = Math.min(...xs);
  const rx1 = Math.max(...xs);
  const ry0 = Math.min(...ys);
  const ry1 = Math.max(...ys);
  if (rx1 < 0 || ry1 < 0 || rx0 > width - 1 || ry0 > height - 1) return null;
  const x0 = Math.max(0, Math.floor(rx0));
  const x1 = Math.min(width - 1, Math.ceil(rx1));
  const y0 = Math.max(0, Math.floor(ry0));
  const y1 = Math.min(height - 1, Math.ceil(ry1));
  return { x0, x1, y0, y1, clipped: rx0 < 0 || ry0 < 0 || rx1 > width - 1 || ry1 > height - 1 };
}

/**
 * Paper/ink contrast inside a sign's pixel rectangle (the plaque method of immersive-rendering.spec.ts:
 * 6% side inset, 10% top and bottom; paper = 90th, ink = 1st percentile of relative luminance).
 */
export function signContrast(luminances: readonly number[]): { paper: number; ink: number; ratio: number } | null {
  if (luminances.length < 16) return null;
  const s = [...luminances].sort((a, b) => a - b);
  const paper = quantile(s, 0.9);
  const ink = quantile(s, 0.01);
  return { paper, ink, ratio: contrastRatio(paper, ink) };
}

/** The inset rectangle the sign contrast is read from. */
export function signInset(r: { x0: number; x1: number; y0: number; y1: number }): { x0: number; x1: number; y0: number; y1: number } {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  return { x0: Math.round(r.x0 + w * 0.06), x1: Math.round(r.x1 - w * 0.06), y0: Math.round(r.y0 + h * 0.1), y1: Math.round(r.y1 - h * 0.1) };
}

/** Spread (max - min) of a list; 0 for fewer than two values. */
export function spread(xs: readonly number[]): number {
  return xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs);
}
