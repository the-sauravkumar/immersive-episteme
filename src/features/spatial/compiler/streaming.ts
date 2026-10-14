/**
 * Streaming units (docs/architecture/immersive-rendering-quality.md §2a-2b).
 *
 * Every room is a self-contained streaming unit: its bounds, the ids of every element the
 * renderer needs to draw it (walls live on the room; exhibits, labels, cues and portals are
 * attached by parent, connection or position), its neighbours through doorways, its
 * per-unit counts and its instanceable part counts. A zone (tradition wing, hall, commons,
 * entrance) aggregates its rooms' units and lists the zones reachable through doorways, so
 * a renderer can keep the current and neighbouring zones/rooms resident and unload the rest.
 */
import { pointInRect } from "./geometry";
import { compareStrings } from "./prng";
import type { Surface } from "./render";
import type { CompiledElement, Point, Rect } from "./types";

export interface UnitCounts {
  exhibits: number;
  wallPanels: number;
  imagePlanes: number;
  signs: number;
  doorways: number;
  wallSegments: number;
  wallPosts: number;
  plinths: number;
  doorLintels: number;
}

export interface RoomStreaming {
  unit: "room";
  bounds: Rect;
  elementIds: string[];
  neighbours: { roomId: string; portalId: string }[];
  counts: UnitCounts;
  /** partKey -> instance count (identical parts can share one geometry). */
  parts: Record<string, number>;
}

export interface ZoneStreaming {
  unit: "zone";
  bounds: Rect;
  roomIds: string[];
  elementIds: string[];
  neighbours: { zoneId: string; portalIds: string[] }[];
  counts: UnitCounts;
}

const emptyCounts = (): UnitCounts => ({ exhibits: 0, wallPanels: 0, imagePlanes: 0, signs: 0, doorways: 0, wallSegments: 0, wallPosts: 0, plinths: 0, doorLintels: 0 });

type Part = { part?: string; partKey?: string };

/** Rooms an element must be resident in. */
export function roomsForElement(e: CompiledElement, byId: ReadonlyMap<string, CompiledElement>, rooms: readonly CompiledElement[]): string[] {
  if (e.kind === "zone") return [];
  if (e.kind === "room") return [e.id];
  if (e.kind === "portal") return [...((e.connects as string[]) ?? [])];
  let p = e.parentId ? byId.get(e.parentId) : undefined;
  while (p && p.kind !== "room") p = p.parentId ? byId.get(p.parentId) : undefined;
  if (p) return [p.id];
  const pts: Point[] = [];
  const pos = e.position as Point | undefined;
  if (pos) pts.push(pos);
  for (const w of (e.waypoints as Point[] | undefined) ?? []) pts.push(w);
  const out = new Set<string>();
  for (const pt of pts) {
    const r = rooms.find((x) => pointInRect(pt, x.bounds as Rect));
    if (r) out.add(r.id);
  }
  return [...out].sort(compareStrings);
}

export function attachStreaming(elements: CompiledElement[]): void {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const rooms = elements.filter((e) => e.kind === "room").sort((a, b) => compareStrings(a.id, b.id));
  const members = new Map<string, Set<string>>(rooms.map((r) => [r.id, new Set([r.id])]));
  for (const e of elements) for (const r of roomsForElement(e, byId, rooms)) members.get(r)?.add(e.id);

  const roomStream = new Map<string, RoomStreaming>();
  for (const r of rooms) {
    const ids = [...members.get(r.id)!].sort(compareStrings);
    const counts = emptyCounts();
    const parts: Record<string, number> = {};
    for (const id of ids) {
      const e = byId.get(id)!;
      if (e.kind === "exhibit" || e.kind === "station") counts.exhibits++;
      if (e.kind === "portal") counts.doorways++;
      for (const s of (e.surfaces as Surface[] | undefined) ?? []) {
        if (s.kind === "panel") counts.wallPanels++;
        if (s.kind === "image") counts.imagePlanes++;
        if (s.kind === "sign") counts.signs++;
      }
      const boxes = [...((e.colliders as Part[] | undefined) ?? []), ...((e.renderBoxes as Part[] | undefined) ?? [])];
      for (const b of boxes) {
        if (b.part === "wall-segment") counts.wallSegments++;
        if (b.part === "wall-post") counts.wallPosts++;
        if (b.part === "plinth") counts.plinths++;
        if (b.part === "door-lintel") counts.doorLintels++;
        if (b.partKey) parts[b.partKey] = (parts[b.partKey] ?? 0) + 1;
      }
    }
    const neighbours = elements
      .filter((e) => e.kind === "portal" && ((e.connects as string[]) ?? []).includes(r.id))
      .map((p) => ({ roomId: (p.connects as string[]).find((x) => x !== r.id)!, portalId: p.id }))
      .sort((a, b) => compareStrings(a.roomId, b.roomId) || compareStrings(a.portalId, b.portalId));
    const sortedParts = Object.fromEntries(Object.entries(parts).sort((a, b) => compareStrings(a[0], b[0])));
    const s: RoomStreaming = { unit: "room", bounds: r.bounds as Rect, elementIds: ids, neighbours, counts, parts: sortedParts };
    roomStream.set(r.id, s);
    r.streaming = s;
  }

  for (const z of elements.filter((e) => e.kind === "zone")) {
    const zr = rooms.filter((r) => r.parentId === z.id);
    const ids = new Set<string>([z.id]);
    const counts = emptyCounts();
    for (const r of zr) {
      const s = roomStream.get(r.id)!;
      s.elementIds.forEach((id) => ids.add(id));
      for (const k of Object.keys(counts) as (keyof UnitCounts)[]) counts[k] += s.counts[k];
    }
    // Doorways (and their lintels) are resident in both rooms they join; count each once.
    counts.doorways = new Set(zr.flatMap((r) => roomStream.get(r.id)!.neighbours.map((n) => n.portalId))).size;
    counts.doorLintels = counts.doorways; // one lintel per doorway
    const nb = new Map<string, Set<string>>();
    for (const r of zr) {
      for (const n of roomStream.get(r.id)!.neighbours) {
        const other = byId.get(n.roomId)?.parentId;
        if (!other || other === z.id) continue;
        (nb.get(other) ?? nb.set(other, new Set()).get(other)!).add(n.portalId);
      }
    }
    const rects = zr.map((r) => r.bounds as Rect);
    z.streaming = {
      unit: "zone",
      bounds: rects.length
        ? { minX: Math.min(...rects.map((r) => r.minX)), maxX: Math.max(...rects.map((r) => r.maxX)), minZ: Math.min(...rects.map((r) => r.minZ)), maxZ: Math.max(...rects.map((r) => r.maxZ)) }
        : (z.bounds as Rect),
      roomIds: zr.map((r) => r.id),
      elementIds: [...ids].sort(compareStrings),
      neighbours: [...nb.entries()].sort((a, b) => compareStrings(a[0], b[0])).map(([zoneId, p]) => ({ zoneId, portalIds: [...p].sort(compareStrings) })),
      counts,
    } satisfies ZoneStreaming;
  }
}
