import type { Metadata } from "next";

import { LearningPage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Learning" };

/** The 3D museum mounts here (client-only, dynamically loaded) once the immersive runtime exists. */
export default function LearnImmersivePage() {
  return (
    <LearningPage condition="immersive">
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
        <h1 className="font-display text-title font-medium">Craft knowledge museum</h1>
        <PlaceholderNotice>The immersive museum will load here.</PlaceholderNotice>
      </div>
    </LearningPage>
  );
}
