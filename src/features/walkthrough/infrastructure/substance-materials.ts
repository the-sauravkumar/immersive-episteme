import * as THREE from "three";
import { liquidMarks, type SubstanceFill, type SubstanceLook, type Transparency } from "@/features/process/domain/substance-look";
import { albedoForDisplay, type LinearRgb } from "../domain/lit-colour";
import { powderGrainOf, type PowderGrain } from "../domain/substance-body";
import { noteSurface, type MaterialLibrary, type ScanName } from "./material-library";
import { PIXEL_FOOTPRINT_UNIFORM, pixelMetresAt, trackPixelFootprint } from "./pixel-footprint";

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

const toneCancelling = (meanTone: LinearRgb): LinearRgb => [1 / meanTone[0], 1 / meanTone[1], 1 / meanTone[2]];

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
  readonly gain?: LinearRgb;
  readonly specular: number;
  readonly contact: number;
  readonly env: number;
}

type ScannedFill = Exclude<SubstanceFill, "liquid">;

const FORM_SURFACES: Readonly<Record<ScannedFill, FormSurface>> = {
  dung: { scan: "wetMud", tileMetres: 0.3, roughness: 1, leastRough: 0.4, normalScale: 0.9, contrast: 0.45, specular: 0.55, contact: 0.5, env: 0.35 },
  roots: { scan: "madderBark", alongGrain: true, roughness: 1, leastRough: 0.82, normalScale: 2.2, contrast: 1, specular: 0.3, contact: 0.45, env: 0.35 },
  flowers: { scan: "madderBark", tileMetres: 0.09, alongGrain: true, roughness: 1, leastRough: 0.82, normalScale: 1, contrast: 0.7, specular: 0.3, contact: 0.4, env: 0.35 },
  leaves: { scan: "leafBlade", alongGrain: true, roughness: 1, leastRough: 0.72, normalScale: 0.9, contrast: 0.8, specular: 0.4, contact: 0.4, env: 0.4 },
  powder: { scan: "flour", roughness: 1, leastRough: 0.88, normalScale: 1, contrast: 0.45, gain: [0.8, 0.8, 0.8], specular: 0.2, contact: 0.5, env: 0.4 },
  crystals: { scan: "flour", roughness: 1, leastRough: 0.88, normalScale: 1, contrast: 0.4, gain: [0.62, 0.62, 0.62], specular: 0.2, contact: 0.5, env: 0.4 },
  paste: { scan: "wetMud", tileMetres: 0.42, roughness: 0.42, leastRough: 0.27, normalScale: 0.09, contrast: 0.08, gain: [0.92, 0.92, 0.92], specular: 0.85, contact: 0, env: 0.5 },
  cloth: { scan: "weave", roughness: 1, leastRough: 0.72, normalScale: 1.2, contrast: 0.5, gain: [0.86, 0.86, 0.86], specular: 0.4, contact: 0.4, env: 0.2 },
};

const SURFACE_OVERRIDES: readonly { readonly words: RegExp; readonly fill?: SubstanceFill; readonly apply: (form: FormSurface) => FormSurface }[] = [
  { words: /crazed|crease|seam/, fill: "dung", apply: (form) => ({ ...form, scan: "camelSkin", tileMetres: undefined, leastRough: 0.82, normalScale: 1.8, contrast: 0.7, specular: 0.25, contact: 0.62 }) },
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

const PILE_BED_DARKENING: Partial<Record<SubstanceFill, number>> = { dung: 0.82, roots: 0.55, crystals: 0.7 };
const GAP_DARKENING = 0.3;
const CAKE_SURFACE: Pick<FormSurface, "scan" | "tileMetres" | "normalScale" | "contrast" | "leastRough" | "specular" | "contact"> = { scan: "flour", tileMetres: 0.09, normalScale: 0.8, contrast: 0.3, leastRough: 0.46, specular: 0.55, contact: 0.5 };

type ScannedRole = "body" | "bed" | "cake";

async function scannedMaterial(library: MaterialLibrary, look: SubstanceLook, role: ScannedRole, meanTone?: LinearRgb): Promise<THREE.MeshStandardMaterial> {
  const form = role === "cake" ? { ...surfaceOf(look), ...CAKE_SURFACE } : surfaceOf(look);
  const bed = role === "bed";
  const scan = await library.scan(form.scan);
  const material = new THREE.MeshStandardMaterial({
    map: scan.colour,
    normalMap: scan.normal,
    roughnessMap: scan.roughness,
    roughness: form.roughness,
    metalness: 0,
    color: displayAlbedo(look.renderHex, meanTone ? toneCancelling(meanTone) : form.gain),
    normalScale: new THREE.Vector2(form.normalScale, form.normalScale),
    envMapIntensity: form.env,
    vertexColors: look.fill === "cloth" || (role === "body" && (look.fill === "paste" || look.fill === "powder" || look.fill === "crystals")),
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

const FILM_SKY_SHARE = 0.35;

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
    material.envMapIntensity *= FILM_SKY_SHARE;
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
const GRAIN_FINE_EVENING = 0.6;
const GRAIN_MEAN_TINT = 0.9;
const GRAIN_FAR_FROM_METRES = 0.0025;
const GRAIN_FAR_TO_METRES = 0.004;
const GRAIN_LEAST_PIXEL_WIDTHS = 0.5;

const GRAIN_COLOUR = [
  "float grainFine = smoothstep(0.3, 1.2, length(fwidth(vNormal)));",
  "float grainMean = max(dot(textureLod(map, vec2(0.5), 12.0).rgb, " + GRAIN_LUMA + "), 0.02);",
  "float grainTone = dot(texture2D(map, vMapUv).rgb, " + GRAIN_LUMA + ") / grainMean;",
  "diffuseColor.rgb *= clamp(mix(1.0, grainTone, grainContrast * (1.0 - GRAIN_FINE_EVENING * grainFine)), 0.35, 1.7);",
  "diffuseColor.rgb *= mix(1.0 - grainContact, 1.0, smoothstep(-0.7, 0.45, mix(vGrainUp, 1.0, grainFine)));",
].join("\n");

const GRAIN_TINT = [
  "#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )",
  "float grainFar = smoothstep(GRAIN_FAR_FROM, GRAIN_FAR_TO, vGrainPixel);",
  "diffuseColor.rgb *= mix(mix(vColor.rgb, vec3(GRAIN_MEAN_TINT), GRAIN_FINE_EVENING * grainFine), vGrainFarTone, grainFar);",
  "#endif",
].join("\n");

const GRAIN_NORMAL = ["#include <normal_fragment_maps>", "vec3 grainBroadUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);", "normal = normalize(mix(normal, grainBroadUp, grainFine) + grainBroadUp * 0.001);"].join("\n");

const GRAIN_ROUGH = "float roughnessFactor = max(roughness * texture2D(roughnessMap, vRoughnessMapUv).g, grainLeastRough);";
const GRAIN_SPECULAR = "#include <lights_physical_fragment>\nmaterial.specularColorBlended *= grainSpecular;";
const GRAIN_VERTEX = [
  "#include <begin_vertex>",
  "#ifdef USE_INSTANCING",
  "mat4 grainPlaced = modelMatrix * instanceMatrix;",
  "#else",
  "mat4 grainPlaced = modelMatrix;",
  "#endif",
  "vGrainUp = normalize(mat3(grainPlaced) * normal).y;",
  "float grainScale = length(grainPlaced[0].xyz);",
  `vGrainPixel = ${pixelMetresAt("-(viewMatrix * grainPlaced * vec4(transformed, 1.0)).z")};`,
  "transformed += normalize(objectNormal) * max(GRAIN_LEAST_PIXEL_WIDTHS * vGrainPixel - girth * grainScale, 0.0) / grainScale;",
].join("\n");
const GRAIN_FAR_TONE_VERTEX = ["#include <color_vertex>", "vGrainFarTone = farColour;", "#ifdef USE_INSTANCING_COLOR", "vGrainFarTone *= instanceColor.xyz;", "#endif"].join("\n");

function scanAlongGrain(material: THREE.MeshStandardMaterial, form: FormSurface): void {
  const viewHeight = trackPixelFootprint(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grainContrast = { value: form.contrast };
    shader.uniforms.grainContact = { value: form.contact };
    shader.uniforms.grainLeastRough = { value: form.leastRough };
    shader.uniforms.grainSpecular = { value: form.specular };
    shader.uniforms.footprintViewHeight = viewHeight;
    shader.vertexShader = `#define GRAIN_LEAST_PIXEL_WIDTHS ${GRAIN_LEAST_PIXEL_WIDTHS.toFixed(3)}\nattribute float girth;\nattribute vec3 farColour;\n${PIXEL_FOOTPRINT_UNIFORM}\nvarying float vGrainUp;\nvarying float vGrainPixel;\nvarying vec3 vGrainFarTone;\n${shader.vertexShader.replace("#include <begin_vertex>", GRAIN_VERTEX).replace("#include <color_vertex>", GRAIN_FAR_TONE_VERTEX)}`;
    shader.fragmentShader = `#define GRAIN_FINE_EVENING ${GRAIN_FINE_EVENING.toFixed(2)}\n#define GRAIN_MEAN_TINT ${GRAIN_MEAN_TINT.toFixed(2)}\n#define GRAIN_FAR_FROM ${GRAIN_FAR_FROM_METRES.toFixed(4)}\n#define GRAIN_FAR_TO ${GRAIN_FAR_TO_METRES.toFixed(4)}\nvarying float vGrainUp;\nvarying float vGrainPixel;\nvarying vec3 vGrainFarTone;\nuniform float grainContrast;\nuniform float grainContact;\nuniform float grainLeastRough;\nuniform float grainSpecular;\n${shader.fragmentShader.replace("#include <map_fragment>", GRAIN_COLOUR).replace("#include <color_fragment>", GRAIN_TINT).replace("#include <roughnessmap_fragment>", GRAIN_ROUGH).replace("#include <normal_fragment_maps>", GRAIN_NORMAL).replace("#include <lights_physical_fragment>", GRAIN_SPECULAR)}`;
  };
  material.customProgramCacheKey = () => "scan-along-grain-far-form";
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

export function pileMaterial(library: MaterialLibrary, look: SubstanceLook, meanTone: LinearRgb): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`pile:${look.key}`, async () => {
    const form = surfaceOf(look);
    if (!form.alongGrain) {
      const material = await scannedMaterial(library, look, "body", meanTone);
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
      color: displayAlbedo(look.renderHex, toneCancelling(meanTone)),
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
const DARK_BATH_ABSORPTION_PER_METRE = 130;
const DARK_BATH_LUMINANCE = 0.05;
const PALE_TRANSLUCENT_ABSORPTION_PER_METRE = 3;
const SOAPY_CLOUD_ABSORPTION_PER_METRE = 16;
const SOAPY_CLOUD_FILM = 0.55;
export const BATH_COLUMN_METRES = 0.034;
const CLEAR_WATER_COVER = 0.16;
const OPAQUE_COVER = 1;
const TRANSLUCENT_COVER_FLOOR = 0;

const LIQUID_VERTEX = ["#include <begin_vertex>", "vLiquidAt = position;", "vLiquidDepth = liquidDepth;", "vLiquidWall = liquidWall;"].join("\n");

const LIQUID_SHAPES = [
  "varying vec3 vLiquidAt;",
  "varying float vLiquidDepth;",
  "varying vec2 vLiquidWall;",
  "uniform float liquidAbsorb;",
  "uniform float liquidCoverFloor;",
  "uniform float liquidClear;",
  "uniform float liquidTime;",
  "uniform float liquidSeed;",
  "uniform float liquidRipple;",
  "uniform float liquidFilm;",
  "uniform float liquidMirror;",
  "uniform float foamShare;",
  "uniform float scumShare;",
  "uniform vec3 foamColour;",
  "uniform vec3 foamGlint;",
  "uniform float foamCover;",
  "uniform float foamGrain;",
  "uniform float foamCentre;",
  "uniform vec3 scumColour;",
  "float liquidScum = 0.0;",
  "float liquidFoam = 0.0;",
  "float liquidDome = 1.0;",
  "vec2 liquidBubbleTilt = vec2(0.0);",
  "float liquidHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
  "float liquidNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(liquidHash(i), liquidHash(i + vec2(1.0, 0.0)), f.x), mix(liquidHash(i + vec2(0.0, 1.0)), liquidHash(i + vec2(1.0, 1.0)), f.x), f.y); }",
  "float liquidCloud(vec2 p) { return liquidNoise(p) * 0.55 + liquidNoise(p * 2.3 + 7.1) * 0.3 + liquidNoise(p * 5.7 + 3.7) * 0.15; }",
  "vec4 liquidCells(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); float near = 8.0; float next = 8.0; vec2 towards = vec2(0.0); for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 cell = vec2(float(x), float(y)); vec2 offset = vec2(liquidHash(i + cell), liquidHash(i + cell + 17.0)); vec2 gap = cell + offset - f; float d = length(gap); if (d < near) { next = near; near = d; towards = gap; } else if (d < next) next = d; } return vec4(near, next, towards); }",
  "vec3 liquidBubbles(vec2 p) { float spread = fwidth(p.x) + fwidth(p.y); vec4 c = liquidCells(p); float keep = 1.0 - smoothstep(0.25, 0.8, spread); float dome = sqrt(max(1.0 - c.x * c.x * 2.6, 0.0)); float wall = smoothstep(0.0, 0.08, c.y - c.x); return vec3(mix(0.62, dome * (0.68 + 0.32 * wall), keep), -c.zw * 1.5 * keep * step(0.0001, dome)); }",
  "vec2 liquidWave(vec2 p, vec2 towards, float perMetre, float speed, float height) { float fade = 1.0 - smoothstep(0.35, 1.1, perMetre * (fwidth(p.x) + fwidth(p.y))); return towards * cos(dot(towards, p) * perMetre + liquidTime * speed) * height * fade; }",
  "vec2 liquidSlope(vec2 p) { vec2 q = p + (vec2(liquidNoise(p * 2.3 + liquidTime * 0.05), liquidNoise(p * 2.3 + 9.1 - liquidTime * 0.04)) - 0.5) * 0.42; return liquidWave(q, vec2(0.83, 0.56), 9.0, 0.5, 0.018) + liquidWave(q, vec2(-0.37, 0.93), 17.0, 0.8, 0.012) + liquidWave(q, vec2(0.96, -0.28), 31.0, 1.1, 0.008) + liquidWave(q, vec2(-0.71, -0.7), 57.0, 1.6, 0.005) + liquidWave(q, vec2(0.21, 0.98), 101.0, 2.1, 0.003); }",
].join("\n");

const LIQUID_COLOUR = [
  "#include <color_fragment>",
  "vec2 liquidAcross = vLiquidAt.xz + liquidSeed;",
  "float liquidIslandShare = foamShare + scumShare;",
  "if (liquidFilm > 0.0) {",
  "  diffuseColor.rgb *= 1.0 + liquidFilm * ((liquidCloud(liquidAcross * 2.4 + liquidTime * 0.01) - 0.5) * 1.1 + (liquidCloud(liquidAcross * 9.0 - liquidTime * 0.016) - 0.5) * 0.5);",
  "}",
  "diffuseColor.rgb *= liquidMirror;",
  "if (liquidIslandShare > 0.0) {",
  "  float fromCentre = length(vLiquidAt.xz);",
  "  float outward = fromCentre / max(fromCentre + length(vLiquidWall), 0.0001);",
  "  float wobble = (liquidCloud(liquidAcross * 2.6 * foamGrain + 3.0 + liquidTime * 0.004) - 0.5) * 0.5 + (liquidCloud(liquidAcross * 9.0 + 1.0) - 0.5) * 0.16;",
  "  float reach = min(sqrt(liquidIslandShare), 0.92);",
  "  float centrePatch = 1.0 - smoothstep(reach - 0.16, reach + 0.1, outward + wobble);",
  "  float rimBand = 1.0 - smoothstep(reach * 0.2, reach * 0.2 + 0.07, length(vLiquidWall) + wobble * 0.08);",
  "  float island = mix(rimBand, centrePatch, foamCentre);",
  "  if (foamShare > 0.0 && island > 0.0) {",
  "    vec3 small = liquidBubbles(liquidAcross * 520.0);",
  "    vec3 middle = liquidBubbles(liquidAcross * 260.0 + 3.0);",
  "    float mid = smoothstep(0.45, 0.8, liquidNoise(liquidAcross * 31.0 + 8.0)) * island;",
  "    vec3 bubble = mix(small, middle, mid);",
  "    liquidDome = mix(0.62, bubble.x, 0.7) * (0.8 + 0.4 * liquidNoise(liquidAcross * 60.0));",
  "    liquidBubbleTilt = bubble.yz * island * 0.25;",
  "    liquidFoam = island * (0.55 + 0.45 * smoothstep(0.2, 0.7, liquidNoise(liquidAcross * 14.0)));",
  "    diffuseColor.rgb = mix(diffuseColor.rgb, foamColour * (0.5 + 0.6 * liquidDome), liquidFoam * foamCover);",
  "  }",
  "  if (scumShare > 0.0) {",
  "    float sheen = smoothstep(0.35, 0.8, liquidCloud(liquidAcross * 4.2 + 7.0));",
  "    liquidScum = sheen * mix(0.35, 1.0, island) * smoothstep(0.0, 0.5, island + 0.15) * 0.8;",
  "    diffuseColor.rgb = mix(diffuseColor.rgb, scumColour, liquidScum * 0.3);",
  "  }",
  "}",
].join("\n");

const LIQUID_ROUGH = "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, max(liquidFoam * 0.8, liquidScum));";
const LIQUID_METAL = "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.35, liquidScum);";

const LIQUID_NORMAL = [
  "#include <normal_fragment_maps>",
  "float liquidEdge = length(vLiquidWall);",
  "vec2 liquidTilt = liquidSlope(liquidAcross) * liquidRipple * (1.0 - liquidFoam * 0.7);",
  "liquidTilt += liquidBubbleTilt * 0.5;",
  "liquidTilt -= (liquidEdge > 0.0001 ? vLiquidWall / liquidEdge : vec2(0.0)) * 0.2 * exp(-liquidEdge / 0.003);",
  "normal = normalize((viewMatrix * vec4(normalize(vec3(-liquidTilt.x, 1.0, -liquidTilt.y)), 0.0)).xyz);",
].join("\n");

const LIQUID_LIGHTS = "#include <lights_physical_fragment>\nmaterial.specularColorBlended = mix(material.specularColorBlended, foamGlint, liquidFoam * liquidDome * liquidDome);";

const LIQUID_OUTPUT = [
  "float liquidFacing = saturate(dot(normalize(vViewPosition), normal));",
  "float liquidFresnel = 0.02 + 0.98 * pow(1.0 - liquidFacing, 5.0);",
  "float liquidColumn = min(vLiquidDepth, liquidEdge * 1.4);",
  "float liquidCover = max(1.0 - exp(-liquidColumn * liquidAbsorb / max(liquidFacing, 0.3)), liquidCoverFloor);",
  "liquidCover = max(liquidCover, max(liquidFoam * foamCover, liquidScum * 0.9));",
  "float liquidWallShade = mix(0.75, 1.0, smoothstep(0.0, 0.03, liquidEdge));",
  "vec3 liquidGlint = reflectedLight.directSpecular / (1.0 + dot(reflectedLight.directSpecular, vec3(0.33)) / LIQUID_BRIGHTEST_GLINT);",
  "outgoingLight = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) * liquidCover * mix(1.0 - 0.2 * exp(-liquidEdge / 0.006), 1.0, liquidFoam) + liquidGlint + reflectedLight.indirectSpecular * liquidWallShade;",
  "if (liquidClear > 0.0) {",
  "  vec2 netAt = liquidAcross * 9.0 + liquidSlope(liquidAcross) * 9.0;",
  "  float netA = 1.0 - abs(2.0 * liquidNoise(netAt + liquidTime * 0.09) - 1.0);",
  "  float netB = 1.0 - abs(2.0 * liquidNoise(netAt * 1.7 + 4.0 - liquidTime * 0.07) - 1.0);",
  "  outgoingLight += vec3(0.95, 1.0, 0.97) * liquidClear * pow(netA * netB, 4.0) * (1.0 - liquidFoam);",
  "}",
  "diffuseColor.a = 1.0 - (1.0 - liquidCover) * (1.0 - liquidFresnel);",
  "#include <opaque_fragment>",
].join("\n");

const LIQUID_CLOCK: THREE.IUniform<number> = { value: 0 };

export function setLiquidTime(seconds: number): void {
  LIQUID_CLOCK.value = seconds;
}

const FOAM_LIFTS_BODY = 2.4;
const PALE_FOAM_GRAIN = 2.6;
const SOAP_FILM_ON_CLEAR_WATER = 0.42;
const FOAM_GLINT_FALLBACK = new THREE.Color(0.6, 0.6, 0.6);
const LILAC_SILVER_GLINT = new THREE.Color(0.62, 0.56, 0.72);
const PLUM_FOAM_TINT = new THREE.Color(1.3, 0.92, 1.18);
const DARK_FOAM_LUMINANCE = 0.035;
const WATER_NET_LIGHT = 0.07;
const BRIGHTEST_GLINT = 1.1;
const MIRROR_DARK_BODY = 0.3;
const PALE_LIQUID_ALBEDO = 0.5;
const PALE_FOAM_SHARE = 0.55;
const OPEN_SKY_FILL_MAKEUP: LinearRgb = [1.28, 1.28, 1.28];

const rippleOf = (look: SubstanceLook): number => (/mirror/.test(look.surface) ? 0.45 : /viscid/.test(look.surface) ? 0.3 : /boil/.test(look.surface) ? 2.6 : /gently heated|flowing|on a furnace/.test(look.surface) ? 1.7 : /thick|lather/.test(look.surface) ? 0.5 : /thin/.test(look.surface) ? 0.8 : 1);
const filmOf = (look: SubstanceLook): number => (look.transparency !== "translucent" || /mirror/.test(look.surface) ? 0 : /soapy/.test(look.surface) ? SOAPY_CLOUD_FILM : 0.22);
const seedOf = (key: string): number => [...key].reduce((sum, letter, i) => (sum + letter.charCodeAt(0) * (i + 1)) % 97, 0) * 0.37;

export function liquidBodyColour(look: SubstanceLook): THREE.Color {
  const body = displayAlbedo(look.renderHex);
  return body.multiplyScalar(Math.min(1, BRIGHTEST_BODY_ALBEDO / Math.max(body.r, body.g, body.b)));
}

function derivedFoam(look: SubstanceLook, body: THREE.Color, clear: boolean, pale: boolean): THREE.Color {
  const foam = clear ? new THREE.Color(0.7, 0.7, 0.68) : body.clone().multiplyScalar(pale ? PALE_FOAM_SHARE : FOAM_LIFTS_BODY);
  const foamLuminance = foam.r * 0.2126 + foam.g * 0.7152 + foam.b * 0.0722;
  if (!clear && foamLuminance < DARK_FOAM_LUMINANCE) foam.multiplyScalar(DARK_FOAM_LUMINANCE / Math.max(foamLuminance, 0.0005));
  if (/plum|violet|purple/.test(look.surface)) foam.multiply(PLUM_FOAM_TINT);
  return foam;
}

function liquidShader(material: THREE.MeshStandardMaterial, look: SubstanceLook): void {
  const marks = liquidMarks(look);
  const clear = look.transparency === "clear";
  const body = liquidBodyColour(look);
  const pale = body.r * 0.2126 + body.g * 0.7152 + body.b * 0.0722 > PALE_LIQUID_ALBEDO;
  const foam = look.frothHex ? displayAlbedo(look.frothHex) : derivedFoam(look, body, clear, pale);
  material.onBeforeCompile = (shader) => {
    const row = displayAlbedo(look.renderHex);
    const darkBath = look.transparency === "translucent" && row.r * 0.2126 + row.g * 0.7152 + row.b * 0.0722 < DARK_BATH_LUMINANCE;
    shader.uniforms.liquidAbsorb = { value: darkBath ? DARK_BATH_ABSORPTION_PER_METRE : look.transparency === "translucent" && pale ? (/soapy/.test(look.surface) ? SOAPY_CLOUD_ABSORPTION_PER_METRE : PALE_TRANSLUCENT_ABSORPTION_PER_METRE) : ABSORPTION_PER_METRE[look.transparency] };
    shader.uniforms.liquidCoverFloor = { value: clear ? CLEAR_WATER_COVER : look.transparency === "opaque" ? OPAQUE_COVER : TRANSLUCENT_COVER_FLOOR };
    shader.uniforms.liquidClear = { value: clear ? WATER_NET_LIGHT : 0 };
    shader.uniforms.liquidTime = LIQUID_CLOCK;
    shader.uniforms.liquidSeed = { value: seedOf(look.key) };
    shader.uniforms.liquidRipple = { value: rippleOf(look) };
    shader.uniforms.liquidFilm = { value: filmOf(look) };
    shader.uniforms.liquidMirror = { value: /mirror/.test(look.surface) ? MIRROR_DARK_BODY : 1 };
    shader.uniforms.foamShare = { value: marks.foam };
    shader.uniforms.scumShare = { value: marks.scum };
    shader.uniforms.foamColour = { value: foam };
    shader.uniforms.foamGlint = { value: /lilac/.test(look.surface) ? LILAC_SILVER_GLINT : FOAM_GLINT_FALLBACK };
    shader.uniforms.foamCover = { value: clear ? SOAP_FILM_ON_CLEAR_WATER : 0.97 };
    shader.uniforms.foamGrain = { value: pale ? PALE_FOAM_GRAIN : 1 };
    shader.uniforms.foamCentre = { value: /flower/.test(look.surface) ? 1 : 0 };
    shader.uniforms.scumColour = { value: displayAlbedo(SCUM_HEX) };
    shader.vertexShader = `attribute float liquidDepth;\nattribute vec2 liquidWall;\nvarying vec3 vLiquidAt;\nvarying float vLiquidDepth;\nvarying vec2 vLiquidWall;\n${shader.vertexShader.replace("#include <begin_vertex>", LIQUID_VERTEX)}`;
    shader.fragmentShader = `#define LIQUID_BRIGHTEST_GLINT ${BRIGHTEST_GLINT.toFixed(1)}\n${LIQUID_SHAPES}\n${shader.fragmentShader
      .replace("#include <color_fragment>", LIQUID_COLOUR)
      .replace("#include <roughnessmap_fragment>", LIQUID_ROUGH)
      .replace("#include <metalnessmap_fragment>", LIQUID_METAL)
      .replace("#include <normal_fragment_maps>", LIQUID_NORMAL)
      .replace("#include <lights_physical_fragment>", LIQUID_LIGHTS)
      .replace("#include <opaque_fragment>", LIQUID_OUTPUT)}`;
  };
  material.customProgramCacheKey = () => "liquid-surface";
}

const SCUM_HEX = "#9A7044";
const LIQUID_ROUGHNESS = 0.07;
const LIQUID_SKY_REFLECTION = 0.85;

export function liquidMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`liquid:${look.key}`, async () => {
    const clear = look.transparency === "clear";
    const seeThrough = look.transparency !== "opaque";
    const material = new THREE.MeshStandardMaterial({
      color: clear ? new THREE.Color(0.02, 0.03, 0.03) : look.transparency === "opaque" ? displayAlbedo(look.renderHex, OPEN_SKY_FILL_MAKEUP) : liquidBodyColour(look),
      roughness: LIQUID_ROUGHNESS,
      metalness: 0,
      envMapIntensity: LIQUID_SKY_REFLECTION,
      transparent: seeThrough,
      depthWrite: !seeThrough,
    });
    if (seeThrough) {
      material.blending = THREE.CustomBlending;
      material.blendSrc = THREE.OneFactor;
      material.blendDst = THREE.OneMinusSrcAlphaFactor;
    }
    noteSurface(material, { label: `liquid ${look.key}`, kind: "smooth" });
    library.reflectOpenSky(material);
    liquidShader(material, look);
    return material;
  });
}

export function liquidBodyMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`liquid-body:${look.key}`, async () =>
    noteSurface(new THREE.MeshStandardMaterial({ color: liquidBodyColour(look), roughness: 0.6, metalness: 0, envMapIntensity: 0.2 }), { label: `liquid body ${look.key}`, kind: "smooth" }),
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
  "float crystalMilk = clamp(0.06 + 0.55 * smoothstep(0.36, 0.78, crystalCloud) + 0.28 * crystalVeil, 0.0, 1.0);",
  "diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.5, 0.49, 0.46), diffuseColor.rgb, crystalMilk);",
  "crystalAlpha = mix(0.34, 0.94, crystalMilk);",
  "vec3 crystalGlow = diffuseColor.rgb * (0.16 + 0.34 * crystalMilk);",
].join("\n");

const CRYSTAL_EMISSIVE = "#include <emissivemap_fragment>\ntotalEmissiveRadiance += crystalGlow;";

const CRYSTAL_ROUGH = "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.22, 0.62, smoothstep(0.38, 0.7, crystalNoise(vCrystalAt * 160.0 + vCrystalSeed.zxy)));";

const CRYSTAL_ALPHA = [
  "float crystalGrazing = pow(1.0 - saturate(abs(dot(normalize(vViewPosition), normal))), 3.0);",
  "float crystalGleam = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.33));",
  "diffuseColor.a = clamp(crystalAlpha + crystalGrazing * 0.5 + crystalGleam, 0.0, 1.0);",
  "#include <opaque_fragment>",
].join("\n");

const MILKY_CRYSTAL_BODY = 0.55;

export function crystalMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`crystal:${look.key}`, async () => {
    const colour = displayAlbedo(look.renderHex);
    if (look.transparency === "opaque") {
      const opaque = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.38, metalness: 0, envMapIntensity: 0.7, flatShading: true });
      library.reflectOpenSky(opaque);
      return noteSurface(opaque, { label: `crystals ${look.key}`, kind: "smooth", realFacets: true, openWork: true });
    }
    colour.multiplyScalar(MILKY_CRYSTAL_BODY);
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.34, metalness: 0, envMapIntensity: 0.55, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    noteSurface(material, { label: `crystals ${look.key}`, kind: "smooth", realFacets: true, openWork: true });
    library.reflectOpenSky(material);
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
