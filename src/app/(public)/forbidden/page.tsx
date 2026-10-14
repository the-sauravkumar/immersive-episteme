import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { SignOutButton } from "@/components/shell/sign-out-button";

export const metadata: Metadata = { title: "Not allowed", robots: { index: false } };

/** Target of requirePermission() when a signed-in staff member lacks the permission. */
export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader
        kicker="Access"
        title="You do not have access to this page"
        description="Your roles do not include the permission this page needs. Ask a platform administrator if you think this is wrong."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/research" className="underline underline-offset-4">
          Research console
        </Link>
        <Link href="/cms" className="underline underline-offset-4">
          Content console
        </Link>
        <SignOutButton variant="outline" />
      </div>
    </div>
  );
}
