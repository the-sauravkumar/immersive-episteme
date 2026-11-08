import type { Box, Vec3 } from "./geometry";
import { EYE_HEIGHT, FAR_WALL_Z, NEXT_YARD_OFFSET, YARD_FRONT_Z } from "./yard-plan";

export interface WalkInput {
  readonly forward: number;
  readonly strafe: number;
  readonly lookX: number;
  readonly lookY: number;
}

export interface Walker {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly walked: number;
}

const WALK_SPEED = 1.9;
export const BODY_RADIUS = 0.6;
const LOWEST_BLOCKING_METRES = 0.12;
const HEAD_CLEARANCE_METRES = 2.1;
const MAX_PITCH = 1.2;

export const stationIndexAt = (z: number): number => Math.max(0, Math.floor((YARD_FRONT_Z - z) / NEXT_YARD_OFFSET));
export const localZ = (z: number, index: number): number => z + index * NEXT_YARD_OFFSET;
export const worldZ = (z: number, index: number): number => z - index * NEXT_YARD_OFFSET;

export function walkerAt(from: Vec3, to: Vec3, index: number): Walker {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  return { x: from[0], z: worldZ(from[2], index), yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(to[1] - from[1], Math.hypot(dx, dz)), walked: 0 };
}

export function furthestReachable(current: number, isBuilt: (index: number) => boolean, lastStation: number): number {
  let furthest = Math.max(0, current);
  while (furthest < lastStation && isBuilt(furthest + 1)) furthest++;
  return furthest;
}

export function eyeOf(walker: Walker): Vec3 {
  return [walker.x, EYE_HEIGHT, walker.z];
}

export const blocksBody = (box: Box): boolean => box.max[1] > LOWEST_BLOCKING_METRES && box.min[1] < HEAD_CLEARANCE_METRES;

function blocked(x: number, z: number, colliders: readonly Box[]): boolean {
  return colliders.some((box) => blocksBody(box) && x > box.min[0] - BODY_RADIUS && x < box.max[0] + BODY_RADIUS && z > box.min[2] - BODY_RADIUS && z < box.max[2] + BODY_RADIUS);
}

export function stepWalker(walker: Walker, input: WalkInput, seconds: number, colliders: readonly Box[], lastStation: number): Walker {
  const yaw = walker.yaw - input.lookX;
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, walker.pitch - input.lookY));
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const distance = WALK_SPEED * seconds;
  const dx = (-sin * input.forward + cos * input.strafe) * distance;
  const dz = (-cos * input.forward - sin * input.strafe) * distance;
  const minZ = worldZ(FAR_WALL_Z + 1, lastStation);
  const maxZ = YARD_FRONT_Z + 2;
  const index = stationIndexAt(walker.z);
  const here = localZ(walker.z, index);
  let x = walker.x;
  let z = walker.z;
  if (!blocked(walker.x + dx, here, colliders)) x = walker.x + dx;
  if (!blocked(x, here + dz, colliders) && walker.z + dz > minZ && walker.z + dz < maxZ) z = walker.z + dz;
  return { x, z, yaw, pitch, walked: walker.walked + Math.hypot(x - walker.x, z - walker.z) };
}

export interface WalkTarget {
  readonly station: number;
  readonly waypoint: number;
}

export function nearestWaypoint(walker: Walker, line: readonly (readonly [number, number])[], station: number): number {
  let nearest = 0;
  let shortest = Number.POSITIVE_INFINITY;
  for (const [index, point] of line.entries()) {
    const distance = Math.hypot(point[0] - walker.x, worldZ(point[1], station) - walker.z);
    if (distance < shortest) {
      shortest = distance;
      nearest = index;
    }
  }
  return nearest;
}

export interface Steering {
  readonly heading: number | null;
  readonly target: WalkTarget | null;
}

const TURN_RATE = 1.5;

export function steerAlong(walker: Walker, line: readonly (readonly [number, number])[], target: WalkTarget, direction: 1 | -1): Steering {
  const point = line[target.waypoint]!;
  const dx = point[0] - walker.x;
  const dz = worldZ(point[1], target.station) - walker.z;
  if (Math.hypot(dx, dz) < 0.35) {
    const next = target.waypoint + direction;
    if (next < 0 || next >= line.length) return { heading: null, target: null };
    const after = line[next]!;
    return { heading: Math.atan2(-(after[0] - walker.x), -(worldZ(after[1], target.station) - walker.z)), target: { station: target.station, waypoint: next } };
  }
  return { heading: Math.atan2(-dx, -dz), target };
}

export function moveTowards(heading: number, yaw: number): { forward: number; strafe: number } {
  const difference = heading - yaw;
  return { forward: Math.cos(difference), strafe: -Math.sin(difference) };
}

export function turnBetween(yaw: number, heading: number): number {
  return Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
}

export function easeYaw(yaw: number, heading: number, seconds: number): number {
  const difference = turnBetween(yaw, heading);
  const step = TURN_RATE * seconds;
  return yaw + Math.max(-step, Math.min(step, difference));
}
