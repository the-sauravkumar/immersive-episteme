import type { Metadata } from "next";

import { LearningPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Concept" };

export default async function ConceptPage({ params }: PageProps<"/learn/2d/concepts/[conceptKey]">) {
  const { conceptKey } = await params;
  return (
    <LearningPage condition="2d">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <PageHeader kicker="Concept" title={`Concept: ${conceptKey}`} />
        <PlaceholderNotice>Concept pages will render from the published dataset.</PlaceholderNotice>
      </div>
    </LearningPage>
  );
}
