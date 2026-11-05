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
    vertexColors: look.fill === "cloth",
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
const DARK_BATH_ABSORPTION_PER_METRE = 130;
const DARK_BATH_LUMINANCE = 0.05;
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
  "  vec2 warp = vec2(liquidCloud(liquidAcross * 1.7 + 4.0), liquidCloud(liquidAcross * 1.7 + 11.0)) - 0.5;",
  "  float gather = liquidCloud((liquidAcross + warp * 0.6) * 3.1 * foamGrain + 3.0 + liquidTime * 0.004);",
  "  float islandAt = mix(0.72, 0.4, min(liquidIslandShare / 0.6, 1.0));",
  "  float island = smoothstep(islandAt - 0.035, islandAt + 0.05, gather);",
  "  if (foamShare > 0.0 && island > 0.0) {",
  "    vec3 small = liquidBubbles(liquidAcross * 380.0);",
  "    vec3 middle = liquidBubbles(liquidAcross * 170.0 + 3.0);",
  "    vec3 wide = liquidBubbles(liquidAcross * 92.0 + 5.0);",
  "    float big = smoothstep(0.72, 0.9, liquidNoise(liquidAcross * 19.0));",
  "    float mid = smoothstep(0.3, 0.62, liquidNoise(liquidAcross * 37.0 + 8.0));",
  "    vec3 bubble = mix(mix(small, middle, mid), wide, big);",
  "    liquidDome = bubble.x * (0.74 + 0.26 * liquidBubbles(liquidAcross * 900.0 + 2.0).x) * (0.72 + 0.56 * liquidNoise(liquidAcross * 70.0));",
  "    liquidBubbleTilt = bubble.yz * island;",
  "    liquidFoam = island;",
  "    diffuseColor.rgb = mix(diffuseColor.rgb, foamColour * (0.42 + 0.8 * liquidDome), liquidFoam * foamCover);",
  "  }",
  "  if (scumShare > 0.0) {",
  "    float rimOfIsland = smoothstep(islandAt - 0.045, islandAt, gather) * (1.0 - smoothstep(islandAt + 0.01, islandAt + 0.06, gather));",
  "    liquidScum = rimOfIsland * smoothstep(0.3, 0.7, liquidNoise(liquidAcross * 26.0)) * (0.5 + 0.5 * liquidNoise(liquidAcross * 90.0));",
  "    diffuseColor.rgb = mix(diffuseColor.rgb, scumColour, liquidScum * 0.4);",
  "  }",
  "}",
].join("\n");

const LIQUID_ROUGH = "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, max(liquidFoam * 0.8, liquidScum));";
const LIQUID_METAL = "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.5, liquidScum);";

const LIQUID_NORMAL = [
  "#include <normal_fragment_maps>",
  "float liquidEdge = length(vLiquidWall);",
  "vec2 liquidTilt = liquidSlope(liquidAcross) * liquidRipple * (1.0 - liquidFoam * 0.7);",
  "liquidTilt += liquidBubbleTilt * 0.5;",
  "liquidTilt -= (liquidEdge > 0.0001 ? vLiquidWall / liquidEdge : vec2(0.0)) * 0.55 * exp(-liquidEdge / 0.007);",
  "normal = normalize((viewMatrix * vec4(normalize(vec3(-liquidTilt.x, 1.0, -liquidTilt.y)), 0.0)).xyz);",
].join("\n");

const LIQUID_LIGHTS = "#include <lights_physical_fragment>\nmaterial.specularColorBlended = mix(material.specularColorBlended, foamGlint, liquidFoam * liquidDome * liquidDome);";

const LIQUID_OUTPUT = [
  "float liquidFacing = saturate(dot(normalize(vViewPosition), normal));",
  "float liquidFresnel = 0.02 + 0.98 * pow(1.0 - liquidFacing, 5.0);",
  "float liquidColumn = min(vLiquidDepth, liquidEdge * 1.4);",
  "float liquidCover = max(1.0 - exp(-liquidColumn * liquidAbsorb / max(liquidFacing, 0.3)), liquidCoverFloor);",
  "liquidCover = max(liquidCover, max(liquidFoam * foamCover, liquidScum * 0.9));",
  "float liquidWallShade = mix(0.3, 1.0, smoothstep(0.0, 0.09, liquidEdge));",
  "vec3 liquidGlint = reflectedLight.directSpecular / (1.0 + dot(reflectedLight.directSpecular, vec3(0.33)) / LIQUID_BRIGHTEST_GLINT);",
  "outgoingLight = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) * liquidCover * mix(1.0 - 0.45 * exp(-liquidEdge / 0.012), 1.0, liquidFoam) + liquidGlint + reflectedLight.indirectSpecular * liquidWallShade;",
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
const PALE_FOAM_LIFT = 1.45;
const PALE_FOAM_GRAIN = 2.6;
const SOAP_FILM_ON_CLEAR_WATER = 0.42;
const FOAM_GLINT_FALLBACK = new THREE.Color(0.6, 0.6, 0.6);
const LILAC_SILVER_GLINT = new THREE.Color(0.62, 0.56, 0.72);
const WATER_NET_LIGHT = 0.07;
const BRIGHTEST_GLINT = 1.1;
const MIRROR_DARK_BODY = 0.3;
const DEEP_BODY = 0.72;
const PALE_LIQUID_LUMINANCE = 0.55;
const PALE_BODY = 0.38;

const rippleOf = (look: SubstanceLook): number => (/mirror/.test(look.surface) ? 0.45 : /boil/.test(look.surface) ? 2.6 : /gently heated|flowing|on a furnace/.test(look.surface) ? 1.7 : /thick|lather/.test(look.surface) ? 0.5 : /thin/.test(look.surface) ? 0.8 : 1);
const filmOf = (look: SubstanceLook): number => (look.transparency === "translucent" && !/mirror/.test(look.surface) ? 0.22 : 0);
const seedOf = (key: string): number => [...key].reduce((sum, letter, i) => (sum + letter.charCodeAt(0) * (i + 1)) % 97, 0) * 0.37;

export function liquidBodyColour(look: SubstanceLook): THREE.Color {
  const body = displayAlbedo(look.renderHex);
  const luminance = body.r * 0.2126 + body.g * 0.7152 + body.b * 0.0722;
  return body.multiplyScalar(luminance > PALE_LIQUID_LUMINANCE ? PALE_BODY : DEEP_BODY);
}

function liquidShader(material: THREE.MeshStandardMaterial, look: SubstanceLook): void {
  const marks = liquidMarks(look);
  const clear = look.transparency === "clear";
  const body = liquidBodyColour(look);
  const pale = body.r * 0.2126 + body.g * 0.7152 + body.b * 0.0722 > PALE_LIQUID_LUMINANCE * PALE_BODY * 0.8;
  const foam = clear ? new THREE.Color(0.7, 0.7, 0.68) : body.clone().multiplyScalar(pale ? PALE_FOAM_LIFT : FOAM_LIFTS_BODY / DEEP_BODY);
  material.onBeforeCompile = (shader) => {
    const row = displayAlbedo(look.renderHex);
    const darkBath = look.transparency === "translucent" && row.r * 0.2126 + row.g * 0.7152 + row.b * 0.0722 < DARK_BATH_LUMINANCE;
    shader.uniforms.liquidAbsorb = { value: darkBath ? DARK_BATH_ABSORPTION_PER_METRE : ABSORPTION_PER_METRE[look.transparency] };
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
      color: clear ? new THREE.Color(0.02, 0.03, 0.03) : liquidBodyColour(look),
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
    library.reflectOpenSky(material);
    if (!clear) return material;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", GLASS_ALPHA);
    };
    material.customProgramCacheKey = () => "clear-crystal";
    return material;
  });
}
