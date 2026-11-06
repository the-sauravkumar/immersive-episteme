import * as THREE from "three";
import { roundSegments } from "../domain/surface-density";
import type { CurvedWords, PaintedWords } from "../domain/yard-plan";
import { noteSurface, type MaterialLibrary } from "./material-library";

const COLOURS: Record<PaintedWords["colour"], string> = { ink: "#14234e", lime: "#efe7d2", caption: "#0a1636", sample: "#8d1c14" };

const SMALL_BEVEL_STEPS = 3;
const LARGE_BEVEL_STEPS = 5;
const LARGE_BEVEL_METRES = 0.021;

export function softBoxGeometry(width: number, height: number, depth: number, radius: number, segments: number, tile: readonly [number, number]): THREE.BufferGeometry {
  const steps = radius > LARGE_BEVEL_METRES ? LARGE_BEVEL_STEPS : SMALL_BEVEL_STEPS;
  const cells = steps * 2 + segments;
  const geometry = new THREE.BoxGeometry(1, 1, 1, cells, cells, cells);
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal!;
  const uv = geometry.attributes.uv!;
  const bevelled = (unit: number, span: number): number => {
    const index = Math.round(unit * cells);
    if (index <= steps) return (index / steps) * radius;
    if (index >= cells - steps) return span - ((cells - index) / steps) * radius;
    return radius + ((index - steps) / segments) * (span - radius * 2);
  };
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;
  const hz = depth / 2 - radius;
  const point = new THREE.Vector3();
  const core = new THREE.Vector3();
  const direction = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const spanU = nx > 0.5 ? depth : width;
    const spanV = ny > 0.5 ? depth : height;
    uv.setXY(i, bevelled(uv.getX(i), spanU) / tile[0], bevelled(uv.getY(i), spanV) / tile[1]);
    point.set(bevelled(position.getX(i) + 0.5, width) - width / 2, bevelled(position.getY(i) + 0.5, height) - height / 2, bevelled(position.getZ(i) + 0.5, depth) - depth / 2);
    core.set(THREE.MathUtils.clamp(point.x, -hx, hx), THREE.MathUtils.clamp(point.y, -hy, hy), THREE.MathUtils.clamp(point.z, -hz, hz));
    direction.subVectors(point, core);
    if (direction.lengthSq() > 1e-12) direction.normalize();
    else direction.set(normal.getX(i), normal.getY(i), normal.getZ(i));
    position.setXYZ(i, core.x + direction.x * radius, core.y + direction.y * radius, core.z + direction.z * radius);
    normal.setXYZ(i, direction.x, direction.y, direction.z);
  }
  return geometry;
}

export function grainAlongHeight(geometry: THREE.BufferGeometry, shift: number): void {
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) + shift, uv.getX(i) + shift * 0.61);
}

export function softBox(parent: THREE.Object3D, size: readonly [number, number, number], material: THREE.Material, at: readonly [number, number, number], options: { radius?: number; tile?: readonly [number, number]; rotationY?: number; segments?: number; cast?: boolean } = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(softBoxGeometry(size[0], size[1], size[2], options.radius ?? 0.01, options.segments ?? 1, options.tile ?? [1, 1]), material);
  mesh.position.set(at[0], at[1], at[2]);
  mesh.rotation.y = options.rotationY ?? 0;
  mesh.castShadow = options.cast ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const BAMBOO_NODE_SPACING = 0.42;
const BAMBOO_TILE_METRES = 0.5;
const NODE_RINGS = [-0.2, -0.15, -0.12, -0.09, -0.07, -0.05, -0.03, -0.015, 0, 0.015, 0.03, 0.05, 0.07, 0.09, 0.12, 0.15, 0.2] as const;
const POLE_BASE_SWELL = 1.04;
const POLE_TAPER = 0.04;
const POLE_NODE_SWELL = 0.07;

export function poleWidestRadius(radius: number): number {
  return radius * POLE_BASE_SWELL * (1 + POLE_NODE_SWELL);
}

export function pole(parent: THREE.Object3D, from: readonly [number, number, number], to: readonly [number, number, number], radius: number, material: THREE.Material): THREE.Mesh {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const axis = b.clone().sub(a);
  const span = axis.length();
  const nodeCount = Math.max(1, Math.round(span / BAMBOO_NODE_SPACING));
  const rings: number[] = [0];
  for (let node = 0; node < nodeCount; node++) for (const offset of NODE_RINGS) rings.push((node + 0.5 + offset) / nodeCount);
  rings.push(1);
  const radiusAt = (along: number) => {
    const toNode = Math.abs(((along * nodeCount) % 1) - 0.5) * 2;
    return radius * (POLE_BASE_SWELL - POLE_TAPER * along) * (1 + POLE_NODE_SWELL * Math.exp(-((toNode * 9) ** 2)));
  };
  const profile = [new THREE.Vector2(1e-4, -span / 2), ...rings.map((along) => new THREE.Vector2(radiusAt(along), (along - 0.5) * span)), new THREE.Vector2(1e-4, span / 2)];
  const sides = roundSegments(radius * 1.12, 0.00017);
  const geometry = new THREE.LatheGeometry(profile, sides);
  const position = geometry.attributes.position!;
  const uv = geometry.attributes.uv!;
  const around = Math.max(1, Math.round((2 * Math.PI * radius) / BAMBOO_TILE_METRES));
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getY(i) + span / 2) / BAMBOO_TILE_METRES, uv.getX(i) * around);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a).addScaledVector(axis, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

let measuringContext: CanvasRenderingContext2D | null = null;

function measuring(): CanvasRenderingContext2D {
  measuringContext ??= document.createElement("canvas").getContext("2d")!;
  return measuringContext;
}

interface PaintLayer {
  readonly drawing: ImageData;
  readonly width: number;
  readonly height: number;
}

function wrapped(lines: readonly string[], font: string, maxPixels: number): string[] {
  const measure = measuring();
  measure.font = font;
  const out: string[] = [];
  for (const line of lines) {
    let current = "";
    for (const word of line.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure.measureText(candidate).width > maxPixels && current) {
        out.push(current);
        current = word;
      } else current = candidate;
    }
    out.push(current);
  }
  return out;
}

const EDGE_BLUR_PIXELS = 2.2;
const LOWEST_WEAR_ALPHA = 0.42;

const WEAR_MARKS_PER_STEP = 800;

function* paintingSteps(words: Pick<PaintedWords, "lines" | "height" | "weight" | "family" | "pixelsPerMetre" | "wear" | "lineHeight" | "align">, maxWidthMetres: number | null): Generator<void, PaintLayer> {
  let size = words.height * words.pixelsPerMetre;
  const font = (pixels: number) => `${words.weight} ${pixels}px ${words.family}`;
  const lines = maxWidthMetres ? wrapped(words.lines, font(size), maxWidthMetres * words.pixelsPerMetre) : [...words.lines];
  const measure = measuring();
  measure.font = font(size);
  const textWidth = Math.max(...lines.map((line) => measure.measureText(line).width));
  const padding = size * 0.22;
  let width = textWidth + padding * 2;
  let height = size * words.lineHeight * lines.length + padding * 1.4;
  const scale = Math.min(1, 8192 / width, 8192 / height);
  size *= scale;
  width = Math.ceil(width * scale);
  height = Math.ceil(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.font = font(size);
  context.fillStyle = "#ffffff";
  context.filter = `blur(${EDGE_BLUR_PIXELS}px)`;
  context.textBaseline = "alphabetic";
  context.textAlign = words.align;
  const anchor = words.align === "center" ? width / 2 : words.align === "right" ? width - padding * scale : padding * scale;
  lines.forEach((line, index) => context.fillText(line, anchor, size * (0.98 + index * words.lineHeight) + padding * scale * 0.2));
  context.filter = "none";
  context.globalCompositeOperation = "destination-out";
  const marks = ((width * height) / 900) * words.wear;
  for (let i = 0; i < marks; i++) {
    if (i % WEAR_MARKS_PER_STEP === 0) yield;
    context.fillStyle = `rgba(0,0,0,${Math.random() * LOWEST_WEAR_ALPHA})`;
    context.beginPath();
    context.ellipse(Math.random() * width, Math.random() * height, 0.5 + Math.random() * size * 0.014, 0.4 + Math.random() * size * 0.006, Math.random() * 3, 0, 7);
    context.fill();
  }
  const effective = words.pixelsPerMetre * scale;
  return { drawing: context.getImageData(0, 0, width, height), width: width / effective, height: height / effective };
}

const PAINT_EDGE = [
  "float paintSpread = min(length(dFdx(vMapUv) * vec2(textureSize(map, 0))), length(dFdy(vMapUv) * vec2(textureSize(map, 0))));",
  "float paintSharp = texture2D(map, vMapUv).a;",
  "float paintEdge = max(fwidth(paintSharp) * 0.75, 0.015);",
  "float paintCrisp = smoothstep(0.5 - paintEdge, 0.5 + paintEdge, paintSharp);",
  "float paintFar = texture2D(map, vMapUv, 1.3).a;",
  "diffuseColor.a *= mix(paintCrisp, paintFar, smoothstep(1.4, 2.4, paintSpread));",
].join("\n");

function paintMaterial(texture: THREE.Texture, colour: PaintedWords["colour"], textHeight: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: texture, color: COLOURS[colour], transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: 0.3 });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", PAINT_EDGE);
  };
  material.customProgramCacheKey = () => "paint-edge";
  return noteSurface(material, { label: "painted words", kind: "painted", textHeight });
}

type PaintedMesh = { width: number; height: number; mesh: THREE.Mesh };

export async function paintWordsInTurn(library: MaterialLibrary, parent: THREE.Object3D, words: PaintedWords, maxWidthMetres: number | null = null): Promise<PaintedMesh> {
  const layer = await library.pacer.run(paintingSteps(words, maxWidthMetres));
  return wordsOnSurface(parent, words, layer, await library.paintTexture(layer.drawing));
}

function wordsOnSurface(parent: THREE.Object3D, words: PaintedWords, layer: PaintLayer, texture: THREE.Texture): PaintedMesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(layer.width, layer.height), paintMaterial(texture, words.colour, words.height));
  const offset = words.align === "center" ? 0 : words.align === "right" ? -layer.width / 2 : layer.width / 2;
  mesh.position.set(words.at[0] + Math.cos(words.facing) * offset, words.at[1], words.at[2] - Math.sin(words.facing) * offset);
  mesh.rotation.y = words.facing;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  parent.add(mesh);
  return { width: layer.width, height: layer.height, mesh };
}

export async function paintCurvedInTurn(library: MaterialLibrary, parent: THREE.Object3D, words: CurvedWords): Promise<THREE.Mesh> {
  const layer = await library.pacer.run(paintingSteps({ lines: words.lines, height: words.height, weight: 700, family: "Eczar", pixelsPerMetre: 1800, wear: 0.6, lineHeight: 1.2, align: "center" }, null));
  const arc = layer.width / words.radius;
  const geometry = new THREE.CylinderGeometry(words.radius, words.radius, layer.height, 96, 1, true, words.angle - arc / 2, arc);
  const mesh = new THREE.Mesh(geometry, paintMaterial(await library.paintTexture(layer.drawing), words.colour, words.height));
  mesh.position.set(words.centre[0], words.y, words.centre[1]);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}
