import * as THREE from "three";
import type { CurvedWords, PaintedWords } from "../domain/yard-plan";

const COLOURS: Record<PaintedWords["colour"], string> = { ink: "#14234e", lime: "#efe7d2", caption: "#0a1636", sample: "#8d1c14" };

export function softBoxGeometry(width: number, height: number, depth: number, radius: number, segments: number, tile: readonly [number, number]): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal!;
  const uv = geometry.attributes.uv!;
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
    uv.setXY(i, (uv.getX(i) * spanU) / tile[0], (uv.getY(i) * spanV) / tile[1]);
    point.fromBufferAttribute(position, i);
    core.set(THREE.MathUtils.clamp(point.x, -hx, hx), THREE.MathUtils.clamp(point.y, -hy, hy), THREE.MathUtils.clamp(point.z, -hz, hz));
    direction.subVectors(point, core);
    if (direction.lengthSq() > 1e-12) direction.normalize();
    else direction.set(normal.getX(i), normal.getY(i), normal.getZ(i));
    position.setXYZ(i, core.x + direction.x * radius, core.y + direction.y * radius, core.z + direction.z * radius);
    normal.setXYZ(i, direction.x, direction.y, direction.z);
  }
  return geometry;
}

export function softBox(parent: THREE.Object3D, size: readonly [number, number, number], material: THREE.Material, at: readonly [number, number, number], options: { radius?: number; tile?: readonly [number, number]; rotationY?: number; segments?: number; cast?: boolean } = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(softBoxGeometry(size[0], size[1], size[2], options.radius ?? 0.01, options.segments ?? 6, options.tile ?? [1, 1]), material);
  mesh.position.set(at[0], at[1], at[2]);
  mesh.rotation.y = options.rotationY ?? 0;
  mesh.castShadow = options.cast ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function bambooCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 4096;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#94763f");
  gradient.addColorStop(0.5, "#c5a666");
  gradient.addColorStop(1, "#94763f");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 520; i++) {
    const x = Math.random() * canvas.width;
    context.strokeStyle = `rgba(${Math.random() < 0.6 ? "70,46,20" : "238,214,160"},${Math.random() * 0.16})`;
    context.lineWidth = 0.8 + Math.random() * 3;
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x + 6, canvas.height / 3, x - 6, (canvas.height * 2) / 3, x + (Math.random() - 0.5) * 10, canvas.height);
    context.stroke();
  }
  for (let y = 340; y < canvas.height; y += 1024) {
    const node = context.createLinearGradient(0, y - 52, 0, y + 52);
    node.addColorStop(0, "rgba(60,38,16,0)");
    node.addColorStop(0.46, "rgba(60,38,16,.72)");
    node.addColorStop(0.54, "rgba(248,228,178,.5)");
    node.addColorStop(1, "rgba(60,38,16,0)");
    context.fillStyle = node;
    context.fillRect(0, y - 52, canvas.width, 104);
  }
  return canvas;
}

export function pole(parent: THREE.Object3D, from: readonly [number, number, number], to: readonly [number, number, number], radius: number, material: THREE.Material): THREE.Mesh {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const axis = b.clone().sub(a);
  const span = axis.length();
  const geometry = new THREE.CylinderGeometry(radius, radius * 1.04, span, 28, 1);
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (span / 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a).addScaledVector(axis, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

interface PaintLayer {
  readonly texture: THREE.CanvasTexture;
  readonly width: number;
  readonly height: number;
}

function wrapped(lines: readonly string[], font: string, maxPixels: number): string[] {
  const measure = document.createElement("canvas").getContext("2d")!;
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

function paintLayer(words: Pick<PaintedWords, "lines" | "height" | "colour" | "weight" | "family" | "pixelsPerMetre" | "wear" | "lineHeight" | "align">, maxWidthMetres: number | null): PaintLayer {
  let size = words.height * words.pixelsPerMetre;
  const font = (pixels: number) => `${words.weight} ${pixels}px ${words.family}`;
  const lines = maxWidthMetres ? wrapped(words.lines, font(size), maxWidthMetres * words.pixelsPerMetre) : [...words.lines];
  const measure = document.createElement("canvas").getContext("2d")!;
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
  const context = canvas.getContext("2d")!;
  context.font = font(size);
  context.fillStyle = COLOURS[words.colour];
  context.textBaseline = "alphabetic";
  context.textAlign = words.align;
  const anchor = words.align === "center" ? width / 2 : words.align === "right" ? width - padding * scale : padding * scale;
  lines.forEach((line, index) => context.fillText(line, anchor, size * (0.98 + index * words.lineHeight) + padding * scale * 0.2));
  context.globalCompositeOperation = "destination-out";
  const marks = ((width * height) / 900) * words.wear;
  for (let i = 0; i < marks; i++) {
    context.fillStyle = `rgba(0,0,0,${Math.random() * 0.55})`;
    context.beginPath();
    context.ellipse(Math.random() * width, Math.random() * height, 0.5 + Math.random() * size * 0.014, 0.4 + Math.random() * size * 0.006, Math.random() * 3, 0, 7);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 16;
  const effective = words.pixelsPerMetre * scale;
  return { texture, width: width / effective, height: height / effective };
}

const paintMaterial = (texture: THREE.Texture) =>
  new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: 0.3 });

export function paintWords(parent: THREE.Object3D, words: PaintedWords, maxWidthMetres: number | null = null): { width: number; height: number; mesh: THREE.Mesh } {
  const layer = paintLayer(words, maxWidthMetres);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(layer.width, layer.height), paintMaterial(layer.texture));
  const offset = words.align === "center" ? 0 : words.align === "right" ? -layer.width / 2 : layer.width / 2;
  mesh.position.set(words.at[0] + Math.cos(words.facing) * offset, words.at[1], words.at[2] - Math.sin(words.facing) * offset);
  mesh.rotation.y = words.facing;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  parent.add(mesh);
  return { width: layer.width, height: layer.height, mesh };
}

export function paintCurved(parent: THREE.Object3D, words: CurvedWords): void {
  const layer = paintLayer({ lines: words.lines, height: words.height, colour: "ink", weight: 700, family: "Eczar", pixelsPerMetre: 1800, wear: 0.6, lineHeight: 1.2, align: "center" }, null);
  const arc = layer.width / words.radius;
  const geometry = new THREE.CylinderGeometry(words.radius, words.radius, layer.height, 96, 1, true, words.angle - arc / 2, arc);
  const mesh = new THREE.Mesh(geometry, paintMaterial(layer.texture));
  mesh.position.set(words.centre[0], words.y, words.centre[1]);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  parent.add(mesh);
}
