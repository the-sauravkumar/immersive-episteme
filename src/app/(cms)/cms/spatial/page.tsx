import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Spatial compiler" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/spatial"
      title="Spatial compiler"
      description="Compile the knowledge graph into a museum layout, inspect traceability and publish layouts."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
