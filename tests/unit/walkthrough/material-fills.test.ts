import { describe, expect, it } from "vitest";
import { fittedSurface, flatLevel, levelInVessel, moundHeight, pasteHeight } from "@/features/walkthrough/domain/fill-surface";
import { albedoForDisplay, filmicToScene } from "@/features/walkthrough/domain/lit-colour";
import { packPile, rotateYXZ } from "@/features/walkthrough/domain/pile-packing";
import { checkScene, type FillAudit } from "@/features/walkthrough/domain/scene-check";
import { measureVesselProfile, outsideDepth, wallRadius } from "@/features/walkthrough/domain/vessel-profile";

function lathe(profile: readonly (readonly [number, number])[], sides = 64): Float32Array {
  const out: number[] = [];
  for (let s = 0; s < sides; s++) {
    const a0 = (s / sides) * Math.PI * 2;
    const a1 = ((s + 1) / sides) * Math.PI * 2;
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i]!;
      const [r1, y1] = profile[i + 1]!;
      const p = (r: number, y: number, a: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
      out.push(...p(r0, y0, a0), ...p(r0, y0, a1), ...p(r1, y1, a1), ...p(r0, y0, a0), ...p(r1, y1, a1), ...p(r1, y1, a0));
    }
  }
  return Float32Array.from(out);
}

const POT = [[0.08, 0], [0.11, 0.2], [0.104, 0.2], [0.074, 0.012], [0.0001, 0.012]] as const;
const profile = measureVesselProfile(lathe(POT));

describe("vessel profile from the mesh", () => {
  it("finds the inner floor and the inner wall", () => {
    expect(profile.floorY).toBeCloseTo(0.012, 3);
    expect(profile.rimY).toBeGreaterThan(0.18);
    const y = 0.106;
    const inner = 0.074 + ((0.104 - 0.074) * (y - 0.012)) / (0.2 - 0.012);
    expect(wallRadius(profile, 1, y)).toBeCloseTo(inner, 2);
  });

  it("is not fooled by bumps on a woven floor", () => {
    const bumps = lathe([[0.002, 0.016], [0.004, 0.0175], [0.006, 0.016]], 12);
    const woven = new Float32Array(lathe(POT).length + bumps.length);
    woven.set(lathe(POT));
    woven.set(bumps, lathe(POT).length);
    const measured = measureVesselProfile(woven);
    expect(measured.rimY).toBeGreaterThan(0.18);
    expect(wallRadius(measured, 0.7, 0.1)).toBeGreaterThan(0.08);
  });

  it("measures how far a point is outside", () => {
    expect(outsideDepth(profile, 0, 0.1, 0)).toBe(0);
    expect(outsideDepth(profile, 0.2, 0.1, 0)).toBeGreaterThan(0.08);
    expect(outsideDepth(profile, 0, 0, 0)).toBeCloseTo(0.012, 3);
  });
});

describe("surfaces fit the vessel", () => {
  const level = levelInVessel(profile, 0.7);
  for (const [name, height] of [["liquid", flatLevel(level)], ["paste", pasteHeight(level, 0.18)], ["powder", moundHeight(level, 0.05, 0.002)]] as const) {
    it(`${name} touches the wall all round and never leaves it`, () => {
      const grid = fittedSurface(profile, level, 24, 96, height);
      let deepest = 0;
      for (let i = 0; i < grid.positions.length; i += 3) deepest = Math.max(deepest, outsideDepth(profile, grid.positions[i]!, grid.positions[i + 1]!, grid.positions[i + 2]!));
      expect(deepest).toBeLessThan(0.004);
      const last = grid.positions.length - 96 * 3;
      for (let spoke = 0; spoke < 96; spoke++) {
        const x = grid.positions[last + spoke * 3]!;
        const z = grid.positions[last + spoke * 3 + 2]!;
        expect(Math.abs(Math.hypot(x, z) - wallRadius(profile, Math.atan2(z, x), level))).toBeLessThan(0.003);
      }
    });
  }

  it("a liquid surface is flat", () => {
    const grid = fittedSurface(profile, level, 12, 48, flatLevel(level));
    for (let i = 1; i < grid.positions.length; i += 3) expect(grid.positions[i]).toBeCloseTo(level, 6);
  });
});

describe("piles do not interpenetrate", () => {
  const spheres = [{ x: 0, y: 0, z: 0, r: 0.012 }, { x: 0.012, y: 0, z: 0, r: 0.01 }];
  const placed = packPile(profile, Array.from({ length: 40 }, () => ({ variant: 0, scale: 1, spheres })), { seed: 5, candidates: 12, maxTilt: 0.4, anyTumble: true, topY: 0.2, margin: 0.001, fillRadius: 0.09 });

  it("settles pieces in the vessel with every sphere clear of every other", () => {
    expect(placed.length).toBeGreaterThan(20);
    const world = placed.map((piece) => spheres.map((sphere) => {
      const [x, y, z] = rotateYXZ(sphere.x, sphere.y, sphere.z, piece.yaw, piece.pitch, piece.roll);
      return { x: x + piece.x, y: y + piece.y, z: z + piece.z, r: sphere.r };
    }));
    const audit: FillAudit = { name: "pile", points: () => new Float32Array(0), vertexOutside: () => false, pieces: () => world };
    const report = checkScene({ yard: { min: [-1, -1, -1], max: [1, 1, 1] }, solids: [], cloths: [], fields: [], groundIsOpenAt: () => false, fills: [audit] });
    expect(report.problems).toEqual([]);
    for (const piece of world) for (const sphere of piece) expect(sphere.y - sphere.r).toBeGreaterThanOrEqual(profile.floorY - 1e-6);
  });

  it("rests every piece on the floor, on other pieces or on a wall that slopes enough to hold it", () => {
    const reachOf = (piece: (typeof placed)[number]) => spheres.map((sphere) => {
      const [x, y, z] = rotateYXZ(sphere.x, sphere.y, sphere.z, piece.yaw, piece.pitch, piece.roll);
      return { x: x + piece.x, y: y + piece.y, z: z + piece.z, r: sphere.r };
    });
    const hanging = placed.filter((piece, index) => {
      const own = reachOf(piece);
      const onFloor = own.some((sphere) => sphere.y - sphere.r <= profile.floorY + 0.003);
      const onPiece = placed.slice(0, index).some((other) => reachOf(other).some((below) => own.some((sphere) => Math.hypot(sphere.x - below.x, sphere.y - below.y, sphere.z - below.z) <= sphere.r + below.r + 0.003)));
      const theta = Math.atan2(piece.z, piece.x);
      const flare = (wallRadius(profile, theta, piece.y + 0.015) - wallRadius(profile, theta, piece.y - 0.015)) / 0.03;
      return !onFloor && !onPiece && flare < 0.5;
    });
    expect(hanging).toEqual([]);
  });

  it("the scene check catches a pile overlap and a fill through the wall", () => {
    const pieces = [[{ x: 0, y: 0, z: 0, r: 0.02 }], [{ x: 0.01, y: 0, z: 0, r: 0.02 }]];
    const fill: FillAudit = { name: "bad", points: () => Float32Array.from([0.5, 0.1, 0]), vertexOutside: ([x, y, z]) => outsideDepth(profile, x, y, z) > 0.004, pieces: () => pieces };
    const report = checkScene({ yard: { min: [-1, -1, -1], max: [1, 1, 1] }, solids: [], cloths: [], fields: [], groundIsOpenAt: () => false, fills: [fill] });
    expect(report.problems.map((problem) => problem.rule).sort()).toEqual(["fill-outside-vessel", "fill-overlap"]);
  });
});

describe("colour for the display", () => {
  it("inverts the film curve", () => {
    const film = (scene: number) => (scene * (2.51 * scene + 0.03)) / (scene * (2.43 * scene + 0.59) + 0.14);
    for (const y of [0.01, 0.05, 0.2, 0.5, 0.8]) expect(film(filmicToScene(y))).toBeCloseTo(y, 4);
  });

  it("keeps dark dark and pale pale", () => {
    const dark = albedoForDisplay([0.01, 0.008, 0.006]);
    const pale = albedoForDisplay([0.8, 0.8, 0.75]);
    expect(dark[0]).toBeLessThan(0.05);
    expect(pale[0]).toBeGreaterThan(0.8);
  });
});
