import type { StageTemplate, TraditionKey } from "../domain/stage-template";
import { structuralErrors } from "../domain/validate-template";

export interface TemplateSource {
  read(tradition: TraditionKey): Promise<StageTemplate>;
}

export async function loadTemplate(source: TemplateSource, tradition: TraditionKey): Promise<StageTemplate> {
  const template = await source.read(tradition);
  const errors = structuralErrors(template);
  if (errors.length > 0) throw new Error(`Invalid stage template for ${tradition}: ${errors.join("; ")}`);
  return template;
}

export function loadTemplates(source: TemplateSource, traditions: readonly TraditionKey[]): Promise<StageTemplate[]> {
  return Promise.all(traditions.map((tradition) => loadTemplate(source, tradition)));
}
