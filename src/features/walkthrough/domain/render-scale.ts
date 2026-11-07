export const RENDER_SCALE_CAP = 2;
export const FRAME_BUDGET_MS = 17.5;
export const RENDER_SCALE_STEP = 0.25;
export const LOWER_WINDOW_FRAMES = 15;
export const RAISE_WINDOW_FRAMES = 60;
export const SCALE_SETTLE_MS = 2000;
export const SCALE_RETRY_MS = 8000;
export const STALLED_FRAME_MS = 250;
export const RAISE_HEADROOM = 0.75;
export const GPU_BOUND_SHARE = 0.9;
export const MEAN_OVERRUN = 1.5;
export const FEWEST_GPU_SAMPLES = 3;

export interface FrameSample {
  readonly frameMs: number;
  readonly gpuMs: number | null;
}

export function topRenderScale(devicePixelRatio: number): number {
  return Math.min(RENDER_SCALE_CAP, devicePixelRatio > 0 ? devicePixelRatio : 1);
}

export function renderScaleLevels(devicePixelRatio: number): number[] {
  const top = topRenderScale(devicePixelRatio);
  const floor = Math.min(1, top);
  const levels = [floor];
  for (let scale = floor + RENDER_SCALE_STEP; scale < top - 1e-6; scale += RENDER_SCALE_STEP) levels.push(scale);
  if (top > floor) levels.push(top);
  return levels;
}

const medianOf = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const percentileOf = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!;
};

const gpuMedianOf = (samples: readonly FrameSample[]): number | null => {
  const timed = samples.flatMap((sample) => (sample.gpuMs === null ? [] : [sample.gpuMs]));
  return timed.length >= FEWEST_GPU_SAMPLES ? medianOf(timed) : null;
};

export class RenderScaleGovernor {
  readonly levels: readonly number[];
  private index: number;
  private changedAt: number;
  private readonly recent: FrameSample[] = [];
  private timerSeen = false;
  private readonly failures: number[];
  private readonly blockedUntil: number[];

  constructor(
    readonly devicePixelRatio: number,
    now: number,
  ) {
    this.levels = renderScaleLevels(devicePixelRatio);
    this.index = this.levels.length - 1;
    this.changedAt = now;
    this.failures = this.levels.map(() => 0);
    this.blockedUntil = this.levels.map(() => 0);
  }

  get scale(): number {
    return this.levels[this.index]!;
  }

  observe(sample: FrameSample, now: number): number | null {
    if (!(sample.frameMs > 0) || sample.frameMs > STALLED_FRAME_MS) return null;
    this.recent.push(sample);
    if (sample.gpuMs !== null) this.timerSeen = true;
    if (this.recent.length > RAISE_WINDOW_FRAMES) this.recent.shift();
    if (this.recent.length < LOWER_WINDOW_FRAMES) return null;
    const latest = this.recent.slice(-LOWER_WINDOW_FRAMES);
    const frames = latest.map((each) => each.frameMs);
    const frameMedian = medianOf(frames);
    const frameMean = frames.reduce((sum, each) => sum + each, 0) / frames.length;
    const gpuMedian = gpuMedianOf(latest);
    if (this.timerSeen && gpuMedian === null) return null;
    const framesOver = frameMedian > FRAME_BUDGET_MS || frameMean > FRAME_BUDGET_MS * MEAN_OVERRUN;
    if (framesOver || (gpuMedian !== null && gpuMedian > FRAME_BUDGET_MS)) {
      const gpuBound = gpuMedian === null || gpuMedian > FRAME_BUDGET_MS * GPU_BOUND_SHARE;
      return gpuBound ? this.lower(gpuMedian ?? Math.max(frameMedian, frameMean), now) : null;
    }
    if (this.recent.length < RAISE_WINDOW_FRAMES) return null;
    return this.raise(now);
  }

  private raise(now: number): number | null {
    const above = this.index + 1;
    if (above >= this.levels.length || now - this.changedAt < SCALE_SETTLE_MS || now < this.blockedUntil[above]!) return null;
    if (percentileOf(this.recent.map((each) => each.frameMs), 0.9) > FRAME_BUDGET_MS) return null;
    const gpuMedian = gpuMedianOf(this.recent);
    const growth = (this.levels[above]! / this.scale) ** 2;
    if (gpuMedian !== null && gpuMedian * growth > FRAME_BUDGET_MS * RAISE_HEADROOM) return null;
    return this.moveTo(above, now);
  }

  private lower(cost: number, now: number): number | null {
    if (this.index === 0) return null;
    const failed = this.index;
    this.failures[failed]!++;
    this.blockedUntil[failed] = now + SCALE_RETRY_MS * 2 ** (this.failures[failed]! - 1);
    const affordable = this.scale * Math.sqrt((FRAME_BUDGET_MS * RAISE_HEADROOM) / cost);
    let next = failed - 1;
    while (next > 0 && this.levels[next]! > affordable) next--;
    return this.moveTo(next, now);
  }

  private moveTo(index: number, now: number): number {
    this.index = index;
    this.changedAt = now;
    this.recent.length = 0;
    return this.scale;
  }
}
