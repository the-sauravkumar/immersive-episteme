/**
 * DR-050 (final review equivalence-exposure-rule): ONE exposure rule for both conditions, defined
 * on the shared KnowledgeSheet. Exposure runs while the sheet is open and no navigation overlay
 * covers it (2D: Contents / Search; 3D: the full Plan), wherever the sheet is scrolled; navigation
 * otherwise. The same scripted sequence through the 2D region and through the 3D binding must give
 * the same exposure and navigation intervals.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { ChromeOverlayProvider, ExposureRegion, NavigationPhase, useChromeOverlay } from "@/features/learning-2d/ui/exposure";
import { sheetTimingKind, useSheetTiming } from "@/features/telemetry/client/sheet-timing";

import { fixtureView, renderWithTelemetry } from "../learning-2d/harness";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("the shared rule", () => {
  it("is exposure only while the sheet is open and uncovered", () => {
    expect(sheetTimingKind({ sheetOpen: true, overlayOpen: false })).toBe("exposure");
    expect(sheetTimingKind({ sheetOpen: true, overlayOpen: true })).toBe("navigation");
    expect(sheetTimingKind({ sheetOpen: false, overlayOpen: false })).toBe("navigation");
    expect(sheetTimingKind({ sheetOpen: false, overlayOpen: true })).toBe("navigation");
  });

  it("is the only exposure path in both conditions (no in-view rule, no direct exposure hook)", () => {
    const twoD = read("src/features/learning-2d/ui/exposure.tsx");
    const threeD = read("src/components/museum/museum-app.tsx");
    for (const [name, src] of [
      ["2D", twoD],
      ["3D", threeD],
    ] as const) {
      expect(src, name).toMatch(/useSheetTiming\(/);
      expect(src, name).not.toMatch(/useContentExposure\(/);
      expect(src, name).not.toMatch(/IntersectionObserver|IN_VIEW_FRACTION/);
    }
    // 3D: the sheet is the panel; the overlay is the full Plan dialog (not the minimap beside it).
    expect(threeD).toMatch(/sheetOpen: !!panelExhibit && !!panelConcept, overlayOpen: planOpen/);
  });
});

/** The script both conditions run: open a concept, read, cover it with the overlay, uncover, close. */
type Step = "open" | "overlay-on" | "overlay-off" | "close";
const SCRIPT: Step[] = ["open", "overlay-on", "overlay-off", "close"];

const view = fixtureView();
const conceptId = view.getConcept("alpha.process_stage.stage-one")!.id;

/** 2D: a section page (navigation), then the concept page with the region inside its sheet; the StudyBar sets the overlay. */
function TwoD({ step }: { step: Step | "start" }) {
  return (
    <ChromeOverlayProvider>
      <Overlay on={step === "overlay-on"} />
      {step === "close" || step === "start" ? (
        <NavigationPhase surface="catalogue" context={{ roomOrPageId: "page" }} />
      ) : (
        <ExposureRegion conceptId={conceptId} layer="process" context={{ roomOrPageId: "page" }}>
          <p>sheet</p>
        </ExposureRegion>
      )}
    </ChromeOverlayProvider>
  );
}
function Overlay({ on }: { on: boolean }) {
  const { setOpen } = useChromeOverlay();
  useEffect(() => setOpen(on), [on, setOpen]);
  return null;
}

/** 3D: the museum's binding (museum-app.tsx): the panel is the sheet, the full Plan the overlay. */
function ThreeD({ step }: { step: Step | "start" }) {
  const [panel] = useState(conceptId);
  const open = step !== "close" && step !== "start";
  useSheetTiming({
    enabled: true,
    state: { sheetOpen: open, overlayOpen: step === "overlay-on" },
    conceptId: open ? panel : null,
    layer: "process",
    exposureContext: { roomOrPageId: "room" },
    navigationSurface: step === "overlay-on" ? "map" : "walk",
    navigationContext: { roomOrPageId: "room" },
  });
  return null;
}

async function run(render: (step: Step | "start") => ReactNode) {
  const h = renderWithTelemetry(render("start"));
  for (const step of SCRIPT) {
    await act(async () => {
      h.rerender(render(step));
    });
  }
  return (await h.events()).filter((e) => /^(exposure|navigation)_/.test(e.type));
}

describe("the same scripted sequence gives the same intervals in both conditions", () => {
  it("exposure and navigation intervals match in order, kind and concept", async () => {
    const twoD = await run((s) => <TwoD step={s} />);
    const threeD = await run((s) => <ThreeD step={s} />);
    const shape = (es: typeof twoD) => es.map((e) => `${e.type}${e.type.startsWith("exposure") ? `:${e.conceptId}` : ""}`);
    const expected = [
      "navigation_started",
      "navigation_ended",
      `exposure_started:${conceptId}`,
      `exposure_ended:${conceptId}`,
      "navigation_started",
      "navigation_ended",
      `exposure_started:${conceptId}`,
      `exposure_ended:${conceptId}`,
      "navigation_started",
    ];
    expect(shape(twoD)).toEqual(expected);
    expect(shape(threeD)).toEqual(expected);
  });
});
