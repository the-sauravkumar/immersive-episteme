import type { Metadata } from "next";

import { PublicShell } from "@/components/shell/public-shell";
import { NotFoundState } from "@/components/shell/state-page";

export const metadata: Metadata = { title: "Page Not Found" };

export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundState homeHref="/" homeLabel="Go to the home page" />
    </PublicShell>
  );
}
