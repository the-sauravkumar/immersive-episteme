import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { CoursePreview } from "@/features/course/ui/course-preview";
import { loadTemplates } from "@/features/process/application/load-template";
import { fileTemplateSource } from "@/features/process/infrastructure/file-template-source";
import { COURSE_PREVIEW_PATH } from "@/lib/permissions/learning";
import { titleCase } from "@/lib/text/title-case";
import { requirePermission } from "@/server/auth/staff";
import { loadStageTemplates } from "@/server/study/stage-templates";

export const metadata: Metadata = { title: titleCase("Course Preview"), robots: { index: false } };

export const instant = false;

async function GatedPreview() {
  await requirePermission("learn.2d", { next: COURSE_PREVIEW_PATH });
  const doorTraditions = (await loadStageTemplates()).map((template) => template.tradition);
  const templates = await loadTemplates(fileTemplateSource(), doorTraditions);
  return <CoursePreview templates={templates} />;
}

export default function CoursePreviewPage() {
  return (
    <Suspense fallback={<GateFallback label="Loading…" />}>
      <GatedPreview />
    </Suspense>
  );
}
