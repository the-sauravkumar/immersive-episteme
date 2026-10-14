/**
 * Render-surface model (docs/architecture/immersive-rendering-quality.md §1, C6; §2a-2b).
 *
 * The compiler emits every visible surface the renderer needs as axis-aligned, metre-based
 * data so the validator can prove there is no z-fighting before anything is drawn:
 *   - boxes (walls, posts, plinths, door lintels) carry a typed `part` and a `partKey`
 *     (part + exact dimensions) so identical parts can be instanced or merged;
 *   - planes (floors, ceilings, door thresholds, wall panels, image planes, signs) are
 *     degenerate along exactly one axis and carry their facing direction;
 *   - wall-mounted planes record their stand-off (`wallOffset`) and a `polygonOffset` hint;
 *   - nothing is scaled: `scale` is always [1, 1, 1] and UVs are metre-based ("metre") or
 *     the image's own 0..1 range ("image", sized to the declared aspect ratio).
 */
import { round } from "./canonical";
import type { Collider, Point, Vec3 } from "./types";
import type { Orient } from "./geometry";

export type PartKind = "wall-segment" | "wall-post" | "plinth" | "door-lintel";
export type Facing = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

export interface Surface {
  id: string;
  kind: "floor" | "ceiling" | "threshold" | "panel" | "image" | "sign";
  facing: Facing;
  min: Vec3;
  max: Vec3;
  textured: boolean;
  uv: "metre" | "image";
  scale: Vec3;
  /** Wall-mounted planes: distance proud of the surface behind them (m). */
  wallOffset?: number;
  polygonOffset?: { factor: number; units: number };
  /** Image planes: declared source aspect (width / height). */
  aspectRatio?: number | null;
  assetId?: string;
}

export const UNIT_SCALE: Vec3 = [1, 1, 1];
export const POLYGON_OFFSET = { factor: -1, units: -1 } as const;

export function partKind(c: Collider): PartKind {
  return c.kind === "post" ? "wall-post" : c.kind === "plinth" ? "plinth" : "wall-segment";
}

/** Typed, parameterised part: identical dimensions share a partKey (instanceable). */
export function withPart<T extends Collider>(c: T, part: PartKind = partKind(c)) {
  const d = [0, 1, 2].map((i) => round(c.max[i]! - c.min[i]!)) as Vec3;
  // Orientation-independent key: footprint sorted so an x-run and a z-run of equal length share geometry.
  const [a, b] = [d[0], d[2]].sort((p, q) => p - q) as [number, number];
  return { ...c, part, partKey: `${part}:${a}x${d[1]}x${b}`, dims: d };
}

export function horizontalPlane(id: string, kind: "floor" | "ceiling" | "threshold", y: number, minX: number, maxX: number, minZ: number, maxZ: number): Surface {
  return {
    id,
    kind,
    facing: kind === "ceiling" ? "-y" : "+y",
    min: [round(minX), round(y, 4), round(minZ)],
    max: [round(maxX), round(y, 4), round(maxZ)],
    textured: true,
    uv: "metre",
    scale: UNIT_SCALE,
  };
}

/** A plane parallel to a wall face, `offset` metres proud of it, spanning u in [u0,u1] and y in [y0,y1]. */
export function wallPlane(
  id: string,
  kind: "panel" | "image" | "sign",
  wall: { orient: Orient; face: number; normal: Point },
  offset: number,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  extra: Partial<Surface> = {},
): Surface {
  const at = round(wall.face + (wall.orient === "h" ? wall.normal.z : wall.normal.x) * offset, 4);
  const facing: Facing = wall.orient === "h" ? (wall.normal.z > 0 ? "+z" : "-z") : wall.normal.x > 0 ? "+x" : "-x";
  return {
    id,
    kind,
    facing,
    min: wall.orient === "h" ? [round(u0), round(y0), at] : [at, round(y0), round(u0)],
    max: wall.orient === "h" ? [round(u1), round(y1), at] : [at, round(y1), round(u1)],
    textured: true,
    uv: kind === "image" ? "image" : "metre",
    scale: UNIT_SCALE,
    wallOffset: round(offset, 4),
    polygonOffset: { ...POLYGON_OFFSET },
    ...extra,
  };
}

/** Image plane size that fits (maxW x maxH) while keeping the declared aspect exactly. */
export function fitAspect(aspect: number, maxW: number, maxH: number): { w: number; h: number } {
  const w = Math.min(maxW, maxH * aspect);
  return { w, h: w / aspect };
}
