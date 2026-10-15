/**
 * Test harness for 2D components: a real telemetry tracker over an in-memory outbox (no
 * network, no lifecycle listeners), an in-memory visit store, a fixture knowledge view built
 * from the placeholder knowledge-graph fixtures (no craft facts), and a controllable
 * IntersectionObserver for the "content in view" rule.
 */
import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";

import { createVisitStore, type VisitStore } from "@/features/learning-2d/visit-store";
import { VisitStoreProvider } from "@/features/learning-2d/ui/session";
import { MemoryOutbox, TelemetryProvider } from "@/features/telemetry/client";
import type { TelemetryEvent } from "@/features/telemetry/contracts";

export { fixtureView } from "./fixtures";

export const SESSION = "0190f0a0-0000-7000-8000-000000000001";

export interface Harness extends RenderResult {
  outbox: MemoryOutbox;
  visits: VisitStore;
  /** Events enqueued so far (after pending tracks settle). */
  events(): Promise<TelemetryEvent[]>;
}

export function renderWithTelemetry(ui: ReactNode, opts: { visits?: VisitStore; sessionStorage?: Pick<Storage, "getItem" | "setItem"> | null } = {}): Harness {
  const outbox = new MemoryOutbox();
  const visits = opts.visits ?? createVisitStore(SESSION, opts.sessionStorage ?? null);
  const fetchImpl = (async () => new Response("{}", { status: 503 })) as typeof fetch;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <TelemetryProvider
      config={{ sessionId: SESSION, contentVersion: "review-test", appBuild: "test", mode: "demo", storage: outbox, fetchImpl, sendBeacon: null, lifecycle: false, flushIntervalMs: 3_600_000 }}
    >
      <VisitStoreProvider value={visits}>{children}</VisitStoreProvider>
    </TelemetryProvider>
  );
  // As a wrapper, so `rerender` keeps the session mounted (pages come and go, the session stays).
  const result = render(ui, { wrapper: Wrapper });
  return {
    ...result,
    outbox,
    visits,
    async events() {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      return outbox.list(SESSION);
    },
  };
}

/** A controllable IntersectionObserver: `observers` holds every instance; `fire` reports an entry. */
export class MockIntersectionObserver {
  static observers: MockIntersectionObserver[] = [];
  readonly elements: Element[] = [];
  constructor(readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.observers.push(this);
  }
  observe(el: Element) {
    this.elements.push(el);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  /** Reports the element at `ratio` visible; `heights` lets a tall element fill the viewport. */
  fire(ratio: number, heights: { element?: number; viewport?: number } = {}) {
    const element = heights.element ?? 400;
    const viewport = heights.viewport ?? 800;
    const visible = element * ratio;
    const entry = {
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
      intersectionRect: { height: visible } as DOMRectReadOnly,
      boundingClientRect: { height: element } as DOMRectReadOnly,
      rootBounds: { height: viewport } as DOMRectReadOnly,
      target: this.elements[0]!,
      time: 0,
    } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}
