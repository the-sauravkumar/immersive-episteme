import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Administration" };

export default function Page() {
  return (
    <ConsolePage
      path="/admin"
      title="Administration"
      description="Platform users, roles, settings and the audit log."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
