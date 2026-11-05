import * as THREE from "three";
import { noteSurface, type MaterialLibrary, type ScanName } from "./material-library";
import { displayAlbedo, projectScan } from "./substance-materials";

export interface ProjectedLook {
  readonly key: string;
  readonly scan: ScanName;
  readonly hex: string;
  readonly tileMetres?: number;
  readonly contrast: number;
  readonly leastRough: number;
  readonly normalScale: number;
  readonly specular?: number;
  readonly toned?: boolean;
  readonly metalness?: number;
  readonly rubbedShare?: number;
  readonly rubbedHex?: string;
  readonly realFacets?: boolean;
  readonly turnedGrain?: boolean;
  readonly openWork?: boolean;
}

export function projectedMaterial(library: MaterialLibrary, look: ProjectedLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`built:${look.key}`, async () => {
    const scan = await library.scan(look.scan);
    const material = new THREE.MeshStandardMaterial({
      map: scan.colour,
      normalMap: scan.normal,
      roughnessMap: scan.roughness,
      roughness: 1,
      metalness: look.metalness ?? 0,
      color: displayAlbedo(look.hex),
      normalScale: new THREE.Vector2(look.normalScale, look.normalScale),
      envMapIntensity: 0.55,
      vertexColors: look.toned ?? false,
    });
    const perMetre = 1 / (look.tileMetres ?? scan.tileMetres);
    projectScan(material, perMetre, look.contrast, look.leastRough, { specular: look.specular ?? 0.5, turned: look.turnedGrain ?? false, rubbed: look.rubbedShare ?? 0, rubbedColour: look.rubbedHex ? displayAlbedo(look.rubbedHex) : undefined });
    return noteSurface(material, { label: look.key, kind: "model", perMetre, openWork: look.openWork ?? false, realFacets: look.realFacets ?? false });
  });
}

export function setTones(geometry: THREE.BufferGeometry, toneAt: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const position = geometry.attributes.position!;
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const tone = toneAt(position.getX(i), position.getY(i), position.getZ(i));
    colours.set([tone, tone, tone], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

export function solidMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function restOnBench(part: THREE.Object3D): THREE.Object3D {
  part.updateMatrixWorld(true);
  part.position.y -= new THREE.Box3().setFromObject(part).min.y;
  return part;
}
