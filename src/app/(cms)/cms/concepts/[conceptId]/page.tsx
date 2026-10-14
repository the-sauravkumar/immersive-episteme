import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Concept" };

export default async function Page({ params }: PageProps<"/cms/concepts/[conceptId]">) {
  const { conceptId } = await params;
  return (
    <ConsolePage
      path="/cms/concepts/[conceptId]"
      title={`Concept ${conceptId}`}
      description="Concept detail: claims, sources, relations and review history."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
