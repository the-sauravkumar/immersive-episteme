import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { balanceDiagramSets, buildStructureDiagrams } from "@/features/knowledge/read/diagrams";
import { photoGateOpen } from "@/features/knowledge/read/view";
import { compareTraditionSlugs, exposureLayerOf, KNOWLEDGE_LAYER_LABELS, KNOWLEDGE_LAYERS, STUDY_TRADITION_SLUGS, type KnowledgeLayerId } from "@/features/learning/labels";
import { EPISTEMIC_SECTIONS, sectionOfType } from "@/features/learning-2d/template";
import { displayLongEdge, licenceValidOn, STUDY_FIGURE_CAP } from "@/features/media/contracts";
import { ASSET_CATALOGUE } from "@/features/process/domain/asset-catalogue";
import type { SourceRef, StageItem, StageTemplate } from "@/features/process/domain/stage-template";
import { canonicalHash } from "@/features/spatial/compiler/canonical";
import { studyConfigSchema } from "@/features/study/contracts";
import { LEARNING_CONDITIONS, type LearningCondition } from "@/lib/permissions/learning";
import type { ConceptType } from "@/lib/validation/enums";
import { DEFAULT_QUESTIONNAIRES, DEFAULT_STEPS, isQuestionnaireStep, protocolIssues, QUESTIONNAIRE_CONFIG_KEY, STEP_ASSESSMENTS } from "@/server/study/config";

export const PARITY_GENERATOR_VERSION = "parity/2.0.0";

export type ParitySeverity = "critical" | "warning";
export type ParityGroup = "base" | "t" | "d" | "e";

export interface ParityIssue {
  code: string;
  message: string;
  ref?: string;
}

export interface ParityCheck {
  id: string;
  group: ParityGroup;
  label: string;
  severity: ParitySeverity;
  passed: boolean;
  issues: ParityIssue[];
  metrics: Record<string, number>;
}

export interface ParityReport {
  schemaVersion: 2;
  generatorVersion: string;
  studyId: string;
  studySlug: string;
  protocolVersion: string;
  snapshotId: string | null;
  snapshotLabel: string | null;
  manifestId: string | null;
  inputSha256: string;
  passed: boolean;
  criticalFailures: number;
  warnings: number;
  contentSet: { stages: number; items: number; products: number; sources: number };
  checks: ParityCheck[];
}

export interface ParityStudyInput {
  id: string;
  slug: string;
  protocolVersion: string;
  design: string;
  isDemo: boolean;
  config: unknown;
  snapshotId: string | null;
  manifestId: string | null;
  conditions: { id: string; code: string; label: string; interface: string; config: Record<string, unknown> }[];
  battery: { assessmentId: string; code: string; version: number; kind: string; phase: string; position: number; status: string; required: boolean }[];
}

export interface ParitySnapshotInput {
  id: string;
  versionLabel: string;
  status: string;
  kind: string;
  isDemo: boolean;
}

export interface DoorStageView {
  number: number;
  key: string;
  name: string;
  caption: string;
  sources: readonly SourceRef[];
  items: readonly Pick<StageItem, "key" | "label" | "localName" | "modelId">[];
  clothStateId: string;
  clothFile: string;
}

export interface DoorTraditionView {
  tradition: string;
  stages: readonly DoorStageView[];
  products: readonly { id: string; file: string }[];
}

export interface DoorView {
  door: LearningCondition;
  reachable: boolean;
  traditions: readonly DoorTraditionView[];
}

export interface ParityFigureAsset {
  assetId: string;
  conceptId: string;
  role: string;
  position: number;
  verificationState: string;
  isDemo: boolean;
  width: number | null;
  height: number | null;
  maxPixels: number | null;
  licenceExpiresOn: string | null;
  credit: string | null;
  caption: string | null;
  altText: string | null;
}

export interface ParityInput {
  study: ParityStudyInput;
  snapshot: ParitySnapshotInput | null;
  templates: readonly StageTemplate[];
  doors: readonly DoorView[];
  fileHashes: Readonly<Record<string, string | null>>;
  sessionBudgets?: { interface: string; learningBudgetSeconds: number | null }[];
}

const CONDITION_OVERRIDE_KEYS = /^(exposure|guidance|assessments?|battery|prompts?|tasks?|instructions?|search(Enabled)?|minimap|cue(Enabled)?|traditions?|traditionSlugs|contentSets)$/i;

// ---- figure balance (DESIGN.md 9.9, 11.10, 12.3 rules 8-10; DR-018, DR-020) ------------------

/** A tradition-page section (EPISTEMIC_SECTIONS) with the knowledge layer its figures count under. */
export interface FigureSectionRow {
  sectionId: string;
  title: string;
  layer: KnowledgeLayerId;
  /** Figures a learner sees in this section, per balance tradition slug. */
  counts: Record<string, number>;
  balanced: boolean;
}

/** Figures a learner sees per knowledge layer, per balance tradition slug. */
export interface FigureLayerRow {
  layer: KnowledgeLayerId;
  counts: Record<string, number>;
  balanced: boolean;
}

export interface FigureBalance {
  /** The traditions whose counts must be equal: the study traditions in scope, else every one in scope. */
  traditionSlugs: string[];
  traditionNames: Record<string, string>;
  rows: FigureSectionRow[];
  /** The same counts per knowledge layer (exposureLayerOf the figure's concept type). */
  layers: FigureLayerRow[];
  /** Every figure a learner sees, per tradition: kind, concept, section. */
  shown: { traditionSlug: string; conceptId: string; conceptKey: string; sectionId: string; kind: "diagram" | "photo"; ref: string }[];
  issues: ParityIssue[];
  metrics: { diagrams: number; photos: number; photosHeldBack: number };
}

function sectionLayer(sectionId: string): KnowledgeLayerId {
  const sec = EPISTEMIC_SECTIONS.find((s) => s.id === sectionId);
  const t = sec?.types[0];
  return t ? (exposureLayerOf(t) as KnowledgeLayerId) : "overview";
}

/**
 * The figures each study tradition would show, per section, resolved exactly as the read model
 * resolves them for BOTH conditions (`resolveConceptFigures`: at most one figure per concept; the
 * structure diagram, while the protocol shows them, takes the slot; otherwise an approved,
 * licence-valid illustration photograph anchored to an existing claim). Pure and deterministic.
 *
 * The rule (12.3 rule 9) is per section: within each tradition-page section (the museum room), the
 * balance traditions show exactly the same number of figures. Sections are the EPISTEMIC_SECTIONS
 * of the 2D template (the science section holds both scientific mechanisms and explanations), and
 * a section's `layer` (the CMS table's grouping) is `exposureLayerOf` its first concept type.
 * Since the one section map (DR-024) a section can span two layers: "Science and environment"
 * holds the science types and environmental conditions (overview layer). Section balance therefore
 * no longer implies layer balance, so layers are checked as well, by `exposureLayerOf` of each
 * figure's own concept type (`figures_unbalanced_layer`). Either balance implies an equal
 * per-tradition total.
 */
export function figureBalance(
  bundle: KnowledgeBundle,
  traditionSlugs: readonly string[],
  opts: { structureDiagrams: boolean; photos?: boolean; figureAssets?: readonly ParityFigureAsset[]; asOf?: string | null },
): FigureBalance {
  const inBundle = new Set(bundle.traditions.map((t) => t.slug));
  const scope = [...new Set(traditionSlugs)].filter((s) => inBundle.has(s));
  const study = scope.filter((s) => (STUDY_TRADITION_SLUGS as readonly string[]).includes(s));
  const balance = (study.length > 0 ? study : scope).sort(compareTraditionSlugs);
  const traditionById = new Map(bundle.traditions.map((t) => [t.id, t]));
  const traditionNames = Object.fromEntries(bundle.traditions.map((t) => [t.slug, t.name]));
  const conceptById = new Map(bundle.concepts.map((c) => [c.id, c]));
  const issues: ParityIssue[] = [];
  const shown: FigureBalance["shown"] = [];

  // Diagrams: the same balancing the read model applies (balanceDiagramSets over the balance set).
  const diagramByConcept = new Map<string, { id: string; section: string }>();
  if (opts.structureDiagrams) {
    const all = new Map(balance.map((slug) => [slug, buildStructureDiagrams(bundle, slug)]));
    for (const list of balanceDiagramSets(all, balance).values()) {
      for (const d of list) {
        // A concept shows ONE figure: a second diagram anchored on the same concept is not shown.
        if (!diagramByConcept.has(d.anchor.conceptId)) diagramByConcept.set(d.anchor.conceptId, { id: d.id, section: d.section });
      }
    }
  }

  // Photographs: approved, licence-valid illustration links of the bundle's concepts.
  const day = opts.asOf ?? null;
  const photoCandidates = new Map<string, ParityFigureAsset[]>();
  // The protocol switch `figures.photos` (DR-020): off shows no photograph in either condition.
  for (const a of opts.photos === false ? [] : (opts.figureAssets ?? [])) {
    if (a.role !== "illustration") continue;
    const c = conceptById.get(a.conceptId);
    if (!c) continue;
    // The anchor-claim gate (DR-020): a photograph shows only once its concept's claims are verified.
    if (!photoGateOpen(c.verificationState)) continue;
    if (c.assetIds.length > 0 && !c.assetIds.includes(a.assetId)) continue; // a frozen bundle lists its own figures
    if (a.isDemo && !bundle.isDemo) continue; // demo media never reaches a real bundle
    if (a.verificationState !== "verified" && a.verificationState !== "published") continue;
    const absent = [!a.credit?.trim() && "credit", !a.caption?.trim() && "caption", !a.altText?.trim() && "alt text"].filter((x): x is string => Boolean(x));
    if (absent.length) {
      // The learner route refuses such an image, so it is not counted as shown; it still blocks activation.
      issues.push({ code: "figure_metadata", message: `Image ${a.assetId} on ${c.key} has no ${absent.join(", ")}: every study figure prints a caption and a credit and licence line, and has alt text.`, ref: a.assetId });
      continue;
    }
    if (day && !licenceValidOn(a.licenceExpiresOn, day)) {
      issues.push({ code: "figure_licence_expired", message: `Image ${a.assetId} on ${c.key}: its licence expired on ${a.licenceExpiresOn}.`, ref: a.assetId });
      continue;
    }
    if (!Number.isInteger(a.position) || a.position < 0 || a.position >= c.claims.length) {
      issues.push({ code: "figure_anchor", message: `Image ${a.assetId} on ${c.key} anchors to claim ${a.position + 1}, which the concept does not have.`, ref: a.assetId });
      continue;
    }
    photoCandidates.set(c.id, [...(photoCandidates.get(c.id) ?? []), a]);
  }
  for (const [conceptId, list] of photoCandidates) {
    if (list.length > 1) {
      const key = conceptById.get(conceptId)?.key ?? conceptId;
      issues.push({ code: "figure_per_concept", message: `${key} has ${list.length} approved illustrations; a study concept shows at most one.`, ref: conceptId });
    }
  }

  const counts = new Map<string, Map<string, number>>(); // section -> slug -> n
  const layerCounts = new Map<string, Map<string, number>>(); // layer -> slug -> n
  const bump = (section: string, slug: string, type: ConceptType) => {
    for (const [map, key] of [[counts, section], [layerCounts, exposureLayerOf(type)]] as const) {
      const row = map.get(key) ?? new Map<string, number>();
      row.set(slug, (row.get(slug) ?? 0) + 1);
      map.set(key, row);
    }
  };
  let diagrams = 0;
  let photos = 0;
  let photosHeldBack = 0;
  for (const c of bundle.concepts) {
    const slug = c.traditionId ? traditionById.get(c.traditionId)?.slug : undefined;
    if (!slug || !balance.includes(slug)) continue;
    const candidates = [...(photoCandidates.get(c.id) ?? [])].sort((x, y) => x.position - y.position || (x.assetId < y.assetId ? -1 : 1));
    const diagram = diagramByConcept.get(c.id);
    if (diagram) {
      photosHeldBack += candidates.length;
      bump(diagram.section, slug, c.type);
      shown.push({ traditionSlug: slug, conceptId: c.id, conceptKey: c.key, sectionId: diagram.section, kind: "diagram", ref: diagram.id });
      diagrams++;
      continue;
    }
    const photo = candidates[0];
    if (!photo) continue;
    photosHeldBack += candidates.length - 1;
    const edge = displayLongEdge(photo);
    if (edge === null || edge < STUDY_FIGURE_CAP) {
      issues.push({
        code: "figure_below_cap",
        message: `Image ${photo.assetId} on ${c.key} can be shown at ${edge ?? "an unknown number of"} px on its long edge; every study figure must reach the ${STUDY_FIGURE_CAP} px lightbox cap.`,
        ref: photo.assetId,
      });
    }
    const section = sectionOfType(c.type).id;
    bump(section, slug, c.type);
    shown.push({ traditionSlug: slug, conceptId: c.id, conceptKey: c.key, sectionId: section, kind: "photo", ref: photo.assetId });
    photos++;
  }

  const rows: FigureSectionRow[] = EPISTEMIC_SECTIONS.map((sec) => {
    const row = counts.get(sec.id);
    const byTradition = Object.fromEntries(balance.map((slug) => [slug, row?.get(slug) ?? 0]));
    const values = Object.values(byTradition);
    return { sectionId: sec.id, title: sec.title, layer: sectionLayer(sec.id), counts: byTradition, balanced: values.every((v) => v === values[0]) };
  });
  for (const r of rows) {
    if (r.balanced) continue;
    const detail = balance.map((slug) => `${traditionNames[slug] ?? slug} ${r.counts[slug]}`).join(", ");
    issues.push({ code: "figures_unbalanced", message: `Section "${r.title}" is unbalanced (${detail}): every study tradition must show the same number of figures in each section.`, ref: r.sectionId });
  }
  const layers: FigureLayerRow[] = KNOWLEDGE_LAYERS.map(({ id }) => {
    const row = layerCounts.get(id);
    const byTradition = Object.fromEntries(balance.map((slug) => [slug, row?.get(slug) ?? 0]));
    const values = Object.values(byTradition);
    return { layer: id, counts: byTradition, balanced: values.every((v) => v === values[0]) };
  });
  // A layer imbalance that an unbalanced section already explains is not reported twice.
  const explained = new Set(rows.filter((r) => !r.balanced).flatMap((r) => (EPISTEMIC_SECTIONS.find((x) => x.id === r.sectionId)?.types ?? []).map((t) => exposureLayerOf(t))));
  for (const l of layers) {
    if (l.balanced || explained.has(l.layer)) continue;
    const detail = balance.map((slug) => `${traditionNames[slug] ?? slug} ${l.counts[slug]}`).join(", ");
    issues.push({ code: "figures_unbalanced_layer", message: `The ${KNOWLEDGE_LAYER_LABELS[l.layer]} layer is unbalanced (${detail}): every study tradition must show the same number of figures in each knowledge layer.`, ref: l.layer });
  }
  return { traditionSlugs: balance, traditionNames, rows, layers, shown, issues, metrics: { diagrams, photos, photosHeldBack } };
}

function check(id: string, group: ParityGroup, label: string, severity: ParitySeverity, issues: ParityIssue[], metrics: Record<string, number> = {}): ParityCheck {
  return { id, group, label, severity, passed: issues.length === 0, issues: issues.slice(0, 200), metrics: { ...metrics, issueCount: issues.length } };
}

const sourceRefText = (sources: readonly SourceRef[]): string => JSON.stringify(sources.map((s) => [s.sourceId, s.title, s.locator, s.quote]));

function compareDoorToTemplate(door: DoorView, template: StageTemplate, view: DoorTraditionView, issues: { stages: ParityIssue[]; words: ParityIssue[]; models: ParityIssue[] }): void {
  const where = `${door.door}/${template.tradition}`;
  const expectedOrder = template.stages.map((s) => s.key);
  const shownOrder = view.stages.map((s) => s.key);
  if (expectedOrder.join("|") !== shownOrder.join("|")) issues.stages.push({ code: "stage_order", message: `${where} shows stages [${shownOrder.join(", ")}], the template has [${expectedOrder.join(", ")}].`, ref: where });
  for (const stage of template.stages) {
    const shown = view.stages.find((s) => s.key === stage.key);
    if (!shown) continue;
    const ref = `${where}/${stage.key}`;
    if (shown.number !== stage.number) issues.stages.push({ code: "stage_number", message: `${ref} is numbered ${shown.number}, the template says ${stage.number}.`, ref });
    if (shown.name !== stage.name) issues.words.push({ code: "stage_name", message: `${ref} name differs from the template.`, ref });
    if (shown.caption !== stage.caption.text) issues.words.push({ code: "caption_text", message: `${ref} caption differs from the template.`, ref });
    if (sourceRefText(shown.sources) !== sourceRefText(stage.caption.sources)) issues.words.push({ code: "source_refs", message: `${ref} sources differ from the template.`, ref });
    const shownKeys = shown.items.map((i) => i.key).join("|");
    if (shownKeys !== stage.items.map((i) => i.key).join("|")) issues.words.push({ code: "item_set", message: `${ref} shows items [${shownKeys}] that differ from the template.`, ref });
    for (const item of stage.items) {
      const seen = shown.items.find((i) => i.key === item.key);
      if (!seen) continue;
      if (seen.label !== item.label || seen.localName !== item.localName) issues.words.push({ code: "label_text", message: `${ref}/${item.key} label differs from the template.`, ref });
      if (seen.modelId !== item.modelId) issues.models.push({ code: "model_differs", message: `${ref}/${item.key} shows model ${seen.modelId}, the template says ${item.modelId}.`, ref });
    }
  }
}

function checkFiles(doors: readonly DoorView[], hashes: Readonly<Record<string, string | null>>): ParityIssue[] {
  const issues: ParityIssue[] = [];
  const hashesByAsset = new Map<string, Map<string, string>>();
  const note = (asset: string, door: string, file: string) => {
    const hash = hashes[file];
    if (!hash) {
      issues.push({ code: "file_missing", message: `${asset} in ${door} points at ${file}, which has no file hash.`, ref: asset });
      return;
    }
    const byDoor = hashesByAsset.get(asset) ?? new Map<string, string>();
    byDoor.set(door, hash);
    hashesByAsset.set(asset, byDoor);
  };
  for (const door of doors) {
    for (const tradition of door.traditions) {
      for (const stage of tradition.stages) note(`cloth:${stage.clothStateId}`, door.door, stage.clothFile);
      for (const product of tradition.products) note(`product:${product.id}`, door.door, product.file);
    }
  }
  for (const [asset, byDoor] of hashesByAsset) {
    if (new Set(byDoor.values()).size > 1) issues.push({ code: "file_hash_differs", message: `${asset} resolves to different files in the two doors.`, ref: asset });
    if (byDoor.size < doors.length) issues.push({ code: "file_one_door", message: `${asset} appears in one door only.`, ref: asset });
  }
  return issues;
}

function checkTemplates(templates: readonly StageTemplate[], traditions: readonly string[]): { missing: ParityIssue[]; models: ParityIssue[] } {
  const missing: ParityIssue[] = [];
  const models: ParityIssue[] = [];
  for (const key of traditions) if (!templates.some((t) => t.tradition === key)) missing.push({ code: "template_missing", message: `Tradition ${key} has no stage template.`, ref: key });
  const modelsByItem = new Map<string, Set<string>>();
  for (const template of templates) {
    for (const stage of template.stages) {
      if (!stage.caption.text.trim() || stage.caption.sources.length === 0) missing.push({ code: "caption_unsourced", message: `${template.tradition}/${stage.key} has no sourced caption.`, ref: stage.key });
      for (const item of stage.items) modelsByItem.set(item.key, (modelsByItem.get(item.key) ?? new Set()).add(item.modelId));
    }
  }
  for (const [item, ids] of modelsByItem) {
    if (ids.size !== 1) models.push({ code: "item_many_models", message: `${item} resolves to ${ids.size} model ids.`, ref: item });
    for (const id of ids) if (!ASSET_CATALOGUE.some((model) => model.id === id)) models.push({ code: "model_unknown", message: `${item} points at model ${id}, which is not in the shared catalogue.`, ref: item });
  }
  return { missing, models };
}

export function runParityChecks(input: ParityInput): ParityReport {
  const { study, snapshot, templates, doors, fileHashes } = input;
  const checks: ParityCheck[] = [];
  const configResult = studyConfigSchema.safeParse(study.config ?? {});
  const config = configResult.success ? configResult.data : null;
  const traditionSlugs = config?.traditionSlugs ?? [];

  const baseSnap: ParityIssue[] = [];
  if (!snapshot) baseSnap.push({ code: "snapshot_missing", message: "The study has no pinned content snapshot." });
  else {
    if (snapshot.kind !== "release") baseSnap.push({ code: "snapshot_not_release", message: `Snapshot ${snapshot.versionLabel} is a ${snapshot.kind} snapshot, not a release.`, ref: snapshot.id });
    if (snapshot.status !== "published") baseSnap.push({ code: "snapshot_not_published", message: `Snapshot ${snapshot.versionLabel} is ${snapshot.status}, not published.`, ref: snapshot.id });
    if (snapshot.isDemo && !study.isDemo) baseSnap.push({ code: "snapshot_demo", message: "A non-demo study cannot use a demo snapshot.", ref: snapshot.id });
  }
  checks.push(check("base.snapshot", "base", "Pinned snapshot is a published release snapshot", "critical", baseSnap));

  const cfgIssues: ParityIssue[] = [];
  if (!configResult.success) cfgIssues.push(...configResult.error.issues.slice(0, 20).map((i) => ({ code: "config_invalid", message: `${i.path.join(".")}: ${i.message}` })));
  if (config && traditionSlugs.length === 0) cfgIssues.push({ code: "no_traditions", message: "The study selects no traditions." });
  const interfaces = new Set(study.conditions.map((c) => c.interface));
  if (!interfaces.has("conventional_2d") || !interfaces.has("immersive_3d")) cfgIssues.push({ code: "conditions", message: "The study needs one conventional_2d and one immersive_3d condition." });
  checks.push(check("base.config", "base", "Study configuration is valid and has both doors", "critical", cfgIssues));

  const studyTemplates = templates.filter((t) => traditionSlugs.includes(t.tradition));
  const templateFindings = checkTemplates(studyTemplates, traditionSlugs);
  checks.push(check("t.template", "t", "Every study tradition has one template with sourced captions", "critical", templateFindings.missing, { templates: studyTemplates.length }));

  const reachable: ParityIssue[] = [];
  for (const door of LEARNING_CONDITIONS) {
    const view = doors.find((d) => d.door === door);
    if (!view) reachable.push({ code: "door_unavailable", message: `Door ${door} has no generated view, so it cannot be checked or reached.`, ref: door });
    else if (!view.reachable) reachable.push({ code: "door_unreachable", message: `Door ${door} is not reachable at its route.`, ref: door });
  }
  checks.push(check("t.reachable", "t", "Both doors are reachable", "critical", reachable, { doors: doors.length }));

  const compared = { stages: [] as ParityIssue[], words: [] as ParityIssue[], models: [...templateFindings.models] };
  for (const door of doors) {
    for (const template of studyTemplates) {
      const view = door.traditions.find((t) => t.tradition === template.tradition);
      if (!view) compared.stages.push({ code: "tradition_absent", message: `Door ${door.door} does not show ${template.tradition}.`, ref: template.tradition });
      else compareDoorToTemplate(door, template, view, compared);
    }
  }
  checks.push(check("t.stages", "t", "Same stages in the same order in both doors", "critical", compared.stages, { stages: studyTemplates.reduce((n, t) => n + t.stages.length, 0) }));
  checks.push(check("t.words", "t", "Captions, labels and source references are byte-identical to the one template", "critical", compared.words));
  checks.push(check("t.models", "t", "Every tool and material resolves to one model id", "critical", compared.models, { items: studyTemplates.reduce((n, t) => n + t.stages.reduce((m, s) => m + s.items.length, 0), 0) }));
  checks.push(check("t.files", "t", "Each cloth state and product image resolves to one file hash", "critical", checkFiles(doors, fileHashes), { hashedFiles: Object.keys(fileHashes).length }));

  const dIssues: ParityIssue[] = [];
  const [first, ...rest] = study.conditions;
  for (const c of study.conditions) {
    for (const k of Object.keys(c.config ?? {})) {
      if (CONDITION_OVERRIDE_KEYS.test(k)) dIssues.push({ code: "condition_override", message: `Condition ${c.code} overrides "${k}"; protocol settings must be study-wide.`, ref: c.id });
    }
  }
  for (const c of rest) {
    if (first && canonicalHash(c.config ?? {}) !== canonicalHash(first.config ?? {})) dIssues.push({ code: "condition_config_differs", message: `Condition ${c.code} has a different configuration from ${first.code}.`, ref: c.id });
  }
  for (const a of study.battery) {
    if (a.status !== "locked" && !study.isDemo) dIssues.push({ code: "assessment_unlocked", message: `Assessment ${a.code} v${a.version} (${a.phase}) is not locked.`, ref: a.assessmentId });
  }
  checks.push(check("d.protocol", "d", "Prompts, assessment battery and guidance are study-wide and identical", "critical", dIssues, { batteryItems: study.battery.length }));

  const jIssues: ParityIssue[] = [];
  if (config) {
    const steps = config.steps ?? DEFAULT_STEPS;
    for (const message of protocolIssues(config, steps)) jIssues.push({ code: "protocol_rule", message });
    const questionnaires = config.questionnaires ?? DEFAULT_QUESTIONNAIRES;
    for (const step of steps) {
      const spec = STEP_ASSESSMENTS[step];
      if (spec && !study.battery.some((a) => a.phase === spec.phase && a.kind === spec.kind)) {
        jIssues.push({ code: "step_without_assessment", message: `Step ${step} is in the journey but the battery has no ${spec.phase}-phase ${spec.kind} assessment.`, ref: step });
      }
      if (isQuestionnaireStep(step)) {
        for (const ref of questionnaires[QUESTIONNAIRE_CONFIG_KEY[step]]) {
          const r: { code: string; version?: number } = typeof ref === "string" ? { code: ref } : { code: ref.code, version: "version" in ref ? ref.version : undefined };
          const found = study.battery.some((a) => a.kind === "questionnaire" && a.code === r.code && (r.version === undefined || a.version === r.version));
          if (!found) jIssues.push({ code: "instrument_not_in_battery", message: `Instrument ${r.code}${r.version ? ` v${r.version}` : ""} of step ${step} is not in the battery.`, ref: step });
        }
      }
    }
    if (study.battery.some((a) => a.kind === "reconstruction" && a.phase === "pre")) jIssues.push({ code: "pre_concept_map", message: "The battery has a concept map before learning; the map is post only." });
  }
  checks.push(check("d.journey", "d", "Every step of the journey can run: the order rules hold and each step has its battery assessment", "critical", jIssues));

  const dWarn: ParityIssue[] = [];
  const phases = new Set(study.battery.map((a) => a.phase));
  if (!phases.has("pre") || !phases.has("post")) dWarn.push({ code: "battery_incomplete", message: "The assessment battery has no pre- and/or post-learning assessment." });
  if (config?.guidance.cueEnabled) dWarn.push({ code: "cue_both_doors", message: "Guidance cues are on: confirm both doors offer the same cue." });
  checks.push(check("d.review", "d", "Battery and guidance points that need researcher review", "warning", dWarn));

  const eIssues: ParityIssue[] = [];
  if (config) {
    const { mode, minutes, requireEveryStage } = config.exposure;
    if (mode !== "self_paced") eIssues.push({ code: "exposure_not_self_paced", message: "Learning must be self-paced with a cap (Concept Note rev2, section 9)." });
    if (!minutes) eIssues.push({ code: "exposure_no_cap", message: "Self-paced learning needs its cap in exposure.minutes." });
    if (!requireEveryStage) eIssues.push({ code: "exposure_stages_optional", message: "Every stage must be visited: set exposure.requireEveryStage." });
  } else eIssues.push({ code: "exposure_unknown", message: "Exposure settings cannot be read from an invalid configuration." });
  for (const c of study.conditions) if (c.config && "exposure" in c.config) eIssues.push({ code: "exposure_override", message: `Condition ${c.code} sets its own exposure.`, ref: c.id });
  const expected = config?.exposure.minutes ? config.exposure.minutes * 60 : null;
  for (const s of input.sessionBudgets ?? []) {
    if (s.learningBudgetSeconds !== null && expected !== null && s.learningBudgetSeconds !== expected) eIssues.push({ code: "session_budget", message: `A ${s.interface} session was given ${s.learningBudgetSeconds} s instead of ${expected} s.` });
  }
  checks.push(check("e.exposure", "e", "Self-paced with one cap for both doors and every stage required", "critical", eIssues, { capSeconds: expected ?? 0 }));

  const failed = checks.filter((c) => !c.passed);
  const criticalFailures = failed.filter((c) => c.severity === "critical").length;
  const sources = new Set(studyTemplates.flatMap((t) => t.stages.flatMap((s) => s.caption.sources.map((x) => x.sourceId))));
  return {
    schemaVersion: 2,
    generatorVersion: PARITY_GENERATOR_VERSION,
    studyId: study.id,
    studySlug: study.slug,
    protocolVersion: study.protocolVersion,
    snapshotId: snapshot?.id ?? null,
    snapshotLabel: snapshot?.versionLabel ?? null,
    manifestId: study.manifestId,
    inputSha256: parityInputHash(study),
    passed: criticalFailures === 0,
    criticalFailures,
    warnings: failed.length - criticalFailures,
    contentSet: {
      stages: studyTemplates.reduce((n, t) => n + t.stages.length, 0),
      items: studyTemplates.reduce((n, t) => n + t.stages.reduce((m, s) => m + s.items.length, 0), 0),
      products: studyTemplates.reduce((n, t) => n + t.products.length, 0),
      sources: sources.size,
    },
    checks,
  };
}

export function parityInputHash(study: ParityStudyInput): string {
  return canonicalHash({
    protocolVersion: study.protocolVersion,
    design: study.design,
    config: study.config ?? {},
    snapshotId: study.snapshotId,
    manifestId: study.manifestId,
    conditions: [...study.conditions].sort((a, b) => (a.code < b.code ? -1 : 1)).map((c) => ({ code: c.code, interface: c.interface, config: c.config ?? {} })),
    battery: [...study.battery].sort((a, b) => (a.phase + a.position < b.phase + b.position ? -1 : 1)).map((a) => ({ id: a.assessmentId, phase: a.phase, position: a.position, required: a.required })),
  });
}
