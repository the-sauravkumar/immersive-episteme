/**
 * Parity engine (src/server/research/parity/engine.ts): a matched configuration passes, and each
 * injected mismatch is detected by the check that owns it.
 */
import { describe, expect, it } from "vitest";

import { runParityChecks, textResidue, type ParityInput, type ParityReport } from "@/server/research/parity/engine";

import { demoManifest, passingInput } from "./fixtures";

type El = { id: string; kind: string; conceptId?: string | null; label?: string | null; assetRefs?: unknown[]; effect?: Record<string, unknown>; hotspots?: { label: string }[] };
const elements = (i: ParityInput) => (i.manifest!.manifest as { elements: El[] }).elements;
const checkOf = (r: ParityReport, id: string) => {
  const c = r.checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
};
const failedCritical = (r: ParityReport) => r.checks.filter((c) => !c.passed && c.severity === "critical").map((c) => c.id);

describe("parity engine", () => {
  it("passes a matched configuration with every critical check green", () => {
    expect(demoManifest().validation.passed).toBe(true);
    const r = runParityChecks(passingInput());
    expect(failedCritical(r)).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.contentSet.concepts).toBeGreaterThan(10);
    expect(checkOf(r, "b.coverage").metrics).toMatchObject({ concepts2d: r.contentSet.concepts, exhibits3d: r.contentSet.concepts });
    expect(checkOf(r, "c.citations").metrics.citations2d).toBe(checkOf(r, "c.citations").metrics.citations3d);
  });

  it("is deterministic and keyed to the study inputs", () => {
    const a = runParityChecks(passingInput());
    const b = runParityChecks(passingInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const changed = passingInput();
    (changed.study.config as { exposure: { minutes: number } }).exposure.minutes = 25;
    expect(runParityChecks(changed).inputSha256).not.toBe(a.inputSha256);
  });

  it("detects a concept reachable in 2D with no exhibit (missing content)", () => {
    const i = passingInput();
    const els = elements(i);
    const victim = els.find((e) => e.kind === "exhibit" && e.conceptId)!;
    i.manifest!.manifest = { ...(i.manifest!.manifest as object), elements: els.filter((e) => e !== victim) };
    const r = runParityChecks(i);
    expect(r.passed).toBe(false);
    const b = checkOf(r, "b.coverage");
    expect(b.passed).toBe(false);
    expect(b.issues.map((x) => [x.code, x.ref])).toContainEqual(["missing_exhibit", victim.conceptId]);
    expect(checkOf(r, "a.claims").passed).toBe(false);
  });

  it("detects an exhibit for a concept outside the 2D content set (extra content)", () => {
    const i = passingInput();
    const bundle = i.snapshot!.payload as { concepts: { id: string; traditionId: string | null; type: string }[] };
    // A third tradition's concept is in the snapshot but not selected by the study.
    const outside = { ...bundle.concepts[0]!, id: "11111111-1111-4111-8111-111111111111", key: "demo-gamma.material.dye", slug: "demo-gamma-material-dye", traditionId: null, type: "material" };
    bundle.concepts.push(outside as never);
    elements(i).push({ id: "exhibit:demo-gamma.material.dye", kind: "exhibit", conceptId: outside.id, label: (outside as unknown as { title: string }).title, assetRefs: [] });
    const r = runParityChecks(i);
    expect(checkOf(r, "b.coverage").issues.map((x) => x.code)).toContain("extra_exhibit");
  });

  it("detects extra 3D-only instructional text", () => {
    const i = passingInput();
    elements(i).push({ id: "label:hint", kind: "label", conceptId: null, label: "Notice how the mordant fixes the colour here" });
    const r = runParityChecks(i);
    const f = checkOf(r, "f.text");
    expect(f.passed).toBe(false);
    expect(f.issues[0]!.message).toMatch(/notice/);
    expect(r.passed).toBe(false);
  });

  it("detects 3D-only text added to an otherwise allowed label", () => {
    const i = passingInput();
    const hot = elements(i).find((e) => e.hotspots?.length)!;
    hot.hotspots![0]!.label = `${hot.hotspots![0]!.label} - remember this for the test`;
    expect(checkOf(runParityChecks(i), "f.text").passed).toBe(false);
  });

  it("accepts snapshot strings and the compiler's interface words but not other words", () => {
    const phrases = ["Demo: dye", "Demo: block"];
    expect(textResidue("Inspect Demo: dye", phrases)).toEqual([]);
    expect(textResidue("Why: Demo: dye -> Demo: block", phrases)).toEqual([]);
    expect(textResidue("Demo: dyes", phrases)).toEqual(["demo", "dyes"]);
    expect(textResidue("Look closely at Demo: dye", phrases)).toEqual(["look", "closely", "at"]);
  });

  it("detects differing citation coverage", () => {
    const i = passingInput();
    // The shared mechanism is the only concept citing source B; drop its exhibit.
    const els = elements(i);
    const shared = els.find((e) => e.kind === "exhibit" && typeof e.id === "string" && e.id.includes("demo-shared"))!;
    i.manifest!.manifest = { ...(i.manifest!.manifest as object), elements: els.filter((e) => e !== shared) };
    const c = checkOf(runParityChecks(i), "c.citations");
    expect(c.passed).toBe(false);
    expect(c.issues.map((x) => x.code)).toContain("sources_2d_only");
    expect(c.metrics.sources2d).toBe(2);
    expect(c.metrics.sources3d).toBe(1);
  });

  it("detects unequal exposure (per-condition override, self-paced, mismatched session budgets)", () => {
    const override = passingInput();
    override.study.conditions[1]!.config = { exposure: { minutes: 30 } };
    const r1 = runParityChecks(override);
    expect(checkOf(r1, "e.exposure").issues.map((x) => x.code)).toContain("exposure_override");
    expect(checkOf(r1, "d.protocol").passed).toBe(false);

    const selfPaced = passingInput();
    (selfPaced.study.config as { exposure: unknown }).exposure = { mode: "self_paced" };
    expect(checkOf(runParityChecks(selfPaced), "e.exposure").issues.map((x) => x.code)).toEqual(["exposure_not_fixed"]);

    const budgets = passingInput();
    budgets.sessionBudgets = [
      { interface: "conventional_2d", learningBudgetSeconds: 1200 },
      { interface: "immersive_3d", learningBudgetSeconds: 1500 },
    ];
    const e = checkOf(runParityChecks(budgets), "e.exposure");
    expect(e.issues.map((x) => x.code)).toEqual(["session_budget"]);
  });

  it("detects 3D-only media, rewritten explanations and per-condition guidance", () => {
    const media = passingInput();
    elements(media).find((e) => e.kind === "exhibit")!.assetRefs = [{ assetId: "22222222-2222-4222-8222-222222222222", kind: "image", uri: "x" }];
    expect(checkOf(runParityChecks(media), "a.media").issues.map((x) => x.code)).toEqual(["media_3d_only"]);

    const expl = passingInput();
    const cue = elements(expl).find((e) => e.kind === "cue" && e.effect && typeof e.effect.explanation === "string")!;
    expect(cue).toBeDefined();
    cue.effect!.explanation = "A different explanation";
    const r = runParityChecks(expl);
    expect(checkOf(r, "a.relationships").issues.map((x) => x.code)).toContain("explanation_mismatch");
    expect(checkOf(r, "f.text").passed).toBe(false);

    const guidance = passingInput();
    guidance.study.conditions[1]!.config = { guidance: { policy: "guided" } };
    expect(checkOf(runParityChecks(guidance), "d.protocol").issues.map((x) => x.code)).toContain("condition_override");
  });

  it("fails the base checks for an unpublished or review snapshot and a foreign manifest", () => {
    const i = passingInput();
    i.snapshot!.kind = "review";
    i.snapshot!.status = "draft";
    i.manifest!.snapshotId = "00000000-0000-4000-8000-0000000000cc";
    i.manifest!.traditions = ["demo-alpha"];
    const r = runParityChecks(i);
    expect(checkOf(r, "base.snapshot").issues.map((x) => x.code).sort()).toEqual(["snapshot_not_published", "snapshot_not_release"]);
    expect(checkOf(r, "base.manifest").issues.map((x) => x.code).sort()).toEqual(["manifest_snapshot", "manifest_traditions"]);
  });
});
