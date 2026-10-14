import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Take part" };

const REASONS: Record<string, string> = {
  "invalid-session": "Your study session could not be verified. Please ask the facilitator for help.",
  "session-ended": "This study session has ended. Thank you for taking part.",
};

async function ReasonNotice({ searchParams }: { searchParams: PageProps<"/study">["searchParams"] }) {
  const { reason } = await searchParams;
  const message = typeof reason === "string" ? REASONS[reason] : undefined;
  if (!message) return null;
  return (
    <Alert className="mb-6">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Study entry: participants join with a study link/code from the facilitator. Deliberately no
 * link to the public demo (/explore): the demo shows both conditions, and this page is where
 * prospective participants land.
 */
export default function StudyEntryPage({ searchParams }: PageProps<"/study">) {
  return (
    <>
      <PageHeader
        kicker="Study"
        title="Take part in a study"
        description="Use the study link or code your facilitator gave you. You do not need an account."
      />
      <Suspense fallback={null}>
        <ReasonNotice searchParams={searchParams} />
      </Suspense>
      <PlaceholderNotice>Joining with a study code will be available here.</PlaceholderNotice>
    </>
  );
}
