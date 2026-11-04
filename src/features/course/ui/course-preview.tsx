"use client";

import { useState } from "react";

import type { StageTemplate } from "@/features/process/domain/stage-template";

import { CoursePractice } from "./course-practice";
import { CourseSession } from "./course-session";

export function CoursePreview({ templates }: { readonly templates: readonly StageTemplate[] }) {
  const [phase, setPhase] = useState<"practice" | "session">("practice");
  if (phase === "practice") return <CoursePractice reviewMarks onFinished={() => setPhase("session")} />;
  return <CourseSession templates={templates} reviewMarks onFinished={() => setPhase("practice")} />;
}
