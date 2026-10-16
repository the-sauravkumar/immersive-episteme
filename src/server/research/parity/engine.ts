/**
 * Condition-equivalence (parity) engine. Pure: no I/O, deterministic, unit-testable.
 *
 * Given a study configuration, its pinned snapshot payload and its pinned spatial manifest, it
 * produces a machine-readable report of the checks below. A study may only be activated when
 * the report passes (no failed CRITICAL check); see ../studies.ts `activateStudy`.
 *
 *   base  the pinned snapshot is a published release snapshot; the manifest was compiled from
 *         it for exactly the study's traditions, validated and published
 *   (a)   both conditions draw the same concept ids, claims, explanations, media and
 *         comparisons from the same snapshot; figures are balanced across the study traditions
 *         (`a.figures`, DESIGN.md 12.3 rule 9: equal counts per section, at most one per concept,
 *         every photograph licence-valid and able to fill the study lightbox cap)
 *   (b)   every concept reachable in 2D has an exhibit in the manifest and vice versa
 *   (c)   citation coverage is identical
 *   (d)   learning prompts, assessments and guidance policy are identical across conditions
 *   (e)   the exposure budget is equal (fixed, server-timed, same for both conditions)
 *   (f)   no condition-specific extra instructional text
 *
 * "Reachable in 2D" is the study content set: `studyContentSet()`, i.e. the content-selection
 * rule `selectScope` of the spatial compiler applied to the study's traditions. Both conditions
 * must expose exactly this set; the 2D condition reads it through the read model, the 3D
 * condition through the manifest. The 3D side is checked against the manifest that will be
 * served; the 2D side has no compiled artefact (pages render the read model), so its
 * discipline (claims-only text from the snapshot) is enforced by the 2D pages themselves.
 *
 * Text check (f): every learner-visible string in the manifest (keys matching TEXT_KEY_RE,
 * outside `trace`, `rationale` and `encodes`, which are research documentation and never
 * rendered) must decompose into snapshot strings (concept titles, summaries, claims, relationship
 * explanations and conditions, tradition names, category and relationship-type labels), the rule
 * set's way-finding labels, and a closed lexicon of interface words (CHROME_LEXICON). Any other
 * word is condition-specific extra text and fails the check.
 */
import { knowledgeBundleSchema, type KnowledgeBundle } from "@/features/knowledge/contracts";
import { balanceDiagramSets, buildStructureDiagrams } from "@/features/knowledge/read/diagrams";
import { photoGateOpen } from "@/features/knowledge/read/view";
import { compareTraditionSlugs, exposureLayerOf, STUDY_TRADITION_SLUGS, type KnowledgeLayerId } from "@/features/learning/labels";
import { EPISTEMIC_SECTIONS, sectionOfType } from "@/features/learning-2d/template";
import { displayLongEdge, licenceValidOn, STUDY_FIGURE_CAP } from "@/features/media/contracts";
import { canonicalHash } from "@/features/spatial/compiler/canonical";
import { selectScope } from "@/features/spatial/compiler/graph";
import { studyConfigSchema } from "@/features/study/contracts";
import { DEFAULT_QUESTIONNAIRES, DEFAULT_STEPS, isQuestionnaireStep, protocolIssues, QUESTIONNAIRE_CONFIG_KEY, STEP_ASSESSMENTS } from "@/server/study/config";

export const PARITY_GENERATOR_VERSION = "parity/1.0.0";

export type ParitySeverity = "critical" | "warning";
export type ParityGroup = "base" | "a" | "b" | "c" | "d" | "e" | "f";

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
  schemaVersion: 1;
  generatorVersion: string;
  studyId: string;
  studySlug: string;
  protocolVersion: string;
  snapshotId: string | null;
  snapshotLabel: string | null;
  manifestId: string | null;
  manifestHash: string | null;
  /** canonical sha256 of the study inputs the report judged (config, conditions, battery, pins). */
  inputSha256: string;
  passed: boolean;
  criticalFailures: number;
  warnings: number;
  contentSet: { concepts: number; comparisons: number; relationships: number; sources: number; claims: number };
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
  /** `kind` is assessments.kind (pretest, posttest, transfer, reconstruction, questionnaire, ...). */
  battery: { assessmentId: string; code: string; version: number; kind: string; phase: string; position: number; status: string; required: boolean }[];
}

export interface ParitySnapshotInput {
  id: string;
  versionLabel: string;
  status: string;
  kind: string;
  isDemo: boolean;
  payload: unknown;
}

export interface ParityManifestInput {
  id: string;
  snapshotId: string;
  status: string;
  traditions: string[];
  manifestHash: string;
  ruleSetConfig: unknown;
  validationPassed: boolean | null;
  manifest: unknown;
}

/**
 * One `illustration` link of a concept with the licence governance of its asset (media schema,
 * migration 0016). The loader passes every such link of the snapshot's concepts; the engine decides
 * which ones a learner would see.
 */
export interface ParityFigureAsset {
  assetId: string;
  conceptId: string;
  role: string;
  /** asset_links.position: the anchor claim index. */
  position: number;
  verificationState: string;
  isDemo: boolean;
  width: number | null;
  height: number | null;
  maxPixels: number | null;
  licenceExpiresOn: string | null;
  /** The figure's printed metadata (9.9, R-H5): credit line, caption (link override or asset caption) and alt text. */
  credit: string | null;
  caption: string | null;
  altText: string | null;
}

export interface ParityInput {
  study: ParityStudyInput;
  snapshot: ParitySnapshotInput | null;
  manifest: ParityManifestInput | null;
  /** Runtime evidence: learning budgets already stamped on sessions, per condition interface. */
  sessionBudgets?: { interface: string; learningBudgetSeconds: number | null }[];
  /** Illustration links of the snapshot's concepts with their asset governance (photographs). */
  figureAssets?: ParityFigureAsset[];
  /** The day (YYYY-MM-DD) licences are judged on; without it, expiry is not checked. */
  asOf?: string;
}

/** Learner-visible text keys inside a manifest element. */
const TEXT_KEY_RE = /^(label|text|explanation|title|caption|description|prompt|instruction|instructions|body|summary|message|hint|tooltip|narration|announce)$/i;
/** Research documentation inside manifest elements: never rendered to learners. */
const NON_RENDERED_KEYS = new Set(["trace", "rationale", "encodes", "id", "ruleId"]);

/**
 * Interface words the spatial compiler combines with snapshot strings, taken from its label
 * templates (src/features/spatial/compiler/compile.ts: "Inspect <title>", "Entering <tradition>",
 * "Why: <cause> -> <effect>", "Why it leads to <title>", "Explains <title>", "Part of" /
 * "Includes" / "Related:", "Before <stage>: <condition>", "Sequence: <title> (n stages)",
 * "Start of sequence: <title>", "Compare <a> and <b>", "Compare with", "Compared: <title>",
 * door labels "<room> / <room>"). They name a link or a place; none states craft knowledge.
 * Adding a word here is a research decision: it must be recorded in the module record.
 */
export const CHROME_LEXICON: ReadonlySet<string> = new Set([
  "inspect",
  "entering",
  "entrance",
  "why",
  "it",
  "leads",
  "to",
  "explains",
  "part",
  "of",
  "includes",
  "related",
  "before",
  "sequence",
  "stages",
  "start",
  "compare",
  "compared",
  "with",
  "and",
]);

/** Exposure / prompt / guidance / assessment keys that must never be set per condition. */
const CONDITION_OVERRIDE_KEYS = /^(exposure|guidance|assessments?|battery|prompts?|tasks?|instructions?|search(Enabled)?|minimap|cue(Enabled)?|traditions?|traditionSlugs|contentSets)$/i;

type Concept = KnowledgeBundle["concepts"][number];

/** The study content set: concepts and relationships both conditions must expose. */
export function studyContentSet(bundle: KnowledgeBundle, traditionSlugs: readonly string[], ruleSetConfig: unknown) {
  const minTraditions = minCompareTraditions(ruleSetConfig);
  const scope = selectScope(bundle, traditionSlugs, minTraditions);
  const conceptIds = new Set(scope.concepts.map((c) => c.id));
  const comparisonIds = new Set(scope.concepts.filter((c) => c.type === "comparison").map((c) => c.id));
  const relationshipIds = new Set(scope.relationships.map((r) => r.id));
  return { conceptIds, comparisonIds, relationshipIds, missingTraditionSlugs: scope.missingTraditionSlugs, minTraditions };
}

function minCompareTraditions(ruleSetConfig: unknown): number {
  const rules = (ruleSetConfig as { rules?: { emit?: { params?: Record<string, unknown> } }[] } | null)?.rules ?? [];
  for (const r of rules) {
    const p = r?.emit?.params;
    if (p && p.strategy === "comparison-zone" && typeof p.minTraditions === "number") return p.minTraditions;
  }
  return 2;
}

/** Fixed way-finding names of the compiler layout (layout.ts / compile.ts room labels). */
const WAYFINDING_PHRASES = ["Comparison hall", "Entrance lobby", "Entrance"];

/** All string values under `label` / `*Label` keys in the rule-set config (way-finding labels). */
function ruleSetLabels(ruleSetConfig: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string | null) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === "string" && key && /label$/i.test(key)) out.push(v);
  };
  walk(ruleSetConfig, null);
  return out;
}

interface ManifestElementLike {
  id?: unknown;
  kind?: unknown;
  conceptId?: unknown;
  assetRefs?: unknown;
  layers?: unknown;
  effect?: unknown;
  [k: string]: unknown;
}

function asElements(manifest: unknown): ManifestElementLike[] {
  const els = (manifest as { elements?: unknown } | null)?.elements;
  return Array.isArray(els) ? (els.filter((e) => e && typeof e === "object") as ManifestElementLike[]) : [];
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Every concept / relationship id a manifest element references (any depth, any key). */
function referencedIds(el: unknown, kind: "concept" | "relationship"): string[] {
  const out: string[] = [];
  const single = kind === "concept" ? /^(conceptId)$/ : /^(relationshipId)$/;
  const plural = kind === "concept" ? /^(conceptIds)$/ : /^(relationshipIds)$/;
  const walk = (v: unknown, key: string | null) => {
    if (Array.isArray(v)) {
      if (key && plural.test(key)) for (const x of v) if (isUuid(x)) out.push(x);
      v.forEach((x) => walk(x, null));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    } else if (key && single.test(key) && isUuid(v)) out.push(v);
  };
  walk(el, null);
  return out;
}

/** Learner-visible strings of one element with their JSON path. */
export function learnerTexts(el: unknown): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (v: unknown, path: string, key: string | null) => {
    if (key && NON_RENDERED_KEYS.has(key)) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, k);
    else if (typeof v === "string" && key && TEXT_KEY_RE.test(key) && v.trim()) out.push({ path, text: v });
  };
  walk(el, "", null);
  return out;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Words of `text` left after removing every allowed phrase (case-insensitive, whole words only,
 * longest phrase first), numbers and interface words (CHROME_LEXICON).
 */
export function textResidue(text: string, phrasesByLength: readonly string[]): string[] {
  let s = text.toLowerCase();
  for (const phrase of phrasesByLength) {
    const p = phrase.toLowerCase();
    if (!s.includes(p)) continue;
    let out = "";
    let from = 0;
    for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) {
      if (i < from) continue;
      const before = i === 0 ? "" : s[i - 1]!;
      const after = s[i + p.length] ?? "";
      if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) continue;
      out += `${s.slice(from, i)}\u0000`;
      from = i + p.length;
    }
    s = out + s.slice(from);
  }
  return s.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0 && !/^\d+$/.test(w) && !CHROME_LEXICON.has(w));
}

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

export interface FigureBalance {
  /** The traditions whose counts must be equal: the study traditions in scope, else every one in scope. */
  traditionSlugs: string[];
  traditionNames: Record<string, string>;
  rows: FigureSectionRow[];
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
 * the layer of a section is `exposureLayerOf` its concept types, so section balance also balances
 * every layer and the per-tradition total.
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
  const bump = (section: string, slug: string) => {
    const row = counts.get(section) ?? new Map<string, number>();
    row.set(slug, (row.get(slug) ?? 0) + 1);
    counts.set(section, row);
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
      bump(diagram.section, slug);
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
    bump(section, slug);
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
  return { traditionSlugs: balance, traditionNames, rows, shown, issues, metrics: { diagrams, photos, photosHeldBack } };
}

function check(id: string, group: ParityGroup, label: string, severity: ParitySeverity, issues: ParityIssue[], metrics: Record<string, number> = {}): ParityCheck {
  return { id, group, label, severity, passed: issues.length === 0, issues: issues.slice(0, 200), metrics: { ...metrics, issueCount: issues.length } };
}

const setDiff = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>) => [...a].filter((x) => !b.has(x));
const sortedEq = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

export function runParityChecks(input: ParityInput): ParityReport {
  const { study, snapshot, manifest } = input;
  const checks: ParityCheck[] = [];
  const hasImmersive = study.conditions.some((c) => c.interface === "immersive_3d");
  const configResult = studyConfigSchema.safeParse(study.config ?? {});
  const config = configResult.success ? configResult.data : null;
  const traditionSlugs = config?.traditionSlugs ?? [];

  // ---- base ------------------------------------------------------------------------------
  const baseSnap: ParityIssue[] = [];
  if (!snapshot) baseSnap.push({ code: "snapshot_missing", message: "The study has no pinned content snapshot." });
  else {
    if (snapshot.kind !== "release") baseSnap.push({ code: "snapshot_not_release", message: `Snapshot ${snapshot.versionLabel} is a ${snapshot.kind} snapshot, not a release.`, ref: snapshot.id });
    if (snapshot.status !== "published") baseSnap.push({ code: "snapshot_not_published", message: `Snapshot ${snapshot.versionLabel} is ${snapshot.status}, not published.`, ref: snapshot.id });
    if (snapshot.isDemo && !study.isDemo) baseSnap.push({ code: "snapshot_demo", message: "A non-demo study cannot use a demo snapshot.", ref: snapshot.id });
  }
  checks.push(check("base.snapshot", "base", "Pinned snapshot is a published release snapshot", "critical", baseSnap));

  let bundle: KnowledgeBundle | null = null;
  const payloadIssues: ParityIssue[] = [];
  if (snapshot) {
    const parsed = knowledgeBundleSchema.safeParse(snapshot.payload);
    if (parsed.success) bundle = parsed.data;
    else payloadIssues.push(...parsed.error.issues.slice(0, 20).map((i) => ({ code: "payload_invalid", message: `${i.path.join(".")}: ${i.message}` })));
    if (bundle && bundle.versionLabel !== snapshot.versionLabel) payloadIssues.push({ code: "payload_label", message: "Payload version label differs from the snapshot row." });
  } else payloadIssues.push({ code: "payload_missing", message: "No snapshot payload to check." });
  checks.push(check("base.payload", "base", "Snapshot payload is a valid knowledge bundle", "critical", payloadIssues));

  const cfgIssues: ParityIssue[] = [];
  if (!configResult.success) cfgIssues.push(...configResult.error.issues.slice(0, 20).map((i) => ({ code: "config_invalid", message: `${i.path.join(".")}: ${i.message}` })));
  if (config && traditionSlugs.length === 0) cfgIssues.push({ code: "no_traditions", message: "The study selects no traditions." });
  const interfaces = new Set(study.conditions.map((c) => c.interface));
  if (!interfaces.has("conventional_2d") || !interfaces.has("immersive_3d")) cfgIssues.push({ code: "conditions", message: "The study needs one conventional_2d and one immersive_3d condition." });
  checks.push(check("base.config", "base", "Study configuration is valid and has both conditions", "critical", cfgIssues));

  const manIssues: ParityIssue[] = [];
  const elements = manifest ? asElements(manifest.manifest) : [];
  if (hasImmersive && !manifest) manIssues.push({ code: "manifest_missing", message: "The study has an immersive condition but no pinned spatial manifest." });
  if (manifest) {
    if (snapshot && manifest.snapshotId !== snapshot.id) manIssues.push({ code: "manifest_snapshot", message: "The manifest was compiled from a different snapshot than the study's.", ref: manifest.id });
    const mv = (manifest.manifest as { snapshotVersion?: unknown } | null)?.snapshotVersion;
    if (snapshot && mv !== snapshot.versionLabel) manIssues.push({ code: "manifest_snapshot_label", message: `Manifest snapshotVersion ${String(mv)} differs from ${snapshot.versionLabel}.`, ref: manifest.id });
    if (manifest.status !== "published") manIssues.push({ code: "manifest_not_published", message: `Manifest status is ${manifest.status}, not published.`, ref: manifest.id });
    if (manifest.validationPassed !== true) manIssues.push({ code: "manifest_invalid", message: "The compiler validation of the manifest did not pass.", ref: manifest.id });
    if (!sortedEq(manifest.traditions, traditionSlugs)) manIssues.push({ code: "manifest_traditions", message: `Manifest traditions [${[...manifest.traditions].sort().join(", ")}] differ from the study traditions [${[...traditionSlugs].sort().join(", ")}].`, ref: manifest.id });
    if (elements.length === 0) manIssues.push({ code: "manifest_empty", message: "The manifest has no elements.", ref: manifest.id });
  }
  checks.push(check("base.manifest", "base", "Manifest compiled from the study snapshot for the study traditions, validated and published", "critical", manIssues, { elements: elements.length }));

  // ---- content set -------------------------------------------------------------------------
  const contentSet = bundle ? studyContentSet(bundle, traditionSlugs, manifest?.ruleSetConfig ?? null) : null;
  const conceptById = new Map<string, Concept>((bundle?.concepts ?? []).map((c) => [c.id, c]));
  const relById = new Map((bundle?.relationships ?? []).map((r) => [r.id, r]));
  const exhibitConcepts = new Map<string, string[]>(); // conceptId -> element ids
  for (const el of elements) {
    if ((el.kind === "exhibit" || el.kind === "station") && typeof el.conceptId === "string") {
      exhibitConcepts.set(el.conceptId, [...(exhibitConcepts.get(el.conceptId) ?? []), String(el.id)]);
    }
  }
  const exhibitSet = new Set(exhibitConcepts.keys());

  // ---- (a) same source ----------------------------------------------------------------------
  const aIds: ParityIssue[] = [];
  const aRels: ParityIssue[] = [];
  if (bundle) {
    for (const el of elements) {
      for (const id of new Set(referencedIds(el, "concept"))) {
        if (!conceptById.has(id)) aIds.push({ code: "concept_not_in_snapshot", message: `Element ${String(el.id)} references concept ${id}, which is not in the snapshot.`, ref: String(el.id) });
      }
      for (const id of new Set(referencedIds(el, "relationship"))) {
        if (!relById.has(id)) aRels.push({ code: "relationship_not_in_snapshot", message: `Element ${String(el.id)} references relationship ${id}, which is not in the snapshot.`, ref: String(el.id) });
      }
      const eff = el.effect as { explanation?: unknown } | undefined;
      const relIds = referencedIds(el, "relationship");
      if (eff && typeof eff.explanation === "string") {
        const ok = relIds.some((rid) => relById.get(rid)?.explanation === eff.explanation);
        if (!ok) aRels.push({ code: "explanation_mismatch", message: `Element ${String(el.id)} shows an explanation that is not the snapshot explanation of its relationship.`, ref: String(el.id) });
      }
    }
  }
  checks.push(check("a.concepts", "a", "Manifest concept ids all come from the study snapshot", "critical", aIds));
  checks.push(check("a.relationships", "a", "Manifest relationships and explanations are the snapshot's, verbatim", "critical", aRels));

  const aMedia: ParityIssue[] = [];
  let mediaManifest = 0;
  let mediaSnapshot = 0;
  if (bundle && contentSet) {
    for (const el of elements) {
      if (typeof el.conceptId !== "string" || !Array.isArray(el.assetRefs)) continue;
      const shown = new Set(
        (el.assetRefs as { assetId?: unknown; missing?: unknown }[]).filter((r) => r && !r.missing && typeof r.assetId === "string").map((r) => String(r.assetId)),
      );
      const twoD = new Set(conceptById.get(el.conceptId)?.assetIds ?? []);
      mediaManifest += shown.size;
      const only3d = setDiff(shown, twoD);
      const only2d = setDiff(twoD, shown);
      if (only3d.length) aMedia.push({ code: "media_3d_only", message: `Exhibit ${String(el.id)} shows ${only3d.length} image(s) that the snapshot does not give the 2D condition (${only3d.join(", ")}).`, ref: String(el.id) });
      if (only2d.length) aMedia.push({ code: "media_2d_only", message: `Exhibit ${String(el.id)} lacks ${only2d.length} snapshot image(s) the 2D condition shows (${only2d.join(", ")}).`, ref: String(el.id) });
    }
    for (const id of contentSet.conceptIds) mediaSnapshot += conceptById.get(id)?.assetIds.length ?? 0;
  }
  checks.push(check("a.media", "a", "Both conditions show the same media per concept", "critical", aMedia, { manifestImages: mediaManifest, snapshotImages: mediaSnapshot }));

  const aCmp: ParityIssue[] = [];
  if (bundle && contentSet) {
    const cmp3d = new Set([...exhibitSet].filter((id) => conceptById.get(id)?.type === "comparison"));
    for (const id of setDiff(contentSet.comparisonIds, cmp3d)) aCmp.push({ code: "comparison_missing_3d", message: `Comparison ${conceptById.get(id)?.key ?? id} is in the 2D content set but has no exhibit.`, ref: id });
    for (const id of setDiff(cmp3d, contentSet.comparisonIds)) aCmp.push({ code: "comparison_extra_3d", message: `Comparison ${conceptById.get(id)?.key ?? id} is exhibited but not in the 2D content set.`, ref: id });
  }
  checks.push(check("a.comparisons", "a", "Both conditions present the same comparisons", "critical", aCmp, { comparisons: contentSet?.comparisonIds.size ?? 0 }));

  const claimsOf = (ids: Iterable<string>) => [...ids].reduce((n, id) => n + (conceptById.get(id)?.claims.length ?? 0), 0);
  const claims2d = contentSet ? claimsOf(contentSet.conceptIds) : 0;
  const claims3d = claimsOf([...exhibitSet].filter((id) => conceptById.has(id)));
  const aClaims: ParityIssue[] = claims2d === claims3d ? [] : [{ code: "claims_differ", message: `The 2D content set carries ${claims2d} claims, the exhibited concepts ${claims3d}.` }];
  checks.push(check("a.claims", "a", "Both conditions carry the same claims (read by concept id from the snapshot)", "critical", aClaims, { claims2d, claims3d }));

  // Figures: the per-section balance across the study traditions (12.3 rule 9). Critical, so an
  // unbalanced study bundle cannot be activated (11.10 "blocks publication to a study").
  const fig = bundle && config ? figureBalance(bundle, traditionSlugs, { structureDiagrams: config.figures.structureDiagrams, photos: config.figures.photos, figureAssets: input.figureAssets, asOf: input.asOf ?? null }) : null;
  checks.push(
    check("a.figures", "a", "Figures are balanced per section across the study traditions (at most one per concept, licence-valid, at the lightbox cap)", "critical", fig?.issues ?? [], {
      diagrams: fig?.metrics.diagrams ?? 0,
      photos: fig?.metrics.photos ?? 0,
      photosHeldBack: fig?.metrics.photosHeldBack ?? 0,
    }),
  );

  // ---- (b) coverage ----------------------------------------------------------------------
  const bIssues: ParityIssue[] = [];
  if (contentSet) {
    for (const s of contentSet.missingTraditionSlugs) bIssues.push({ code: "tradition_missing", message: `Tradition ${s} is not in the snapshot.` });
    for (const id of setDiff(contentSet.conceptIds, exhibitSet)) bIssues.push({ code: "missing_exhibit", message: `Concept ${conceptById.get(id)?.key ?? id} is reachable in 2D but has no exhibit in the manifest.`, ref: id });
    for (const id of setDiff(exhibitSet, contentSet.conceptIds)) bIssues.push({ code: "extra_exhibit", message: `Exhibit for ${conceptById.get(id)?.key ?? id} is not part of the 2D content set.`, ref: id });
  } else if (manifest) bIssues.push({ code: "no_content_set", message: "The content set could not be computed (invalid snapshot payload)." });
  checks.push(check("b.coverage", "b", "Every concept reachable in 2D has an exhibit, and no exhibit is extra", "critical", bIssues, { concepts2d: contentSet?.conceptIds.size ?? 0, exhibits3d: exhibitSet.size }));

  const bRel: ParityIssue[] = [];
  if (contentSet && manifest) {
    const trace = (manifest.manifest as { traceability?: { relationships?: { relationshipId: string; status: string; reason: string | null }[] } } | null)?.traceability?.relationships ?? [];
    for (const r of trace) {
      if (r.status !== "encoded" && contentSet.relationshipIds.has(r.relationshipId)) {
        bRel.push({ code: "relationship_unencoded", message: `Relationship ${r.relationshipId} has no spatial encoding (${r.reason ?? "no reason"}); the 3D panel must still list it as the 2D page does.`, ref: r.relationshipId });
      }
    }
  }
  checks.push(check("b.relationships", "b", "Relationships of the content set are spatially encoded (informational)", "warning", bRel, { relationships2d: contentSet?.relationshipIds.size ?? 0 }));

  // ---- (c) citations ---------------------------------------------------------------------
  const citePairs = (ids: Iterable<string>) => {
    const pairs = new Set<string>();
    const sources = new Set<string>();
    for (const id of ids) {
      const c = conceptById.get(id);
      c?.claims.forEach((cl, i) =>
        cl.sources.forEach((s) => {
          pairs.add(`${id}#${i}#${s.sourceId}`);
          sources.add(s.sourceId);
        }),
      );
    }
    return { pairs, sources };
  };
  const c2d = citePairs(contentSet?.conceptIds ?? []);
  const c3d = citePairs([...exhibitSet].filter((id) => conceptById.has(id)));
  const cIssues: ParityIssue[] = [];
  const only2dSources = setDiff(c2d.sources, c3d.sources);
  const only3dSources = setDiff(c3d.sources, c2d.sources);
  if (only2dSources.length) cIssues.push({ code: "sources_2d_only", message: `${only2dSources.length} cited source(s) are reachable only in 2D.` });
  if (only3dSources.length) cIssues.push({ code: "sources_3d_only", message: `${only3dSources.length} cited source(s) are reachable only in 3D.` });
  const pairDiff = setDiff(c2d.pairs, c3d.pairs).length + setDiff(c3d.pairs, c2d.pairs).length;
  if (pairDiff && !only2dSources.length && !only3dSources.length) cIssues.push({ code: "citations_differ", message: `${pairDiff} claim citation(s) differ between the conditions.` });
  checks.push(check("c.citations", "c", "Citation coverage is identical (claim-to-source pairs and sources)", "critical", cIssues, { citations2d: c2d.pairs.size, citations3d: c3d.pairs.size, sources2d: c2d.sources.size, sources3d: c3d.sources.size }));

  // ---- (d) prompts, assessments, guidance ------------------------------------------------
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
  const phases = new Set(study.battery.map((a) => a.phase));
  checks.push(check("d.protocol", "d", "Learning prompts, assessment battery and guidance policy are study-wide and identical", "critical", dIssues, { batteryItems: study.battery.length }));

  // The journey the engine will run: its order rules (what the engine refuses at enrolment) and
  // one battery assessment for every test step and every questionnaire instrument. Without this a
  // study activated and then refused every enrolment, or skipped a configured test step silently
  // as "empty" (final review study-05, study-10).
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
  }
  checks.push(check("d.journey", "d", "Every step of the journey can run: the order rules hold and each test step and questionnaire has its battery assessment", "critical", jIssues));

  const dWarn: ParityIssue[] = [];
  if (!phases.has("pre") || !phases.has("post")) dWarn.push({ code: "battery_incomplete", message: "The assessment battery has no pre- and/or post-learning assessment." });
  const cues = elements.filter((e) => e.kind === "cue").length;
  if (config && cues > 0 && !config.guidance.cueEnabled) {
    dWarn.push({ code: "cues_suppressed", message: `The manifest holds ${cues} explanatory cue element(s); guidance cues are off for this study, so the 3D runtime must not show them.` });
  }
  if (config && config.guidance.cueEnabled) {
    dWarn.push({ code: "cue_2d_equivalent", message: "Guidance cues are on: confirm the 2D condition offers the equivalent cue (Q-R5)." });
  }
  checks.push(check("d.review", "d", "Battery and guidance points that need researcher review", "warning", dWarn, { cueElements: cues }));

  // ---- (e) exposure ----------------------------------------------------------------------
  const eIssues: ParityIssue[] = [];
  if (config) {
    if (config.exposure.mode !== "fixed_time") eIssues.push({ code: "exposure_not_fixed", message: "Exposure is self-paced; equal exposure (DR-015) needs exposure.mode = fixed_time with minutes." });
    else if (!config.exposure.minutes) eIssues.push({ code: "exposure_minutes", message: "A fixed_time study needs exposure.minutes." });
    // Early finish lets time on task vary by participant (and possibly by condition: 3D navigation
    // overhead counts toward the budget), so exposure is no longer held constant (D5, DR-015;
    // final review scoring-09). Critical: activation is refused until it is switched off.
    if (config.exposure.mode === "fixed_time" && config.exposure.allowEarlyFinish) {
      eIssues.push({ code: "exposure_early_finish", message: "Early finish is allowed, so time on task is not held constant (D5, DR-015); set allowEarlyFinish = false." });
    }
  } else eIssues.push({ code: "exposure_unknown", message: "Exposure settings cannot be read from an invalid configuration." });
  for (const c of study.conditions) if (c.config && "exposure" in c.config) eIssues.push({ code: "exposure_override", message: `Condition ${c.code} sets its own exposure.`, ref: c.id });
  const budgets = new Map<string, Set<number | null>>();
  for (const s of input.sessionBudgets ?? []) budgets.set(s.interface, (budgets.get(s.interface) ?? new Set()).add(s.learningBudgetSeconds));
  const expected = config?.exposure.mode === "fixed_time" && config.exposure.minutes ? config.exposure.minutes * 60 : null;
  for (const [iface, set] of budgets) {
    for (const b of set) if (b !== null && expected !== null && b !== expected) eIssues.push({ code: "session_budget", message: `A ${iface} session was given ${b} s instead of ${expected} s.` });
  }
  checks.push(check("e.exposure", "e", "The exposure budget is fixed and equal for both conditions", "critical", eIssues, { budgetSeconds: expected ?? 0 }));

  // ---- (f) extra instructional text ------------------------------------------------------
  const fIssues: ParityIssue[] = [];
  let textCount = 0;
  if (bundle && manifest) {
    const phrases = new Set<string>();
    const add = (s: string | null | undefined) => {
      if (s && s.trim().length >= 2) phrases.add(s.trim());
    };
    bundle.concepts.forEach((c) => {
      add(c.title);
      add(c.summary);
      c.localTerms.forEach(add);
      c.claims.forEach((cl) => add(cl.text));
    });
    bundle.relationships.forEach((r) => {
      add(r.explanation);
      add(r.conditions);
    });
    bundle.traditions.forEach((t) => {
      add(t.name);
      t.altNames.forEach(add);
    });
    bundle.categories.forEach((c) => add(c.label));
    bundle.relationshipTypes.forEach((t) => {
      add(t.label);
      add(t.inverseLabel);
    });
    ruleSetLabels(manifest.ruleSetConfig).forEach(add);
    WAYFINDING_PHRASES.forEach(add);
    const ordered = [...phrases].sort((a, b) => b.length - a.length);
    for (const el of elements) {
      for (const { path, text } of learnerTexts(el)) {
        textCount++;
        const residue = textResidue(text, ordered);
        if (residue.length) {
          fIssues.push({ code: "extra_text", message: `Element ${String(el.id)}${path} shows text not drawn from the snapshot: "${text.slice(0, 160)}" (unexplained words: ${[...new Set(residue)].slice(0, 12).join(", ")}).`, ref: String(el.id) });
        }
      }
    }
  }
  for (const c of study.conditions) {
    const texts = learnerTexts(c.config ?? {});
    for (const t of texts) fIssues.push({ code: "condition_text", message: `Condition ${c.code} carries its own learner text at ${t.path}.`, ref: c.id });
  }
  checks.push(check("f.text", "f", "No condition-specific extra instructional text", "critical", fIssues, { learnerTexts3d: textCount }));

  const failed = checks.filter((c) => !c.passed);
  const criticalFailures = failed.filter((c) => c.severity === "critical").length;
  return {
    schemaVersion: 1,
    generatorVersion: PARITY_GENERATOR_VERSION,
    studyId: study.id,
    studySlug: study.slug,
    protocolVersion: study.protocolVersion,
    snapshotId: snapshot?.id ?? null,
    snapshotLabel: snapshot?.versionLabel ?? null,
    manifestId: manifest?.id ?? null,
    manifestHash: manifest?.manifestHash ?? null,
    inputSha256: parityInputHash(study),
    passed: criticalFailures === 0,
    criticalFailures,
    warnings: failed.length - criticalFailures,
    contentSet: {
      concepts: contentSet?.conceptIds.size ?? 0,
      comparisons: contentSet?.comparisonIds.size ?? 0,
      relationships: contentSet?.relationshipIds.size ?? 0,
      sources: c2d.sources.size,
      claims: claims2d,
    },
    checks,
  };
}

/** Hash of everything about a study that the report judges; a report is stale when it changes. */
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
