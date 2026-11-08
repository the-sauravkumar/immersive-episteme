import type { Vec3 } from "./geometry";

export const SCREEN_ERROR_PIXELS = 0.5;
export const SHADOW_ERROR_TEXELS = 0.125;
export const LEVEL_ERRORS_METRES: readonly number[] = [0.00025, 0.0005, 0.001, 0.002, 0.004, 0.008, 0.016, 0.032, 0.064];
const LEVEL_KEPT_BELOW_SHARE = 0.75;
export const SMALLEST_SIMPLIFIED_TRIANGLES = 1024;
export const ATTRIBUTE_WEIGHT = 4;
const SPAN_ROWS = 96;

export type LevelView = { readonly kind: "perspective"; readonly verticalFov: number; readonly viewportHeight: number } | { readonly kind: "orthographic"; readonly frustumHeight: number; readonly viewportHeight: number };

export function pixelsPerMetre(view: LevelView, distance: number): number {
  if (view.kind === "orthographic") return view.viewportHeight / view.frustumHeight;
  return view.viewportHeight / (2 * Math.tan(view.verticalFov / 2) * Math.max(distance, 1e-3));
}

export function nearestDistance(eye: Vec3, centre: Vec3, radius: number): number {
  return Math.max(0, Math.hypot(eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]) - radius);
}

export function coarsestLevel(errorsMetres: readonly number[], perMetre: number, tolerance = SCREEN_ERROR_PIXELS): number {
  let level = 0;
  for (let i = 1; i < errorsMetres.length; i++) if (errorsMetres[i]! * perMetre <= tolerance) level = i;
  return level;
}

export function keepsLevel(previousTriangles: number, triangles: number): boolean {
  return triangles <= previousTriangles * LEVEL_KEPT_BELOW_SHARE;
}

export function rowSpans(indexCount: number, indicesPerRow: number, rowsPerSpan = SPAN_ROWS): (readonly [number, number])[] {
  const step = indicesPerRow * rowsPerSpan;
  const spans: (readonly [number, number])[] = [];
  for (let start = 0; start < indexCount; start += step) spans.push([start, Math.min(indexCount, start + step)]);
  return spans;
}
