import type { Metadata } from "next";

import { ParticipantPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Before you start" };

export default function Page() {
  return (
    <ParticipantPage>
      <PageHeader kicker="Study" title="Before you start" description="A short set of questions about what you already know." />
      <PlaceholderNotice />
    </ParticipantPage>
  );
}
