/**
 * In-world wayfinding derived from the scene model (package 3D-B): the entrance directory and
 * click-to-walk through doorways. Pure and framework-free, so it is unit-tested
 * (tests/unit/immersive/wayfinding.test.ts). Nothing here is hard-coded per layout, wing or
 * tradition: every position, name and direction comes from the compiled manifest.
 *
 * Directory, hub building (DR-043): the spawn stands in the lobby at the directory's reading
 * distance from the lobby's north wall, so the directory hangs on that wall, on the spawn axis,
 * facing the spawn, and is read from where the visit starts with no walk-up. Its rows say which
 * wall of the lobby each doorway is in ("Doorway in the left wall"), as one reads the directory, so
 * a direction still holds once the visitor turns to walk; the comparison hall is "Doorways either
 * side of this sign", and a room reached through the hall says so.
 *
 * Directory, row building (DR-023 lobby, fallback "directory wall only"): the spawn view looks
 * through the lobby's doorway, so the directory hangs on the first wall that view meets, on the
 * spawn axis, facing the spawn. It lists every wing in canonical order (zone slug order, which is also the wings' order
 * along the hall), then any shared, tradition-neutral room off the same room, one equal-size row
 * each: the destination's name and the doorway that leads to it, said by wall ("Far wall, second
 * doorway to the right"; "Entrance wall, to the right"): the far wall is the directory's own, the
 * entrance wall the one the visitor came through, and left and right are as one enters, which is
 * also as one reads the directory, so a direction still holds once the visitor has turned away
 * from it (novice walkthrough: "on the right" alone was ambiguous). The words are wayfinding copy, not craft
 * facts: the names are the zone labels the door signs already carry (immersive-3d P8).
 */
import { compareStrings } from "@/features/spatial/compiler/prng";
import type { Point } from "@/features/spatial/compiler/types";

import { VISITOR } from "./navigation";
import { roomAt, type SceneModel, type ScenePlane, type ScenePortal, type SceneRoom } from "./scene-model";

/**
 * Directory geometry and type. Reading distance: a visitor stepping into the room from the lobby
 * doorway reads the directory from about half the room's depth; both lines meet the legibility
 * rule L1 (16 px at 1280 x 800) at `readingDistance`. Rows are the door signs' paper and ink.
 */
export const DIRECTORY = {
  rowWidth: 2.8,
  rowHeight: 0.3,
  gap: 0.04,
  /** Centre height of the row stack (eye height of the reference visitor). */
  centreY: VISITOR.eyeHeight,
  /** Proud of the wall face, as the door signs. */
  offset: 0.003,
  readingDistance: 3.5,
  titleEm: 0.1,
  lineEm: 0.085,
  /** Wall left solid either side of the stack (corner, doorway reveal, exhibit panel). */
  clearance: 0.3,
  /** Lowest row bottom (m): no row is read looking down at the floor. */
  minBottom: 0.85,
  /** Floor in front of the stack kept free of plinths (m). */
  standOff: 0.6,
} as const;

export const WAYFINDING_WORDS = {
  ordinal: ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"] as const,
  nth: (n: number) => (n <= 10 ? `${WAYFINDING_WORDS.ordinal[n - 1]!.toLowerCase()} doorway` : `doorway ${n}`),
  doorway: (n: number, side: "left" | "right") => `Far wall, ${WAYFINDING_WORDS.nth(n)} to the ${side}`,
  /** Hub: a doorway in a side wall or the opposite wall of the directory's own room. */
  inWall: (wall: "left" | "right" | "opposite", n: number, many: boolean) => (many ? `${titleWord(WAYFINDING_WORDS.nth(n))} in the ${wall} wall` : `Doorway in the ${wall} wall`),
  /** Hub: a doorway in the directory's own wall. */
  thisWall: (side: "left" | "right" | "both") => (side === "both" ? "Doorways either side of this sign" : `Doorway to the ${side} of this sign`),
  /** Hub: a room reached through another room's doorway. */
  through: (room: string) => `Through the ${room.toLowerCase()}`,
  behind: (n: number, side: "left" | "right", many: boolean) => (many ? `Entrance wall, ${WAYFINDING_WORDS.nth(n)} to the ${side}` : `Entrance wall, to the ${side}`),
  end: (side: "left" | "right") => `At the ${side} end`,
  ahead: "Straight ahead",
} as const;

export interface DirectoryRow {
  id: string;
  /** Zone the row names (a wing, or a shared room). */
  zoneId: string;
  title: string;
  direction: string;
  /** The doorway that leads there from the directory's room, and the room behind it. */
  portalId: string;
  toRoomId: string;
  sign: ScenePlane;
}

export interface SceneDirectory {
  /** Room the directory hangs in (and is resident with). */
  roomId: string;
  /** The lobby doorway the spawn view looks through (row building); null when it hangs in the spawn's own room (hub). */
  viaPortalId: string | null;
  rows: DirectoryRow[];
}

export interface DirectoryResult {
  directory: SceneDirectory | null;
  /** Why there is no directory, or what it leaves out. */
  notes: string[];
}

const FACING_EPS = 0.5;
const titleWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Unit forward vector (plan) of a manifest yaw in degrees (0 = north = -z, 90 = east). */
export function forwardOf(yawDeg: number): Point {
  const r = (yawDeg * Math.PI) / 180;
  return { x: Math.round(Math.sin(r) * 1e9) / 1e9, z: Math.round(-Math.cos(r) * 1e9) / 1e9 };
}

const dot = (a: Point, b: Point) => a.x * b.x + a.z * b.z;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, z: a.z - b.z });
const contains = (r: SceneRoom, p: Point) => p.x >= r.bounds.minX - 1e-6 && p.x <= r.bounds.maxX + 1e-6 && p.z >= r.bounds.minZ - 1e-6 && p.z <= r.bounds.maxZ + 1e-6;

/** Unit normal of a doorway (plan), pointing from its opening into `roomId`. */
export function doorwayNormal(portal: Pick<ScenePortal, "axis" | "position">, room: Pick<SceneRoom, "bounds">): Point {
  const c = { x: (room.bounds.minX + room.bounds.maxX) / 2, z: (room.bounds.minZ + room.bounds.maxZ) / 2 };
  // axis "z": the opening runs along z on a wall of constant x, so the normal is along x.
  return portal.axis === "z" ? { x: c.x >= portal.position.x ? 1 : -1, z: 0 } : { x: 0, z: c.z >= portal.position.z ? 1 : -1 };
}

/**
 * The directory: on the wall the spawn axis meets, centred on it, facing the spawn: the spawn room's
 * own wall when no doorway stands on the axis (hub), else the far wall of the room seen through the
 * lobby doorway on the axis (row). Returns null (with the reason) when that wall stretch is not free.
 */
export function entranceDirectory(model: Pick<SceneModel, "rooms" | "zones" | "portals" | "exhibits" | "labels" | "spawn">): DirectoryResult {
  const notes: string[] = [];
  const spawnRoom = model.rooms.find((r) => contains(r, model.spawn)) ?? null;
  if (!spawnRoom) return { directory: null, notes: ["spawn is in no room"] };
  const f = forwardOf(model.spawn.yawDeg);
  const right: Point = { x: -f.z, z: f.x };
  // The doorway on the spawn axis, ahead of the spawn.
  const via = model.portals
    .filter((p) => p.connects.includes(spawnRoom.id))
    .filter((p) => {
      const rel = sub(p.position, model.spawn);
      return dot(rel, f) > 0 && Math.abs(dot(rel, right)) <= p.width / 2 - 0.1;
    })
    .sort((a, b) => dot(sub(a.position, model.spawn), f) - dot(sub(b.position, model.spawn), f))[0];
  const roomId = via ? (via.connects[0] === spawnRoom.id ? via.connects[1] : via.connects[0]) : spawnRoom.id;
  const room = model.rooms.find((r) => r.id === roomId);
  if (!room) return { directory: null, notes: [`doorway ${via?.id} leads to no room`] };
  const inRoom = !via;

  // The wall the spawn axis meets on the far side of that room.
  const b = room.bounds;
  const tFor = (edge: number, o: number, d: number) => (Math.abs(d) < 1e-9 ? Infinity : (edge - o) / d);
  const hits = [
    { t: tFor(b.minZ, model.spawn.z, f.z), facing: "+z" as const },
    { t: tFor(b.maxZ, model.spawn.z, f.z), facing: "-z" as const },
    { t: tFor(b.minX, model.spawn.x, f.x), facing: "+x" as const },
    { t: tFor(b.maxX, model.spawn.x, f.x), facing: "-x" as const },
  ].filter((h) => h.t > (via ? dot(sub(via.position, model.spawn), f) + 0.5 : 1e-6) && Number.isFinite(h.t));
  const hit = hits.sort((p, q) => p.t - q.t)[0];
  if (!hit) return { directory: null, notes: ["the spawn axis meets no far wall"] };
  const centre: Point = { x: model.spawn.x + f.x * hit.t, z: model.spawn.z + f.z * hit.t };
  const alongX = hit.facing === "+z" || hit.facing === "-z";
  const u = alongX ? centre.x : centre.z;
  const half = DIRECTORY.rowWidth / 2;
  const u0 = u - half - DIRECTORY.clearance;
  const u1 = u + half + DIRECTORY.clearance;

  // The wall face: the room-side face of the wall boxes on that edge, which must cover [u0, u1].
  const edge = alongX ? centre.z : centre.x;
  // Wall boxes belong to whichever room the compiler filed them under, so search every room.
  // Only boxes that run along that edge (thin across it) and reach the directory's stretch: a wall
  // of another room that merely crosses the edge's line is not this wall.
  const wallBoxes = model.rooms.flatMap((r) => r.walls).filter((w) => {
    const lo = alongX ? w.min[2] : w.min[0];
    const hi = alongX ? w.max[2] : w.max[0];
    const ulo = alongX ? w.min[0] : w.min[2];
    const uhi = alongX ? w.max[0] : w.max[2];
    return lo - 1e-6 <= edge && edge <= hi + 1e-6 && hi - lo <= 0.5 && uhi >= u0 - 1 && ulo <= u1 + 1;
  });
  const covered = (a: number, c: number) => {
    const spans = wallBoxes.map((w) => (alongX ? [w.min[0], w.max[0]] : [w.min[2], w.max[2]]) as [number, number]).sort((p, q) => p[0] - q[0]);
    let at = a;
    for (const [lo, hi] of spans) {
      if (lo > at + 1e-6) break;
      at = Math.max(at, hi);
    }
    return at >= c - 1e-6;
  };
  if (wallBoxes.length === 0 || !covered(u0, u1)) return { directory: null, notes: [`the wall ahead of the spawn in ${room.id} is not solid across ${(u1 - u0).toFixed(2)} m`] };
  const into = hit.facing === "+z" || hit.facing === "+x" ? 1 : -1;
  const faceCoord = into > 0 ? Math.max(...wallBoxes.map((w) => (alongX ? w.max[2] : w.max[0]))) : Math.min(...wallBoxes.map((w) => (alongX ? w.min[2] : w.min[0])));
  const plane = Math.round((faceCoord + into * DIRECTORY.offset) * 1e6) / 1e6;

  // Nothing else may hang on, or stand in front of, that stretch.
  const onWall = (p: Pick<ScenePlane, "min" | "max" | "facing">) => p.facing === hit.facing && Math.abs((alongX ? p.min[2] : p.min[0]) - faceCoord) < 0.2;
  const uOverlap = (p: { min: readonly number[]; max: readonly number[] }) => Math.min(u1, alongX ? p.max[0]! : p.max[2]!) - Math.max(u0, alongX ? p.min[0]! : p.min[2]!) > 0;
  const blockers = [
    ...model.exhibits.filter((e) => e.roomId === room.id && ((onWall(e.panel) && uOverlap(e.panel)) || (e.plinth && uOverlap(e.plinth) && Math.abs((alongX ? (into > 0 ? e.plinth.min[2] : e.plinth.max[2]) : into > 0 ? e.plinth.min[0] : e.plinth.max[0]) - faceCoord) < DIRECTORY.standOff))).map((e) => e.id),
    ...model.labels.filter((l) => l.roomId === room.id && onWall(l.sign) && uOverlap(l.sign)).map((l) => l.id),
  ];
  if (blockers.length > 0) return { directory: null, notes: [`the wall ahead of the spawn is taken by ${blockers.join(", ")}`] };

  // Rows: wings in canonical (slug) order, then shared rooms (the comparison hall when the directory
  // is not in it, then the commons), each reached by a doorway of `room` or through the room next to it.
  const zoneOfRoom = new Map(model.rooms.map((r) => [r.id, r.zoneId]));
  const roomKind = new Map(model.rooms.map((r) => [r.id, r.roomKind]));
  const doorways = model.portals.filter((p) => p.connects.includes(room.id));
  const wings = model.zones.filter((z) => z.traditionSlug).sort((p, q) => compareStrings(p.traditionSlug!, q.traditionSlug!));
  const sharedKinds = inRoom ? ["hall", "commons"] : ["commons"];
  const shared = model.zones
    .filter((z) => !z.traditionSlug && z.id !== room.zoneId && z.roomIds.some((id) => sharedKinds.includes(roomKind.get(id) ?? "")))
    .sort((p, q) => sharedKinds.indexOf(roomKind.get(p.roomIds[0]!) ?? "") - sharedKinds.indexOf(roomKind.get(q.roomIds[0]!) ?? "") || compareStrings(p.id, q.id));
  const viewer = { f: { x: -(hit.facing === "+x" ? 1 : hit.facing === "-x" ? -1 : 0), z: -(hit.facing === "+z" ? 1 : hit.facing === "-z" ? -1 : 0) } };
  const vRight: Point = { x: -viewer.f.z, z: viewer.f.x };
  const directionTo = (target: ScenePortal): string => {
    const rel = sub(target.position, centre);
    const depth = dot(rel, viewer.f);
    const lat = dot(rel, vRight);
    const side: "left" | "right" = lat >= 0 ? "right" : "left";
    const sameSide = (p: ScenePortal) => (dot(sub(p.position, centre), vRight) >= 0 ? "right" : "left") === side;
    const roomDepth = alongX ? b.maxZ - b.minZ : b.maxX - b.minX;
    if (inRoom) {
      // Side walls and the opposite wall of the directory's own room, as one faces the directory.
      const wallOf = (p: ScenePortal): "left" | "right" | "opposite" | "this" => {
        const r = sub(p.position, centre);
        if (Math.abs(dot(r, viewer.f)) < FACING_EPS) return "this";
        if (dot(r, viewer.f) <= -(roomDepth - FACING_EPS)) return "opposite";
        return dot(r, vRight) >= 0 ? "right" : "left";
      };
      const wall = wallOf(target);
      if (wall === "this") {
        const zone = (p: ScenePortal) => zoneOfRoom.get(p.connects[0] === room.id ? p.connects[1] : p.connects[0]);
        const sides = new Set(doorways.filter((p) => wallOf(p) === "this" && zone(p) === zone(target)).map((p) => (dot(sub(p.position, centre), vRight) >= 0 ? "right" : "left")));
        return WAYFINDING_WORDS.thisWall(sides.size > 1 ? "both" : side);
      }
      // Counted from the directory's wall along that wall.
      const onWall = doorways.filter((p) => wallOf(p) === wall);
      const from = (p: ScenePortal) => (wall === "opposite" ? Math.abs(dot(sub(p.position, centre), vRight)) : -dot(sub(p.position, centre), viewer.f));
      const before = onWall.filter((p) => p.id !== target.id && from(p) < from(target)).length;
      return WAYFINDING_WORDS.inWall(wall, before + 1, onWall.length > 1);
    }
    if (Math.abs(depth) < FACING_EPS) {
      const before = doorways.filter((p) => p.id !== target.id && Math.abs(dot(sub(p.position, centre), viewer.f)) < FACING_EPS && sameSide(p) && Math.abs(dot(sub(p.position, centre), vRight)) < Math.abs(lat)).length;
      return WAYFINDING_WORDS.doorway(before + 1, side);
    }
    if (depth <= -(roomDepth - FACING_EPS)) {
      const behind = doorways.filter((p) => p.id !== via?.id && dot(sub(p.position, centre), viewer.f) <= -(roomDepth - FACING_EPS) && sameSide(p));
      const before = behind.filter((p) => p.id !== target.id && Math.abs(dot(sub(p.position, centre), vRight)) < Math.abs(lat)).length;
      return WAYFINDING_WORDS.behind(before + 1, side, behind.length > 1);
    }
    return Math.abs(lat) < FACING_EPS ? WAYFINDING_WORDS.ahead : WAYFINDING_WORDS.end(side);
  };

  const listed = [...wings, ...shared];
  const rowsData: Omit<DirectoryRow, "sign">[] = [];
  for (const z of listed) {
    const door = doorways
      .filter((p) => {
        const other = p.connects[0] === room.id ? p.connects[1] : p.connects[0];
        return zoneOfRoom.get(other) === z.id;
      })
      .sort((p, q) => compareStrings(p.id, q.id))[0];
    if (!door) {
      // Hub: a shared room reached through a room next to the directory's (the commons, beyond the
      // hall). The row walks through that room's doorway into it.
      const next = inRoom
        ? model.portals
            .filter((p) => z.roomIds.some((id) => p.connects.includes(id)))
            .map((p) => ({ p, via: p.connects.find((id) => !z.roomIds.includes(id))! }))
            .filter((x) => doorways.some((d) => d.connects.includes(x.via)))
            .sort((a, c) => compareStrings(a.p.id, c.p.id))[0]
        : undefined;
      if (!next) {
        notes.push(`${z.id} has no doorway from ${room.id}; not listed`);
        continue;
      }
      const viaRoom = model.rooms.find((r) => r.id === next.via);
      const viaZone = model.zones.find((zz) => zz.id === viaRoom?.zoneId);
      const toRoomId = next.p.connects[0] === next.via ? next.p.connects[1] : next.p.connects[0];
      rowsData.push({ id: `directory:${z.id}`, zoneId: z.id, title: z.label, direction: WAYFINDING_WORDS.through(viaZone?.label ?? next.via), portalId: next.p.id, toRoomId });
      continue;
    }
    const toRoomId = door.connects[0] === room.id ? door.connects[1] : door.connects[0];
    rowsData.push({ id: `directory:${z.id}`, zoneId: z.id, title: z.label, direction: directionTo(door), portalId: door.id, toRoomId });
  }
  if (rowsData.length === 0) return { directory: null, notes: [...notes, "no wing is reached from the directory's room"] };

  const total = rowsData.length * DIRECTORY.rowHeight + (rowsData.length - 1) * DIRECTORY.gap;
  // Centred on eye height; a tall stack (the hub lists the hall and the commons too) is lifted so its
  // lowest row stays at least `minBottom` off the floor, below the ceiling clearance.
  const top = Math.min(room.height - 0.3, Math.max(DIRECTORY.centreY + total / 2, DIRECTORY.minBottom + total));
  const rows: DirectoryRow[] = rowsData.map((r, i) => {
    const y1 = Math.round((top - i * (DIRECTORY.rowHeight + DIRECTORY.gap)) * 1000) / 1000;
    const y0 = Math.round((y1 - DIRECTORY.rowHeight) * 1000) / 1000;
    const min: [number, number, number] = alongX ? [u - half, y0, plane] : [plane, y0, u - half];
    const max: [number, number, number] = alongX ? [u + half, y1, plane] : [plane, y1, u + half];
    return { ...r, sign: { id: r.id, elementId: via?.id ?? room.id, kind: "sign", facing: hit.facing, min, max, uv: "metre", wallOffset: DIRECTORY.offset, polygonOffset: { factor: -1, units: -1 }, aspectRatio: null, assetId: null } };
  });
  return { directory: { roomId: room.id, viaPortalId: via?.id ?? null, rows }, notes };
}

/**
 * Click-to-walk through a doorway: a point `depth` inside the room on the far side, on the
 * doorway's axis, and the yaw that faces into that room. `isFree` (the router's walkable test)
 * shortens the step until the point is walkable.
 */
export const DOORWAY_WALK = { depth: 2, minDepth: 0.75, step: 0.25 } as const;

export function doorwayWalkTarget(model: Pick<SceneModel, "rooms" | "portals">, portalId: string, toRoomId: string, isFree: (p: Point) => boolean = () => true): { point: Point; yaw: number } | null {
  const portal = model.portals.find((p) => p.id === portalId);
  const room = model.rooms.find((r) => r.id === toRoomId);
  if (!portal || !room || !portal.connects.includes(toRoomId)) return null;
  const n = doorwayNormal(portal, room);
  const extent = n.x !== 0 ? room.bounds.maxX - room.bounds.minX : room.bounds.maxZ - room.bounds.minZ;
  let d = Math.min(DOORWAY_WALK.depth, extent / 2);
  while (d >= DOORWAY_WALK.minDepth) {
    const p = { x: portal.position.x + n.x * d, z: portal.position.z + n.z * d };
    if (isFree(p)) return { point: p, yaw: Math.atan2(-n.x, -n.z) };
    d -= DOORWAY_WALK.step;
  }
  return null;
}

/**
 * The doorway a click on a wall belongs to: the hit point lies in the doorway's frame (within
 * `margin` of the opening along the wall, inside the wall's thickness, below the lintel top).
 */
export function doorwayAtWallHit(model: Pick<SceneModel, "portals" | "rooms">, hit: { x: number; y: number; z: number }, margin = 0.3): ScenePortal | null {
  const H = model.rooms[0]?.height ?? 3.2;
  if (hit.y > H) return null;
  for (const p of model.portals) {
    const across = p.axis === "z" ? Math.abs(hit.x - p.position.x) : Math.abs(hit.z - p.position.z);
    const along = p.axis === "z" ? Math.abs(hit.z - p.position.z) : Math.abs(hit.x - p.position.x);
    if (across <= 0.2 && along <= p.width / 2 + margin) return p;
  }
  return null;
}

/**
 * A click on a surface of the next room, seen through a doorway (its far wall, a sign on it): the
 * doorway of the visitor's room that leads there, so the click walks the visitor through it
 * instead of doing nothing (novice walkthrough). The hit is read 0.2 m back towards the visitor,
 * inside the room the wall faces; of several doorways into that room, the one nearest the line of
 * sight. Null when the surface belongs to the visitor's own room or to a room no doorway of it
 * reaches.
 */
export function doorwayToRoomSeen(
  model: Pick<SceneModel, "rooms" | "portals">,
  fromRoomId: string | null,
  visitor: Point,
  hit: Point,
): { portal: ScenePortal; toRoomId: string } | null {
  if (!fromRoomId) return null;
  const ray = sub(hit, visitor);
  const len = Math.hypot(ray.x, ray.z);
  if (len < 1e-6) return null;
  const back = { x: hit.x - (ray.x / len) * 0.2, z: hit.z - (ray.z / len) * 0.2 };
  const seen = roomAt(model.rooms, back);
  if (!seen || seen.id === fromRoomId) return null;
  const doors = model.portals.filter((p) => p.connects.includes(fromRoomId) && p.connects.includes(seen.id));
  if (doors.length === 0) return null;
  // Distance from each doorway to the visitor-to-hit segment.
  const offLine = (p: ScenePortal) => {
    const t = Math.max(0, Math.min(1, dot(sub(p.position, visitor), ray) / (len * len)));
    return Math.hypot(visitor.x + ray.x * t - p.position.x, visitor.z + ray.z * t - p.position.z);
  };
  const portal = [...doors].sort((a, b) => offLine(a) - offLine(b) || compareStrings(a.id, b.id))[0]!;
  return { portal, toRoomId: seen.id };
}

/** The room on the other side of a doorway from `fromRoomId` (or from the point, if not one of its rooms). */
export function farSide(model: Pick<SceneModel, "rooms">, portal: Pick<ScenePortal, "connects" | "axis" | "position">, fromRoomId: string | null, from: Point): string {
  if (fromRoomId && portal.connects.includes(fromRoomId)) return portal.connects[0] === fromRoomId ? portal.connects[1] : portal.connects[0];
  const a = model.rooms.find((r) => r.id === portal.connects[0]);
  if (!a) return portal.connects[1];
  const n = doorwayNormal(portal as ScenePortal, a);
  // `from` on room a's side of the opening: go to the other room.
  return dot(sub(from, portal.position), n) > 0 ? portal.connects[1] : portal.connects[0];
}

/**
 * Where a visitor stands to read the directory: on its axis, `DIRECTORY.readingDistance` in front
 * (further when the view is too narrow for the rows, short of the wall behind), facing it. Clicking the directory from outside its room
 * walks here, so a sign too far to read is a sign to walk up to (3D-B walkthrough).
 */
export function directoryReadingPoint(directory: SceneDirectory, model: Pick<SceneModel, "rooms">, horizontalFovRad?: number): { point: Point; yaw: number } | null {
  const s = directory.rows[0]?.sign;
  const room = model.rooms.find((r) => r.id === directory.roomId);
  if (!s || !room) return null;
  const n = { "+x": { x: 1, z: 0 }, "-x": { x: -1, z: 0 }, "+z": { x: 0, z: 1 }, "-z": { x: 0, z: -1 } }[s.facing as "+x"] ?? { x: 0, z: 1 };
  const depth = n.x !== 0 ? room.bounds.maxX - room.bounds.minX : room.bounds.maxZ - room.bounds.minZ;
  // Far enough for the whole row width to fit the view (a narrow phone view needs more distance),
  // never closer than the reading distance, and never against the wall behind.
  const fit = horizontalFovRad ? (DIRECTORY.rowWidth / 2 + 0.4) / Math.tan(horizontalFovRad / 2) : 0;
  const d = Math.min(Math.max(DIRECTORY.readingDistance, fit), depth - 0.8);
  const c = { x: (s.min[0] + s.max[0]) / 2, z: (s.min[2] + s.max[2]) / 2 };
  return { point: { x: c.x + n.x * d, z: c.z + n.z * d }, yaw: Math.atan2(n.x, n.z) };
}
