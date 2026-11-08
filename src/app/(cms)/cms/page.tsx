import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Empty, ROW_LINK, Section, Stamp, StateBadge, StateLegend, STATE_LABELS } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { PublishReleaseGuide, ReviewContentGuide } from "@/components/shell/staff-guides";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions/can";
import { VERIFICATION_STATES } from "@/lib/validation/enums";
import { requirePermission } from "@/server/auth/staff";
import { overviewCounts, reviewQueue, type ReviewItem } from "@/server/cms/queries";
import { releaseReadiness } from "@/server/cms/release";
import { itemsAuthoredBy } from "@/server/cms/workflow";
import { getPool } from "@/server/db/client";

import { reviewHref, REVIEW_KIND_LABEL } from "./review/links";

export const metadata: Metadata = { title: "Content Home" };

export const instant = false;

export default function Page() {
  return (
    <ConsolePage path="/cms" title="Content home" description="What waits for your review, what came back to you, and the steps for reviewing content and publishing a release.">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Home />
      </Suspense>
    </ConsolePage>
  );
}

const SHOWN = 8;

function ItemList({ items, empty }: { items: readonly ReviewItem[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col">
      {items.slice(0, SHOWN).map((i) => (
        <li key={`${i.kind}-${i.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line py-2 first:border-t-0">
          <span className="min-w-0">
            <span className="t-s text-lime-dim">{REVIEW_KIND_LABEL[i.kind]}: </span>
            <Link href={reviewHref(i)} className={ROW_LINK}>
              {i.label}
            </Link>
          </span>
          <span className="flex items-center gap-2 t-s text-lime-dim">
            <StateBadge state={i.state} />
            <Stamp at={i.updatedAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}

async function Home() {
  const principal = await requirePermission("content.read");
  const pool = getPool();
  const mayReview = can(principal, "content.review");
  const [open, returnedAll, counts, readiness] = await Promise.all([
    mayReview ? reviewQueue(pool, { state: "under_review" }) : Promise.resolve([]),
    reviewQueue(pool, { states: ["needs_evidence", "rejected"] }),
    overviewCounts(pool),
    releaseReadiness(pool),
  ]);
  const authored = await itemsAuthoredBy(pool, principal.userId, [...open, ...returnedAll]);
  const waiting = open.filter((i) => !authored.has(`${i.kind}:${i.id}`));
  const returned = returnedAll.filter((i) => authored.has(`${i.kind}:${i.id}`));
  const unverified = Object.values(counts).reduce((n, c) => n + (c.under_review ?? 0) + (c.needs_evidence ?? 0), 0);
  const rows = [
    ["Traditions", counts.traditions, "/cms/traditions"],
    ["Concepts", counts.concepts, "/cms/concepts"],
    ["Relationships", counts.relationships, "/cms/relations"],
    ["Sources", counts.sources, "/cms/sources"],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        {mayReview ? (
          <Section
            id="waiting"
            title="Waiting for your review"
            description={`${waiting.length} item${waiting.length === 1 ? "" : "s"} written by someone else. Your own work is reviewed by another curator.`}
            actions={
              waiting.length > SHOWN ? (
                <Link className={ROW_LINK} href="/cms/review?state=under_review">
                  All {waiting.length}
                </Link>
              ) : null
            }
          >
            <ItemList items={waiting} empty="Nothing waits for your review." />
          </Section>
        ) : null}
        <Section
          id="returned"
          title="Came back to you"
          description="Your items a reviewer sent back. Open one to read the reviewer's reason, fix it and submit it again."
        >
          <ItemList items={returned} empty="None of your items came back." />
        </Section>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ReviewContentGuide waiting={waiting.length} returned={returned.length} />
        <PublishReleaseGuide unverified={unverified} refusals={readiness.refusals.length} mayPublish={can(principal, "content.publish")} />
      </div>

      <Section id="states" title="Where the content stands" description="Shipped content counted by review state. Demo items are left out.">
        <Table density="compact" hoverRows caption="Content by Review State" number={1}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Kind</TableHead>
              {VERIFICATION_STATES.map((s) => (
                <TableHead key={s} scope="col" numeric>
                  {STATE_LABELS[s]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([label, c, href]) => (
              <TableRow key={label}>
                <TableHead scope="row">
                  <Link className={ROW_LINK} href={href}>
                    {label}
                  </Link>
                </TableHead>
                {VERIFICATION_STATES.map((s) => (
                  <TableCell key={s} numeric>
                    {c[s] ?? 0}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <StateLegend states={VERIFICATION_STATES} />
      </Section>
    </div>
  );
}
