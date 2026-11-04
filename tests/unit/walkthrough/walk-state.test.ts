import { describe, expect, it } from "vitest";
import { easeYaw, nearestWaypoint, turnBetween, worldZ, type Walker } from "@/features/walkthrough/domain/walk-state";

const line = [
  [8, 11.2],
  [4.85, 10.4],
  [4.85, -10],
  [3, -14],
  [3, -26.4],
] as const;

const at = (x: number, localZ: number, station: number): Walker => ({ x, z: worldZ(localZ, station), yaw: 0, pitch: 0, walked: 0 });

describe("nearestWaypoint", () => {
  it("finds the start of the line for a walker standing at the arrival point, whatever the station", () => {
    expect(nearestWaypoint(at(8, 11.2, 0), line, 0)).toBe(0);
    expect(nearestWaypoint(at(8, 11.2, 6), line, 6)).toBe(0);
  });

  it("finds the end of the line for a walker at the gate", () => {
    expect(nearestWaypoint(at(3, -25, 3), line, 3)).toBe(4);
  });

  it("finds the closest middle point for a walker who has wandered off the line", () => {
    expect(nearestWaypoint(at(9, -9, 2), line, 2)).toBe(2);
  });
});

describe("turning", () => {
  it("treats a yaw one whole turn away from the heading as already facing it", () => {
    expect(Math.abs(turnBetween(0.3 + Math.PI * 2, 0.3))).toBeLessThan(1e-9);
  });

  it("settles on the heading by the short way round, across the wrap", () => {
    let yaw = 3;
    for (let i = 0; i < 120; i++) yaw = easeYaw(yaw, -3, 1 / 30);
    expect(Math.abs(turnBetween(yaw, -3))).toBeLessThan(0.002);
    expect(yaw).toBeGreaterThan(3);
  });
});
