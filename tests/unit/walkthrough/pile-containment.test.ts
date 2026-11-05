import { describe, expect, it } from "vitest";
import { worldSpheresOf } from "@/features/walkthrough/domain/pile-packing";
import { measureVesselProfile, wallRadius } from "@/features/walkthrough/domain/vessel-profile";
import { pileRecipe } from "@/features/walkthrough/infrastructure/fill-pieces";
import { pileSteps } from "@/features/walkthrough/infrastructure/substance-fill";

const HALF_X = 0.2;
const HALF_Z = 0.14;
const DEPTH = 0.075;

function openBoxTriangles(): Float32Array {
  const corners = (y: number) => [
    [-HALF_X, y, -HALF_Z],
    [HALF_X, y, -HALF_Z],
    [HALF_X, y, HALF_Z],
    [-HALF_X, y, HALF_Z],
  ];
  const low = corners(0);
  const high = corners(DEPTH);
  const values: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => values.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(low[0]!, low[1]!, low[2]!, low[3]!);
  for (let side = 0; side < 4; side++) quad(low[side]!, low[(side + 1) % 4]!, high[(side + 1) % 4]!, high[side]!);
  return Float32Array.from(values);
}

function settle<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

describe("camel dung stays inside its basket", () => {
  it("keeps every pellet centre inside the basket footprint and below the rim", async () => {
    const profile = measureVesselProfile(openBoxTriangles());
    const recipe = await pileRecipe("camel-pellets");
    const placed = settle(pileSteps(profile, recipe));
    expect(placed.length).toBeGreaterThan(40);
    for (const piece of placed) {
      expect(Math.abs(piece.x)).toBeLessThan(HALF_X);
      expect(Math.abs(piece.z)).toBeLessThan(HALF_Z);
      expect(piece.y).toBeLessThan(profile.rimY);
      for (const sphere of worldSpheresOf(piece, recipe.variants[piece.variant]!.spheres)) {
        expect(Math.hypot(sphere.x, sphere.z)).toBeLessThan(wallRadius(profile, Math.atan2(sphere.z, sphere.x), sphere.y));
      }
    }
  }, 120000);
});
