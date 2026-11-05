import type * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const WELD_SCALE = 100;

export function creasedNormals(geometry: THREE.BufferGeometry, creaseRadians: number): THREE.BufferGeometry {
  const enlarged = geometry.clone().scale(WELD_SCALE, WELD_SCALE, WELD_SCALE);
  const creased = toCreasedNormals(enlarged, creaseRadians);
  if (creased !== enlarged) enlarged.dispose();
  return creased.scale(1 / WELD_SCALE, 1 / WELD_SCALE, 1 / WELD_SCALE);
}
