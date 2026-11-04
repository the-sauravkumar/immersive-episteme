import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadTemplate } from "@/features/process/application/load-template";
import { ASSET_CATALOGUE } from "@/features/process/domain/asset-catalogue";
import { processStages, UNBACKED_LINK_STATE, type TraditionRecord } from "@/features/process/domain/knowledge-record";
import type { MergePlan } from "@/features/process/domain/merge-plan";
import type { StageTemplate, TraditionKey } from "@/features/process/domain/stage-template";
import { isShortFormOf, joinShortForms, restoreTitle, splitTitle } from "@/features/process/domain/title-parts";
import { adjacencyErrors, captionErrors, orderErrors, structuralErrors } from "@/features/process/domain/validate-template";
import { fileTemplateSource } from "@/features/process/infrastructure/file-template-source";

const TRADITIONS: readonly TraditionKey[] = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"];
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const recordOf = (tradition: TraditionKey) => readJson<TraditionRecord>(`content/traditions/${tradition}/tradition.json`);
const templateOf = (tradition: TraditionKey) => readJson<StageTemplate>(`content/study/${tradition}.template.json`);

describe.each(TRADITIONS)("stage template of %s", (tradition) => {
  const record = recordOf(tradition);
  const template = templateOf(tradition);

  it("validates", () => {
    expect(structuralErrors(template)).toEqual([]);
  });

  it("respects every PRECEDES link and places every fine stage", () => {
    expect(orderErrors(template, record)).toEqual([]);
  });

  it("merges only adjacent fine stages", () => {
    expect(adjacencyErrors(template, record)).toEqual([]);
  });

  it("builds captions only from verbatim claims, with quotes from their evidence", () => {
    expect(captionErrors(template, record)).toEqual([]);
  });

  it("names every item from a USES link that is not awaiting evidence", () => {
    for (const stage of template.stages) {
      for (const item of stage.items) {
        const link = record.relationships.find((entry) => entry.type === "USES" && entry.target === item.key && stage.sourceStageKeys.includes(entry.source));
        expect(link, `${stage.key} ${item.key}`).toBeDefined();
        expect(link?.verification_state).not.toBe(UNBACKED_LINK_STATE);
      }
    }
  });

  it("uses only catalogue model ids", () => {
    const ids = new Set(ASSET_CATALOGUE.map((model) => model.id));
    expect(template.stages.flatMap((stage) => stage.items).filter((item) => !ids.has(item.modelId))).toEqual([]);
  });

  it("has a real cloth file and strip for every state, and every product file", () => {
    const states = [template.rawClothStateId, ...template.stages.map((stage) => stage.clothStateId)];
    for (const state of states) {
      expect(existsSync(`public/walkthrough/cloth/${state}.jpg`), state).toBe(true);
      expect(existsSync(`public/walkthrough/cloth/${state}-strip.jpg`), state).toBe(true);
    }
    expect(template.products.length).toBeGreaterThan(0);
    for (const product of template.products) expect(existsSync(`public${product.file}`), product.file).toBe(true);
  });

  it("uses no word in a stage name that its source titles lack", () => {
    const plan = readJson<MergePlan>("content/study/merge-plan.json").traditions.find((entry) => entry.tradition === tradition)!;
    for (const stage of plan.stages) {
      for (const source of stage.sources) {
        const concept = record.concepts.find((entry) => entry.key === source.stage)!;
        expect(isShortFormOf(source.shortForm, splitTitle(concept.title, concept.local_terms ?? []).name), source.shortForm).toBe(true);
      }
    }
  });

  it("splits every stage title reversibly", () => {
    for (const stage of processStages(record)) {
      expect(restoreTitle(splitTitle(stage.title, stage.local_terms ?? []))).toBe(stage.title);
    }
  });
});

describe("Sanganeri block carving", () => {
  it("stays before the printing that requires it", () => {
    const template = templateOf("sanganeri");
    const position = (key: string) => template.stages.findIndex((stage) => stage.sourceStageKeys.includes(key));
    expect(position("sanganeri.process_stage.block-carving")).toBeLessThan(position("sanganeri.process_stage.mordant-printing"));
  });
});

describe("title parts", () => {
  it.each([
    ["Saaj (scouring and softening)", ["saaj"], "scouring and softening", "Saaj"],
    ["Harda pre-treatment (peela karna)", ["peela karna"], "Harda pre-treatment", "peela karna"],
    ["Printing iron mordant (kasim) outlines", ["kasim"], "Printing iron mordant outlines", "kasim"],
    ["Block carving (preparatory)", ["ghisai"], "Block carving", null],
    ["2. Harda pre-treatment", [], "Harda pre-treatment", null],
    ["Neerani (castor oil, soda ash and camel dung emulsion)", ["neerani"], "Neerani", null],
    ["Block set: rekh (outline), datta (filler) and background blocks", ["rekh"], "Block set: rekh (outline), datta (filler) and background blocks", null],
  ])("splits %s", (title, terms, name, localName) => {
    const parts = splitTitle(title, terms);
    expect(parts.name).toBe(name);
    expect(parts.localName).toBe(localName);
    expect(restoreTitle(parts)).toBe(title);
  });

  it("joins short forms without repeats", () => {
    expect(joinShortForms(["A", "B", "B"])).toBe("A And B");
    expect(joinShortForms(["A", "B", "C"])).toBe("A, B And C");
    expect(joinShortForms(["A"])).toBe("A");
  });
});

describe("structural validation catches planted faults", () => {
  const template = templateOf("ajrakh");

  it("reports a broken order", () => {
    const reversed = { ...template, stages: [...template.stages].reverse() };
    expect(orderErrors(reversed, recordOf("ajrakh")).length).toBeGreaterThan(0);
  });

  it("reports a caption an agent wrote", () => {
    const stages = template.stages.map((stage, index) => (index === 0 ? { ...stage, caption: { ...stage.caption, text: "Words no claim holds." } } : stage));
    expect(captionErrors({ ...template, stages }, recordOf("ajrakh")).length).toBeGreaterThan(0);
  });

  it("reports an altered quote", () => {
    const stages = template.stages.map((stage, index) =>
      index === 0 ? { ...stage, caption: { ...stage.caption, sources: stage.caption.sources.map((source) => ({ ...source, quote: `${source.quote} extra` })) } } : stage,
    );
    expect(captionErrors({ ...template, stages }, recordOf("ajrakh")).length).toBeGreaterThan(0);
  });

  it("reports an unknown model id", () => {
    const stages = template.stages.map((stage, index) => (index === 0 ? { ...stage, items: stage.items.map((item) => ({ ...item, modelId: "no-such-model" })) } : stage));
    expect(structuralErrors({ ...template, stages }).join()).toContain("unknown model");
  });
});

describe("template source", () => {
  it("loads a validated template by tradition", async () => {
    const template = await loadTemplate(fileTemplateSource(), "sanganeri");
    expect(template.tradition).toBe("sanganeri");
    expect(template.stages.length).toBeGreaterThanOrEqual(7);
  });

  it("refuses an invalid template", async () => {
    await expect(loadTemplate({ read: async () => ({ ...templateOf("sanganeri"), stages: [] }) }, "sanganeri")).rejects.toThrow("Invalid stage template");
  });
});
