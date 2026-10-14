import type { Metadata } from "next";

import { ParticipantPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "After the task" };

export default function Page() {
  return (
    <ParticipantPage>
      <PageHeader kicker="Study" title="After the task" description="Questions about what you learned." />
      <PlaceholderNotice />
    </ParticipantPage>
  );
}
