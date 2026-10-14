import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Session" };

export default async function Page({ params }: PageProps<"/research/sessions/[sessionId]">) {
  const { sessionId } = await params;
  return (
    <ConsolePage
      path="/research/sessions/[sessionId]"
      title={`Session ${sessionId}`}
      description="Session detail: step timeline, telemetry integrity and annotations."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
