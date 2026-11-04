import * as THREE from "three";
import type { SubstanceFill, SubstanceLook, Transparency } from "@/features/process/domain/substance-look";
import { albedoForDisplay, type LinearRgb } from "../domain/lit-colour";
import { noteSurface, type MaterialLibrary, type ScanName } from "./material-library";

const TRIPLANAR_VERTEX = [
  "#include <begin_vertex>",
  "vTriPosition = position;",
  "vTriNormal = normal;",
  "#ifdef USE_INSTANCING",
  "vTriTurn = normalMatrix * mat3(instanceMatrix);",
  "#else",
  "vTriTurn = normalMatrix;",
  "#endif",
].join("\n");

const TRIPLANAR_SAMPLING = [
  "varying vec3 vTriPosition;",
  "varying vec3 vTriNormal;",
  "varying mat3 vTriTurn;",
  "uniform float triPerMetre;",
  "uniform float triContrast;",
  "uniform float triLeastRough;",
  "vec3 triWeights() { vec3 w = pow(abs(normalize(vTriNormal)), vec3(5.0)); return w / (w.x + w.y + w.z); }",
  "vec3 triSample(sampler2D source) { vec3 w = triWeights(); vec3 p = vTriPosition * triPerMetre; return texture2D(source, p.zy).rgb * w.x + texture2D(source, p.xz).rgb * w.y + texture2D(source, p.xy).rgb * w.z; }",
].join("\n");

const TRIPLANAR_COLOUR = [
  "vec3 triColour = triSample(map);",
  "float triMean = max(dot(textureLod(map, vec2(0.5), 12.0).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.02);",
  "float triLuminance = dot(triColour, vec3(0.2126, 0.7152, 0.0722)) / triMean;",
  "diffuseColor.rgb *= clamp(mix(1.0, triLuminance, triContrast), 0.35, 1.7);",
].join("\n");

const TRIPLANAR_ROUGHNESS = "float roughnessFactor = max(roughness * triSample(roughnessMap).g, triLeastRough);";

const TRIPLANAR_NORMAL = [
  "vec3 triW = triWeights();",
  "vec3 triP = vTriPosition * triPerMetre;",
  "vec3 triN = normalize(vTriNormal);",
  "vec3 tx = texture2D(normalMap, triP.zy).xyz * 2.0 - 1.0;",
  "vec3 ty = texture2D(normalMap, triP.xz).xyz * 2.0 - 1.0;",
  "vec3 tz = texture2D(normalMap, triP.xy).xyz * 2.0 - 1.0;",
  "tx = vec3(tx.xy * normalScale + triN.zy, abs(tx.z) * triN.x);",
  "ty = vec3(ty.xy * normalScale + triN.xz, abs(ty.z) * triN.y);",
  "tz = vec3(tz.xy * normalScale + triN.xy, abs(tz.z) * triN.z);",
  "normal = normalize(vTriTurn * normalize(tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z));",
].join("\n");

export function projectScan(material: THREE.MeshStandardMaterial, perMetre: number, contrast: number, leastRough: number): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.triLeastRough = { value: leastRough };
    shader.uniforms.triPerMetre = { value: perMetre };
    shader.uniforms.triContrast = { value: contrast };
    shader.vertexShader = `varying vec3 vTriPosition;\nvarying vec3 vTriNormal;\nvarying mat3 vTriTurn;\n${shader.vertexShader.replace("#include <begin_vertex>", TRIPLANAR_VERTEX)}`;
    shader.fragmentShader = `${TRIPLANAR_SAMPLING}\n${shader.fragmentShader
      .replace("#include <map_fragment>", TRIPLANAR_COLOUR)
      .replace("#include <roughnessmap_fragment>", TRIPLANAR_ROUGHNESS)
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
  readonly roughness: number;
  readonly normalScale: number;
  readonly contrast: number;
  readonly gain: LinearRgb;
}

const FORM_SURFACES: Readonly<Record<Exclude<SubstanceFill, "liquid" | "crystals">, FormSurface>> = {
  dung: { scan: "dryMud", roughness: 1, normalScale: 0.55, contrast: 0.32, gain: [0.86, 0.86, 0.86] },
  roots: { scan: "bark", roughness: 1, normalScale: 1.1, contrast: 0.6, gain: [1, 1, 1] },
  flowers: { scan: "leaves", roughness: 1, normalScale: 0.8, contrast: 0.45, gain: [0.72, 0.72, 0.72] },
  leaves: { scan: "leaves", roughness: 1, normalScale: 1, contrast: 0.55, gain: [1.1, 1.1, 1.1] },
  powder: { scan: "flour", roughness: 1, normalScale: 0.8, contrast: 0.45, gain: [0.88, 0.88, 0.88] },
  paste: { scan: "wetMud", roughness: 0.42, normalScale: 0.32, contrast: 0.25, gain: [1, 1, 1] },
  cloth: { scan: "weave", roughness: 1, normalScale: 1.4, contrast: 0.55, gain: [0.9, 0.9, 0.9] },
};

const LOOSE_DUST = "dry loose dust";

function surfaceOf(look: SubstanceLook): FormSurface {
  const form = FORM_SURFACES[look.fill as keyof typeof FORM_SURFACES];
  return look.surface === LOOSE_DUST ? { ...form, scan: "sawdust", contrast: 0.6, normalScale: 1 } : form;
}

export function substanceMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`substance:${look.key}`, async () => {
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
      envMapIntensity: look.fill === "paste" ? 0.7 : 0.45,
      transparent: look.fill === "paste" && look.transparency === "translucent",
      opacity: look.fill === "paste" && look.transparency === "translucent" ? 0.93 : 1,
    });
    return noteSurface(projectScan(material, 1 / scan.tileMetres, form.contrast, look.fill === "paste" ? 0.16 : 0.72), { label: `substance ${look.key}`, kind: "model", perMetre: 1 / scan.tileMetres });
  });
}

const LIQUID_OPACITY: Readonly<Record<Transparency, number>> = { clear: 0.1, translucent: 1, opaque: 1 };
const CLEAR_TINT = 0.05;
const CLEAR_CRYSTAL_BODY = 0.42;

const REFLECTS_WHEN_GRAZED = [
  "float grazing = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 4.0);",
  "diffuseColor.a = mix(diffuseColor.a, 1.0, grazing);",
  "#include <opaque_fragment>",
].join("\n");

export function liquidMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`liquid:${look.key}`, async () => {
    const colour = displayAlbedo(look.renderHex);
    if (look.transparency === "clear") colour.multiplyScalar(CLEAR_TINT);
    const opacity = LIQUID_OPACITY[look.transparency];
    const material = new THREE.MeshStandardMaterial({
      color: colour,
      roughness: look.transparency === "opaque" ? 0.26 : 0.1,
      metalness: 0,
      envMapIntensity: look.transparency === "clear" ? 1.1 : 0.07,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    });
    noteSurface(material, { label: `liquid ${look.key}`, kind: "smooth" });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", REFLECTS_WHEN_GRAZED);
    };
    material.customProgramCacheKey = () => "liquid-surface";
    return material;
  });
}

export function crystalMaterial(library: MaterialLibrary, look: SubstanceLook): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`crystal:${look.key}`, async () => {
    const clear = look.transparency === "clear";
    const colour = displayAlbedo(look.renderHex);
    if (clear) colour.multiplyScalar(CLEAR_CRYSTAL_BODY);
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: clear ? 0.2 : 0.42, metalness: 0, envMapIntensity: clear ? 1.6 : 0.65, transparent: clear, opacity: clear ? 0.56 : 1, flatShading: true, side: clear ? THREE.DoubleSide : THREE.FrontSide });
    noteSurface(material, { label: `crystals ${look.key}`, kind: "smooth" });
    if (!clear) return material;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", REFLECTS_WHEN_GRAZED);
    };
    material.customProgramCacheKey = () => "liquid-surface";
    return material;
  });
}

export function bubbleMaterial(library: MaterialLibrary): Promise<THREE.MeshStandardMaterial> {
  return library.shared("bubble-shell", async () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.28, metalness: 0, envMapIntensity: 1, transparent: true, opacity: 0.22, depthWrite: false });
    noteSurface(material, { label: "bubble", kind: "smooth" });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", REFLECTS_WHEN_GRAZED);
    };
    material.customProgramCacheKey = () => "liquid-surface";
    return material;
  });
}

export function copperScumMaterial(library: MaterialLibrary): Promise<THREE.MeshStandardMaterial> {
  return library.shared("scum:copper", async () => {
    const scan = await library.scan("dryMud");
    const material = new THREE.MeshStandardMaterial({ map: scan.colour, color: displayAlbedo("#C07A44"), roughness: 0.42, metalness: 0.7, envMapIntensity: 1.4, transparent: true, depthWrite: false });
    noteSurface(material, { label: "copper scum", kind: "smooth" });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        ["float patchTone = dot(texture2D(map, vMapUv * 0.37).rgb, vec3(0.33)) / max(dot(textureLod(map, vMapUv, 12.0).rgb, vec3(0.33)), 0.02);", "diffuseColor.a *= smoothstep(1.1, 1.55, patchTone) * 0.8;"].join("\n"),
      );
    };
    material.customProgramCacheKey = () => "copper-scum";
    return material;
  });
}
