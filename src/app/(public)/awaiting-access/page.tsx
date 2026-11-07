import type { Metadata } from "next";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { Button } from "@/components/ui/button";
import { STAFF_HOME } from "@/lib/permissions/console-routes";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Awaiting Access", robots: { index: false } };

export default function AwaitingAccessPage() {
  return (
    <section aria-labelledby="awaiting-access-title" className="flex w-full max-w-[40rem] flex-col items-start gap-4 py-4">
      <h1 id="awaiting-access-title" className="t-h3 text-lime">
        {titleCase("Your account is waiting for an administrator")}
      </h1>
      <p className="t-b text-lime">
        You are signed in, but this account has no role yet, so no part of the staff console is open to it. A platform administrator grants roles in Administration, Users. Nothing is granted automatically.
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
