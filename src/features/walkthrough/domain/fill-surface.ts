import { wallRadius, type VesselProfile } from "./vessel-profile";

export interface SurfaceGrid {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export type HeightAt = (x: number, z: number, wallNearness: number) => number;

const RIM_TUCK_METRES = 0.0015;

const undulation = (x: number, z: number, scale: number): number =>
  (Math.sin(x * scale + 1.3) * Math.sin(z * scale * 0.83 - 0.7) + 0.5 * Math.sin(x * scale * 1.9 - z * scale * 1.3 + 2.1) + 0.25 * Math.sin(x * scale * 3.7 + z * scale * 3.1)) / 1.75;

export function levelInVessel(profile: VesselProfile, fraction: number): number {
  return profile.floorY + (profile.rimY - profile.floorY) * fraction;
}

export function fittedSurface(profile: VesselProfile, rimLevel: number, rings: number, spokes: number, heightAt: HeightAt, tuck = RIM_TUCK_METRES): SurfaceGrid {
  const positions = new Float32Array((1 + rings * spokes) * 3);
  positions.set([0, heightAt(0, 0, 0), 0], 0);
  for (let ring = 1; ring <= rings; ring++) {
    const along = ring / rings;
    const reach = 1 - (1 - along) * (1 - along);
    for (let spoke = 0; spoke < spokes; spoke++) {
      const theta = (spoke / spokes) * Math.PI * 2;
      const first = (wallRadius(profile, theta, rimLevel) + tuck) * reach;
      const raised = heightAt(Math.cos(theta) * first, Math.sin(theta) * first, reach);
      const radius = (Math.min(wallRadius(profile, theta, rimLevel), wallRadius(profile, theta, raised)) + tuck) * reach;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      positions.set([x, heightAt(x, z, reach), z], (1 + (ring - 1) * spokes + spoke) * 3);
    }
  }
  const indices = new Uint32Array((spokes + (rings - 1) * spokes * 2) * 3);
  let cursor = 0;
  for (let spoke = 0; spoke < spokes; spoke++) {
    const next = (spoke + 1) % spokes;
    indices.set([0, 1 + next, 1 + spoke], cursor);
    cursor += 3;
    for (let ring = 1; ring < rings; ring++) {
      const inner = 1 + (ring - 1) * spokes;
      const outer = inner + spokes;
      indices.set([inner + spoke, inner + next, outer + spoke, inner + next, outer + next, outer + spoke], cursor);
      cursor += 6;
    }
  }
  return { positions, indices };
}

export const flatLevel = (level: number): HeightAt => () => level;

export function pasteHeight(level: number, depth: number): HeightAt {
  const meniscus = depth * 0.07;
  const swell = depth * 0.035;
  return (x, z, wallNearness) => level + meniscus * wallNearness ** 14 + swell * undulation(x, z, 34) * (1 - wallNearness ** 8);
}

export function moundHeight(level: number, heap: number, grain: number): HeightAt {
  return (x, z, wallNearness) => {
    const crown = heap * (1 - wallNearness * wallNearness) ** 1.25;
    const rough = grain * (undulation(x, z, 60) + 0.4 * undulation(x + 3, z - 2, 170)) * (1 - wallNearness ** 10);
    return level + crown + rough;
  };
}
