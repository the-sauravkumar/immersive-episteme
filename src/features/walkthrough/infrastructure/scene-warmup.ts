import * as THREE from "three";
import { texturesOf } from "./material-library";
import { MAIN_TARGET_OPTIONS } from "./render-view";
import type { WorkPacer } from "./work-pacer";

const STRIP_ROWS = 128;
const WARM_TARGET_SIZE = 64;
const FIRST_DRAW_BATCH = 4;
const LARGEST_DRAW_BATCH = 64;
const WARM_DRAW_VERTICES = 3;
const UPLOAD_BYTES_PER_SLICE = 4 * 1024 * 1024;
const LOADING_UPLOAD_BYTES_PER_SLICE = 2 * 1024 * 1024;
const CARRIERS_PER_SLICE = 96;

type Drawn = THREE.Mesh | THREE.Points | THREE.Line;

const shadowSide: Readonly<Record<THREE.Side, THREE.Side>> = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };

function materialsOf(node: Drawn): THREE.Material[] {
  return Array.isArray(node.material) ? node.material : [node.material];
}

function everyTextureOf(material: THREE.Material): THREE.Texture[] {
  const found = new Set<THREE.Texture>(texturesOf(material));
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) found.add(value);
  if (material instanceof THREE.ShaderMaterial) for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) found.add(uniform.value);
  return [...found];
}

function stripsFit(texture: THREE.Texture): boolean {
  const image = texture.image as { width?: number; height?: number } | null;
  const drawable = typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap ? true : typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement ? true : typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement;
  return drawable && !texture.isRenderTargetTexture && !(texture as THREE.CubeTexture).isCubeTexture && !(texture as THREE.DataTexture).isDataTexture && !(texture as THREE.CompressedTexture).isCompressedTexture && (image?.height ?? 0) > STRIP_ROWS;
}

function shadowDepthOf(material: THREE.Material): THREE.MeshDepthMaterial {
  const source = material as THREE.MeshStandardMaterial;
  const depth = new THREE.MeshDepthMaterial();
  depth.side = material.shadowSide ?? shadowSide[material.side];
  depth.alphaMap = source.alphaMap ?? null;
  depth.alphaTest = material.alphaToCoverage ? 0.5 : material.alphaTest;
  depth.map = source.map ?? null;
  depth.displacementMap = source.displacementMap ?? null;
  depth.displacementScale = source.displacementScale ?? 1;
  depth.displacementBias = source.displacementBias ?? 0;
  depth.clipShadows = material.clipShadows;
  depth.clippingPlanes = material.clippingPlanes;
  depth.clipIntersection = material.clipIntersection;
  return depth;
}

function shadowStandIn(node: THREE.Mesh, material: THREE.Material): THREE.Mesh {
  if (node instanceof THREE.InstancedMesh) {
    const standIn = new THREE.InstancedMesh(node.geometry, material, 1);
    if (node.instanceColor) standIn.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
    return standIn;
  }
  return new THREE.Mesh(node.geometry, material);
}

function shadowLikeTarget(): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(WARM_TARGET_SIZE, WARM_TARGET_SIZE);
  const depth = new THREE.DepthTexture(WARM_TARGET_SIZE, WARM_TARGET_SIZE, THREE.UnsignedIntType);
  depth.format = THREE.DepthFormat;
  depth.compareFunction = THREE.LessEqualCompare;
  depth.minFilter = THREE.LinearFilter;
  depth.magFilter = THREE.LinearFilter;
  target.depthTexture = depth;
  return target;
}

export class SceneWarmup {
  private readonly uploaded = new WeakSet<THREE.Texture>();
  private readonly released = new WeakSet<THREE.TextureSource<unknown>>();
  private readonly shadowStandIns = new Map<THREE.Object3D, { readonly materials: THREE.Material[]; readonly instanced: THREE.InstancedMesh[] }>();
  private readonly target = new THREE.WebGLRenderTarget(WARM_TARGET_SIZE, WARM_TARGET_SIZE, MAIN_TARGET_OPTIONS);
  private readonly shadowTarget = shadowLikeTarget();
  private readonly sentBuffers = new WeakSet<THREE.BufferAttribute>();
  private readonly carrierScene = new THREE.Scene();
  private readonly carrierMaterial = new THREE.MeshBasicMaterial();
  private stripBytes = 0;
  private readonly usedPrograms = new WeakSet<object>();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly pacer: WorkPacer,
    private readonly cancelled: () => boolean,
  ) {}

  async ready(group: THREE.Object3D): Promise<void> {
    await this.uploadTextures(group);
    if (this.cancelled()) return;
    await this.uploadBuffers(group);
    if (this.cancelled()) return;
    const standIns = this.shadowStandInsOf(group);
    await this.compilePrograms(group, standIns);
    if (this.cancelled()) return;
    await this.drawOnce(group, this.target, true);
    if (this.cancelled()) return;
    await this.drawOnce(standIns, this.shadowTarget, false);
  }

  release(group: THREE.Object3D): void {
    const standIns = this.shadowStandIns.get(group);
    if (!standIns) return;
    for (const material of standIns.materials) material.dispose();
    for (const standIn of standIns.instanced) standIn.dispose();
    this.shadowStandIns.delete(group);
  }

  private drawnIn(group: THREE.Object3D): Drawn[] {
    const drawn: Drawn[] = [];
    group.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line) drawn.push(node);
    });
    return drawn;
  }

  private gap(): Promise<void> {
    this.stripBytes = 0;
    return this.pacer.walking ? this.pacer.yieldSlice() : this.pacer.pace();
  }

  private onCard(texture: THREE.Texture): boolean {
    return (this.renderer.properties.get(texture) as { __webglInit?: boolean }).__webglInit === true;
  }

  private async uploadTextures(group: THREE.Object3D): Promise<void> {
    const textures = new Set<THREE.Texture>();
    for (const node of this.drawnIn(group)) for (const material of materialsOf(node)) for (const texture of everyTextureOf(material)) if (!this.uploaded.has(texture) && !this.onCard(texture)) textures.add(texture);
    for (const texture of textures) {
      this.uploaded.add(texture);
      await this.gap();
      if (this.cancelled()) return;
      if (!stripsFit(texture)) this.renderer.initTexture(texture);
      else if (!this.allocatedAnew(texture)) continue;
      else if (await this.uploadByCarrier(texture)) this.releasePixels(texture);
    }
  }

  private allocatedAnew(texture: THREE.Texture): boolean {
    const before = this.renderer.info.memory.textures;
    const ready = texture.source.dataReady;
    texture.source.dataReady = false;
    this.renderer.initTexture(texture);
    texture.source.dataReady = ready;
    const anew = this.renderer.info.memory.textures > before;
    if (anew && this.released.has(texture.source)) throw new Error(`The pixels of texture "${texture.name}" were released after upload, and a second sampler state now needs them`);
    return anew;
  }

  private levelsOf(texture: THREE.Texture): readonly TexImageSource[] {
    return (texture.mipmaps.length > 0 ? texture.mipmaps : [texture.image]) as unknown as readonly TexImageSource[];
  }

  private releasePixels(texture: THREE.Texture): void {
    texture.source.dataReady = false;
    this.released.add(texture.source);
    for (const image of this.levelsOf(texture)) {
      if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
      else if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) {
        image.width = 1;
        image.height = 1;
      }
    }
  }

  private async uploadByCarrier(texture: THREE.Texture): Promise<boolean> {
    const levels = this.levelsOf(texture);
    const mipmapped = texture.generateMipmaps;
    texture.generateMipmaps = false;
    const region = new THREE.Box2();
    const at = new THREE.Vector2();
    for (const [level, image] of levels.entries()) {
      const { width, height } = image as { width: number; height: number };
      const carrier = new THREE.Texture(image);
      for (let top = 0; top < height; top += STRIP_ROWS) {
        const bottom = Math.min(height, top + STRIP_ROWS);
        const bytes = width * (bottom - top) * 4;
        if (this.stripBytes > 0 && (this.pacer.walking || this.stripBytes + bytes > LOADING_UPLOAD_BYTES_PER_SLICE)) {
          this.stripBytes = 0;
          await this.pacer.yieldSlice();
        }
        if (this.cancelled()) {
          texture.generateMipmaps = mipmapped;
          return false;
        }
        this.stripBytes += bytes;
        if (level === 0 && bottom === height) texture.generateMipmaps = mipmapped;
        region.min.set(0, top);
        region.max.set(width, bottom);
        at.set(0, top);
        this.renderer.copyTextureToTexture(carrier, texture, region, at, 0, level);
      }
    }
    return true;
  }

  private async uploadBuffers(group: THREE.Object3D): Promise<void> {
    const geometries = new Set<THREE.BufferGeometry>();
    for (const node of this.drawnIn(group)) geometries.add(node.geometry);
    let sliceBytes = 0;
    for (const geometry of geometries) {
      const carriers: THREE.BufferGeometry[] = [];
      for (const buffer of [geometry.index, ...Object.values(geometry.attributes)]) {
        if (!(buffer instanceof THREE.BufferAttribute) || this.sentBuffers.has(buffer)) continue;
        const bytes = buffer.array.byteLength;
        if (this.carrierScene.children.length >= CARRIERS_PER_SLICE || (sliceBytes > 0 && sliceBytes + bytes > UPLOAD_BYTES_PER_SLICE)) {
          this.send();
          sliceBytes = 0;
          await this.pacer.yieldSlice();
          if (this.cancelled()) return;
        }
        this.sentBuffers.add(buffer);
        sliceBytes += bytes;
        const carrier = new THREE.BufferGeometry();
        if (buffer === geometry.index) carrier.setIndex(buffer);
        else carrier.setAttribute("carried", buffer);
        carrier.setDrawRange(0, 0);
        const mesh = new THREE.Mesh(carrier, this.carrierMaterial);
        mesh.frustumCulled = false;
        this.carrierScene.add(mesh);
        carriers.push(carrier);
      }
      if (carriers.length > 0) geometry.addEventListener("dispose", () => carriers.forEach((carrier) => carrier.dispose()));
    }
    this.send();
  }

  private send(): void {
    if (this.carrierScene.children.length === 0) return;
    const shadowsDue = this.renderer.shadowMap.needsUpdate;
    this.renderer.shadowMap.needsUpdate = false;
    const restore = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.carrierScene, this.camera);
    this.renderer.setRenderTarget(restore);
    this.renderer.shadowMap.needsUpdate = shadowsDue;
    this.carrierScene.clear();
  }

  private shadowStandInsOf(group: THREE.Object3D): THREE.Group {
    const standIns = new THREE.Group();
    const materials: THREE.Material[] = [];
    const instanced: THREE.InstancedMesh[] = [];
    for (const node of this.drawnIn(group)) {
      if (!(node instanceof THREE.Mesh) || !node.castShadow) continue;
      for (const material of materialsOf(node)) {
        const depth = node.customDepthMaterial ?? shadowDepthOf(material);
        if (!node.customDepthMaterial) materials.push(depth);
        const standIn = shadowStandIn(node, depth);
        if (standIn instanceof THREE.InstancedMesh) instanced.push(standIn);
        standIns.add(standIn);
      }
    }
    this.shadowStandIns.set(group, { materials, instanced });
    return standIns;
  }

  private lightsOf(foggy: boolean): THREE.Scene {
    const lit = new THREE.Scene();
    lit.environment = this.scene.environment;
    lit.environmentRotation.copy(this.scene.environmentRotation);
    lit.fog = foggy ? this.scene.fog : null;
    this.scene.traverseVisible((node) => {
      if (node instanceof THREE.Light) lit.add(node.clone(false));
    });
    return lit;
  }

  private async compilePrograms(group: THREE.Object3D, standIns: THREE.Group): Promise<void> {
    const compiling: Promise<unknown>[] = [];
    for (const [root, foggy] of [[group, true], [standIns, false]] as const) {
      const lit = this.lightsOf(foggy);
      for (const node of this.drawnIn(root)) {
        await this.pacer.pace();
        if (this.cancelled()) return;
        const restore = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.target);
        compiling.push(this.renderer.compileAsync(node, this.camera, lit));
        this.renderer.setRenderTarget(restore);
      }
    }
    await Promise.all(compiling);
  }

  private async drawOnce(group: THREE.Object3D, target: THREE.WebGLRenderTarget, foggy: boolean): Promise<void> {
    const drawn = this.drawnIn(group);
    let batch = FIRST_DRAW_BATCH;
    for (let start = 0; start < drawn.length; ) {
      await this.gap();
      if (this.cancelled()) return;
      const began = performance.now();
      const taken = this.batchFrom(drawn, start, batch);
      this.drawBatch(group, taken, target, foggy);
      for (const node of taken) for (const program of this.programsOf(node)) this.usedPrograms.add(program);
      start += taken.length;
      const eachMs = Math.max(0.05, (performance.now() - began) / taken.length);
      batch = Math.max(1, Math.min(LARGEST_DRAW_BATCH, batch * 2, Math.floor(this.pacer.sliceMs / 2 / eachMs)));
    }
  }

  private programsOf(node: Drawn): object[] {
    return materialsOf(node).flatMap((material) => {
      const program = (this.renderer.properties.get(material) as { currentProgram?: object }).currentProgram;
      return program ? [program] : [];
    });
  }

  private batchFrom(drawn: readonly Drawn[], start: number, batch: number): Drawn[] {
    const taken: Drawn[] = [];
    let fresh = false;
    for (let i = start; i < drawn.length && taken.length < batch; i++) {
      const unseen = this.programsOf(drawn[i]!).some((program) => !this.usedPrograms.has(program));
      if (unseen && fresh) break;
      fresh ||= unseen;
      taken.push(drawn[i]!);
    }
    return taken;
  }

  private drawBatch(group: THREE.Object3D, batch: readonly Drawn[], target: THREE.WebGLRenderTarget, foggy: boolean): void {
    const shown = new Set<THREE.Object3D>();
    for (const node of batch) for (let up: THREE.Object3D | null = node; up && up !== group; up = up.parent) shown.add(up);
    const changed: [THREE.Object3D, boolean, boolean][] = [];
    for (const node of this.drawnIn(group)) {
      changed.push([node, node.visible, node.frustumCulled]);
      node.visible = shown.has(node) && node.visible;
      node.frustumCulled = false;
    }
    const ranges = new Map<THREE.BufferGeometry, number>();
    const instances: [THREE.InstancedMesh, number][] = [];
    for (const node of batch) {
      if (!ranges.has(node.geometry)) {
        ranges.set(node.geometry, node.geometry.drawRange.count);
        node.geometry.drawRange.count = Math.min(node.geometry.drawRange.count, WARM_DRAW_VERTICES);
      }
      if (node instanceof THREE.InstancedMesh) {
        instances.push([node, node.count]);
        node.count = Math.min(node.count, 1);
      }
    }
    const hidden = this.scene.children.filter((child) => child.visible && !(child instanceof THREE.Light));
    for (const child of hidden) child.visible = false;
    const parent = group.parent;
    this.scene.add(group);
    const shadowsDue = this.renderer.shadowMap.needsUpdate;
    this.renderer.shadowMap.needsUpdate = false;
    const fog = this.scene.fog;
    if (!foggy) this.scene.fog = null;
    const restore = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(restore);
    this.scene.fog = fog;
    this.renderer.shadowMap.needsUpdate = shadowsDue;
    if (parent) parent.add(group);
    else this.scene.remove(group);
    for (const child of hidden) child.visible = true;
    for (const [node, visible, culled] of changed) {
      node.visible = visible;
      node.frustumCulled = culled;
    }
    for (const [geometry, count] of ranges) geometry.drawRange.count = count;
    for (const [node, count] of instances) node.count = count;
  }
}
