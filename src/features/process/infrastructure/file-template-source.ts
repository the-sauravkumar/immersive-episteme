import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { TemplateSource } from "../application/load-template";
import type { StageTemplate, TraditionKey } from "../domain/stage-template";

export function fileTemplateSource(root: string = process.cwd()): TemplateSource {
  return {
    async read(tradition: TraditionKey): Promise<StageTemplate> {
      const text = await readFile(join(root, "content", "study", `${tradition}.template.json`), "utf8");
      return JSON.parse(text) as StageTemplate;
    },
  };
}
