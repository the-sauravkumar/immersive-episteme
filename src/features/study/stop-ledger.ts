import type { StageEntryOutcome, StageLeftOutcome, StageRef } from "./learning-progress";
import type { StageVisit } from "./stage-coverage";

export interface StopLedgerPort {
  readonly enter: (stop: StageRef) => Promise<StageEntryOutcome>;
  readonly left: (stop: StageRef, activeMs: number) => Promise<StageLeftOutcome>;
}

export interface StopLedgerEvents {
  readonly onRefused: (expected: StageVisit | null) => void;
  readonly onEnded: () => void;
  readonly onDelayed: (delayed: boolean) => void;
}

export interface StopLedgerTimers {
  readonly set: (run: () => void, delayMs: number) => unknown;
  readonly clear: (handle: unknown) => void;
}

export interface StopLedger {
  entered(stop: StageRef): void;
  left(stop: StageRef, activeMs: number): void;
  flush(): Promise<boolean>;
  setListening(listening: boolean): void;
}

type Report = { readonly kind: "entered"; readonly stop: StageRef } | { readonly kind: "left"; readonly stop: StageRef; readonly activeMs: number };

const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 15000] as const;

const browserTimers: StopLedgerTimers = { set: (run, delayMs) => setTimeout(run, delayMs), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export function createStopLedger(port: StopLedgerPort, events: StopLedgerEvents, timers: StopLedgerTimers = browserTimers): StopLedger {
  const queue: Report[] = [];
  const waiting: ((settled: boolean) => void)[] = [];
  let sending = false;
  let failures = 0;
  let retry: unknown = null;
  let listening = true;

  const settleWaiting = (settled: boolean) => {
    for (const resolve of waiting.splice(0)) resolve(settled);
  };

  const delivered = () => {
    queue.shift();
    if (failures > 0) events.onDelayed(false);
    failures = 0;
  };

  const lost = () => {
    if (failures === 0) events.onDelayed(true);
    const delayMs = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)]!;
    failures += 1;
    retry = timers.set(() => {
      retry = null;
      drain();
    }, delayMs);
    settleWaiting(false);
  };

  const abandon = (notify: () => void) => {
    queue.length = 0;
    if (failures > 0) events.onDelayed(false);
    failures = 0;
    settleWaiting(false);
    if (listening) notify();
  };

  const onEntry = (outcome: StageEntryOutcome) => {
    if (outcome.ok) return delivered();
    if (outcome.reason === "unavailable") return lost();
    if (outcome.reason === "not_learning") return abandon(events.onEnded);
    abandon(() => events.onRefused(outcome.expected));
  };

  const onLeft = (outcome: StageLeftOutcome) => {
    if (outcome === "delivered") return delivered();
    if (outcome === "unavailable") return lost();
    abandon(events.onEnded);
  };

  function drain(): void {
    if (sending || retry !== null) return;
    const head = queue[0];
    if (!head) {
      settleWaiting(true);
      return;
    }
    sending = true;
    const sent: Promise<void> = head.kind === "entered" ? port.enter(head.stop).then(onEntry) : port.left(head.stop, head.activeMs).then(onLeft);
    void sent.finally(() => {
      sending = false;
      drain();
    });
  }

  return {
    entered(stop) {
      queue.push({ kind: "entered", stop });
      drain();
    },
    left(stop, activeMs) {
      queue.push({ kind: "left", stop, activeMs });
      drain();
    },
    setListening(next) {
      listening = next;
    },
    flush() {
      if (queue.length === 0 && !sending) return Promise.resolve(true);
      if (retry !== null) {
        timers.clear(retry);
        retry = null;
      }
      const settled = new Promise<boolean>((resolve) => waiting.push(resolve));
      drain();
      return settled;
    },
  };
}
