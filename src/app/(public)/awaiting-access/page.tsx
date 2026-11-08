import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Button } from "@/components/ui/button";
import { AWAITING_ACCESS_PATH, STAFF_HOME } from "@/lib/permissions/console-routes";
import { titleCase } from "@/lib/text/title-case";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Awaiting Access", robots: { index: false } };

async function AwaitingAccess() {
  const principal = await requireStaff({ next: AWAITING_ACCESS_PATH });
  if (principal.roles.length > 0) redirect(STAFF_HOME);
  return (
    <section aria-labelledby="awaiting-access-title" className="flex w-full max-w-[40rem] flex-col items-start gap-4 py-4">
      <h1 id="awaiting-access-title" className="t-h3 text-lime">
        {titleCase("Your account is waiting for an administrator")}
      </h1>
      <p className="t-b text-lime">
        You are signed in, but this account has no role yet, so no part of the staff console is open to it. An Admin gives you a role on the People page; ask one to do it. Nothing is given automatically.
      </p>
      <p className="t-b text-lime-dim">Once a role has been added, open your console again. Taking part in a study needs no account: use the study link you were given.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <a href={STAFF_HOME}>Open your console</a>
        </Button>
        <SignOutButton variant="outline" />
      </div>
    </section>
  );
}

export default function AwaitingAccessPage() {
  return (
    <Suspense fallback={<GateFallback label="Loading…" />}>
      <AwaitingAccess />
    </Suspense>
  );
}
