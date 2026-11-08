export type LinearRgb = readonly [number, number, number];

const FILM_EXPOSURE = 0.82;
const WHITEST_DISPLAY = 0.97;
const STRONGEST_ALBEDO = 1.9;
const SPECULAR_FLOOR = 0.012;

const SUNLIT_FACING_UP: LinearRgb = [1, 1, 1];

export function filmicToScene(display: number): number {
  const y = Math.min(WHITEST_DISPLAY, Math.max(0, display));
  const a = 2.51 - 2.43 * y;
  const b = 0.03 - 0.59 * y;
  const c = -0.14 * y;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

export function albedoForDisplay(displayLinear: LinearRgb, gain: LinearRgb = [1, 1, 1], sunlit: LinearRgb = SUNLIT_FACING_UP): LinearRgb {
  const channel = (i: 0 | 1 | 2): number => Math.min(STRONGEST_ALBEDO, (Math.max(filmicToScene(displayLinear[i]) / FILM_EXPOSURE - SPECULAR_FLOOR, 0.002) / sunlit[i]) * gain[i]);
  return [channel(0), channel(1), channel(2)];
}
