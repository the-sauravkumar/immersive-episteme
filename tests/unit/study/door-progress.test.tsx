import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  reportWalkthroughUnavailable: vi.fn(),
  endFamiliarisation: vi.fn(),
}));
vi.mock("@/server/study/actions", () => actions);
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { EXCLUDED_PAGE, STUDY_HUB, TIME_REMAINING_NOTICE, routeAfterRenderFailure, useDoorProgress, useRenderFailureReport } from "@/app/(learning)/learn/door-progress";
import { PRACTICE_UNSENT, usePracticeFinish } from "@/app/(learning)/learn/practice-doors";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce({ status, ok: status >= 200 && status < 300, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("finishing the learning task", () => {
  it("explains that the questions open when the time is up, instead of blaming the connection", async () => {
    reply(409, { ok: false, reason: "time_remaining", endsAt: "2026-11-07T10:30:00.000Z" });
    const { result } = renderHook(() => useDoorProgress([]));
    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.finish();
    });
    expect(accepted).toBe(false);
    expect(result.current.notice).toBe(TIME_REMAINING_NOTICE);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends a participant whose session is no longer valid to the study hub", async () => {
    reply(401, { error: "unauthenticated" });
    const { result } = renderHook(() => useDoorProgress([]));
    await act(async () => {
      await result.current.finish();
    });
    expect(router.replace).toHaveBeenCalledWith(STUDY_HUB);
    expect(result.current.notice).toBeNull();
  });
});

describe("a walkthrough that cannot render", () => {
  it("shows an excluded participant the exclusion message, not the empty entry form", async () => {
    expect(routeAfterRenderFailure({ ok: true, outcome: "excluded" })).toBe(EXCLUDED_PAGE);
    expect(routeAfterRenderFailure({ ok: true, outcome: "retry", reason: "webgl_unavailable" })).toBe(STUDY_HUB);
    expect(routeAfterRenderFailure({ ok: true, outcome: "reassigned" })).toBe(STUDY_HUB);
    actions.reportWalkthroughUnavailable.mockResolvedValueOnce({ ok: true, outcome: "excluded" });
    const { result } = renderHook(() => useRenderFailureReport(true));
    act(() => result.current.onRenderFailed());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(EXCLUDED_PAGE));
  });
});

describe("the end of practice", () => {
  it("sends one request at a time and says so when it fails", async () => {
    let fail: (reason: unknown) => void = () => undefined;
    actions.endFamiliarisation.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    const { result } = renderHook(() => usePracticeFinish({ studyMode: true, returnTo: "/explore" }));
    act(() => {
      result.current.finish();
      result.current.finish();
    });
    expect(actions.endFamiliarisation).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error("network")));
    expect(result.current.error).toBe(PRACTICE_UNSENT);
    actions.endFamiliarisation.mockResolvedValueOnce({});
    await act(async () => result.current.finish());
    expect(actions.endFamiliarisation).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });
});
