import type { Box, Vec3 } from "./geometry";
import { CLOTH_LINE_X, FAR_WALL_Z, GAP_WIDTH, NEXT_YARD_OFFSET, WALL_HALF_DEPTH, WALL_HEIGHT, YARD_HALF_WIDTH } from "./yard-plan";

const WALL_LEFT = CLOTH_LINE_X - YARD_HALF_WIDTH;
const WALL_RIGHT = CLOTH_LINE_X + YARD_HALF_WIDTH;
const GAP_LEFT = CLOTH_LINE_X - GAP_WIDTH / 2;
const GAP_RIGHT = CLOTH_LINE_X + GAP_WIDTH / 2;

const wallZ = (k: number): number => FAR_WALL_Z - k * NEXT_YARD_OFFSET;

function hiddenBehindFace(eye: Vec3, box: Box, faceZ: number): boolean {
  const ahead = faceZ < eye[2];
  if (ahead ? box.max[2] >= faceZ : box.min[2] <= faceZ) return false;
  let left = true;
  let right = true;
  for (let corner = 0; corner < 8; corner++) {
    const x = corner & 1 ? box.max[0] : box.min[0];
    const y = corner & 2 ? box.max[1] : box.min[1];
    const z = corner & 4 ? box.max[2] : box.min[2];
    const t = (faceZ - eye[2]) / (z - eye[2]);
    if (eye[1] + t * (y - eye[1]) > WALL_HEIGHT) return false;
    const across = eye[0] + t * (x - eye[0]);
    left &&= across >= WALL_LEFT && across <= GAP_LEFT;
    right &&= across >= GAP_RIGHT && across <= WALL_RIGHT;
    if (!left && !right) return false;
  }
  return true;
}

export function hiddenBehindWall(eye: Vec3, box: Box): boolean {
  const ahead = Math.max(0, Math.ceil((FAR_WALL_Z + WALL_HALF_DEPTH - eye[2]) / NEXT_YARD_OFFSET));
  if (hiddenBehindFace(eye, box, wallZ(ahead) + WALL_HALF_DEPTH)) return true;
  const behind = ahead - 1;
  return behind >= 0 && eye[2] < wallZ(behind) - WALL_HALF_DEPTH && hiddenBehindFace(eye, box, wallZ(behind) - WALL_HALF_DEPTH);
}
