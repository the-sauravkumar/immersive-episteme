import type { Metadata } from "next";

import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Consent" };

export default function ConsentPage() {
  return (
    <>
      <PageHeader kicker="Study" title="Information and consent" description="Read about the study and decide whether to take part." />
      <PlaceholderNotice>The approved participant information sheet and consent form will appear here.</PlaceholderNotice>
    </>
  );
}
