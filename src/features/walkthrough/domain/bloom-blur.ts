export interface BlurTap {
  readonly offset: number;
  readonly weight: number;
}

export const BLOOM_CENTRE_WEIGHT = 0.2270270270;
export const BLOOM_SIDE_TAPS: readonly BlurTap[] = [
  { offset: 1.3846153846, weight: 0.3162162162 },
  { offset: 3.2307692308, weight: 0.0702702703 },
];
export const BLOOM_SPREAD_TEXELS = 2.3;

const sideVariance = ({ offset, weight }: BlurTap): number => {
  const low = Math.floor(offset);
  const share = offset - low;
  return weight * (low ** 2 * (1 - share) + (low + 1) ** 2 * share);
};

export const BLOOM_PASS_VARIANCE = BLOOM_SIDE_TAPS.reduce((sum, tap) => sum + 2 * sideVariance(tap), 0);

export function bloomBlurPasses(pixelRatio: number): number {
  const spread = BLOOM_SPREAD_TEXELS * pixelRatio;
  return Math.max(1, Math.round(spread ** 2 / BLOOM_PASS_VARIANCE));
}
