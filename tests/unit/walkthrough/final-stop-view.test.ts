import { describe, expect, it } from "vitest";

import ajrakh from "../../../content/study/ajrakh.template.json";
import kalamkari from "../../../content/study/machilipatnam-kalamkari.template.json";
import sanganeri from "../../../content/study/sanganeri.template.json";
import studyPhotos from "../../../tools/walkthrough-lab/study-photos.json";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { withStudyPhotos, type StageTemplate, type StudyPhotoSource } from "@/features/process/domain/stage-template";
import type { Vec3 } from "@/features/walkthrough/domain/geometry";
import { buildRoute } from "@/features/walkthrough/domain/route-plan";
import { furthestReachable } from "@/features/walkthrough/domain/walk-state";
import { CLOTH_LINE_X, RAIL_HEIGHT } from "@/features/walkthrough/domain/yard-plan";

const FIELD_OF_VIEW_DEGREES = 55;
const ASPECT = 1366 / 768;
const plain = [ajrakh, sanganeri, kalamkari] as unknown as StageTemplate[];
const withPhotos = withStudyPhotos(plain, studyPhotos as StudyPhotoSource[]);

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};

function inView(from: Vec3, to: Vec3, point: Vec3): boolean {
  const forward = unit(sub(to, from));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const offset = sub(point, from);
  const depth = dot(offset, forward);
  const half = Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360);
  return depth > 0 && Math.abs(dot(offset, right) / depth) <= half * ASPECT && Math.abs(dot(offset, up) / depth) <= half;
}

describe("the final stop's default view", () => {
  for (const template of [...plain, ...withPhotos]) {
    const label = `${template.tradition}${template.photos?.length ? " with study photographs" : ""}`;
    const route = buildRoute(template, clothStatePath);
    const hall = route.at(-1)!;

    it(`arrives facing the hall, its finished textiles and the followed cloth: ${label}`, () => {
      const { from, to } = hall.plan.standpoint;
      expect(hall.stopKey).toBe("products");
      expect(hall.textiles.length).toBeGreaterThan(0);
      for (const textile of hall.textiles) expect(inView(from, to, [textile.x, 4.42 - textile.height / 2, textile.z]), textile.product.id).toBe(true);
      expect(inView(from, to, [CLOTH_LINE_X, RAIL_HEIGHT, hall.plan.rails[0]!])).toBe(true);
    });

    it(`walks in to the standpoint it is facing from: ${label}`, () => {
      expect(hall.plan.walkLine[0]).toEqual([hall.plan.standpoint.from[0], hall.plan.standpoint.from[2]]);
    });
  }
});

describe("furthestReachable", () => {
  const built = (indices: number[]) => (index: number) => indices.includes(index);

  it("stops the walk at the current station while the next yard is not built", () => {
    expect(furthestReachable(8, built([7, 8]), 9)).toBe(8);
  });

  it("lets the walk on through every built yard ahead, never past the last station", () => {
    expect(furthestReachable(8, built([7, 8, 9]), 9)).toBe(9);
    expect(furthestReachable(2, built([2, 3, 5]), 9)).toBe(3);
  });
});
