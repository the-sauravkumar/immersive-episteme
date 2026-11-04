import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogueModel } from "@/features/process/domain/asset-catalogue";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { itemVesselModel, liquidMarks, looksOfItem, stageItemStillPath, workLiquidOf } from "@/features/process/domain/substance-look";
import { SUBSTANCE_LOOK_ROWS } from "@/features/process/domain/substance-look-rows";
import { structureFor } from "@/features/walkthrough/domain/yard-plan";
import { lookRowsSource } from "../../../scripts/content/build-substance-look-rows";

const templates = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"].map((name) => JSON.parse(readFileSync(`content/study/${name}.template.json`, "utf8")) as StageTemplate);
const uses = templates.flatMap((template) => template.stages.flatMap((stage) => stage.items.map((item) => ({ stage, item }))));
const materials = uses.filter(({ item }) => item.role === "material");
const sheet = JSON.parse(readFileSync("docs/research/substance-looks.json", "utf8")) as unknown[];

describe("the look sheet reaches the scene", () => {
  it("generates the checked-in rows from the sheet", () => {
    expect(readFileSync("src/features/process/domain/substance-look-rows.ts", "utf8").replace(/\r\n/g, "\n")).toBe(lookRowsSource(sheet as Parameters<typeof lookRowsSource>[0]));
  });

  it("gives every material item in all three templates a look", () => {
    expect(materials.length).toBeGreaterThan(30);
    expect(materials.filter(({ stage, item }) => looksOfItem(stage.key, item).length === 0).map(({ item }) => item.label)).toEqual([]);
  });

  it("gives every vat and tank the liquid of its own stage", () => {
    const wet = templates.flatMap((template) => template.stages.filter((stage) => ["ring", "tank"].includes(structureFor(stage.kind).type)));
    expect(wet.length).toBeGreaterThan(10);
    for (const stage of wet) {
      const liquid = workLiquidOf(stage.key, stage.items);
      expect(liquid, stage.key).not.toBeNull();
      expect(liquid!.fill).toBe("liquid");
      expect(SUBSTANCE_LOOK_ROWS.find((row) => row.key === liquid!.key)!.stages).toContain(stage.key);
    }
  });

  it("does not paint every bath one colour", () => {
    const wet = templates.flatMap((template) => template.stages.filter((stage) => ["ring", "tank"].includes(structureFor(stage.kind).type)));
    expect(new Set(wet.map((stage) => workLiquidOf(stage.key, stage.items)!.renderHex)).size).toBeGreaterThanOrEqual(4);
  });

  it("lets form decide the vessel, in the template itself", () => {
    const firstUse = new Map<string, string>();
    for (const { stage, item } of materials) {
      const vessel = itemVesselModel(stage.key, item)!;
      if (!firstUse.has(item.key)) firstUse.set(item.key, vessel);
      expect(item.modelId, `${stage.key} ${item.label}`).toBe(firstUse.get(item.key));
    }
    const neerani = materials.find(({ item }) => item.label === "Neerani")!;
    expect(neerani.item.modelId).toBe("liquid-pot");
    const myrobalanLiquid = looksOfItem("machilipatnam-kalamkari.second-printing", { label: "Myrobalan", role: "material" })[0]!;
    expect(myrobalanLiquid.vesselModelId).toBe("liquid-pot");
    const dryIndigo = materials.find(({ stage, item }) => stage.key === "ajrakh.indigo-dyeing" && item.label === "Indigo")!;
    expect(dryIndigo.item.modelId).toBe("powder-bowl");
  });

  it("uses only known models and no stand-in hammer or spoon for tools with their own model", () => {
    for (const { item } of uses) expect(catalogueModel(item.modelId).id).toBe(item.modelId);
    expect(uses.filter(({ item }) => item.modelId === "spoon")).toEqual([]);
    expect(uses.find(({ item }) => item.label === "Washing Paddle")?.item.modelId).toBe("washing-paddle");
    expect(uses.find(({ item }) => item.label === "Block-Carving Chisels")?.item.modelId).toBe("carving-chisels");
    expect(uses.find(({ item }) => item.label === "Date-Palm Brush And Kalam")?.item.modelId).toBe("brush-and-kalam");
  });

  it("gives each material its own Door 1 image and each bath its own tool image", () => {
    const stage = templates[0]!.stages.find((candidate) => candidate.key === "ajrakh.indigo-dyeing")!;
    expect(stageItemStillPath(stage.key, stage.items, stage.items.find((item) => item.label === "Indigo")!)).toBe("/walkthrough/stills/materials/ajrakh-indigo.jpg");
    expect(stageItemStillPath(stage.key, stage.items, stage.items.find((item) => item.modelId === "dye-vat")!)).toBe("/walkthrough/stills/tools/dye-vat-7c7a36.jpg");
    const paths = new Set(materials.map(({ stage: where, item }) => stageItemStillPath(where.key, where.items, item)));
    expect(paths.size).toBeGreaterThan(30);
  });

  it("has a rendered image on disk for every item in every stage", () => {
    const missing = uses.map(({ stage, item }) => stageItemStillPath(stage.key, stage.items, item)).filter((path) => !existsSync(`public${path}`));
    expect(missing).toEqual([]);
  });

  it("marks the indigo vat with its scum and bubbles from the sheet", () => {
    const vat = workLiquidOf("ajrakh.indigo-dyeing", [])!;
    expect(liquidMarks(vat)).toEqual({ scum: true, bubbles: true });
    expect(liquidMarks(workLiquidOf("ajrakh.red-dyeing", [])!)).toEqual({ scum: false, bubbles: false });
  });
});
