import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Empty, NativeSelect, one, Section, StateBadge, type SearchParams, ROW_LINK, Mono, Stamp } from "@/components/cms/bits";
import { HistoryList } from "@/components/cms/history-list";
import { RelationshipTable } from "@/components/cms/relationship-table";
import { TransitionPanel } from "@/components/cms/transition-panel";
import { ConsolePage } from "@/components/shell/gates";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/server/auth/staff";
import { edgeIssues } from "@/server/cms/graph";
import { entityHistory, relationshipsWhere, reviewQueue, userNames, type ReviewItem } from "@/server/cms/queries";
import { reviewOptions } from "@/server/cms/workflow";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Review Queue" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/review">) {
  return (
    <ConsolePage
      path="/cms/review"
      title="Review queue"
      description="Items waiting for a decision. Editors cannot review, verify or publish; nobody verifies their own work. Content becomes published only through a release."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

const KIND_LABEL = { tradition: "Tradition", concept: "Concept", relationship: "Relationship", source: "Source" } as const;

function hrefFor(i: ReviewItem): string {
  switch (i.kind) {
    case "concept":
      return `/cms/concepts/${i.id}#review`;
    case "tradition":
      return `/cms/traditions?edit=${i.id}#tradition`;
    case "source":
      return `/cms/sources?edit=${i.id}#source`;
    case "relationship":
      return `/cms/review?rel=${i.id}#relationship`;
  }
}

async function Queue({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePermission("content.review");
  const sp = await searchParams;
  const kind = one(sp.kind);
  const state = one(sp.state);
  const pool = getPool();
  const items = await reviewQueue(pool, { kind, state });
  const names = await userNames(pool, items.flatMap((i) => [i.createdBy, i.updatedBy]));
  const rel = one(sp.rel);

  return (
    <div className="flex flex-col gap-6">
      {rel ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <RelationshipReview id={rel} principal={principal} />
        </Suspense>
      ) : null}
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter the queue">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-kind">Kind</Label>
          <NativeSelect id="q-kind" name="kind" defaultValue={kind ?? ""} className="w-44">
            <option value="">All</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
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

      {items.length === 0 ? (
        <Empty>Nothing is waiting.</Empty>
      ) : (
        <Table density="compact" hoverRows caption={<>{items.length} item(s), most recently changed first. Items marked “yours” were authored or last edited by you, so another curator must verify them.</>}>
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
              const mine = i.createdBy === principal.userId || i.updatedBy === principal.userId;
              return (
                <TableRow key={`${i.kind}-${i.id}`}>
                  <TableCell>{KIND_LABEL[i.kind]}</TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link href={hrefFor(i)} className={ROW_LINK}>
                      {i.label}
                    </Link>
                    {i.sub ? <Mono className="block">{i.sub}</Mono> : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {[i.createdBy, i.updatedBy].filter((x, n, a) => x && a.indexOf(x) === n).map((x) => names.get(x!) ?? x).join(" / ") || "import"}
                    {mine ? <span className="ml-1 text-credit">(yours)</span> : null}
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
        <dl className="grid gap-1 text-body">
          <dt className="font-medium">Provenance kind</dt>
          <dd>{row.provenanceKind.replace(/_/g, " ")}</dd>
          <dt className="font-medium">Evidence</dt>
          <dd>
            {row.sources.length ? (
              <ul className="flex flex-col gap-2">
                {row.sources.map((s) => (
                  <li key={s.sourceId}>
                    {s.label} — {s.locator ?? "no locator"}
                    <blockquote className="text-quote border-l-2 border-indigo pl-4 text-ink-2">“{s.quote ?? "no quotation"}”</blockquote>
                  </li>
                ))}
              </ul>
            ) : (
              "No source cited."
            )}
          </dd>
          <dt className="font-medium">Validator</dt>
          <dd>
            {issues.length === 0
              ? "No issues."
              : issues.map((i, n) => (
                  <p key={n}>
                    {i.severity} <code>{i.code}</code> {i.message}
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
