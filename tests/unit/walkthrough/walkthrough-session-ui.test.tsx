import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LearningSessionFrame } from "@/components/study/learning-session-frame";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { closeOpenStop, logStageLeft, registerOpenStop } from "@/features/study/learning-progress";
import { MemoryOutbox, TelemetryProvider } from "@/features/telemetry/client";
import type { WalkEngine, WalkEngineEvents, WalkEngineFactory } from "@/features/walkthrough/application/walk-engine";
import type { RouteStation } from "@/features/walkthrough/domain/route-plan";
import { WalkthroughPractice } from "@/features/walkthrough/ui/walkthrough-practice";
import { WalkthroughSession, type WalkthroughSessionEvents } from "@/features/walkthrough/ui/walkthrough-session";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const stage = (tradition: string, number: number) => ({
  number,
  key: `${tradition}.s${number}`,
  sourceStageKeys: [],
  name: `Stage ${number}`,
  localName: null,
  kind: "table" as const,
  caption: { text: `Caption ${number}.`, sources: [] },
  items: [],
  clothStateId: `${tradition}-0${number}`,
});

const template = (tradition: "ajrakh" | "sanganeri"): StageTemplate => ({
  tradition,
  traditionName: tradition,
  rawClothStateId: `${tradition}-raw`,
  stages: [stage(tradition, 1), stage(tradition, 2)],
  products: [{ id: "p1", file: "/walkthrough/products/p1.jpg", name: "Textile", holder: "Holder", widthPx: 100, heightPx: 100, record: "https://example.org/record" }],
});

const templates = [template("ajrakh"), template("sanganeri")];

class FakeEngine implements WalkEngine {
  paused = false;
  stationIndex = -1;
  disposed = false;
  startedAt: number | null = null;
  starting: Promise<void> = Promise.resolve();
  walks: number[] = [];
  moves: [number, number][] = [];

  constructor(
    readonly stations: readonly RouteStation[],
    readonly events: WalkEngineEvents,
    private readonly entering: boolean,
  ) {}

  start(startIndex = 0): Promise<void> {
    this.startedAt = startIndex;
    if (this.entering) this.enter(startIndex);
    return this.starting;
  }

  enter(index: number): void {
    this.stationIndex = index;
    this.events.onStationEntered(this.stations[index]!, index);
  }

  setMove(forward: number, strafe: number): void {
    this.moves.push([forward, strafe]);
  }
  look(): void {}
  endLook(): void {}
  walkTo(index: number): void {
    this.walks.push(index);
  }
  resize(): void {}
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.stationIndex >= 0) this.events.onStationLeft(this.stations[this.stationIndex]!, this.stationIndex, 700, 300, 2);
  }
}

function fixture(options: { entering?: boolean; throws?: boolean; rejects?: boolean } = {}) {
  const engines: FakeEngine[] = [];
  const createEngine: WalkEngineFactory = (_host, stations, _textiles, events) => {
    if (options.throws) throw new Error("no webgl");
    const engine = new FakeEngine(stations, events, options.entering ?? true);
    if (options.rejects) engine.starting = Promise.reject(new Error("fetch failed"));
    engines.push(engine);
    return engine;
  };
  const events: WalkthroughSessionEvents = {
    onStageEntered: vi.fn(),
    onStageLeft: vi.fn(),
    onMovement: vi.fn(),
    onViewpointChanges: vi.fn(),
    onObjectDwell: vi.fn(),
    onPathSample: vi.fn(),
    onWrongTurn: vi.fn(),
    onSourceOpened: vi.fn(),
    onFinished: vi.fn(async () => false),
    onRenderFailed: vi.fn(),
    onContextLost: vi.fn(),
    onGuidance: vi.fn(),
    registerExit: registerOpenStop,
  };
  return { engines, createEngine, events };
}

afterEach(cleanup);

describe("WalkthroughSession", () => {
  it("sends the open stop's exit from the runtime's counters when it unmounts, with no clock of its own", () => {
    const f = fixture();
    const { unmount } = render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    f.engines[0]!.events.onPath(1, 2);
    unmount();
    expect(f.events.onStageLeft).toHaveBeenCalledTimes(1);
    expect(f.events.onStageLeft).toHaveBeenCalledWith({ traditionKey: "ajrakh", stageKey: "ajrakh.s1", stageNumber: 1 }, 700);
    expect(f.events.onMovement).toHaveBeenCalledWith({ traditionKey: "ajrakh", stageKey: "ajrakh.s1", stageNumber: 1 }, 300, 400);
    expect(f.events.onViewpointChanges).toHaveBeenCalledTimes(1);
    expect(f.events.onPathSample).toHaveBeenCalledTimes(1);
  });

  it("closes the open stop once through the registered exit, as the cap and pagehide do", () => {
    const f = fixture();
    const { unmount } = render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    closeOpenStop();
    expect(f.engines[0]!.disposed).toBe(true);
    unmount();
    expect(f.events.onStageLeft).toHaveBeenCalledTimes(1);
  });

  it("resumes at the recorded stop with no entry report, and reports the next stop normally", () => {
    const f = fixture();
    render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} resume={{ tradition: 1, stop: 1, reached: [2, 1] }} />);
    const engine = f.engines[0]!;
    expect(engine.startedAt).toBe(1);
    expect(f.events.onStageEntered).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Walkthrough of sanganeri/)).toBeTruthy();
    act(() => engine.enter(2));
    expect(f.events.onStageEntered).toHaveBeenCalledWith({ traditionKey: "sanganeri", stageKey: "products", stageNumber: 3 });
  });

  it("starts the walk again at the stop the door restores, and reports that entry", () => {
    const f = fixture();
    const { rerender } = render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    rerender(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} restore={{ tradition: 1, stop: 0 }} />);
    expect(f.engines[0]!.disposed).toBe(true);
    expect(f.engines[1]!.startedAt).toBe(0);
    expect(f.events.onStageEntered).toHaveBeenLastCalledWith({ traditionKey: "sanganeri", stageKey: "sanganeri.s1", stageNumber: 1 });
  });

  it("starts each path segment apart, so a new walk is not measured from the last one", () => {
    const f = fixture();
    const { rerender } = render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    f.engines[0]!.events.onPath(1, 2);
    rerender(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} restore={{ tradition: 1, stop: 0 }} />);
    f.engines[1]!.events.onPath(3, 4);
    closeOpenStop();
    const calls = vi.mocked(f.events.onPathSample).mock.calls;
    expect(calls.map((call) => call[0])).toEqual(["ajrakh", "sanganeri"]);
    expect(calls[0]![1]).not.toBe(calls[1]![1]);
  });

  it.each([
    ["a throwing constructor", { throws: true }],
    ["a rejected start", { rejects: true }],
  ])("reports %s as a render failure and shows why", async (_name, options) => {
    const f = fixture(options);
    render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(f.events.onRenderFailed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("This Device Cannot Show The Yard");
  });

  it("reports a lost context, closing the stop first", () => {
    const f = fixture();
    render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    act(() => f.engines[0]!.events.onContextLost());
    expect(f.events.onStageLeft).toHaveBeenCalledTimes(1);
    expect(f.events.onRenderFailed).toHaveBeenCalledTimes(1);
    expect(f.events.onContextLost).toHaveBeenCalledTimes(1);
  });

  it("reports nothing when the context is lost because the page is closing", () => {
    const f = fixture();
    render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
      f.engines[0]!.events.onContextLost();
    });
    expect(f.events.onRenderFailed).not.toHaveBeenCalled();
    expect(f.events.onContextLost).not.toHaveBeenCalled();
  });

  it("reports a context loss only when the context is lost, not when the yard fails to start", async () => {
    const f = fixture({ rejects: true });
    render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(f.events.onRenderFailed).toHaveBeenCalledTimes(1);
    expect(f.events.onContextLost).not.toHaveBeenCalled();
  });

  it("does not report a failed start after the session has gone", async () => {
    const f = fixture({ rejects: true });
    const { unmount } = render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    unmount();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.events.onRenderFailed).not.toHaveBeenCalled();
  });

  it("ignores B until the first station is entered", () => {
    const f = fixture({ entering: false });
    render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} />);
    fireEvent.keyDown(window, { code: "KeyB" });
    expect(f.engines[0]!.walks).toEqual([]);
    act(() => f.engines[0]!.enter(1));
    fireEvent.keyDown(window, { code: "KeyB" });
    expect(f.engines[0]!.walks).toEqual([0]);
  });

  it("labels the last button Finish outside a study, where no questions follow", () => {
    const f = fixture();
    render(<WalkthroughSession templates={[templates[0]!]} events={f.events} createEngine={f.createEngine} resume={{ tradition: 0, stop: 2, reached: [2] }} />);
    expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Questions" })).toBeNull();
  });

  it("states the configured time limit in Help, and no limit when there is none", () => {
    const f = fixture();
    const { unmount } = render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} studyMode guidance={{ time: { limitMinutes: 45 }, hint: null, stallSeconds: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const help = screen.getByRole("dialog", { name: "Help" }).textContent ?? "";
    expect(help).toContain("45 minutes");
    expect(help).not.toContain("30 minutes");
    expect(help).toContain("in the tradition you are in");
    unmount();
    render(<WalkthroughSession templates={templates} events={fixture().events} createEngine={fixture().createEngine} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "Help" }).textContent).toContain("There is no time limit");
  });

  it("offers the study's hint and logs it, and shows the stall cue after the set active time without a new stage", () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} studyMode guidance={{ time: { limitMinutes: 30 }, hint: "Follow the cloth.", stallSeconds: 60 }} />);
      fireEvent.click(screen.getByRole("button", { name: "Hint" }));
      expect(screen.getByRole("dialog", { name: "Hint" }).textContent).toContain("Follow the cloth.");
      expect(f.events.onGuidance).toHaveBeenLastCalledWith("followed", "hint");
      act(() => vi.advanceTimersByTime(120_000));
      expect(screen.queryByText("A hint is ready if you want one.")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      act(() => vi.advanceTimersByTime(59_000));
      expect(screen.queryByText("A hint is ready if you want one.")).toBeNull();
      act(() => vi.advanceTimersByTime(1_000));
      expect(screen.getByText("A hint is ready if you want one.")).toBeTruthy();
      expect(f.events.onGuidance).toHaveBeenLastCalledWith("shown", "stall");
      fireEvent.click(screen.getByRole("button", { name: "Not Now" }));
      expect(f.events.onGuidance).toHaveBeenLastCalledWith("dismissed", "stall");
      act(() => vi.advanceTimersByTime(30_000));
      act(() => f.engines[0]!.enter(1));
      act(() => vi.advanceTimersByTime(59_000));
      expect(screen.queryByText("A hint is ready if you want one.")).toBeNull();
      act(() => vi.advanceTimersByTime(1_000));
      fireEvent.click(screen.getByRole("button", { name: "Open Hint" }));
      expect(f.events.onGuidance).toHaveBeenLastCalledWith("followed", "stall");
      expect(screen.getByRole("dialog", { name: "Hint" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows no hint and no cue when the study sets none", () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      render(<WalkthroughSession templates={templates} events={f.events} createEngine={f.createEngine} studyMode />);
      act(() => vi.advanceTimersByTime(3_600_000));
      expect(screen.queryByRole("button", { name: "Hint" })).toBeNull();
      expect(screen.queryByText("A hint is ready if you want one.")).toBeNull();
      expect(f.events.onGuidance).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a refused finish be pressed again", async () => {
    const f = fixture();
    render(<WalkthroughSession templates={[templates[0]!]} events={f.events} createEngine={f.createEngine} resume={{ tradition: 0, stop: 2, reached: [2] }} studyMode />);
    const questions = screen.getByRole("button", { name: "Questions" });
    await act(async () => {
      fireEvent.click(questions);
    });
    expect(f.events.onFinished).toHaveBeenCalledTimes(1);
    expect(questions).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Back" })).toHaveProperty("disabled", false);
  });
});

describe("WalkthroughPractice", () => {
  it("keeps Finish Practice and the keys off until the yard is ready", () => {
    const f = fixture({ entering: false });
    const finished = vi.fn();
    render(<WalkthroughPractice createEngine={f.createEngine} onFinished={finished} onRenderFailed={vi.fn()} onContextLost={vi.fn()} />);
    const finish = screen.getByRole("button", { name: "Finish Practice" });
    expect(finish).toHaveProperty("disabled", true);
    fireEvent.keyDown(window, { code: "KeyW" });
    expect(f.engines[0]!.moves).toEqual([]);
    act(() => f.engines[0]!.enter(0));
    expect(finish).toHaveProperty("disabled", false);
    fireEvent.keyDown(window, { code: "KeyW" });
    expect(f.engines[0]!.moves).toEqual([[1, 0]]);
  });

  it("tells the practice yard's own facts in Help, not the session's stages, sources and limit", () => {
    const f = fixture();
    render(<WalkthroughPractice createEngine={f.createEngine} onFinished={vi.fn()} onRenderFailed={vi.fn()} onContextLost={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const help = screen.getByRole("dialog", { name: "Help" }).textContent ?? "";
    expect(help).toContain("Nothing here is part of the test");
    expect(help).not.toMatch(/stage|sources|30 minutes/i);
  });

  it("reports a failure to the door", () => {
    const f = fixture({ throws: true });
    const failed = vi.fn();
    render(<WalkthroughPractice createEngine={f.createEngine} onFinished={vi.fn()} onRenderFailed={failed} onContextLost={vi.fn()} />);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("logs a lost WebGL context in the practice yard before it reports the failure", () => {
    const f = fixture();
    const order: string[] = [];
    render(<WalkthroughPractice createEngine={f.createEngine} onFinished={vi.fn()} onRenderFailed={() => order.push("failed")} onContextLost={() => order.push("lost")} />);
    act(() => f.engines[0]!.events.onContextLost());
    expect(order).toEqual(["lost", "failed"]);
  });
});

describe("the exit order on unmount", () => {
  function Exiting() {
    useEffect(() => () => logStageLeft({ traditionKey: "ajrakh", stageKey: "ajrakh.s1", stageNumber: 1 }, 900), []);
    return null;
  }

  it("keeps the sink and tracker alive until the door's own cleanup has sent its exit", async () => {
    const beacons: string[] = [];
    const storage = new MemoryOutbox();
    const { unmount } = render(
      <TelemetryProvider
        config={{
          sessionId: "11111111-1111-4111-8111-111111111111",
          contentVersion: "v1",
          appBuild: "b",
          mode: "demo",
          storage,
          sendBeacon: (_url, data) => {
            void data.text().then((text) => beacons.push(text));
            return true;
          },
          fetchImpl: vi.fn(async () => new Response("{}", { status: 500 })),
        }}
      >
        <LearningSessionFrame endsAt={null} serverNow="2026-11-04T00:00:00.000Z" warningMinutes={5}>
          <Exiting />
        </LearningSessionFrame>
      </TelemetryProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(beacons.join("")).toContain("stage_left");
  });
});
