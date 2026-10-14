import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return (
    <ConsolePage
      path="/admin/audit"
      title="Audit log"
      description="Append-only record of privileged actions."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
