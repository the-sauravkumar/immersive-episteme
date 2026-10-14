import type { Metadata } from "next";

import { ParticipantPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Your experience" };

export default function Page() {
  return (
    <ParticipantPage>
      <PageHeader kicker="Study" title="Your experience" description="A short questionnaire about the session." />
      <PlaceholderNotice />
    </ParticipantPage>
  );
}
