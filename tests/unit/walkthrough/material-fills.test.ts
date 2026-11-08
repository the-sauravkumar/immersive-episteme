import { describe, expect, it } from "vitest";
import { fittedSurfaceSteps, flatLevel, heapHeight, levelInVessel, moundHeight, pasteHeight, wallFilmSteps } from "@/features/walkthrough/domain/fill-surface";
import { hasCakePieces, isLumpCrystal, PASTE_FORMS, pasteThicknessOf, powderGrainOf } from "@/features/walkthrough/domain/substance-body";
import { scatterOnSurface } from "@/features/walkthrough/domain/surface-scatter";
import { albedoForDisplay, filmicToScene } from "@/features/walkthrough/domain/lit-colour";
import { packPile, rotateYXZ } from "@/features/walkthrough/domain/pile-packing";
import { checkScene, type FillAudit } from "@/features/walkthrough/domain/scene-check";
import { measureVesselProfile, outsideDepth, wallRadius } from "@/features/walkthrough/domain/vessel-profile";

function settle<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

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
      const grid = settle(fittedSurfaceSteps(profile, level, 24, 96, height));
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
    const grid = settle(fittedSurfaceSteps(profile, level, 12, 48, flatLevel(level)));
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

describe("powder heaps, pastes and scattered grains", () => {
  const level = levelInVessel(profile, 0.34);
  const reach = wallRadius(profile, 0, level);
  const shape = { reach, seed: 3, crownOffset: 0.18, slumps: 5, slumpDepth: 0.003, lineDepth: 0.0012, lumpDepth: 0.0026, fineDepth: 0.0004, climb: 0.004 };

  it("a powder heap rises to an off-centre crown with an uneven slope", () => {
    const grid = settle(fittedSurfaceSteps(profile, level, 48, 192, heapHeight(level, 0.06, shape)));
    let top = -Infinity;
    let topAt = 0;
    for (let i = 0; i < grid.positions.length; i += 3) {
      if (grid.positions[i + 1]! > top) {
        top = grid.positions[i + 1]!;
        topAt = Math.hypot(grid.positions[i]!, grid.positions[i + 2]!);
      }
    }
    expect(top - level).toBeGreaterThan(0.04);
    expect(topAt).toBeGreaterThan(0.003);
    const ring = Array.from({ length: 192 }, (_, spoke) => grid.positions[(1 + 20 * 192 + spoke) * 3 + 1]!);
    expect(Math.max(...ring) - Math.min(...ring)).toBeGreaterThan(0.002);
  });

  it("a paste domes, climbs the wall and keeps inside it", () => {
    const grid = settle(fittedSurfaceSteps(profile, level, 48, 192, pasteHeight(level, 0.18, { reach, seed: 7, ...PASTE_FORMS.thick })));
    let deepest = 0;
    for (let i = 0; i < grid.positions.length; i += 3) deepest = Math.max(deepest, outsideDepth(profile, grid.positions[i]!, grid.positions[i + 1]!, grid.positions[i + 2]!));
    expect(deepest).toBeLessThan(0.004);
    let edgeMean = 0;
    for (let spoke = 0; spoke < 192; spoke++) edgeMean += grid.positions[(1 + 47 * 192 + spoke) * 3 + 1]! / 192;
    expect(edgeMean).toBeGreaterThan(level);
  });

  it("scattered grains sit on the surface, inside the wall and clear of each other", () => {
    const heightAt = heapHeight(level, 0.05, shape);
    const spheres = [{ x: 0, y: 0, z: 0, r: 0.0015 }];
    const placed = scatterOnSurface([{ variants: [0], spheresOf: () => spheres, count: 120, smallest: 0.6, largest: 1.2, towardWall: 0.8, sink: 0.35 }], { profile, heightAt, level, seed: 9, margin: 0.001 });
    expect(placed.length).toBeGreaterThan(60);
    const world = placed.map((piece) => [{ x: piece.x, y: piece.y, z: piece.z, r: 0.0015 * piece.scale }]);
    const audit: FillAudit = { name: "grains", points: () => new Float32Array(0), vertexOutside: () => false, pieces: () => world };
    expect(checkScene({ yard: { min: [-1, -1, -1], max: [1, 1, 1] }, solids: [], cloths: [], fields: [], groundIsOpenAt: () => false, fills: [audit] }).problems).toEqual([]);
    for (const piece of placed) expect(outsideDepth(profile, piece.x, piece.y, piece.z)).toBe(0);
  });

  it("a wall film follows the wall from under the fill and fades out at its top", () => {
    const film = settle(wallFilmSteps(8, 64, () => level - 0.005, () => level + 0.02, (theta, y) => wallRadius(profile, theta, y), 0.0007));
    expect(film.share[0]).toBe(0);
    expect(film.share[8]).toBe(1);
    let deepest = 0;
    for (let i = 0; i < film.positions.length; i += 3) deepest = Math.max(deepest, outsideDepth(profile, film.positions[i]!, film.positions[i + 1]!, film.positions[i + 2]!));
    expect(deepest).toBe(0);
  });

  it("reads grain, cakes and lumps from each look row's own words", () => {
    const row = (key: string, fill: string, surface: string, transparency = "opaque") => ({ key, fill, surface, transparency });
    expect(powderGrainOf(row("sanganeri-sawdust", "powder", "fine dust under flakes, chips and curled shavings"))).toBe("fibrous");
    expect(powderGrainOf(row("ajrakh-harde-myrobalan", "powder", "fine powder"))).toBe("coarse");
    expect(powderGrainOf(row("sanganeri-indigo", "powder", "granular"))).toBe("granular");
    expect(powderGrainOf(row("ajrakh-dusting-agents", "powder", "dry fine dust, matt"))).toBe("dust");
    expect(powderGrainOf(row("machilipatnam-kalamkari-alizarin", "powder", "crystals or powder"))).toBe("crystalline");
    expect(hasCakePieces(row("ajrakh-indigo", "powder", "dull matte, coppery where rubbed"))).toBe(true);
    expect(hasCakePieces(row("sanganeri-indigo", "powder", "granular"))).toBe(false);
    expect(isLumpCrystal(row("ajrakh-alum", "crystals", "glassy crystalline, matte as powder", "clear"))).toBe(true);
    expect(isLumpCrystal(row("ajrakh-synthetic-alizarin", "crystals", "crystalline"))).toBe(false);
    expect(pasteThicknessOf(row("sanganeri-dabu-resist-paste", "paste", "thick, sticky, wet"))).toBe("thick");
    expect(pasteThicknessOf(row("ajrakh-tamarind-seed-paste", "paste", "sticky wet paste"))).toBe("stiff");
    expect(pasteThicknessOf(row("machilipatnam-kalamkari-indigo", "paste", "wet paste"))).toBe("thin");
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
