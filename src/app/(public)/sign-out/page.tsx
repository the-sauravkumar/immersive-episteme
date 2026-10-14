import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { SignOutButton } from "@/components/shell/sign-out-button";

export const metadata: Metadata = { title: "Sign out" };

export default function SignOutPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <PageHeader kicker="Research team" title="Sign out" description="End your staff session on this device." />
      <div>
        <SignOutButton variant="default" />
      </div>
    </div>
  );
}
