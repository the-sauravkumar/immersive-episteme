import type { Metadata } from "next";

import { publicDisplayFont } from "@/components/shell/public-font";
import { PublicShell } from "@/components/shell/public-shell";
import { NotFoundState } from "@/components/shell/state-page";

export const metadata: Metadata = { title: "Page Not Found" };

export default function NotFound() {
  return (
    <div className={`${publicDisplayFont.variable} contents`}>
      <PublicShell>
        <NotFoundState homeHref="/" homeLabel="Go to the home page" />
      </PublicShell>
    </div>
  );
}
