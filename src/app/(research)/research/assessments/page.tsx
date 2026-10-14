import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Assessments" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/assessments"
      title="Assessments"
      description="Assessment instruments, items and concept-map reference structures."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
