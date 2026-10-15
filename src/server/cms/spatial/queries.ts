/**
 * Read side of the spatial studio: snapshots that can be compiled, stored manifests, overrides,
 * and the traceability view of one element. Staff console only (never imported by /learn or
 * /study). Not `server-only` (tests call it).
 */
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import type { CompiledElement, CompiledManifest, ManifestValidation, RelationshipTrace, ConceptTrace } from "@/features/spatial/compiler";
import { loadSnapshotPayload } from "@/server/knowledge/snapshot-store";

import { isUuid, type Q } from "../core";
import { overridesRuleSetName } from "./service";

export interface CompilableSnapshot {
  id: string;
  versionLabel: string;
  kind: "release" | "review";
  status: string;
  publishable: boolean;
  createdAt: string;
}

/** Non-demo snapshots a manifest can be compiled from: published releases and review snapshots. */
export async function listCompilableSnapshots(q: Q): Promise<CompilableSnapshot[]> {
  const r = await q.query<{ id: string; version_label: string; kind: "release" | "review"; status: string; created_at: Date }>(
    `SELECT id, version_label, kind, status, created_at FROM content_snapshots
      WHERE NOT is_demo AND (kind = 'review' OR status = 'published')
      ORDER BY created_at DESC LIMIT 100`,
  );
  return r.rows.map((s) => ({
    id: s.id,
    versionLabel: s.version_label,
    kind: s.kind,
    status: s.status,
    publishable: s.kind === "release" && s.status === "published",
    createdAt: s.created_at.toISOString(),
  }));
}

export async function snapshotTraditions(q: Q, snapshotId: string): Promise<{ slug: string; name: string }[]> {
  if (!isUuid(snapshotId)) return [];
  try {
    const b = await loadSnapshotPayload(q, snapshotId);
    return b.traditions.map((t) => ({ slug: t.slug, name: t.name })).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  } catch {
    return [];
  }
}

export interface ManifestSummary {
  id: string;
  status: string;
  snapshotId: string;
  snapshotLabel: string;
  snapshotKind: string;
  snapshotStatus: string;
  ruleSetName: string;
  ruleSetVersion: number;
  ruleSetStatus: string;
  compilerVersion: string;
  seed: string;
  traditions: string[];
  manifestHash: string;
  passed: boolean;
  coverage: ManifestValidation["coverage"] | null;
  overridesApplied: number;
  createdAt: string;
  publishedAt: string | null;
}

const SUMMARY_SQL = `
  SELECT m.id, m.status, m.snapshot_id, s.version_label, s.kind AS snapshot_kind, s.status AS snapshot_status,
         rs.name AS rule_set_name, rs.version AS rule_set_version, rs.status AS rule_set_status,
         m.compiler_version, m.seed, m.traditions, m.manifest_hash,
         coalesce((m.validation->>'passed')::boolean, false) AS passed,
         m.validation->'coverage' AS coverage,
         coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(m.validation->'overrides') = 'array' THEN m.validation->'overrides' END), 0) AS overrides_applied,
         m.created_at, m.published_at
    FROM spatial_manifests m
    JOIN content_snapshots s ON s.id = m.snapshot_id
    JOIN mapping_rule_sets rs ON rs.id = m.rule_set_id
   WHERE NOT m.is_demo`;

type SummaryRow = {
  id: string; status: string; snapshot_id: string; version_label: string; snapshot_kind: string; snapshot_status: string;
  rule_set_name: string; rule_set_version: number; rule_set_status: string; compiler_version: string; seed: string; traditions: string[];
  manifest_hash: string; passed: boolean; coverage: ManifestValidation["coverage"] | null; overrides_applied: number; created_at: Date; published_at: Date | null;
};

function toSummary(r: SummaryRow): ManifestSummary {
  return {
    id: r.id, status: r.status, snapshotId: r.snapshot_id, snapshotLabel: r.version_label, snapshotKind: r.snapshot_kind, snapshotStatus: r.snapshot_status,
    ruleSetName: r.rule_set_name, ruleSetVersion: r.rule_set_version, ruleSetStatus: r.rule_set_status, compilerVersion: r.compiler_version, seed: r.seed,
    traditions: r.traditions, manifestHash: r.manifest_hash, passed: r.passed, coverage: r.coverage, overridesApplied: r.overrides_applied,
    createdAt: r.created_at.toISOString(), publishedAt: r.published_at?.toISOString() ?? null,
  };
}

export async function listManifests(q: Q, limit = 50): Promise<ManifestSummary[]> {
  const r = await q.query<SummaryRow>(`${SUMMARY_SQL} ORDER BY m.created_at DESC LIMIT $1`, [limit]);
  return r.rows.map(toSummary);
}

export interface OverrideRow {
  id: string;
  ruleSetId: string;
  ruleSetVersion: number;
  ruleSetStatus: string;
  targetElementId: string;
  field: string;
  value: unknown;
  reason: string;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface ManifestDetail {
  summary: ManifestSummary;
  manifest: CompiledManifest;
  validation: ManifestValidation & {
    overrides?: { id: string; elementId: string; field: string; before: unknown; after: unknown; reason: string }[];
    skippedOverrides?: { id: string; elementId: string; field: string; reason: string }[];
    baseManifestId?: string;
  };
  rules: { id: string; description: string; strategy: string | null; priority: number }[];
  /** Overrides of every version of this manifest's override lineage, newest version first. */
  overrides: OverrideRow[];
  overridesRuleSetName: string;
  bundle: KnowledgeBundle | null;
}

export async function loadManifestDetail(q: Q, manifestId: string): Promise<ManifestDetail | null> {
  if (!isUuid(manifestId)) return null;
  const r = await q.query<SummaryRow & { manifest: CompiledManifest; validation: ManifestDetail["validation"]; config: { rules?: { id: string; description: string; priority?: number; emit?: { params?: { strategy?: unknown } } }[] } }>(
    `SELECT x.*, m.manifest, m.validation, rs.config
       FROM (${SUMMARY_SQL} AND m.id = $1) x
       JOIN spatial_manifests m ON m.id = x.id
       JOIN mapping_rule_sets rs ON rs.id = m.rule_set_id`,
    [manifestId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const name = overridesRuleSetName(row.rule_set_name);
  const ov = await q.query<{
    id: string; rule_set_id: string; version: number; status: string; target_element_id: string; field: string; value: unknown; reason: string;
    created_by: string; created_by_name: string | null; created_at: Date; revoked_at: Date | null; revoke_reason: string | null;
  }>(
    `SELECT o.id, o.rule_set_id, rs.version, rs.status, o.target_element_id, o.field, o.value, o.reason, o.created_by, u.name AS created_by_name,
            o.created_at, o.revoked_at, o.revoke_reason
       FROM manual_overrides o JOIN mapping_rule_sets rs ON rs.id = o.rule_set_id LEFT JOIN users u ON u.id = o.created_by
      WHERE rs.name = $1 ORDER BY rs.version DESC, o.created_at, o.id`,
    [name],
  );
  let bundle: KnowledgeBundle | null = null;
  try {
    bundle = await loadSnapshotPayload(q, row.snapshot_id);
  } catch {
    bundle = null;
  }
  return {
    summary: toSummary(row),
    manifest: row.manifest,
    validation: row.validation,
    rules: (row.config.rules ?? []).map((ru) => ({
      id: ru.id,
      description: ru.description,
      strategy: typeof ru.emit?.params?.strategy === "string" ? ru.emit.params.strategy : null,
      priority: ru.priority ?? 0,
    })),
    overrides: ov.rows.map((o) => ({
      id: o.id, ruleSetId: o.rule_set_id, ruleSetVersion: o.version, ruleSetStatus: o.status, targetElementId: o.target_element_id, field: o.field,
      value: o.value, reason: o.reason, createdBy: o.created_by, createdByName: o.created_by_name, createdAt: o.created_at.toISOString(),
      revokedAt: o.revoked_at?.toISOString() ?? null, revokeReason: o.revoke_reason,
    })),
    overridesRuleSetName: name,
    bundle,
  };
}

// =========================================================================================
// Traceability inspector (pure over a loaded detail)
// =========================================================================================

export interface ElementFilter {
  kind?: string;
  room?: string;
  q?: string;
}

/** Elements matching the inspector filter (kind, containing room, label/id text). */
export function filterElements(manifest: CompiledManifest, f: ElementFilter, limit = 200): { items: CompiledElement[]; total: number } {
  const byId = new Map(manifest.elements.map((e) => [e.id, e]));
  const inRoom = (e: CompiledElement, room: string): boolean => {
    let cur: CompiledElement | undefined = e;
    for (let i = 0; cur && i < 10; i++) {
      if (cur.id === room) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };
  const text = f.q?.trim().toLowerCase();
  const all = manifest.elements.filter(
    (e) =>
      (!f.kind || e.kind === f.kind) &&
      (!f.room || inRoom(e, f.room)) &&
      (!text || e.id.toLowerCase().includes(text) || (e.label ?? "").toLowerCase().includes(text)),
  );
  return { items: all.slice(0, limit), total: all.length };
}

export interface ElementExplanation {
  element: CompiledElement;
  parent: { id: string; kind: string; label: string | null } | null;
  rule: { id: string; description: string; strategy: string | null } | null;
  concepts: { id: string; key: string | null; title: string | null; type: string | null }[];
  relationships: {
    id: string;
    type: string;
    source: string | null;
    target: string | null;
    explanation: string | null;
    sources: { title: string; locator: string | null }[];
    trace: RelationshipTrace | null;
  }[];
  encodes: { relationshipId: string; ruleId: string; encoding: string }[];
  interactions: { event: string; action: string }[];
  otherRuleIds: string[];
  overridesApplied: { id: string; field: string; before: unknown; after: unknown; reason: string }[];
}

export function explainElement(d: ManifestDetail, elementId: string): ElementExplanation | null {
  const el = d.manifest.elements.find((e) => e.id === elementId);
  if (!el) return null;
  const parentEl = el.parentId ? d.manifest.elements.find((e) => e.id === el.parentId) : undefined;
  const conceptById = new Map((d.bundle?.concepts ?? []).map((c) => [c.id, c]));
  const conceptByKey = new Map((d.bundle?.concepts ?? []).map((c) => [c.key, c]));
  const relById = new Map((d.bundle?.relationships ?? []).map((r) => [r.id, r]));
  const sourceById = new Map((d.bundle?.sources ?? []).map((s) => [s.id, s]));
  const traceById = new Map(d.manifest.traceability.relationships.map((t) => [t.relationshipId, t]));
  const ruleById = new Map(d.rules.map((r) => [r.id, r]));
  const conceptIds = [...new Set([...(el.conceptId ? [el.conceptId] : []), ...(el.trace?.conceptIds ?? [])])];
  const relIds = [...new Set([...(el.trace?.relationshipIds ?? []), ...el.encodes.map((x) => x.relationshipId)])];
  const title = (key: string) => conceptByKey.get(key)?.title ?? key;
  return {
    element: el,
    parent: parentEl ? { id: parentEl.id, kind: parentEl.kind, label: parentEl.label } : null,
    rule: ruleById.get(el.ruleId) ?? null,
    concepts: conceptIds.map((id) => {
      const c = conceptById.get(id);
      return { id, key: c?.key ?? null, title: c?.title ?? null, type: c?.type ?? null };
    }),
    relationships: relIds.map((id) => {
      const r = relById.get(id);
      return {
        id,
        type: r?.type ?? traceById.get(id)?.type ?? "?",
        source: r ? title(r.source) : null,
        target: r ? title(r.target) : null,
        explanation: r?.explanation ?? null,
        sources: (r?.sources ?? []).map((s) => ({ title: sourceById.get(s.sourceId)?.title ?? s.sourceId, locator: s.locator })),
        trace: traceById.get(id) ?? null,
      };
    }),
    encodes: el.encodes.map((x) => ({ relationshipId: x.relationshipId, ruleId: x.ruleId, encoding: x.encoding })),
    interactions: el.trace?.interactions ?? [],
    otherRuleIds: (el.trace?.ruleIds ?? []).filter((id) => id !== el.ruleId),
    overridesApplied: (d.validation.overrides ?? []).filter((o) => o.elementId === el.id).map((o) => ({ id: o.id, field: o.field, before: o.before, after: o.after, reason: o.reason })),
  };
}

/** Concepts not placed and relationships not encoded, with the compiler's reasons. */
export function traceabilityGaps(d: ManifestDetail): { concepts: ConceptTrace[]; relationships: RelationshipTrace[] } {
  return {
    concepts: d.manifest.traceability.concepts.filter((c) => c.status !== "placed"),
    relationships: d.manifest.traceability.relationships.filter((r) => r.status !== "encoded"),
  };
}
