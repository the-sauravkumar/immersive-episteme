import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Content overview" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms"
      title="Content overview"
      description="Status of the knowledge base: drafts, items awaiting review and verification state."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
