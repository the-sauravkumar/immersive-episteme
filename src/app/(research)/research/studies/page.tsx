import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Studies" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/studies"
      title="Studies"
      description="Study protocols, arms, condition assignment and activation."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
