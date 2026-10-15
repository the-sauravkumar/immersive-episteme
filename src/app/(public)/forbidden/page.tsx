import type { Metadata } from "next";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Not Allowed", robots: { index: false } };

/**
 * Target of requirePermission() when a signed-in staff member lacks the permission. The
 * state-message layout (DESIGN.md 10.1, DR-022): no hero icon, the h1, one sentence and one
 * 44 px primary action (/console opens the first page this account's roles allow), with Sign out
 * as the secondary action.
 */
export default function ForbiddenPage() {
  return (
    <section aria-labelledby="forbidden-title" className="flex w-full max-w-[40rem] flex-col items-start gap-4 py-4">
      <h1 id="forbidden-title" className="text-title text-ink">
        {titleCase("You do not have access to this page")}
      </h1>
      <p className="text-reading text-ink">
        Your roles do not include the permission this page needs. Ask a platform administrator if you think this is wrong.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          {/* A route handler, not a page: a plain link, no prefetch. */}
          <a href="/console">Go to your console</a>
        </Button>
        <SignOutButton variant="outline" />
      </div>
    </section>
  );
}
