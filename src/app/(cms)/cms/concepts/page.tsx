import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Concepts" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/concepts"
      title="Concepts"
      description="Concepts, local terms and claims, with sources and verification state."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
