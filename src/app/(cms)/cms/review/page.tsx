import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Empty, NativeSelect, one, PROVENANCE_LABELS, Section, StateBadge, StateLegend, type SearchParams, ROW_LINK, Stamp } from "@/components/cms/bits";
import { HistoryList } from "@/components/cms/history-list";
import { RelationshipTable } from "@/components/cms/relationship-table";
import { TransitionPanel } from "@/components/cms/transition-panel";
import { ConsolePage } from "@/components/shell/gates";
import { ReviewContentGuide } from "@/components/shell/staff-guides";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/server/auth/staff";
import { edgeIssues } from "@/server/cms/graph";
import { entityHistory, relationshipsWhere, reviewQueue, userNames } from "@/server/cms/queries";
import { itemsAuthoredBy, reviewOptions } from "@/server/cms/workflow";
import { getPool } from "@/server/db/client";

import { reviewHref, REVIEW_KIND_LABEL } from "./links";

export const metadata: Metadata = { title: "Review Queue" };

export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/review">) {
  return (
    <ConsolePage
      path="/cms/review"
      title="Review queue"
      description="Items waiting for a decision. Nobody verifies their own work: items marked yours go to another curator. Verified content reaches learners only through a published release."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

async function Queue({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePermission("content.review");
  const sp = await searchParams;
  const kind = one(sp.kind);
  const state = one(sp.state);
  const pool = getPool();
  const items = await reviewQueue(pool, { kind, state });
  const [names, authored] = await Promise.all([userNames(pool, items.flatMap((i) => [i.createdBy, i.updatedBy])), itemsAuthoredBy(pool, principal.userId, items)]);
  const rel = one(sp.rel);
  const waiting = items.filter((i) => i.state === "under_review" && !authored.has(`${i.kind}:${i.id}`)).length;
  const returned = items.filter((i) => i.state === "needs_evidence" && authored.has(`${i.kind}:${i.id}`)).length;

  return (
    <div className="flex flex-col gap-6">
      {rel ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <RelationshipReview id={rel} principal={principal} />
        </Suspense>
      ) : null}
      {rel ? null : <ReviewContentGuide waiting={waiting} returned={returned} />}
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter the queue">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-kind">Kind</Label>
          <NativeSelect id="q-kind" name="kind" defaultValue={kind ?? ""} className="w-44">
            <option value="">All</option>
            {Object.entries(REVIEW_KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-state">State</Label>
          <NativeSelect id="q-state" name="state" defaultValue={state ?? ""} className="w-48">
            <option value="">Under review and needs evidence</option>
            <option value="under_review">Under review</option>
            <option value="needs_evidence">Needs evidence</option>
            <option value="verified">Verified (awaiting release)</option>
            <option value="draft">Draft</option>
            <option value="rejected">Rejected</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      <StateLegend states={["under_review", "needs_evidence", "verified", "rejected"]} />

      {items.length === 0 ? (
        <Empty>Nothing is waiting.</Empty>
      ) : (
        <Table density="compact" hoverRows caption={<>{items.length} item(s), most recently changed first. Items marked “yours” were written, edited or linked by you at some point, so another curator must verify them.</>}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Kind</TableHead>
              <TableHead scope="col">Item</TableHead>
              <TableHead scope="col">Author / last editor</TableHead>
              <TableHead scope="col">Changed (UTC)</TableHead>
              <TableHead scope="col">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => {
              const mine = authored.has(`${i.kind}:${i.id}`);
              return (
                <TableRow key={`${i.kind}-${i.id}`}>
                  <TableCell>{REVIEW_KIND_LABEL[i.kind]}</TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link href={reviewHref(i)} className={ROW_LINK}>
                      {i.label}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {[i.createdBy, i.updatedBy].filter((x, n, a) => x && a.indexOf(x) === n).map((x) => names.get(x!) ?? x).join(" / ") || "import"}
                    {mine ? <span className="ml-1 t-s text-lime-dim">(yours)</span> : null}
                  </TableCell>
                  <TableCell>
                    <Stamp at={i.updatedAt} />
                  </TableCell>
                  <TableCell>
                    <StateBadge state={i.state} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

async function RelationshipReview({ id, principal }: { id: string; principal: Awaited<ReturnType<typeof requirePermission>> }) {
  const pool = getPool();
  const [row] = await relationshipsWhere(pool, "r.id = $1", [id]).catch(() => []);
  if (!row) return <Empty>That relationship does not exist.</Empty>;
  const [issues, review, history] = await Promise.all([edgeIssues(pool, id), reviewOptions(pool, principal, "relationship", id, row.state), entityHistory(pool, "relationship", id)]);
  return (
    <div id="relationship" className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Section id="rel-detail" title="Relationship under review" description={<StateBadge state={row.state} />}>
        <RelationshipTable rows={[row]} perspective="both" />
        <dl className="grid gap-1 t-b">
          <dt className="font-medium">Kind of evidence</dt>
          <dd>{PROVENANCE_LABELS[row.provenanceKind] ?? row.provenanceKind.replace(/_/g, " ")}</dd>
          <dt className="font-medium">Evidence</dt>
          <dd>
            {row.sources.length ? (
              <ul className="flex flex-col gap-2">
                {row.sources.map((s) => (
                  <li key={s.sourceId}>
                    {s.label} — {s.locator ?? "no locator"}
                    <blockquote className="t-b bg-vat-2 px-4 py-3 text-lime">“{s.quote ?? "no quotation"}”</blockquote>
                  </li>
                ))}
              </ul>
            ) : (
              "No source cited."
            )}
          </dd>
          <dt className="font-medium">Automatic checks</dt>
          <dd>
            {issues.length === 0
              ? "No problems found."
              : issues.map((i, n) => (
                  <p key={n}>
                    {i.severity === "error" ? "Must fix: " : i.severity === "warning" ? "Check: " : "Note: "}
                    {i.message}
                  </p>
                ))}
          </dd>
        </dl>
      </Section>
      <div className="flex flex-col gap-6">
        <Section id="rel-review" title="Decision">
          <TransitionPanel entityKind="relationship" entityId={row.id} options={review.options} blockedVerify={review.blockedVerify} problems={review.problems} />
        </Section>
        <Section id="rel-history" title="History">
          <HistoryList entries={history} />
        </Section>
      </div>
    </div>
  );
}
