import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

const ROOT = "/walkthrough";

export interface ScanSpec {
  readonly id: string;
  readonly tileMetres: number;
}

export const SCANS = {
  earth: { id: "red_laterite_soil_stones", tileMetres: 2 },
  brick: { id: "large_red_bricks", tileMetres: 2 },
  lime: { id: "painted_plaster_wall", tileMetres: 2 },
  timber: { id: "weathered_brown_planks", tileMetres: 1.8 },
  table: { id: "wood_table_worn", tileMetres: 0.55 },
  weave: { id: "rough_linen", tileMetres: 0.27 },
} as const satisfies Record<string, ScanSpec>;

export type ScanName = keyof typeof SCANS;

export interface ScanTextures {
  readonly colour: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly roughness: THREE.Texture;
  readonly tileMetres: number;
}

function preventTiling(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\nvec3 mean = textureLod(map, vMapUv, 12.0).rgb;\nfloat meanTone = max(dot(mean, vec3(0.33)), 0.02);\nfloat toneA = dot(textureLod(map, vMapUv * 0.137 + vec2(0.31, 0.17), 5.0).rgb, vec3(0.33));\nfloat toneB = dot(textureLod(map, vMapUv.yx * 0.0531, 4.0).rgb, vec3(0.33));\ndiffuseColor.rgb *= clamp(mix(1.0, (toneA + toneB) / (2.0 * meanTone), 0.7), 0.72, 1.28);",
    );
  };
}

export class MaterialLibrary {
  private readonly textures = new THREE.TextureLoader();
  private readonly bitmaps = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  private readonly models = new GLTFLoader();
  private readonly scans = new Map<ScanName, ScanTextures>();
  private readonly scenes = new Map<string, THREE.Object3D>();
  private readonly kept = new WeakSet<object>();
  private readonly anisotropy: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  }

  private async decoded(path: string): Promise<THREE.Texture> {
    const bitmap = await this.bitmaps.loadAsync(path);
    const texture = new THREE.Texture(bitmap);
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private async map(path: string, srgb: boolean): Promise<THREE.Texture> {
    const texture = await this.decoded(path);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    return texture;
  }

  async scan(name: ScanName): Promise<ScanTextures> {
    const known = this.scans.get(name);
    if (known) return known;
    const spec = SCANS[name];
    const base = `${ROOT}/tex/${spec.id}`;
    const [colour, normal, roughness] = await Promise.all([this.map(`${base}/diff.jpg`, true), this.map(`${base}/nor.jpg`, false), this.map(`${base}/rough.jpg`, false)]);
    for (const texture of [colour, normal, roughness]) this.kept.add(texture);
    const loaded = { colour, normal, roughness, tileMetres: spec.tileMetres };
    this.scans.set(name, loaded);
    return loaded;
  }

  keep(resource: object): void {
    this.kept.add(resource);
  }

  keeps(resource: object): boolean {
    return this.kept.has(resource);
  }

  async surface(name: ScanName, options: { tint?: readonly [number, number, number] | number; normalScale?: number; antiTile?: boolean; repeat?: readonly [number, number] } = {}): Promise<THREE.MeshStandardMaterial> {
    const scan = await this.scan(name);
    const material = new THREE.MeshStandardMaterial({
      map: scan.colour,
      normalMap: scan.normal,
      roughnessMap: scan.roughness,
      roughness: 1,
      metalness: 0,
      normalScale: new THREE.Vector2(options.normalScale ?? 1, options.normalScale ?? 1),
      envMapIntensity: 0.55,
    });
    if (Array.isArray(options.tint)) material.color.setRGB(options.tint[0]!, options.tint[1]!, options.tint[2]!);
    else if (typeof options.tint === "number") material.color.set(options.tint);
    if (options.antiTile) preventTiling(material);
    return material;
  }

  async clothMaterial(file: string, options: { wet?: boolean; tint?: number; metresPerRepeat?: number; width?: number } = {}): Promise<THREE.MeshStandardMaterial> {
    const colour = await this.map(file, true);
    colour.wrapS = colour.wrapT = THREE.MirroredRepeatWrapping;
    const weave = await this.scan("weave");
    const normal = weave.normal.clone();
    normal.repeat.set((options.metresPerRepeat ?? 3.46) / weave.tileMetres, (options.width ?? 1.5) / weave.tileMetres);
    normal.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map: colour,
      color: options.tint ?? 0xffffff,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: options.wet ? 0.82 : 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.22,
    });
  }

  async rawCottonMaterial(): Promise<THREE.MeshStandardMaterial> {
    const weave = await this.scan("weave");
    const colour = await this.map(`${ROOT}/tex/raw_cotton/diff.jpg`, true);
    const normal = weave.normal.clone();
    const roughness = weave.roughness.clone();
    for (const texture of [colour, normal, roughness]) {
      texture.repeat.set(3.46 / weave.tileMetres, 1.5 / weave.tileMetres);
      texture.needsUpdate = true;
    }
    return new THREE.MeshStandardMaterial({ map: colour, normalMap: normal, roughnessMap: roughness, roughness: 1, color: 0xffffff, side: THREE.DoubleSide, envMapIntensity: 0.12 });
  }

  async photo(file: string): Promise<THREE.Texture> {
    const texture = await this.decoded(file);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.anisotropy;
    return texture;
  }

  async model(scanId: string): Promise<THREE.Object3D> {
    const known = this.scenes.get(scanId);
    if (known) return known.clone(true);
    const gltf = await this.models.loadAsync(`${ROOT}/models/${scanId}/${scanId}_2k.gltf`);
    gltf.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        const material = node.material as THREE.MeshStandardMaterial;
        this.kept.add(node.geometry);
        this.kept.add(material);
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture) {
            texture.anisotropy = this.anisotropy;
            this.kept.add(texture);
          }
        }
      }
    });
    this.scenes.set(scanId, gltf.scene);
    return gltf.scene.clone(true);
  }

  async sky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Promise<THREE.Mesh> {
    const [dome, environment] = await Promise.all([this.textures.loadAsync(`${ROOT}/sky/dome.jpg`), new HDRLoader().loadAsync(`${ROOT}/sky/env.hdr`)]);
    dome.colorSpace = THREE.SRGBColorSpace;
    dome.mapping = THREE.EquirectangularReflectionMapping;
    environment.mapping = THREE.EquirectangularReflectionMapping;
    const generator = new THREE.PMREMGenerator(renderer);
    scene.environment = generator.fromEquirectangular(environment).texture;
    scene.environmentIntensity = 0.62;
    generator.dispose();
    environment.dispose();
    dome.wrapS = THREE.RepeatWrapping;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.MeshBasicMaterial({ map: dome, side: THREE.BackSide, fog: false, depthWrite: false }));
    mesh.renderOrder = -10;
    scene.add(mesh);
    return mesh;
  }
}
