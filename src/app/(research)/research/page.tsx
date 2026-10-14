import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Research overview" };

export default function Page() {
  return (
    <ConsolePage
      path="/research"
      title="Research overview"
      description="Studies, recruitment progress and data-quality alerts."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
