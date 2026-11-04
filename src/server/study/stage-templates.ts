import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { StageTemplate } from "@/features/process/domain/stage-template";

export type StageTemplateSource = () => Promise<readonly StageTemplate[]>;

async function readTemplateFiles(dir: string): Promise<StageTemplate[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const files = names.filter((name) => name.endsWith(".template.json")).sort();
  return Promise.all(files.map(async (name) => JSON.parse(await readFile(join(dir, name), "utf8")) as StageTemplate));
}

const fromContentFiles: StageTemplateSource = () => readTemplateFiles(join(process.cwd(), "content", "study"));

let source: StageTemplateSource = fromContentFiles;

export function setStageTemplateSource(next: StageTemplateSource | null): void {
  source = next ?? fromContentFiles;
}

export function loadStageTemplates(): Promise<readonly StageTemplate[]> {
  return source();
}
