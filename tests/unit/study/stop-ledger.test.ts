import { describe, expect, it, vi } from "vitest";

import type { StageEntryOutcome, StageRef } from "@/features/study/learning-progress";
import { resumeFrom, stopPosition } from "@/features/study/stage-coverage";
import { createStopLedger, type StopLedgerTimers } from "@/features/study/stop-ledger";
import type { StageTemplate } from "@/features/process/domain/stage-template";

const stop = (n: number): StageRef => ({ traditionKey: "ajrakh", stageKey: `s${n}`, stageNumber: n });
const admitted: StageEntryOutcome = { ok: true, persisted: true, visitCount: 1, backStep: false, complete: false, unvisited: 0 };
const unavailable: StageEntryOutcome = { ok: false, reason: "unavailable", expected: null };

function harness() {
  const answers = new Map<string, StageEntryOutcome[]>();
  const sent: string[] = [];
  let leftOk = true;
  const events = { onRefused: vi.fn(), onEnded: vi.fn(), onDelayed: vi.fn() };
  const pending: (() => void)[] = [];
  const timers: StopLedgerTimers = {
    set: (run) => pending.push(run),
    clear: () => {
      pending.length = 0;
    },
  };
  const ledger = createStopLedger(
    {
      enter: async (entered) => {
        sent.push(`in:${entered.stageKey}`);
        return answers.get(entered.stageKey)?.shift() ?? admitted;
      },
      left: async (gone) => {
        sent.push(`out:${gone.stageKey}`);
        return leftOk;
      },
    },
    events,
    timers,
  );
  const settle = async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  };
  const retry = async () => {
    const run = pending.shift();
    run?.();
    await settle();
  };
  return { ledger, answers, sent, events, settle, retry, pending, setLeftOk: (ok: boolean) => (leftOk = ok) };
}

describe("stop ledger", () => {
  it("re-reports a lost stop before anything after it, in the order walked", async () => {
    const h = harness();
    h.answers.set("s1", [unavailable, unavailable]);
    h.ledger.entered(stop(1));
    h.ledger.left(stop(1), 500);
    h.ledger.entered(stop(2));
    await h.settle();
    expect(h.sent).toEqual(["in:s1"]);
    expect(h.events.onDelayed).toHaveBeenCalledWith(true);
    await h.retry();
    expect(h.sent).toEqual(["in:s1", "in:s1"]);
    await h.retry();
    expect(h.sent).toEqual(["in:s1", "in:s1", "in:s1", "out:s1", "in:s2"]);
    expect(h.events.onDelayed).toHaveBeenLastCalledWith(false);
    expect(h.events.onRefused).not.toHaveBeenCalled();
  });

  it("re-reports a lost exit", async () => {
    const h = harness();
    h.setLeftOk(false);
    h.ledger.left(stop(1), 500);
    await h.settle();
    h.setLeftOk(true);
    await h.retry();
    expect(h.sent).toEqual(["out:s1", "out:s1"]);
  });

  it("acts on a refusal: drops what follows and names the stop the server expects", async () => {
    const h = harness();
    const expected = { traditionKey: "ajrakh", stageKey: "s1" };
    h.answers.set("s3", [{ ok: false, reason: "stop_ahead", expected }]);
    h.ledger.entered(stop(3));
    h.ledger.left(stop(3), 10);
    h.ledger.entered(stop(4));
    await h.settle();
    expect(h.sent).toEqual(["in:s3"]);
    expect(h.events.onRefused).toHaveBeenCalledWith(expected);
  });

  it("stops when the server says learning has ended", async () => {
    const h = harness();
    h.answers.set("s1", [{ ok: false, reason: "not_learning", expected: null }]);
    h.ledger.entered(stop(1));
    h.ledger.entered(stop(2));
    await h.settle();
    expect(h.sent).toEqual(["in:s1"]);
    expect(h.events.onEnded).toHaveBeenCalledTimes(1);
  });

  it("stays silent once the door has gone, and still delivers what is left", async () => {
    const h = harness();
    h.answers.set("s1", [{ ok: false, reason: "not_learning", expected: null }]);
    h.ledger.setListening(false);
    h.ledger.left(stop(9), 5);
    h.ledger.entered(stop(1));
    await h.settle();
    expect(h.sent).toEqual(["out:s9", "in:s1"]);
    expect(h.events.onEnded).not.toHaveBeenCalled();
  });

  it("flush retries at once and reports whether everything arrived", async () => {
    const h = harness();
    expect(await h.ledger.flush()).toBe(true);
    h.answers.set("s1", [unavailable, unavailable]);
    h.ledger.entered(stop(1));
    await h.settle();
    expect(await h.ledger.flush()).toBe(false);
    expect(await h.ledger.flush()).toBe(true);
    expect(h.sent).toEqual(["in:s1", "in:s1", "in:s1"]);
  });

  it("flush resolves true once a retry succeeds", async () => {
    const h = harness();
    h.answers.set("s1", [unavailable]);
    h.ledger.entered(stop(1));
    await h.settle();
    expect(await h.ledger.flush()).toBe(true);
    expect(h.sent).toEqual(["in:s1", "in:s1"]);
  });
});

describe("resume position", () => {
  const stages = (tradition: string) => [1, 2, 3].map((number) => ({ key: `${tradition}.s${number}`, number })) as unknown as StageTemplate["stages"];
  const templates = [
    { tradition: "ajrakh", stages: stages("ajrakh") },
    { tradition: "sanganeri", stages: stages("sanganeri") },
  ] as unknown as readonly StageTemplate[];

  it("starts at the beginning when nothing is recorded", () => {
    expect(resumeFrom(templates, [])).toBeNull();
  });

  it("continues from the last visit, keeping the furthest stop of each tradition", () => {
    const visits = [
      { traditionKey: "ajrakh", stageKey: "ajrakh.s1" },
      { traditionKey: "ajrakh", stageKey: "ajrakh.s2" },
      { traditionKey: "ajrakh", stageKey: "ajrakh.s3" },
      { traditionKey: "ajrakh", stageKey: "ajrakh.s2" },
    ];
    expect(resumeFrom(templates, visits)).toEqual({ tradition: 0, stop: 1, reached: [2, -1] });
  });

  it("places the product stop after the last stage", () => {
    expect(stopPosition(templates, { traditionKey: "sanganeri", stageKey: "products" })).toEqual({ tradition: 1, stop: 3 });
    expect(stopPosition(templates, { traditionKey: "other", stageKey: "x" })).toBeNull();
  });
});
