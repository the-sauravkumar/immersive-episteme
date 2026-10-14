import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/analytics"
      title="Analytics"
      description="Pseudonymised derived metrics by condition."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
