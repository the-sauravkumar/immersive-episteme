import * as THREE from "three";
import type { Box } from "../domain/geometry";
import { hiddenBehindWall } from "../domain/wall-occlusion";

interface Part {
  readonly mesh: THREE.Mesh;
  readonly box: Box;
}

interface Yard {
  readonly bounds: THREE.Box3;
  readonly parts: readonly Part[];
}

function worldBox(mesh: THREE.Mesh): THREE.Box3 {
  if (mesh instanceof THREE.InstancedMesh) {
    if (mesh.boundingBox === null) mesh.computeBoundingBox();
    return mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
  }
  if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
}

export class YardCulling {
  private readonly yards = new Map<THREE.Object3D, Yard>();
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();

  add(group: THREE.Object3D): void {
    group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    const parts: Part[] = [];
    group.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.visible) return;
      const box = worldBox(node);
      bounds.union(box);
      if (node.children.length === 0) parts.push({ mesh: node, box: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] } });
    });
    this.yards.set(group, { bounds, parts });
  }

  remove(group: THREE.Object3D): void {
    const yard = this.yards.get(group);
    if (!yard) return;
    group.visible = true;
    for (const { mesh } of yard.parts) mesh.visible = true;
    this.yards.delete(group);
  }

  apply(camera: THREE.Camera, everything: boolean): void {
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const eye = camera.matrixWorld.elements;
    const at = [eye[12]!, eye[13]!, eye[14]!] as const;
    for (const [group, yard] of this.yards) {
      group.visible = everything || this.frustum.intersectsBox(yard.bounds);
      if (!group.visible) continue;
      for (const { mesh, box } of yard.parts) mesh.visible = everything || !hiddenBehindWall(at, box);
    }
  }
}
