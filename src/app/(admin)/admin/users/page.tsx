import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Users" };

export default function Page() {
  return (
    <ConsolePage
      path="/admin/users"
      title="Users"
      description="Staff accounts. Participants never have accounts."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
