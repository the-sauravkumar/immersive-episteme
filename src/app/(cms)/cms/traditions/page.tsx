import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Traditions" };

export default function Page() {
  return (
    <ConsolePage
      path="/cms/traditions"
      title="Traditions"
      description="Craft traditions in the knowledge base and their verification state."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
