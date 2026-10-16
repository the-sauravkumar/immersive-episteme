/**
 * Layout engine: zone groups -> rooms -> doorways -> walls -> exhibit slots.
 *
 * Two building schemes (`layout.building`, versioned with the rule set):
 *
 * "hub" (default rule set v3; DR-043). Plan, x east, z south, north up:
 *
 *                       +---------------+
 *                       |   commons     |
 *        wing A rooms   +------||-------+   wing C rooms
 *        (col 1 north)  | comparison    |   (col 1 north)
 *      +------+------+  |    hall       |  +------+------+
 *      |      |  1   |  +-||-------||---+  |  1   |      |
 *      |      |      =  | [directory]   |  =      |      |       = wing entrance doorway
 *      +------+------+  |   spawn ^     |  +------+------+
 *                       |               |
 *                       +------||-------+
 *                         |  1  |      |     wing B rooms (col 1 east)
 *
 *    The entrance lobby is the hub. The spawn stands on the lobby's axis, `hubSpawnDepth` (the
 *    entrance directory's reading distance) from its north wall, facing north. The wings open off
 *    the lobby's west, south and east walls (canonical slug order: first wing west, second south,
 *    third east), each doorway level with the spawn (west, east) or on its axis (south), and the
 *    lobby is as deep as `hubSpawnDepth` + half its width, so all three wing doorways are half the
 *    lobby width from the spawn: the walking cost to every tradition is equal by construction. The
 *    comparison hall lies north of the lobby, entered by two doorways at the quarter points
 *    of the north wall either side of the directory; the shared commons opens off the hall's north
 *    wall. A wing grid is rotated so its entrance room is centred on its doorway and its second
 *    column runs away from the wing behind the spawn, so no two wings meet.
 *
 * "row" (rule sets v1, v2): the wings side by side along one long comparison hall, in slug order
 *    west to east, the lobby off the hall's west end (DR-023 Addendum: walking time to the wings
 *    5.9 / 19.3 / 31.4 s).
 *
 *  - Wing grid (both schemes): rooms take grid slots in one shared group order for all wings, on a
 *    `wingColumns`-wide grid filled in serpentine order (row 0 left to right, row 1 right to
 *    left, ...), so consecutive slots are always grid neighbours. Under the default `groupOrder`
 *    "template" the order is the rule set's group order (the 2D section order, rule
 *    layout.template-order); under "connection" each later slot takes the group with the most
 *    cross-category relationships to its already-placed grid neighbours (rule
 *    cross-category.connection; equal scores broken by the seeded PRNG).
 *  - Doorways: a circulation doorway between every pair of consecutive slots (rule
 *    layout.circulation), so walking from the entrance room meets the sections one doorway apart
 *    in their order (review finding spatial-3), plus a doorway between every other pair of grid
 *    neighbours whose concepts are related (cross-category.connection).
 *  - Room sizes: each room first needs the smallest square (>= minRoomSize) whose wall slots hold
 *    its exhibits; a grid column then takes its widest room and a grid row its deepest, so walls
 *    stay aligned, and a column or row grows further while any of its rooms is short of slots.
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

export type WingSide = "w" | "s" | "e";

export interface Layout {
  /** The building scheme actually built ("hub" falls back to "row" for more than three wings). */
  building: "hub" | "row";
  /** Hub only: the lobby side each wing opens off (canonical slug order: west, south, east). */
  wingSides: Map<string, WingSide>;
  /** Departures from the configured scheme that still build (reported as a warning). */
  notes: string[];
  /** Side (m) of the smallest square each wing room or commons needs for its exhibits, before grid alignment. */
  minSide: Map<string, number>;
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

/** A free stretch of wall (corner and doorway clearances removed) and how many exhibits fit. */
interface Segment {
  side: SideGeom;
  p: number;
  q: number;
  capacity: number;
}

function roomSegments(r: Rect, doors: readonly DoorOpening[], cfg: LayoutConfig): Segment[] {
  const out: Segment[] = [];
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
      const capacity = Math.floor((q - p + 1e-9) / cfg.exhibitSpacing);
      if (capacity > 0) out.push({ side: s, p, q, capacity });
    }
  }
  return out;
}

/** Every slot at the standard spacing, centred in its segment (capacity checks and the hall). */
function roomSlots(r: Rect, doors: readonly DoorOpening[], cfg: LayoutConfig): Slot[] {
  const out: Slot[] = [];
  for (const g of roomSegments(r, doors, cfg)) {
    const start = g.p + (g.q - g.p - g.capacity * cfg.exhibitSpacing) / 2;
    for (let j = 0; j < g.capacity; j++) {
      const u = round(start + cfg.exhibitSpacing * (j + 0.5));
      out.push({ side: g.side, u, param: perimeterParam(r, g.side.side, u) });
    }
  }
  return out;
}

/**
 * n exhibit positions spread evenly round a room (rule layout.even-spacing). Rooms share their
 * grid column's width and row's depth, so a room often has more wall than exhibits. Each free
 * wall segment gets a share of the n exhibits in proportion to its capacity (largest remainder,
 * never above capacity). Its exhibits hang at the one standard spacing (`exhibitSpacing`) as a
 * group centred on the segment, so the rhythm is the same on every wall of the museum, no wall
 * is left with a long empty run at one end, and corner and doorway clearances are kept.
 */
function evenRoomSlots(r: Rect, doors: readonly DoorOpening[], cfg: LayoutConfig, n: number): Slot[] {
  const segs = roomSegments(r, doors, cfg);
  const total = segs.reduce((s, g) => s + g.capacity, 0);
  if (n >= total) return roomSlots(r, doors, cfg);
  const share = segs.map((g) => (n * g.capacity) / total);
  const counts = share.map((x) => Math.floor(x));
  let left = n - counts.reduce((s, c) => s + c, 0);
  const byRemainder = share
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left === 0) break;
    if (counts[i]! < segs[i]!.capacity) {
      counts[i]!++;
      left--;
    }
  }
  const out: Slot[] = [];
  segs.forEach((g, i) => {
    const k = counts[i]!;
    const start = g.p + (g.q - g.p - k * cfg.exhibitSpacing) / 2;
    for (let j = 0; j < k; j++) {
      const u = round(start + cfg.exhibitSpacing * (j + 0.5));
      out.push({ side: g.side, u, param: perimeterParam(r, g.side.side, u) });
    }
  });
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
  // Rule sets that list types per group (version 2, DR-024) choose a concept's group by its TYPE,
  // the same mapping as its 2D section; categories then only order the runs inside a room.
  const groupOfType = new Map<string, ZoneGroup>();
  for (const g of input.groups) for (const t of g.types ?? []) if (!groupOfType.has(t)) groupOfType.set(t, g);
  const fallback = groupById.get(input.fallbackGroup) ?? input.groups[0]!;

  // --- A. Concept -> group / home -----------------------------------------------------------
  const groupOf = new Map<string, string>();
  const home = new Map<string, string>(); // slug | "hall" | "commons"
  const unmappedCategory: string[] = [];
  for (const c of scope.concepts) {
    let g = groupOfType.size > 0 ? (groupOfType.get(c.type) ?? groupOfCategory.get(c.category)) : groupOfCategory.get(c.category);
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
  // Serpentine: row 0 left to right, row 1 right to left, ..., so slots i and i + 1 always share a
  // wall (review finding spatial-3: row-major order made every second pair of sections diagonal).
  const slotRC = (i: number) => {
    const row = Math.floor(i / cols);
    const c = i % cols;
    return { row, col: row % 2 === 0 ? c : cols - 1 - c };
  };
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
  if (cfg.groupOrder === "template") {
    // Rule layout.template-order: rooms follow the rule set's group order, the same section
    // order as the 2D tradition page (context, materials and tools, process, …), entrance group
    // first. Relationships still shape the plan through doorways and the comparison hall.
    const ids = wingGroups.map((g) => g.id);
    const first = ids.includes(input.entranceGroup) ? input.entranceGroup : ids[0];
    if (first) groupOrder.push(first, ...ids.filter((id) => id !== first));
  } else {
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
  /** `at`: the doorway's centre along the shared wall when it is not the middle of the shared stretch. */
  const doorTopo: { id: string; rooms: [string, string]; purpose: DoorPlan["purpose"]; relationshipIds: string[]; at?: number }[] = [];
  const doorId = (a: string, b: string) => {
    const [p, q] = [a, b].sort(compareStrings) as [string, string];
    return `portal:${p.slice(5)}--${q.slice(5)}`;
  };
  const conceptsIn = (pred: (c: GraphConcept) => boolean) => scope.concepts.filter(pred).map((c) => c.key);

  const wingInfo: { slug: string; roomIds: string[]; cols: number; rows: number }[] = [];
  const wingSlugs = scope.selectedSlugs
    .filter((s) => scope.traditionBySlug.has(s))
    .filter((slug) => groupOrder.some((g) => scope.concepts.some((c) => home.get(c.key) === slug && groupOf.get(c.key) === g)));
  // Hub: up to three wings, one per free lobby wall, in canonical (slug) order west, south, east;
  // two wings take west and east, one wing west. More wings than lobby walls: the row building.
  let building: Layout["building"] = cfg.building;
  const notes: string[] = [];
  if (building === "hub" && wingSlugs.length > 3) {
    notes.push(`The hub building holds at most 3 wings (${wingSlugs.length} selected); built as a row, so the wings are not equally far from the spawn`);
    building = "row";
  }
  const sideOrder: WingSide[] = wingSlugs.length === 3 ? ["w", "s", "e"] : wingSlugs.length === 2 ? ["w", "e"] : ["w"];
  const wingSides = new Map<string, WingSide>(building === "hub" ? [...wingSlugs].sort(compareStrings).map((slug, i) => [slug, sideOrder[i]!] as const) : []);
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
        categories: roomCategories(grp.categories, conceptsIn((c) => home.get(c.key) === slug && groupOf.get(c.key) === g).map((k) => scope.conceptByKey.get(k)!.category)),
        conceptKeys: conceptsIn((c) => home.get(c.key) === slug && groupOf.get(c.key) === g),
        grid: { ...slotRC(i), slot: i },
        rect: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
        entranceDoorId: null,
        depth: 0,
      });
    });
    // Circulation: the path through the slots in order (each pair of consecutive slots shares a
    // wall under the serpentine order), so consecutive sections are always one doorway apart.
    const treeEdges = new Set<string>();
    for (let i = 0; i + 1 < n; i++) treeEdges.add(pairKey(String(i), String(i + 1)));
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
    if (building === "hub") {
      // West and east doorways stand level with the spawn; the south doorway is on its axis.
      const side = wingSides.get(slug)!;
      doorTopo.push({ id: doorId(LOBBY_ID, roomIds[0]!), rooms: [LOBBY_ID, roomIds[0]!], purpose: "entrance", relationshipIds: [], at: side === "s" ? 0 : cfg.hubSpawnDepth });
    } else {
      doorTopo.push({ id: doorId(HALL_ID, roomIds[0]!), rooms: [HALL_ID, roomIds[0]!], purpose: "entrance", relationshipIds: [] });
    }
    wingInfo.push({ slug, roomIds, cols: Math.min(cols, n), rows: Math.ceil(n / cols) });
  }

  rooms.push({
    id: HALL_ID,
    zoneId: "zone:comparison",
    kind: "hall",
    slug: null,
    groupId: input.groups.find((g) => g.scope === "hall")?.id ?? null,
    label: "Comparison hall",
    categories: roomCategories(
      input.groups.filter((g) => g.scope === "hall").flatMap((g) => g.categories),
      conceptsIn((c) => home.get(c.key) === "hall").map((k) => scope.conceptByKey.get(k)!.category),
    ),
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
  if (building === "hub") {
    // Two doorways into the hall at the quarter points of the lobby's north wall, either side of the
    // directory on the spawn axis (their place follows the lobby width, set in the sizing loop).
    doorTopo.push({ id: `${doorId(HALL_ID, LOBBY_ID)}:e`, rooms: [HALL_ID, LOBBY_ID], purpose: "entrance", relationshipIds: [] });
    doorTopo.push({ id: `${doorId(HALL_ID, LOBBY_ID)}:w`, rooms: [HALL_ID, LOBBY_ID], purpose: "entrance", relationshipIds: [] });
  } else {
    doorTopo.push({ id: doorId(HALL_ID, LOBBY_ID), rooms: [HALL_ID, LOBBY_ID], purpose: "entrance", relationshipIds: [] });
  }
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
        if (other.kind === "hall" || other.kind === "lobby") out.push("s");
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
  const minSide = new Map(size);
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
  let hubLobby: { Wl: number; Dl: number } | null = null;
  let slotsByRoom = new Map<string, Slot[]>();
  for (let iteration = 0; iteration < 200; iteration++) {
    // Positions.
    const commons = roomById.get(COMMONS_ID);
    const commonsS = commons ? size.get(COMMONS_ID)! : 0;
    if (building === "hub") {
      // Lobby: at least as wide as the entrance column of the west and east wings (so those wings end
      // before the south wing begins) and as deep as the spawn's distance from the north wall plus
      // half the width, so the three wing doorways are equally far from the spawn.
      const zs = cfg.hubSpawnDepth;
      const sideWings = wingInfo.filter((w) => wingSides.get(w.slug) !== "s");
      // North wall: directory in the middle, a doorway (with its clearances) in each half.
      const minNorth = cfg.hubDirectoryWidth + 4 * (cfg.doorWidth / 2 + cfg.doorClearance + cfg.wallThickness);
      const Wl = snapUp(Math.max(lobbyW, minNorth, ...sideWings.map((w) => colW.get(w.slug)![0]!)), 2 * cfg.gridUnit);
      const Dl = round(zs + Wl / 2);
      roomById.get(LOBBY_ID)!.rect = { minX: -Wl / 2, maxX: Wl / 2, minZ: 0, maxZ: Dl };
      hubLobby = { Wl, Dl };
      for (const w of wingInfo) {
        const cw = colW.get(w.slug)!;
        const rd = rowD.get(w.slug)!;
        const side = wingSides.get(w.slug)!;
        const c0 = cw[0]!;
        for (const id of w.roomIds) {
          const r = roomById.get(id)!;
          const lx0 = cw.slice(0, r.grid!.col).reduce((s, v) => s + v, 0);
          const lx1 = lx0 + cw[r.grid!.col]!;
          const d0 = rd.slice(0, r.grid!.row).reduce((s, v) => s + v, 0);
          const d1 = d0 + rd[r.grid!.row]!;
          if (side === "s") r.rect = { minX: -c0 / 2 + lx0, maxX: -c0 / 2 + lx1, minZ: Dl + d0, maxZ: Dl + d1 };
          else {
            // Across, the wing runs north from its entrance column; its rows run outward (west or east).
            const minZ = zs + c0 / 2 - lx1;
            const maxZ = zs + c0 / 2 - lx0;
            r.rect = side === "w" ? { minX: -Wl / 2 - d1, maxX: -Wl / 2 - d0, minZ, maxZ } : { minX: Wl / 2 + d0, maxX: Wl / 2 + d1, minZ, maxZ };
          }
        }
      }
      // Hall north of the lobby, as wide as the lobby; the commons north of the hall, centred. A
      // commons wider than the hall must clear the west and east wings, so the hall lengthens.
      let hallLen = hallD + hallExtra;
      if (commons && commonsS > Wl) {
        const wingTop = Math.min(0, ...sideWings.flatMap((w) => w.roomIds.map((id) => roomById.get(id)!.rect.minZ)));
        hallLen = Math.max(hallLen, snapUp(-wingTop, cfg.gridUnit));
      }
      roomById.get(HALL_ID)!.rect = { minX: -Wl / 2, maxX: Wl / 2, minZ: -hallLen, maxZ: 0 };
      if (commons) commons.rect = { minX: -commonsS / 2, maxX: commonsS / 2, minZ: -hallLen - commonsS, maxZ: -hallLen };
    } else {
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
      const hallL = Math.max(x, lobbyW + commonsS) + hallExtra;
      roomById.get(HALL_ID)!.rect = { minX: 0, maxX: hallL, minZ: 0, maxZ: hallD };
      roomById.get(LOBBY_ID)!.rect = { minX: 0, maxX: lobbyW, minZ: hallD, maxZ: hallD + lobbyD };
      if (commons) commons.rect = { minX: lobbyW, maxX: lobbyW + commonsS, minZ: hallD, maxZ: hallD + commonsS };
    }

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
      // Hub lobby doorways into the hall: at the quarter points of the lobby's north wall.
      const lobbyHall = hubLobby && d.rooms.includes(HALL_ID) && d.rooms.includes(LOBBY_ID);
      const at = d.at ?? (lobbyHall ? (d.id.endsWith(":w") ? -1 : 1) * (hubLobby!.Wl / 4) : undefined);
      const center = at ?? (lo + hi) / 2;
      if (at !== undefined && (center - cfg.doorWidth / 2 - cfg.wallThickness / 2 < lo - 1e-6 || center + cfg.doorWidth / 2 + cfg.wallThickness / 2 > hi + 1e-6)) {
        issues.push(`Doorway ${d.id}: its place (${round(center)}) is off the shared wall ${round(lo)}..${round(hi)}`);
      }
      return { id: d.id, rooms: d.rooms, purpose: d.purpose, relationshipIds: d.relationshipIds, orient, c: round(c), center: round(center), width: cfg.doorWidth };
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
    let slots = slotsByRoom.get(r.id)!;
    let ordered: { key: string; slot: Slot }[];
    if (r.kind === "hall") {
      ordered = assignHall(r, slots, input, home, roomById, building);
    } else {
      const entrance = r.entranceDoorId ? doorById.get(r.entranceDoorId) : undefined;
      const startParam = entrance ? doorParam(r.rect, entrance) : 0;
      const P = 2 * (r.rect.maxX - r.rect.minX + r.rect.maxZ - r.rect.minZ);
      const keys = orderRoomConcepts(r, input, groupById, tieBreaks);
      slots = evenRoomSlots(r.rect, doors, cfg, keys.length);
      slotsByRoom.set(r.id, slots);
      const clockwise = [...slots].sort((a, b) => ((a.param - startParam + P) % P) - ((b.param - startParam + P) % P));
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
  const spawn =
    building === "hub"
      ? { x: round((lobby.minX + lobby.maxX) / 2), z: round(lobby.minZ + cfg.hubSpawnDepth), yawDeg: 0 }
      : { x: round((lobby.minX + lobby.maxX) / 2), z: round((lobby.minZ + lobby.maxZ) / 2), yawDeg: 0 };

  return {
    building,
    notes,
    wingSides,
    minSide,
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

/**
 * A room's categories: its group's categories in their order, then any other category of the
 * concepts it holds (a room is chosen by type, so it may hold a concept of another category) in
 * the vocabulary order. This is also the order of the category runs on its walls.
 */
function roomCategories(groupCategories: readonly string[], present: readonly string[]): string[] {
  const extra = [...new Set(present)].filter((c) => !groupCategories.includes(c));
  extra.sort((a, b) => KNOWLEDGE_CATEGORY_CODES.indexOf(a as never) - KNOWLEDGE_CATEGORY_CODES.indexOf(b as never));
  return [...groupCategories, ...extra];
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
      // A plinth fills the footprint to exhibitHeight; a reading stand's board reaches the plate's top
      // edge plus its margin (DR-045), so the footprint's front face backs the whole plate.
      max: [round(maxX), round(cfg.exhibitMount === "stand" ? cfg.standPanelTop + cfg.standBoardMargin : cfg.exhibitHeight), round(maxZ)],
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
  building: Layout["building"],
): { key: string; slot: Slot }[] {
  // Wing centre = the centre of the box round its rooms.
  const wingCenter = new Map<string, Point>();
  for (const slug of new Set([...roomById.values()].filter((x) => x.kind === "wing-room").map((x) => x.slug!))) {
    const rs = [...roomById.values()].filter((x) => x.slug === slug);
    wingCenter.set(slug, {
      x: (Math.min(...rs.map((x) => x.rect.minX)) + Math.max(...rs.map((x) => x.rect.maxX))) / 2,
      z: (Math.min(...rs.map((x) => x.rect.minZ)) + Math.max(...rs.map((x) => x.rect.maxZ))) / 2,
    });
  }
  const target = (k: string): Point => {
    const c = input.scope.conceptByKey.get(k)!;
    const slugs = (input.scope.compares.get(k) ?? [])
      .map((ck) => home.get(ck))
      .filter((s): s is string => !!s && wingCenter.has(s));
    const own = input.scope.slugOf(c);
    const list = slugs.length > 0 ? slugs : own && wingCenter.has(own) ? [own] : [];
    if (list.length === 0) return rectCenter(r.rect);
    return { x: list.reduce((s, x) => s + wingCenter.get(x)!.x, 0) / list.length, z: list.reduce((s, x) => s + wingCenter.get(x)!.z, 0) / list.length };
  };
  // Row: the hall runs west to east past the wings, so only x counts. Hub: the wings stand round
  // the lobby, so the slot nearest in plan to the centre of the wings compared.
  const slotPoint = (s: Slot): Point => (s.side.orient === "h" ? { x: s.u, z: s.side.face } : { x: s.side.face, z: s.u });
  const distance = (s: Slot, t: Point) => (building === "hub" ? Math.hypot(slotPoint(s).x - t.x, slotPoint(s).z - t.z) : Math.abs(slotPoint(s).x - t.x));
  const keys = [...r.conceptKeys].sort((a, b) => target(a).x - target(b).x || target(a).z - target(b).z || compareStrings(a, b));
  const free = [...slots].sort((a, b) => a.param - b.param);
  const out: { key: string; slot: Slot }[] = [];
  for (const k of keys) {
    const t = target(k);
    let bestI = -1;
    let bestD = Infinity;
    free.forEach((s, i) => {
      const d = distance(s, t) + (s.side.side === "s" ? 0 : 0.001);
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
