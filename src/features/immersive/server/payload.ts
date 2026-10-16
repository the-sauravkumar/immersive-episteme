/**
 * Builds the immersive museum's data from the learning context: space from the stored manifest
 * (getManifest(ctx.manifestId)), content from the read model (getConcept / getRelatedConcepts by
 * ctx.snapshotId). Server-only; called inside <Suspense> by /learn/immersive.
 */
import "server-only";

import type { SourceView } from "@/features/knowledge/read/view";
import { figureOptionsOf, getComparisons, getConcept, getFiguresByConcept, getRelatedConcepts, listTraditions } from "@/server/knowledge/read-model";
import type { LearningContext } from "@/server/learning/context";
import { getManifest } from "@/server/spatial/manifests";

import { toPanelConcept } from "../panel-content";
import { buildSceneModel } from "../scene-model";
import type { ImmersiveSettings, MuseumPayload, PanelConcept } from "../types";

export class MuseumUnavailableError extends Error {
  constructor(readonly reason: "no_manifest" | "manifest_not_found" | "manifest_snapshot_mismatch" | "manifest_invalid") {
    super(`Immersive museum unavailable: ${reason}`);
  }
}

/** The study settings the 3D runtime needs, from the learning context (never read per page). */
export function immersiveSettingsOf(settings: LearningContext["settings"]): ImmersiveSettings {
  return { minimap: settings.minimap, webglFailurePolicy: settings.webglFailurePolicy };
}

export async function buildMuseumPayload(ctx: Pick<LearningContext, "snapshotId" | "manifestId" | "settings" | "traditionSlugs">): Promise<MuseumPayload> {
  if (!ctx.manifestId) throw new MuseumUnavailableError("no_manifest");
  const record = await getManifest(ctx.manifestId);
  if (!record) throw new MuseumUnavailableError("manifest_not_found");
  if (record.snapshotId !== ctx.snapshotId) throw new MuseumUnavailableError("manifest_snapshot_mismatch");
  if (record.status !== "valid" && record.status !== "published") throw new MuseumUnavailableError("manifest_invalid");

  const scene = buildSceneModel(record.manifest);
  const ids = new Set<string>();
  for (const e of scene.exhibits) {
    ids.add(e.conceptId);
    for (const l of e.layers) ids.add(l.conceptId);
  }
  const placed = new Set(scene.exhibits.map((e) => e.conceptId));
  const sources = new Map<string, SourceView>();
  const concepts: Record<string, PanelConcept> = {};
  const missing: string[] = [];
  const sorted = [...ids].sort();
  const details = await Promise.all(sorted.map(async (id) => [id, await getConcept(ctx.snapshotId, id), await getRelatedConcepts(ctx.snapshotId, id)] as const));
  const comparisons = new Map((await getComparisons(ctx.snapshotId)).map((c) => [c.concept.id, c]));
  for (const [id, detail, related] of details) {
    if (!detail) {
      missing.push(id);
      continue;
    }
    concepts[id] = toPanelConcept(detail, related, sources, comparisons.get(id) ?? null, (cid) => placed.has(cid));
  }
  const traditions = (await listTraditions(ctx.snapshotId)).map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
  // Figures: the same call, with the same options helper, as the 2D concept page (DESIGN.md 9.9,
  // DR-018, DR-020: figures.photos switches photos off in both conditions together, and both share
  // one cache entry), kept to the concepts the panel can show.
  const allFigures = await getFiguresByConcept(ctx.snapshotId, figureOptionsOf(ctx));
  const figures = Object.fromEntries(Object.entries(allFigures).filter(([id]) => id in concepts).sort((a, b) => (a[0] < b[0] ? -1 : 1)));

  return {
    manifestId: record.id,
    manifestHash: record.manifestHash,
    snapshotId: ctx.snapshotId,
    scene,
    concepts,
    sources: Object.fromEntries([...sources.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    traditions,
    settings: immersiveSettingsOf(ctx.settings),
    missingConceptIds: missing,
    figures,
  };
}
