import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Sources" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/sources"
      title="Sources"
      description="Cited sources and their reliability ratings."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
