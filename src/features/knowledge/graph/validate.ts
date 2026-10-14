/**
 * Knowledge-graph validators (master directive §6.4–6.5, §10.6). Each validator is a pure
 * function of a `ValidationContext` and returns issues with stable codes (rules.ts). The
 * rule catalogue is documented in docs/architecture/knowledge-graph-validation.md.
 */
import { ACCEPTED_STATES, type ConceptType, type VerificationState } from "@/lib/validation/enums";
import { DEMO_TITLE_PREFIX } from "@/lib/validation/primitives";

import { findCycles, type DirectedEdge } from "./cycles";
import {
  DEFAULT_REGISTRY,
  DEPENDENCY_TYPES,
  DIRECT_CAUSAL_TYPE,
  SEMANTIC_WORDING,
  SEQUENCE_TYPE,
  isMarkedLoop,
  type RelationshipTypeRegistry,
} from "./registry";
import { RULES, type RuleDefinition } from "./rules";
import { manifestUrlKey, type SourceManifestEntry } from "./source-manifest";
import { normaliseTitle, trigramSimilarity } from "./similarity";
import type {
  GraphConcept,
  GraphRelationship,
  GraphSource,
  IntegrityIssue,
  KnowledgeGraphModel,
} from "./types";

export interface ValidationOptions {
  registry?: RelationshipTypeRegistry;
  /** When given, every cited source URL must appear in it (KG409). */
  sourceManifest?: readonly SourceManifestEntry[] | null;
  /** Trigram similarity at or above which two titles are near-duplicates (KG501). */
  nearDuplicateThreshold?: number;
  /** Depth targets per tradition (FORMAT.md conventions); `false` disables KG802. */
  coverageTargets?: Partial<Record<ConceptType, number>> | false;
  /** The graph is demo content (disables KG105). */
  isDemo?: boolean;
}

export const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.8;

/** FORMAT.md "comparable depth" targets per tradition. */
export const FORMAT_COVERAGE_TARGETS: Partial<Record<ConceptType, number>> = {
  process_stage: 8,
  material: 6,
  tool: 4,
  artisan_decision: 3,
  scientific_mechanism: 3,
  environmental_condition: 2,
  design_principle: 3,
  outcome: 2,
  open_question: 1,
};

export interface ValidationContext {
  model: KnowledgeGraphModel;
  registry: RelationshipTypeRegistry;
  options: ValidationOptions;
  conceptByKey: Map<string, GraphConcept>;
  sourceByRef: Map<string, GraphSource>;
}

export type Validator = (ctx: ValidationContext) => IntegrityIssue[];

export function relationshipId(r: Pick<GraphRelationship, "source" | "target" | "type">): string {
  return `${r.source}|${r.type}|${r.target}`;
}

function issue(rule: RuleDefinition, message: string, extra: Omit<IntegrityIssue, "code" | "severity" | "message"> = {}): IntegrityIssue {
  return { code: rule.code, severity: rule.severity, message, ...extra };
}

const isAccepted = (s: VerificationState) => (ACCEPTED_STATES as readonly string[]).includes(s);

export function createContext(model: KnowledgeGraphModel, options: ValidationOptions = {}): ValidationContext {
  const conceptByKey = new Map<string, GraphConcept>();
  for (const c of model.concepts) if (!conceptByKey.has(c.key)) conceptByKey.set(c.key, c);
  return {
    model,
    registry: options.registry ?? DEFAULT_REGISTRY,
    options,
    conceptByKey,
    sourceByRef: new Map(model.sources.map((s) => [s.ref, s])),
  };
}

// =========================================================================================
// 1xx entities
// =========================================================================================

export const validateEntities: Validator = ({ model, conceptByKey, options }) => {
  const out: IntegrityIssue[] = [];
  const owners = new Map<string, string>();
  for (const c of model.concepts) {
    const prev = owners.get(c.key);
    if (prev !== undefined) {
      out.push(issue(RULES.DUPLICATE_CONCEPT_KEY, `Concept key ${c.key} is defined in both ${prev} and ${c.packageSlug}`, { packageSlug: c.packageSlug, entity: c.key }));
    } else owners.set(c.key, c.packageSlug);

    const namespace = c.key.split(".")[0];
    if (namespace !== c.packageSlug) {
      out.push(issue(RULES.KEY_NAMESPACE, `${c.key} is in file "${c.packageSlug}" but its namespace is "${namespace}"`, { packageSlug: c.packageSlug, entity: c.key }));
    }
    if (!options.isDemo && (c.isDemo || c.key.startsWith("demo") || c.title.startsWith(DEMO_TITLE_PREFIX))) {
      out.push(issue(RULES.DEMO_IN_REAL, `${c.key} carries a demo marker in real content`, { packageSlug: c.packageSlug, entity: c.key }));
    }
    if (c.compares.length > 0 || c.type === "comparison") {
      if (c.type === "comparison" && c.compares.length < 2) {
        out.push(issue(RULES.COMPARISON_ARITY, `${c.key} compares ${c.compares.length} concept(s)`, { packageSlug: c.packageSlug, entity: c.key }));
      }
      for (const k of c.compares) {
        if (!conceptByKey.has(k)) {
          out.push(issue(RULES.COMPARES_UNKNOWN, `${c.key} compares unknown concept ${k}`, { packageSlug: c.packageSlug, entity: c.key, detail: { missing: k } }));
        }
      }
    }
  }
  for (const p of model.packages) {
    if (!options.isDemo && (p.isDemo || p.slug.startsWith("demo") || p.name.startsWith(DEMO_TITLE_PREFIX))) {
      out.push(issue(RULES.DEMO_IN_REAL, `Package ${p.slug} carries a demo marker in real content`, { packageSlug: p.slug }));
    }
    if (p.kind === "tradition") {
      const n = model.concepts.filter((c) => c.packageSlug === p.slug && c.type === "tradition").length;
      if (n !== 1) out.push(issue(RULES.TRADITION_CONCEPT, `${p.slug} has ${n} tradition concepts (expected 1)`, { packageSlug: p.slug }));
    }
    for (const m of p.mediaCandidates) {
      if (m.depicts && !conceptByKey.has(m.depicts)) {
        out.push(issue(RULES.MEDIA_DEPICTS_UNKNOWN, `${p.slug}: media candidate "${m.title}" depicts unknown concept ${m.depicts}`, { packageSlug: p.slug, entity: m.depicts }));
      }
    }
  }
  if (!options.isDemo) {
    for (const s of model.sources) {
      if (s.title.startsWith(DEMO_TITLE_PREFIX)) {
        out.push(issue(RULES.DEMO_IN_REAL, `Source ${s.ref} has a demo title in real content`, { packageSlug: s.packageSlug, entity: s.ref }));
      }
    }
  }
  return out;
};

// =========================================================================================
// 2xx relationships
// =========================================================================================

export const validateRelationships: Validator = ({ model, registry, conceptByKey }) => {
  const out: IntegrityIssue[] = [];
  const seen = new Map<string, GraphRelationship>();
  for (const r of model.relationships) {
    const id = relationshipId(r);
    const at = { packageSlug: r.packageSlug, entity: id };
    const type = registry.get(r.type);
    if (!type) out.push(issue(RULES.UNKNOWN_TYPE, `${r.packageSlug}: unknown relationship type ${r.type} (${id})`, at));
    for (const end of [r.source, r.target]) {
      if (!conceptByKey.has(end)) out.push(issue(RULES.MISSING_ENDPOINT, `${r.packageSlug}: ${id} references missing concept ${end}`, { ...at, detail: { missing: end } }));
    }
    if (r.source === r.target) out.push(issue(RULES.SELF_LOOP, `${r.packageSlug}: ${id} links a concept to itself`, at));
    const prev = seen.get(id);
    if (prev) {
      out.push(issue(RULES.DUPLICATE_EDGE, `${id} is stated in ${prev.packageSlug} and again in ${r.packageSlug}`, at));
    } else {
      seen.set(id, r);
    }
    if (type && !type.directed && r.source !== r.target) {
      const reverse = seen.get(relationshipId({ source: r.target, target: r.source, type: r.type }));
      if (reverse && reverse !== r) {
        out.push(issue(RULES.UNDIRECTED_REVERSE, `${r.type} is undirected but ${r.source} and ${r.target} are linked in both directions (${reverse.packageSlug}, ${r.packageSlug})`, at));
      }
    }
    if (type && !type.ordered && r.ordinal != null) {
      out.push(issue(RULES.ORDINAL_UNORDERED, `${r.packageSlug}: ${id} has ordinal ${r.ordinal} but ${r.type} is not ordered`, at));
    }
    if (isAccepted(r.verificationState)) {
      for (const end of [r.source, r.target]) {
        const c = conceptByKey.get(end);
        if (c && !isAccepted(c.verificationState)) {
          out.push(issue(RULES.ACCEPTED_EDGE_ENDPOINT, `${id} is ${r.verificationState} but ${end} is ${c.verificationState}`, at));
        }
      }
    }
  }
  return out;
};

// =========================================================================================
// 3xx cycles and process structure
// =========================================================================================

const edgesOf = (rels: readonly GraphRelationship[]): DirectedEdge[] => rels.map((r) => ({ from: r.source, to: r.target }));
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const validateCycles: Validator = ({ model, registry }) => {
  const out: IntegrityIssue[] = [];
  const rels = model.relationships.filter((r) => r.source !== r.target);
  const byType = new Map<string, GraphRelationship[]>();
  for (const r of rels) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  const reportedAcyclic: string[][] = [];
  for (const t of registry.all()) {
    if (t.allowsCycles || !t.directed) continue;
    for (const cycle of findCycles(edgesOf(byType.get(t.code) ?? []))) {
      reportedAcyclic.push(cycle);
      out.push(issue(RULES.CYCLE_ACYCLIC_TYPE, `${t.code} forbids cycles but these concepts form one: ${cycle.join(", ")}`, { entity: cycle[0], detail: { type: t.code, members: cycle } }));
    }
  }

  // PRECEDES: cycles are allowed only through an explicitly marked loop edge.
  const precedes = byType.get(SEQUENCE_TYPE) ?? [];
  const unmarked = precedes.filter((r) => !isMarkedLoop(r));
  const hard = findCycles(edgesOf(unmarked));
  for (const cycle of hard) {
    out.push(issue(RULES.PRECEDES_CYCLE, `PRECEDES cycle with no marked loop edge: ${cycle.join(", ")}`, { entity: cycle[0], detail: { members: cycle } }));
  }
  for (const cycle of findCycles(edgesOf(precedes))) {
    if (hard.some((h) => sameSet(h, cycle))) continue;
    const loops = precedes.filter((r) => isMarkedLoop(r) && cycle.includes(r.source) && cycle.includes(r.target));
    out.push(
      issue(RULES.PRECEDES_LOOP, `PRECEDES loop closed by ${loops.map((l) => `${l.source} -> ${l.target}`).join("; ")}`, {
        packageSlug: loops[0]?.packageSlug,
        entity: cycle[0],
        detail: { members: cycle, loopEdges: loops.map(relationshipId) },
      }),
    );
  }

  // Dependency graph: DEPENDS_ON ∪ REQUIRES must be acyclic.
  const deps = rels.filter((r) => DEPENDENCY_TYPES.includes(r.type));
  for (const cycle of findCycles(edgesOf(deps))) {
    if (reportedAcyclic.some((c) => sameSet(c, cycle))) continue;
    out.push(issue(RULES.DEPENDENCY_CYCLE, `Dependency cycle (${DEPENDENCY_TYPES.join("/")}): ${cycle.join(", ")}`, { entity: cycle[0], detail: { members: cycle } }));
  }
  return out;
};

export const validateProcessSequences: Validator = ({ model, conceptByKey }) => {
  const out: IntegrityIssue[] = [];
  const precedes = model.relationships.filter((r) => r.type === SEQUENCE_TYPE);

  const byPackage = new Map<string, GraphRelationship[]>();
  for (const r of precedes) {
    if (r.ordinal == null) {
      if (!isMarkedLoop(r)) {
        out.push(issue(RULES.PRECEDES_UNORDINALLED, `${r.packageSlug}: ${r.source} -> ${r.target} has no ordinal and is not a marked loop`, { packageSlug: r.packageSlug, entity: relationshipId(r) }));
      }
      continue;
    }
    if (!byPackage.has(r.packageSlug)) byPackage.set(r.packageSlug, []);
    byPackage.get(r.packageSlug)!.push(r);
  }

  // A file may hold several independent ordered chains (e.g. the production sequence and a
  // two-step historical chronology). Each connected chain must number 1..n on its own.
  const byChain = new Map<string, GraphRelationship[]>();
  for (const [pkg, rels] of byPackage) {
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      let p = parent.get(k) ?? k;
      while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
      parent.set(k, p);
      return p;
    };
    for (const r of rels) {
      const a = find(r.source), b = find(r.target);
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
    }
    for (const r of rels) {
      const key = `${pkg}#${find(r.source)}`;
      if (!byChain.has(key)) byChain.set(key, []);
      byChain.get(key)!.push(r);
    }
  }

  for (const [chainKey, chain] of [...byChain.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const pkg = chainKey.split("#")[0]!;
    const byOrdinal = new Map<number, GraphRelationship[]>();
    for (const r of chain) {
      if (!byOrdinal.has(r.ordinal!)) byOrdinal.set(r.ordinal!, []);
      byOrdinal.get(r.ordinal!)!.push(r);
    }
    for (const [ord, rs] of byOrdinal) {
      if (rs.length > 1) {
        out.push(issue(RULES.ORDINAL_DUPLICATE, `${pkg}: PRECEDES ordinal ${ord} is used ${rs.length} times`, { packageSlug: pkg, detail: { ordinal: ord, edges: rs.map(relationshipId) } }));
      }
    }
    const ordinals = [...byOrdinal.keys()].sort((a, b) => a - b);
    const missing: number[] = [];
    const max = ordinals[ordinals.length - 1] ?? 0;
    for (let i = 1; i <= max; i++) if (!byOrdinal.has(i)) missing.push(i);
    if (missing.length > 0) {
      out.push(issue(RULES.ORDINAL_GAP, `${pkg}: PRECEDES ordinals skip ${missing.join(", ")} (expected 1..${max})`, { packageSlug: pkg, detail: { missing, present: ordinals } }));
    }
    for (let i = 0; i + 1 < ordinals.length; i++) {
      const a = byOrdinal.get(ordinals[i]!)!;
      const b = byOrdinal.get(ordinals[i + 1]!)!;
      if (a.length !== 1 || b.length !== 1 || ordinals[i + 1] !== ordinals[i]! + 1) continue;
      if (a[0]!.target !== b[0]!.source) {
        out.push(
          issue(RULES.CHAIN_BREAK, `${pkg}: step ${ordinals[i]} ends at ${a[0]!.target} but step ${ordinals[i + 1]} starts at ${b[0]!.source}`, {
            packageSlug: pkg,
            entity: relationshipId(b[0]!),
          }),
        );
      }
    }
  }

  // Forks: a stage with several next stages must say when each branch applies.
  const outgoing = new Map<string, GraphRelationship[]>();
  for (const r of precedes) {
    if (isMarkedLoop(r)) continue;
    if (!outgoing.has(r.source)) outgoing.set(r.source, []);
    outgoing.get(r.source)!.push(r);
  }
  for (const [node, rs] of [...outgoing.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (rs.length < 2) continue;
    const bare = rs.filter((r) => !r.conditions || r.conditions.trim() === "");
    if (bare.length > 0) {
      out.push(
        issue(RULES.FORK_WITHOUT_CONDITIONS, `${node} has ${rs.length} next stages; ${bare.length} branch(es) state no conditions`, {
          packageSlug: rs[0]!.packageSlug,
          entity: node,
          detail: { branches: rs.map(relationshipId) },
        }),
      );
    }
  }

  for (const r of precedes) {
    const s = conceptByKey.get(r.source);
    const t = conceptByKey.get(r.target);
    if (s && t && (s.type !== "process_stage" || t.type !== "process_stage")) {
      out.push(issue(RULES.PRECEDES_NON_STAGE, `${r.packageSlug}: PRECEDES links ${s.type} ${s.key} to ${t.type} ${t.key}`, { packageSlug: r.packageSlug, entity: relationshipId(r) }));
    }
  }

  const sequenced = new Set<string>();
  for (const r of model.relationships) {
    if (r.type === SEQUENCE_TYPE || DEPENDENCY_TYPES.includes(r.type)) {
      sequenced.add(r.source);
      sequenced.add(r.target);
    }
  }
  for (const c of model.concepts) {
    if (c.type === "process_stage" && !sequenced.has(c.key)) {
      out.push(issue(RULES.STAGE_OUTSIDE_SEQUENCE, `${c.key} is a process stage with no PRECEDES, DEPENDS_ON or REQUIRES link`, { packageSlug: c.packageSlug, entity: c.key }));
    }
  }
  return out;
};

// =========================================================================================
// 4xx provenance
// =========================================================================================

const WEAK_KINDS = new Set(["hypothesis", "unverified"]);

export const validateProvenance: Validator = ({ model, registry, sourceByRef, options }) => {
  const out: IntegrityIssue[] = [];
  const cited = new Set<string>();

  for (const c of model.concepts) {
    const at = { packageSlug: c.packageSlug, entity: c.key };
    if (c.claims.length === 0) out.push(issue(RULES.CONCEPT_NO_CLAIMS, `${c.key} has no claims`, at));
    c.claims.forEach((cl, i) => {
      if (cl.sourceRefs.length === 0) out.push(issue(RULES.CLAIM_NO_SOURCE, `${c.key} claim #${i} cites no source`, at));
      const known = cl.sourceRefs.filter((ref) => sourceByRef.has(ref));
      cl.sourceRefs.forEach((ref, j) => {
        cited.add(ref);
        if (!sourceByRef.has(ref)) out.push(issue(RULES.CLAIM_UNKNOWN_SOURCE, `${c.key} claim #${i} cites unknown source ${cl.rawSourceIds[j] ?? ref}`, { ...at, detail: { ref } }));
      });
      if (known.length > 0 && known.every((ref) => sourceByRef.get(ref)!.reliability === "low")) {
        out.push(issue(RULES.CLAIM_LOW_RELIABILITY, `${c.key} claim #${i} rests only on low-reliability sources`, at));
      }
    });
  }

  for (const r of model.relationships) {
    const id = relationshipId(r);
    const at = { packageSlug: r.packageSlug, entity: id };
    const type = registry.get(r.type);
    r.sourceRefs.forEach((ref, j) => {
      cited.add(ref);
      if (!sourceByRef.has(ref)) out.push(issue(RULES.REL_UNKNOWN_SOURCE, `${r.packageSlug}: ${id} cites unknown source ${r.rawSourceIds[j] ?? ref}`, { ...at, detail: { ref } }));
    });
    if (type?.requiresEvidence && r.sourceRefs.length === 0) {
      out.push(issue(RULES.REL_NO_EVIDENCE, `${r.packageSlug}: ${id} cites no source but ${r.type} requires evidence`, at));
    }
    if (r.type === DIRECT_CAUSAL_TYPE) {
      const known = r.sourceRefs.map((ref) => sourceByRef.get(ref)).filter((s): s is GraphSource => s !== undefined);
      const reasons: string[] = [];
      if (known.length === 0) reasons.push("it cites no resolvable source");
      if (WEAK_KINDS.has(r.provenanceKind)) reasons.push(`its provenance is ${r.provenanceKind}`);
      if (known.length > 0 && known.every((s) => WEAK_KINDS.has(s.kind))) reasons.push("every cited source is a hypothesis or unverified");
      if (reasons.length > 0) {
        out.push(issue(RULES.CAUSES_WITHOUT_DIRECT_EVIDENCE, `${id}: CAUSES needs direct evidence, but ${reasons.join("; ")} (use ENABLES or AFFECTED_BY)`, at));
      } else if (known.every((s) => s.reliability === "low")) {
        out.push(issue(RULES.CAUSES_LOW_RELIABILITY, `${id}: CAUSES rests only on low-reliability sources`, at));
      }
    }
  }

  for (const p of model.packages) {
    for (const ref of p.gi?.sourceRefs ?? []) {
      cited.add(ref);
      if (!sourceByRef.has(ref)) out.push(issue(RULES.GI_UNKNOWN_SOURCE, `${p.slug}: GI record cites unknown source ${ref}`, { packageSlug: p.slug, entity: ref }));
    }
  }

  for (const s of model.sources) {
    if (!cited.has(s.ref)) out.push(issue(RULES.SOURCE_UNCITED, `${s.ref} (${s.title}) is never cited`, { packageSlug: s.packageSlug, entity: s.ref }));
  }

  if (options.sourceManifest) {
    const archived = new Set(options.sourceManifest.map((e) => manifestUrlKey(e.url)));
    for (const s of model.sources) {
      if (s.url && !archived.has(manifestUrlKey(s.url))) {
        out.push(issue(RULES.SOURCE_NOT_ARCHIVED, `${s.ref} URL is not in the source manifest: ${s.url}`, { packageSlug: s.packageSlug, entity: s.ref }));
      }
    }
  }
  return out;
};

// =========================================================================================
// 5xx duplicates
// =========================================================================================

export const validateDuplicates: Validator = ({ model, options }) => {
  const out: IntegrityIssue[] = [];
  const threshold = options.nearDuplicateThreshold ?? DEFAULT_NEAR_DUPLICATE_THRESHOLD;
  const groups = new Map<string, GraphConcept[]>();
  for (const c of model.concepts) {
    const g = `${c.packageSlug}|${c.type}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  for (const [, group] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const sorted = [...group].sort((a, b) => (a.key < b.key ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const at = { packageSlug: a.packageSlug, entity: a.key };
        if (normaliseTitle(a.title) === normaliseTitle(b.title)) {
          out.push(issue(RULES.DUPLICATE_TITLE, `${a.key} and ${b.key} are both ${a.type} "${a.title}"`, { ...at, detail: { other: b.key } }));
          continue;
        }
        const sim = trigramSimilarity(a.title, b.title);
        if (sim >= threshold) {
          out.push(
            issue(RULES.NEAR_DUPLICATE_TITLE, `${a.key} "${a.title}" and ${b.key} "${b.title}" are near-duplicates (trigram ${sim.toFixed(2)})`, {
              ...at,
              detail: { other: b.key, similarity: Number(sim.toFixed(4)) },
            }),
          );
        }
      }
    }
  }
  for (const c of model.concepts) {
    const texts = new Set<string>();
    c.claims.forEach((cl, i) => {
      const t = normaliseTitle(cl.text);
      if (texts.has(t)) out.push(issue(RULES.DUPLICATE_CLAIM, `${c.key} claim #${i} repeats an earlier claim`, { packageSlug: c.packageSlug, entity: c.key }));
      texts.add(t);
    });
  }
  return out;
};

// =========================================================================================
// 6xx claims-only prose
// =========================================================================================

/** The text FORMAT.md's claims-only policy generates (content/review/tools/claims-only-prose.js). */
export function deriveProseFromClaims(c: Pick<GraphConcept, "claims">): { summary: string; bodyMd: string } {
  const texts = c.claims.map((cl) => cl.text.trim());
  return {
    summary: texts[0] ?? "",
    bodyMd: texts.map((t, i) => `${t} [${c.claims[i]!.rawSourceIds.join(", ")}]`).join("\n\n"),
  };
}

export const validateProse: Validator = ({ model }) => {
  const out: IntegrityIssue[] = [];
  for (const c of model.concepts) {
    const derived = deriveProseFromClaims(c);
    const at = { packageSlug: c.packageSlug, entity: c.key };
    const summaryOk = c.summary.trim() === derived.summary;
    const bodyOk = (c.bodyMd ?? "").trim() === derived.bodyMd;
    if (c.prosePolicy === "claims-only") {
      if (!summaryOk) out.push(issue(RULES.SUMMARY_NOT_FROM_CLAIMS, `${c.key}: summary is not its first claim`, at));
      if (!bodyOk) out.push(issue(RULES.BODY_NOT_FROM_CLAIMS, `${c.key}: body_md is not "claim [sources]" for every claim`, at));
    } else if (!summaryOk || (c.bodyMd != null && c.bodyMd.trim() !== "" && !bodyOk)) {
      out.push(issue(RULES.PROSE_NOT_DERIVABLE, `${c.key}: summary/body_md hold free prose that its claims do not generate`, at));
    }
  }
  return out;
};

// =========================================================================================
// 7xx never collapse semantics
// =========================================================================================

export const validateSemantics: Validator = ({ model, registry }) => {
  const out: IntegrityIssue[] = [];
  const causal = SEMANTIC_WORDING.causal!;
  const associative = SEMANTIC_WORDING.associative!;
  for (const r of model.relationships) {
    const type = registry.get(r.type);
    if (!type || !r.explanation) continue;
    const at = { packageSlug: r.packageSlug, entity: relationshipId(r) };
    if (type.semantics === "causal") {
      const m = r.explanation.match(associative);
      if (m) out.push(issue(RULES.SEMANTICS_WORDING_MIX, `${relationshipId(r)}: causal type explained with associative wording ("${m[0]}")`, { ...at, detail: { wording: m[0], semantics: type.semantics } }));
    } else if (type.semantics === "associative" || type.semantics === "comparative") {
      const m = r.explanation.match(causal);
      if (m) out.push(issue(RULES.SEMANTICS_WORDING_MIX, `${relationshipId(r)}: ${type.semantics} type explained with causal wording ("${m[0]}")`, { ...at, detail: { wording: m[0], semantics: type.semantics } }));
    }
  }

  const pairs = new Map<string, { types: Set<string>; semantics: Set<string>; pkg: string }>();
  for (const r of model.relationships) {
    const type = registry.get(r.type);
    if (!type) continue;
    const pair = [r.source, r.target].sort().join(" <> ");
    if (!pairs.has(pair)) pairs.set(pair, { types: new Set(), semantics: new Set(), pkg: r.packageSlug });
    const p = pairs.get(pair)!;
    p.types.add(r.type);
    p.semantics.add(type.semantics);
  }
  for (const [pair, p] of [...pairs.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (p.semantics.size > 1) {
      out.push(
        issue(RULES.MULTI_SEMANTICS_PAIR, `${pair} linked as ${[...p.types].sort().join(" + ")} (${[...p.semantics].sort().join(", ")})`, {
          packageSlug: p.pkg,
          entity: pair,
          detail: { types: [...p.types].sort() },
        }),
      );
    }
  }
  return out;
};

// =========================================================================================
// 8xx orphans and coverage
// =========================================================================================

export const validateOrphans: Validator = ({ model, options }) => {
  const out: IntegrityIssue[] = [];
  const types = new Map<string, Set<string>>();
  for (const r of model.relationships) {
    for (const k of [r.source, r.target]) {
      if (!types.has(k)) types.set(k, new Set());
      types.get(k)!.add(r.type);
    }
  }
  // A comparison's `compares` list links it to the compared concepts (not an orphan).
  for (const c of model.concepts) {
    for (const k of c.compares.length > 0 ? [c.key, ...c.compares] : []) {
      if (!types.has(k)) types.set(k, new Set());
      types.get(k)!.add("compares");
    }
  }
  for (const c of model.concepts) {
    const t = types.get(c.key);
    const at = { packageSlug: c.packageSlug, entity: c.key };
    if (!t) out.push(issue(RULES.ORPHAN, `${c.key} has no relationships and is not compared`, at));
    else if (t.size === 1 && t.has("BELONGS_TO") && c.type !== "tradition") out.push(issue(RULES.BELONGS_ONLY, `${c.key} is linked only by BELONGS_TO`, at));
  }

  const targets = options.coverageTargets === false ? null : (options.coverageTargets ?? FORMAT_COVERAGE_TARGETS);
  if (targets) {
    const sharedMechanisms = new Set(model.concepts.filter((c) => c.type === "scientific_mechanism").map((c) => c.key));
    for (const p of model.packages.filter((x) => x.kind === "tradition")) {
      const own = model.concepts.filter((c) => c.packageSlug === p.slug);
      for (const [type, min] of Object.entries(targets) as [ConceptType, number][]) {
        let n = own.filter((c) => c.type === type).length;
        if (type === "scientific_mechanism") {
          // FORMAT.md: mechanisms may link to shared ones.
          const linked = new Set(
            model.relationships
              .filter((r) => r.packageSlug === p.slug && sharedMechanisms.has(r.target) && !r.target.startsWith(`${p.slug}.`))
              .map((r) => r.target),
          );
          n += linked.size;
        }
        if (n < min) out.push(issue(RULES.COVERAGE_BELOW_TARGET, `${p.slug}: ${n} ${type} concept(s), FORMAT.md target is ${min}`, { packageSlug: p.slug, detail: { type, count: n, target: min } }));
      }
    }
  }
  return out;
};

// =========================================================================================

export const VALIDATORS: readonly Validator[] = [
  validateEntities,
  validateRelationships,
  validateCycles,
  validateProcessSequences,
  validateProvenance,
  validateDuplicates,
  validateProse,
  validateSemantics,
  validateOrphans,
];

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Deterministic order: severity, code, package, entity, message. */
export function sortIssues(issues: readonly IntegrityIssue[]): IntegrityIssue[] {
  const s = (x?: string) => x ?? "";
  return [...issues].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
      (s(a.packageSlug) < s(b.packageSlug) ? -1 : s(a.packageSlug) > s(b.packageSlug) ? 1 : 0) ||
      (s(a.entity) < s(b.entity) ? -1 : s(a.entity) > s(b.entity) ? 1 : 0) ||
      (a.message < b.message ? -1 : a.message > b.message ? 1 : 0),
  );
}

export function validateGraph(model: KnowledgeGraphModel, options: ValidationOptions = {}): IntegrityIssue[] {
  const ctx = createContext(model, options);
  return sortIssues(VALIDATORS.flatMap((v) => v(ctx)));
}
