import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";

import { MemoryOutbox, TelemetryProvider } from "@/features/telemetry/client";
import type { TelemetryEvent } from "@/features/telemetry/contracts";

export { fixtureView } from "./fixtures";

export const SESSION = "0190f0a0-0000-7000-8000-000000000001";

export interface Harness extends RenderResult {
  outbox: MemoryOutbox;
  events(): Promise<TelemetryEvent[]>;
}

export function renderWithTelemetry(ui: ReactNode): Harness {
  const outbox = new MemoryOutbox();
  const fetchImpl = (async () => new Response("{}", { status: 503 })) as typeof fetch;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <TelemetryProvider config={{ sessionId: SESSION, contentVersion: "review-test", appBuild: "test", mode: "demo", storage: outbox, fetchImpl, sendBeacon: null, lifecycle: false, flushIntervalMs: 3_600_000 }}>{children}</TelemetryProvider>
  );
  const result = render(ui, { wrapper: Wrapper });
  return {
    ...result,
    outbox,
    async events() {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      return outbox.list(SESSION);
    },
  };
}
