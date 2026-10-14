import type { Metadata } from "next";

import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader
        kicker="About"
        title="About the project"
        description="A research platform comparing how people learn craft knowledge through conventional pages and through a spatially organised museum."
      />
      <PlaceholderNotice>Project description, team and ethics information will appear here.</PlaceholderNotice>
    </>
  );
}
