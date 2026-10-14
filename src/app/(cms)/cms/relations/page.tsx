import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Relations" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/relations"
      title="Relations"
      description="Typed relationships between concepts (the knowledge graph)."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
