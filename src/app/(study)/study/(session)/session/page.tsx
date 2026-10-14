import type { Metadata } from "next";

import { ParticipantPage } from "@/components/shell/gates";
import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Your session" };

/**
 * Session hub: shows the participant's current protocol step and the way forward. Also the
 * target when a participant opens a learning condition they are not assigned to. The step list
 * comes from the study engine (not built yet).
 */
export default function SessionPage() {
  return (
    <ParticipantPage>
      <PageHeader kicker="Study" title="Your session" description="Continue with the next step of your session." />
      <PlaceholderNotice>The protocol step for this session will appear here.</PlaceholderNotice>
    </ParticipantPage>
  );
}
