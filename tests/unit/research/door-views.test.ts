import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stagePanelModel } from "@/features/course/domain/panel-model";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { buildRoute, type RouteStation } from "@/features/walkthrough/domain/route-plan";
import { buildDoorViews, courseView, DOOR_VIEW_BUILDERS, walkthroughView } from "@/server/research/parity/door-views";
import { runParityChecks, type DoorView, type ParityInput } from "@/server/research/parity/engine";

import { passingInput } from "./fixtures";

const dir = join(process.cwd(), "content", "study");
const templates = readdirSync(dir)
  .filter((name) => name.endsWith(".template.json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as StageTemplate);

function inputFor(doors: readonly DoorView[]): ParityInput {
  const base = passingInput();
  const files = doors.flatMap((door) => door.traditions.flatMap((tradition) => [...tradition.stages.map((stage) => stage.clothFile), ...tradition.products.map((product) => product.file)]));
  return {
    ...base,
    study: { ...base.study, config: { ...(base.study.config as object), traditionSlugs: templates.map((template) => template.tradition) } },
    templates,
    doors,
    fileHashes: Object.fromEntries(files.map((file) => [file, `hash-${file}`])),
  };
}

const failed = (input: ParityInput) =>
  runParityChecks(input)
    .checks.filter((check) => !check.passed)
    .flatMap((check) => check.issues.map((issue) => issue.code));

const replaceDoor = (door: "2d" | "immersive", view: DoorView["traditions"][number]): DoorView[] => {
  const doors = buildDoorViews(templates);
  return doors.map((entry) => (entry.door === door ? { ...entry, traditions: entry.traditions.map((tradition) => (tradition.tradition === view.tradition ? view : tradition)) } : entry));
};

describe("door views read each door's own generator", () => {
  it("registers both doors, and the real templates pass", () => {
    expect(Object.keys(DOOR_VIEW_BUILDERS).sort()).toEqual(["2d", "immersive"]);
    expect(templates).toHaveLength(3);
    expect(failed(inputFor(buildDoorViews(templates)))).toEqual([]);
  });

  it("fails when Door 2 paints a different caption", () => {
    const template = templates[0]!;
    const route = buildRoute(template, clothStatePath);
    const station = route[1]!;
    const planted: RouteStation = {
      ...station,
      plan: { ...station.plan, words: station.plan.words.map((word) => (word.colour === "caption" ? { ...word, lines: [`${word.lines[0]} Invented.`] } : word)) },
    };
    const view = walkthroughView(template, route.map((entry) => (entry === station ? planted : entry)));
    expect(failed(inputFor(replaceDoor("immersive", view)))).toContain("caption_text");
  });

  it("fails when Door 2 paints a different stage name", () => {
    const template = templates[0]!;
    const route = buildRoute(template, clothStatePath);
    const station = route[0]!;
    const planted: RouteStation = { ...station, plan: { ...station.plan, words: station.plan.words.map((word, index) => (index === 1 ? { ...word, lines: ["Invented Name"] } : word)) } };
    const view = walkthroughView(template, route.map((entry) => (entry === station ? planted : entry)));
    expect(failed(inputFor(replaceDoor("immersive", view)))).toContain("stage_name");
  });

  it("fails when Door 2 does not paint an object's label", () => {
    const template = templates[0]!;
    const route = buildRoute(template, clothStatePath);
    const index = route.findIndex((entry) => entry.plan.items.length > 0);
    const station = route[index]!;
    const [first, ...others] = station.plan.items;
    const planted: RouteStation = { ...station, plan: { ...station.plan, items: [{ ...first!, benchLabel: { ...first!.benchLabel!, lines: ["Invented Label"] } }, ...others] } };
    const view = walkthroughView(template, route.map((entry, at) => (at === index ? planted : entry)));
    expect(failed(inputFor(replaceDoor("immersive", view)))).toContain("label_text");
  });

  it("fails when Door 1 shows a different caption or a different cloth file", () => {
    const template = templates[1]!;
    const panels = template.stages.map((_, index) => stagePanelModel(template, index));
    const words = panels.map((panel, index) => (index === 2 ? { ...panel, caption: `${panel.caption} Invented.` } : panel));
    expect(failed(inputFor(replaceDoor("2d", courseView(template, words))))).toContain("caption_text");
    const files = panels.map((panel, index) => (index === 0 ? { ...panel, clothAfterSrc: "/walkthrough/other.jpg" } : panel));
    const doors = replaceDoor("2d", courseView(template, files));
    const input = inputFor(doors);
    expect(failed({ ...input, fileHashes: { ...input.fileHashes, "/walkthrough/other.jpg": "a-different-hash" } })).toContain("file_hash_differs");
  });
});
