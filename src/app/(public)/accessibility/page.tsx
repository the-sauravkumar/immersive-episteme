import type { Metadata } from "next";

import { PageHeader, PlaceholderNotice } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Accessibility" };

export default function AccessibilityPage() {
  return (
    <>
      <PageHeader kicker="Accessibility" title="Accessibility" description="How the platform supports keyboard, screen-reader and reduced-motion use." />
      <PlaceholderNotice>The accessibility statement will be published here.</PlaceholderNotice>
    </>
  );
}
