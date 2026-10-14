import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Dataset versions" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/datasets"
      title="Dataset versions"
      description="Immutable, published dataset versions that studies pin."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
