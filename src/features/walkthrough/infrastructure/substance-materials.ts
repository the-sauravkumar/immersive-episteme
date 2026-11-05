import * as THREE from "three";
import { liquidMarks, type SubstanceFill, type SubstanceLook, type Transparency } from "@/features/process/domain/substance-look";
import { albedoForDisplay, type LinearRgb } from "../domain/lit-colour";
import { powderGrainOf, type PowderGrain } from "../domain/substance-body";
import { noteSurface, type MaterialLibrary, type ScanName } from "./material-library";

const TRIPLANAR_VERTEX = [
  "#include <begin_vertex>",
  "vTriPosition = position;",
  "vTriNormal = normal;",
  "#ifdef USE_INSTANCING",
  "vTriTurn = normalMatrix * mat3(instanceMatrix);",
  "vTriUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal).y;",
  "#else",
  "vTriTurn = normalMatrix;",
  "vTriUp = normalize(mat3(modelMatrix) * normal).y;",
  "#endif",
].join("\n");

const TRIPLANAR_SAMPLING = [
  "varying vec3 vTriPosition;",
  "varying vec3 vTriNormal;",
  "varying mat3 vTriTurn;",
  "varying float vTriUp;",
  "uniform float triPerMetre;",
  "uniform float triContrast;",
  "uniform float triLeastRough;",
  "uniform float triSpecular;",
  "uniform float triContact;",
  "uniform float triTurned;",
  "uniform float triRubbed;",
  "uniform vec3 triRubbedColour;",
  "float triRub = 0.0;",
  "vec2 triFront(vec3 p) { return mix(p.xy, p.yx, triTurned); }",
  "vec3 triWeights() { vec3 w = pow(abs(normalize(vTriNormal)), vec3(5.0)); return w / (w.x + w.y + w.z); }",
  "vec3 triSample(sampler2D source) { vec3 w = triWeights(); vec3 p = vTriPosition * triPerMetre; return texture2D(source, p.zy).rgb * w.x + texture2D(source, p.xz).rgb * w.y + texture2D(source, triFront(p)).rgb * w.z; }",
].join("\n");

const TRIPLANAR_COLOUR = [
  "vec3 triColour = triSample(map);",
  "float triMean = max(dot(textureLod(map, vec2(0.5), 12.0).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.02);",
  "float triLuminance = dot(triColour, vec3(0.2126, 0.7152, 0.0722)) / triMean;",
  "diffuseColor.rgb *= clamp(mix(1.0, triLuminance, triContrast), 0.35, 1.7);",
  "diffuseColor.rgb *= mix(1.0 - triContact, 1.0, smoothstep(-0.7, 0.45, vTriUp));",
  "if (triRubbed > 0.0) {",
  "  vec3 triBroad = vTriPosition * triPerMetre * 0.31;",
  "  float triPatch = dot(textureLod(map, triBroad.xz + triBroad.y, 5.0).rgb, vec3(0.33)) / max(dot(textureLod(map, vec2(0.5), 12.0).rgb, vec3(0.33)), 0.02);",
  "  triRub = triRubbed * smoothstep(1.0, 1.05, triPatch) * smoothstep(0.82, 1.1, triLuminance);",
  "  diffuseColor.rgb = mix(diffuseColor.rgb, triRubbedColour, triRub);",
  "}",
].join("\n");

const TRIPLANAR_ROUGHNESS = "float roughnessFactor = max(roughness * triSample(roughnessMap).g, triLeastRough);";
const TRIPLANAR_METAL = "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.72, triRub);";
const TRIPLANAR_SPECULAR = "#include <lights_physical_fragment>\nmaterial.specularColorBlended *= triSpecular;";

const TRIPLANAR_NORMAL = [
  "vec3 triW = triWeights();",
  "vec3 triP = vTriPosition * triPerMetre;",
  "vec3 triN = normalize(vTriNormal);",
  "vec3 tx = texture2D(normalMap, triP.zy).xyz * 2.0 - 1.0;",
  "vec3 ty = texture2D(normalMap, triP.xz).xyz * 2.0 - 1.0;",
  "vec3 tz = texture2D(normalMap, triFront(triP)).xyz * 2.0 - 1.0;",
  "tx = vec3(tx.xy * normalScale + triN.zy, abs(tx.z) * triN.x);",
  "ty = vec3(ty.xy * normalScale + triN.xz, abs(ty.z) * triN.y);",
  "tz = vec3(tz.xy * normalScale + triN.xy, abs(tz.z) * triN.z);",
  "normal = normalize(vTriTurn * normalize(tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z)) * faceDirection;",
].join("\n");

export interface ProjectedScanOptions {
  readonly specular?: number;
  readonly contact?: number;
  readonly turned?: boolean;
  readonly rubbed?: number;
  readonly rubbedColour?: THREE.Color;
}

export function projectScan(material: THREE.MeshStandardMaterial, perMetre: number, contrast: number, leastRough: number, options: ProjectedScanOptions = {}): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.triLeastRough = { value: leastRough };
    shader.uniforms.triPerMetre = { value: perMetre };
    shader.uniforms.triContrast = { value: contrast };
    shader.uniforms.triSpecular = { value: options.specular ?? 1 };
    shader.uniforms.triContact = { value: options.contact ?? 0 };
    shader.uniforms.triTurned = { value: options.turned ? 1 : 0 };
    shader.uniforms.triRubbed = { value: options.rubbed ?? 0 };
    shader.uniforms.triRubbedColour = { value: options.rubbedColour ?? new THREE.Color(0, 0, 0) };
    shader.vertexShader = `varying vec3 vTriPosition;\nvarying vec3 vTriNormal;\nvarying mat3 vTriTurn;\nvarying float vTriUp;\n${shader.vertexShader.replace("#include <begin_vertex>", TRIPLANAR_VERTEX)}`;
    shader.fragmentShader = `${TRIPLANAR_SAMPLING}\n${shader.fragmentShader
      .replace("#include <map_fragment>", TRIPLANAR_COLOUR)
      .replace("#include <roughnessmap_fragment>", TRIPLANAR_ROUGHNESS)
      .replace("#include <metalnessmap_fragment>", TRIPLANAR_METAL)
      .replace("#include <lights_physical_fragment>", TRIPLANAR_SPECULAR)
      .replace("#include <normal_fragment_maps>", TRIPLANAR_NORMAL)}`;
  };
  material.customProgramCacheKey = () => "projected-scan";
  return material;
}

export function displayAlbedo(hex: string, gain?: LinearRgb): THREE.Color {
  const target = new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
  const [r, g, b] = albedoForDisplay([target.r, target.g, target.b], gain);
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}

interface FormSurface {
  readonly scan: ScanName;
  readonly tileMetres?: number;
  readonly alongGrain?: boolean;
  readonly roughness: number;
  readonly leastRough: number;
  readonly normalScale: number;
  readonly contrast: number;
  readonly gain: LinearRgb;
  readonly specular: number;
  readonly contact: number;
  readonly env: number;
}

type ScannedFill = Exclude<SubstanceFill, "liquid">;

const FORM_SURFACES: Readonly<Record<ScannedFill, FormSurface>> = {
  dung: { scan: "cowCrust", roughness: 1, leastRough: 0.82, normalScale: 1.6, contrast: 0.9, gain: [1.35, 1.48, 1.56], specular: 0.25, contact: 0.5, env: 0.35 },
  roots: { scan: "madderBark", alongGrain: true, roughness: 1, leastRough: 0.82, normalScale: 2.2, contrast: 1, gain: [1.68, 1.84, 1.8], specular: 0.3, contact: 0.45, env: 0.35 },
  flowers: { scan: "madderBark", tileMetres: 0.09, alongGrain: true, roughness: 1, leastRough: 0.82, normalScale: 1, contrast: 0.7, gain: [1.3, 1.35, 1.45], specular: 0.3, contact: 0.4, env: 0.35 },
  leaves: { scan: "leafBlade", alongGrain: true, roughness: 1, leastRough: 0.72, normalScale: 0.9, contrast: 0.8, gain: [1.22, 1.46, 1.6], specular: 0.4, contact: 0.4, env: 0.4 },
  fruit: { scan: "fruitSkin", roughness: 1, leastRough: 0.55, normalScale: 1.5, contrast: 0.85, gain: [1.5, 1.5, 1.5], specular: 0.55, contact: 0.5, env: 0.45 },
  powder: { scan: "flour", roughness: 1, leastRough: 0.88, normalScale: 1, contrast: 0.45, gain: [0.8, 0.8, 0.8], specular: 0.2, contact: 0.5, env: 0.4 },
  crystals: { scan: "flour", roughness: 1, leastRough: 0.88, normalScale: 1, contrast: 0.4, gain: [0.62, 0.62, 0.62], specular: 0.2, contact: 0.5, env: 0.4 },
  paste: { scan: "wetMud", tileMetres: 0.42, roughness: 0.42, leastRough: 0.27, normalScale: 0.09, contrast: 0.08, gain: [0.92, 0.92, 0.92], specular: 0.85, contact: 0, env: 0.5 },
  cloth: { scan: "weave", roughness: 1, leastRough: 0.72, normalScale: 1.2, contrast: 0.5, gain: [0.86, 0.86, 0.86], specular: 0.4, contact: 0.4, env: 0.2 },
};

const SURFACE_OVERRIDES: readonly { readonly words: RegExp; readonly fill?: SubstanceFill; readonly apply: (form: FormSurface) => FormSurface }[] = [
  { words: /crazed|crease|seam/, fill: "dung", apply: (form) => ({ ...form, scan: "camelSkin", normalScale: 1.8, contrast: 1, gain: [1.25, 1.28, 1.38], contact: 0.62 }) },
  { words: /\bwet\b|\bfresh\b|\bmoist\b/, fill: "dung", apply: (form) => ({ ...form, scan: "wetMud", tileMetres: 0.65, leastRough: 0.34, normalScale: 0.5, contrast: 0.3, specular: 0.7 }) },
  { words: /fibrous/, apply: (form) => ({ ...form, scan: "bark", tileMetres: 0.09, contrast: 0.42, normalScale: 0.95, leastRough: 0.46, specular: 0.65 }) },
  { words: /sticky|glassy/, apply: (form) => ({ ...form, leastRough: 0.13, specular: 1 }) },
];

const RUBBED_COPPER_HEX = "#6A4A36";
const RUBBED_SHARE = 0.32;
const BRIGHTEST_BODY_ALBEDO = 0.98;

const GRAIN_SURFACES: Readonly<Record<PowderGrain, Pick<FormSurface, "scan" | "tileMetres" | "normalScale" | "contrast"> & Partial<Pick<FormSurface, "contact">>>> = {
  fine: { scan: "flour", tileMetres: 0.11, normalScale: 2.1, contrast: 0.7 },
  dust: { scan: "flour", tileMetres: 0.14, normalScale: 2.2, contrast: 0.75 },
  coarse: { scan: "sawdust", tileMetres: 0.085, normalScale: 1.25, contrast: 0.6 },
  granular: { scan: "sawdust", tileMetres: 0.05, normalScale: 1.5, contrast: 0.42 },
  fibrous: { scan: "sawdust", tileMetres: 0.2, normalScale: 1.1, contrast: 0.62, contact: 0 },
  crystalline: { scan: "flour", tileMetres: 0.08, normalScale: 2.4, contrast: 0.7 },
};

function surfaceOf(look: SubstanceLook): FormSurface {
  const base = FORM_SURFACES[look.fill as ScannedFill];
  const form = look.fill === "powder" || look.fill === "crystals" ? { ...base, ...GRAIN_SURFACES[powderGrainOf(look)] } : base;
  return SURFACE_OVERRIDES.filter(({ words, fill }) => words.test(look.surface) && (fill === undefined || fill === look.fill)).reduce((current, { apply }) => apply(current), form);
}

const PILE_BED_DARKENING: Partial<Record<SubstanceFill, number>> = { dung: 0.58, roots: 0.32, fruit: 0.4, crystals: 0.42 };
const GAP_DARKENING = 0.3;
const CAKE_SURFACE: Pick<FormSurface, "scan" | "tileMetres" | "normalScale" | "contrast" | "leastRough" | "specular" | "contact"> = { scan: "flour", tileMetres: 0.09, normalScale: 0.8, contrast: 0.3, leastRough: 0.46, specular: 0.55, contact: 0.5 };

type ScannedRole = "body" | "bed" | "cake";

async function scannedMaterial(library: MaterialLibrary, look: SubstanceLook, role: ScannedRole): Promise<THREE.MeshStandardMaterial> {
  const form = role === "cake" ? { ...surfaceOf(look), ...CAKE_SURFACE } : surfaceOf(look);
  const bed = role === "bed";
  const scan = await library.scan(form.scan);
  const material = new THREE.MeshStandardMaterial({
    map: scan.colour,
    normalMap: scan.normal,
    roughnessMap: scan.roughness,
    roughness: form.roughness,
    metalness: 0,
    color: displayAlbedo(look.renderHex, form.gain),
    normalScale: new THREE.Vector2(form.normalScale, form.normalScale),
    envMapIntensity: form.env,
    vertexColors: role === "body" && (look.fill === "paste" || look.fill === "powder" || look.fill === "crystals"),
    transparent: look.fill === "paste" && look.transparency === "translucent",
    opacity: look.fill === "paste" && look.transparency === "translucent" ? 0.93 : 1,
  });
  if (bed) material.color.multiplyScalar(PILE_BED_DARKENING[look.fill] ?? GAP_DARKENING);
  if (look.fill === "paste" || look.fill === "powder" || look.fill === "crystals") material.color.multiplyScalar(Math.min(1, BRIGHTEST_BODY_ALBEDO / Math.max(material.color.r, material.color.g, material.color.b)));
  const perMetre = 1 / (form.tileMetres ?? scan.tileMetres);
  const rubbed = role === "cake" && /coppery/.test(look.surface);
  return noteSurface(projectScan(material, perMetre, form.contrast, form.leastRough, { specular: form.specular, contact: bed ? 0 : form.contact, rubbed: rubbed ? RUBBED_SHARE : 0, rubbedColour: rubbed ? displayAlbedo(RUBBED_COPPER_HEX) : undefined }), { label: `substance ${look.key}`, kind: "model", perMetre, openWork: !bed && look.fill !== "powder" && look.fill !== "paste" });
}

export function substanceMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`substance:${look.key}`, () => scannedMaterial(library, look, "body"));
}

export function cakeMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`cake:${look.key}`, () => scannedMaterial(library, look, "cake"));
}

const FILM_VERTEX = ["#include <begin_vertex>", "vFilmShare = filmShare;"].join("\n");

const FILM_ALPHA = [
  "vec3 filmAt = vTriPosition * triPerMetre * filmCloudScale;",
  "float filmCloud = dot(textureLod(map, vec2(filmAt.x + filmAt.z, filmAt.y * filmStretch), 2.0).rgb, vec3(0.33)) / max(dot(textureLod(map, vec2(0.5), 12.0).rgb, vec3(0.33)), 0.02);",
  "float filmBody = pow(1.0 - vFilmShare, filmFalloff);",
  "float filmCover = filmBody * 1.5 + (filmCloud - 1.0) * filmCloudWeight + (triLuminance - 1.0) * filmGrainWeight - 0.2;",
  "diffuseColor.a *= smoothstep(0.0, filmEdge, filmCover) * (1.0 - smoothstep(0.92, 1.0, vFilmShare));",
  "#include <opaque_fragment>",
].join("\n");

export interface FilmLook {
  readonly stretch: number;
  readonly falloff: number;
  readonly cloudWeight: number;
  readonly grainWeight: number;
  readonly edge: number;
}

export function filmMaterial(library: MaterialLibrary, look: SubstanceLook, film: FilmLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`film:${look.key}`, async () => {
    const material = await scannedMaterial(library, look, "body");
    material.transparent = true;
    material.opacity = 1;
    material.depthWrite = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -2;
    const projected = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      projected(shader, renderer);
      shader.uniforms.filmStretch = { value: film.stretch };
      shader.uniforms.filmFalloff = { value: film.falloff };
      shader.uniforms.filmCloudWeight = { value: film.cloudWeight };
      shader.uniforms.filmGrainWeight = { value: film.grainWeight };
      shader.uniforms.filmEdge = { value: film.edge };
      shader.uniforms.filmCloudScale = { value: 0.11 };
      shader.vertexShader = `attribute float filmShare;\nvarying float vFilmShare;\n${shader.vertexShader.replace("#include <begin_vertex>", FILM_VERTEX)}`;
      shader.fragmentShader = `varying float vFilmShare;\nuniform float filmStretch;\nuniform float filmFalloff;\nuniform float filmCloudWeight;\nuniform float filmGrainWeight;\nuniform float filmEdge;\nuniform float filmCloudScale;\n${shader.fragmentShader.replace("#include <opaque_fragment>", FILM_ALPHA)}`;
    };
    material.customProgramCacheKey = () => "projected-scan-film";
    return material;
  });
}

const GRAIN_LUMA = "vec3(0.2126, 0.7152, 0.0722)";

const GRAIN_COLOUR = [
  "float grainMean = max(dot(textureLod(map, vec2(0.5), 12.0).rgb, " + GRAIN_LUMA + "), 0.02);",
  "float grainTone = dot(texture2D(map, vMapUv).rgb, " + GRAIN_LUMA + ") / grainMean;",
  "diffuseColor.rgb *= clamp(mix(1.0, grainTone, grainContrast), 0.35, 1.7);",
  "diffuseColor.rgb *= mix(1.0 - grainContact, 1.0, smoothstep(-0.7, 0.45, vGrainUp));",
].join("\n");

const GRAIN_ROUGH = "float roughnessFactor = max(roughness * texture2D(roughnessMap, vRoughnessMapUv).g, grainLeastRough);";
const GRAIN_SPECULAR = "#include <lights_physical_fragment>\nmaterial.specularColorBlended *= grainSpecular;";
const GRAIN_VERTEX = [
  "#include <begin_vertex>",
  "#ifdef USE_INSTANCING",
  "vGrainUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal).y;",
  "#else",
  "vGrainUp = normalize(mat3(modelMatrix) * normal).y;",
  "#endif",
].join("\n");

function scanAlongGrain(material: THREE.MeshStandardMaterial, form: FormSurface): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grainContrast = { value: form.contrast };
    shader.uniforms.grainContact = { value: form.contact };
    shader.uniforms.grainLeastRough = { value: form.leastRough };
    shader.uniforms.grainSpecular = { value: form.specular };
    shader.vertexShader = `varying float vGrainUp;\n${shader.vertexShader.replace("#include <begin_vertex>", GRAIN_VERTEX)}`;
    shader.fragmentShader = `varying float vGrainUp;\nuniform float grainContrast;\nuniform float grainContact;\nuniform float grainLeastRough;\nuniform float grainSpecular;\n${shader.fragmentShader.replace("#include <map_fragment>", GRAIN_COLOUR).replace("#include <roughnessmap_fragment>", GRAIN_ROUGH).replace("#include <lights_physical_fragment>", GRAIN_SPECULAR)}`;
  };
  material.customProgramCacheKey = () => "scan-along-grain";
}

function repeatedScan(library: MaterialLibrary, texture: THREE.Texture, key: string, perMetre: number): Promise<THREE.Texture> {
  return library.shared(`grain-map:${key}:${perMetre.toFixed(2)}`, async () => {
    const repeated = texture.clone();
    repeated.repeat.set(perMetre, perMetre);
    repeated.needsUpdate = true;
    library.keep(repeated);
    return repeated;
  });
}

export function pileMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`pile:${look.key}`, async () => {
    const form = surfaceOf(look);
    if (!form.alongGrain) {
      const material = await scannedMaterial(library, look, "body");
      material.vertexColors = true;
      return material;
    }
    const scan = await library.scan(form.scan);
    const perMetre = 1 / (form.tileMetres ?? scan.tileMetres);
    const material = new THREE.MeshStandardMaterial({
      map: await repeatedScan(library, scan.colour, `${form.scan}:colour`, perMetre),
      normalMap: await repeatedScan(library, scan.normal, `${form.scan}:normal`, perMetre),
      roughnessMap: await repeatedScan(library, scan.roughness, `${form.scan}:roughness`, perMetre),
      roughness: form.roughness,
      metalness: 0,
      color: displayAlbedo(look.renderHex, form.gain),
      normalScale: new THREE.Vector2(form.normalScale, form.normalScale),
      envMapIntensity: form.env,
      vertexColors: true,
      side: look.fill === "roots" ? THREE.FrontSide : THREE.DoubleSide,
    });
    scanAlongGrain(material, form);
    return noteSurface(material, { label: `substance ${look.key}`, kind: "model", perMetre, openWork: true });
  });
}

export function pileBedMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`pile-bed:${look.key}`, () => scannedMaterial(library, look, "bed"));
}

const ABSORPTION_PER_METRE: Readonly<Record<Transparency, number>> = { clear: 0.2, translucent: 26, opaque: 400 };
export const BATH_COLUMN_METRES = 0.034;
const CLEAR_WATER_ALPHA_FLOOR = 0.02;

const LIQUID_VERTEX = ["#include <begin_vertex>", "vLiquidAt = position;", "vLiquidDepth = liquidDepth;"].join("\n");

const LIQUID_SHAPES = [
  "varying vec3 vLiquidAt;",
  "varying float vLiquidDepth;",
  "uniform float liquidAbsorb;",
  "uniform float foamShare;",
  "uniform float scumShare;",
  "uniform vec3 foamColour;",
  "uniform float foamCover;",
  "uniform vec3 scumColour;",
  "float liquidScum = 0.0;",
  "float liquidFoam = 0.0;",
  "float liquidBubbleDome = 1.0;",
  "float liquidHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
  "float liquidNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(liquidHash(i), liquidHash(i + vec2(1.0, 0.0)), f.x), mix(liquidHash(i + vec2(0.0, 1.0)), liquidHash(i + vec2(1.0, 1.0)), f.x), f.y); }",
  "float liquidCloud(vec2 p) { return liquidNoise(p) * 0.55 + liquidNoise(p * 2.3 + 7.1) * 0.3 + liquidNoise(p * 5.7 + 3.7) * 0.15; }",
  "vec2 liquidCells(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); float near = 8.0; float next = 8.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 cell = vec2(float(x), float(y)); vec2 offset = vec2(liquidHash(i + cell), liquidHash(i + cell + 17.0)); float d = length(cell + offset - f); if (d < near) { next = near; near = d; } else if (d < next) next = d; } return vec2(near, next); }",
  "float liquidBubbles(vec2 p) { float spread = fwidth(p.x) + fwidth(p.y); vec2 c = liquidCells(p); float dome = sqrt(max(1.0 - c.x * c.x * 2.2, 0.0)); float film = 0.72 + 0.28 * smoothstep(0.0, 0.1, c.y - c.x); return mix(dome * film, 0.62, smoothstep(0.25, 0.8, spread)); }",
].join("\n");

const LIQUID_COLOUR = [
  "#include <color_fragment>",
  "vec2 liquidAcross = vLiquidAt.xz;",
  "if (scumShare > 0.0) {",
  "  float cloud = liquidCloud(liquidAcross * 5.5);",
  "  liquidScum = 0.62 * smoothstep(1.0 - scumShare - 0.16, 1.0 - scumShare + 0.2, cloud) * (0.6 + 0.4 * liquidNoise(liquidAcross * 60.0));",
  "  diffuseColor.rgb = mix(diffuseColor.rgb, scumColour, liquidScum);",
  "}",
  "if (foamShare > 0.0) {",
  "  float gather = liquidCloud(liquidAcross * 11.0 + 3.0);",
  "  liquidFoam = smoothstep(1.0 - foamShare - 0.16, 1.0 - foamShare + 0.1, gather);",
  "  liquidBubbleDome = min(liquidBubbles(liquidAcross * 240.0), liquidBubbles(liquidAcross * 610.0 + 5.0) * 0.4 + 0.6) * (0.55 + 0.45 * liquidBubbles(liquidAcross * 1500.0 + 2.0));",
  "  diffuseColor.rgb = mix(diffuseColor.rgb, foamColour * (0.5 + 0.75 * liquidBubbleDome), liquidFoam * foamCover);",
  "}",
].join("\n");

const LIQUID_ROUGH = "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.62, max(liquidFoam * 0.85, liquidScum));";
const LIQUID_METAL = "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.45, liquidScum);";

const LIQUID_ALPHA = [
  "float liquidGrazing = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 4.0);",
  "float liquidGleam = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.33));",
  "diffuseColor.a = max(1.0 - exp(-vLiquidDepth * liquidAbsorb), liquidAlphaFloor);",
  "diffuseColor.a = clamp(max(diffuseColor.a + liquidGleam, max(liquidFoam * foamCover, liquidScum * 0.9)) + liquidGrazing * (1.0 - diffuseColor.a), 0.0, 1.0);",
  "#include <opaque_fragment>",
].join("\n");

const FOAM_LIFTS_BODY = 1.9;
const SOAP_FILM_ON_CLEAR_WATER = 0.42;

function liquidShader(material: THREE.MeshStandardMaterial, look: SubstanceLook): void {
  const marks = liquidMarks(look);
  const foam = look.transparency === "clear" ? new THREE.Color(0.7, 0.7, 0.68) : displayAlbedo(look.renderHex).multiplyScalar(FOAM_LIFTS_BODY);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.liquidAbsorb = { value: ABSORPTION_PER_METRE[look.transparency] };
    shader.uniforms.foamShare = { value: marks.foam };
    shader.uniforms.scumShare = { value: marks.scum };
    shader.uniforms.foamColour = { value: foam };
    shader.uniforms.foamCover = { value: look.transparency === "clear" ? SOAP_FILM_ON_CLEAR_WATER : 0.97 };
    shader.uniforms.scumColour = { value: displayAlbedo(SCUM_HEX) };
    shader.vertexShader = `attribute float liquidDepth;\nvarying vec3 vLiquidAt;\nvarying float vLiquidDepth;\n${shader.vertexShader.replace("#include <begin_vertex>", LIQUID_VERTEX)}`;
    shader.fragmentShader = `${LIQUID_SHAPES}\nconst float liquidAlphaFloor = ${(look.transparency === "clear" ? CLEAR_WATER_ALPHA_FLOOR : 0).toFixed(3)};\n${shader.fragmentShader
      .replace("#include <color_fragment>", LIQUID_COLOUR)
      .replace("#include <roughnessmap_fragment>", LIQUID_ROUGH)
      .replace("#include <metalnessmap_fragment>", LIQUID_METAL)
      .replace("#include <opaque_fragment>", LIQUID_ALPHA)}`;
  };
  material.customProgramCacheKey = () => `liquid-surface-${look.transparency === "clear" ? "clear" : "body"}`;
}

const SCUM_HEX = "#9A7044";

export function liquidMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`liquid:${look.key}`, async () => {
    const clear = look.transparency === "clear";
    const seeThrough = look.transparency !== "opaque";
    const material = new THREE.MeshStandardMaterial({
      color: clear ? new THREE.Color(0, 0, 0) : displayAlbedo(look.renderHex),
      roughness: look.transparency === "opaque" ? 0.26 : 0.1,
      metalness: 0,
      envMapIntensity: clear ? 2.4 : 0.5,
      transparent: seeThrough,
      depthWrite: !seeThrough,
    });
    noteSurface(material, { label: `liquid ${look.key}`, kind: "smooth" });
    liquidShader(material, look);
    return material;
  });
}

export function liquidBodyMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`liquid-body:${look.key}`, async () =>
    noteSurface(new THREE.MeshStandardMaterial({ color: displayAlbedo(look.renderHex), roughness: 0.6, metalness: 0, envMapIntensity: 0.2 }), { label: `liquid body ${look.key}`, kind: "smooth" }),
  );
}

const CRYSTAL_VERTEX = [
  "#include <begin_vertex>",
  "vCrystalAt = position;",
  "vCrystalNormal = normal;",
  "#ifdef USE_INSTANCING",
  "vCrystalSeed = instanceMatrix[3].xyz * 61.0;",
  "vCrystalEye = (inverse(modelViewMatrix * instanceMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz - position;",
  "#else",
  "vCrystalSeed = vec3(0.0);",
  "vCrystalEye = (inverse(modelViewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz - position;",
  "#endif",
].join("\n");

const CRYSTAL_VARYINGS = ["varying vec3 vCrystalAt;", "varying vec3 vCrystalNormal;", "varying vec3 vCrystalSeed;", "varying vec3 vCrystalEye;"].join("\n");

const CRYSTAL_SHAPES = [
  CRYSTAL_VARYINGS,
  "float crystalAlpha = 1.0;",
  "float crystalHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }",
  "float crystalNoise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(crystalHash(i), crystalHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(crystalHash(i + vec3(0.0, 1.0, 0.0)), crystalHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y), mix(mix(crystalHash(i + vec3(0.0, 0.0, 1.0)), crystalHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(crystalHash(i + vec3(0.0, 1.0, 1.0)), crystalHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }",
  "float crystalFeather(vec3 p) { float sheet = 1.0 - abs(2.0 * crystalNoise(p) - 1.0); return pow(sheet, 14.0) * smoothstep(0.35, 0.8, crystalNoise(p * 0.42 + 5.0)); }",
].join("\n");

const CRYSTAL_COLOUR = [
  "#include <color_fragment>",
  "vec3 crystalRay = normalize(-normalize(vCrystalEye) - normalize(vCrystalNormal) * 0.7);",
  "float crystalVeil = 0.0;",
  "float crystalCloud = 0.0;",
  "for (int i = 0; i < 4; i++) {",
  "  vec3 p = (vCrystalAt + crystalRay * (float(i) + 0.4) * 0.0032) * 210.0 + vCrystalSeed;",
  "  crystalVeil += crystalFeather(p) * (1.0 - float(i) * 0.14);",
  "  crystalCloud += crystalNoise(p * 0.3 + 9.0);",
  "}",
  "crystalCloud *= 0.25;",
  "float crystalMilk = clamp(0.04 + 0.5 * smoothstep(0.4, 0.74, crystalCloud) + 1.1 * crystalVeil, 0.0, 1.0);",
  "diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.5, 0.49, 0.46), diffuseColor.rgb, crystalMilk);",
  "crystalAlpha = mix(0.34, 0.94, crystalMilk);",
  "vec3 crystalGlow = diffuseColor.rgb * (0.16 + 0.34 * crystalMilk);",
].join("\n");

const CRYSTAL_EMISSIVE = "#include <emissivemap_fragment>\ntotalEmissiveRadiance += crystalGlow;";

const CRYSTAL_ROUGH = "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.07, 0.52, smoothstep(0.42, 0.74, crystalNoise(vCrystalAt * 120.0 + vCrystalSeed.zxy)));";

const CRYSTAL_ALPHA = [
  "float crystalGrazing = pow(1.0 - saturate(abs(dot(normalize(vViewPosition), normal))), 3.0);",
  "float crystalGleam = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.33));",
  "diffuseColor.a = clamp(crystalAlpha + crystalGrazing * 0.5 + crystalGleam, 0.0, 1.0);",
  "#include <opaque_fragment>",
].join("\n");

export function crystalMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`crystal:${look.key}`, async () => {
    const colour = displayAlbedo(look.renderHex);
    if (look.transparency === "opaque") {
      return noteSurface(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.38, metalness: 0, envMapIntensity: 0.7, flatShading: true }), { label: `crystals ${look.key}`, kind: "smooth", realFacets: true, openWork: true });
    }
    colour.multiplyScalar(0.42);
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.2, metalness: 0, envMapIntensity: 0.95, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    noteSurface(material, { label: `crystals ${look.key}`, kind: "smooth", realFacets: true, openWork: true });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `${CRYSTAL_VARYINGS}\n${shader.vertexShader.replace("#include <begin_vertex>", CRYSTAL_VERTEX)}`;
      shader.fragmentShader = `${CRYSTAL_SHAPES}\n${shader.fragmentShader
        .replace("#include <color_fragment>", CRYSTAL_COLOUR)
        .replace("#include <emissivemap_fragment>", CRYSTAL_EMISSIVE)
        .replace("#include <roughnessmap_fragment>", CRYSTAL_ROUGH)
        .replace("#include <opaque_fragment>", CRYSTAL_ALPHA)}`;
    };
    material.customProgramCacheKey = () => "milky-crystal";
    return material;
  });
}
