/**
 * Manifest -> scene model: the ONLY place the immersive renderer learns what to draw.
 *
 * Pure and framework-free (no three.js, no React), so the mapping is unit-tested
 * (tests/unit/immersive/scene-model.test.ts): every manifest element ends up either rendered by
 * a named part of the scene or listed in `report` with the reason it is not drawn. Nothing about
 * the layout is hard-coded here; positions, sizes, ordering, doorways and cues all come from the
 * compiled spatial manifest (docs/architecture/spatial-compiler.md §6-7).
 *
 * World convention (spatial compiler): 1 unit = 1 m, +y up, x east, z south, yaw 0 = north.
 */
import type { CompiledElement, CompiledManifest, Hotspot, Layer, Point, Rect, Vec3 } from "@/features/spatial/compiler/types";

export type Facing = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

/** Axis-aligned box from the manifest (walls, posts, plinths, door lintels) or derived trim. */
export interface SceneBox {
  id: string;
  /** Owning element id. */
  elementId: string;
  part: "wall-segment" | "wall-post" | "plinth" | "door-lintel" | "door-lining";
  partKey: string;
  min: Vec3;
  max: Vec3;
  /** True when the box blocks the visitor (manifest colliders); trims and lintels do not. */
  collider: boolean;
}

/** A flat surface from the manifest (`surfaces[]`). */
export interface ScenePlane {
  id: string;
  elementId: string;
  kind: "floor" | "ceiling" | "threshold" | "panel" | "image" | "sign";
  facing: Facing;
  min: Vec3;
  max: Vec3;
  uv: "metre" | "image";
  wallOffset: number | null;
  polygonOffset: { factor: number; units: number } | null;
  aspectRatio: number | null;
  assetId: string | null;
}

export interface SceneRoom {
  id: string;
  label: string;
  zoneId: string | null;
  roomKind: string;
  traditionSlug: string | null;
  bounds: Rect;
  height: number;
  neighbours: { roomId: string; portalId: string }[];
  /** Element ids that must be resident with this room (manifest streaming unit). */
  elementIds: string[];
  floor: ScenePlane | null;
  ceiling: ScenePlane | null;
  walls: SceneBox[];
}

export interface SceneZone {
  id: string;
  label: string;
  traditionSlug: string | null;
  conceptId: string | null;
  roomIds: string[];
  neighbours: { zoneId: string; portalIds: string[] }[];
}

export interface SceneExhibit {
  id: string;
  kind: "exhibit" | "station";
  conceptId: string;
  conceptKey: string;
  conceptType: string;
  category: string | null;
  label: string;
  roomId: string;
  position: Point;
  approach: Point;
  yawDeg: number;
  display: string;
  panel: ScenePlane;
  /** Image plane declared by the manifest, when there is an asset (see `report`). */
  image: ScenePlane | null;
  plinth: SceneBox | null;
  layers: Layer[];
  hotspots: Hotspot[];
  sequence: { pathId: string; index: number; count: number } | null;
}

export interface ScenePortal {
  id: string;
  label: string;
  connects: [string, string];
  axis: "x" | "z";
  opening: { a: Point; b: Point };
  width: number;
  height: number;
  purpose: string;
  position: Point;
  lintel: SceneBox | null;
  linings: SceneBox[];
  threshold: ScenePlane | null;
  encodes: CompiledElement["encodes"];
}

export interface ScenePath {
  id: string;
  label: string;
  ordered: boolean;
  stops: string[];
  waypoints: Point[];
  roomIds: string[];
  encodes: CompiledElement["encodes"];
}

export type CueEffect =
  | { type: "explain-and-guide"; causeElementId: string; effectElementId: string; explanation: string | null; route: Point[] }
  | { type: "show-path"; pathId: string }
  | { type: "name-prerequisite"; dependentElementId: string; prerequisiteElementId: string; explanation: string | null }
  | { type: "announce"; text: string };

export interface SceneCue {
  id: string;
  label: string;
  roomId: string | null;
  position: Point;
  relationshipType: string | null;
  relationshipId: string | null;
  conceptId: string | null;
  trigger: { type: "select" | "approach" | "enter"; elementId: string; radius: number | null };
  effect: CueEffect;
}

export interface SceneLabel {
  id: string;
  label: string;
  roomId: string;
  sign: ScenePlane;
}

export interface ElementReport {
  id: string;
  kind: string;
  status: "rendered" | "reported";
  /** What draws or uses the element (e.g. "room.walls", "exhibit.panel", "cue.hud"). */
  as: string[];
  /** Why part of the element is not drawn (status "reported" or a skipped surface). */
  notes: string[];
}

export interface SceneModel {
  manifestVersion: { compilerVersion: string; layoutVersion: string; seed: string; snapshotVersion: string };
  spawn: { x: number; z: number; yawDeg: number };
  bounds: Rect;
  rooms: SceneRoom[];
  zones: SceneZone[];
  exhibits: SceneExhibit[];
  portals: ScenePortal[];
  paths: ScenePath[];
  cues: SceneCue[];
  labels: SceneLabel[];
  /** Every collider (walls, posts, plinths), axis-aligned. */
  colliders: { id: string; min: Vec3; max: Vec3 }[];
  report: ElementReport[];
}

/**
 * Door linings (DR-023 F7): plaster reveals with a 20 mm flush edge. Each lining is LINING_THICKNESS
 * deep into the opening and spans exactly the wall thickness (LINING_PROUD 0: flush with both wall
 * faces, no architrave). Its room-facing faces are the 20 mm edge, adjacent to the wall face and
 * never overlapping it; its face towards the opening is the plaster reveal.
 */
export const LINING_THICKNESS = 0.02;

/**
 * In-world image planes (DR-020 addendum, the images rule): the compiler may declare an image
 * surface on an exhibit, but the museum never draws one, even when its media are reviewed or
 * published. Images (structure diagrams and the rights-checked photographs) render only inside
 * the KnowledgeSheet, through the shared KnowledgeFigure, so the two conditions show the same
 * images in the same place. The renderer (three/world.ts) has no image-plane code path at all;
 * tests/unit/immersive/image-planes.test.ts holds both facts.
 */
export const IN_WORLD_IMAGES = false as const;
export const LINING_PROUD = 0;

type Loose = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const pt = (v: unknown): Point => ({ x: num((v as Loose | undefined)?.x), z: num((v as Loose | undefined)?.z) });

function plane(elementId: string, s: Loose): ScenePlane {
  return {
    id: String(s.id),
    elementId,
    kind: s.kind as ScenePlane["kind"],
    facing: s.facing as Facing,
    min: s.min as Vec3,
    max: s.max as Vec3,
    uv: (s.uv as ScenePlane["uv"]) ?? "metre",
    wallOffset: typeof s.wallOffset === "number" ? s.wallOffset : null,
    polygonOffset: (s.polygonOffset as ScenePlane["polygonOffset"]) ?? null,
    aspectRatio: typeof s.aspectRatio === "number" ? s.aspectRatio : null,
    assetId: str(s.assetId),
  };
}

function box(elementId: string, c: Loose, collider: boolean): SceneBox {
  return {
    id: String(c.id),
    elementId,
    part: (c.part as SceneBox["part"]) ?? "wall-segment",
    partKey: String(c.partKey ?? c.part ?? "box"),
    min: c.min as Vec3,
    max: c.max as Vec3,
    collider,
  };
}

/**
 * Door linings: one trim per jamb plus one under the lintel, derived from the portal's opening,
 * frame and lintel, LINING_THICKNESS into the opening and flush with both wall faces. A lining face
 * meets a wall face edge to edge in one plane but never overlaps it, so nothing z-fights
 * (immersive-rendering-quality.md §1).
 */
export function doorLinings(portalId: string, axis: "x" | "z", opening: { a: Point; b: Point }, height: number, wallThickness: number): SceneBox[] {
  const t = wallThickness / 2 + LINING_PROUD;
  const k = LINING_THICKNESS;
  const out: SceneBox[] = [];
  // axis "z": the opening runs along z on a wall at x = opening.a.x (wall normal is x).
  const along = axis === "z" ? [Math.min(opening.a.z, opening.b.z), Math.max(opening.a.z, opening.b.z)] : [Math.min(opening.a.x, opening.b.x), Math.max(opening.a.x, opening.b.x)];
  const across = axis === "z" ? opening.a.x : opening.a.z;
  const [u0, u1] = along as [number, number];
  const mk = (id: string, a0: number, a1: number, y0: number, y1: number): SceneBox => {
    const min: Vec3 = axis === "z" ? [across - t, y0, a0] : [a0, y0, across - t];
    const max: Vec3 = axis === "z" ? [across + t, y1, a1] : [a1, y1, across + t];
    const d = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((v) => Math.round(v * 1000) / 1000);
    return { id, elementId: portalId, part: "door-lining", partKey: `door-lining:${[d[0], d[2]].sort((p, q) => p! - q!).join("x")}x${d[1]}`, min, max, collider: false };
  };
  // Jambs stop under the head lining so no two linings overlap (no coplanar same-facing faces).
  out.push(mk(`lining:${portalId}:a`, u0, u0 + k, 0, height - k));
  out.push(mk(`lining:${portalId}:b`, u1 - k, u1, 0, height - k));
  out.push(mk(`lining:${portalId}:head`, u0, u1, height - k, height));
  return out;
}

/** Room whose rectangle contains p (closed), preferring the smallest. */
export function roomAt(rooms: readonly SceneRoom[], p: Point): SceneRoom | null {
  let best: SceneRoom | null = null;
  let area = Infinity;
  for (const r of rooms) {
    const b = r.bounds;
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) continue;
    const a = (b.maxX - b.minX) * (b.maxZ - b.minZ);
    if (a < area) {
      area = a;
      best = r;
    }
  }
  return best;
}

export class SceneModelError extends Error {}

export function buildSceneModel(manifest: Pick<CompiledManifest, "elements" | "compilerVersion" | "layoutVersion" | "seed" | "snapshotVersion">): SceneModel {
  const els = manifest.elements;
  const byId = new Map(els.map((e) => [e.id, e]));
  const report = new Map<string, ElementReport>();
  const mark = (e: CompiledElement, as: string, note?: string) => {
    const r = report.get(e.id) ?? { id: e.id, kind: e.kind, status: "rendered" as const, as: [], notes: [] };
    if (!r.as.includes(as)) r.as.push(as);
    if (note) r.notes.push(note);
    report.set(e.id, r);
  };
  const skip = (e: CompiledElement, note: string) => {
    const r = report.get(e.id) ?? { id: e.id, kind: e.kind, status: "reported" as const, as: [], notes: [] };
    r.notes.push(note);
    report.set(e.id, r);
  };
  const roomOf = (e: CompiledElement): string | null => {
    let p = e.parentId ? byId.get(e.parentId) : undefined;
    while (p && p.kind !== "room") p = p.parentId ? byId.get(p.parentId) : undefined;
    return p?.id ?? null;
  };

  // Rooms (with their walls, floor and ceiling).
  const rooms: SceneRoom[] = [];
  let wallThickness = 0.2;
  for (const e of els.filter((x) => x.kind === "room")) {
    const surfaces = ((e.surfaces as Loose[] | undefined) ?? []).map((s) => plane(e.id, s));
    const colliders = ((e.colliders as Loose[] | undefined) ?? []).map((c) => box(e.id, c, true));
    const seg = colliders.find((c) => c.part === "wall-segment");
    if (seg) wallThickness = Math.min(seg.max[0] - seg.min[0], seg.max[2] - seg.min[2]);
    const st = (e.streaming as Loose | undefined) ?? {};
    const room: SceneRoom = {
      id: e.id,
      label: e.label ?? e.id,
      zoneId: e.parentId,
      roomKind: str(e.roomKind) ?? "room",
      traditionSlug: str(e.traditionSlug),
      bounds: e.bounds as Rect,
      height: num(e.height, 3.2),
      neighbours: ((st.neighbours as SceneRoom["neighbours"]) ?? []).map((n) => ({ ...n })),
      elementIds: [...((st.elementIds as string[]) ?? [e.id])],
      floor: surfaces.find((s) => s.kind === "floor") ?? null,
      ceiling: surfaces.find((s) => s.kind === "ceiling") ?? null,
      walls: colliders,
    };
    if (!room.bounds) throw new SceneModelError(`${e.id}: room without bounds`);
    rooms.push(room);
    mark(e, "room.walls");
    if (room.floor) mark(e, "room.floor");
    if (room.ceiling) mark(e, "room.ceiling");
    if (!st.elementIds) skip(e, "no streaming unit: resident with every room");
  }
  rooms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const zones: SceneZone[] = els
    .filter((e) => e.kind === "zone")
    .map((e) => {
      const st = (e.streaming as Loose | undefined) ?? {};
      mark(e, "zone.membership");
      return {
        id: e.id,
        label: e.label ?? e.id,
        traditionSlug: str(e.traditionSlug),
        conceptId: e.conceptId,
        roomIds: [...((st.roomIds as string[]) ?? rooms.filter((r) => r.zoneId === e.id).map((r) => r.id))],
        neighbours: ((st.neighbours as SceneZone["neighbours"]) ?? []).map((n) => ({ ...n, portalIds: [...n.portalIds] })),
      };
    });

  const exhibits: SceneExhibit[] = [];
  for (const e of els.filter((x) => x.kind === "exhibit" || x.kind === "station")) {
    const surfaces = ((e.surfaces as Loose[] | undefined) ?? []).map((s) => plane(e.id, s));
    const panel = surfaces.find((s) => s.kind === "panel");
    const roomId = roomOf(e);
    if (!panel || !roomId || !e.conceptId) {
      skip(e, !panel ? "no panel surface" : !roomId ? "not inside a room" : "no concept");
      continue;
    }
    const image = surfaces.find((s) => s.kind === "image") ?? null;
    const plinthC = ((e.colliders as Loose[] | undefined) ?? []).find((c) => c.part === "plinth");
    const seq = e.sequence as SceneExhibit["sequence"] | null | undefined;
    exhibits.push({
      id: e.id,
      kind: e.kind as SceneExhibit["kind"],
      conceptId: e.conceptId,
      conceptKey: String(e.conceptKey ?? ""),
      conceptType: String(e.conceptType ?? ""),
      category: str(e.category),
      label: e.label ?? "",
      roomId,
      position: pt(e.position),
      approach: pt(e.approach ?? e.position),
      yawDeg: num(e.yawDeg),
      display: String(e.display ?? "panel"),
      panel,
      image,
      plinth: plinthC ? box(e.id, plinthC, true) : null,
      layers: ((e.layers as Layer[]) ?? []).map((l) => ({ ...l })),
      hotspots: ((e.hotspots as Hotspot[]) ?? []).map((h) => ({ ...h })),
      sequence: seq ? { pathId: seq.pathId, index: seq.index, count: seq.count } : null,
    });
    mark(e, "exhibit.panel");
    if (plinthC) mark(e, "exhibit.plinth");
    mark(e, "exhibit.selection");
    if (image && !IN_WORLD_IMAGES) {
      skip(
        e,
        `image plane ${image.id} not drawn: study builds draw no in-world image planes, whatever the licence or review state of asset ${image.assetId ?? "(none)"}; images appear only inside the KnowledgeSheet, through the shared KnowledgeFigure, identically in both conditions (DR-020 addendum)`,
      );
    }
  }
  exhibits.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const portals: ScenePortal[] = [];
  for (const e of els.filter((x) => x.kind === "portal")) {
    const connects = (e.connects as [string, string]) ?? [];
    const opening = e.opening as ScenePortal["opening"] | undefined;
    if (connects.length !== 2 || !opening) {
      skip(e, "portal without two rooms or an opening");
      continue;
    }
    const surfaces = ((e.surfaces as Loose[] | undefined) ?? []).map((s) => plane(e.id, s));
    const lintelC = ((e.renderBoxes as Loose[] | undefined) ?? []).find((c) => c.part === "door-lintel");
    const height = num(e.height, 2.4);
    const axis = (e.axis as "x" | "z") ?? (Math.abs(opening.a.x - opening.b.x) < 1e-6 ? "z" : "x");
    const frame = e.frame as Loose | undefined;
    portals.push({
      id: e.id,
      label: e.label ?? e.id,
      connects: [connects[0]!, connects[1]!],
      axis,
      opening: { a: pt(opening.a), b: pt(opening.b) },
      width: num(e.width),
      height,
      purpose: String(e.purpose ?? "circulation"),
      position: pt(e.position),
      lintel: lintelC ? box(e.id, lintelC, false) : null,
      linings: frame ? doorLinings(e.id, axis, { a: pt(opening.a), b: pt(opening.b) }, height, wallThickness) : [],
      threshold: surfaces.find((s) => s.kind === "threshold") ?? null,
      encodes: e.encodes.map((x) => ({ ...x })),
    });
    mark(e, "portal.opening");
    if (lintelC) mark(e, "portal.lintel");
    if (frame) mark(e, "portal.linings");
    if (surfaces.some((s) => s.kind === "threshold")) mark(e, "portal.threshold");
    mark(e, "navigation.doorway");
  }

  const paths: ScenePath[] = els
    .filter((e) => e.kind === "path")
    .map((e) => {
      const waypoints = ((e.waypoints as Point[]) ?? []).map(pt);
      const rs = new Set<string>();
      for (const w of waypoints) {
        const r = roomAt(rooms, w);
        if (r) rs.add(r.id);
      }
      mark(e, "path.floor-route");
      mark(e, "path.ordered-stops");
      if (e.broken) skip(e, "manifest marks the path broken");
      return {
        id: e.id,
        label: e.label ?? e.id,
        ordered: e.ordered === true,
        stops: [...((e.stops as string[]) ?? [])],
        waypoints,
        roomIds: [...rs].sort(),
        encodes: e.encodes.map((x) => ({ ...x })),
      };
    });

  const cues: SceneCue[] = [];
  for (const e of els.filter((x) => x.kind === "cue")) {
    const trig = e.trigger as Loose | undefined;
    const eff = e.effect as Loose | undefined;
    if (!trig || !eff) {
      skip(e, "cue without trigger or effect");
      continue;
    }
    let effect: CueEffect;
    switch (eff.type) {
      case "explain-and-guide":
        effect = { type: "explain-and-guide", causeElementId: String(eff.causeElementId), effectElementId: String(eff.effectElementId), explanation: str(eff.explanation), route: ((eff.route as Point[]) ?? []).map(pt) };
        break;
      case "show-path":
        effect = { type: "show-path", pathId: String(eff.pathId) };
        break;
      case "name-prerequisite":
        effect = { type: "name-prerequisite", dependentElementId: String(eff.dependentElementId), prerequisiteElementId: String(eff.prerequisiteElementId), explanation: str(eff.explanation) };
        break;
      case "announce":
        effect = { type: "announce", text: String(eff.text ?? e.label ?? "") };
        break;
      default:
        skip(e, `unknown cue effect ${String(eff.type)}`);
        continue;
    }
    const position = pt(e.position);
    cues.push({
      id: e.id,
      label: e.label ?? "",
      roomId: roomOf(e) ?? roomAt(rooms, position)?.id ?? null,
      position,
      relationshipType: str(e.relationshipType),
      relationshipId: e.encodes[0]?.relationshipId ?? null,
      conceptId: e.conceptId,
      trigger: { type: trig.type as SceneCue["trigger"]["type"], elementId: String(trig.elementId), radius: typeof trig.radius === "number" ? trig.radius : null },
      effect,
    });
    mark(e, effect.type === "explain-and-guide" ? "cue.panel-explanation" : effect.type === "show-path" ? "cue.path-reveal" : effect.type === "announce" ? "cue.announcement" : "cue.prerequisite-note");
  }

  const labels: SceneLabel[] = [];
  for (const e of els.filter((x) => x.kind === "label")) {
    const sign = ((e.surfaces as Loose[] | undefined) ?? []).map((s) => plane(e.id, s)).find((s) => s.kind === "sign");
    const roomId = roomOf(e);
    if (!sign || !roomId) {
      skip(e, "label without a sign surface or room");
      continue;
    }
    labels.push({ id: e.id, label: e.label ?? "", roomId, sign });
    mark(e, "label.sign");
  }

  let spawn = { x: 0, z: 0, yawDeg: 0 };
  for (const e of els.filter((x) => x.kind === "landmark")) {
    const s = e.spawn as Loose | undefined;
    if (s) {
      spawn = { x: num(s.x), z: num(s.z), yawDeg: num(s.yawDeg) };
      mark(e, "visitor.spawn");
    } else {
      mark(e, "map.landmark");
    }
  }

  const colliders = [
    ...rooms.flatMap((r) => r.walls.map((w) => ({ id: w.id, min: w.min, max: w.max }))),
    ...exhibits.flatMap((x) => (x.plinth ? [{ id: x.plinth.id, min: x.plinth.min, max: x.plinth.max }] : [])),
  ];

  for (const e of els) if (!report.has(e.id)) report.set(e.id, { id: e.id, kind: e.kind, status: "reported", as: [], notes: [`element kind ${e.kind} has no renderer`] });

  const bs = rooms.map((r) => r.bounds);
  return {
    manifestVersion: { compilerVersion: manifest.compilerVersion, layoutVersion: manifest.layoutVersion, seed: manifest.seed, snapshotVersion: manifest.snapshotVersion },
    spawn,
    bounds: { minX: Math.min(...bs.map((b) => b.minX)), maxX: Math.max(...bs.map((b) => b.maxX)), minZ: Math.min(...bs.map((b) => b.minZ)), maxZ: Math.max(...bs.map((b) => b.maxZ)) },
    rooms,
    zones,
    exhibits,
    portals,
    paths,
    cues,
    labels,
    colliders,
    report: [...report.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/** Rooms that must be resident when the visitor is in `roomId`: the room and its doorway neighbours. */
export function residentRooms(model: SceneModel, roomId: string | null, depth = 1): Set<string> {
  const out = new Set<string>();
  if (!roomId) return out;
  const byId = new Map(model.rooms.map((r) => [r.id, r]));
  let frontier = [roomId];
  out.add(roomId);
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of byId.get(id)?.neighbours ?? []) {
        if (out.has(n.roomId)) continue;
        out.add(n.roomId);
        next.push(n.roomId);
      }
    }
    frontier = next;
  }
  return out;
}
