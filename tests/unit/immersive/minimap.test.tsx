/**
 * The plan (DESIGN.md 11.6; DR-024): rooms numbered by the shared section map (the numbers of the 2D
 * index), the entrance listed first, numbers never smaller than 10 px (a room too small for one
 * shows none), and a 192 x 192 minimap.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Minimap, compassWord, planOrder, planRoomName, roomNumbers } from "@/components/museum/overlays/minimap";
import { compassPoint, yawFromDeg } from "@/features/immersive/navigation";
import type { SceneModel, SceneRoom } from "@/features/immersive/scene-model";

const room = (id: string, zoneId: string | null, minX: number, minZ: number, w: number, h: number, group: string | null = null, traditionSlug: string | null = null): SceneRoom =>
  ({ id, label: id, zoneId, group, traditionSlug, bounds: { minX, minZ, maxX: minX + w, maxZ: minZ + h }, height: 3.2, neighbours: [], elementIds: [id] }) as unknown as SceneRoom;

// Two wings (sanganeri listed first in the manifest, ajrakh first in the canonical order), the hall, a tiny room and the lobby.
const rooms = [
  room("s3", "zone-s", 6, 0, 6, 6, "process_sequence", "sanganeri"),
  room("s1", "zone-s", 0, 0, 6, 6, "tradition_context", "sanganeri"),
  room("a1", "zone-a", 0, 6, 12, 6, "tradition_context", "ajrakh"),
  room("closet", "zone-a", 12, 0, 0.6, 0.6, "materials_tools", "ajrakh"),
  room("hall", "zone-h", 0, 12, 12, 2, "cross_tradition_comparison"),
  room("lobby", "entrance", 4, 14, 4, 2),
];

const model = {
  rooms,
  spawn: { x: 6, z: 14, yawDeg: 0 },
  bounds: { minX: 0, minZ: 0, maxX: 12.6, maxZ: 16 },
  portals: [],
} as unknown as SceneModel;

describe("plan", () => {
  it("numbers each room by its section (the 2D index's numbers); the lobby has none", () => {
    const n = roomNumbers(model);
    expect([n.get("s1"), n.get("s3"), n.get("a1"), n.get("closet"), n.get("hall")]).toEqual([1, 3, 1, 2, 8]);
    expect(n.has("lobby")).toBe(false);
  });

  it("lists the entrance first, then each wing in the canonical order by number, then the hall", () => {
    expect(planOrder(model).map((r) => r.id)).toEqual(["lobby", "a1", "closet", "s1", "s3", "hall"]);
    expect(planOrder({ rooms }).map((r) => r.id)).toEqual(["a1", "closet", "s1", "s3", "hall", "lobby"]);
  });

  it("names a room by its section's title, as the 2D index does", () => {
    const label = (id: string) => `label of ${id}`;
    expect(planRoomName(rooms[0]!, label)).toBe("Process sequence");
    expect(planRoomName(rooms[4]!, label)).toBe("Cross-tradition comparison");
    expect(planRoomName(rooms[5]!, label)).toBe("label of lobby");
  });

  it("draws numbers at 10 px or more and omits a number that cannot fit", () => {
    const { container } = render(<Minimap model={model} roomId="lobby" roomLabel={(id) => id} onExpand={() => {}} />);
    // The drawing (the first svg is the Expand button's icon, which the earlier version of this test read).
    const svg = container.querySelector("[data-slot=museum-plan-drawing]")!;
    const [, , vw, vh] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const mpp = Math.max(vw! / 174, vh! / 118);
    const labels = [...svg.querySelectorAll("text")];
    // The 0.6 m closet (section 2) is too small for its number; the lobby has none.
    expect(labels.map((t) => t.textContent)).not.toContain("2");
    expect(labels.length).toBeGreaterThan(0);
    for (const t of labels) expect(Number(t.getAttribute("font-size")) / mpp).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(container.querySelector("[data-slot=museum-minimap]")?.className).toContain("size-48");
    expect(container.textContent).toContain("You Are Here");
  });
});

describe("plan heading arrow (novice walkthrough: the plan had no facing arrow)", () => {
  it("quantises the camera yaw to the eight compass points, clockwise from north", () => {
    // yaw 0 faces north (-z); a positive yaw turns to the west.
    expect([0, 90, 180, 270, 44, 46, 359].map((d) => compassPoint(yawFromDeg(d)))).toEqual([0, 90, 180, 270, 45, 45, 0]);
    expect(compassPoint(Math.PI / 2)).toBe(270);
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassWord)).toEqual(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);
  });

  it("draws an arrow turned to the heading in the current room, and says the facing to screen readers", () => {
    const { container } = render(<Minimap model={model} roomId="a1" headingDeg={90} roomLabel={(id) => id} onExpand={() => {}} />);
    const arrow = container.querySelector('[data-slot="museum-plan-drawing"] [data-slot="museum-plan-heading"]');
    expect(arrow?.getAttribute("data-heading")).toBe("90");
    expect(arrow?.getAttribute("transform")).toContain("rotate(90)");
    expect(container.querySelector('[data-slot="museum-plan-drawing"] circle')).toBeNull();
    expect(container.textContent).toContain("facing east");
  });

  it("keeps the dot until the scene reports a heading", () => {
    const { container } = render(<Minimap model={model} roomId="a1" roomLabel={(id) => id} onExpand={() => {}} />);
    expect(container.querySelector('[data-slot="museum-plan-heading"]')).toBeNull();
    expect(container.querySelector('[data-slot="museum-plan-drawing"] circle')).not.toBeNull();
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
