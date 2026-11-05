import * as THREE from "three";
import { liquidMarks, type SubstanceFill, type SubstanceLook, type Transparency } from "@/features/process/domain/substance-look";
import { albedoForDisplay, type LinearRgb } from "../domain/lit-colour";
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
  "normal = normalize(vTriTurn * normalize(tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z));",
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
  dung: { scan: "dryMud", roughness: 1, leastRough: 0.8, normalScale: 0.5, contrast: 0.3, gain: [1.02, 0.96, 0.76], specular: 0.25, contact: 0.5, env: 0.35 },
  roots: { scan: "bark", roughness: 1, leastRough: 0.8, normalScale: 1.1, contrast: 0.5, gain: [1.16, 1.08, 1], specular: 0.3, contact: 0.55, env: 0.35 },
  flowers: { scan: "leaves", roughness: 1, leastRough: 0.82, normalScale: 0.8, contrast: 0.4, gain: [1.14, 1.04, 0.94], specular: 0.3, contact: 0.5, env: 0.35 },
  leaves: { scan: "leaves", roughness: 1, leastRough: 0.75, normalScale: 1, contrast: 0.5, gain: [0.95, 0.95, 0.95], specular: 0.4, contact: 0.45, env: 0.4 },
  powder: { scan: "flour", roughness: 1, leastRough: 0.85, normalScale: 0.8, contrast: 0.4, gain: [0.84, 0.84, 0.84], specular: 0.25, contact: 0, env: 0.4 },
  crystals: { scan: "flour", roughness: 1, leastRough: 0.85, normalScale: 0.7, contrast: 0.3, gain: [0.8, 0.8, 0.8], specular: 0.25, contact: 0, env: 0.4 },
  paste: { scan: "wetMud", tileMetres: 1.25, roughness: 0.42, leastRough: 0.22, normalScale: 0.06, contrast: 0.05, gain: [0.92, 0.92, 0.92], specular: 0.8, contact: 0, env: 0.45 },
  cloth: { scan: "weave", roughness: 1, leastRough: 0.72, normalScale: 1.2, contrast: 0.5, gain: [0.86, 0.86, 0.86], specular: 0.4, contact: 0.4, env: 0.2 },
};

const SURFACE_OVERRIDES: readonly { readonly words: RegExp; readonly apply: (form: FormSurface) => FormSurface }[] = [
  { words: /\bdust\b/, apply: (form) => ({ ...form, scan: "sawdust", tileMetres: 0.13, contrast: 0.62, normalScale: 1 }) },
  { words: /^granular$/, apply: (form) => ({ ...form, scan: "sawdust", tileMetres: 0.055, contrast: 0.42, normalScale: 1.5 }) },
  { words: /fibrous/, apply: (form) => ({ ...form, scan: "bark", tileMetres: 0.09, contrast: 0.42, normalScale: 0.95, leastRough: 0.46, specular: 0.65 }) },
  { words: /sticky|glassy/, apply: (form) => ({ ...form, leastRough: 0.13, specular: 1 }) },
];

const RUBBED_COPPER_HEX = "#6A4A36";
const RUBBED_SHARE = 0.55;

function surfaceOf(look: SubstanceLook): FormSurface {
  const form = FORM_SURFACES[look.fill as ScannedFill];
  return SURFACE_OVERRIDES.filter(({ words }) => words.test(look.surface)).reduce((current, { apply }) => apply(current), form);
}

const PILE_BED_DARKENING = 0.42;

async function scannedMaterial(library: MaterialLibrary, look: SubstanceLook, bed: boolean): Promise<THREE.MeshStandardMaterial> {
  const form = surfaceOf(look);
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
    transparent: look.fill === "paste" && look.transparency === "translucent",
    opacity: look.fill === "paste" && look.transparency === "translucent" ? 0.93 : 1,
  });
  if (bed && look.fill !== "crystals") material.color.multiplyScalar(PILE_BED_DARKENING);
  const perMetre = 1 / (form.tileMetres ?? scan.tileMetres);
  const rubbed = /coppery/.test(look.surface);
  return noteSurface(projectScan(material, perMetre, form.contrast, form.leastRough, { specular: form.specular, contact: bed ? 0 : form.contact, rubbed: rubbed ? RUBBED_SHARE : 0, rubbedColour: rubbed ? displayAlbedo(RUBBED_COPPER_HEX) : undefined }), { label: `substance ${look.key}`, kind: "model", perMetre, openWork: !bed && look.fill !== "powder" && look.fill !== "paste" });
}

export function substanceMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`substance:${look.key}`, () => scannedMaterial(library, look, false));
}

export function pileBedMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`pile-bed:${look.key}`, () => scannedMaterial(library, look, true));
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

const GLASS_ALPHA = [
  "float glassGrazing = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);",
  "float glassGleam = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.33));",
  "diffuseColor.a = clamp(diffuseColor.a + glassGrazing * 0.6 + glassGleam, 0.0, 1.0);",
  "#include <opaque_fragment>",
].join("\n");

const CLEAR_CRYSTAL_BODY = 0.34;
const CLEAR_CRYSTAL_ALPHA = 0.3;

export function crystalMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`crystal:${look.key}`, async () => {
    const clear = look.transparency === "clear";
    const colour = displayAlbedo(look.renderHex);
    if (clear) colour.multiplyScalar(CLEAR_CRYSTAL_BODY);
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: clear ? 0.08 : 0.34, metalness: 0, envMapIntensity: clear ? 2 : 0.7, transparent: clear, opacity: clear ? CLEAR_CRYSTAL_ALPHA : 1, flatShading: true, side: clear ? THREE.DoubleSide : THREE.FrontSide });
    noteSurface(material, { label: `crystals ${look.key}`, kind: "smooth", realFacets: true, openWork: true });
    if (!clear) return material;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", GLASS_ALPHA);
    };
    material.customProgramCacheKey = () => "clear-crystal";
    return material;
  });
}
