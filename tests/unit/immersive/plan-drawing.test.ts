/**
 * Plate 1's drawing data (DR-047, number to confirm at merge), from the study manifest compiled from
 * content/: the same rooms, gaps and section numbers as the 3D plan, every exhibit, equal entrance
 * routes to the wings (DR-043), and the two named rooms labelled clear of every room.
 */
import { describe, expect, it } from "vitest";

import { roomNumbers as minimapRoomNumbers } from "@/components/museum/overlays/minimap";
import { createRouter } from "@/features/immersive/navigation";
import { EXHIBIT_MARK_INSET_M, PLAN_PLATE, planBox, planPlateData, roomLabelLayout, roomNumbers } from "@/features/immersive/plan-drawing";
import { buildSceneModel, roomAt } from "@/features/immersive/scene-model";

import { museumFixture } from "./fixtures";

const model = buildSceneModel(museumFixture().manifest.manifest);
const plan = planPlateData(model);

describe("Plate 1: the museum plan drawing", () => {
  it("is the 3D plan's own drawing: the same extent, rooms, doorway gaps and section numbers", () => {
    expect(plan.viewBox).toEqual(planBox(model));
    expect(plan.rooms.map((r) => r.id)).toEqual(model.rooms.map((r) => r.id));
    for (const r of model.rooms) {
      const d = plan.rooms.find((x) => x.id === r.id)!;
      expect([d.x, d.y, d.x + d.w, d.y + d.h]).toEqual([r.bounds.minX, r.bounds.minZ, r.bounds.maxX, r.bounds.maxZ]);
    }
    expect(plan.gaps).toHaveLength(model.portals.length);
    // The minimap's numbers are the plan module's (re-exported), so the two cannot drift.
    expect(minimapRoomNumbers).toBe(roomNumbers);
    const numbers = roomNumbers(model);
    for (const n of plan.numbers) expect(n.n).toBe(numbers.get(n.roomId));
  });

  it("numbers every wing room 1 to 7 at 12 px or more at its narrowest width, and names no tradition", () => {
    const wingRooms = model.rooms.filter((r) => r.traditionSlug);
    const drawn = new Map(plan.numbers.map((n) => [n.roomId, n]));
    for (const r of wingRooms) {
      const n = drawn.get(r.id);
      expect(n, r.id).toBeDefined();
      expect(n!.n).toBeGreaterThanOrEqual(1);
      expect(n!.n).toBeLessThanOrEqual(7);
      expect(n!.fontSize / plan.mpp).toBeGreaterThanOrEqual(PLAN_PLATE.minNumberPx - 1e-9);
      expect(n!.fontSize / plan.mpp).toBeLessThanOrEqual(PLAN_PLATE.numberPx + 1e-9);
    }
    // Each wing's rooms carry the numbers 1..7 once.
    const wings = new Set(wingRooms.map((r) => r.zoneId));
    for (const z of wings) expect(wingRooms.filter((r) => r.zoneId === z).map((r) => drawn.get(r.id)!.n).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // The only words are the two room labels.
    expect(plan.labels.map((l) => l.text)).toEqual(["Entrance", "Comparison Hall"]);
    // Plan metres per px at the narrowest plate: the fit roomLabelLayout uses.
    expect(plan.mpp).toBeCloseTo(plan.viewBox.w / PLAN_PLATE.minWidthPx, 12);
    expect(roomLabelLayout({ bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 } }, 3, false, plan.mpp, 13, 12).label).toBeNull();
  });

  it("marks every exhibit at its scene position, inside its room and clear of the wall line", () => {
    expect(plan.exhibits).toHaveLength(model.exhibits.length);
    for (const e of model.exhibits) {
      const m = plan.exhibits.find((x) => x.id === e.id)!;
      const r = model.rooms.find((x) => x.id === e.roomId)!;
      expect(roomAt(model.rooms, { x: m.x, z: m.y })?.id, e.id).toBe(r.id);
      const inset = Math.min(m.x - r.bounds.minX, r.bounds.maxX - m.x, m.y - r.bounds.minZ, r.bounds.maxZ - m.y);
      expect(inset, e.id).toBeGreaterThanOrEqual(Math.min(EXHIBIT_MARK_INSET_M, (r.bounds.maxX - r.bounds.minX) / 2, (r.bounds.maxZ - r.bounds.minZ) / 2) - 1e-9);
      // Never more than a metre and a half from where it stands (a mark, not a relocation).
      const p = e.plinth ?? e.panel;
      expect(Math.hypot(m.x - (p.min[0] + p.max[0]) / 2, m.y - (p.min[2] + p.max[2]) / 2), e.id).toBeLessThan(1.5);
    }
  });

  it("draws one route from the spawn to each wing's doorway, walkable, in canonical order, of equal length (within 1%)", () => {
    const wings = model.zones.filter((z) => z.traditionSlug);
    expect(plan.routes.map((r) => r.zoneId)).toEqual(["zone:ajrakh", "zone:machilipatnam-kalamkari", "zone:sanganeri"]);
    expect(plan.routes).toHaveLength(wings.length);
    const lengths = plan.routes.map((r) => r.length);
    expect(Math.max(...lengths) / Math.min(...lengths) - 1).toBeLessThan(0.01);
    const router = createRouter(model.rooms, model.colliders);
    const entrance = roomAt(model.rooms, model.spawn)!;
    for (const r of plan.routes) {
      expect(r.points[0]).toEqual({ x: model.spawn.x, y: model.spawn.z });
      const end = r.points[r.points.length - 1]!;
      const door = model.portals.find((p) => p.connects.includes(entrance.id) && Math.hypot(p.position.x - end.x, p.position.z - end.y) < 1e-6)!;
      expect(door, r.zoneId).toBeDefined();
      expect(door.connects.some((id) => model.rooms.find((x) => x.id === id)?.zoneId === r.zoneId)).toBe(true);
      for (const p of r.points) expect(router.isFree({ x: p.x, z: p.y }), `${r.zoneId} ${p.x},${p.y}`).toBe(true);
    }
    expect(plan.start).toEqual({ x: model.spawn.x, y: model.spawn.z });
  });

  it("names the entrance and the comparison hall outside every room, on leaders that start inside the room", () => {
    const fontPx = PLAN_PLATE.labelPx;
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const l of plan.labels) {
      expect(l.fontSize / plan.mpp).toBeCloseTo(fontPx, 9);
      const box = { x0: l.x, y0: l.y - 0.92 * l.fontSize, x1: l.x + l.text.length * 0.6 * l.fontSize, y1: l.y - 0.92 * l.fontSize + 1.25 * l.fontSize };
      for (const r of model.rooms) {
        const clear = box.x1 <= r.bounds.minX || box.x0 >= r.bounds.maxX || box.y1 <= r.bounds.minZ || box.y0 >= r.bounds.maxZ;
        expect(clear, `${l.text} / ${r.id}`).toBe(true);
      }
      // Inside the drawing.
      expect(box.x0).toBeGreaterThanOrEqual(model.bounds.minX);
      expect(box.x1).toBeLessThanOrEqual(model.bounds.maxX);
      expect(box.y0).toBeGreaterThanOrEqual(model.bounds.minZ);
      expect(box.y1).toBeLessThanOrEqual(model.bounds.maxZ);
      for (const b of boxes) expect(box.x1 <= b.x0 || box.x0 >= b.x1 || box.y1 <= b.y0 || box.y0 >= b.y1).toBe(true);
      boxes.push(box);
      const room = model.rooms.find((r) => r.id === l.roomId)!;
      expect(roomAt([room], { x: l.leader.x1, z: l.leader.y1 })?.id).toBe(room.id);
    }
    expect(plan.labels.map((l) => l.roomId)).toEqual([roomAt(model.rooms, model.spawn)!.id, model.rooms.find((r) => r.roomKind === "hall")!.id]);
  });

  it("counts what it shows for the accessible name", () => {
    expect(plan.summary).toEqual({ wings: 3, roomsPerWing: 7, entrance: true, hall: true, commons: true });
  });

  it("is deterministic", () => {
    expect(planPlateData(buildSceneModel(museumFixture().manifest.manifest))).toEqual(plan);
  });
});
