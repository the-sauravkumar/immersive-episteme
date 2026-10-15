/**
 * The plan (DESIGN.md 11.6): rooms numbered in reading order with the entrance first, numbers never
 * smaller than 10 px (a room too small for one shows none), and a 192 x 192 minimap.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Minimap, roomNumbers } from "@/components/museum/overlays/minimap";
import type { SceneModel, SceneRoom } from "@/features/immersive/scene-model";

const room = (id: string, zoneId: string | null, minX: number, minZ: number, w: number, h: number): SceneRoom =>
  ({ id, label: id, zoneId, bounds: { minX, minZ, maxX: minX + w, maxZ: minZ + h }, height: 3.2, neighbours: [], elementIds: [id] }) as unknown as SceneRoom;

const rooms = [room("a1", "zone-a", 0, 0, 6, 6), room("a2", "zone-a", 6, 0, 6, 6), room("b1", "zone-b", 0, 6, 12, 6), room("closet", "zone-b", 12, 0, 0.6, 0.6), room("lobby", "entrance", 4, 12, 4, 4)];

const model = {
  rooms,
  spawn: { x: 6, z: 14, yawDeg: 0 },
  bounds: { minX: 0, minZ: 0, maxX: 12.6, maxZ: 16 },
  portals: [],
} as unknown as SceneModel;

describe("plan", () => {
  it("numbers the entrance (the spawn's room) 1, then zone by zone in reading order", () => {
    const n = roomNumbers(model);
    expect(n.get("lobby")).toBe(1);
    expect([n.get("a1"), n.get("a2"), n.get("closet"), n.get("b1")]).toEqual([2, 3, 4, 5]);
  });

  it("keeps the manifest order without a spawn", () => {
    expect(roomNumbers({ rooms }).get("a1")).toBe(1);
  });

  it("draws numbers at 10 px or more and omits a number that cannot fit", () => {
    const { container } = render(<Minimap model={model} roomId="lobby" roomLabel={(id) => id} onExpand={() => {}} />);
    const svg = container.querySelector("svg")!;
    const [, , vw, vh] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const mpp = Math.max(vw! / 174, vh! / 118);
    const labels = [...svg.querySelectorAll("text")];
    expect(labels.map((t) => t.textContent)).not.toContain("4");
    for (const t of labels) expect(Number(t.getAttribute("font-size")) / mpp).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(container.querySelector("[data-slot=museum-minimap]")?.className).toContain("size-48");
    expect(container.textContent).toContain("You Are Here");
  });
});

describe("plan default (DR-021: follows the protocol's minimap setting)", () => {
  it("shows the plan only when the protocol says 'on'; 'toggle' starts minimised; 'off' has none", async () => {
    const { planDefaultOpen } = await import("@/components/museum/overlays/minimap");
    expect(planDefaultOpen("on")).toBe(true);
    expect(planDefaultOpen("toggle")).toBe(false);
    expect(planDefaultOpen("off")).toBe(false);
  });
});
