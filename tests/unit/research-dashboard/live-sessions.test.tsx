/**
 * Research dashboard live path (step 3 open item research-dashboard-live): a `change` event from
 * the stream updates the per-session telemetry table in place from a rows fetch, without waiting
 * for router.refresh() (a whole-page transition that committed 2.2-4.0 s after the insert on the
 * production build), and older data can never replace newer data.
 */
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveSessionsTable, newestSessions } from "@/app/(research)/research/dashboard/_components/live-sessions";
import { LiveStatus } from "@/app/(research)/research/dashboard/_components/live-status";
import type { SessionTelemetryRow } from "@/server/research/dashboard";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const STUDY = "0190f0a0-0000-7000-8000-00000000d001";
const row = (events: number): SessionTelemetryRow => ({
  sessionId: "0190f0a0-0000-7000-8000-00000000e001",
  participantCode: "P-LIVE01",
  conditionId: "c2d",
  status: "in_progress",
  events,
  exposureMs: 60_000,
  navigationMs: 30_000,
  pauseMs: 0,
  unterminated: 0,
  conceptsExposed: 2,
  coverage: 0.5,
  relationshipsFollowed: 1,
  citationOpens: 0,
  guidanceUses: 0,
});

class FakeEventSource extends EventTarget {
  static last: FakeEventSource | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    super();
    FakeEventSource.last = this;
  }
  close() {}
  emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  router.refresh.mockClear();
  vi.stubGlobal("EventSource", FakeEventSource);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const eventsCell = () => within(screen.getByRole("row", { name: /P-LIVE01/ })).getAllByRole("cell")[3]!;

describe("live per-session table", () => {
  it("shows the newer of the rendered and the live rows of the same study", () => {
    const rendered = { studyId: STUDY, generatedAt: "2026-10-16T10:00:01.000Z", rows: [row(5)] };
    expect(newestSessions(rendered, { studyId: STUDY, generatedAt: "2026-10-16T10:00:02.000Z", rows: [row(6)] }).rows[0]!.events).toBe(6);
    expect(newestSessions(rendered, { studyId: STUDY, generatedAt: "2026-10-16T10:00:00.000Z", rows: [row(4)] }).rows[0]!.events).toBe(5);
    expect(newestSessions(rendered, { studyId: "other", generatedAt: "2026-10-16T10:00:09.000Z", rows: [row(9)] }).rows[0]!.events).toBe(5);
  });

  it("updates the events cell from the rows fetch on a change event, before any page refresh", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ serverTime: "2026-10-16T10:00:05.000Z", fingerprint: "f2", generatedAt: "2026-10-16T10:00:05.000Z", sessions: [row(8)] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <>
        <LiveStatus studyId={STUDY} serverTime="2026-10-16T10:00:01.000Z" fingerprint="f1" />
        <LiveSessionsTable studyId={STUDY} generatedAt="2026-10-16T10:00:01.000Z" rows={[row(7)]} conditionNames={{ c2d: "2D pages" }} maySessions={false} number={6} />
      </>,
    );
    expect(eventsCell()).toHaveTextContent("7");
    await act(async () => {
      FakeEventSource.last!.emit("ready", { serverTime: "2026-10-16T10:00:02.000Z", fingerprint: "f1", listening: true });
      FakeEventSource.last!.emit("change", { serverTime: "2026-10-16T10:00:05.000Z" });
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(eventsCell()).toHaveTextContent("8"));
    expect(fetchMock.mock.calls[0]![0]).toContain("include=sessions");
    // The whole-page refresh is still scheduled for the other figures, but the table did not wait for it.
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
