import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { SignInForm } from "@/components/shell/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Staff sign in" };

/** Research-team sign-in. Participants never sign in: they join with a study code at /study. */
export default function SignInPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col">
      <PageHeader
        kicker="Research team"
        title="Staff sign in"
        description="For researchers, curators and administrators. Taking part in a study? Use the study link you were given."
      />
      {/* useSearchParams (?next=) is request data: keep it behind a boundary. */}
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
