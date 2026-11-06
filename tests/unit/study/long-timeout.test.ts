import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_TIMER_DELAY_MS, setLongTimeout } from "@/lib/timers/long-timeout";

const CAP_IN_2099_MS = Date.parse("2099-01-01T00:00:00.000Z") - Date.parse("2026-11-04T10:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("setLongTimeout", () => {
  it("never hands Node a delay above the timer maximum, so no TimeoutOverflowWarning is raised", async () => {
    const warnings: string[] = [];
    const listen = (w: Error) => warnings.push(w.name);
    process.on("warning", listen);
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const cancel = setLongTimeout(() => undefined, CAP_IN_2099_MS);
    await new Promise((r) => setImmediate(r));
    cancel();
    process.off("warning", listen);
    expect(CAP_IN_2099_MS).toBeGreaterThan(MAX_TIMER_DELAY_MS);
    expect(timeout.mock.calls.map(([, ms]) => ms)).toEqual([MAX_TIMER_DELAY_MS]);
    expect(warnings).toEqual([]);
  });

  it("re-arms past the maximum and runs once the whole delay has passed", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    setLongTimeout(run, MAX_TIMER_DELAY_MS * 2 + 5);
    vi.advanceTimersByTime(MAX_TIMER_DELAY_MS * 2);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs a past or unreadable delay at once and can be cancelled before it runs", () => {
    vi.useFakeTimers();
    const late = vi.fn();
    const unreadable = vi.fn();
    const cancelled = vi.fn();
    setLongTimeout(late, -500);
    setLongTimeout(unreadable, Number.NaN);
    setLongTimeout(cancelled, 1000)();
    vi.advanceTimersByTime(1000);
    expect(late).toHaveBeenCalledTimes(1);
    expect(unreadable).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
