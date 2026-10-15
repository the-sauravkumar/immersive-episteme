import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BLOCK_LINK, Section, STATE_LABELS, ROW_LINK } from "@/components/cms/bits";
import { cn } from "@/lib/utils";
import { ConsolePage } from "@/components/shell/gates";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions/can";
import { VERIFICATION_STATES } from "@/lib/validation/enums";
import { requirePermission } from "@/server/auth/staff";
import { graphIntegrity } from "@/server/cms/graph";
import { listSnapshots, overviewCounts } from "@/server/cms/queries";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Content Overview" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <ConsolePage path="/cms" title="Content overview" description="State of the knowledge base: what is drafted, waiting for review, verified and published.">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Overview />
      </Suspense>
    </ConsolePage>
  );
}

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

async function Overview() {
  const principal = await requirePermission("content.read");
  const pool = getPool();
  const [counts, snapshots, integrity] = await Promise.all([overviewCounts(pool), listSnapshots(pool), graphIntegrity(pool, 0)]);
  const releases = snapshots.filter((s) => s.kind === "release" && s.status === "published");
  const latestReview = snapshots.find((s) => s.kind === "review");
  const rows = [
    ["Traditions", counts.traditions, "/cms/traditions"],
    ["Concepts", counts.concepts, "/cms/concepts"],
    ["Relationships", counts.relationships, "/cms/relations"],
    ["Sources", counts.sources, "/cms/sources"],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <Table density="compact" hoverRows caption={<>Real (non-demo) content by review state. Imported content arrives as under review or needs evidence; only curators verify it.</>}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Entity</TableHead>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="integrity" title="Knowledge-graph integrity" description="Validator results over everything in the review pipeline (what the next release would contain).">
          <p className="text-body">
            <strong>{integrity.counts.error}</strong> error(s), <strong>{integrity.counts.warning}</strong> warning(s), {integrity.counts.info} note(s). A release is refused while any error remains.
          </p>
          {can(principal, "graph.edit") ? (
            <Link className={cn(BLOCK_LINK, "mt-auto self-start")} href="/cms/relations">
              Open the relationship editor and issue list
            </Link>
          ) : null}
        </Section>
        <Section id="versions" title="Dataset versions" description="Studies pin an immutable, published release snapshot.">
          <p className="text-body">
            {releases.length ? (
              <>
                Latest release: <strong>{releases[0]!.versionLabel}</strong>, published {releases[0]!.publishedAt ? fmt.format(new Date(releases[0]!.publishedAt)) : "?"} UTC ({releases.length} in total).
              </>
            ) : (
              "No release has been published yet."
            )}
          </p>
          {latestReview ? <p className="text-body text-ink-3">Latest review snapshot (not publishable): {latestReview.versionLabel}.</p> : null}
          {can(principal, "content.publish") ? (
            <Link className={cn(BLOCK_LINK, "mt-auto self-start")} href="/cms/datasets">
              Release readiness and versions
            </Link>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
