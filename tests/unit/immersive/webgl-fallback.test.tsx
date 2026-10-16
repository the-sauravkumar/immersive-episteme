/**
 * The museum's no-WebGL screen is the runtime backstop of the device check (final review study-01):
 * in a study it reports the failure to the engine once, and its action follows the engine's outcome
 * (excluded -> the study's end message, as after the device check; otherwise back to the session).
 * Demo and preview visitors are never reported. The museum and the device check apply one rule.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  reportMuseumUnavailable: vi.fn(async (_report: unknown) => ({ ok: true, outcome: "excluded" }) as const),
}));
vi.mock("@/server/study/actions", () => actions);

import { WebGLFallback, studyFailureNext } from "@/components/museum/overlays/screens";
import type { ImmersiveSettings } from "@/features/immersive/types";
import { isSoftwareRenderer, museumCanRender } from "@/features/study/gpu-acceptance";
import { SCREEN_TEXT } from "@/features/learning/strings";

const settings = { webglFailurePolicy: "exclude" } as unknown as ImmersiveSettings;
const report = { webglVersion: 2 as const, softwareRenderer: true };

beforeEach(() => actions.reportMuseumUnavailable.mockClear());

describe("WebGLFallback", () => {
  it("reports once in a study and links to the end message when the engine excludes", async () => {
    const { rerender } = render(<WebGLFallback mode="study" settings={settings} report={report} reason="software rendering only" />);
    expect(screen.getByRole("button", { name: SCREEN_TEXT.recordingDevice })).toBeDisabled();
    const link = await screen.findByRole("link", { name: SCREEN_TEXT.tellResearcher });
    expect(link).toHaveAttribute("href", "/study/complete?status=excluded");
    rerender(<WebGLFallback mode="study" settings={settings} report={report} reason="software rendering only" />);
    expect(actions.reportMuseumUnavailable).toHaveBeenCalledTimes(1);
    expect(actions.reportMuseumUnavailable).toHaveBeenCalledWith({ webglVersion: 2, softwareRenderer: true });
  });

  it("never reports outside a study", async () => {
    render(<WebGLFallback mode="demo" settings={settings} report={report} reason="no WebGL 2 context" />);
    expect(screen.getByRole("link", { name: SCREEN_TEXT.backToExplore })).toHaveAttribute("href", "/explore");
    await waitFor(() => expect(actions.reportMuseumUnavailable).not.toHaveBeenCalled());
  });

  it("maps every engine outcome to the same destination as the device check", () => {
    expect(studyFailureNext({ ok: true, outcome: "excluded" }, "exclude").href).toBe("/study/complete?status=excluded");
    for (const outcome of ["retry", "reassigned", "passed"] as const) expect(studyFailureNext({ ok: true, outcome }, "retry").href).toBe("/study/session");
    expect(studyFailureNext({ ok: false, error: "x" }, "reassign")).toEqual({ href: "/study/session", label: SCREEN_TEXT.tellResearcher });
  });
});

describe("one GPU rule for the device check and the museum", () => {
  it("refuses WebGL 1, no WebGL and software renderers; accepts hardware WebGL 2", () => {
    expect(museumCanRender({ webglVersion: 2, softwareRenderer: false })).toBe(true);
    expect(museumCanRender({ webglVersion: 2, softwareRenderer: true })).toBe(false);
    expect(museumCanRender({ webglVersion: 1, softwareRenderer: false })).toBe(false);
    expect(museumCanRender({ webglVersion: null, softwareRenderer: false })).toBe(false);
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
  });
});
