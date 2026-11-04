import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { CoursePreview } from "@/features/course/ui/course-preview";
import { loadTemplates } from "@/features/process/application/load-template";
import type { TraditionKey } from "@/features/process/domain/stage-template";
import { fileTemplateSource } from "@/features/process/infrastructure/file-template-source";
import { titleCase } from "@/lib/text/title-case";
import { requirePermission } from "@/server/auth/staff";

export const metadata: Metadata = { title: titleCase("Course Preview"), robots: { index: false } };

export const instant = false;

const PREVIEW_ORDER: readonly TraditionKey[] = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"];

async function GatedPreview() {
  await requirePermission("learn.2d", { next: "/learn/course-preview" });
  const templates = await loadTemplates(fileTemplateSource(), PREVIEW_ORDER);
  return <CoursePreview templates={templates} />;
}

export default function CoursePreviewPage() {
  return (
    <Suspense fallback={<GateFallback label="Loading…" />}>
      <GatedPreview />
    </Suspense>
  );
}
