import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Roles" };

export default function Page() {
  return (
    <ConsolePage
      path="/admin/roles"
      title="Roles"
      description="Role assignments and the permission matrix."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
