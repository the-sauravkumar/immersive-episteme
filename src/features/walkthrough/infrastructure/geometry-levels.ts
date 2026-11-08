import * as THREE from "three";
import { coarsestLevel, LEVEL_ERRORS_METRES, nearestDistance, pixelsPerMetre, SCREEN_ERROR_PIXELS, SHADOW_ERROR_TEXELS, SMALLEST_SIMPLIFIED_TRIANGLES, type LevelView } from "../domain/geometry-levels";
import type { LevelAttribute, LevelJob, LevelPart, LevelReply } from "./geometry-levels-worker";
import type { WorkPacer } from "./work-pacer";

interface Levels {
  readonly indices: readonly THREE.BufferAttribute[];
  readonly errors: readonly number[];
}

const SKIPPED_ATTRIBUTES: ReadonlySet<string> = new Set(["position", "uv", "uv1", "tangent"]);
const levelsByGeometry = new WeakMap<THREE.BufferGeometry, Promise<Levels | null>>();
const readyLevels = new WeakMap<THREE.BufferGeometry, Levels>();

export function levelIndicesOf(geometry: THREE.BufferGeometry): readonly THREE.BufferAttribute[] {
  return readyLevels.get(geometry)?.indices.slice(1) ?? [];
}

const viewport = new THREE.Vector4();
const sphere = new THREE.Sphere();

function viewOf(camera: THREE.Camera, viewportHeight: number): LevelView {
  if (camera instanceof THREE.PerspectiveCamera) return { kind: "perspective", verticalFov: THREE.MathUtils.degToRad(camera.getEffectiveFOV()), viewportHeight };
  const ortho = camera as THREE.OrthographicCamera;
  return { kind: "orthographic", frustumHeight: (ortho.top - ortho.bottom) / ortho.zoom, viewportHeight };
}

function levelFor(renderer: THREE.WebGLRenderer, camera: THREE.Camera, mesh: THREE.Mesh, levels: Levels, tolerance: number): THREE.BufferAttribute {
  renderer.getCurrentViewport(viewport);
  if (mesh instanceof THREE.InstancedMesh && mesh.boundingSphere === null) mesh.computeBoundingSphere();
  if (mesh.geometry.boundingSphere === null) mesh.geometry.computeBoundingSphere();
  const bounds = mesh instanceof THREE.InstancedMesh ? mesh.boundingSphere! : mesh.geometry.boundingSphere!;
  sphere.copy(bounds).applyMatrix4(mesh.matrixWorld);
  const eye = camera.matrixWorld.elements;
  const distance = nearestDistance([eye[12]!, eye[13]!, eye[14]!], [sphere.center.x, sphere.center.y, sphere.center.z], sphere.radius);
  const perMetre = pixelsPerMetre(viewOf(camera, viewport.w), distance) * mesh.matrixWorld.getMaxScaleOnAxis();
  return levels.indices[coarsestLevel(levels.errors, perMetre, tolerance)]!;
}

function selectLevelsWhenDrawn(mesh: THREE.Mesh, levels: Levels): void {
  const full = levels.indices[0]!;
  mesh.onBeforeRender = (renderer, _scene, camera, geometry) => {
    geometry.index = levelFor(renderer, camera, mesh, levels, SCREEN_ERROR_PIXELS);
  };
  mesh.onBeforeShadow = (renderer, _object, _camera, shadowCamera, geometry) => {
    geometry.index = levelFor(renderer, shadowCamera, mesh, levels, SHADOW_ERROR_TEXELS);
  };
  mesh.onAfterRender = (_renderer, _scene, _camera, geometry) => {
    geometry.index = full;
  };
  mesh.onAfterShadow = (_renderer, _object, _camera, _shadowCamera, geometry) => {
    geometry.index = full;
  };
}

function ownBuffer<T extends THREE.TypedArray>(array: T): T {
  return array.byteOffset === 0 && array.byteLength === array.buffer.byteLength ? array : (array.slice() as T);
}

function plainValues(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): LevelAttribute {
  if (attribute instanceof THREE.BufferAttribute) return { array: ownBuffer(attribute.array), itemSize: attribute.itemSize, normalized: attribute.normalized };
  const array = new Float32Array(attribute.count * attribute.itemSize);
  for (let v = 0; v < attribute.count; v++) for (let c = 0; c < attribute.itemSize; c++) array[v * attribute.itemSize + c] = attribute.getComponent(v, c);
  return { array, itemSize: attribute.itemSize, normalized: false };
}

const drawnTriangles = (geometry: THREE.BufferGeometry, meshes: readonly THREE.Mesh[]): number => (geometry.index!.count / 3) * meshes.reduce((sum, mesh) => sum + (mesh instanceof THREE.InstancedMesh ? mesh.count : 1), 0);

export class GeometryLevels {
  private worker: Worker | null = null;
  private broken = typeof Worker === "undefined";
  private nextId = 0;
  private readonly waiting = new Map<number, (parts: LevelPart[] | null) => void>();

  constructor(private readonly pacer: WorkPacer) {}

  async attach(root: THREE.Object3D): Promise<void> {
    root.updateWorldMatrix(true, true);
    const users = new Map<THREE.BufferGeometry, THREE.Mesh[]>();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.geometry.index || node.geometry.groups.length > 0 || Array.isArray(node.material)) return;
      const known = users.get(node.geometry);
      if (known) known.push(node);
      else users.set(node.geometry, [node]);
    });
    const surfaces = new Map<THREE.BufferAttribute | THREE.InterleavedBufferAttribute, THREE.BufferGeometry[]>();
    for (const geometry of users.keys()) {
      if (levelsByGeometry.has(geometry)) continue;
      const position = geometry.attributes.position!;
      const known = surfaces.get(position);
      if (known) known.push(geometry);
      else surfaces.set(position, [geometry]);
    }
    for (const parts of surfaces.values()) {
      if (parts.reduce((sum, geometry) => sum + drawnTriangles(geometry, users.get(geometry)!), 0) < SMALLEST_SIMPLIFIED_TRIANGLES) continue;
      const largestScale = Math.max(...parts.flatMap((geometry) => users.get(geometry)!.map((mesh) => mesh.matrixWorld.getMaxScaleOnAxis())));
      await this.pacer.pace();
      const simplified = this.simplify(parts, largestScale);
      parts.forEach((geometry, i) => levelsByGeometry.set(geometry, simplified.then((levels) => levels?.[i] ?? null)));
    }
    for (const [geometry, meshes] of users) {
      const levels = await levelsByGeometry.get(geometry);
      if (!levels || levels.indices.length < 2) continue;
      readyLevels.set(geometry, levels);
      for (const mesh of meshes) selectLevelsWhenDrawn(mesh, levels);
    }
  }

  private async simplify(parts: readonly THREE.BufferGeometry[], largestScale: number): Promise<Levels[] | null> {
    const first = parts[0]!;
    const position = plainValues(first.attributes.position!);
    const attributes = Object.entries(first.attributes)
      .filter(([name]) => !SKIPPED_ATTRIBUTES.has(name))
      .map(([, attribute]) => plainValues(attribute));
    const job: Omit<LevelJob, "id"> = {
      positions: position.array instanceof Float32Array ? position.array : Float32Array.from(position.array),
      attributes,
      parts: parts.map((geometry) => ownBuffer(geometry.index!.array as Uint32Array | Uint16Array)),
      errors: LEVEL_ERRORS_METRES.map((metres) => metres / largestScale),
    };
    const replied = await this.inWorker(job);
    if (!replied) return null;
    return parts.map((geometry, i) => {
      const part = replied[i]!;
      return { indices: [geometry.index!, ...part.indices.map((indices) => new THREE.BufferAttribute(indices, 1))], errors: [0, ...part.errors] };
    });
  }

  private inWorker(job: Omit<LevelJob, "id">): Promise<LevelPart[] | null> {
    const worker = this.running();
    if (!worker) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.waiting.set(id, resolve);
      worker.postMessage({ ...job, id });
    });
  }

  private running(): Worker | null {
    if (this.worker || this.broken) return this.worker;
    try {
      this.worker = new Worker(new URL("./geometry-levels-worker.ts", import.meta.url), { type: "module" });
    } catch {
      this.broken = true;
      return null;
    }
    this.worker.onmessage = (event: MessageEvent<LevelReply>) => {
      const resolve = this.waiting.get(event.data.id);
      if (!resolve) return;
      this.waiting.delete(event.data.id);
      resolve("parts" in event.data ? event.data.parts : null);
    };
    this.worker.onerror = () => this.close();
    return this.worker;
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    this.broken = true;
    for (const resolve of this.waiting.values()) resolve(null);
    this.waiting.clear();
  }
}
