/**
 * Plate 1 on the public home (DR-058): the plan of the museum the public
 * demo walks, compiled from the knowledge model. The manifest is found the way the demo finds it
 * (the newest review snapshot and the manifest of the demo study pinned to it, else the newest
 * valid manifest compiled from that snapshot: `findPreviewContent`), read through the cached
 * `getManifest`, and drawn with the plan code the 3D condition's own plan uses
 * (src/features/immersive/plan-drawing.ts). Nothing participant-facing is read.
 *
 * Request time only, inside <Suspense> (cacheComponents); null when there is no readable demo
 * manifest or the read fails, so the plate shows its frame and caption without an invented plan.
 */
import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { planPlateData, type PlanPlateData } from "@/features/immersive/plan-drawing";
import { buildSceneModel } from "@/features/immersive/scene-model";
import { getPool } from "@/server/db/client";
import { pgLearningContextData } from "@/server/learning/context-data";
import { getManifest } from "@/server/spatial/manifests";

/** Deduplicated per request (React `cache`). */
export const getDemoMuseumPlan = cache(async (): Promise<PlanPlateData | null> => {
  await connection();
  try {
    const content = await pgLearningContextData(getPool()).findPreviewContent();
    if (!content?.manifestId) return null;
    const record = await getManifest(content.manifestId);
    if (!record || record.snapshotId !== content.snapshotId) return null;
    if (record.status !== "valid" && record.status !== "published") return null;
    return planPlateData(buildSceneModel(record.manifest));
  } catch (err) {
    console.error("[public] demo museum plan read failed", err);
    return null;
  }
});
