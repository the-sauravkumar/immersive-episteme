import type { ReactNode } from "react";

import { Learning2dFrame } from "@/features/learning-2d/ui/frame";

/**
 * The 2D learning pages (route group, no URL segment): the frame resolves the learning context
 * once (which starts the learning clock in study mode) and mounts the session that persists
 * across the pages. Rendered inside the parent layout's <Suspense> and LearningGate.
 */
/** May block: the learning gate verifies the participant session per navigation (see ../layout.tsx). */
export const instant = false;

export default function Learn2dContentLayout({ children }: { children: ReactNode }) {
  return <Learning2dFrame>{children}</Learning2dFrame>;
}
