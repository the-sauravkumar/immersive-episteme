/**
 * DR-021 and the concept note's Pathway B in the StudyBar's condition groups:
 *  - 3D: "In This Room" (the shared PlaceRail's button) first; Mouse look only outside study
 *    builds (the L key and Controls help keep free look in study);
 *  - 2D: no "Up to <parent>".
 */
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { GuidanceProvider } from "@/components/learning/guidance";
import { LearningPhaseProvider } from "@/components/learning/learning-phase";
import { MuseumStudyBar } from "@/components/museum/overlays/hud";
import type { GuidanceSettings } from "@/features/learning/settings";
import { STUDY_BAR_TEXT } from "@/features/learning/strings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";

import { renderWithTelemetry } from "../learning-2d/harness";

vi.mock("next/navigation", () => ({ usePathname: () => "/learn/immersive", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const NONE: GuidanceSettings = { policy: "none", cueEnabled: false, stallSeconds: 60, hintText: null };
const SELF_PACED: LearningTimeBudget = { mode: "self_paced", budgetSeconds: null, allowEarlyFinish: false, startedAt: null, endsAt: null, endedAt: null, serverNow: "2026-01-01T00:00:00.000Z", persisted: false };

/** `demo` false: a study build (Mouse look and Pause hidden); true: the public demo. */
function bar(showMouseLook: boolean) {
  return renderWithTelemetry(
    <LearningPhaseProvider budget={SELF_PACED} mode="demo">
      <GuidanceProvider guidance={NONE}>
        <MuseumStudyBar
          location="Room"
          locationAs="h1"
          skipTargetId="scene"
          mapAvailable
          mapOpen={false}
          controlsEnabled
          onToggleMap={() => {}}
          onHelp={() => {}}
          onPause={() => {}}
          freeLook={false}
          onToggleFreeLook={() => {}}
          showMouseLook={showMouseLook}
          showPause={showMouseLook}
          railButton={<button type="button">In This Room</button>}
        />
      </GuidanceProvider>
    </LearningPhaseProvider>,
  );
}

describe("3D StudyBar condition group", () => {
  it("hides Mouse look in study builds and keeps it in the public demo (Pathway B)", () => {
    const study = bar(false);
    expect(screen.queryByRole("button", { name: STUDY_BAR_TEXT.mouseLook })).toBeNull();
    expect(screen.getByRole("button", { name: STUDY_BAR_TEXT.controlsHelp })).toBeInTheDocument();
    study.unmount();
    bar(true);
    expect(screen.getByRole("button", { name: STUDY_BAR_TEXT.mouseLook })).toBeInTheDocument();
  });

  it("hides Pause in study builds (DR-051: no 2D counterpart, the learning clock keeps running) and keeps it in the public demo", () => {
    const study = bar(false);
    expect(screen.queryByRole("button", { name: STUDY_BAR_TEXT.pause })).toBeNull();
    study.unmount();
    bar(true);
    expect(screen.getByRole("button", { name: STUDY_BAR_TEXT.pause })).toBeInTheDocument();
  });

  it("puts 'In This Room' first in the group, as 'In This Section' in 2D", () => {
    bar(false);
    const group = screen.getByRole("navigation", { name: STUDY_BAR_TEXT.conditionGroupLabel });
    expect(group.querySelector("button")).toHaveTextContent("In This Room");
  });
});
