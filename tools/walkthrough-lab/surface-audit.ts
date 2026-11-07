import * as THREE from "three";
import type { Vec3 } from "@/features/walkthrough/domain/geometry";
import { nearestEye, type ReachField } from "@/features/walkthrough/domain/reach";
import { chordSagitta, judgeSurface, NEAREST_REACH_METRES, type SurfaceClass, type SurfaceFact, type SurfaceRow, type TearingFigures } from "@/features/walkthrough/domain/surface-density";
import type { SurfaceNote } from "@/features/walkthrough/infrastructure/material-library";

const LARGEST_CURVE_TURNING = (75 * Math.PI) / 180;
const SMALLEST_CURVE_TURNING = (0.3 * Math.PI) / 180;
const WELD_METRES = 2e-5;
const SHARED_NORMAL_COSINE = 0.985;
const SAMPLE_BUDGET = 16000;

interface ObjectParts {
  readonly label: string;
  readonly auditName: string;
  readonly surfaceClass: SurfaceClass;
  readonly meshes: THREE.Mesh[];
}

const noteOf = (material: THREE.Material): SurfaceNote | undefined => material.userData.surface as SurfaceNote | undefined;

function ownerName(mesh: THREE.Object3D): string {
  let node: THREE.Object3D | null = mesh;
  while (node) {
    const name = node.userData.auditName as string | undefined;
    if (name) return name;
    node = node.parent;
  }
  return "unregistered";
}

export function objectParts(root: THREE.Object3D): ObjectParts[] {
  const parts = new Map<string, ObjectParts>();
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const material = node.material as THREE.Material;
    const note = noteOf(material);
    const auditName = ownerName(node);
    const label = note?.label ?? `unlabelled ${material.type}`;
    const key = `${auditName}|${label}`;
    const known = parts.get(key);
    if (known) known.meshes.push(node);
    else parts.set(key, { label, auditName, surfaceClass: note?.kind ?? "model", meshes: [node] });
  });
  return [...parts.values()];
}

function instanceMatrices(mesh: THREE.Mesh): THREE.Matrix4[] {
  if (!(mesh instanceof THREE.InstancedMesh)) return [mesh.matrixWorld];
  const out: THREE.Matrix4[] = [];
  const local = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, local);
    out.push(new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, local));
  }
  return out;
}

const scaleOf = (matrix: THREE.Matrix4): number => new THREE.Vector3().setFromMatrixScale(matrix).x;

interface GeometryDensity {
  readonly uvPerMetre: number;
  readonly middleUvPerMetre: number;
}

function uvDensity(mesh: THREE.Mesh, matrix: THREE.Matrix4): GeometryDensity {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.attributes.position!;
  const uv = geometry.attributes.uv;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const samples: { ratio: number; area: number }[] = [];
  let total = 0;
  for (let t = 0; t + 2 < count; t += 3) {
    const i0 = at(t);
    const i1 = at(t + 1);
    const i2 = at(t + 2);
    a.fromBufferAttribute(position, i0).applyMatrix4(matrix);
    b.fromBufferAttribute(position, i1).applyMatrix4(matrix);
    c.fromBufferAttribute(position, i2).applyMatrix4(matrix);
    const area = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).length() / 2;
    if (area < 1e-10) continue;
    total += area;
    if (!uv) continue;
    const uvArea = Math.abs((uv.getX(i1) - uv.getX(i0)) * (uv.getY(i2) - uv.getY(i0)) - (uv.getX(i2) - uv.getX(i0)) * (uv.getY(i1) - uv.getY(i0))) / 2;
    samples.push({ ratio: Math.sqrt(uvArea / area), area });
  }
  if (samples.length === 0) return { uvPerMetre: 0, middleUvPerMetre: 0 };
  samples.sort((p, q) => p.ratio - q.ratio);
  const atShare = (share: number) => {
    let walked = 0;
    for (const sample of samples) {
      walked += sample.area;
      if (walked >= total * share) return sample.ratio;
    }
    return samples[samples.length - 1]!.ratio;
  };
  return { uvPerMetre: atShare(0.05), middleUvPerMetre: atShare(0.5) };
}

const sizeOf = (texture: THREE.Texture | null | undefined): number | null => {
  if (!texture) return null;
  const image = texture.image as { width?: number; height?: number } | null;
  return image?.width && image?.height ? Math.max(image.width, image.height) : null;
};

const repeatOf = (texture: THREE.Texture): number => Math.sqrt(Math.abs(texture.repeat.x * texture.repeat.y));

interface FacetFigures {
  readonly sagitta: number;
  readonly hardCurveShare: number;
}

function facetFigures(mesh: THREE.Mesh, matrix: THREE.Matrix4, field: ReachField): FacetFigures {
  const scale = scaleOf(matrix);
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const weldKey = (i: number) => `${Math.round(position.getX(i) / WELD_METRES)},${Math.round(position.getY(i) / WELD_METRES)},${Math.round(position.getZ(i) / WELD_METRES)}`;
  const keys = new Map<number, number>();
  const ids = new Map<string, number>();
  const idOf = (i: number) => {
    const cached = keys.get(i);
    if (cached !== undefined) return cached;
    const key = weldKey(i);
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    keys.set(i, id);
    return id;
  };
  const edges = new Map<number, { face: THREE.Vector3; vertex: number; width: number }>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const sagittas: number[] = [];
  let curved = 0;
  let hard = 0;
  for (let t = 0; t + 2 < count; t += 3) {
    const corners = [at(t), at(t + 1), at(t + 2)];
    a.fromBufferAttribute(position, corners[0]!);
    b.fromBufferAttribute(position, corners[1]!);
    c.fromBufferAttribute(position, corners[2]!);
    const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (face.lengthSq() < 1e-20) continue;
    const doubleArea = face.length();
    face.normalize();
    for (let e = 0; e < 3; e++) {
      const p = corners[e]!;
      const q = corners[(e + 1) % 3]!;
      const ip = idOf(p);
      const iq = idOf(q);
      if (ip === iq) continue;
      const key = ip < iq ? ip * 67108864 + iq : iq * 67108864 + ip;
      const known = edges.get(key);
      na.fromBufferAttribute(position, p);
      nb.fromBufferAttribute(position, q);
      const width = doubleArea / Math.max(na.distanceTo(nb), 1e-9);
      if (!known) {
        edges.set(key, { face, vertex: p, width });
        continue;
      }
      const turning = known.face.angleTo(face);
      if (turning < SMALLEST_CURVE_TURNING || turning > LARGEST_CURVE_TURNING) continue;
      curved++;
      if (normal) {
        na.fromBufferAttribute(normal, known.vertex);
        nb.fromBufferAttribute(normal, ip === idOf(known.vertex) ? p : q);
        if (na.dot(nb) < SHARED_NORMAL_COSINE) {
          hard++;
          continue;
        }
      } else {
        hard++;
        continue;
      }
      const middle = new THREE.Vector3().addVectors(na, nb).multiplyScalar(0.5).applyMatrix4(matrix);
      const fromEye = Math.max(NEAREST_REACH_METRES, nearestEye(field, [middle.x, middle.y, middle.z]).distance);
      sagittas.push((chordSagitta(Math.min(known.width, width) * scale, turning) * NEAREST_REACH_METRES) / fromEye);
    }
  }
  const flatShaded = (mesh.material as THREE.MeshStandardMaterial).flatShading === true;
  const hardCurveShare = flatShaded ? 1 : curved === 0 ? 0 : hard / curved;
  if (sagittas.length === 0) return { sagitta: 0, hardCurveShare };
  sagittas.sort((p, q) => p - q);
  return { sagitta: sagittas[Math.floor(sagittas.length * 0.98)]!, hardCurveShare };
}

function samplePoints(mesh: THREE.Mesh, matrix: THREE.Matrix4, budget: number, out: number[]): void {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.attributes.position!;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const triangles = Math.floor(count / 3);
  const stride = Math.max(1, Math.floor(triangles / budget));
  let area = 0;
  for (let t = 0; t < triangles; t += stride) {
    a.fromBufferAttribute(position, at(t * 3)).applyMatrix4(matrix);
    b.fromBufferAttribute(position, at(t * 3 + 1)).applyMatrix4(matrix);
    c.fromBufferAttribute(position, at(t * 3 + 2)).applyMatrix4(matrix);
    area += new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).length() / 2;
  }
  const spacing = Math.max(0.12, Math.sqrt(area / budget));
  for (let t = 0; t < triangles; t += stride) {
    a.fromBufferAttribute(position, at(t * 3)).applyMatrix4(matrix);
    b.fromBufferAttribute(position, at(t * 3 + 1)).applyMatrix4(matrix);
    c.fromBufferAttribute(position, at(t * 3 + 2)).applyMatrix4(matrix);
    const steps = Math.min(400, Math.ceil(Math.max(a.distanceTo(b), a.distanceTo(c), b.distanceTo(c)) / spacing));
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps - i; j++) {
        const u = i / steps;
        const v = j / steps;
        const w = 1 - u - v;
        out.push(a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v, a.z * w + b.z * u + c.z * v);
      }
    }
  }
}

function nearestPoint(field: ReachField, points: readonly number[]): { distance: number; eye: Vec3; target: Vec3 } {
  let best = { distance: Infinity, eye: [0, 0, 0] as Vec3, target: [0, 0, 0] as Vec3 };
  for (let k = 0; k < points.length; k += 3) {
    const point: Vec3 = [points[k]!, points[k + 1]!, points[k + 2]!];
    const seen = nearestEye(field, point);
    if (seen.distance < best.distance) best = { distance: seen.distance, eye: seen.eye, target: point };
  }
  return best;
}

export interface ObjectReach {
  readonly part: ObjectParts;
  readonly distance: number;
  readonly eye: Vec3;
  readonly target: Vec3;
}

export function reachOfParts(parts: readonly ObjectParts[], field: ReachField): ObjectReach[] {
  return parts.map((part) => {
    const points: number[] = [];
    for (const mesh of part.meshes) {
      const matrices = instanceMatrices(mesh);
      const perInstance = Math.max(1, Math.floor(SAMPLE_BUDGET / matrices.length / part.meshes.length));
      for (const matrix of matrices) samplePoints(mesh, matrix, perInstance, points);
    }
    const nearest = nearestPoint(field, points);
    return { part, ...nearest };
  });
}

function factOf(reach: ObjectReach, field: ReachField): SurfaceFact {
  const { part } = reach;
  const first = part.meshes[0]!;
  const material = first.material as THREE.MeshStandardMaterial;
  const note = noteOf(material);
  let colourPerMetre: number | null = null;
  let normalPerMetre: number | null = null;
  let roughnessPerMetre: number | null = null;
  let detailColourPerMetre: number | null = null;
  let detailNormalPerMetre: number | null = null;
  let sagitta = 0;
  let hardCurveShare = 0;
  for (const mesh of part.meshes) {
    const matrices = instanceMatrices(mesh);
    const largestScale = Math.max(...matrices.map(scaleOf));
    const largest = matrices.reduce((p, q) => (scaleOf(q) > scaleOf(p) ? q : p));
    const facets = facetFigures(mesh, largest, field);
    sagitta = Math.max(sagitta, facets.sagitta);
    hardCurveShare = Math.max(hardCurveShare, facets.hardCurveShare);
    const density = uvDensity(mesh, largest);
    const uvPerMetre = part.surfaceClass === "cloth" ? density.middleUvPerMetre : density.uvPerMetre;
    const perMetre = (texture: THREE.Texture | null | undefined) => {
      const size = sizeOf(texture);
      if (size === null || !texture) return null;
      if (note?.perMetre) return (size * note.perMetre) / largestScale;
      return size * uvPerMetre * repeatOf(texture);
    };
    const worse = (known: number | null, value: number | null) => (known === null ? value : value === null ? known : Math.min(known, value));
    colourPerMetre = worse(colourPerMetre, perMetre(material.map));
    normalPerMetre = worse(normalPerMetre, perMetre(material.normalMap));
    roughnessPerMetre = worse(roughnessPerMetre, perMetre(material.roughnessMap));
    if (note?.detail) {
      const scale = Math.sqrt(note.detail.scale[0] * note.detail.scale[1]);
      detailColourPerMetre = worse(detailColourPerMetre, (sizeOf(note.detail.colour) ?? 0) * uvPerMetre * scale);
      detailNormalPerMetre = worse(detailNormalPerMetre, (sizeOf(note.detail.normal) ?? 0) * uvPerMetre * scale);
    }
  }
  const sizes = [material.map, material.normalMap, material.roughnessMap].map(sizeOf).filter((size): size is number => size !== null);
  return {
    label: `${part.auditName} / ${part.label}`,
    surfaceClass: part.surfaceClass,
    colourPerMetre,
    normalPerMetre,
    roughnessPerMetre,
    detailColourPerMetre,
    detailNormalPerMetre,
    smallestMap: sizes.length > 0 ? Math.min(...sizes) : null,
    textHeightMetres: note?.textHeight ?? null,
    reachMetres: reach.distance,
    facetSagittaMetres: sagitta,
    facetsAreReal: note?.realFacets === true,
    hardCurveShare,
  };
}

export function surfaceRows(reaches: readonly ObjectReach[], field: ReachField): SurfaceRow[] {
  return reaches.map((reach) => judgeSurface(factOf(reach, field)));
}

const ID_VERTEX = "#include <common>\nvarying float vFromCamera;\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\nvFromCamera = -mvPosition.z;\n}";
const ID_FRAGMENT = [
  "uniform float objectId;",
  "varying float vFromCamera;",
  "void main() {",
  "float mm = min(vFromCamera * 1000.0, 65535.0);",
  "gl_FragColor = vec4(objectId / 255.0, gl_FrontFacing ? 1.0 : 0.0, floor(mm / 256.0) / 255.0, mod(floor(mm), 256.0) / 255.0);",
  "}",
].join("\n");

export interface TearingScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderColour: () => void;
}

const OFFSET_PER_METRE = 2.5e-4;
const COLOUR_CHANGE_LEVEL = 40;

interface IdFrame {
  readonly data: Uint8Array;
}

const idAt = (frame: IdFrame, i: number) => frame.data[i * 4]!;
const backAt = (frame: IdFrame, i: number) => frame.data[i * 4 + 1]! < 128;
const depthAt = (frame: IdFrame, i: number) => (frame.data[i * 4 + 2]! * 256 + frame.data[i * 4 + 3]!) / 1000;

const SMALLEST_VISIBLE_PIXELS = 400;
const ALTERNATE_EYES = [[2, 0], [-2, 0], [0, 2], [0, -2], [3.5, 3.5], [-3.5, 3.5], [3.5, -3.5], [-3.5, -3.5]] as const;

export function measureTearing(view: TearingScene, reaches: readonly ObjectReach[], environment: readonly THREE.Object3D[], field: ReachField): TearingFigures[] {
  const { renderer, scene, camera, renderColour } = view;
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, samples: 0 });
  const ids = new Map<THREE.Mesh, THREE.ShaderMaterial>();
  const originals = new Map<THREE.Mesh, THREE.Material>();
  const objectIds = new Map<string, number>();
  const pieceIds = new Set<number>();
  const idMaterials = new Map<string, THREE.ShaderMaterial>();
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || environment.includes(node)) return;
    const material = node.material as THREE.Material;
    const owner = reaches.find((reach) => reach.part.meshes.includes(node));
    const key = owner ? `${owner.part.auditName}|${owner.part.label}` : node instanceof THREE.InstancedMesh ? "pieces elsewhere" : "elsewhere";
    if (!objectIds.has(key)) objectIds.set(key, 1 + (objectIds.size % 250));
    if (node instanceof THREE.InstancedMesh) pieceIds.add(objectIds.get(key)!);
    const stateKey = `${key}|${material.polygonOffset ? `${material.polygonOffsetFactor},${material.polygonOffsetUnits}` : "flat"}`;
    let idMaterial = idMaterials.get(stateKey);
    if (!idMaterial) {
      idMaterial = new THREE.ShaderMaterial({ vertexShader: ID_VERTEX, fragmentShader: ID_FRAGMENT, uniforms: { objectId: { value: objectIds.get(key) } }, side: THREE.DoubleSide, blending: THREE.NoBlending, polygonOffset: material.polygonOffset, polygonOffsetFactor: material.polygonOffsetFactor, polygonOffsetUnits: material.polygonOffsetUnits, toneMapped: false });
      idMaterials.set(stateKey, idMaterial);
    }
    ids.set(node, idMaterial);
    originals.set(node, material);
  });
  const hidden = environment.map((object) => [object, object.visible] as const);
  const seeThrough = [...ids.keys()].filter((mesh) => (originals.get(mesh) as THREE.Material).transparent);
  const showIds = (on: boolean, judged: readonly THREE.Mesh[] = []) => {
    for (const [mesh, material] of ids) mesh.material = on ? material : originals.get(mesh)!;
    for (const mesh of seeThrough) mesh.visible = !on || judged.includes(mesh);
    for (const [object, visible] of hidden) object.visible = on ? false : visible;
  };
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const background = scene.background;
  const renderId = (): IdFrame => {
    const data = new Uint8Array(width * height * 4);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, clearAlpha);
    return { data };
  };
  const readColour = (): Uint8Array => {
    renderColour();
    const data = new Uint8Array(width * height * 4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return data;
  };
  const results: TearingFigures[] = [];
  const offset = new THREE.Vector3();
  for (const reach of reaches) {
    const label = `${reach.part.auditName} / ${reach.part.label}`;
    if (!Number.isFinite(reach.distance)) {
      results.push({ label, distance: Infinity, visiblePixels: 0, fightingPercent: 0, colourFlickerPercent: 0, crackPixels: 0, backFacePercent: 0, openWork: false });
      continue;
    }
    const id = objectIds.get(`${reach.part.auditName}|${reach.part.label}`)!;
    const single = reach.part.meshes.every((mesh) => (originals.get(mesh) as THREE.Material).side === THREE.FrontSide);
    const shift = Math.max(reach.distance * OFFSET_PER_METRE, 3e-5) / renderer.getPixelRatio();
    offset.set(shift, shift * 0.6, shift * 0.3);
    showIds(true, reach.part.meshes);
    const place = (eye: Vec3) => {
      camera.position.set(eye[0], eye[1], eye[2]);
      camera.lookAt(reach.target[0], reach.target[1], reach.target[2]);
      camera.updateMatrixWorld();
    };
    const pixelsOf = (frame: IdFrame) => {
      let count = 0;
      for (let i = 0; i < width * height; i++) if (idAt(frame, i) === id) count++;
      return count;
    };
    let eyeUsed: Vec3 = reach.eye;
    place(eyeUsed);
    let a = renderId();
    for (const [dx, dz] of ALTERNATE_EYES) {
      if (pixelsOf(a) >= SMALLEST_VISIBLE_PIXELS) break;
      eyeUsed = nearestEye(field, [reach.eye[0] + dx, reach.eye[1], reach.eye[2] + dz]).eye;
      place(eyeUsed);
      a = renderId();
    }
    camera.position.add(offset);
    camera.updateMatrixWorld();
    const b = renderId();
    showIds(false);
    const colourB = readColour();
    camera.position.sub(offset);
    camera.updateMatrixWorld();
    const colourA = readColour();
    let visible = 0;
    let fight = 0;
    let back = 0;
    let crack = 0;
    let colourChanged = 0;
    let colourJudged = 0;
    const count = width * height;
    for (let i = 0; i < count; i++) {
      const own = idAt(a, i) === id;
      if (own) {
        visible++;
        if (backAt(a, i)) back++;
      }
      const other = idAt(b, i);
      if (own && other !== id) {
        const depthGap = Math.abs(depthAt(a, i) - depthAt(b, i));
        const fromCamera = depthAt(a, i);
        if (other !== 0 && !pieceIds.has(id) && !pieceIds.has(other) && depthGap < Math.max(0.004, (fromCamera * fromCamera) / 25000) && i > width && i < count - width - 1 && i % width > 0 && i % width < width - 1) {
          let ownAfter = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (idAt(b, i + dx + dy * width) === id) ownAfter++;
          if (ownAfter >= 5) fight++;
        }
      }
      const x = i % width;
      const y = Math.floor(i / width);
      if (!own && x > 2 && x < width - 3 && y > 2 && y < height - 3) {
        const flankedAcross = (idAt(a, i - 1) === id || idAt(a, i - 2) === id) && (idAt(a, i + 1) === id || idAt(a, i + 2) === id);
        const flankedDown = (idAt(a, i - width) === id || idAt(a, i - width * 2) === id) && (idAt(a, i + width) === id || idAt(a, i + width * 2) === id);
        if (flankedAcross || flankedDown) {
          const nearSide = idAt(a, i - 1) === id ? i - 1 : idAt(a, i + 1) === id ? i + 1 : idAt(a, i - width) === id ? i - width : i + width;
          if (idAt(a, i) === 0 || depthAt(a, i) > depthAt(a, nearSide) + 0.04) crack++;
        }
      }
      if (own && x > 2 && x < width - 3 && y > 2 && y < height - 3) {
        let inside = true;
        for (let dy = -2; dy <= 2 && inside; dy++) for (let dx = -2; dx <= 2 && inside; dx++) if (idAt(a, i + dx + dy * width) !== id || idAt(b, i + dx + dy * width) !== id) inside = false;
        if (inside) {
          colourJudged++;
          const q = i * 4;
          const tone = (p: Uint8Array) => p[q]! * 0.3 + p[q + 1]! * 0.59 + p[q + 2]! * 0.11;
          if (Math.abs(tone(colourA) - tone(colourB)) > COLOUR_CHANGE_LEVEL) colourChanged++;
        }
      }
    }
    results.push({
      label,
      distance: +reach.distance.toFixed(2),
      visiblePixels: visible,
      fightingPercent: visible ? +((fight / visible) * 100).toFixed(3) : 0,
      colourFlickerPercent: colourJudged ? +((colourChanged / colourJudged) * 100).toFixed(3) : 0,
      crackPixels: crack,
      backFacePercent: visible && single ? +((back / visible) * 100).toFixed(3) : 0,
      openWork: reach.part.meshes.some((mesh) => noteOf(originals.get(mesh) as THREE.Material)?.openWork === true),
    });
  }
  scene.background = background;
  target.dispose();
  for (const material of idMaterials.values()) material.dispose();
  return results;
}
