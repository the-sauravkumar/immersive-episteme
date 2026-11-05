import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import type { SurfaceClass } from "../domain/surface-density";
import { phongTessellate } from "./smooth-tessellate";

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
  bamboo: { id: "bamboo_veneer", tileMetres: 0.6 },
  firedClay: { id: "fired_clay", tileMetres: 0.36 },
  copper: { id: "Metal008", tileMetres: 1 },
  steel: { id: "metal_plate_02", tileMetres: 0.5 },
  dryMud: { id: "brown_mud_dry", tileMetres: 0.65 },
  wetMud: { id: "brown_mud", tileMetres: 0.65 },
  bark: { id: "bark_willow", tileMetres: 0.28 },
  camelSkin: { id: "camel_dung_skin", tileMetres: 0.34 },
  cowCrust: { id: "cow_dung_crust", tileMetres: 0.5 },
  madderBark: { id: "madder_root_bark", tileMetres: 0.23 },
  fruitSkin: { id: "myrobalan_skin", tileMetres: 0.2 },
  leafBlade: { id: "dry_leaf_blade", tileMetres: 0.24 },
  flour: { id: "macro_flour", tileMetres: 0.3 },
  sawdust: { id: "wood_chips_003", tileMetres: 0.4 },
} as const satisfies Record<string, ScanSpec>;

export type ScanName = keyof typeof SCANS;

export interface ScanTextures {
  readonly colour: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly roughness: THREE.Texture;
  readonly tileMetres: number;
}

const ANTI_TILE = "#include <map_fragment>\nvec3 mean = textureLod(map, vMapUv, 12.0).rgb;\nfloat meanTone = max(dot(mean, vec3(0.33)), 0.02);\nfloat toneA = dot(textureLod(map, vMapUv * 0.137 + vec2(0.31, 0.17), 5.0).rgb, vec3(0.33));\nfloat toneB = dot(textureLod(map, vMapUv.yx * 0.0531, 4.0).rgb, vec3(0.33));\ndiffuseColor.rgb *= clamp(mix(1.0, (toneA + toneB) / (2.0 * meanTone), 0.7), 0.72, 1.28);";

const farPrint = (bias: number, nearBias: number) => ["#ifdef USE_MAP", `vec4 sampledDiffuseColor = texture2D(map, vMapUv, mix(${nearBias.toFixed(1)}, ${bias.toFixed(1)}, smoothstep(1.4, 5.0, length(vViewPosition))));`, "diffuseColor *= sampledDiffuseColor;", "#endif"].join("\n");
const SCAN_PRINT_BIAS = 0.7;
const CLOTH_PRINT_BIAS = 1.5;
const CLOTH_NEAR_PRINT_BIAS = 0.25;
const FAR_WEAVE = ["#include <normal_fragment_maps>", "#ifdef USE_NORMALMAP_TANGENTSPACE", "normal = normalize(tbn * ((texture2D(normalMap, vNormalMapUv, 1.2).xyz * 2.0 - 1.0) * vec3(normalScale, 1.0)));", "#endif"].join("\n");

const DETAIL_UNIFORMS = "uniform sampler2D detailMap;\nuniform sampler2D detailNormal;\nuniform vec2 detailScale;\nuniform float detailTone;\nuniform float detailRelief;\n";
const DETAIL_COLOUR = [
  "#include <map_fragment>",
  "float detailFade = 1.0 - smoothstep(1.5, 6.0, length(vViewPosition));",
  "vec2 detailUv = vMapUv * detailScale;",
  "vec2 detailDx = dFdx(detailUv);",
  "vec2 detailDy = dFdy(detailUv);",
  "if (detailFade > 0.0) {",
  "  float detailValue = dot(textureGrad(detailMap, detailUv, detailDx, detailDy).rgb, vec3(0.33)) / max(dot(textureLod(detailMap, vec2(0.5), 12.0).rgb, vec3(0.33)), 0.02);",
  "  diffuseColor.rgb *= clamp(mix(1.0, detailValue, detailTone * detailFade), 0.6, 1.4);",
  "}",
].join("\n");
const DETAIL_NORMAL = [
  "#include <normal_fragment_maps>",
  "#ifdef USE_NORMALMAP_TANGENTSPACE",
  "if (detailFade > 0.0) {",
  "  vec2 detailBump = textureGrad(detailNormal, detailUv, detailDx, detailDy).xy * 2.0 - 1.0;",
  "  normal = normalize(normal + tbn * vec3(detailBump * detailRelief * detailFade, 0.0));",
  "}",
  "#endif",
].join("\n");

export interface FineDetail {
  readonly colour: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly scale: readonly [number, number];
  readonly tone: number;
  readonly relief: number;
}

export function softenWhenFar<T extends THREE.Material>(material: T, antiTile = false, detail: FineDetail | null = null, printBias = SCAN_PRINT_BIAS, nearPrintBias = printBias): T {
  material.onBeforeCompile = (shader) => {
    let fragment = shader.fragmentShader;
    if (detail) {
      shader.uniforms.detailMap = { value: detail.colour };
      shader.uniforms.detailNormal = { value: detail.normal };
      shader.uniforms.detailScale = { value: new THREE.Vector2(detail.scale[0], detail.scale[1]) };
      shader.uniforms.detailTone = { value: detail.tone };
      shader.uniforms.detailRelief = { value: detail.relief };
      fragment = DETAIL_UNIFORMS + fragment.replace("#include <map_fragment>", DETAIL_COLOUR).replace("#include <normal_fragment_maps>", DETAIL_NORMAL);
    }
    if (antiTile) fragment = fragment.replace("#include <map_fragment>", ANTI_TILE);
    shader.fragmentShader = fragment.replace("#include <map_fragment>", farPrint(printBias, nearPrintBias)).replace("#include <normal_fragment_maps>", FAR_WEAVE);
  };
  material.customProgramCacheKey = () => `far${antiTile ? "-anti-tile" : ""}${detail ? "-detail" : ""}-${printBias}-${nearPrintBias}`;
  return material;
}

const SEEN_THROUGH_BATH_VERTEX = "#include <project_vertex>\nvBathAt = (modelMatrix * vec4(transformed, 1.0)).xyz;";
const BATH_SHAPES = [
  "varying vec3 vBathAt;",
  "uniform float bathLevel;",
  "uniform float bathBodyDepth;",
  "uniform vec3 bathBody;",
  "uniform float bathFrom;",
  "uniform float bathBlend;",
  "uniform sampler2D bathEarlierMap;",
  "uniform vec2 bathEarlierRepeat;",
  "uniform float bathWetRise;",
  "float bathWet = 0.0;",
  "float bathHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }",
  "float bathNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(bathHash(i), bathHash(i + vec2(1.0, 0.0)), f.x), mix(bathHash(i + vec2(0.0, 1.0)), bathHash(i + vec2(1.0, 1.0)), f.x), f.y); }",
].join("\n");
const SEEN_THROUGH_BATH_COLOUR = [
  "#include <color_fragment>",
  "if (bathFrom > 0.0) {",
  "  vec3 bathEarlier = texture2D(bathEarlierMap, vMapUv * bathEarlierRepeat).rgb;",
  "  diffuseColor.rgb = mix(bathEarlier, diffuseColor.rgb, smoothstep(bathFrom, bathFrom + bathBlend, vMapUv.x));",
  "}",
  "float bathBelow = bathLevel - vBathAt.y;",
  "vec2 bathAlong = vBathAt.xz + vBathAt.y * 0.7;",
  "float bathWick = bathWetRise * (0.4 + 0.75 * bathNoise(bathAlong * 7.0) + 0.35 * bathNoise(bathAlong * 31.0));",
  "bathWet = bathBelow > 0.0 ? 1.0 : 1.0 - smoothstep(bathWick * 0.3, bathWick, -bathBelow);",
  "diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(mix(1.0, BATH_WET_SATURATE, bathWet))) * mix(1.0, BATH_WET_TONE, bathWet);",
  "diffuseColor.rgb *= 1.0 - 0.45 * exp(-abs(bathBelow) / 0.005);",
  "float bathSink = bathBodyDepth > 0.0 ? smoothstep(-0.01, bathBodyDepth, bathBelow) : 0.0;",
  "diffuseColor.rgb = mix(diffuseColor.rgb, bathBody, bathSink);",
].join("\n");
const SEEN_THROUGH_BATH_ROUGH = "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, BATH_WET_ROUGH, bathWet);";
const THIN_CLOTH_GLOW = [
  "#if NUM_DIR_LIGHTS > 0",
  "reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * directionalLights[0].color * max(-dot(normal, directionalLights[0].direction), 0.0) * BATH_THIN_CLOTH_GLOW * (1.0 - bathSink);",
  "#endif",
  "#include <aomap_fragment>",
].join("\n");
const SEEN_THROUGH_BATH_NORMAL = "#include <emissivemap_fragment>\nnormal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), bathSink * bathSink));";

export interface BathContact {
  readonly level: number;
  readonly bodyDepth: number;
  readonly body: THREE.Color;
  readonly wetRise: number;
  readonly earlier: THREE.Texture | null;
  readonly earlierRepeat: readonly [number, number];
  readonly joinAlong: Float32Array | null;
}

const JOIN_BLEND_REPEATS = 0.34;
const WET_TONE = 0.7;
const WET_SATURATE = 1.3;
const WET_ROUGH = 0.62;
const WET_CLOTH_SKY_LIGHT = 0.44;
const THIN_CLOTH_GLOW_SHARE = 0.42;

export function dipInBath<T extends THREE.Material>(material: T, contact: BathContact): T {
  const earlierCompile = material.onBeforeCompile;
  const earlierKey = material.customProgramCacheKey.bind(material);
  const joinFrom = contact.joinAlong ? contact.joinAlong[contact.joinAlong.length >> 1]! : 0;
  material.onBeforeCompile = (shader, renderer) => {
    earlierCompile.call(material, shader, renderer);
    shader.uniforms.bathLevel = { value: contact.level };
    shader.uniforms.bathBodyDepth = { value: contact.bodyDepth };
    shader.uniforms.bathBody = { value: contact.body };
    shader.uniforms.bathWetRise = { value: contact.wetRise };
    shader.uniforms.bathFrom = { value: contact.earlier ? joinFrom : 0 };
    shader.uniforms.bathBlend = { value: JOIN_BLEND_REPEATS };
    shader.uniforms.bathEarlierMap = { value: contact.earlier };
    shader.uniforms.bathEarlierRepeat = { value: new THREE.Vector2(contact.earlierRepeat[0], contact.earlierRepeat[1]) };
    shader.vertexShader = `varying vec3 vBathAt;\n${shader.vertexShader.replace("#include <project_vertex>", SEEN_THROUGH_BATH_VERTEX)}`;
    shader.fragmentShader = `#define BATH_WET_TONE ${WET_TONE.toFixed(2)}\n#define BATH_WET_SATURATE ${WET_SATURATE.toFixed(2)}\n#define BATH_WET_ROUGH ${WET_ROUGH.toFixed(2)}\n#define BATH_THIN_CLOTH_GLOW ${THIN_CLOTH_GLOW_SHARE.toFixed(2)}\n${BATH_SHAPES}\n${shader.fragmentShader.replace("#include <color_fragment>", SEEN_THROUGH_BATH_COLOUR).replace("#include <roughnessmap_fragment>", SEEN_THROUGH_BATH_ROUGH).replace("#include <emissivemap_fragment>", SEEN_THROUGH_BATH_NORMAL).replace("#include <aomap_fragment>", THIN_CLOTH_GLOW)}`;
  };
  if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = WET_CLOTH_SKY_LIGHT;
  material.customProgramCacheKey = () => `${earlierKey()}-in-bath`;
  return material;
}

export interface SurfaceNote {
  readonly label: string;
  readonly kind: SurfaceClass;
  readonly perMetre?: number;
  readonly detail?: { readonly colour: THREE.Texture; readonly normal: THREE.Texture; readonly scale: readonly [number, number] };
  readonly textHeight?: number;
  readonly openWork?: boolean;
  readonly realFacets?: boolean;
}

export function noteSurface<T extends THREE.Material>(material: T, note: SurfaceNote): T {
  material.userData.surface = note;
  return material;
}

export function texturesOf(material: THREE.Material): THREE.Texture[] {
  const standard = material as THREE.MeshStandardMaterial;
  const note = material.userData.surface as SurfaceNote | undefined;
  return [standard.map, standard.normalMap, standard.roughnessMap, note?.detail?.colour, note?.detail?.normal].filter((texture): texture is THREE.Texture => texture instanceof THREE.Texture);
}

interface FineScan {
  readonly scan: ScanName;
  readonly tileMetres: number;
  readonly tone: number;
  readonly relief: number;
}

const FINE_SCANS: Partial<Record<ScanName, FineScan>> = {
  earth: { scan: "earth", tileMetres: 0.31, tone: 0.42, relief: 0.6 },
  brick: { scan: "dryMud", tileMetres: 0.37, tone: 0.34, relief: 0.75 },
  lime: { scan: "lime", tileMetres: 0.37, tone: 0.3, relief: 0.4 },
  timber: { scan: "table", tileMetres: 0.47, tone: 0.42, relief: 0.6 },
};

const SURFACE_KINDS: Partial<Record<ScanName, SurfaceClass>> = { earth: "ground", brick: "wall", lime: "wall" };

const MODEL_FINE_SCANS: Readonly<Record<string, FineScan>> = {
  wooden_crate_01: { scan: "table", tileMetres: 0.47, tone: 0.4, relief: 0.6 },
  wicker_basket_01: { scan: "bamboo", tileMetres: 0.47, tone: 0.3, relief: 0.5 },
};

const CLOTH_SKY_LIGHT = 0.26;
const OPEN_WORK_MODELS: ReadonlySet<string> = new Set(["wicker_basket_01", "wooden_crate_01"]);

function medianUvPerMetre(geometry: THREE.BufferGeometry): number {
  const position = geometry.attributes.position!;
  const uv = geometry.attributes.uv!;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ratios: number[] = [];
  for (let t = 0; t + 2 < count; t += 3) {
    const [i0, i1, i2] = [at(t), at(t + 1), at(t + 2)];
    a.fromBufferAttribute(position, i0);
    b.fromBufferAttribute(position, i1);
    c.fromBufferAttribute(position, i2);
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    if (area < 1e-10) continue;
    const uvArea = Math.abs((uv.getX(i1) - uv.getX(i0)) * (uv.getY(i2) - uv.getY(i0)) - (uv.getX(i2) - uv.getX(i0)) * (uv.getY(i1) - uv.getY(i0))) / 2;
    ratios.push(Math.sqrt(uvArea / area));
  }
  ratios.sort((p, q) => p - q);
  return ratios[ratios.length >> 1] ?? 1;
}

const OPEN_SKY_TURN_RADIANS = -1.8;
const SUN_SOFT_KNEE = 3.5;

function softenSun(sky: THREE.DataTexture): void {
  const values = sky.image.data as unknown as Uint16Array;
  const { fromHalfFloat, toHalfFloat } = THREE.DataUtils;
  for (let i = 0; i < values.length; i += 4) {
    const red = fromHalfFloat(values[i]!);
    const green = fromHalfFloat(values[i + 1]!);
    const blue = fromHalfFloat(values[i + 2]!);
    const brightest = Math.max(red, green, blue);
    if (brightest <= SUN_SOFT_KNEE * 0.5) continue;
    const scale = SUN_SOFT_KNEE / (SUN_SOFT_KNEE + brightest - SUN_SOFT_KNEE * 0.5) ;
    values[i] = toHalfFloat(red * scale);
    values[i + 1] = toHalfFloat(green * scale);
    values[i + 2] = toHalfFloat(blue * scale);
  }
}

export class MaterialLibrary {
  private readonly textures = new THREE.TextureLoader();
  private readonly bitmaps = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  private readonly models = new GLTFLoader();
  private readonly scans = new Map<ScanName, Promise<ScanTextures>>();
  private readonly scenes = new Map<string, Promise<THREE.Object3D>>();
  private readonly sharedResources = new Map<string, Promise<object>>();
  private readonly kept = new WeakSet<object>();
  private readonly anisotropy: number;
  private openSky: THREE.Texture | null = null;

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
    const loading = this.loadScan(name);
    this.scans.set(name, loading);
    loading.catch(() => this.scans.delete(name));
    return loading;
  }

  private async loadScan(name: ScanName): Promise<ScanTextures> {
    const spec = SCANS[name];
    const base = `${ROOT}/tex/${spec.id}`;
    const [colour, normal, roughness] = await Promise.all([this.map(`${base}/diff.jpg`, true), this.map(`${base}/nor.jpg`, false), this.map(`${base}/rough.jpg`, false)]);
    for (const texture of [colour, normal, roughness]) this.kept.add(texture);
    return { colour, normal, roughness, tileMetres: spec.tileMetres };
  }

  keep(resource: object): void {
    this.kept.add(resource);
  }

  shared<T extends object>(key: string, build: () => Promise<T>): Promise<T> {
    const known = this.sharedResources.get(key) as Promise<T> | undefined;
    if (known) return known;
    const loading = build().then((resource) => {
      this.kept.add(resource);
      return resource;
    });
    this.sharedResources.set(key, loading);
    loading.catch(() => this.sharedResources.delete(key));
    return loading;
  }

  keeps(resource: object): boolean {
    return this.kept.has(resource);
  }

  async surface(name: ScanName, options: { tint?: readonly [number, number, number] | number; normalScale?: number; antiTile?: boolean; fine?: FineScan | null } = {}): Promise<THREE.MeshStandardMaterial> {
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
    const fine = options.fine ?? FINE_SCANS[name] ?? null;
    if (!fine) {
      noteSurface(material, { label: name, kind: SURFACE_KINDS[name] ?? "model" });
      return softenWhenFar(material, options.antiTile ?? false);
    }
    const fineScan = await this.scan(fine.scan);
    const ratio = scan.tileMetres / fine.tileMetres;
    noteSurface(material, { label: name, kind: SURFACE_KINDS[name] ?? "model", detail: { colour: fineScan.colour, normal: fineScan.normal, scale: [ratio, ratio] } });
    return softenWhenFar(material, options.antiTile ?? false, { colour: fineScan.colour, normal: fineScan.normal, scale: [ratio, ratio], tone: fine.tone, relief: fine.relief });
  }

  async clothMaterial(file: string, options: { wet?: boolean; tint?: number; metresPerRepeat?: number; width?: number } = {}): Promise<THREE.MeshStandardMaterial> {
    const colour = await this.map(file, true);
    colour.wrapS = colour.wrapT = THREE.MirroredRepeatWrapping;
    const weave = await this.scan("weave");
    const normal = weave.normal.clone();
    const scale: readonly [number, number] = [(options.metresPerRepeat ?? 3.46) / weave.tileMetres, (options.width ?? 1.5) / weave.tileMetres];
    normal.repeat.set(scale[0], scale[1]);
    normal.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      map: colour,
      color: options.tint ?? 0xffffff,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: options.wet ? 0.82 : 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: CLOTH_SKY_LIGHT,
    });
    noteSurface(material, { label: "cloth state", kind: "cloth", detail: { colour: weave.colour, normal: weave.normal, scale } });
    return softenWhenFar(material, false, { colour: weave.colour, normal: weave.normal, scale, tone: 0.32, relief: 0 }, CLOTH_PRINT_BIAS, CLOTH_NEAR_PRINT_BIAS);
  }

  async textileMaterial(file: string, widthMetres: number, heightMetres: number): Promise<THREE.MeshStandardMaterial> {
    const [photo, weave] = await Promise.all([this.photo(file), this.scan("weave")]);
    const normal = weave.normal.clone();
    normal.repeat.set(widthMetres / weave.tileMetres, heightMetres / weave.tileMetres);
    normal.needsUpdate = true;
    const scale: readonly [number, number] = [widthMetres / weave.tileMetres, heightMetres / weave.tileMetres];
    const material = new THREE.MeshStandardMaterial({ map: photo, normalMap: normal, normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.55 });
    noteSurface(material, { label: `printed textile ${file.split("/").pop()}`, kind: "printed-textile", detail: { colour: weave.colour, normal: weave.normal, scale } });
    return softenWhenFar(material, false, { colour: weave.colour, normal: weave.normal, scale, tone: 0.3, relief: 0.7 }, 0);
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
    return noteSurface(softenWhenFar(new THREE.MeshStandardMaterial({ map: colour, normalMap: normal, roughnessMap: roughness, roughness: 1, color: 0xffffff, side: THREE.DoubleSide, envMapIntensity: CLOTH_SKY_LIGHT })), { label: "raw cotton", kind: "cloth" });
  }

  async photo(file: string): Promise<THREE.Texture> {
    const texture = await this.decoded(file);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.anisotropy;
    return texture;
  }

  async model(scanId: string): Promise<THREE.Object3D> {
    let loading = this.scenes.get(scanId);
    if (!loading) {
      loading = this.loadModel(scanId);
      this.scenes.set(scanId, loading);
      loading.catch(() => this.scenes.delete(scanId));
    }
    return (await loading).clone(true);
  }

  private async loadModel(scanId: string): Promise<THREE.Object3D> {
    const gltf = await this.models.loadAsync(`${ROOT}/models/${scanId}/${scanId}_2k.gltf`);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) meshes.push(node);
    });
    for (const node of meshes) {
      if (MODEL_FINE_SCANS[scanId]) {
        const refined = phongTessellate(node.geometry as THREE.BufferGeometry);
        (node.geometry as THREE.BufferGeometry).dispose();
        node.geometry = refined;
      }
      node.castShadow = true;
      node.receiveShadow = true;
      const material = node.material as THREE.MeshStandardMaterial;
      const fine = MODEL_FINE_SCANS[scanId];
      const openWork = OPEN_WORK_MODELS.has(scanId);
      if (fine) {
        const fineScan = await this.scan(fine.scan);
        const ratio = 1 / (fine.tileMetres * medianUvPerMetre(node.geometry as THREE.BufferGeometry));
        noteSurface(softenWhenFar(material, false, { colour: fineScan.colour, normal: fineScan.normal, scale: [ratio, ratio], tone: fine.tone, relief: fine.relief }), { label: `model ${scanId}`, kind: "model", openWork, detail: { colour: fineScan.colour, normal: fineScan.normal, scale: [ratio, ratio] } });
      } else {
        noteSurface(softenWhenFar(material), { label: `model ${scanId}`, kind: "model", openWork });
      }
      this.kept.add(node.geometry);
      this.kept.add(material);
      for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
        if (texture) {
          texture.anisotropy = this.anisotropy;
          this.kept.add(texture);
        }
      }
    }
    return gltf.scene;
  }

  reflectOpenSky(material: THREE.MeshStandardMaterial): void {
    if (!this.openSky) return;
    material.envMap = this.openSky;
    material.envMapRotation.set(0, OPEN_SKY_TURN_RADIANS, 0);
  }

  async sky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Promise<THREE.Mesh> {
    const [dome, environment] = await Promise.all([this.textures.loadAsync(`${ROOT}/sky/dome.jpg`), new HDRLoader().loadAsync(`${ROOT}/sky/env.hdr`)]);
    dome.colorSpace = THREE.SRGBColorSpace;
    dome.mapping = THREE.EquirectangularReflectionMapping;
    environment.mapping = THREE.EquirectangularReflectionMapping;
    const generator = new THREE.PMREMGenerator(renderer);
    scene.environment = generator.fromEquirectangular(environment).texture;
    scene.environmentIntensity = 0.62;
    softenSun(environment);
    environment.needsUpdate = true;
    this.openSky = generator.fromEquirectangular(environment).texture;
    this.kept.add(this.openSky);
    generator.dispose();
    environment.dispose();
    dome.wrapS = THREE.RepeatWrapping;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.MeshBasicMaterial({ map: dome, side: THREE.BackSide, fog: false, depthWrite: false }));
    mesh.renderOrder = -10;
    scene.add(mesh);
    return mesh;
  }
}
