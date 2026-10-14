/**
 * Layout engine: zone groups -> rooms -> doorways -> walls -> exhibit slots.
 *
 * Plan (x east, z south; all room dimensions snap to `gridUnit`):
 *
 *        wing A (slug order)   wing B              wing C
 *      +------+------+------+------+  ...      north: rooms of each wing on a
 *      | g3   | g4   | g3   | g4   |           `wingColumns`-wide grid, row 0
 *      +------+------+------+------+           touching the hall
 *      | g1   | g2   | g1   | g2   |
 *      +--||--+------+--||--+------+---------  z = 0  (one entrance per wing)
 *      |          comparison hall             |         comparison exhibits sit
 *      +---||---+-----||------+---------------+  z = hallDepth   near the wings they compare
 *      | lobby  | shared commons |
 *      +--------+----------------+
 *
 *  - Zone groups get grid slots in one shared order for all wings (so a category sits in the
 *    same relative place in every wing). Slot 0 is the entrance group; each later slot takes
 *    the group with the most cross-category relationships to its already-placed grid
 *    neighbours (rule cross-category.connection). Equal scores are broken by the seeded PRNG.
 *  - Doorways: a breadth-first spanning tree over the grid from the entrance room (rule
 *    layout.circulation) plus a doorway between every other pair of grid neighbours whose
 *    concepts are related (cross-category.connection).
 *  - Room sizes: the smallest square (>= minRoomSize) whose wall slots hold its exhibits;
 *    a grid column takes its widest room and a grid row its deepest, so walls stay aligned.
 *  - Exhibits stand against walls in slots that keep `cornerClearance` and `doorClearance`
 *    free, ordered clockwise from the room's entrance doorway.
 */
import { round } from "./canonical";
import type { LayoutConfig, ZoneGroup } from "./config";
import { buildWalls, rectCenter, type DoorOpening, type Orient, type WallBuild } from "./geometry";
import type { Chain, ScopedGraph } from "./graph";
import { breakTie, compareStrings, rngFor } from "./prng";
import type { Collider, GraphConcept, Point, Rect, Side } from "./types";
import { KNOWLEDGE_CATEGORY_CODES } from "@/lib/validation/enums";

export type RoomKind = "wing-room" | "hall" | "lobby" | "commons";

export interface RoomPlan {
  id: string;
  zoneId: string;
  kind: RoomKind;
  slug: string | null;
  groupId: string | null;
  label: string;
  categories: string[];
  conceptKeys: string[];
  grid: { row: number; col: number; slot: number } | null;
  rect: Rect;
  entranceDoorId: string | null;
  depth: number;
}

export interface DoorPlan {
  id: string;
  rooms: [string, string];
  purpose: "entrance" | "circulation" | "cross-category";
  /** Related concept pairs carried by this doorway (cross-category relationships). */
  relationshipIds: string[];
  orient: Orient;
  c: number;
  center: number;
  width: number;
}

export interface Placement {
  conceptKey: string;
  roomId: string;
  side: Side;
  /** Position in clockwise order from the room entrance (0-based). */
  order: number;
  position: Point;
  yawDeg: number;
  footprint: Collider;
  approach: Point;
  /** The wall the exhibit stands against: orientation, interior face coordinate, inward normal, slot centre. */
  wall: { orient: Orient; face: number; normal: Point; u: number };
}

export interface TieBreak {
  area: string;
  candidates: string[];
  chosen: string;
}

export interface Layout {
  rooms: RoomPlan[];
  doors: DoorPlan[];
  walls: WallBuild;
  wallsByRoom: Map<string, Collider[]>;
  placements: Map<string, Placement>;
  groupOf: Map<string, string>;
  roomOf: Map<string, string>;
  groupOrder: string[];
  spawn: { x: number; z: number; yawDeg: number };
  unmappedCategory: string[];
  tieBreaks: TieBreak[];
  issues: string[];
}

export interface LayoutInput {
  scope: ScopedGraph;
  groups: readonly ZoneGroup[];
  entranceGroup: string;
  fallbackGroup: string;
  sharedLabel: string;
  cfg: LayoutConfig;
  seed: string;
  chains: readonly Chain[];
  /** Relationship id -> primary strategy id (null when unmapped). */
  primaryStrategy: ReadonlyMap<string, string | null>;
}

const HALL_ID = "room:hall";
const LOBBY_ID = "room:lobby";
const COMMONS_ID = "room:commons";

export function roomIdFor(slug: string, group: string) {
  return `room:${slug}:${group}`;
}
export function wingZoneId(slug: string) {
  return `zone:${slug}`;
}

/** Side + interior geometry of a room wall. */
interface SideGeom {
  side: Side;
  orient: Orient;
  /** Wall centre-line coordinate. */
  line: number;
  /** Interior face coordinate. */
  face: number;
  /** Inward normal. */
  normal: Point;
  lo: number;
  hi: number;
  yawDeg: number;
}

function sides(r: Rect, t: number): SideGeom[] {
  return [
    { side: "n", orient: "h", line: r.minZ, face: r.minZ + t / 2, normal: { x: 0, z: 1 }, lo: r.minX + t / 2, hi: r.maxX - t / 2, yawDeg: 180 },
    { side: "e", orient: "v", line: r.maxX, face: r.maxX - t / 2, normal: { x: -1, z: 0 }, lo: r.minZ + t / 2, hi: r.maxZ - t / 2, yawDeg: 270 },
    { side: "s", orient: "h", line: r.maxZ, face: r.maxZ - t / 2, normal: { x: 0, z: -1 }, lo: r.minX + t / 2, hi: r.maxX - t / 2, yawDeg: 0 },
    { side: "w", orient: "v", line: r.minX, face: r.minX + t / 2, normal: { x: 1, z: 0 }, lo: r.minZ + t / 2, hi: r.maxZ - t / 2, yawDeg: 90 },
  ];
}

/** Clockwise perimeter parameter of a point on the room boundary, starting at the NW corner. */
function perimeterParam(r: Rect, side: Side, u: number): number {
  const W = r.maxX - r.minX;
  const D = r.maxZ - r.minZ;
  switch (side) {
    case "n":
      return u - r.minX;
    case "e":
      return W + (u - r.minZ);
    case "s":
      return W + D + (r.maxX - u);
    case "w":
      return 2 * W + D + (r.maxZ - u);
  }
}

interface Slot {
  side: SideGeom;
  u: number;
  param: number;
}

function doorsOnSide(s: SideGeom, r: Rect, doors: readonly DoorOpening[]): DoorOpening[] {
  return doors.filter((d) => {
    if (d.orient !== s.orient || Math.abs(d.c - s.line) > 1e-6) return false;
    const [a, b] = s.orient === "h" ? [r.minX, r.maxX] : [r.minZ, r.maxZ];
    return d.center > a && d.center < b;
  });
}

function roomSlots(r: Rect, doors: readonly DoorOpening[], cfg: LayoutConfig): Slot[] {
  const out: Slot[] = [];
  for (const s of sides(r, cfg.wallThickness)) {
    let free: [number, number][] = [[s.lo + cfg.cornerClearance, s.hi - cfg.cornerClearance]];
    for (const d of doorsOnSide(s, r, doors)) {
      const a = d.center - d.width / 2 - cfg.doorClearance;
      const b = d.center + d.width / 2 + cfg.doorClearance;
      free = free.flatMap(([p, q]) => {
        const parts: [number, number][] = [];
        if (a > p) parts.push([p, Math.min(q, a)]);
        if (b < q) parts.push([Math.max(p, b), q]);
        return parts.filter(([x, y]) => y - x > 1e-6);
      });
    }
    for (const [p, q] of free) {
      const len = q - p;
      const k = Math.floor((len + 1e-9) / cfg.exhibitSpacing);
      const start = p + (len - k * cfg.exhibitSpacing) / 2;
      for (let j = 0; j < k; j++) {
        const u = round(start + cfg.exhibitSpacing * (j + 0.5));
        out.push({ side: s, u, param: perimeterParam(r, s.side, u) });
      }
    }
  }
  return out;
}

function snapUp(x: number, unit: number) {
  return Math.ceil(x / unit - 1e-9) * unit;
}

/** Smallest square room (>= minRoomSize) whose slots hold n exhibits given doorway sides. */
function squareSizeFor(n: number, doorSides: readonly Side[], cfg: LayoutConfig): number {
  let s = snapUp(cfg.minRoomSize, cfg.gridUnit);
  for (let guard = 0; guard < 400; guard++, s += cfg.gridUnit) {
    const r: Rect = { minX: 0, maxX: s, minZ: 0, maxZ: s };
    const doors: DoorOpening[] = doorSides.map((side, i) => {
      const g = sides(r, cfg.wallThickness).find((x) => x.side === side)!;
      return { id: `h${i}`, orient: g.orient, c: g.line, center: s / 2, width: cfg.doorWidth };
    });
    if (roomSlots(r, doors, cfg).length >= n) return s;
  }
  return s;
}

// -----------------------------------------------------------------------------------------

export function planLayout(input: LayoutInput): Layout {
  const { scope, cfg, seed } = input;
  const tieBreaks: TieBreak[] = [];
  const issues: string[] = [];
  const groupById = new Map(input.groups.map((g) => [g.id, g]));
  const groupOfCategory = new Map<string, ZoneGroup>();
  for (const g of input.groups) for (const c of g.categories) if (!groupOfCategory.has(c)) groupOfCategory.set(c, g);
  const fallback = groupById.get(input.fallbackGroup) ?? input.groups[0]!;

  // --- A. Concept -> group / home -----------------------------------------------------------
  const groupOf = new Map<string, string>();
  const home = new Map<string, string>(); // slug | "hall" | "commons"
  const unmappedCategory: string[] = [];
  for (const c of scope.concepts) {
    let g = groupOfCategory.get(c.category);
    if (!g) {
      unmappedCategory.push(c.key);
      g = fallback;
    }
    const slug = scope.slugOf(c);
    groupOf.set(c.key, g.id);
    if (g.scope === "hall" || (c.type === "comparison" && slug === null)) home.set(c.key, "hall");
    else if (slug === null) home.set(c.key, "commons");
    else home.set(c.key, slug);
  }

  // --- B. Cross-category weights inside wings ---------------------------------------------
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const weightAll = new Map<string, number>();
  const weightBySlug = new Map<string, Map<string, number>>();
  const relsBetween = new Map<string, string[]>(); // `${roomA}|${roomB}` -> relationship ids
  for (const r of scope.relationships) {
    const hs = home.get(r.source);
    const ht = home.get(r.target);
    const gs = groupOf.get(r.source)!;
    const gt = groupOf.get(r.target)!;
    if (!hs || hs !== ht || hs === "hall" || hs === "commons" || gs === gt) continue;
    if (input.primaryStrategy.get(r.id) === "tradition-wing") continue;
    const k = pairKey(gs, gt);
    weightAll.set(k, (weightAll.get(k) ?? 0) + 1);
    const m = weightBySlug.get(hs) ?? weightBySlug.set(hs, new Map()).get(hs)!;
    m.set(k, (m.get(k) ?? 0) + 1);
    const rk = pairKey(roomIdFor(hs, gs), roomIdFor(hs, gt));
    (relsBetween.get(rk) ?? relsBetween.set(rk, []).get(rk)!).push(r.id);
  }

  // --- C. Shared group order --------------------------------------------------------------
  const wingGroups = input.groups.filter((g) => g.scope === "wing" && scope.concepts.some((c) => groupOf.get(c.key) === g.id && home.get(c.key) !== "hall" && home.get(c.key) !== "commons"));
  const cols = cfg.wingColumns;
  const slotRC = (i: number) => ({ row: Math.floor(i / cols), col: i % cols });
  const gridNeighbours = (i: number, n: number) => {
    const { row, col } = slotRC(i);
    const out: number[] = [];
    for (let j = 0; j < n; j++) {
      const o = slotRC(j);
      if ((o.row === row && Math.abs(o.col - col) === 1) || (o.col === col && Math.abs(o.row - row) === 1)) out.push(j);
    }
    return out;
  };
  const groupOrder: string[] = [];
  {
    const rng = rngFor(seed, "group-order");
    const remaining = new Set(wingGroups.map((g) => g.id));
    const first = remaining.has(input.entranceGroup) ? input.entranceGroup : wingGroups[0]?.id;
    if (first) {
      groupOrder.push(first);
      remaining.delete(first);
    }
    while (remaining.size) {
      const i = groupOrder.length;
      const neigh = gridNeighbours(i, wingGroups.length).filter((j) => j < i);
      const score = (g: string) => [
        neigh.reduce((s, j) => s + (weightAll.get(pairKey(g, groupOrder[j]!)) ?? 0), 0),
        groupOrder.reduce((s, h) => s + (weightAll.get(pairKey(g, h)) ?? 0), 0),
      ];
      const cands = [...remaining];
      const scored = cands.map((g) => ({ g, s: score(g) }));
      const best0 = Math.max(...scored.map((x) => x.s[0]!));
      const tier0 = scored.filter((x) => x.s[0] === best0);
      const best1 = Math.max(...tier0.map((x) => x.s[1]!));
      const tier1 = tier0.filter((x) => x.s[1] === best1).map((x) => x.g);
      const chosen = breakTie(tier1, (g) => g, rng);
      if (tier1.length > 1) tieBreaks.push({ area: `group-order:slot-${i}`, candidates: [...tier1].sort(compareStrings), chosen });
      groupOrder.push(chosen);
      remaining.delete(chosen);
    }
  }

  // --- D. Rooms and door topology ---------------------------------------------------------
  const rooms: RoomPlan[] = [];
  const doorTopo: { id: string; rooms: [string, string]; purpose: DoorPlan["purpose"]; relationshipIds: string[] }[] = [];
  const doorId = (a: string, b: string) => {
    const [p, q] = [a, b].sort(compareStrings) as [string, string];
    return `portal:${p.slice(5)}--${q.slice(5)}`;
  };
  const conceptsIn = (pred: (c: GraphConcept) => boolean) => scope.concepts.filter(pred).map((c) => c.key);

  const wingInfo: { slug: string; roomIds: string[]; cols: number; rows: number }[] = [];
  for (const slug of scope.selectedSlugs.filter((s) => scope.traditionBySlug.has(s))) {
    const present = groupOrder.filter((g) => scope.concepts.some((c) => home.get(c.key) === slug && groupOf.get(c.key) === g));
    if (present.length === 0) {
      issues.push(`Tradition ${slug} has no placeable concepts`);
      continue;
    }
    const n = present.length;
    const roomIds = present.map((g) => roomIdFor(slug, g));
    present.forEach((g, i) => {
      const grp = groupById.get(g)!;
      rooms.push({
        id: roomIds[i]!,
        zoneId: wingZoneId(slug),
        kind: "wing-room",
        slug,
        groupId: g,
        label: `${scope.traditionBySlug.get(slug)!.name}: ${grp.label}`,
        categories: [...grp.categories],
        conceptKeys: conceptsIn((c) => home.get(c.key) === slug && groupOf.get(c.key) === g),
        grid: { ...slotRC(i), slot: i },
        rect: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
        entranceDoorId: null,
        depth: 0,
      });
    });
    // Spanning tree (BFS from slot 0, neighbours in slot order).
    const inTree = new Set<number>([0]);
    const queue = [0];
    const treeEdges = new Set<string>();
    while (queue.length) {
      const i = queue.shift()!;
      for (const j of gridNeighbours(i, n)) {
        if (inTree.has(j)) continue;
        inTree.add(j);
        queue.push(j);
        treeEdges.add(pairKey(String(i), String(j)));
      }
    }
    for (let i = 0; i < n; i++) {
      for (const j of gridNeighbours(i, n)) {
        if (j <= i) continue;
        const rels = (relsBetween.get(pairKey(roomIds[i]!, roomIds[j]!)) ?? []).slice().sort(compareStrings);
        const tree = treeEdges.has(pairKey(String(i), String(j)));
        if (!tree && rels.length === 0) continue;
        doorTopo.push({
          id: doorId(roomIds[i]!, roomIds[j]!),
          rooms: [roomIds[i]!, roomIds[j]!],
          purpose: rels.length > 0 ? "cross-category" : "circulation",
          relationshipIds: rels,
        });
      }
    }
    doorTopo.push({ id: doorId(HALL_ID, roomIds[0]!), rooms: [HALL_ID, roomIds[0]!], purpose: "entrance", relationshipIds: [] });
    wingInfo.push({ slug, roomIds, cols: Math.min(cols, n), rows: Math.ceil(n / cols) });
  }

  rooms.push({
    id: HALL_ID,
    zoneId: "zone:comparison",
    kind: "hall",
    slug: null,
    groupId: input.groups.find((g) => g.scope === "hall")?.id ?? null,
    label: "Comparison hall",
    categories: input.groups.filter((g) => g.scope === "hall").flatMap((g) => g.categories),
    conceptKeys: conceptsIn((c) => home.get(c.key) === "hall"),
    grid: null,
    rect: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    entranceDoorId: null,
    depth: 0,
  });
  rooms.push({
    id: LOBBY_ID,
    zoneId: "zone:entrance",
    kind: "lobby",
    slug: null,
    groupId: null,
    label: "Entrance lobby",
    categories: [],
    conceptKeys: [],
    grid: null,
    rect: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    entranceDoorId: null,
    depth: 0,
  });
  doorTopo.push({ id: doorId(HALL_ID, LOBBY_ID), rooms: [HALL_ID, LOBBY_ID], purpose: "entrance", relationshipIds: [] });
  const commonsKeys = conceptsIn((c) => home.get(c.key) === "commons");
  if (commonsKeys.length > 0) {
    rooms.push({
      id: COMMONS_ID,
      zoneId: "zone:shared",
      kind: "commons",
      slug: null,
      groupId: null,
      label: input.sharedLabel,
      categories: [...new Set(commonsKeys.map((k) => scope.conceptByKey.get(k)!.category))].sort(
        (a, b) => KNOWLEDGE_CATEGORY_CODES.indexOf(a as never) - KNOWLEDGE_CATEGORY_CODES.indexOf(b as never),
      ),
      conceptKeys: commonsKeys,
      grid: null,
      rect: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
      entranceDoorId: null,
      depth: 0,
    });
    doorTopo.push({ id: doorId(HALL_ID, COMMONS_ID), rooms: [HALL_ID, COMMONS_ID], purpose: "circulation", relationshipIds: [] });
  }
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  // Door sides per room (for sizing).
  const doorSidesOf = (roomId: string): Side[] => {
    const r = roomById.get(roomId)!;
    const out: Side[] = [];
    for (const d of doorTopo) {
      if (!d.rooms.includes(roomId)) continue;
      const other = roomById.get(d.rooms[0] === roomId ? d.rooms[1] : d.rooms[0])!;
      if (r.kind === "wing-room") {
        if (other.kind === "hall") out.push("s");
        else if (other.grid!.row > r.grid!.row) out.push("n");
        else if (other.grid!.row < r.grid!.row) out.push("s");
        else out.push(other.grid!.col > r.grid!.col ? "e" : "w");
      } else if (r.kind === "hall") out.push(other.kind === "wing-room" ? "n" : "s");
      else out.push("n");
    }
    return out;
  };

  // --- E/F. Sizing loop -------------------------------------------------------------------
  const size = new Map<string, number>();
  for (const r of rooms) {
    if (r.kind === "wing-room" || r.kind === "commons") size.set(r.id, squareSizeFor(r.conceptKeys.length, doorSidesOf(r.id), cfg));
  }
  const colW = new Map<string, number[]>();
  const rowD = new Map<string, number[]>();
  for (const w of wingInfo) {
    const cw = Array.from({ length: w.cols }, () => 0);
    const rd = Array.from({ length: w.rows }, () => 0);
    for (const id of w.roomIds) {
      const r = roomById.get(id)!;
      cw[r.grid!.col] = Math.max(cw[r.grid!.col]!, size.get(id)!);
      rd[r.grid!.row] = Math.max(rd[r.grid!.row]!, size.get(id)!);
    }
    colW.set(w.slug, cw);
    rowD.set(w.slug, rd);
  }
  let hallExtra = 0;
  const lobbyW = snapUp(cfg.lobbyWidth, cfg.gridUnit);
  const lobbyD = snapUp(cfg.lobbyDepth, cfg.gridUnit);
  const hallD = snapUp(cfg.hallDepth, cfg.gridUnit);

  let doors: DoorPlan[] = [];
  let slotsByRoom = new Map<string, Slot[]>();
  for (let iteration = 0; iteration < 200; iteration++) {
    // Positions.
    let x = 0;
    for (const w of wingInfo) {
      const cw = colW.get(w.slug)!;
      const rd = rowD.get(w.slug)!;
      for (const id of w.roomIds) {
        const r = roomById.get(id)!;
        const x0 = x + cw.slice(0, r.grid!.col).reduce((s, v) => s + v, 0);
        const zTop = -rd.slice(0, r.grid!.row + 1).reduce((s, v) => s + v, 0);
        r.rect = { minX: x0, maxX: x0 + cw[r.grid!.col]!, minZ: zTop, maxZ: zTop + rd[r.grid!.row]! };
      }
      x += cw.reduce((s, v) => s + v, 0);
    }
    const commons = roomById.get(COMMONS_ID);
    const commonsS = commons ? size.get(COMMONS_ID)! : 0;
    const hallL = Math.max(x, lobbyW + commonsS) + hallExtra;
    roomById.get(HALL_ID)!.rect = { minX: 0, maxX: hallL, minZ: 0, maxZ: hallD };
    roomById.get(LOBBY_ID)!.rect = { minX: 0, maxX: lobbyW, minZ: hallD, maxZ: hallD + lobbyD };
    if (commons) commons.rect = { minX: lobbyW, maxX: lobbyW + commonsS, minZ: hallD, maxZ: hallD + commonsS };

    // Doorways: centred on the shared stretch of the two rooms' facing sides.
    doors = doorTopo.map((d) => {
      const a = roomById.get(d.rooms[0])!.rect;
      const b = roomById.get(d.rooms[1])!.rect;
      let orient: Orient;
      let c: number;
      let lo: number;
      let hi: number;
      if (Math.abs(a.maxZ - b.minZ) < 1e-6 || Math.abs(b.maxZ - a.minZ) < 1e-6) {
        orient = "h";
        c = Math.abs(a.maxZ - b.minZ) < 1e-6 ? a.maxZ : a.minZ;
        lo = Math.max(a.minX, b.minX);
        hi = Math.min(a.maxX, b.maxX);
      } else {
        orient = "v";
        c = Math.abs(a.maxX - b.minX) < 1e-6 ? a.maxX : a.minX;
        lo = Math.max(a.minZ, b.minZ);
        hi = Math.min(a.maxZ, b.maxZ);
      }
      if (hi - lo < cfg.doorWidth + cfg.wallThickness) issues.push(`Doorway ${d.id}: shared wall too short (${round(hi - lo)} m)`);
      return { ...d, orient, c: round(c), center: round((lo + hi) / 2), width: cfg.doorWidth };
    });

    // Slots and capacity check.
    slotsByRoom = new Map(rooms.map((r) => [r.id, roomSlots(r.rect, doors, cfg)]));
    let grew = false;
    for (const r of rooms) {
      if (slotsByRoom.get(r.id)!.length >= r.conceptKeys.length) continue;
      grew = true;
      if (r.kind === "hall") hallExtra += cfg.gridUnit * 4;
      else if (r.kind === "commons") size.set(r.id, size.get(r.id)! + cfg.gridUnit);
      else if (r.kind === "wing-room") {
        colW.get(r.slug!)![r.grid!.col]! += cfg.gridUnit;
        rowD.get(r.slug!)![r.grid!.row]! += cfg.gridUnit;
      }
    }
    if (!grew) break;
    if (iteration === 199) issues.push("Room sizing did not converge");
  }

  // --- G. Walls ---------------------------------------------------------------------------
  const walls = buildWalls(
    rooms.map((r) => r.rect),
    doors.map((d) => ({ id: d.id, orient: d.orient, c: d.c, center: d.center, width: d.width })),
    cfg.wallThickness,
    cfg.wallHeight,
  );
  issues.push(...walls.doorErrors);
  const sortedRooms = [...rooms].sort((a, b) => compareStrings(a.id, b.id));
  const wallsByRoom = new Map<string, Collider[]>(sortedRooms.map((r) => [r.id, []]));
  const onBoundary = (r: Rect, p: Point) =>
    ((Math.abs(p.x - r.minX) < 1e-6 || Math.abs(p.x - r.maxX) < 1e-6) && p.z >= r.minZ - 1e-6 && p.z <= r.maxZ + 1e-6) ||
    ((Math.abs(p.z - r.minZ) < 1e-6 || Math.abs(p.z - r.maxZ) < 1e-6) && p.x >= r.minX - 1e-6 && p.x <= r.maxX + 1e-6);
  for (const col of walls.colliders) {
    const mid = { x: (col.min[0] + col.max[0]) / 2, z: (col.min[2] + col.max[2]) / 2 };
    const owner = sortedRooms.find((r) => onBoundary(r.rect, mid));
    if (!owner) issues.push(`Wall ${col.id} is not on any room boundary`);
    wallsByRoom.get(owner?.id ?? sortedRooms[0]!.id)!.push(col);
  }

  // Room graph: entrance doors and door-hop depth from the lobby.
  {
    const adj = new Map<string, DoorPlan[]>();
    for (const d of [...doors].sort((p, q) => compareStrings(p.id, q.id))) {
      for (const r of d.rooms) (adj.get(r) ?? adj.set(r, []).get(r)!).push(d);
    }
    const seen = new Set([LOBBY_ID]);
    const q = [LOBBY_ID];
    while (q.length) {
      const cur = q.shift()!;
      for (const d of adj.get(cur) ?? []) {
        const nxt = d.rooms[0] === cur ? d.rooms[1] : d.rooms[0];
        if (seen.has(nxt)) continue;
        seen.add(nxt);
        const r = roomById.get(nxt)!;
        r.entranceDoorId = d.id;
        r.depth = roomById.get(cur)!.depth + 1;
        q.push(nxt);
      }
    }
  }

  // --- H/I. Exhibit placement -------------------------------------------------------------
  const placements = new Map<string, Placement>();
  const roomOf = new Map<string, string>();
  const doorById = new Map(doors.map((d) => [d.id, d]));
  for (const r of sortedRooms) {
    for (const k of r.conceptKeys) roomOf.set(k, r.id);
    if (r.conceptKeys.length === 0) continue;
    const slots = slotsByRoom.get(r.id)!;
    let ordered: { key: string; slot: Slot }[];
    if (r.kind === "hall") {
      ordered = assignHall(r, slots, input, home, roomById);
    } else {
      const entrance = r.entranceDoorId ? doorById.get(r.entranceDoorId) : undefined;
      const startParam = entrance ? doorParam(r.rect, entrance) : 0;
      const P = 2 * (r.rect.maxX - r.rect.minX + r.rect.maxZ - r.rect.minZ);
      const clockwise = [...slots].sort((a, b) => ((a.param - startParam + P) % P) - ((b.param - startParam + P) % P));
      const keys = orderRoomConcepts(r, input, groupById, tieBreaks);
      ordered = keys.map((key, i) => ({ key, slot: clockwise[i]! }));
    }
    const orderIndex = new Map<Slot, number>();
    {
      const entrance = r.entranceDoorId ? doorById.get(r.entranceDoorId) : undefined;
      const startParam = entrance ? doorParam(r.rect, entrance) : 0;
      const P = 2 * (r.rect.maxX - r.rect.minX + r.rect.maxZ - r.rect.minZ);
      [...slots]
        .sort((a, b) => ((a.param - startParam + P) % P) - ((b.param - startParam + P) % P))
        .forEach((s, i) => orderIndex.set(s, i));
    }
    for (const { key, slot } of ordered) {
      if (!slot) {
        issues.push(`No wall slot left for ${key} in ${r.id}`);
        continue;
      }
      placements.set(key, placeOnSlot(key, r.id, slot, orderIndex.get(slot) ?? 0, cfg));
    }
  }

  const lobby = roomById.get(LOBBY_ID)!.rect;
  const spawn = { x: round((lobby.minX + lobby.maxX) / 2), z: round((lobby.minZ + lobby.maxZ) / 2), yawDeg: 0 };

  return {
    rooms: sortedRooms,
    doors: [...doors].sort((p, q) => compareStrings(p.id, q.id)),
    walls,
    wallsByRoom,
    placements,
    groupOf,
    roomOf,
    groupOrder,
    spawn,
    unmappedCategory,
    tieBreaks,
    issues,
  };
}

function doorParam(r: Rect, d: DoorPlan): number {
  if (d.orient === "h") return perimeterParam(r, Math.abs(d.c - r.minZ) < 1e-6 ? "n" : "s", d.center);
  return perimeterParam(r, Math.abs(d.c - r.maxX) < 1e-6 ? "e" : "w", d.center);
}

function placeOnSlot(key: string, roomId: string, slot: Slot, order: number, cfg: LayoutConfig): Placement {
  const s = slot.side;
  const at = (dist: number): Point =>
    s.orient === "h" ? { x: slot.u, z: s.face + s.normal.z * dist } : { x: s.face + s.normal.x * dist, z: slot.u };
  const back = at(cfg.wallGap);
  const front = at(cfg.wallGap + cfg.exhibitDepth);
  const half = cfg.exhibitWidth / 2;
  const [minX, maxX] = s.orient === "h" ? [slot.u - half, slot.u + half] : [Math.min(back.x, front.x), Math.max(back.x, front.x)];
  const [minZ, maxZ] = s.orient === "h" ? [Math.min(back.z, front.z), Math.max(back.z, front.z)] : [slot.u - half, slot.u + half];
  const centre = at(cfg.wallGap + cfg.exhibitDepth / 2);
  return {
    conceptKey: key,
    roomId,
    side: s.side,
    order,
    position: { x: round(centre.x), z: round(centre.z) },
    yawDeg: s.yawDeg,
    footprint: {
      id: `plinth:${key}`,
      kind: "plinth",
      min: [round(minX), 0, round(minZ)],
      max: [round(maxX), round(cfg.exhibitHeight), round(maxZ)],
    },
    approach: (() => {
      const p = at(cfg.wallGap + cfg.exhibitDepth + cfg.approachDistance);
      return { x: round(p.x), z: round(p.z) };
    })(),
    wall: { orient: s.orient, face: round(s.face, 4), normal: s.normal, u: slot.u },
  };
}

/**
 * Order the concepts of one room for clockwise placement:
 *  - category blocks in the group's category order (each category = one contiguous wall run);
 *  - inside a block, tradition concepts first, then PRECEDES chains in chain order, then the
 *    rest chained greedily by association strength (association.adjacency), so associated
 *    exhibits end up in neighbouring slots. Ties go to the seeded PRNG.
 */
function orderRoomConcepts(r: RoomPlan, input: LayoutInput, groupById: Map<string, ZoneGroup>, tieBreaks: TieBreak[]): string[] {
  const { scope } = input;
  const rng = rngFor(input.seed, `room-order:${r.id}`);
  const inRoom = new Set(r.conceptKeys);
  const categoryOrder = [
    ...(r.groupId ? (groupById.get(r.groupId)?.categories ?? []) : []),
    ...KNOWLEDGE_CATEGORY_CODES,
  ];
  const catIndex = (k: string) => categoryOrder.indexOf(scope.conceptByKey.get(k)!.category as never);

  // Association weights (adjacency-strategy relationships) inside this room.
  const assoc = new Map<string, Map<string, number>>();
  for (const rel of scope.relationships) {
    if (input.primaryStrategy.get(rel.id) !== "adjacency") continue;
    if (!inRoom.has(rel.source) || !inRoom.has(rel.target)) continue;
    for (const [a, b] of [
      [rel.source, rel.target],
      [rel.target, rel.source],
    ] as const) {
      const m = assoc.get(a) ?? assoc.set(a, new Map()).get(a)!;
      m.set(b, (m.get(b) ?? 0) + 1);
    }
  }
  const w = (a: string, b: string) => assoc.get(a)?.get(b) ?? 0;

  const used = new Set<string>();
  const chainUnits: { cat: number; keys: string[] }[] = [];
  for (const ch of input.chains) {
    const keys = ch.order.filter((k) => inRoom.has(k) && !used.has(k));
    if (keys.length === 0) continue;
    keys.forEach((k) => used.add(k));
    chainUnits.push({ cat: catIndex(keys[0]!), keys });
  }

  const out: string[] = [];
  const cats = [...new Set(r.conceptKeys.map(catIndex))].sort((a, b) => a - b);
  for (const cat of cats) {
    const singles = r.conceptKeys.filter((k) => !used.has(k) && catIndex(k) === cat);
    const pinned = singles.filter((k) => scope.conceptByKey.get(k)!.type === "tradition").sort(compareStrings);
    out.push(...pinned);
    for (const u of chainUnits.filter((u) => u.cat === cat)) out.push(...u.keys);
    const rest = new Set(singles.filter((k) => !pinned.includes(k)));
    const degree = (k: string) => [...rest].reduce((s, o) => s + w(k, o), 0);
    let last: string | null = null;
    while (rest.size) {
      const cands = [...rest];
      let tier: string[];
      if (last === null) {
        const best = Math.max(...cands.map(degree));
        tier = cands.filter((k) => degree(k) === best);
      } else {
        const l = last;
        const best = Math.max(...cands.map((k) => w(l, k)));
        const t0 = cands.filter((k) => w(l, k) === best);
        const bd = Math.max(...t0.map(degree));
        tier = t0.filter((k) => degree(k) === bd);
      }
      const chosen = breakTie(tier, (k) => k, rng);
      if (tier.length > 1) tieBreaks.push({ area: `room-order:${r.id}:${out.length}`, candidates: [...tier].sort(compareStrings), chosen });
      out.push(chosen);
      rest.delete(chosen);
      last = chosen;
    }
  }
  return out;
}

/**
 * Hall placement: each comparison exhibit takes the free slot nearest (in x) to the mean x
 * of the wings it compares, so a comparison sits between the traditions it connects.
 */
function assignHall(
  r: RoomPlan,
  slots: Slot[],
  input: LayoutInput,
  home: Map<string, string>,
  roomById: Map<string, RoomPlan>,
): { key: string; slot: Slot }[] {
  const wingCenter = new Map<string, number>();
  for (const room of roomById.values()) {
    if (room.kind !== "wing-room") continue;
    const cur = wingCenter.get(room.slug!);
    const cx = rectCenter(room.rect).x;
    wingCenter.set(room.slug!, cur === undefined ? cx : cur);
  }
  // Wing centre = mean of its rooms' x extents.
  for (const slug of new Set([...roomById.values()].filter((x) => x.kind === "wing-room").map((x) => x.slug!))) {
    const rs = [...roomById.values()].filter((x) => x.slug === slug);
    wingCenter.set(slug, (Math.min(...rs.map((x) => x.rect.minX)) + Math.max(...rs.map((x) => x.rect.maxX))) / 2);
  }
  const target = (k: string): number => {
    const c = input.scope.conceptByKey.get(k)!;
    const slugs = (input.scope.compares.get(k) ?? [])
      .map((ck) => home.get(ck))
      .filter((s): s is string => !!s && wingCenter.has(s));
    const own = input.scope.slugOf(c);
    const list = slugs.length > 0 ? slugs : own && wingCenter.has(own) ? [own] : [];
    if (list.length === 0) return rectCenter(r.rect).x;
    return list.reduce((s, x) => s + wingCenter.get(x)!, 0) / list.length;
  };
  const keys = [...r.conceptKeys].sort((a, b) => target(a) - target(b) || compareStrings(a, b));
  const free = [...slots].sort((a, b) => a.param - b.param);
  const out: { key: string; slot: Slot }[] = [];
  for (const k of keys) {
    const t = target(k);
    let bestI = -1;
    let bestD = Infinity;
    free.forEach((s, i) => {
      const x = s.side.orient === "h" ? s.u : s.side.face;
      const d = Math.abs(x - t) + (s.side.side === "s" ? 0 : 0.001);
      if (d < bestD - 1e-9) {
        bestD = d;
        bestI = i;
      }
    });
    if (bestI < 0) {
      out.push({ key: k, slot: undefined as unknown as Slot });
      continue;
    }
    out.push({ key: k, slot: free[bestI]! });
    free.splice(bestI, 1);
  }
  return out;
}
