/**
 * Sequence legibility in the room itself: numbered process plaques with Start and Last step, and
 * the hanging order they rest on (step 1 is the first station clockwise from the room's entrance
 * doorway, the steps follow one another round the room with no gap or reversal, and a sequence that
 * runs on into another room continues through a doorway between the two).
 */
import { describe, expect, it } from "vitest";

import { PLAQUE_WORDS, plaqueText } from "@/features/immersive/plaque-text";
import { buildSceneModel, type SceneExhibit, type SceneModel, type SceneRoom } from "@/features/immersive/scene-model";

import { museumFixture } from "./fixtures";

/** Clockwise perimeter parameter (seen from above, x east, z south): north edge west to east, then east, south, west. */
function perimeterParam(r: SceneRoom, p: { x: number; z: number }): number {
  const b = r.bounds;
  const W = b.maxX - b.minX;
  const D = b.maxZ - b.minZ;
  const d = { n: p.z - b.minZ, e: b.maxX - p.x, s: b.maxZ - p.z, w: p.x - b.minX };
  const side = (Object.entries(d) as [keyof typeof d, number][]).sort((a, c) => a[1] - c[1])[0]![0];
  if (side === "n") return p.x - b.minX;
  if (side === "e") return W + (p.z - b.minZ);
  if (side === "s") return W + D + (b.maxX - p.x);
  return 2 * W + D + (b.maxZ - p.z);
}

/** Entrance doorway of every room: the doorway it is first reached through from the lobby (breadth first). */
function entrances(model: SceneModel): Map<string, { x: number; z: number }> {
  const out = new Map<string, { x: number; z: number }>();
  const lobby = model.rooms.find((r) => r.roomKind === "lobby")!;
  const seen = new Set([lobby.id]);
  const q = [lobby.id];
  const portals = [...model.portals].sort((a, b) => (a.id < b.id ? -1 : 1));
  while (q.length) {
    const cur = q.shift()!;
    for (const p of portals) {
      if (!p.connects.includes(cur)) continue;
      const nxt = p.connects[0] === cur ? p.connects[1] : p.connects[0];
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      out.set(nxt, p.position);
      q.push(nxt);
    }
  }
  return out;
}

describe("plaque text", () => {
  it("numbers sequence stations and marks the first and last step; other exhibits are title only", () => {
    expect(plaqueText({ sequence: null })).toEqual({ kicker: null, footer: null });
    expect(plaqueText({ sequence: { pathId: "p", index: 0, count: 14 } })).toEqual({ kicker: "Step 1 of 14", footer: "Start" });
    expect(plaqueText({ sequence: { pathId: "p", index: 6, count: 14 } })).toEqual({ kicker: "Step 7 of 14", footer: null });
    expect(plaqueText({ sequence: { pathId: "p", index: 13, count: 14 } })).toEqual({ kicker: "Step 14 of 14", footer: "Last step" });
    expect(plaqueText({ sequence: { pathId: "p", index: 0, count: 1 } })).toEqual({ kicker: null, footer: null });
    expect(PLAQUE_WORDS.visited).toBe("Visited");
  });

  it("gives every station of every ordered path its step, with exactly one Start and one Last step per path", () => {
    const model = buildSceneModel(museumFixture().manifest.manifest);
    const byPath = new Map<string, SceneExhibit[]>();
    for (const e of model.exhibits) if (e.sequence) (byPath.get(e.sequence.pathId) ?? byPath.set(e.sequence.pathId, []).get(e.sequence.pathId)!).push(e);
    expect(byPath.size).toBeGreaterThan(0);
    for (const [, list] of byPath) {
      const texts = list.map((e) => plaqueText(e, model));
      expect(texts.every((t) => t.kicker !== null)).toBe(true);
      expect(texts.filter((t) => t.footer === "Start")).toHaveLength(1);
      expect(texts.filter((t) => t.footer === "Last step")).toHaveLength(1);
    }
  });
});

describe("sequence hanging order in the museum", () => {
  const model = buildSceneModel(museumFixture().manifest.manifest);
  const rooms = new Map(model.rooms.map((r) => [r.id, r]));
  const entrance = entrances(model);
  const byPath = new Map<string, SceneExhibit[]>();
  for (const e of model.exhibits) if (e.sequence) (byPath.get(e.sequence.pathId) ?? byPath.set(e.sequence.pathId, []).get(e.sequence.pathId)!).push(e);

  it("numbers each sequence 1..N with no gap or repeat", () => {
    for (const [pathId, list] of byPath) {
      const idx = list.map((e) => e.sequence!.index).sort((a, b) => a - b);
      expect(idx, pathId).toEqual(Array.from({ length: list[0]!.sequence!.count }, (_, i) => i));
    }
  });

  it("hangs step 1 first clockwise from the room's entrance doorway and every later step further round, with no reversal", () => {
    const rows: { path: string; room: string; params: number[] }[] = [];
    for (const [pathId, list] of byPath) {
      const ordered = [...list].sort((a, b) => a.sequence!.index - b.sequence!.index);
      const runs: SceneExhibit[][] = [];
      for (const e of ordered) {
        const last = runs[runs.length - 1];
        if (last && last[0]!.roomId === e.roomId) last.push(e);
        else runs.push([e]);
      }
      // A room is never revisited by the same sequence.
      expect(new Set(runs.map((r) => r[0]!.roomId)).size, pathId).toBe(runs.length);
      for (const run of runs) {
        const room = rooms.get(run[0]!.roomId)!;
        const P = 2 * (room.bounds.maxX - room.bounds.minX + room.bounds.maxZ - room.bounds.minZ);
        const door = entrance.get(room.id);
        const start = door ? perimeterParam(room, door) : 0;
        const params = run.map((e) => (perimeterParam(room, e.position) - start + P) % P);
        rows.push({ path: pathId, room: room.id, params: params.map((p) => Math.round(p * 100) / 100) });
        for (let i = 1; i < params.length; i++) expect(params[i]!, `${pathId} step ${run[i]!.sequence!.index + 1}`).toBeGreaterThan(params[i - 1]!);
        // Step 1 (or the first step in this room) is the first sequence station clockwise from the entrance.
        const others = (model.exhibits.filter((e) => e.roomId === room.id && e.sequence?.pathId === pathId) ?? []).map((e) => (perimeterParam(room, e.position) - start + P) % P);
        expect(params[0]).toBe(Math.min(...others));
      }
      // A continuation into the next room passes through a doorway between the two rooms.
      for (let i = 1; i < runs.length; i++) {
        const a = runs[i - 1]![0]!.roomId;
        const b = runs[i]![0]!.roomId;
        expect(model.portals.some((p) => p.connects.includes(a) && p.connects.includes(b)), `${pathId}: ${a} -> ${b}`).toBe(true);
      }
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});
