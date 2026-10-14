import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemoryOutbox, TelemetryProvider, useTelemetry } from "@/features/telemetry/client";

import { SESSION, fakeFetch } from "./helpers";

function Probe() {
  const t = useTelemetry();
  return (
    <button type="button" onClick={() => void t.pageEntered({ roomOrPageId: "home" })}>
      enqueued {t.stats.enqueued}
    </button>
  );
}

describe("TelemetryProvider", () => {
  it("provides typed helpers and live stats", async () => {
    const fetch = fakeFetch([500]);
    render(
      <TelemetryProvider
        config={{ sessionId: SESSION, contentVersion: "v1", appBuild: "b", mode: "demo", storage: new MemoryOutbox(), fetchImpl: fetch.impl, sendBeacon: null }}
      >
        <Probe />
      </TelemetryProvider>,
    );
    await act(async () => {
      screen.getByRole("button").click();
    });
    expect(await screen.findByText("enqueued 1")).toBeInTheDocument();
  });

  it("throws outside a provider", () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(/inside <TelemetryProvider>/);
    } finally {
      console.error = original;
    }
  });
});
