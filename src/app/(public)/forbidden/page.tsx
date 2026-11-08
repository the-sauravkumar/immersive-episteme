import type { Metadata } from "next";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Not Allowed", robots: { index: false } };

export default function ForbiddenPage() {
  return (
    <section aria-labelledby="forbidden-title" className="flex w-full max-w-[40rem] flex-col items-start gap-4 py-4">
      <h1 id="forbidden-title" className="t-h3 text-lime">
        {titleCase("You do not have access to this page")}
      </h1>
      <p className="t-b text-lime">
        Your role does not open this page. Go back to your home page; if you need this page for your work, ask an Admin to change your role.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <a href="/console">Go to your home page</a>
        </Button>
        <SignOutButton variant="outline" />
      </div>
    </section>
  );
}
