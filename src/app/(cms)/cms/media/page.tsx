import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Media" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/media"
      title="Media"
      description="Media candidates, rights clearance and approval."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
