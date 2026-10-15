/**
 * The shared hybrid guidance UI (D6): the same Hint control in the shared StudyBar of both
 * conditions (DESIGN.md 9.14, 9.17; only the condition navigation group differs),
 * the stall cue from the shared detector, identical guidance_cue_used metadata, and nothing at all
 * unless the protocol enables it. Also the practice wording of the shared timer (D5).
 */
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { GuidanceProvider, StallCue } from "@/components/learning/guidance";
import { LearningPhaseProvider, LearningTimer } from "@/components/learning/learning-phase";
import { StudyBar, StudyBarButton } from "@/components/learning/study-bar";
import { GUIDANCE_TEXT } from "@/features/learning/guidance";
import type { GuidanceSettings } from "@/features/learning/settings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";

import { renderWithTelemetry } from "../learning-2d/harness";

vi.mock("next/navigation", () => ({ usePathname: () => "/learn/2d", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/form", () => ({ default: ({ children, ...rest }: { children: ReactNode }) => <form {...rest}>{children}</form> }));

const HYBRID: GuidanceSettings = { policy: "hybrid", cueEnabled: true, stallSeconds: 10, hintText: "Researcher hint for the test." };
const SELF_PACED: LearningTimeBudget = { mode: "self_paced", budgetSeconds: null, allowEarlyFinish: false, startedAt: null, endsAt: null, endedAt: null, serverNow: "2026-01-01T00:00:00.000Z", persisted: false };

function Chrome({ guidance, which }: { guidance: GuidanceSettings; which: "2d" | "3d" }) {
  return (
    <LearningPhaseProvider budget={SELF_PACED} mode="demo">
      <GuidanceProvider guidance={guidance}>
        <StudyBar
          location="Room"
          locationAs={which === "3d" ? "h1" : "text"}
          skipTargetId="content"
          conditionNav={
            which === "2d" ? (
              <StudyBarButton icon={<span aria-hidden="true" />} label="Contents" />
            ) : (
              <>
                <StudyBarButton icon={<span aria-hidden="true" />} label="Plan" />
                <StudyBarButton icon={<span aria-hidden="true" />} label="Controls help" />
                <StudyBarButton icon={<span aria-hidden="true" />} label="Pause" />
              </>
            )
          }
        />
        <StallCue />
      </GuidanceProvider>
    </LearningPhaseProvider>
  );
}

const guidanceEvents = async (h: Awaited<ReturnType<typeof renderWithTelemetry>>) =>
  (await h.events()).filter((e) => e.type === "guidance_cue_used").map((e) => ({ metadata: e.metadata, conceptId: e.conceptId, roomOrPageId: e.roomOrPageId }));

describe("hybrid guidance UI, shared by both conditions", { timeout: 20_000 }, () => {
  for (const which of ["2d", "3d"] as const) {
    it(`${which}: the Hint control sits next to the timer and logs open and close`, async () => {
      const h = renderWithTelemetry(<Chrome guidance={HYBRID} which={which} />);
      const hint = screen.getByRole("button", { name: GUIDANCE_TEXT.hintLabel });
      // Same place in both: the StudyBar's shared group, which holds the learning timer's finish control.
      expect(hint.closest("[data-slot=guidance-hint]")!.parentElement).toBe(screen.getByRole("button", { name: "Finish learning" }).closest("[data-slot=learning-timer]")!.parentElement);
      expect(hint).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(hint);
      const panel = screen.getByRole("region", { name: GUIDANCE_TEXT.hintTitle });
      expect(within(panel).getByText(HYBRID.hintText!)).toBeVisible();
      await userEvent.click(within(panel).getByRole("button", { name: "Close the hint" }));
      expect(await guidanceEvents(h)).toEqual([
        { metadata: { action: "shown", cueId: "guidance.hint" }, conceptId: undefined, roomOrPageId: undefined },
        { metadata: { action: "dismissed", cueId: "guidance.hint" }, conceptId: undefined, roomOrPageId: undefined },
      ]);
    });
  }

  it("shows the stall cue after stallSeconds without a new concept; following it opens the hint", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    try {
      const h = renderWithTelemetry(<Chrome guidance={HYBRID} which="2d" />);
      expect(screen.queryByText(GUIDANCE_TEXT.stallCue)).toBeNull();
      act(() => vi.advanceTimersByTime(9_000));
      expect(screen.queryByText(GUIDANCE_TEXT.stallCue)).toBeNull();
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.getByText(GUIDANCE_TEXT.stallCue)).toBeVisible();
      vi.useRealTimers();
      await userEvent.click(screen.getByRole("button", { name: GUIDANCE_TEXT.stallAction }));
      expect(screen.queryByText(GUIDANCE_TEXT.stallCue)).toBeNull();
      expect(screen.getByRole("region", { name: GUIDANCE_TEXT.hintTitle })).toBeVisible();
      expect((await guidanceEvents(h)).map((e) => e.metadata)).toEqual([
        { action: "shown", cueId: "guidance.stall" },
        { action: "followed", cueId: "guidance.stall" },
        { action: "shown", cueId: "guidance.hint" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not count time while content is exposed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    try {
      function Expose() {
        const t = useOptionalTelemetry()!;
        return (
          <button type="button" onClick={() => t.timing.beginExposure("0190f0a0-0000-7000-8000-0000000000aa", "overview")}>
            expose
          </button>
        );
      }
      renderWithTelemetry(
        <GuidanceProvider guidance={HYBRID}>
          <Expose />
          <StallCue />
        </GuidanceProvider>,
      );
      act(() => screen.getByRole("button", { name: "expose" }).click());
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.queryByText(GUIDANCE_TEXT.stallCue)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders and logs nothing unless the policy is hybrid with cueEnabled", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    try {
      for (const g of [{ ...HYBRID, policy: "guided" as const }, { ...HYBRID, cueEnabled: false }]) {
        const h = renderWithTelemetry(<Chrome guidance={g} which="3d" />);
        act(() => vi.advanceTimersByTime(60_000));
        expect(screen.queryByRole("button", { name: GUIDANCE_TEXT.hintLabel })).toBeNull();
        expect(screen.queryByText(GUIDANCE_TEXT.stallCue)).toBeNull();
        vi.useRealTimers();
        expect(await guidanceEvents(h)).toEqual([]);
        h.unmount();
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("practice wording of the shared timer (D5)", () => {
  it("labels the countdown and the finish control as practice", async () => {
    renderWithTelemetry(
      <LearningPhaseProvider budget={{ ...SELF_PACED, mode: "fixed_time", budgetSeconds: 300, allowEarlyFinish: true }} mode="demo" kind="practice">
        <LearningTimer />
      </LearningPhaseProvider>,
    );
    expect(screen.getByRole("timer", { name: /^Practice time left: 5:00$/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Finish practice" })).toBeVisible();
  });
});
