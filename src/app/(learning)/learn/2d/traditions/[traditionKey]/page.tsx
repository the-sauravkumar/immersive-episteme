import type { Metadata } from "next";

import { LearningPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Tradition" };

export default async function TraditionPage({ params }: PageProps<"/learn/2d/traditions/[traditionKey]">) {
  const { traditionKey } = await params;
  return (
    <LearningPage condition="2d">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <PageHeader kicker="Tradition" title={`Tradition: ${traditionKey}`} />
        <PlaceholderNotice>Tradition pages will render from the published dataset.</PlaceholderNotice>
      </div>
    </LearningPage>
  );
}
