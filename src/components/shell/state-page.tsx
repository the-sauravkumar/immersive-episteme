import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";

export function StatePage({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-labelledby="state-title" className="flex w-full max-w-[40rem] flex-col items-start gap-4 py-4">
      <h1 id="state-title" className="t-h3 text-lime">
        {titleCase(title)}
      </h1>
      {children}
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}

export function NotFoundState({ homeHref, homeLabel }: { homeHref: string; homeLabel: string }) {
  return (
    <StatePage
      title="Page not found"
      actions={
        <Button asChild>
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      }
    >
      <p className="t-b text-lime">There is no page at this address. The link may be mistyped, or what it pointed to may have been removed.</p>
    </StatePage>
  );
}
