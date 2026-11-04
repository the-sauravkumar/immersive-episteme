import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { StageTemplate } from "@/features/process/domain/stage-template";
import type { LearningCondition } from "@/lib/permissions/learning";

import type { DoorTraditionView, DoorView } from "./engine";

export type DoorViewBuilder = (template: StageTemplate) => DoorTraditionView;

export const DOOR_VIEW_BUILDERS: Partial<Record<LearningCondition, DoorViewBuilder>> = {};

export function buildDoorViews(templates: readonly StageTemplate[], builders: Partial<Record<LearningCondition, DoorViewBuilder>> = DOOR_VIEW_BUILDERS): DoorView[] {
  return (Object.entries(builders) as [LearningCondition, DoorViewBuilder][]).map(([door, build]) => ({ door, reachable: true, traditions: templates.map(build) }));
}

async function hashOf(publicPath: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(join(process.cwd(), "public", publicPath))).digest("hex");
  } catch {
    return null;
  }
}

export async function hashDoorFiles(doors: readonly DoorView[]): Promise<Record<string, string | null>> {
  const files = new Set(doors.flatMap((door) => door.traditions.flatMap((tradition) => [...tradition.stages.map((stage) => stage.clothFile), ...tradition.products.map((product) => product.file)])));
  const entries = await Promise.all([...files].map(async (file) => [file, await hashOf(file)] as const));
  return Object.fromEntries(entries);
}
