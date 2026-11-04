import * as THREE from "three";
import { roundSegments } from "../domain/surface-density";
import type { MaterialLibrary } from "./material-library";
import { pole, softBox } from "./solid-builders";

const TURNED_PROFILE_POINTS = 64;

function turned(profile: readonly (readonly [number, number])[], material: THREE.Material, tile: number): THREE.Mesh {
  const smoothed = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(TURNED_PROFILE_POINTS).map((point) => new THREE.Vector2(Math.max(1e-4, point.x), point.y));
  const geometry = new THREE.LatheGeometry(smoothed, Math.max(...profile.map(([r]) => roundSegments(r))));
  const uv = geometry.attributes.uv!;
  const height = profile[profile.length - 1]![1] - profile[0]![1];
  const around = Math.max(...profile.map(([r]) => r)) * Math.PI * 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around / tile, uv.getY(i) * height / tile);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export async function buildWashingPaddle(library: MaterialLibrary): Promise<THREE.Object3D> {
  const timber = await library.surface("table", { normalScale: 1 });
  const group = new THREE.Group();
  const tile: readonly [number, number] = [0.55, 0.55];
  softBox(group, [0.11, 0.026, 0.3], timber, [0, 0.013, 0.2], { radius: 0.011, tile });
  const handle = turned([[0.0001, 0], [0.016, 0.004], [0.017, 0.05], [0.0155, 0.25], [0.0165, 0.33], [0.019, 0.355], [0.0001, 0.372]], timber, 0.55);
  handle.rotation.x = -Math.PI / 2;
  handle.position.set(0, 0.0195, 0.052);
  group.add(handle);
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) node.position.z -= 0.1;
  });
  return group;
}

export async function buildCarvingChisels(library: MaterialLibrary): Promise<THREE.Object3D> {
  const [timber, steel] = await Promise.all([library.surface("table", { normalScale: 1 }), library.surface("steel", { normalScale: 0.5 })]);
  steel.metalness = 0.85;
  steel.envMapIntensity = 1;
  const group = new THREE.Group();
  [[-0.075, 0.0035, 0.2], [0, 0.0045, 0.22], [0.075, 0.0065, 0.19]].forEach(([x, half, length]) => {
    const radius = 0.015;
    const y = radius + 0.001;
    const grip = turned([[0.0001, 0], [0.012, 0.002], [0.015, 0.03], [0.0135, 0.1], [0.008, 0.112], [0.0001, 0.114]], timber, 0.55);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(x!, y, -0.11);
    group.add(grip);
    const blade = turned([[0.0001, 0], [half! * 0.9, 0.0005], [half!, length! * 0.1], [half!, length! - 0.114 + 0.03], [0.0001, length! - 0.114 + 0.034]], steel, 0.5);
    blade.rotation.x = Math.PI / 2;
    blade.position.set(x!, y, 0.0035);
    group.add(blade);
  });
  return group;
}

export async function buildBrushAndKalam(library: MaterialLibrary): Promise<THREE.Object3D> {
  const [bamboo, timber] = await Promise.all([library.surface("bamboo", { normalScale: 1 }), library.surface("table", { normalScale: 1 })]);
  const group = new THREE.Group();
  pole(group, [-0.075, 0.009, -0.17], [-0.075, 0.009, 0.05], 0.008, bamboo);
  const strand = await library.shared("brush-strand", async () => new THREE.CylinderGeometry(0.00035, 0.0007, 0.09, 6, 4));
  library.keep(strand);
  const strands = new THREE.InstancedMesh(strand, timber, 280);
  const holder = new THREE.Object3D();
  for (let i = 0; i < 280; i++) {
    const angle = i * 2.399;
    const reach = 0.0072 * Math.sqrt((i + 0.5) / 280);
    holder.position.set(-0.075 + Math.cos(angle) * reach, 0.0095 + Math.sin(angle) * reach, 0.085 + (i % 7) * 0.0012);
    holder.rotation.set(Math.PI / 2 + Math.sin(angle) * 0.07, 0, Math.cos(angle) * 0.07);
    holder.updateMatrix();
    strands.setMatrixAt(i, holder.matrix);
  }
  strands.castShadow = strands.receiveShadow = true;
  group.add(strands);
  const kalam = turned([[0.0001, 0], [0.0014, 0.018], [0.0052, 0.06], [0.0058, 0.2], [0.0056, 0.24], [0.0001, 0.242]], bamboo, 0.6);
  kalam.rotation.x = Math.PI / 2;
  kalam.position.set(0.05, 0.0065, -0.12);
  group.add(kalam);
  return group;
}
