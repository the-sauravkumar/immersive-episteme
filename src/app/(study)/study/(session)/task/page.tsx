import type { Metadata } from "next";

import { ParticipantPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Learning task" };

export default function Page() {
  return (
    <ParticipantPage>
      <PageHeader kicker="Study" title="Learning task" description="Your learning task and how to begin it." />
      <PlaceholderNotice />
    </ParticipantPage>
  );
}
