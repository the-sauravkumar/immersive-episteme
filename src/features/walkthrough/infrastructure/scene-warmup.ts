import * as THREE from "three";
import { texturesOf } from "./material-library";
import { MAIN_TARGET_OPTIONS } from "./render-view";
import type { WorkPacer } from "./work-pacer";

const STRIP_ROWS = 128;
const WARM_TARGET_SIZE = 64;
const FIRST_DRAW_BATCH = 4;
const LARGEST_DRAW_BATCH = 64;

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
  private readonly shadowStandIns = new Map<THREE.Object3D, THREE.Material[]>();
  private readonly target = new THREE.WebGLRenderTarget(WARM_TARGET_SIZE, WARM_TARGET_SIZE, MAIN_TARGET_OPTIONS);
  private readonly shadowTarget = shadowLikeTarget();

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
    const standIns = this.shadowStandInsOf(group);
    await this.compilePrograms(group, standIns);
    if (this.cancelled()) return;
    await this.drawOnce(group, this.target, true);
    if (this.cancelled()) return;
    await this.drawOnce(standIns, this.shadowTarget, false);
  }

  release(group: THREE.Object3D): void {
    for (const material of this.shadowStandIns.get(group) ?? []) material.dispose();
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
    const { width, height } = texture.image as { width: number; height: number };
    const mipmapped = texture.generateMipmaps;
    texture.source.dataReady = false;
    this.renderer.initTexture(texture);
    texture.source.dataReady = true;
    texture.generateMipmaps = false;
    const region = new THREE.Box2();
    const at = new THREE.Vector2();
    for (let top = 0; top < height; top += STRIP_ROWS) {
      if (top > 0) await this.pacer.yieldSlice();
      if (this.cancelled()) {
        texture.generateMipmaps = mipmapped;
        return;
      }
      const bottom = Math.min(height, top + STRIP_ROWS);
      if (bottom === height) texture.generateMipmaps = mipmapped;
      region.min.set(0, top);
      region.max.set(width, bottom);
      at.set(0, top);
      this.renderer.copyTextureToTexture(texture, texture, region, at);
    }
  }

  private shadowStandInsOf(group: THREE.Object3D): THREE.Group {
    const standIns = new THREE.Group();
    const depthMaterials: THREE.Material[] = [];
    for (const node of this.drawnIn(group)) {
      if (!(node instanceof THREE.Mesh) || !node.castShadow) continue;
      for (const material of materialsOf(node)) {
        const depth = node.customDepthMaterial ?? shadowDepthOf(material);
        if (!node.customDepthMaterial) depthMaterials.push(depth);
        standIns.add(shadowStandIn(node, depth));
      }
    }
    this.shadowStandIns.set(group, depthMaterials);
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
