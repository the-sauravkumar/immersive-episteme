import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Scoring" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/scoring"
      title="Scoring"
      description="Score responses and concept maps; inter-rater records."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
