import type { Metadata } from "next";

import { LearningPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Learning" };

export default function Learn2dPage() {
  return (
    <LearningPage condition="2d">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <PageHeader kicker="Learning" title="Craft knowledge" description="Browse traditions, materials, processes and their connections." />
        <PlaceholderNotice>The conventional learning pages will appear here.</PlaceholderNotice>
      </div>
    </LearningPage>
  );
}
