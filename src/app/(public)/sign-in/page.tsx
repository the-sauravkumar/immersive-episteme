import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInForm } from "@/components/shell/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Staff Sign In" };

/**
 * Research-team sign-in (DESIGN.md 11.4): a centred 24rem `--surface` card on `--ground` with
 * 44 px fields, no band inside it. Participants never sign in: they join with a study code at /study.
 */
export default function SignInPage() {
  return (
    <div className="flex justify-center py-4 xs:py-8">
      <section
        aria-labelledby="sign-in-title"
        data-slot="sign-in-card"
        className="flex w-full max-w-[24rem] flex-col gap-6 rounded-card border border-rule bg-surface p-6 max-xs:p-4"
      >
        <header className="flex flex-col gap-2">
          <p className="text-eyebrow">Research Team</p>
          <h1 id="sign-in-title" className="text-title text-ink">
            {titleCase("Staff sign in")}
          </h1>
          <p className="text-body text-ink-2">
            For researchers, curators and administrators. Taking part in a study? Use the study link you were given.
          </p>
        </header>
        {/* useSearchParams (?next=) is request data: keep it behind a boundary. */}
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <SignInForm />
        </Suspense>
      </section>
    </div>
  );
}
