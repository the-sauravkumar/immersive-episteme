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

export const WALK_SPEED = 1.9;
const BODY_RADIUS = 0.32;
const MAX_PITCH = 1.2;

export const stationIndexAt = (z: number): number => Math.max(0, Math.floor((YARD_FRONT_Z - z) / NEXT_YARD_OFFSET));
export const localZ = (z: number, index: number): number => z + index * NEXT_YARD_OFFSET;
export const worldZ = (z: number, index: number): number => z - index * NEXT_YARD_OFFSET;

export function walkerAt(from: Vec3, to: Vec3, index: number): Walker {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  return { x: from[0], z: worldZ(from[2], index), yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(to[1] - from[1], Math.hypot(dx, dz)), walked: 0 };
}

export function eyeOf(walker: Walker): Vec3 {
  return [walker.x, EYE_HEIGHT, walker.z];
}

function blocked(x: number, z: number, colliders: readonly Box[]): boolean {
  return colliders.some((box) => box.max[1] > 0.12 && x > box.min[0] - BODY_RADIUS && x < box.max[0] + BODY_RADIUS && z > box.min[2] - BODY_RADIUS && z < box.max[2] + BODY_RADIUS);
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
