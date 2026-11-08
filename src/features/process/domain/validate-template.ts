import { ASSET_CATALOGUE } from "./asset-catalogue";
import { conceptByKey, processStages, PROCESS_STAGE_TYPE, type TraditionRecord } from "./knowledge-record";
import type { StageTemplate } from "./stage-template";

const MIN_TEMPLATE_STAGES = 7;
const MAX_TEMPLATE_STAGES = 9;

const STATION_KINDS = new Set(["table", "vat", "boil", "wash", "soak", "dry", "carve", "finish"]);
const EVERY_WORD_CAPITAL = /^(?:[^\p{Ll}\s]\S*)(?:\s+[^\p{Ll}\s]\S*)*$/u;

export function structuralErrors(template: StageTemplate): readonly string[] {
  const errors: string[] = [];
  const count = template.stages.length;
  if (count < MIN_TEMPLATE_STAGES || count > MAX_TEMPLATE_STAGES) errors.push(`${count} stages is outside ${MIN_TEMPLATE_STAGES} to ${MAX_TEMPLATE_STAGES}`);
  if (template.rawClothStateId !== `${template.tradition}-raw`) errors.push(`Raw cloth id ${template.rawClothStateId}`);
  const modelIds = new Set(ASSET_CATALOGUE.map((model) => model.id));

  template.stages.forEach((stage, index) => {
    const at = stage.key;
    if (stage.number !== index + 1) errors.push(`${at}: number ${stage.number} at position ${index + 1}`);
    if (!STATION_KINDS.has(stage.kind)) errors.push(`${at}: kind ${stage.kind}`);
    if (!EVERY_WORD_CAPITAL.test(stage.name)) errors.push(`${at}: name is not Title Case: ${stage.name}`);
    if (stage.clothStateId !== `${template.tradition}-${String(stage.number).padStart(2, "0")}`) errors.push(`${at}: cloth state ${stage.clothStateId}`);
    if (stage.sourceStageKeys.length === 0) errors.push(`${at}: no source stages`);
    if (stage.caption.text.trim() === "") errors.push(`${at}: empty caption`);
    if (stage.caption.sources.length === 0) errors.push(`${at}: caption has no sources`);
    for (const source of stage.caption.sources) {
      if (!source.title || !source.locator || !source.quote) errors.push(`${at}: incomplete source ${source.sourceId}`);
    }
    const itemKeys = new Set<string>();
    for (const item of stage.items) {
      if (itemKeys.has(item.key)) errors.push(`${at}: duplicate item ${item.key}`);
      itemKeys.add(item.key);
      if (!modelIds.has(item.modelId)) errors.push(`${at}: unknown model ${item.modelId}`);
      if (!EVERY_WORD_CAPITAL.test(item.label)) errors.push(`${at}: label is not Title Case: ${item.label}`);
    }
  });

  const productFiles = new Set<string>();
  for (const product of template.products) {
    if (productFiles.has(product.file)) errors.push(`Duplicate product ${product.file}`);
    productFiles.add(product.file);
    if (!product.holder || !product.name) errors.push(`Product ${product.id} lacks a name or holder`);
    if (product.widthPx <= 0 || product.heightPx <= 0) errors.push(`Product ${product.id} lacks a size`);
  }
  return errors;
}

export function orderErrors(template: StageTemplate, record: TraditionRecord): readonly string[] {
  const errors: string[] = [];
  const position = new Map<string, number>();
  template.stages.forEach((stage, stageIndex) => {
    stage.sourceStageKeys.forEach((key, keyIndex) => position.set(key, stageIndex * 100 + keyIndex));
  });
  for (const stage of processStages(record)) {
    if (!position.has(stage.key)) errors.push(`${stage.key} is in no template stage`);
  }
  for (const link of record.relationships.filter((entry) => entry.type === "PRECEDES")) {
    if (conceptByKey(record, link.source)?.type !== PROCESS_STAGE_TYPE) continue;
    const before = position.get(link.source);
    const after = position.get(link.target);
    if (before === undefined || after === undefined || before >= after) errors.push(`${link.source} must precede ${link.target}`);
  }
  return errors;
}

export function adjacencyErrors(template: StageTemplate, record: TraditionRecord): readonly string[] {
  const errors: string[] = [];
  const next = new Map(
    record.relationships
      .filter((entry) => entry.type === "PRECEDES" && conceptByKey(record, entry.source)?.type === PROCESS_STAGE_TYPE)
      .map((entry) => [entry.source, entry.target]),
  );
  for (const stage of template.stages) {
    for (let index = 0; index + 1 < stage.sourceStageKeys.length; index += 1) {
      const current = stage.sourceStageKeys[index]!;
      if (next.get(current) !== stage.sourceStageKeys[index + 1]) errors.push(`${stage.key}: ${current} and ${stage.sourceStageKeys[index + 1]} are not adjacent`);
    }
  }
  return errors;
}

export function captionErrors(template: StageTemplate, record: TraditionRecord): readonly string[] {
  const errors: string[] = [];
  for (const stage of template.stages) {
    const claims = stage.sourceStageKeys.flatMap((key) => conceptByKey(record, key)?.claims ?? []);
    let remainder = stage.caption.text;
    for (const claim of claims) remainder = remainder.replace(claim.text, "");
    if (remainder.trim() !== "") errors.push(`${stage.key}: caption is not made of claims: "${remainder.trim()}"`);
    const evidence = claims.flatMap((claim) => claim.evidence);
    for (const source of stage.caption.sources) {
      const found = evidence.some((entry) => entry.source_id === source.sourceId && entry.locator === source.locator && entry.quote === source.quote);
      if (!found) errors.push(`${stage.key}: quote not in evidence: ${source.quote.slice(0, 40)}`);
      const title = record.sources.find((entry) => entry.id === source.sourceId)?.title;
      if (title !== source.title) errors.push(`${stage.key}: source title differs for ${source.sourceId}`);
    }
  }
  return errors;
}
