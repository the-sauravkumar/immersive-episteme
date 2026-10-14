import type { Metadata } from "next";

import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        kicker="Privacy"
        title="Privacy"
        description="Participants take part under a pseudonymous study id. They do not create an account."
      />
      <PlaceholderNotice>
        The approved privacy notice (consent wording, retention period, data access) is pending the ethics
        decision and will be published here.
      </PlaceholderNotice>
    </>
  );
}
