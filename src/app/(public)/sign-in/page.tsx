import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { SignInForm } from "@/components/shell/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";
import { titleCase } from "@/lib/text/title-case";
import { googleSignInEnabled } from "@/server/auth";

export const metadata: Metadata = { title: "Staff Sign In" };

async function SignInMethods() {
  await connection();
  return <SignInForm google={googleSignInEnabled()} />;
}

function StaffNote({ google }: { google: boolean }) {
  if (!google) {
    return <p className="text-body text-ink-2">Staff accounts are created by an administrator. Each area of the console opens only for the roles allowed to use it.</p>;
  }
  return (
    <>
      <p className="text-body text-ink-2">Staff sign in with their email and password, or with Google. Each area of the console opens only for the roles allowed to use it.</p>
      <p className="text-body text-ink-2">
        A Google account that is new here gets no access: it waits until an administrator grants it a role. A Google account whose verified email matches an existing staff account signs in to that account.
      </p>
    </>
  );
}

async function StaffNoteForDeployment() {
  await connection();
  return <StaffNote google={googleSignInEnabled()} />;
}

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
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <SignInMethods />
        </Suspense>
      </section>
      <aside aria-label="About signing in" className="flex flex-col gap-4 lg:col-span-5 lg:col-start-7 lg:pt-14">
        <h2 className="text-h3 text-ink">{titleCase("Taking part in a study?")}</h2>
        <p className="text-body text-ink-2">
          Participants never sign in here. Use the study link you were given; it opens the study with your participant code.
        </p>
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <StaffNoteForDeployment />
        </Suspense>
      </aside>
    </div>
  );
}
