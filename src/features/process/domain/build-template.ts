import { conceptByKey, UNBACKED_LINK_STATE, type ClaimRecord, type ConceptRecord, type TraditionRecord } from "./knowledge-record";
import type { PlannedStage, TraditionPlan } from "./merge-plan";
import type { ItemRole, ProductImage, SourceRef, StageCaption, StageItem, StageTemplate, TemplateStage } from "./stage-template";
import { isShortFormOf, joinShortForms, splitTitle } from "./title-parts";

export interface TemplateBuildPorts {
  readonly headingCase: (text: string) => string;
  readonly modelIdFor: (concept: ConceptRecord, stageKey: string, role: "tool" | "material", label: string) => string;
}

export interface ExcludedItem {
  readonly stage: string;
  readonly concept: string;
  readonly reason: string;
}

export interface TemplateBuildResult {
  readonly template: StageTemplate;
  readonly stagesWithoutItems: readonly string[];
  readonly excludedItems: readonly ExcludedItem[];
}

const ROLES: Readonly<Record<string, ItemRole>> = { tool: "tool", material: "material" };

function requiredConcept(record: TraditionRecord, key: string): ConceptRecord {
  const concept = conceptByKey(record, key);
  if (!concept) throw new Error(`Unknown concept ${key} in ${record.slug}`);
  return concept;
}

function plannedClaim(record: TraditionRecord, stageKey: string, index: number): ClaimRecord {
  const claim = requiredConcept(record, stageKey).claims?.[index];
  if (!claim) throw new Error(`No claim ${index} on ${stageKey}`);
  return claim;
}

function sourceRefs(record: TraditionRecord, claims: readonly ClaimRecord[]): readonly SourceRef[] {
  const seen = new Set<string>();
  const refs: SourceRef[] = [];
  for (const evidence of claims.flatMap((claim) => claim.evidence)) {
    const identity = `${evidence.source_id}|${evidence.locator}|${evidence.quote}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const source = record.sources.find((entry) => entry.id === evidence.source_id);
    if (!source) throw new Error(`Unknown source ${evidence.source_id} in ${record.slug}`);
    refs.push({ sourceId: source.id, title: source.title, locator: evidence.locator, quote: evidence.quote });
  }
  return refs;
}

function buildCaption(record: TraditionRecord, planned: PlannedStage): StageCaption {
  const claims = planned.caption.map((entry) => plannedClaim(record, entry.stage, entry.claim));
  return { text: claims.map((claim) => claim.text).join(" "), sources: sourceRefs(record, claims) };
}

function buildName(record: TraditionRecord, planned: PlannedStage, ports: TemplateBuildPorts): Pick<TemplateStage, "name" | "localName"> {
  const locals: string[] = [];
  const shortForms: string[] = [];
  for (const source of planned.sources) {
    const concept = requiredConcept(record, source.stage);
    const parts = splitTitle(concept.title, concept.local_terms ?? []);
    if (!isShortFormOf(source.shortForm, parts.name)) throw new Error(`"${source.shortForm}" is not a short form of "${parts.name}"`);
    shortForms.push(ports.headingCase(source.shortForm));
    if (parts.localName) locals.push(ports.headingCase(parts.localName));
  }
  return { name: joinShortForms(shortForms), localName: locals.length > 0 ? [...new Set(locals)].join(", ") : null };
}

function buildItems(
  tradition: string,
  record: TraditionRecord,
  planned: PlannedStage,
  ports: TemplateBuildPorts,
  excluded: ExcludedItem[],
): readonly StageItem[] {
  const items = new Map<string, StageItem>();
  for (const source of planned.sources) {
    for (const link of record.relationships.filter((entry) => entry.source === source.stage && entry.type === "USES")) {
      if (link.verification_state === UNBACKED_LINK_STATE) {
        excluded.push({ stage: planned.key, concept: link.target, reason: "USES link needs evidence" });
        continue;
      }
      const concept = requiredConcept(record, link.target);
      const role = ROLES[concept.type];
      if (!role) {
        excluded.push({ stage: planned.key, concept: link.target, reason: `Concept type ${concept.type} is neither tool nor material` });
        continue;
      }
      if (items.has(concept.key)) continue;
      const parts = splitTitle(concept.title, concept.local_terms ?? []);
      items.set(concept.key, {
        key: concept.key,
        role,
        label: ports.headingCase(parts.name),
        localName: parts.localName ? ports.headingCase(parts.localName) : null,
        modelId: ports.modelIdFor(concept, `${tradition}.${planned.key}`, role, ports.headingCase(parts.name)),
      });
    }
  }
  return [...items.values()].sort((left, right) => Number(left.role === "material") - Number(right.role === "material"));
}

export const clothStateId = (tradition: string, number: number): string => `${tradition}-${String(number).padStart(2, "0")}`;
export const rawClothStateId = (tradition: string): string => `${tradition}-raw`;

export function buildStageTemplate(
  record: TraditionRecord,
  plan: TraditionPlan,
  products: readonly ProductImage[],
  ports: TemplateBuildPorts,
): TemplateBuildResult {
  const excludedItems: ExcludedItem[] = [];
  const stagesWithoutItems: string[] = [];
  const stages = plan.stages.map((planned, index): TemplateStage => {
    const number = index + 1;
    const items = buildItems(plan.tradition, record, planned, ports, excludedItems);
    if (items.length === 0) stagesWithoutItems.push(planned.key);
    return {
      number,
      key: `${plan.tradition}.${planned.key}`,
      sourceStageKeys: planned.sources.map((source) => source.stage),
      ...buildName(record, planned, ports),
      kind: planned.kind,
      caption: buildCaption(record, planned),
      items,
      clothStateId: clothStateId(plan.tradition, number),
    };
  });
  return {
    template: {
      tradition: plan.tradition,
      traditionName: plan.traditionName,
      rawClothStateId: rawClothStateId(plan.tradition),
      stages,
      products,
    },
    stagesWithoutItems,
    excludedItems,
  };
}
