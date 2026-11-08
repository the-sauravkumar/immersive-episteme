import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { productRails, stagePanelModel, type StagePanelModel } from "@/features/course/domain/panel-model";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { exhibitImages, type StageItem, type StageTemplate } from "@/features/process/domain/stage-template";
import { buildRoute, type RouteStation } from "@/features/walkthrough/domain/route-plan";
import type { YardPlan } from "@/features/walkthrough/domain/yard-plan";
import type { LearningCondition } from "@/lib/permissions/learning";

import type { DoorStageView, DoorTraditionView, DoorView } from "./engine";

export type DoorViewBuilder = (template: StageTemplate) => DoorTraditionView;

export function courseView(template: StageTemplate, panels: readonly StagePanelModel[] = template.stages.map((_, index) => stagePanelModel(template, index))): DoorTraditionView {
  return {
    tradition: template.tradition,
    stages: panels.map((panel): DoorStageView => ({
      number: Number(panel.numeral),
      key: panel.key,
      name: panel.name,
      caption: panel.caption,
      sources: panel.sources,
      items: panel.objects.map((object) => ({ key: object.key, label: object.label, localName: object.localName, modelId: object.modelId })),
      clothStateId: panel.clothStateId,
      clothFile: panel.clothAfterSrc,
    })),
    products: productRails(exhibitImages(template).length).flatMap((rail) => exhibitImages(template).slice(rail.start, rail.end)).map((image) => ({ id: image.id, file: image.file })),
  };
}

const paintedOf = (item: Pick<StageItem, "label" | "localName">): string => (item.localName ? `${item.label} (${item.localName})` : item.label);

function paintedLines(plan: YardPlan): readonly string[] {
  return [...plan.words.flatMap((word) => word.lines), ...plan.curvedWords.flatMap((word) => word.lines), ...plan.items.flatMap((placed) => placed.benchLabel?.lines ?? [])];
}

const NOT_PAINTED = "(not painted)";
const NOT_SHOWN = "(not shown)";

export function walkthroughView(template: StageTemplate, route: readonly RouteStation[] = buildRoute(template, clothStatePath)): DoorTraditionView {
  const stations = route.filter((station) => station.stageNumber !== null);
  const hall = route.find((station) => station.stageNumber === null);
  return {
    tradition: template.tradition,
    stages: stations.map((station): DoorStageView => {
      const stage = template.stages.find((entry) => entry.number === station.stageNumber);
      const [numberWord, nameWord] = station.plan.words;
      const lines = paintedLines(station.plan);
      return {
        number: Number(numberWord?.lines[0]),
        key: station.stopKey,
        name: nameWord?.lines[0] ?? NOT_PAINTED,
        caption: station.plan.words.find((word) => word.colour === "caption")?.lines[0] ?? NOT_PAINTED,
        sources: stage?.caption.sources ?? [],
        items: (stage?.items ?? []).map((item) => {
          const placed = station.plan.items.find((candidate) => candidate.item.key === item.key);
          const painted = lines.some((line) => line.includes(paintedOf(item)));
          return { key: item.key, label: painted ? item.label : NOT_PAINTED, localName: item.localName, modelId: placed?.item.modelId ?? item.modelId };
        }),
        clothStateId: stage && clothStatePath(stage.clothStateId) === station.clothAfter ? stage.clothStateId : NOT_SHOWN,
        clothFile: station.clothAfter,
      };
    }),
    products: (hall?.textiles ?? []).map((textile) => ({ id: textile.product.id, file: textile.product.file })),
  };
}

export const DOOR_VIEW_BUILDERS: Record<LearningCondition, DoorViewBuilder> = { "2d": courseView, immersive: walkthroughView };

export function buildDoorViews(templates: readonly StageTemplate[], builders: Partial<Record<LearningCondition, DoorViewBuilder>> = DOOR_VIEW_BUILDERS): DoorView[] {
  return (Object.entries(builders) as [LearningCondition, DoorViewBuilder][]).map(([door, build]) => {
    const traditions = templates.map((template) => build(template));
    const reachable = traditions.every((view, index) => view.stages.length > 0 && view.stages.length === templates[index]!.stages.length && view.stages.every((stage, at) => stage.key === templates[index]!.stages[at]!.key));
    return { door, reachable, traditions };
  });
}

async function hashOf(publicPath: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(join(process.cwd(), "public", publicPath))).digest("hex");
  } catch {
    return null;
  }
}

export async function hashDoorFiles(doors: readonly DoorView[], knownHashes: Readonly<Record<string, string>> = {}): Promise<Record<string, string | null>> {
  const files = new Set(doors.flatMap((door) => door.traditions.flatMap((tradition) => [...tradition.stages.map((stage) => stage.clothFile), ...tradition.products.map((product) => product.file)])));
  const entries = await Promise.all([...files].map(async (file) => [file, knownHashes[file] ?? (await hashOf(file))] as const));
  return Object.fromEntries(entries);
}
