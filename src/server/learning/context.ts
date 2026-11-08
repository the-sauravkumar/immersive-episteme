import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { serverEnv } from "@/lib/env";
import type { LearningCondition } from "@/lib/permissions/learning";
import { requireLearningAccess } from "@/server/auth/learning-access";
import { getPool } from "@/server/db/client";
import { learningStepIsCurrent } from "@/server/study/engine";

import { pgLearningContextData, resolveLearningContext, type LearningContext } from "./context-data";

export { LearningContextUnavailableError, type LearningContext } from "./context-data";

export const getLearningContext = cache(async (condition: LearningCondition): Promise<LearningContext> => {
  const access = await requireLearningAccess(condition);
  if (access.kind === "participant" && !(await learningStepIsCurrent(getPool(), access.sessionId))) redirect("/study/session");
  return resolveLearningContext(access, { data: pgLearningContextData(getPool()), appBuild: serverEnv().APP_BUILD_VERSION });
});

