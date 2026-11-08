import { describe, expect, it } from "vitest";
import { coarsestLevel, keepsLevel, LEVEL_ERRORS_METRES, nearestDistance, pixelsPerMetre, rowSpans, SCREEN_ERROR_PIXELS } from "@/features/walkthrough/domain/geometry-levels";
import { NEAREST_REACH_METRES } from "@/features/walkthrough/domain/surface-density";
import { hiddenBehindWall } from "@/features/walkthrough/domain/wall-occlusion";
import { CLOTH_LINE_X, FAR_WALL_Z, NEXT_YARD_OFFSET, WALL_HEIGHT } from "@/features/walkthrough/domain/yard-plan";

const REVIEW_HEIGHT = 2160;
const FIELD_OF_VIEW = (55 * Math.PI) / 180;
const errors = [0, ...LEVEL_ERRORS_METRES];
const perspective = (viewportHeight: number) => ({ kind: "perspective" as const, verticalFov: FIELD_OF_VIEW, viewportHeight });

describe("geometry levels chosen by projected error", () => {
  it("draws full detail at the nearest reach on the review screen", () => {
    expect(coarsestLevel(errors, pixelsPerMetre(perspective(REVIEW_HEIGHT), NEAREST_REACH_METRES))).toBe(0);
    expect(coarsestLevel(errors, pixelsPerMetre(perspective(768), NEAREST_REACH_METRES)) > 0).toBe(true);
  });

  it("never picks a level whose error projects past the pixel bound", () => {
    for (const distance of [0.3, 1, 3, 8, 20, 45, 90]) {
      for (const height of [384, 768, 1080, 2160]) {
        const perMetre = pixelsPerMetre(perspective(height), distance);
        const level = coarsestLevel(errors, perMetre);
        expect(errors[level]! * perMetre).toBeLessThanOrEqual(SCREEN_ERROR_PIXELS);
        if (level + 1 < errors.length) expect(errors[level + 1]! * perMetre).toBeGreaterThan(SCREEN_ERROR_PIXELS);
      }
    }
  });

  it("coarsens with distance and refines with resolution", () => {
    const at = (distance: number, height: number) => coarsestLevel(errors, pixelsPerMetre(perspective(height), distance));
    expect(at(40, 1080)).toBeGreaterThan(at(4, 1080));
    expect(at(10, 2160)).toBeLessThan(at(10, 540));
  });

  it("bounds a shadow map level by its texel size", () => {
    const perMetre = pixelsPerMetre({ kind: "orthographic", frustumHeight: 68, viewportHeight: 4096 }, 0);
    expect(errors[coarsestLevel(errors, perMetre)]!).toBeLessThanOrEqual((68 / 4096) * SCREEN_ERROR_PIXELS);
  });

  it("measures distance to the nearest point of the bounds", () => {
    expect(nearestDistance([0, 0, 0], [3, 4, 0], 1)).toBeCloseTo(4);
    expect(nearestDistance([0, 0, 0], [1, 0, 0], 2)).toBe(0);
  });

  it("keeps a level only for a real saving and spans whole rows", () => {
    expect(keepsLevel(3000, 2400)).toBe(false);
    expect(keepsLevel(3000, 2000)).toBe(true);
    const spans = rowSpans(6 * 10 * 250, 60, 96);
    expect(spans.map(([start, end]) => end - start)).toEqual([5760, 5760, 3480]);
    expect(spans.every(([start]) => start % 60 === 0)).toBe(true);
  });
});

describe("wall occlusion", () => {
  const eye = [CLOTH_LINE_X + 6, 1.6, 0] as const;
  const ahead = (x: number, y0: number, y1: number) => ({ min: [x - 0.3, y0, FAR_WALL_Z - 10] as const, max: [x + 0.3, y1, FAR_WALL_Z - 9] as const });

  it("hides a low object of the next yard behind the brick", () => {
    expect(hiddenBehindWall(eye, ahead(CLOTH_LINE_X + 10, 0, 0.8))).toBe(true);
  });

  it("keeps what shows through the gap or above the wall", () => {
    expect(hiddenBehindWall(eye, ahead(CLOTH_LINE_X, 0, 0.8))).toBe(false);
    expect(hiddenBehindWall(eye, ahead(CLOTH_LINE_X + 10, 0, WALL_HEIGHT + 3))).toBe(false);
    expect(hiddenBehindWall(eye, { min: [CLOTH_LINE_X - 1, 0, FAR_WALL_Z - 5], max: [CLOTH_LINE_X + 1, 4, FAR_WALL_Z + 5] })).toBe(false);
  });

  it("hides a low object of the yard behind the walker", () => {
    const walker = [CLOTH_LINE_X + 6, 1.6, -NEXT_YARD_OFFSET] as const;
    expect(hiddenBehindWall(walker, { min: [CLOTH_LINE_X + 12, 0, FAR_WALL_Z + 8], max: [CLOTH_LINE_X + 13, 0.8, FAR_WALL_Z + 9] })).toBe(true);
  });

  it("hides nothing while the walker stands in the gap", () => {
    expect(hiddenBehindWall([CLOTH_LINE_X, 1.6, FAR_WALL_Z], ahead(CLOTH_LINE_X + 10, 0, 0.8))).toBe(false);
  });
});
