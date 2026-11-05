import { stageItemStillPath } from "@/features/process/domain/substance-look";
import { describe, expect, it } from "vitest";

import { itemConfigSchema } from "@/features/research/contracts";
import type { StageTemplate, TemplateStage, TraditionKey } from "@/features/process/domain/stage-template";
import { buildTestBattery, DONT_KNOW_OPTION, LAYOUT_SKETCH_PROMPT, linearOrder, transferItems, type GeneratedAssessment, type UnseenTradition } from "@/features/study/test-items";

function template(tradition: TraditionKey): StageTemplate {
  const stages: TemplateStage[] = [1, 2, 3, 4, 5, 6].map((number) => ({
    number,
    key: `${tradition}-s${number}`,
    sourceStageKeys: [`${tradition}.process_stage.s${number}`],
    name: `${tradition} Stage ${number}`,
    localName: null,
    kind: "table",
    caption: { text: "Sample Text", sources: [] },
    items: [{ key: `${tradition}.tool.t${number}`, role: "tool", label: `${tradition} Tool ${number}`, localName: null, modelId: `${tradition}-model-${number}` }],
    clothStateId: `${tradition}-c${number}`,
  }));
  return { tradition, traditionName: `${tradition} Name`, rawClothStateId: "raw", stages, products: [{ id: "p1", file: `walkthrough/${tradition}-1.jpg`, name: "Sample Text", holder: "Sample Text", widthPx: 100, heightPx: 100 }, { id: "p2", file: `/walkthrough/${tradition}-2.jpg`, name: "Sample Text", holder: "Sample Text", widthPx: 100, heightPx: 100 }] };
}

const unseen = (key: string): UnseenTradition => ({
  key,
  name: `${key} Name`,
  stages: ["a", "b", "c", "d", "e"].map((s) => ({ key: `${key}.${s}`, title: `Title ${s}`, summary: `Summary ${s}.`, tools: [`Tool ${s}`] })),
  precedes: [[`${key}.a`, `${key}.b`], [`${key}.b`, `${key}.c`], [`${key}.c`, `${key}.d`], [`${key}.d`, `${key}.e`]],
});

const templates = [template("ajrakh"), template("sanganeri"), template("machilipatnam-kalamkari")];
const known = new Set(templates.flatMap((t) => t.stages.flatMap((s) => [s.sourceStageKeys[0]!, s.items[0]!.key])));
const battery = buildTestBattery({ templates, unseen: [unseen("bagru"), unseen("dabu")], knownConceptKeys: known });
const byCode = (code: string): GeneratedAssessment => {
  const found = battery.find((a) => a.code === code);
  if (!found) throw new Error(`no ${code}`);
  return found;
};
const objectsOf = (assessment: GeneratedAssessment) => assessment.items.map((item) => (item.config.target as { objectKey?: string }).objectKey);

describe("test item generation", () => {
  it("builds each form with valid configs and keys", () => {
    expect(battery.map((a) => a.code)).toEqual([
      "test-pre", "test-identification", "test-stage-placement", "test-sequence", "test-cloth-state", "test-attribution", "test-transfer", "test-concept-map", "test-layout-sketch",
      "test-identification-delayed", "test-stage-placement-delayed", "test-sequence-delayed", "test-cloth-state-delayed", "test-attribution-delayed", "test-transfer-delayed",
    ]);
    for (const assessment of battery) {
      expect(new Set(assessment.items.map((i) => i.itemKey)).size, assessment.code).toBe(assessment.items.length);
      for (const item of assessment.items) expect(itemConfigSchema.safeParse(item.config).success, item.itemKey).toBe(true);
    }
  });

  it("keeps the concept map post only and gives the pre-test radio items with I do not know, one per screen", () => {
    const pre = byCode("test-pre");
    expect([pre.phase, pre.kind, pre.paged, pre.testType]).toEqual(["pre", "pretest", true, "pre_test"]);
    expect(pre.items.every((i) => i.kind === "single_choice")).toBe(true);
    for (const item of pre.items) expect((item.config.options as { id: string }[]).at(-1)).toEqual(DONT_KNOW_OPTION);
    expect(battery.filter((a) => a.kind === "reconstruction").map((a) => a.phase)).toEqual(["post"]);
    expect(byCode("test-concept-map").items).toHaveLength(3);
    expect(byCode("test-concept-map").items[0]!.config.conceptKeys).toEqual([...templates[0]!.stages.map((s) => s.sourceStageKeys[0]), ...templates[0]!.stages.map((s) => s.items[0]!.key)]);
  });

  it("keeps the pre-test, immediate and delayed forms apart object by object", () => {
    const pre = new Set(byCode("test-pre").items.map((i) => `${i.itemKey.split(".")[1]}:${(i.config.target as { objectKey: string }).objectKey}`));
    const immediate = objectsOf(byCode("test-identification"));
    const delayed = objectsOf(byCode("test-identification-delayed"));
    expect(delayed.length).toBeGreaterThan(0);
    expect(delayed.length).toBeLessThan(immediate.length);
    expect(immediate.filter((key) => delayed.includes(key))).toEqual([]);
    expect(immediate.filter((key) => pre.has(`id:${key}`))).toEqual([]);
    const placeNow = objectsOf(byCode("test-stage-placement"));
    expect(placeNow.filter((key) => objectsOf(byCode("test-stage-placement-delayed")).includes(key))).toEqual([]);
  });

  it("asks every placement, identification and pre-test option list to be shuffled, so no order or answer position shows", () => {
    const codes = ["test-pre", "test-identification", "test-identification-delayed", "test-stage-placement", "test-stage-placement-delayed", "test-cloth-state", "test-cloth-state-delayed"];
    for (const code of codes) for (const item of byCode(code).items) expect(item.config.shuffle, item.itemKey).toBe(true);
  });

  it("draws no identification image from one still that two labels share", () => {
    const sharedModel = (tradition: TraditionKey): StageTemplate => {
      const base = template(tradition);
      return { ...base, stages: base.stages.map((stage) => ({ ...stage, items: stage.items.map((item) => ({ ...item, modelId: `${tradition}-shared` })) })) };
    };
    const shared = buildTestBattery({ templates: [sharedModel("ajrakh"), sharedModel("sanganeri"), sharedModel("machilipatnam-kalamkari")], unseen: [], knownConceptKeys: new Set() });
    expect(shared.filter((a) => a.testType === "identification").flatMap((a) => a.items)).toEqual([]);
  });

  it("names objects from the shared stills, with distractors from the template set and never the same still", () => {
    const allLabels = new Set(templates.flatMap((t) => t.stages.map((s) => s.items[0]!.label)));
    const stillOf = new Map(templates.flatMap((t) => t.stages.map((s) => [s.items[0]!.label, stageItemStillPath(s.key, s.items, s.items[0]!)] as const)));
    for (const item of byCode("test-identification").items) {
      const config = item.config as { image: { path: string }; options: { id: string; label: string }[] };
      expect(config.image.path).toMatch(/^\/walkthrough\/stills\/.+\.jpg$/);
      expect(config.options).toHaveLength(4);
      for (const option of config.options) expect(allLabels.has(option.label)).toBe(true);
      const target = config.options.find((o) => o.id === (item.answerKey as { optionId: string }).optionId)!;
      expect(config.options.filter((o) => o !== target && stillOf.get(o.label) === stillOf.get(target.label))).toEqual([]);
    }
  });

  it("leaves out an object whose still another label shares, and an object used at two stages", () => {
    const shared = template("ajrakh");
    const stages = shared.stages as (TemplateStage & { items: { modelId: string; key: string }[] })[];
    stages[3]!.items[0]!.modelId = stages[2]!.items[0]!.modelId;
    stages[5]!.items[0]!.key = stages[4]!.items[0]!.key;
    const result = buildTestBattery({ templates: [shared, templates[1]!, templates[2]!], unseen: [], knownConceptKeys: new Set() });
    const named = result.filter((a) => a.testType === "identification" || a.code === "test-pre").flatMap((a) => a.items.filter((i) => i.itemKey.includes("id.")).map((i) => (i.config.target as { objectKey: string }).objectKey));
    expect(named).not.toContain(stages[3]!.items[0]!.key);
    expect(named).not.toContain(stages[2]!.items[0]!.key);
    const placed = result.flatMap((a) => a.items.filter((i) => i.prompt.startsWith("At which stage")).map((i) => (i.config.target as { objectKey: string }).objectKey));
    expect(placed).not.toContain(stages[4]!.items[0]!.key);
  });

  it("makes sequence items with all stages at once and a shorter parallel set later", () => {
    const now = byCode("test-sequence").items[0]!;
    expect(now.kind).toBe("ranking");
    expect(now.answerKey).toEqual({ order: ["s1", "s2", "s3", "s4", "s5", "s6"] });
    expect(byCode("test-sequence-delayed").items[0]!.answerKey).toEqual({ order: ["s2", "s4", "s6"] });
  });

  it("matches shared cloth state files to stages with parallel sets", () => {
    const now = byCode("test-cloth-state").items[0]!;
    const config = now.config as { pairs: { id: string; image: { path: string } }[]; options: unknown[] };
    expect(config.pairs.map((p) => p.image.path)).toEqual(["/walkthrough/cloth/ajrakh-c1.jpg", "/walkthrough/cloth/ajrakh-c3.jpg", "/walkthrough/cloth/ajrakh-c5.jpg"]);
    expect(config.options).toHaveLength(6);
    expect(now.answerKey).toEqual({ matches: { p1: "s1", p3: "s3", p5: "s5" } });
    expect(byCode("test-cloth-state-delayed").items[0]!.answerKey).toEqual({ matches: { p2: "s2", p4: "s4", p6: "s6" } });
  });

  it("attributes a product image to a tradition, using another image for the delayed form when one exists", () => {
    const now = byCode("test-attribution").items[0]!;
    expect((now.config as { image: { path: string } }).image.path).toBe("/walkthrough/ajrakh-1.jpg");
    expect((byCode("test-attribution-delayed").items[0]!.config as { image: { path: string } }).image.path).toBe("/walkthrough/ajrakh-2.jpg");
    expect(now.answerKey).toEqual({ optionId: "ajrakh" });
    expect((now.config.options as unknown[]).length).toBe(3);
  });

  it("marks the transfer account as Sample Text, draws only from the relations, and uses another tradition later", () => {
    const now = byCode("test-transfer");
    expect(now.kind).toBe("transfer");
    expect(now.items.map((i) => i.itemKey)).toEqual(["transfer.bagru.order", "transfer.bagru.next", "transfer.bagru.tool"]);
    for (const item of now.items) {
      expect(item.config.sampleText).toBe(true);
      expect(item.config.account).toContain("Summary a.");
    }
    expect(now.items[0]!.answerKey).toEqual({ order: ["s1", "s2", "s3", "s4", "s5"] });
    expect(byCode("test-transfer-delayed").items[0]!.itemKey).toBe("transfer.dabu.order");
  });

  it("asks no order question when the relations branch, and finds the order when they do not", () => {
    const branching: UnseenTradition = { ...unseen("dabu"), precedes: [["dabu.a", "dabu.b"], ["dabu.a", "dabu.c"], ["dabu.c", "dabu.d"], ["dabu.d", "dabu.e"]] };
    expect(linearOrder(branching)).toBeNull();
    expect(transferItems(branching).map((i) => i.itemKey)).not.toContain("transfer.dabu.order");
    expect(linearOrder(unseen("bagru"))!.map((s) => s.title)).toEqual(["Title a", "Title b", "Title c", "Title d", "Title e"]);
  });

  it("gives both doors one sketch prompt", () => {
    const sketch = byCode("test-layout-sketch");
    expect([sketch.kind, sketch.phase, sketch.items[0]!.kind, sketch.items[0]!.prompt]).toEqual(["sketch", "post", "sketch", LAYOUT_SKETCH_PROMPT]);
  });
});
