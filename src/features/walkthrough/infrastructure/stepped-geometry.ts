import * as THREE from "three";
import { vertexNormalSteps } from "../domain/cloth-shading";

export function* normalSteps(geometry: THREE.BufferGeometry): Generator<void, THREE.BufferGeometry> {
  const positions = geometry.attributes.position!.array;
  const normals = new Float32Array(positions.length);
  yield* vertexNormalSteps(positions, geometry.index!.array, normals);
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geometry;
}
