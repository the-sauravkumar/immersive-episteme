import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { InviteForm } from "@/components/access/invite-form";
import { Skeleton } from "@/components/ui/skeleton";
import { inviteNextPath } from "@/lib/access/invite-paths";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Invite Required", robots: { index: false } };

export default function InvitePage({ searchParams }: PageProps<"/invite">) {
  return (
    <div className="grid gap-x-6 gap-y-10 py-4 lg:grid-cols-12">
      <section aria-labelledby="invite-title" className="flex flex-col gap-6 lg:col-span-5">
        <header className="flex flex-col gap-2">
          <h1 id="invite-title" className="t-h3 text-lime">
            {titleCase("Enter your invite code")}
          </h1>
          <p className="t-b text-lime-dim">This research platform is open by invitation only.</p>
        </header>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <InviteFormFromParams searchParams={searchParams} />
        </Suspense>
      </section>
      <aside aria-label="About invites" className="flex flex-col gap-4 lg:col-span-5 lg:col-start-7 lg:pt-14">
        <h2 className="t-label text-lime">{titleCase("Where do I find a code?")}</h2>
        <p className="t-b text-lime-dim">
          The research team sends invite links and codes. If you were given a link, opening it again lets you in without typing anything. You are asked only once in
          this browser.
        </p>
        <p className="t-b text-lime-dim">
          Research team members do not need a code:{" "}
          <Link className="text-turmeric underline decoration-1 underline-offset-[0.2em] hover:decoration-2" href="/sign-in">
            sign in
          </Link>
          .
        </p>
      </aside>
    </div>
  );
}

async function InviteFormFromParams({ searchParams }: { searchParams: PageProps<"/invite">["searchParams"] }) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <InviteForm next={inviteNextPath(first(sp.next))} refused={first(sp.error) === "invalid"} />;
}
