import * as THREE from "three";
import { texturesOf } from "./material-library";
import { MAIN_TARGET_OPTIONS } from "./render-view";
import type { WorkPacer } from "./work-pacer";

const STRIP_ROWS = 128;
const WARM_TARGET_SIZE = 64;
const FIRST_DRAW_BATCH = 4;
const LARGEST_DRAW_BATCH = 64;
const UPLOAD_BYTES_PER_SLICE = 4 * 1024 * 1024;
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
  private readonly shadowStandIns = new Map<THREE.Object3D, { readonly materials: THREE.Material[]; readonly instanced: THREE.InstancedMesh[] }>();
  private readonly target = new THREE.WebGLRenderTarget(WARM_TARGET_SIZE, WARM_TARGET_SIZE, MAIN_TARGET_OPTIONS);
  private readonly shadowTarget = shadowLikeTarget();
  private readonly sentBuffers = new WeakSet<THREE.BufferAttribute>();
  private readonly carrierScene = new THREE.Scene();
  private readonly carrierMaterial = new THREE.MeshBasicMaterial();

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
      if (this.pacer.walking && stripsFit(texture)) await this.uploadInStrips(texture);
      else this.renderer.initTexture(texture);
    }
  }

  private async uploadInStrips(texture: THREE.Texture): Promise<void> {
    const levels = (texture.mipmaps.length > 0 ? texture.mipmaps : [texture.image]) as unknown as readonly TexImageSource[];
    const mipmapped = texture.generateMipmaps;
    texture.source.dataReady = false;
    this.renderer.initTexture(texture);
    texture.source.dataReady = true;
    texture.generateMipmaps = false;
    const region = new THREE.Box2();
    const at = new THREE.Vector2();
    for (const [level, image] of levels.entries()) {
      const { width, height } = image as { width: number; height: number };
      const carrier = new THREE.Texture(image);
      for (let top = 0; top < height; top += STRIP_ROWS) {
        if (top > 0 || level > 0) await this.pacer.yieldSlice();
        if (this.cancelled()) {
          texture.generateMipmaps = mipmapped;
          return;
        }
        const bottom = Math.min(height, top + STRIP_ROWS);
        if (level === 0 && bottom === height) texture.generateMipmaps = mipmapped;
        region.min.set(0, top);
        region.max.set(width, bottom);
        at.set(0, top);
        this.renderer.copyTextureToTexture(carrier, texture, region, at, 0, level);
      }
    }
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

  private async compilePrograms(group: THREE.Object3D, standIns: THREE.Group): Promise<void> {
    const restore = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    const lit = this.renderer.compileAsync(group, this.camera, this.scene);
    const fog = this.scene.fog;
    this.scene.fog = null;
    const shadowed = this.renderer.compileAsync(standIns, this.camera, this.scene);
    this.scene.fog = fog;
    this.renderer.setRenderTarget(restore);
    await Promise.all([lit, shadowed]);
  }

  private async drawOnce(group: THREE.Object3D, target: THREE.WebGLRenderTarget, foggy: boolean): Promise<void> {
    const drawn = this.drawnIn(group);
    let batch = FIRST_DRAW_BATCH;
    for (let start = 0; start < drawn.length; ) {
      await this.gap();
      if (this.cancelled()) return;
      const began = performance.now();
      const taken = drawn.slice(start, start + batch);
      this.drawBatch(group, taken, target, foggy);
      start += taken.length;
      const eachMs = Math.max(0.05, (performance.now() - began) / taken.length);
      batch = Math.max(1, Math.min(LARGEST_DRAW_BATCH, batch * 2, Math.floor(this.pacer.sliceMs / 2 / eachMs)));
    }
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
  }
}
