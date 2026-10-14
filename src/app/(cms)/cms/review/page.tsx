import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Review queue" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/review"
      title="Review queue"
      description="Items submitted for review and verification. Editors cannot verify or publish."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
