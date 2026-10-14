import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Participants" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/participants"
      title="Participants"
      description="Pseudonymous participants and enrolment. Identifying records require separate permission."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
