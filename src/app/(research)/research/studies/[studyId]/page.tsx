import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Study" };

export default async function Page({ params }: PageProps<"/research/studies/[studyId]">) {
  const { studyId } = await params;
  return (
    <ConsolePage
      path="/research/studies/[studyId]"
      title={`Study ${studyId}`}
      description="Study detail: protocol steps, arms, pinned dataset and layout versions."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
