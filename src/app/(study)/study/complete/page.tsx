import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Thank you" };

/** Shown after a session ends. Public: the session cookie may already be cleared. */
export default function CompletePage() {
  return (
    <PageHeader
      kicker="Study"
      title="Thank you for taking part"
      description="Your session is complete. You can close this window."
    />
  );
}
