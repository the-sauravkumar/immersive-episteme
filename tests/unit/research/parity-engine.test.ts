import { describe, expect, it } from "vitest";

import { runParityChecks, type DoorTraditionView, type ParityInput } from "@/server/research/parity/engine";

import { passingInput } from "./fixtures";

const failingCodes = (input: ParityInput, id: string): string[] => {
  const check = runParityChecks(input).checks.find((c) => c.id === id);
  if (!check) throw new Error(`no check ${id}`);
  return check.issues.map((issue) => issue.code);
};

const writable = <T>(value: unknown): T => value as T;

function mutableStage(input: ParityInput, door: "2d" | "immersive") {
  const tradition = input.doors.find((d) => d.door === door)!.traditions[0] as DoorTraditionView & { stages: Record<string, unknown>[] };
  return tradition.stages[0]!;
}

describe("content parity from one template", () => {
  it("passes when both doors are generated from the same templates", () => {
    const report = runParityChecks(passingInput());
    expect(report.checks.filter((c) => !c.passed)).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.contentSet).toEqual({ stages: 4, items: 4, products: 2, sources: 1 });
  });

  it("checks no wing, room, manifest or exhibit any more", () => {
    const ids = runParityChecks(passingInput()).checks.map((c) => c.id);
    expect(ids).toEqual(["base.snapshot", "base.config", "base.consent", "t.template", "t.reachable", "t.stages", "t.words", "t.models", "t.files", "d.protocol", "d.journey", "d.review", "e.exposure"]);
  });

  it("fails a door with its stages in another order", () => {
    const input = passingInput();
    const view = input.doors[1]!.traditions[0]! as unknown as { stages: unknown[] };
    view.stages.reverse();
    expect(failingCodes(input, "t.stages")).toContain("stage_order");
  });

  it("fails one changed character of a caption, a label or a source reference", () => {
    const caption = passingInput();
    mutableStage(caption, "immersive").caption = "Sample Text caption 1.";
    expect(failingCodes(caption, "t.words")).toEqual(["caption_text"]);
    const label = passingInput();
    writable<{ label: string }[]>(mutableStage(label, "2d").items)[0]!.label = "Other";
    expect(failingCodes(label, "t.words")).toEqual(["label_text"]);
    const source = passingInput();
    writable<{ locator: string }[]>(mutableStage(source, "2d").sources)[0]!.locator = "p. 2";
    expect(failingCodes(source, "t.words")).toEqual(["source_refs"]);
  });

  it("fails an item shown with another model, one item with two model ids, and an unknown model", () => {
    const shown = passingInput();
    writable<{ modelId: string }[]>(mutableStage(shown, "immersive").items)[0]!.modelId = "barrel";
    expect(failingCodes(shown, "t.models")).toEqual(["model_differs"]);
    const twice = passingInput();
    const second = writable<{ items: { key: string }[] }>(twice.templates[0]!.stages[1]);
    second.items[0]!.key = twice.templates[0]!.stages[0]!.items[0]!.key;
    expect(failingCodes(twice, "t.models")).toContain("item_many_models");
    const unknown = passingInput();
    (unknown.templates[0]!.stages[0]!.items[0] as { modelId: string }).modelId = "no-such-model";
    expect(failingCodes(unknown, "t.models")).toContain("model_unknown");
  });

  it("fails a cloth state or product image that resolves to two files or to no file", () => {
    const two = passingInput();
    mutableStage(two, "immersive").clothFile = "/walkthrough/other.jpg";
    (two.fileHashes as Record<string, string>)["/walkthrough/other.jpg"] = "another-hash";
    expect(failingCodes(two, "t.files")).toEqual(["file_hash_differs"]);
    const none = passingInput();
    const file = mutableStage(none, "2d").clothFile as string;
    (none.fileHashes as Record<string, string | null>)[file] = null;
    expect(failingCodes(none, "t.files")).toContain("file_missing");
  });

  it("refuses activation while a door cannot be reached", () => {
    const missing = passingInput();
    missing.doors = missing.doors.filter((d) => d.door !== "immersive");
    expect(failingCodes(missing, "t.reachable")).toEqual(["door_unavailable"]);
    expect(runParityChecks(missing).passed).toBe(false);
    const closed = passingInput();
    closed.doors = closed.doors.map((d) => (d.door === "2d" ? { ...d, reachable: false } : d));
    expect(failingCodes(closed, "t.reachable")).toEqual(["door_unreachable"]);
  });

  it("fails a tradition with no template and a caption with no source", () => {
    const missing = passingInput();
    missing.templates = missing.templates.slice(1);
    expect(failingCodes(missing, "t.template")).toEqual(["template_missing"]);
    const unsourced = passingInput();
    writable<{ sources: unknown[] }>(unsourced.templates[0]!.stages[0]!.caption).sources = [];
    expect(failingCodes(unsourced, "t.template")).toEqual(["caption_unsourced"]);
  });

  it("accepts self-paced learning with the cap and refuses fixed time, no cap or optional stages", () => {
    const withExposure = (exposure: Record<string, unknown>) => {
      const input = passingInput();
      (input.study.config as Record<string, unknown>).exposure = exposure;
      return failingCodes(input, "e.exposure");
    };
    expect(withExposure({ mode: "self_paced", minutes: 30, allowEarlyFinish: true, requireEveryStage: true })).toEqual([]);
    expect(withExposure({ mode: "fixed_time", minutes: 30, allowEarlyFinish: true, requireEveryStage: true })).toEqual(["exposure_not_self_paced"]);
    expect(withExposure({ mode: "self_paced", allowEarlyFinish: true, requireEveryStage: true })).toEqual(["exposure_no_cap"]);
    expect(withExposure({ mode: "self_paced", minutes: 30, allowEarlyFinish: true })).toEqual(["exposure_stages_optional"]);
    expect(withExposure({ mode: "self_paced", minutes: 30, allowEarlyFinish: false, requireEveryStage: true })).toEqual(["exposure_no_early_finish"]);
    const budget = passingInput();
    budget.sessionBudgets = [{ interface: "immersive_3d", learningBudgetSeconds: 1200 }];
    expect(failingCodes(budget, "e.exposure")).toEqual(["session_budget"]);
  });

  it("refuses a study that cannot take consent: no consent text, no version or no information sheet", () => {
    const withConsent = (fields: Record<string, unknown>) => {
      const input = passingInput();
      const config = input.study.config as Record<string, unknown>;
      delete config.consent;
      delete config.participantInformation;
      Object.assign(config, fields);
      return runParityChecks(input);
    };
    const none = withConsent({});
    expect(none.checks.find((c) => c.id === "base.consent")!.issues.map((i) => i.code)).toEqual(["consent_missing", "consent_version_missing", "information_sheet_missing"]);
    expect(none.passed).toBe(false);
    const blank = withConsent({ consent: { version: "v1", text: "   " }, participantInformation: "Sheet." });
    expect(blank.checks.find((c) => c.id === "base.consent")!.issues.map((i) => i.code)).toEqual(["consent_missing"]);
    const noSheet = withConsent({ consent: { version: "v1", text: "I agree." } });
    expect(noSheet.checks.find((c) => c.id === "base.consent")!.issues.map((i) => i.code)).toEqual(["information_sheet_missing"]);
    expect(withConsent({ consent: { version: "v1", text: "I agree." }, participantInformation: "Sheet." }).passed).toBe(true);
  });

  it("refuses per-door settings and a concept map before learning", () => {
    const override = passingInput();
    override.study.conditions[1]!.config = { exposure: { minutes: 5 } };
    expect(failingCodes(override, "d.protocol")).toEqual(expect.arrayContaining(["condition_override", "condition_config_differs"]));
    const map = passingInput();
    map.study.battery.push({ assessmentId: "a-map", code: "pre-map", version: 1, kind: "reconstruction", phase: "pre", position: 1, status: "locked", required: true });
    expect(failingCodes(map, "d.journey")).toContain("pre_concept_map");
  });
});
