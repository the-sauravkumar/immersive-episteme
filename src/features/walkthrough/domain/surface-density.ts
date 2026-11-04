export const REVIEW_HEIGHT_PIXELS = 3840 / (16 / 9);
export const CAMERA_FIELD_OF_VIEW_DEGREES = 55;
export const NEAREST_REACH_METRES = 0.6;
export const CLOSE_SURFACE_METRES = 10;
export const FACET_LIMIT_PIXELS = 1;
export const SMALLEST_TEXELS_PER_PIXEL = 1;
export const SMALLEST_SCAN_TEXTURE = 2048;
const WALL_FLOOR_PER_METRE = 1000;
const CLOTH_FLOOR_PER_METRE = 590;
const WEAVE_FLOOR_PER_METRE = 7000;
const SMALL_TEXT_FLOOR_PER_METRE = 1400;
const SMALL_TEXT_METRES = 0.2;
const REACH_TOLERANCE_METRES = 0.05;

export type SurfaceClass = "ground" | "wall" | "cloth" | "printed-textile" | "model" | "painted" | "smooth" | "distant";

export interface SurfaceFact {
  readonly label: string;
  readonly surfaceClass: SurfaceClass;
  readonly colourPerMetre: number | null;
  readonly normalPerMetre: number | null;
  readonly roughnessPerMetre: number | null;
  readonly detailColourPerMetre: number | null;
  readonly detailNormalPerMetre: number | null;
  readonly smallestMap: number | null;
  readonly textHeightMetres: number | null;
  readonly reachMetres: number;
  readonly facetSagittaMetres: number;
  readonly flatShaded: boolean;
}

export interface SurfaceRow extends SurfaceFact {
  readonly colourTexelsPerPixel: number | null;
  readonly normalTexelsPerPixel: number | null;
  readonly facetPixels: number;
  readonly failures: readonly string[];
}

export function screenPixelsPerMetre(distance: number, heightPixels = REVIEW_HEIGHT_PIXELS, fieldOfViewDegrees = CAMERA_FIELD_OF_VIEW_DEGREES): number {
  return heightPixels / (2 * distance * Math.tan((fieldOfViewDegrees * Math.PI) / 360));
}

export function chordSagitta(chord: number, turning: number): number {
  return (chord / 2) * Math.tan(turning / 4);
}

export function roundSegments(radius: number, largestSagittaMetres = 0.00022): number {
  if (radius <= largestSagittaMetres) return 8;
  return Math.max(8, Math.ceil(Math.PI / Math.acos(1 - largestSagittaMetres / radius)));
}

const best = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.max(a, b));

export function judgeSurface(fact: SurfaceFact): SurfaceRow {
  const failures: string[] = [];
  const distance = Math.max(fact.reachMetres, 1e-3);
  const needed = screenPixelsPerMetre(distance);
  const colour = best(fact.colourPerMetre, fact.detailColourPerMetre);
  const normal = best(fact.normalPerMetre, fact.detailNormalPerMetre);
  const colourTexelsPerPixel = colour === null ? null : colour / needed;
  const normalTexelsPerPixel = normal === null ? null : normal / needed;
  const facetPixels = fact.flatShaded ? 0 : fact.facetSagittaMetres * screenPixelsPerMetre(NEAREST_REACH_METRES);
  const close = fact.reachMetres <= CLOSE_SURFACE_METRES;
  if (fact.surfaceClass !== "distant" && fact.reachMetres < NEAREST_REACH_METRES - REACH_TOLERANCE_METRES) failures.push(`camera can reach ${fact.reachMetres.toFixed(2)} m, nearer than ${NEAREST_REACH_METRES} m`);
  if (facetPixels > FACET_LIMIT_PIXELS) failures.push(`facets ${facetPixels.toFixed(1)} px at ${NEAREST_REACH_METRES} m`);
  if (fact.surfaceClass === "smooth" || fact.surfaceClass === "distant") return { ...fact, colourTexelsPerPixel, normalTexelsPerPixel, facetPixels, failures };
  if (fact.surfaceClass === "painted") {
    if (fact.colourPerMetre === null) failures.push("painted words without a layer");
    else if ((fact.textHeightMetres ?? 1) < SMALL_TEXT_METRES && fact.colourPerMetre < SMALL_TEXT_FLOOR_PER_METRE) failures.push(`small text ${Math.round(fact.colourPerMetre)} px/m under ${SMALL_TEXT_FLOOR_PER_METRE}`);
    return { ...fact, colourTexelsPerPixel, normalTexelsPerPixel, facetPixels, failures };
  }
  if (fact.surfaceClass === "printed-textile") {
    if (fact.colourPerMetre === null) failures.push("textile without its photograph");
    return { ...fact, colourTexelsPerPixel, normalTexelsPerPixel, facetPixels, failures };
  }
  if (colour === null) failures.push("no texture");
  else if (close && colourTexelsPerPixel! < SMALLEST_TEXELS_PER_PIXEL) failures.push(`colour ${colourTexelsPerPixel!.toFixed(2)} texels per pixel`);
  if (normal === null) failures.push("no normal map");
  else if (close && normalTexelsPerPixel! < SMALLEST_TEXELS_PER_PIXEL) failures.push(`normal ${normalTexelsPerPixel!.toFixed(2)} texels per pixel`);
  if ((fact.surfaceClass === "ground" || fact.surfaceClass === "wall") && close) {
    if ((fact.colourPerMetre ?? 0) < WALL_FLOOR_PER_METRE) failures.push(`scan ${Math.round(fact.colourPerMetre ?? 0)} px/m under ${WALL_FLOOR_PER_METRE}`);
    if (fact.roughnessPerMetre === null) failures.push("no roughness map");
  }
  if (fact.surfaceClass === "cloth") {
    if ((fact.colourPerMetre ?? 0) < CLOTH_FLOOR_PER_METRE) failures.push(`cloth state ${Math.round(fact.colourPerMetre ?? 0)} px/m under ${CLOTH_FLOOR_PER_METRE}`);
    if ((normal ?? 0) < WEAVE_FLOOR_PER_METRE) failures.push(`weave ${Math.round(normal ?? 0)} px/m under ${WEAVE_FLOOR_PER_METRE}`);
  }
  if (fact.surfaceClass === "model" && (fact.smallestMap ?? 0) < SMALLEST_SCAN_TEXTURE) failures.push(`map ${fact.smallestMap ?? 0} px under ${SMALLEST_SCAN_TEXTURE}`);
  return { ...fact, colourTexelsPerPixel, normalTexelsPerPixel, facetPixels, failures };
}

export function rankWorstFirst(rows: readonly SurfaceRow[]): SurfaceRow[] {
  const score = (row: SurfaceRow) => Math.min(row.colourTexelsPerPixel ?? Infinity, row.normalTexelsPerPixel ?? Infinity);
  return [...rows].sort((a, b) => b.failures.length - a.failures.length || score(a) - score(b));
}

export interface TearingFigures {
  readonly label: string;
  readonly distance: number;
  readonly visiblePixels: number;
  readonly fightingPercent: number;
  readonly colourFlickerPercent: number;
  readonly crackPixels: number;
  readonly backFacePercent: number;
  readonly openWork: boolean;
}

export const FIGHTING_LIMIT_PERCENT = 0.25;
export const COLOUR_FLICKER_LIMIT_PERCENT = 1;
const OPEN_WORK_FLICKER_LIMIT_PERCENT = 3;
export const CRACK_LIMIT_PIXELS = 8;
export const BACK_FACE_LIMIT_PERCENT = 0.5;
const SMALLEST_JUDGED_PIXELS = 400;

export function tearingFailures(figures: TearingFigures): string[] {
  if (figures.visiblePixels < SMALLEST_JUDGED_PIXELS) return [];
  const failures: string[] = [];
  if (figures.fightingPercent > FIGHTING_LIMIT_PERCENT) failures.push(`depth fight ${figures.fightingPercent.toFixed(2)}%`);
  if (figures.colourFlickerPercent > (figures.openWork ? OPEN_WORK_FLICKER_LIMIT_PERCENT : COLOUR_FLICKER_LIMIT_PERCENT)) failures.push(`flicker ${figures.colourFlickerPercent.toFixed(2)}%`);
  if (!figures.openWork && figures.crackPixels > CRACK_LIMIT_PIXELS) failures.push(`crack ${figures.crackPixels} px`);
  if (figures.backFacePercent > BACK_FACE_LIMIT_PERCENT) failures.push(`missing face ${figures.backFacePercent.toFixed(2)}%`);
  return failures;
}
