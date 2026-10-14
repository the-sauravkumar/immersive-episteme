import type { Metadata } from "next";

import { ParticipantPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Connect the concepts" };

export default function Page() {
  return (
    <ParticipantPage>
      <PageHeader kicker="Study" title="Connect the concepts" description="Arrange and connect concepts to show how they relate." />
      <PlaceholderNotice />
    </ParticipantPage>
  );
}
