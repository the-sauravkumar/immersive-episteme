import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Parity checks" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/parity"
      title="Parity checks"
      description="Automated checks that both conditions expose the same content and tasks."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
