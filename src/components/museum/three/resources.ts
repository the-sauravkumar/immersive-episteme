/**
 * Shared render resources: KTX2 architecture textures (one set for every tier, §2d), baked
 * ambient-occlusion maps, PBR materials and the fixed lighting rig.
 *
 * Material values adapted from virtual-walkthrough src/museum/materials/materials.ts:148-181 and
 * lighting values from src/museum/config/lighting.ts (design-reuse catalogue §4.3). Lighting is
 * the same in every zone (C2 cross-zone luminance); no light casts dynamic shadows; contact
 * shading comes from AO baked from the manifest geometry (bakeFloorAo) instead.
 */
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { Rect, Vec3 } from "@/features/spatial/compiler/types";

/** The study build's fixed render configuration (C7 asserts the live renderer equals this). */
export const STUDY_RENDER_CONFIG = {
  outputColorSpace: "srgb",
  toneMapping: "neutral",
  /** Fixed exposure for every participant of a study build. */
  exposure: 1.0,
  /** The only post-processing: anti-aliasing (accumulation at rest, SMAA) and the output (tone map + sRGB). */
  postprocessing: ["taa-accumulate", "output", "smaa"],
  shadows: false,
  cameraNear: 0.05,
  cameraFar: 150,
} as const;

export interface TextureIndexEntry {
  url: string;
  width: number;
  height: number;
  levels: number;
  colorSpace: "srgb" | "linear";
  bytes: number;
  sha256: string;
}
export interface TextureIndex {
  resolution: string;
  encoder: string;
  textures: Record<"wall" | "floor", { tileMetres: number; maps: Record<"color" | "normal" | "orm", TextureIndexEntry> }>;
}

export interface TextureSet {
  color: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
}

export interface LoadedTextures {
  wall: TextureSet;
  floor: TextureSet;
  /** What was loaded (C12: identical on every tier). */
  manifest: { url: string; width: number; height: number; levels: number; format: number }[];
  bytes: number;
}

let ktx2: KTX2Loader | null = null;

export function ktx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath("/museum/basis/").detectSupport(renderer);
  return ktx2;
}

export function disposeKtx2Loader() {
  ktx2?.dispose();
  ktx2 = null;
}

/** Loads the architecture textures; reports progress in bytes (loading indicator). */
export async function loadArchitectureTextures(renderer: THREE.WebGLRenderer, onProgress: (loadedBytes: number, totalBytes: number) => void): Promise<LoadedTextures> {
  const res = await fetch("/museum/textures/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`texture index: HTTP ${res.status}`);
  const index = (await res.json()) as TextureIndex;
  const loader = ktx2Loader(renderer);
  const entries = (["wall", "floor"] as const).flatMap((set) => (["color", "normal", "orm"] as const).map((role) => ({ set, role, e: index.textures[set].maps[role], tile: index.textures[set].tileMetres })));
  const total = entries.reduce((s, x) => s + x.e.bytes, 0);
  let done = 0;
  onProgress(0, total);
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const loaded = await Promise.all(
    entries.map(async (x) => {
      const tex = await loader.loadAsync(x.e.url);
      done += x.e.bytes;
      onProgress(done, total);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / x.tile, 1 / x.tile);
      tex.anisotropy = anisotropy;
      tex.colorSpace = x.e.colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.name = `${x.set}-${x.role}`;
      tex.userData.url = x.e.url;
      tex.needsUpdate = true;
      const img = tex.image as { width: number; height: number };
      if (img.width !== x.e.width || img.height !== x.e.height) throw new Error(`${x.e.url}: loaded ${img.width}x${img.height}, index says ${x.e.width}x${x.e.height}`);
      return { ...x, tex };
    }),
  );
  const pick = (set: "wall" | "floor", role: "color" | "normal" | "orm") => loaded.find((l) => l.set === set && l.role === role)!.tex;
  return {
    wall: { color: pick("wall", "color"), normal: pick("wall", "normal"), orm: pick("wall", "orm") },
    floor: { color: pick("floor", "color"), normal: pick("floor", "normal"), orm: pick("floor", "orm") },
    manifest: loaded.map((l) => ({
      url: l.e.url,
      width: (l.tex.image as { width: number }).width,
      height: (l.tex.image as { height: number }).height,
      levels: (l.tex as THREE.CompressedTexture).mipmaps?.length ?? 1,
      format: l.tex.format as number,
    })),
    bytes: total,
  };
}

// ---------------------------------------------------------------------------------------
// Baked ambient occlusion
// ---------------------------------------------------------------------------------------

/** Vertical AO profile for walls, posts, plinths and linings (u ignored, v = y / height). */
export function wallAoTexture(height: number): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * height;
    const ao = (1 - 0.32 * Math.exp(-y / 0.16)) * (1 - 0.14 * Math.exp(-(height - y) / 0.22));
    const v = Math.round(255 * ao);
    data.set([v, v, v, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, 1, n, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.name = "ao-wall";
  t.needsUpdate = true;
  return t;
}

/**
 * Floor (or ceiling) AO for one room, baked from the manifest boxes standing on it: each texel
 * is darkened by its distance to every nearby wall, post and plinth footprint. Deterministic:
 * a function of the manifest geometry only.
 */
export function bakeRoomAo(rect: Rect, boxes: readonly { min: Vec3; max: Vec3 }[], opts: { strength: number; falloff: number; texelsPerMetre: number }): THREE.DataTexture {
  const w = Math.max(8, Math.min(512, Math.round((rect.maxX - rect.minX) * opts.texelsPerMetre)));
  const h = Math.max(8, Math.min(512, Math.round((rect.maxZ - rect.minZ) * opts.texelsPerMetre)));
  const data = new Uint8Array(w * h * 4);
  const near = boxes.filter((b) => b.max[0] > rect.minX - 1 && b.min[0] < rect.maxX + 1 && b.max[2] > rect.minZ - 1 && b.min[2] < rect.maxZ + 1);
  for (let j = 0; j < h; j++) {
    // Row 0 of a DataTexture is v = 0, which uv1 maps to the room's max z edge (see geometry aoUv).
    const z = rect.maxZ - ((j + 0.5) / h) * (rect.maxZ - rect.minZ);
    for (let i = 0; i < w; i++) {
      const x = rect.minX + ((i + 0.5) / w) * (rect.maxX - rect.minX);
      let ao = 1;
      for (const b of near) {
        const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
        const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
        ao *= 1 - opts.strength * Math.exp(-Math.hypot(dx, dz) / opts.falloff);
      }
      const v = Math.round(255 * Math.max(0.5, ao));
      data.set([v, v, v, 255], (j * w + i) * 4);
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------

/**
 * Scene colours. Plate paper and ink are the study tokens `--ground` (#F5F1E8) and `--ink`
 * (#211D19) of DESIGN.md 4.2, so wall plates and room plaques are "ink on #F5F1E8" (11.6), the
 * same paper and ink as the knowledge sheet. Design interpretations; not measured or historical
 * dye colours.
 */
export const PALETTE = {
  paper: "#f5f1e8",
  ink: "#211d19",
  /**
   * Selection frame and floor route: the study's single interactive accent `--indigo` (DESIGN.md
   * 4.2, 12.2 rule 5), not a warm brand colour, so the scene's cues use the same accent as the panel.
   */
  brand: "#24406e",
  plinth: "#f1eee8",
  trim: "#3a332c",
  ceilingTint: "#ffffff",
} as const;

export interface Materials {
  wall: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  plinth: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  /** The same card without lettering (rooms whose lettering is not resident). */
  panelBlank: THREE.MeshStandardMaterial;
  highlight: THREE.MeshBasicMaterial;
  route: THREE.MeshStandardMaterial;
  wallAo: THREE.DataTexture;
  all: THREE.Material[];
}

function aoChannel(t: THREE.Texture) {
  t.channel = 1;
  return t;
}

/**
 * Label light: the constant emissive share of the paper colour on wall plates and room plaques (and
 * their unlettered stand-ins, so lettering residency never changes a card's brightness).
 */
export const LABEL_LIGHT = 0.28;

/**
 * Matte print (P26, DESIGN.md 11.6). Lettering is ink printed on paper, so labels take no specular
 * light: with the standard material's gloss, a plaque that faces a room light or the environment at
 * the viewing angle gets a veil of reflected light added equally to paper and ink, which lowered its
 * contrast at the 2.5 m signage distance to 4.16-4.53:1 (the plaques of the brightly lit Tradition
 * Context rooms), below WCAG 1.4.3 for two study traditions and above it for the third: a 3D-only
 * difference in how legible each tradition's signage is. A brighter label light made it worse
 * (3.96-4.36:1), because the ink brightens with the light while the paper is already compressed by
 * the tone mapping. Removing the specular terms keeps the diffuse and emissive light unchanged.
 */
const MATTE_PRINT = "#include <aomap_fragment>\n  reflectedLight.directSpecular = vec3( 0.0 );\n  reflectedLight.indirectSpecular = vec3( 0.0 );";

/**
 * Panel material: the atlas is a single-channel coverage mask (R8); the shader mixes paper and
 * ink by it, so text costs 1 byte per texel and stays fully lit by the same PBR lighting.
 * Create one per atlas page with this function: Material.clone() does not copy onBeforeCompile.
 */
export function panelMaterial(): THREE.MeshStandardMaterial {
  // Label lighting: the card is lit as if by its own picture light (a constant emissive share of
  // the paper colour), so the lettering reads equally well on every wall orientation.
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88, metalness: 0, name: "panel", emissive: "#ffffff", emissiveIntensity: LABEL_LIGHT });
  const paper = new THREE.Color(PALETTE.paper);
  const ink = new THREE.Color(PALETTE.ink);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaper = { value: paper };
    shader.uniforms.uInk = { value: ink };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uPaper;\nuniform vec3 uInk;")
      .replace("#include <map_fragment>", "#ifdef USE_MAP\n  float coverage = texture2D( map, vMapUv ).r;\n  diffuseColor.rgb *= mix( uPaper, uInk, coverage );\n#endif")
      // The label light scales with the lettered colour (ink stays dark).
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#ifdef USE_MAP\n  totalEmissiveRadiance *= diffuseColor.rgb;\n#endif")
      .replace("#include <aomap_fragment>", MATTE_PRINT);
  };
  m.customProgramCacheKey = () => "ie-panel-mask-v2-matte";
  return m;
}

/** The unlettered card: the same paper, label light and matte print as a lettered one. */
function panelBlankMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ name: "panel-blank", color: PALETTE.paper, roughness: 0.88, metalness: 0, emissive: PALETTE.paper, emissiveIntensity: LABEL_LIGHT });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <aomap_fragment>", MATTE_PRINT);
  };
  m.customProgramCacheKey = () => "ie-panel-blank-v2-matte";
  return m;
}

export function createMaterials(tex: LoadedTextures, wallHeight: number): Materials {
  const wallAo = wallAoTexture(wallHeight);
  const wall = new THREE.MeshStandardMaterial({
    name: "wall",
    map: tex.wall.color,
    normalMap: tex.wall.normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: tex.wall.orm,
    metalnessMap: tex.wall.orm,
    roughness: 1,
    metalness: 0,
    aoMap: aoChannel(wallAo),
    aoMapIntensity: 1,
    envMapIntensity: 0.6,
  });
  // Ceilings and floors get a per-room AO map (bakeRoomAo): these are templates cloned per room.
  const ceiling = new THREE.MeshStandardMaterial({
    name: "ceiling",
    map: tex.wall.color,
    normalMap: tex.wall.normal,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughnessMap: tex.wall.orm,
    metalnessMap: tex.wall.orm,
    roughness: 1,
    metalness: 0,
    color: PALETTE.ceilingTint,
    // Light reflected up from the lit floor and walls (a constant, baked bounce term): without it
    // a ceiling only sees the hemisphere's ground colour and reads as a dark brown lid.
    emissive: "#8f8a82",
    emissiveIntensity: 1,
    aoMap: aoChannel(wallAo),
    envMapIntensity: 0.6,
  });
  const floor = new THREE.MeshStandardMaterial({
    name: "floor",
    map: tex.floor.color,
    normalMap: tex.floor.normal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughnessMap: tex.floor.orm,
    metalnessMap: tex.floor.orm,
    roughness: 1,
    metalness: 0,
    aoMap: aoChannel(wallAo),
    envMapIntensity: 0.8,
  });
  const plinth = new THREE.MeshStandardMaterial({ name: "plinth", color: PALETTE.plinth, roughness: 0.7, metalness: 0, aoMap: aoChannel(wallAo), envMapIntensity: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ name: "trim", color: PALETTE.trim, roughness: 0.55, metalness: 0, aoMap: aoChannel(wallAo), envMapIntensity: 0.6 });
  const panel = panelMaterial();
  const panelBlank = panelBlankMaterial();
  const highlight = new THREE.MeshBasicMaterial({ name: "highlight", color: PALETTE.brand, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const route = new THREE.MeshStandardMaterial({ name: "route", color: PALETTE.brand, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return { wall, ceiling, floor, plinth, trim, panel, panelBlank, highlight, route, wallAo, all: [wall, ceiling, floor, plinth, trim, panel, panelBlank, highlight, route] };
}

/** A per-room clone of a floor/ceiling template using that room's baked AO. Shares the program. */
export function withRoomAo(template: THREE.MeshStandardMaterial, ao: THREE.Texture): THREE.MeshStandardMaterial {
  const m = template.clone();
  ao.channel = 1;
  m.aoMap = ao;
  return m;
}

// ---------------------------------------------------------------------------------------
// Lighting: identical everywhere, no dynamic shadows.
// ---------------------------------------------------------------------------------------

export function createLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const env = pmrem.fromScene(envScene, 0.04).texture;
  envScene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.8;
  scene.background = new THREE.Color("#d9d3c8");
  const hemi = new THREE.HemisphereLight("#e9eef2", "#d2b692", 1.0);
  const key = new THREE.DirectionalLight("#fff1e0", 1.2);
  key.position.set(-0.45, 1, 0.3);
  key.castShadow = false;
  scene.add(hemi, key);
  return () => {
    scene.remove(hemi, key);
    scene.environment = null;
    env.dispose();
  };
}
