import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Exports" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/exports"
      title="Exports"
      description="Pseudonymised CSV/JSON exports, joinable on participant, session, condition, concept and event ids."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
