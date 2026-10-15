/**
 * Learning context: the single answer to "what may this request see, and how is it recorded?"
 * for /learn/2d and /learn/immersive (and any page that renders knowledge for a learner).
 *
 *   const ctx = await getLearningContext("2d");
 *   const concept = await getConcept(ctx.snapshotId, key);       // src/server/knowledge/read-model.ts
 *   const manifest = ctx.manifestId ? await getManifest(ctx.manifestId) : null;
 *
 * Access is decided by the existing guard (`requireLearningAccess`, src/server/auth/learning-access.ts):
 * a participant study-session cookie always decides; otherwise staff preview, then the public demo
 * cookie. Denied requests redirect before anything renders. Then:
 *  - study:   the session's pinned snapshot and manifest (the database forces them to equal the
 *             study's); `nonExperimental` only for a demo / explicitly non-experimental study;
 *  - demo / preview: the newest REVIEW snapshot and the manifest of the demo study pinned to it;
 *             always `nonExperimental: true` and `unverifiedContent: true`.
 *
 * Reads cookies and the database, so call it inside a <Suspense> boundary (cacheComponents is on)
 * and pass its values (snapshotId, manifestId) into cached functions as arguments. Deduped per
 * request with React `cache`.
 */
import "server-only";

import { cache } from "react";

import type { LearningTimeBudget } from "@/features/learning/time-budget";
import { serverEnv } from "@/lib/env";
import type { LearningCondition } from "@/lib/permissions/learning";
import { requireLearningAccess } from "@/server/auth/learning-access";
import { getPool } from "@/server/db/client";

import { pgLearningContextData, resolveLearningContext, resolvePracticeContext, type LearningContext, type PracticeContext } from "./context-data";

export {
  LearningContextUnavailableError,
  LearningFinishRefusedError,
  recordLearningEnded,
  type LearningContext,
  type LearningMode,
  type PracticeContext,
} from "./context-data";

/**
 * The learning context for `condition`, or a redirect (thrown) when the request has no access.
 * Throws LearningContextUnavailableError when there is no content to show (no review snapshot
 * yet for demo/preview, or a study session without a snapshot).
 */
export const getLearningContext = cache(async (condition: LearningCondition): Promise<LearningContext> => {
  const access = await requireLearningAccess(condition);
  return resolveLearningContext(access, { data: pgLearningContextData(getPool()), appBuild: serverEnv().APP_BUILD_VERSION });
});

/**
 * The learning time budget for this request (same rule for both conditions; server timestamps
 * authoritative). Client side: `useLearningTimeBudget(budget)` from src/features/learning.
 */
export async function getLearningTimeBudget(condition: LearningCondition): Promise<LearningTimeBudget> {
  return (await getLearningContext(condition)).learningTime;
}

/**
 * Context of the familiarisation practice pages (/learn/<condition>/practice, study decision D5):
 * the same access guard and protocol settings as the learning context, but it never starts the
 * learning clock and gives the practice telemetry session (nothing from practice is stored as
 * learning data). Call inside <Suspense>.
 */
export const getPracticeContext = cache(async (condition: LearningCondition): Promise<PracticeContext> => {
  const access = await requireLearningAccess(condition);
  return resolvePracticeContext(access, { data: pgLearningContextData(getPool()), appBuild: serverEnv().APP_BUILD_VERSION });
});
