/**
 * Shared render resources and the gallery finish (DR-023; DESIGN-v2 §11, F1 to F11).
 *
 * The finish is ONE parameter set (`GALLERY_FINISH`) with no zone, tradition or room key, so every
 * wing is finished identically. Architecture is unlit: each surface is its colour map times a
 * baked irradiance term, so nothing about a room's light depends on where it is or which way it
 * faces at run time:
 *  - walls, posts, lintels, reveals and plinths: one shared vertical wall-wash profile (a lightmap
 *    on uv1, brighter towards the ceiling cove, flat across the card band, darker at the skirting),
 *    times a fixed per-face shading baked into the vertex colours;
 *  - floors and ceilings: one lightmap per room (contact shading from the walls and plinths, the
 *    cove's up-light on the ceiling), each normalised to the same mean.
 * This replaces the PBR materials, the hemisphere and key lights and the environment map (the X2
 * correction: a lightmap only adds irradiance, and three.js has no per-material light exclusion).
 * It drops the wall and floor normal and roughness detail, an accepted cost recorded in the module
 * record; only the two colour maps are downloaded.
 *
 * Plates, plaques and signs are display-referred: white paper and black ink that bypass the tone
 * mapping (`toneMapped: false` in intent). The frame pipeline renders into a linear target and tone
 * maps the whole frame in its OutputPass, where a material's `toneMapped` flag has no effect, so the
 * label materials write alpha 0 and the pipeline's OutputPass leaves those pixels unmapped
 * (`pipeline.ts`). The paper renders at sRGB 255 and the ink at 0 on every wall.
 *
 * Every target below is a rendered (display) value. `preToneMap` inverts the Neutral tone mapping
 * (three 0.186.1 `NeutralToneMapping`, exposure 1), so a target is reached exactly by construction
 * and then checked on the rendered frame (C2, C2b).
 */
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

import type { Rect, Vec3 } from "@/features/spatial/compiler/types";

import { runInBootWorker } from "./ktx2-worker";

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

// ---------------------------------------------------------------------------------------
// The finish: one parameter set for the whole museum (no zone, tradition or room key).
// ---------------------------------------------------------------------------------------

/**
 * Gallery finish (DR-023). Rendered sRGB values are 8-bit display values of a neutral grey, measured
 * on the frame by the rendering checks. Sizes are metres.
 */
export const GALLERY_FINISH = {
  /** F1: lit wall in the card band (1.55 to 2.25 m), neutral. Inside gallery3d's 200 to 210. */
  wallSrgb: 205,
  /** F1b: matte floor mean, at most 0.3 x the wall luminance (here 0.21 x; Smithsonian contrast 79%). */
  floorSrgb: 100,
  /** Floor colour-map detail kept (0 = flat, 1 = the map's own contrast): grain that reads, no high-contrast plank lines. */
  floorDetail: 0.7,
  /**
   * Floor hue kept (0 = neutral grey, 1 = the map's own chroma), mixed back in around the same
   * luminance (`chromaGain`): a muted oak (CIELAB C* 4 to 9, b* > 0), not grey vinyl. Walls and
   * ceilings stay neutral (DR-023: no warm cast on the walls).
   */
  floorChroma: 0.3,
  /** Ceiling mean (F4), a step under the washed walls, so the cove band reads as the source. */
  ceilingSrgb: 188,
  /** Plinth body: the same plaster, a step lighter than the wall so the stand reads as an object. */
  plinthSrgb: 226,
  /** F6 shadow-gap skirting and F8 plinth toe: rendered sRGB 35 to 45. */
  shadowSrgb: 40,
  /** F7 door edge colour (rendered as given: 5.79 to 6.40:1 against walls of 200 to 210). */
  doorEdge: "#3f454c",
  /** F7 reveal: the lining face into the opening, a plaster step under the wall, so the opening reads as a deep reveal and not a cut. */
  revealSrgb: 182,
  /** F7 threshold: a stone sill across the wall thickness, lighter than the floor (0.5 x the wall's linear luminance), under the 20 mm edge in weight. */
  thresholdSrgb: 150,
  /** F5 cove slot surface: below 0.8 linear after exposure, so it never clips (C2). */
  coveLinear: 0.72,
  /** F5: 150 mm ceiling cove, recessed `rise` above the ceiling plane. */
  cove: { width: 0.15, rise: 0.08 },
  /** F6: 25 mm high, 15 mm deep shadow gap at the foot of every wall and post. */
  skirting: { height: 0.025, depth: 0.015 },
  /** F7: 20 mm flush edge round every opening (replaces the proud dark linings). */
  doorEdgeWidth: 0.02,
  /** F8: 30 mm high, 20 mm inset recessed toe under every plinth. */
  plinthToe: { height: 0.03, inset: 0.02 },
  /**
   * F8b reading stand (DR-045, stand-mounted plates): a 40 mm plaster board, overhanging the plate by
   * the compiler's standBoardMargin, on a 360 x 240 mm pedestal set behind it on the F8 toe. The
   * same plaster and tint as a plinth; one size for every exhibit, wing and room.
   */
  readingStand: { boardDepth: 0.04, pedestalWidth: 0.36, pedestalDepth: 0.24 },
  /**
   * F3 wall wash (a fraction of the card-band level): contact darkening at the skirting, flat
   * (within ±3%) across the card band, brighter towards the cove. Visible falloff (DR-047, number to
   * confirm at merge): rendered 176.8 at 0.05 m, 190.6 at 0.3 m, 205 at 1.9 m, 215.8 at 3.1 m.
   */
  wash: { floor: 0.7, floorFalloff: 0.4, cove: 0.16, coveFalloff: 0.3 },
  /** F4 floor contact shading (walls and plinths) and the ceiling's cove up-light, before normalising. */
  floorContact: { strength: 0.42, falloff: 0.4, texelsPerMetre: 16 },
  ceilingCove: { strength: 0.32, falloff: 0.7, texelsPerMetre: 8 },
  /**
   * Fixed per-face shading (baked into vertex colours, identical in every room): a soffit is
   * darker than a wall, a horizontal top a touch lighter, and walls facing east or west a touch
   * darker than walls facing north or south, so corners read without any light at run time.
   */
  faceShade: { top: 1.03, down: 0.82, xFacing: 0.95 },
  /** F10/F11: neutral; no light colour, no post pass beyond the anti-aliasing and output. */
  background: "#c9cbcd",
} as const;

/** sRGB 8-bit value to linear. */
export function srgbToLinear(v255: number): number {
  const v = v255 / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Linear to sRGB 8-bit value (unrounded). */
export function linearToSrgb(l: number): number {
  const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return v * 255;
}

const NEUTRAL_START = 0.8 - 0.04;
const NEUTRAL_D = 1 - NEUTRAL_START;

/** three 0.186.1 `NeutralToneMapping` for a neutral grey (r = g = b), exposure 1. */
export function neutralToneMap(x: number): number {
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const c = x - offset;
  if (c < NEUTRAL_START) return c;
  return 1 - (NEUTRAL_D * NEUTRAL_D) / (c + NEUTRAL_D - NEUTRAL_START);
}

/** The linear scene value that the Neutral tone mapping renders as display-linear `o` (inverse of `neutralToneMap`). */
export function preToneMap(o: number): number {
  if (o <= 0) return 0;
  if (o < 0.04) return Math.sqrt(o / 6.25);
  if (o < NEUTRAL_START) return o + 0.04;
  if (o >= 1) throw new Error("preToneMap: display value 1 is never reached by the Neutral tone mapping");
  return (NEUTRAL_D * NEUTRAL_D) / (1 - o) - NEUTRAL_D + NEUTRAL_START + 0.04;
}

/** Scene-linear value for a rendered sRGB 8-bit target. */
export const sceneValueFor = (srgb255: number) => preToneMap(srgbToLinear(srgb255));

/** Per-face shading for a face normal (vertex colours). */
export function faceShade(n: readonly [number, number, number]): number {
  const s = GALLERY_FINISH.faceShade;
  const vertical = n[1] >= 0 ? 1 + (s.top - 1) * n[1] : 1 + (1 - s.down) * n[1];
  return vertical * (1 - (1 - s.xFacing) * Math.abs(n[0]));
}

/**
 * The shared wall-wash profile, as a function of height y (metres) in a room of height `h`:
 * 1 across the card band. Exported for the unit test (flatness of the card band).
 */
export function wallWash(y: number, h: number): number {
  const w = GALLERY_FINISH.wash;
  const contact = 1 - (1 - w.floor) * Math.exp(-Math.max(0, y) / w.floorFalloff);
  const cove = 1 + w.cove * Math.exp(-Math.max(0, h - y) / w.coveFalloff);
  return contact * cove;
}

/** Lightmap storage: 8-bit, with headroom (a stored 1 means LIGHTMAP_RANGE). */
export const LIGHTMAP_RANGE = 2;

// ---------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------

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

/** The loaded maps of one surface. The unlit finish loads the colour map only. */
export interface TextureSet {
  color: THREE.Texture;
  normal?: THREE.Texture;
  orm?: THREE.Texture;
}

export interface LoadedTextures {
  wall: TextureSet;
  floor: TextureSet;
  /** What was loaded (C12: identical on every tier). */
  manifest: { url: string; width: number; height: number; levels: number; format: number }[];
  bytes: number;
}

/**
 * Linear means of the two colour maps, measured over the authored 8-bit sources
 * (`analysis/out/museum/sources/*.png`, every texel, sRGB decoded): the material colour divides by
 * these so each surface renders at its target mean, neutral.
 */
export const COLOUR_MAP_MEAN = {
  wall: [0.7681, 0.7238, 0.6452],
  floor: [0.3142, 0.2245, 0.1376],
} as const;

/** The maps the finish uses (normal and ORM maps stay in the index for the record, unloaded). */
export const LOADED_MAPS = [
  { set: "wall", role: "color" },
  { set: "floor", role: "color" },
] as const;

let ktx2: KTX2Loader | null = null;

/**
 * The KTX2 loader (GPU-compressed transcode, 8 bits per texel). Transcoding to uncompressed RGBA8
 * was tried for C12 and changed nothing (wall colour SSIM 0.9753 against 0.9746 for BC7, at four
 * times the memory): the residual is the UASTC encode itself (results document, C12).
 */
export function ktx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2) {
    ktx2 = new KTX2Loader().setTranscoderPath("/museum/basis/").detectSupport(renderer);
    // The transcoder needs eval for its embind glue: run it in the bootstrap worker, which has its
    // own policy, instead of a blob worker under the page's (ktx2-worker.ts).
    runInBootWorker(ktx2, KTX2Loader as unknown as Parameters<typeof runInBootWorker>[1]);
  }
  return ktx2;
}

export function disposeKtx2Loader() {
  ktx2?.dispose();
  ktx2 = null;
}

/** Loads the architecture colour maps; reports progress in bytes (loading indicator). */
export async function loadArchitectureTextures(renderer: THREE.WebGLRenderer, onProgress: (loadedBytes: number, totalBytes: number) => void): Promise<LoadedTextures> {
  const res = await fetch("/museum/textures/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`texture index: HTTP ${res.status}`);
  const index = (await res.json()) as TextureIndex;
  const loader = ktx2Loader(renderer);
  const entries = LOADED_MAPS.map(({ set, role }) => ({ set, role, e: index.textures[set].maps[role], tile: index.textures[set].tileMetres }));
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
  const pick = (set: "wall" | "floor") => loaded.find((l) => l.set === set)!.tex;
  return {
    wall: { color: pick("wall") },
    floor: { color: pick("floor") },
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
// Baked light: the shared wall-wash profile and the per-room floor and ceiling maps
// ---------------------------------------------------------------------------------------

function greyTexture(values: Float32Array, w: number, h: number, name: string, mipmaps: boolean): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round((values[i]! / LIGHTMAP_RANGE) * 255)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = mipmaps;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.channel = 1;
  t.name = name;
  t.needsUpdate = true;
  return t;
}

/** Rows of the wall-wash profile texture (uv1.y = y / room height). */
export const WALL_PROFILE_ROWS = 256;

/**
 * The single wall-wash profile every wall, post, lintel, reveal and plinth references (F3). One
 * column (u is unused), 256 rows over the room height.
 */
export function wallProfileTexture(height: number): THREE.DataTexture {
  const n = WALL_PROFILE_ROWS;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = wallWash(((i + 0.5) / n) * height, height);
  return greyTexture(v, 1, n, "wall-wash-profile", false);
}

/**
 * Floor or ceiling light for one room (F4), a pure function of the manifest geometry: contact
 * shading by distance to every nearby wall, post and plinth footprint (`sign` -1), or the cove's
 * up-light, brighter near the walls (`sign` +1). Normalised so the room's mean is exactly 1: every
 * room's floor (and ceiling) has the same mean, whatever its size or furniture.
 */
export function bakeRoomLight(rect: Rect, boxes: readonly { min: Vec3; max: Vec3 }[], opts: { strength: number; falloff: number; texelsPerMetre: number; sign: 1 | -1 }): { values: Float32Array; w: number; h: number; rawMean: number } {
  const w = Math.max(8, Math.min(512, Math.round((rect.maxX - rect.minX) * opts.texelsPerMetre)));
  const h = Math.max(8, Math.min(512, Math.round((rect.maxZ - rect.minZ) * opts.texelsPerMetre)));
  const values = new Float32Array(w * h);
  const near = boxes.filter((b) => b.max[0] > rect.minX - 1 && b.min[0] < rect.maxX + 1 && b.max[2] > rect.minZ - 1 && b.min[2] < rect.maxZ + 1);
  let sum = 0;
  for (let j = 0; j < h; j++) {
    // Row 0 of a DataTexture is v = 0, which uv1 maps to the room's max z edge (geometry aoUv).
    const z = rect.maxZ - ((j + 0.5) / h) * (rect.maxZ - rect.minZ);
    for (let i = 0; i < w; i++) {
      const x = rect.minX + ((i + 0.5) / w) * (rect.maxX - rect.minX);
      let v = 1;
      if (opts.sign < 0) {
        for (const b of near) {
          const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
          const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
          v *= 1 - opts.strength * Math.exp(-Math.hypot(dx, dz) / opts.falloff);
        }
        v = Math.max(0.5, v);
      } else {
        const d = Math.min(x - rect.minX, rect.maxX - x, z - rect.minZ, rect.maxZ - z);
        v = 1 + opts.strength * Math.exp(-Math.max(0, d) / opts.falloff);
      }
      values[j * w + i] = v;
      sum += v;
    }
  }
  const rawMean = sum / (w * h);
  for (let i = 0; i < values.length; i++) values[i]! /= rawMean;
  return { values, w, h, rawMean };
}

export function roomLightTexture(bake: { values: Float32Array; w: number; h: number }, name: string): THREE.DataTexture {
  return greyTexture(bake.values, bake.w, bake.h, name, true);
}

// ---------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------

/**
 * Scene colours. Plate paper and ink are white and black (F2): the plates, plaques and signs are
 * display-referred, so they render at exactly these values. The selection frame and floor route use
 * the study's single interactive accent `--indigo` (DESIGN.md 4.2). Design values; not measured or
 * historical dye colours.
 */
export const PALETTE = {
  paper: "#ffffff",
  ink: "#000000",
  brand: "#24406e",
} as const;

export interface Materials {
  /** Walls, posts, lintels, reveals, skirting and cove (vertex-colour tints on one plaster material). */
  wall: THREE.MeshBasicMaterial;
  /** Plinths: the same material instance as the walls (their tint is in the vertex colours). */
  plinth: THREE.MeshBasicMaterial;
  /** Door reveals and thresholds: the same material instance as the walls. */
  trim: THREE.MeshBasicMaterial;
  /** Floor and ceiling templates; each room gets its own instance with its light map (`roomSurfaceMaterial`). */
  floor: THREE.MeshBasicMaterial;
  ceiling: THREE.MeshBasicMaterial;
  panel: THREE.MeshBasicMaterial;
  /** The same card without lettering (rooms whose lettering is not resident). */
  panelBlank: THREE.MeshBasicMaterial;
  highlight: THREE.MeshBasicMaterial;
  route: THREE.MeshBasicMaterial;
  /** The shared wall-wash profile (every wall references this one texture instance). */
  wallProfile: THREE.DataTexture;
  all: THREE.Material[];
}

/**
 * Display-referred output for labels: alpha 0 marks the pixel for the pipeline's OutputPass, which
 * then skips the tone mapping (see the module comment).
 */
const DISPLAY_REFERRED = "gl_FragColor = vec4( outgoingLight, 0.0 );";

/**
 * Panel material: the atlas is a single-channel coverage mask (R8); the shader mixes paper and ink
 * by it, so text costs 1 byte per texel. Unlit and display-referred: the paper is #FFFFFF and the
 * ink #000000 on screen at every wall orientation and in every room. Create one per atlas page with
 * this function: Material.clone() does not copy onBeforeCompile.
 */
export function panelMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: "#ffffff", name: "panel", toneMapped: false });
  const paper = new THREE.Color(PALETTE.paper);
  const ink = new THREE.Color(PALETTE.ink);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaper = { value: paper };
    shader.uniforms.uInk = { value: ink };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uPaper;\nuniform vec3 uInk;")
      .replace("#include <map_fragment>", "#ifdef USE_MAP\n  float coverage = texture2D( map, vMapUv ).r;\n  diffuseColor.rgb *= mix( uPaper, uInk, coverage );\n#endif")
      .replace("#include <opaque_fragment>", DISPLAY_REFERRED);
  };
  m.customProgramCacheKey = () => "ie-panel-mask-v3-unlit";
  return m;
}

/** The unlettered card: the same paper, unlit and display-referred. */
function panelBlankMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ name: "panel-blank", color: PALETTE.paper, toneMapped: false });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", DISPLAY_REFERRED);
  };
  m.customProgramCacheKey = () => "ie-panel-blank-v3-unlit";
  return m;
}

/** Rec. 709 luminance weights (linear sRGB); the floor shader uses the same three numbers. */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * Per-channel gain that puts `chroma` of a map's own hue back on a neutral surface around the same
 * luminance (the floor, F1b): mix(1, mean / Y(mean), chroma). Its luminance is exactly 1 for any
 * `chroma`, so the floor's mean stays at `floorSrgb`.
 */
export function chromaGain(mean: readonly number[], chroma: number): [number, number, number] {
  const y = LUMA[0] * mean[0]! + LUMA[1] * mean[1]! + LUMA[2] * mean[2]!;
  return [0, 1, 2].map((i) => 1 + chroma * (mean[i]! / y - 1)) as [number, number, number];
}

/** Material colour that turns a map of linear mean `mean` into a neutral grey of scene value `v`. */
function neutralGain(mean: readonly number[], v: number): THREE.Color {
  return new THREE.Color().setRGB(v / mean[0]!, v / mean[1]!, v / mean[2]!, THREE.LinearSRGBColorSpace);
}

/** Vertex-colour tint (relative to the wall) that renders a plaster surface at `srgb` in the card band. */
export function plasterTint(srgb: number): number {
  return sceneValueFor(srgb) / sceneValueFor(GALLERY_FINISH.wallSrgb);
}

/** Tint for a surface that should render as the given hex colour (e.g. the door edge), relative to the wall. */
export function plasterTintRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  const w = sceneValueFor(GALLERY_FINISH.wallSrgb);
  return [preToneMap(c.r) / w, preToneMap(c.g) / w, preToneMap(c.b) / w];
}

/**
 * The plaster material for walls, plinths and reveals: the wall colour map with a neutral gain
 * (F1), the shared wall-wash profile as a lightmap on uv1 (F3), tints and face shading in the
 * vertex colours. Unlit.
 */
function plasterMaterial(tex: LoadedTextures, profile: THREE.DataTexture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name: "plaster",
    map: tex.wall.color,
    color: neutralGain(COLOUR_MAP_MEAN.wall, sceneValueFor(GALLERY_FINISH.wallSrgb)),
    vertexColors: true,
    lightMap: profile,
    lightMapIntensity: Math.PI * LIGHTMAP_RANGE,
  });
}

/**
 * A floor or ceiling material for one room (F4): the colour map with a neutral gain to the finish
 * mean, that room's normalised light map, and (floor) the map's contrast reduced to `floorDetail`
 * with `floorChroma` of its own hue mixed back in (`chromaGain`, luminance unchanged).
 * All rooms share one program (the onBeforeCompile and its cache key are set on every instance).
 */
export function roomSurfaceMaterial(kind: "floor" | "ceiling", tex: LoadedTextures, light: THREE.Texture | null): THREE.MeshBasicMaterial {
  const floor = kind === "floor";
  const mean = floor ? COLOUR_MAP_MEAN.floor : COLOUR_MAP_MEAN.wall;
  const target = sceneValueFor(floor ? GALLERY_FINISH.floorSrgb : GALLERY_FINISH.ceilingSrgb);
  const m = new THREE.MeshBasicMaterial({
    name: kind,
    map: floor ? tex.floor.color : tex.wall.color,
    color: neutralGain(mean, target),
    lightMap: light,
    lightMapIntensity: Math.PI * LIGHTMAP_RANGE,
  });
  if (floor) {
    const uMean = new THREE.Vector3(mean[0], mean[1], mean[2]);
    const detail = { value: GALLERY_FINISH.floorDetail };
    const chroma = { value: GALLERY_FINISH.floorChroma };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uMapMean = { value: uMean };
      shader.uniforms.uDetail = detail;
      shader.uniforms.uChroma = chroma;
      // The neutral gain (material colour) divides each channel by the map's mean; mixing `uChroma`
      // of mean / Y(mean) back in restores that much of the map's hue at the same luminance
      // (chromaGain, unit-tested).
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uMapMean;\nuniform float uDetail;\nuniform float uChroma;")
        .replace(
          "#include <map_fragment>",
          "#ifdef USE_MAP\n  vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n  diffuseColor.rgb *= mix( uMapMean, sampledDiffuseColor.rgb, uDetail ) * mix( vec3( 1.0 ), uMapMean / dot( uMapMean, vec3( 0.2126, 0.7152, 0.0722 ) ), uChroma );\n#endif",
        );
    };
    m.customProgramCacheKey = () => "ie-floor-v2";
  }
  return m;
}

/**
 * A room's own floor or ceiling material: the template (floor or ceiling) with that room's light
 * map. The same program as the template (onBeforeCompile and its cache key are carried over:
 * Material.clone() does not copy them).
 */
export function withRoomLight(template: THREE.MeshBasicMaterial, light: THREE.Texture): THREE.MeshBasicMaterial {
  const m = template.clone();
  m.onBeforeCompile = template.onBeforeCompile;
  m.customProgramCacheKey = template.customProgramCacheKey;
  light.channel = 1;
  m.lightMap = light;
  return m;
}

/** Mean light of a stored light map (the 8-bit values the GPU samples), in units of the card-band level. */
export function storedMean(t: THREE.DataTexture): number {
  const d = t.image.data as Uint8Array;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i]!;
  return (sum / (d.length / 4) / 255) * LIGHTMAP_RANGE;
}

export function createMaterials(tex: LoadedTextures, wallHeight: number): Materials {
  const wallProfile = wallProfileTexture(wallHeight);
  const plaster = plasterMaterial(tex, wallProfile);
  // Templates (compiled before entry); each room gets its own instance with its light map.
  const floor = roomSurfaceMaterial("floor", tex, wallProfile);
  const ceiling = roomSurfaceMaterial("ceiling", tex, wallProfile);
  const panel = panelMaterial();
  const panelBlank = panelBlankMaterial();
  const highlight = new THREE.MeshBasicMaterial({ name: "highlight", color: PALETTE.brand, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const route = new THREE.MeshBasicMaterial({ name: "route", color: PALETTE.brand, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return { wall: plaster, plinth: plaster, trim: plaster, floor, ceiling, panel, panelBlank, highlight, route, wallProfile, all: [plaster, floor, ceiling, panel, panelBlank, highlight, route] };
}

// ---------------------------------------------------------------------------------------
// Scene setup: no lights (the architecture is unlit), a neutral background.
// ---------------------------------------------------------------------------------------

export function createLighting(_renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  scene.environment = null;
  scene.background = new THREE.Color(GALLERY_FINISH.background);
  return () => {
    scene.background = null;
  };
}
