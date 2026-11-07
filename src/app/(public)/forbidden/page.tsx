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
        Your roles do not include the permission this page needs. Ask a platform administrator if you think this is wrong.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <a href="/console">Go to your console</a>
        </Button>
        <SignOutButton variant="outline" />
      </div>
    </section>
  );
}
