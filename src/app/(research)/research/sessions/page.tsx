import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Sessions" };

export default function Page() {
  return (
    <ConsolePage
      path="/research/sessions"
      title="Sessions"
      description="Study sessions, progress, annotations and exclusions."
    >
      <PlaceholderNotice />
    </ConsolePage>
  );
}
