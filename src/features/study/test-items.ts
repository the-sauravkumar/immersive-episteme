import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { stageItemStillPath } from "@/features/process/domain/substance-look";
import type { StageItem, StageTemplate, TemplateStage } from "@/features/process/domain/stage-template";
import type { TestItemType } from "@/features/research/contracts";

export const DONT_KNOW_OPTION = { id: "dont-know", label: "I do not know" } as const;
export const LAYOUT_SKETCH_PROMPT = "From memory, sketch the layout of what you went through. Show its parts and how they connect.";

const OPTION_COUNT = 4;
const PRE_ITEMS_PER_TRADITION = 2;
const STAND_IN_ITEMS_PER_TRADITION = 6;

export interface UnseenStage {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly tools: readonly string[];
}

export interface UnseenTradition {
  readonly key: string;
  readonly name: string;
  readonly stages: readonly UnseenStage[];
  readonly precedes: readonly (readonly [string, string])[];
}

export interface GeneratedItem {
  readonly itemKey: string;
  readonly position: number;
  readonly kind: "single_choice" | "ranking" | "matching" | "concept_map" | "sketch";
  readonly prompt: string;
  readonly config: Record<string, unknown>;
  readonly answerKey: Record<string, unknown> | null;
}

export interface GeneratedAssessment {
  readonly code: string;
  readonly kind: "pretest" | "posttest" | "transfer" | "reconstruction" | "sketch";
  readonly phase: "pre" | "post" | "follow_up";
  readonly position: number;
  readonly title: string;
  readonly description: string | null;
  readonly testType: TestItemType | null;
  readonly paged: boolean;
  readonly items: readonly GeneratedItem[];
}

interface PlacedObject {
  readonly template: StageTemplate;
  readonly stage: TemplateStage;
  readonly item: StageItem;
}

type DraftItem = Omit<GeneratedItem, "position">;

function uniqueObjects(template: StageTemplate): PlacedObject[] {
  const uses = template.stages.flatMap((stage) => stage.items.map((item) => ({ template, stage, item })));
  return uses.filter((use) => uses.filter((other) => other.item.key === use.item.key).length === 1);
}

function allObjects(templates: readonly StageTemplate[]): StageItem[] {
  const seen = new Map<string, StageItem>();
  for (const template of templates) for (const stage of template.stages) for (const item of stage.items) if (!seen.has(item.key)) seen.set(item.key, item);
  return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function identifiable(object: PlacedObject, pool: readonly StageItem[]): boolean {
  return pool.filter((item) => item.modelId === object.item.modelId && item.label !== object.item.label).length === 0;
}

function nameOptions(target: StageItem, pool: readonly StageItem[], turn: number): { options: { id: string; label: string }[]; correct: string } | null {
  const sameRole = pool.filter((item) => item.role === target.role && item.label !== target.label && item.modelId !== target.modelId);
  const labels = [...new Set(sameRole.map((item) => item.label))];
  if (labels.length < OPTION_COUNT - 1) return null;
  const start = turn % labels.length;
  const distractors = Array.from({ length: OPTION_COUNT - 1 }, (_, offset) => labels[(start + offset) % labels.length]!);
  return { options: [target.label, ...distractors].map((label, index) => ({ id: `o${index + 1}`, label })), correct: "o1" };
}

const stageOptions = (template: StageTemplate) => template.stages.map((stage) => ({ id: `s${stage.number}`, label: stage.name }));

const placedTarget = (object: PlacedObject) => ({ tradition: object.template.tradition, stageKey: object.stage.key, objectKey: object.item.key });

function identificationItem(object: PlacedObject, pool: readonly StageItem[], turn: number, prefix: string): DraftItem | null {
  const choice = nameOptions(object.item, pool, turn);
  if (!choice) return null;
  return {
    itemKey: `${prefix}.${object.template.tradition}.${object.stage.number}.${turn}`.slice(0, 64),
    kind: "single_choice",
    prompt: "What is this called?",
    config: { kind: "single_choice", options: choice.options, shuffle: true, image: { path: stageItemStillPath(object.stage.key, object.stage.items, object.item), alt: "The object to name" }, target: placedTarget(object) },
    answerKey: { optionId: choice.correct },
  };
}

function placementItem(object: PlacedObject, turn: number, prefix: string): DraftItem {
  return {
    itemKey: `${prefix}.${object.template.tradition}.${object.stage.number}.${turn}`.slice(0, 64),
    kind: "single_choice",
    prompt: `At which stage of ${object.template.traditionName} is ${object.item.label} used?`,
    config: { kind: "single_choice", options: stageOptions(object.template), shuffle: true, image: { path: stageItemStillPath(object.stage.key, object.stage.items, object.item), alt: object.item.label }, target: placedTarget(object) },
    answerKey: { optionId: `s${object.stage.number}` },
  };
}

const asSample = (item: DraftItem): DraftItem => ({ ...item, config: { ...item.config, sampleText: true } });

function withDontKnow(item: DraftItem): DraftItem {
  const config = item.config as { options: { id: string; label: string }[] };
  return { ...item, config: { ...item.config, shuffle: true, options: [...config.options, DONT_KNOW_OPTION] } };
}

function sequenceItem(template: StageTemplate, stages: readonly TemplateStage[], suffix: string): DraftItem {
  return {
    itemKey: `seq.${template.tradition}.${suffix}`.slice(0, 64),
    kind: "ranking",
    prompt: `Put these stages of ${template.traditionName} in process order.`,
    config: { kind: "ranking", options: stages.map((stage) => ({ id: `s${stage.number}`, label: stage.name })), target: { tradition: template.tradition } },
    answerKey: { order: stages.map((stage) => `s${stage.number}`) },
  };
}

function clothItem(template: StageTemplate, stages: readonly TemplateStage[], suffix: string): DraftItem {
  return {
    itemKey: `cloth.${template.tradition}.${suffix}`.slice(0, 64),
    kind: "matching",
    prompt: `Each image shows the cloth in ${template.traditionName} after one stage. Choose the stage for each.`,
    config: {
      kind: "matching",
      pairs: stages.map((stage) => ({ id: `p${stage.number}`, image: { path: clothStatePath(stage.clothStateId), alt: "The cloth after a stage" } })),
      options: stageOptions(template),
      shuffle: true,
      target: { tradition: template.tradition },
    },
    answerKey: { matches: Object.fromEntries(stages.map((stage) => [`p${stage.number}`, `s${stage.number}`])) },
  };
}

const publicPath = (file: string) => (file.startsWith("/") ? file : `/${file}`);

function attributionItem(template: StageTemplate, templates: readonly StageTemplate[], form: "immediate" | "delayed"): DraftItem | null {
  const product = form === "immediate" ? template.products[0] : template.products[template.products.length - 1];
  if (!product) return null;
  return {
    itemKey: `attr.${template.tradition}.${form}`.slice(0, 64),
    kind: "single_choice",
    prompt: "Which tradition does this finished textile come from?",
    config: {
      kind: "single_choice",
      options: templates.map((candidate) => ({ id: candidate.tradition, label: candidate.traditionName })),
      shuffle: false,
      image: { path: publicPath(product.file), alt: "A finished textile" },
      target: { tradition: template.tradition },
    },
    answerKey: { optionId: template.tradition },
  };
}

export function linearOrder(tradition: UnseenTradition): UnseenStage[] | null {
  const byKey = new Map(tradition.stages.map((stage) => [stage.key, stage]));
  const edges = tradition.precedes.filter(([from, to]) => byKey.has(from) && byKey.has(to));
  const successor = new Map<string, string>();
  const incoming = new Set<string>();
  for (const [from, to] of edges) {
    if (successor.has(from) || incoming.has(to)) return null;
    successor.set(from, to);
    incoming.add(to);
  }
  const roots = tradition.stages.filter((stage) => !incoming.has(stage.key));
  if (roots.length !== 1) return null;
  const order: UnseenStage[] = [];
  for (let at: string | undefined = roots[0]!.key; at; at = successor.get(at)) order.push(byKey.get(at)!);
  return order.length === tradition.stages.length ? order : null;
}

function accountOf(tradition: UnseenTradition): string {
  const stages = [...tradition.stages].sort((a, b) => a.key.localeCompare(b.key));
  return [`${tradition.name} is a tradition you have not seen. These are its stages, in no particular order.`, ...stages.map((stage) => `${stage.title}: ${stage.summary}`)].join("\n");
}

export function transferItems(tradition: UnseenTradition): DraftItem[] {
  const account = accountOf(tradition);
  const shared = { account, sampleText: true, target: { tradition: tradition.key } };
  const items: DraftItem[] = [];
  const order = linearOrder(tradition);
  if (order) {
    items.push({
      itemKey: `transfer.${tradition.key}.order`,
      kind: "ranking",
      prompt: `Predict the order of these stages of ${tradition.name}.`,
      config: { kind: "ranking", options: order.map((stage, index) => ({ id: `s${index + 1}`, label: stage.title })), ...shared },
      answerKey: { order: order.map((_, index) => `s${index + 1}`) },
    });
  }
  const byKey = new Map(tradition.stages.map((stage) => [stage.key, stage]));
  const successors = tradition.precedes.filter(([from, to], _, all) => byKey.has(from) && byKey.has(to) && all.filter(([other]) => other === from).length === 1);
  const pair = successors[Math.floor(successors.length / 2)];
  if (pair) {
    const after = byKey.get(pair[1])!;
    const others = tradition.stages.filter((stage) => stage.key !== pair[0] && stage.key !== pair[1]).slice(0, OPTION_COUNT - 1);
    if (others.length === OPTION_COUNT - 1) {
      items.push({
        itemKey: `transfer.${tradition.key}.next`,
        kind: "single_choice",
        prompt: `Which stage comes straight after ${byKey.get(pair[0])!.title}?`,
        config: { kind: "single_choice", options: [after, ...others].map((stage, index) => ({ id: `o${index + 1}`, label: stage.title })), shuffle: true, ...shared },
        answerKey: { optionId: "o1" },
      });
    }
    const allTools = [...new Set(tradition.stages.flatMap((stage) => stage.tools))];
    const tool = after.tools[0];
    const wrongTools = allTools.filter((candidate) => !after.tools.includes(candidate)).slice(0, OPTION_COUNT - 1);
    if (tool && wrongTools.length === OPTION_COUNT - 1) {
      items.push({
        itemKey: `transfer.${tradition.key}.tool`,
        kind: "single_choice",
        prompt: `Which of these is used at ${after.title}?`,
        config: { kind: "single_choice", options: [tool, ...wrongTools].map((label, index) => ({ id: `o${index + 1}`, label })), shuffle: true, ...shared },
        answerKey: { optionId: "o1" },
      });
    }
  }
  return items;
}

const positioned = (items: readonly (DraftItem | null)[]): GeneratedItem[] => items.filter((item): item is DraftItem => item !== null).map((item, position) => ({ ...item, position }));

export function conceptMapItem(template: StageTemplate, knownConceptKeys: ReadonlySet<string>): DraftItem | null {
  const stageKeys = template.stages.map((stage) => stage.sourceStageKeys[0]).filter((key): key is string => !!key && knownConceptKeys.has(key));
  const objectKeys = [...new Set(template.stages.flatMap((stage) => stage.items.map((item) => item.key)))].filter((key) => knownConceptKeys.has(key));
  const conceptKeys = [...stageKeys, ...objectKeys];
  if (conceptKeys.length < 2) return null;
  return {
    itemKey: `map.${template.tradition}`.slice(0, 64),
    kind: "concept_map",
    prompt: `Link the stages, tools and materials of ${template.traditionName}.`,
    config: { kind: "concept_map", conceptKeys, allowFreeNodes: false, relationshipTypes: [], directed: true },
    answerKey: null,
  };
}

export interface BatteryInput {
  readonly templates: readonly StageTemplate[];
  readonly unseen: readonly UnseenTradition[];
  readonly knownConceptKeys: ReadonlySet<string>;
}

export function buildTestBattery({ templates, unseen, knownConceptKeys }: BatteryInput): GeneratedAssessment[] {
  const pool = allObjects(templates);
  const pre: (DraftItem | null)[] = [];
  const ident = { immediate: [] as (DraftItem | null)[], delayed: [] as (DraftItem | null)[] };
  const placement = { immediate: [] as DraftItem[], delayed: [] as DraftItem[] };
  const standIn = { immediate: [] as DraftItem[], delayed: [] as DraftItem[] };
  templates.forEach((template) => {
    const objects = uniqueObjects(template);
    const named = objects.filter((object) => identifiable(object, pool));
    named.forEach((object, turn) => {
      const target = turn < PRE_ITEMS_PER_TRADITION ? null : (turn - PRE_ITEMS_PER_TRADITION) % 3 === 2 ? ident.delayed : ident.immediate;
      if (target) target.push(identificationItem(object, pool, turn, "id"));
      else {
        const item = identificationItem(object, pool, turn, "pre.id");
        pre.push(item ? withDontKnow(item) : null);
      }
    });
    const placedInPreTest = new Set(objects.slice(0, PRE_ITEMS_PER_TRADITION));
    objects.filter((object) => !named.includes(object) && !placedInPreTest.has(object)).forEach((object, turn) => {
      const item = identificationItem(object, pool, turn, "id");
      if (item && turn < STAND_IN_ITEMS_PER_TRADITION) (turn % 3 === 2 ? standIn.delayed : standIn.immediate).push(asSample(item));
    });
    objects.forEach((object, turn) => {
      if (turn < PRE_ITEMS_PER_TRADITION) pre.push(withDontKnow(placementItem(object, turn, "pre.place")));
      else ((turn - PRE_ITEMS_PER_TRADITION) % 3 === 2 ? placement.delayed : placement.immediate).push(placementItem(object, turn, "place"));
    });
  });
  const alternate = (stages: readonly TemplateStage[], remainder: number) => stages.filter((_, index) => index % 2 === remainder);
  const assessment = (code: string, phase: GeneratedAssessment["phase"], position: number, title: string, testType: TestItemType, items: readonly (DraftItem | null)[], kind: GeneratedAssessment["kind"] = phase === "pre" ? "pretest" : "posttest", description: string | null = null): GeneratedAssessment => ({
    code,
    kind,
    phase,
    position,
    title,
    description,
    testType,
    paged: phase === "pre",
    items: positioned(items),
  });
  const [immediateUnseen, delayedUnseen] = [unseen[0], unseen[1] ?? unseen[0]];
  const battery: GeneratedAssessment[] = [
    assessment("test-pre", "pre", 0, "Questions Before Learning", "pre_test", pre, "pretest", "Choose I do not know if you do not know. It is fine not to know."),
    assessment("test-identification", "post", 0, "Name The Object", "identification", ident.immediate.some(Boolean) ? ident.immediate : standIn.immediate),
    assessment("test-stage-placement", "post", 1, "Find The Stage", "stage_placement", placement.immediate),
    assessment("test-sequence", "post", 2, "Put The Stages In Order", "sequence", templates.map((template) => sequenceItem(template, template.stages, "all"))),
    assessment("test-cloth-state", "post", 3, "Match The Cloth", "cloth_state", templates.map((template) => clothItem(template, alternate(template.stages, 0), "a"))),
    assessment("test-attribution", "post", 4, "Name The Tradition", "attribution", templates.map((template) => attributionItem(template, templates, "immediate"))),
    assessment("test-transfer", "post", 5, "A Tradition You Have Not Seen", "transfer", immediateUnseen ? transferItems(immediateUnseen) : [], "transfer"),
    {
      code: "test-concept-map",
      kind: "reconstruction",
      phase: "post",
      position: 6,
      title: "Link The Process",
      description: null,
      testType: null,
      paged: false,
      items: positioned(templates.map((template) => conceptMapItem(template, knownConceptKeys))),
    },
    {
      code: "test-layout-sketch",
      kind: "sketch",
      phase: "post",
      position: 7,
      title: "Sketch The Layout",
      description: null,
      testType: null,
      paged: false,
      items: [{ itemKey: "layout.sketch", position: 0, kind: "sketch", prompt: LAYOUT_SKETCH_PROMPT, config: { kind: "sketch" }, answerKey: null }],
    },
    assessment("test-identification-delayed", "follow_up", 0, "Name The Object", "identification", ident.delayed.some(Boolean) ? ident.delayed : standIn.delayed),
    assessment("test-stage-placement-delayed", "follow_up", 1, "Find The Stage", "stage_placement", placement.delayed),
    assessment("test-sequence-delayed", "follow_up", 2, "Put The Stages In Order", "sequence", templates.map((template) => sequenceItem(template, alternate(template.stages, 1), "short"))),
    assessment("test-cloth-state-delayed", "follow_up", 3, "Match The Cloth", "cloth_state", templates.map((template) => clothItem(template, alternate(template.stages, 1), "b"))),
    assessment("test-attribution-delayed", "follow_up", 4, "Name The Tradition", "attribution", templates.map((template) => attributionItem(template, templates, "delayed"))),
    assessment("test-transfer-delayed", "follow_up", 5, "A Tradition You Have Not Seen", "transfer", delayedUnseen ? transferItems(delayedUnseen) : []),
  ];
  return battery.filter((entry) => entry.items.length > 0);
}
