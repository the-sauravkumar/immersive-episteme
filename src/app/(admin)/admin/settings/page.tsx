import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <ConsolePage
      path="/admin/settings"
      title="Settings"
      description="Platform settings."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
