import { describe, expect, it } from "vitest";
import {
  FRAME_BUDGET_MS,
  LOWER_WINDOW_FRAMES,
  RAISE_HEADROOM,
  RAISE_WINDOW_FRAMES,
  RenderScaleGovernor,
  renderScaleLevels,
  SCALE_RETRY_MS,
  SCALE_SETTLE_MS,
  SLOW_DEVICE_RUN,
  STALLED_FRAME_MS,
  startingRenderScale,
  topRenderScale,
} from "@/features/walkthrough/domain/render-scale";

type Clock = { now: number };

const feed = (governor: RenderScaleGovernor, clock: Clock, frames: number, frameMs: number, gpuMs: number | null = null): number[] => {
  const changes: number[] = [];
  for (let i = 0; i < frames; i++) {
    clock.now += frameMs;
    const change = governor.observe({ frameMs, gpuMs }, clock.now);
    if (change !== null) changes.push(change);
  }
  return changes;
};

interface Device {
  readonly paceMs: number;
  readonly msAtCss: number;
  readonly timer: boolean;
}

const run = (governor: RenderScaleGovernor, clock: Clock, durationMs: number, device: Device): number[] => {
  const changes: number[] = [];
  const end = clock.now + durationMs;
  while (clock.now < end) {
    const gpuMs = device.msAtCss * governor.scale ** 2;
    const frameMs = Math.max(device.paceMs, gpuMs);
    clock.now += frameMs;
    const change = governor.observe({ frameMs, gpuMs: device.timer ? gpuMs : null }, clock.now);
    if (change !== null) changes.push(change);
  }
  return changes;
};

const overload = (governor: RenderScaleGovernor, clock: Clock, frameMs: number, gpuMs: number | null = null) => feed(governor, clock, LOWER_WINDOW_FRAMES, frameMs, gpuMs);

describe("starting render scale", () => {
  it("keeps the measured level when it fits and rises as far as the timed headroom allows", () => {
    expect(startingRenderScale(2, { frameMs: 16.7, gpuMs: 14.3 }, 2)).toBe(2);
    expect(startingRenderScale(2, { frameMs: 16.7, gpuMs: null }, 1)).toBe(1);
    expect(startingRenderScale(2, { frameMs: 16.7, gpuMs: 4 }, 1)).toBe(1.75);
    expect(startingRenderScale(1, { frameMs: 80, gpuMs: 70 }, 1)).toBe(1);
  });

  it("starts at the largest level whose pixel cost fits the raise headroom", () => {
    expect(startingRenderScale(2, { frameMs: 60, gpuMs: 52 }, 2)).toBe(1);
    expect(startingRenderScale(2, { frameMs: 25, gpuMs: 22 }, 2)).toBe(1.5);
    expect(startingRenderScale(2, { frameMs: 25, gpuMs: null }, 2)).toBe(1.25);
  });

  it("starts a governor at the given level and lowers or raises from there", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now, 1.25);
    expect(governor.scale).toBe(1.25);
    expect(run(governor, clock, 12000, { paceMs: 16.7, msAtCss: 2, timer: true })).toEqual([1.5, 1.75, 2]);
  });
});

describe("render scale levels", () => {
  it("renders at the device pixel ratio, capped at 2", () => {
    expect(topRenderScale(1)).toBe(1);
    expect(topRenderScale(1.25)).toBe(1.25);
    expect(topRenderScale(3)).toBe(2);
    expect(topRenderScale(0)).toBe(1);
  });

  it("steps from CSS pixel density up to the device density", () => {
    expect(renderScaleLevels(1)).toEqual([1]);
    expect(renderScaleLevels(1.25)).toEqual([1, 1.25]);
    expect(renderScaleLevels(1.5)).toEqual([1, 1.25, 1.5]);
    expect(renderScaleLevels(2)).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(renderScaleLevels(2.625)).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(renderScaleLevels(0.8)).toEqual([0.8]);
  });
});

describe("render scale governor", () => {
  it("starts at the device density and keeps it while frames meet the budget", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    expect(governor.scale).toBe(2);
    expect(feed(governor, clock, 600, 16.7, 9)).toEqual([]);
    expect(governor.scale).toBe(2);
  });

  it("lowers as soon as the typical frame breaks the budget, by as much as the pixel cost needs", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    const lowered = overload(governor, clock, 40);
    expect(lowered).toHaveLength(1);
    expect(lowered[0]).toBeLessThanOrEqual(2 * Math.sqrt((FRAME_BUDGET_MS * RAISE_HEADROOM) / 40));
    expect(governor.scale).toBe(1);
  });

  it("does not lower for single long frames or stalls such as a yard loading", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    for (let i = 0; i < 120; i++) {
      clock.now += 16.7;
      expect(governor.observe({ frameMs: i % 5 === 0 ? 48 : 16.7, gpuMs: null }, clock.now)).toBeNull();
    }
    clock.now += 900;
    expect(governor.observe({ frameMs: STALLED_FRAME_MS + 650, gpuMs: null }, clock.now)).toBeNull();
    expect(governor.scale).toBe(2);
  });

  it("keeps the scale when the GPU timer shows the slow frames are not the GPU's", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    expect(overload(governor, clock, 33, 6)).toEqual([]);
    expect(governor.scale).toBe(2);
  });

  it("lowers on GPU time alone when the GPU is over the budget", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    expect(overload(governor, clock, 16.7, 24)).toHaveLength(1);
    expect(governor.scale).toBeLessThan(2);
  });

  it("lowers without a GPU timer when frames are fast at the median but long on average, as on Iris Xe at 3840 by 2160", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    const changes: number[] = [];
    for (let i = 0; i < LOWER_WINDOW_FRAMES * 2 && changes.length === 0; i++) {
      const frameMs = i % 3 === 2 ? 150 : 16;
      clock.now += frameMs;
      const change = governor.observe({ frameMs, gpuMs: null }, clock.now);
      if (change !== null) changes.push(change);
    }
    expect(changes).toHaveLength(1);
    expect(governor.scale).toBe(1);
  });

  it("keeps the scale through streaming spikes while the GPU timer shows the GPU within the budget, as on the GTX 1650 route walk", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    const spikes = new Map([
      [40, 56],
      [41, 106],
      [90, 176],
      [140, 268],
      [141, 133],
    ]);
    for (let i = 0; i < 400; i++) {
      const frameMs = spikes.get(i) ?? 15;
      clock.now += frameMs;
      expect(governor.observe({ frameMs, gpuMs: 14.4 }, clock.now)).toBeNull();
    }
    expect(governor.scale).toBe(2);
  });

  it("lowers on GPU time even when only some frames return a timer result", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    const changes: number[] = [];
    for (let i = 0; i < LOWER_WINDOW_FRAMES; i++) {
      clock.now += 40;
      const change = governor.observe({ frameMs: 40, gpuMs: i % 4 === 0 ? 38 : null }, clock.now);
      if (change !== null) changes.push(change);
    }
    expect(changes).toHaveLength(1);
  });

  it("once the GPU timer has reported, waits for its results instead of lowering on frame time alone", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    feed(governor, clock, 3, 15, 10);
    expect(feed(governor, clock, LOWER_WINDOW_FRAMES * 2, 60, null)).toEqual([]);
    expect(governor.scale).toBe(2);
  });

  it("raises again only with measured GPU headroom for the next level", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    overload(governor, clock, 40, 40);
    const lowered = governor.scale;
    const tight = (FRAME_BUDGET_MS * RAISE_HEADROOM) / ((governor.levels[governor.levels.indexOf(lowered) + 1]! / lowered) ** 2);
    expect(feed(governor, clock, RAISE_WINDOW_FRAMES * 20, 16.7, tight + 0.5)).toEqual([]);
    const raised = feed(governor, clock, RAISE_WINDOW_FRAMES * 20, 16.7, 3);
    expect(raised[0]).toBeGreaterThan(lowered);
  });

  it("never raises before the settle time has passed", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    overload(governor, clock, 40, 40);
    const changedAt = clock.now;
    const changes = feed(governor, clock, Math.floor((SCALE_SETTLE_MS - 100) / 16.7), 16.7, 2);
    expect(changes).toEqual([]);
    expect(clock.now - changedAt).toBeLessThan(SCALE_SETTLE_MS);
  });

  it("without a GPU timer, retries a level it failed at after a wait that doubles each time", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(1.25, clock.now);
    overload(governor, clock, 25);
    expect(governor.scale).toBe(1);
    const failedAt = clock.now;
    while (clock.now < failedAt + SCALE_RETRY_MS - 50) feed(governor, clock, 1, 16.7);
    expect(governor.scale).toBe(1);
    while (governor.scale === 1 && clock.now < failedAt + SCALE_RETRY_MS + 2000) feed(governor, clock, 1, 16.7);
    expect(governor.scale).toBe(1.25);
    overload(governor, clock, 25);
    expect(governor.scale).toBe(1);
    const failedAgain = clock.now;
    while (governor.scale === 1 && clock.now < failedAgain + 4 * SCALE_RETRY_MS) feed(governor, clock, 1, 16.7);
    expect(clock.now - failedAgain).toBeGreaterThanOrEqual(2 * SCALE_RETRY_MS);
  });

  it("stays at CSS pixel density when even that breaks the budget", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    overload(governor, clock, 60);
    expect(governor.scale).toBe(1);
    expect(feed(governor, clock, LOWER_WINDOW_FRAMES * 10, 30)).toEqual([]);
    expect(governor.scale).toBe(1);
  });

  it("without a GPU timer, keeps the device density when the display paces frames at 30 or 50 Hz and lowering does not shorten them", () => {
    for (const paceMs of [33.3, 20]) {
      const clock = { now: 0 };
      const governor = new RenderScaleGovernor(2, clock.now);
      const changes = run(governor, clock, 120_000, { paceMs, msAtCss: 2, timer: false });
      expect(changes.length).toBeLessThanOrEqual(2);
      expect(governor.scale).toBe(2);
    }
  });

  it("without a GPU timer, still lowers on a 30 Hz display when lowering does shorten the frames", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    run(governor, clock, 30_000, { paceMs: 33.3, msAtCss: 16, timer: false });
    expect(governor.scale).toBeLessThan(2);
  });

  it("forgets a learned 30 Hz pace once frames meet the 60 Hz budget again", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    run(governor, clock, 10_000, { paceMs: 33.3, msAtCss: 2, timer: false });
    expect(governor.scale).toBe(2);
    run(governor, clock, 3_000, { paceMs: 16.7, msAtCss: 2, timer: false });
    run(governor, clock, 3_000, { paceMs: 16.7, msAtCss: 7, timer: false });
    expect(governor.scale).toBeLessThan(2);
  });

  it("with a GPU timer, climbs back to the device density at a 30 Hz pace once the GPU has headroom again", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    overload(governor, clock, 33.3, 25);
    expect(governor.scale).toBeLessThan(2);
    run(governor, clock, 60_000, { paceMs: 33.3, msAtCss: 1.25, timer: true });
    expect(governor.scale).toBe(2);
  });

  it("lowers on a device whose every frame takes longer than a stall, with or without a GPU timer", () => {
    for (const timer of [true, false]) {
      const clock = { now: 0 };
      const governor = new RenderScaleGovernor(2, clock.now);
      run(governor, clock, 120_000, { paceMs: 16.7, msAtCss: 75, timer });
      expect(governor.scale).toBe(1);
    }
  });

  it("ignores up to two stalls in a row", () => {
    const clock = { now: 0 };
    const governor = new RenderScaleGovernor(2, clock.now);
    for (let round = 0; round < 20; round++) {
      feed(governor, clock, SLOW_DEVICE_RUN - 1, STALLED_FRAME_MS + 400);
      feed(governor, clock, 10, 16.7);
    }
    expect(governor.scale).toBe(2);
  });
});
