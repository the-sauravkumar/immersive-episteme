import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInForm } from "@/components/shell/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Staff Sign In" };

/**
 * Research-team sign-in (DESIGN.md 10.1, DR-022): the form on columns 1 to 5 and the explanation
 * on columns 7 to 11 of the public grid, left-aligned; not a card centred in an empty field.
 * 44 px fields. Under 1024 px the explanation follows the form. Participants never sign in: they
 * join with a study code at /study.
 */
export default function SignInPage() {
  return (
    <div className="grid gap-x-6 gap-y-10 py-4 lg:grid-cols-12">
      <section aria-labelledby="sign-in-title" data-slot="sign-in-card" className="flex flex-col gap-6 lg:col-span-5">
        <header className="flex flex-col gap-2">
          <h1 id="sign-in-title" className="text-title text-ink">
            {titleCase("Staff sign in")}
          </h1>
          <p className="text-body text-ink-2">For researchers, curators and administrators.</p>
        </header>
        {/* useSearchParams (?next=) is request data: keep it behind a boundary. */}
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <SignInForm />
        </Suspense>
      </section>
      <aside aria-label="About signing in" className="flex flex-col gap-4 lg:col-span-5 lg:col-start-7 lg:pt-14">
        <h2 className="text-h3 text-ink">{titleCase("Taking part in a study?")}</h2>
        <p className="text-body text-ink-2">
          Participants never sign in here. Use the study link you were given; it opens the study with your participant code.
        </p>
        <p className="text-body text-ink-2">Staff accounts are created by an administrator. Each area of the console opens only for the roles allowed to use it.</p>
      </aside>
    </div>
  );
}
