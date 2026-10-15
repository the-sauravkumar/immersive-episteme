import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BLOCK_LINK, Empty, Mono, NativeSelect, Disclosure } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { titleCase } from "@/lib/text/title-case";
import { AUDIT_PAGE_SIZE, auditEntities, parseAuditFilter, queryAuditLog, type AuditFilter, type AuditRow } from "@/server/admin/audit-log";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Audit Log" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <ConsolePage
      path="/admin/audit"
      title="Audit log"
      description="Append-only record of privileged actions. Database triggers reject every update, delete and truncate of this table, so entries can be read but never changed."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AuditLog searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

function hrefFor(f: AuditFilter, page: number): string {
  const p = new URLSearchParams();
  for (const k of ["action", "entity", "actor", "q", "from", "to"] as const) {
    const v = f[k];
    if (v) p.set(k, v);
  }
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/admin/audit?${s}` : "/admin/audit";
}

/*
 * DESIGN.md 9.3: under 640 px the log switches to stacked label/value cards (one DOM; the labels
 * show only there). Explicit ARIA table roles keep the table semantics when the display changes.
 */
const STACK = {
  table: "max-sm:block max-sm:[&>caption]:block max-sm:[&>thead]:sr-only max-sm:[&>tbody]:block",
  row: "max-sm:flex max-sm:flex-col max-sm:gap-2 max-sm:py-4",
  cell: "max-sm:grid max-sm:h-auto max-sm:grid-cols-[5.5rem_minmax(0,1fr)] max-sm:items-baseline max-sm:gap-x-3 max-sm:p-0",
  label: "text-label sm:hidden",
};

function CellLabel({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className={STACK.label}>
      {titleCase(children)}
    </span>
  );
}

/** "2026-10-14 09:30:12": seconds kept, because the log orders events that can fall in one minute. */
function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="text-id whitespace-nowrap text-ink tabular-nums">
      {iso.slice(0, 19).replace("T", " ")}
    </time>
  );
}

/** The before and after states as a --sunk mono block behind one 44 px disclosure (11.11). The 1 px --rule border keeps the block distinct when the hovered row is --sunk too. */
function DataChange({ row }: { row: AuditRow }) {
  const parts = [
    { label: "Before", value: row.before },
    { label: "After", value: row.after },
  ].filter((p) => p.value !== null && p.value !== undefined);
  if (!parts.length) return null;
  const summary = parts.length === 2 ? "Before and after" : parts[0]!.label === "Before" ? "Before (removed state)" : "After (new state)";
  return (
    <Disclosure className="group/data" summary={<>{summary}</>}>
      <div className="mt-2 flex flex-col gap-3">
        {parts.map((p) => (
          <div key={p.label} className="flex min-w-0 flex-col gap-1">
            <p className="text-label">{p.label}</p>
            <pre className="text-id max-h-64 overflow-auto rounded-control border border-rule bg-sunk p-3 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
              {JSON.stringify(p.value, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </Disclosure>
  );
}

async function AuditLog({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("admin.audit");
  const filter = parseAuditFilter(await searchParams);
  const pool = getPool();
  const [page, entities] = await Promise.all([queryAuditLog(pool, actor, filter), auditEntities(pool, actor)]);
  const filtered = (["action", "entity", "actor", "q", "from", "to"] as const).some((k) => filter[k]);
  const field = "flex min-w-0 flex-col gap-1.5";
  const first = (page.page - 1) * AUDIT_PAGE_SIZE + 1;
  const last = first + page.rows.length - 1;
  return (
    <div className="flex flex-col gap-8">
      <form method="get" action="/admin/audit" aria-label="Filter the audit log" className="flex flex-col gap-4 border-b border-rule pb-6">
        <p className="text-label">Filters</p>
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className={field}>
            <Label htmlFor="f-action">Action starts with</Label>
            <Input id="f-action" name="action" defaultValue={filter.action ?? ""} placeholder="e.g. cms. or admin.role" />
          </div>
          <div className={field}>
            <Label htmlFor="f-entity">Entity</Label>
            <NativeSelect id="f-entity" name="entity" defaultValue={filter.entity ?? ""}>
              <option value="">Any</option>
              {entities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={field}>
            <Label htmlFor="f-actor">Actor id</Label>
            <Input id="f-actor" name="actor" defaultValue={filter.actor ?? ""} autoComplete="off" spellCheck={false} />
          </div>
          <div className={field}>
            <Label htmlFor="f-q">Reason contains</Label>
            <Input id="f-q" name="q" defaultValue={filter.q ?? ""} />
          </div>
          <div className={field}>
            <Label htmlFor="f-from">From (UTC date)</Label>
            <Input id="f-from" name="from" type="date" aria-describedby="f-from-hint" defaultValue={filter.from ?? ""} className="tabular-nums" />
            <p id="f-from-hint" className="text-credit">
              Format: YYYY-MM-DD
            </p>
          </div>
          <div className={field}>
            <Label htmlFor="f-to">To (UTC date, inclusive)</Label>
            <Input id="f-to" name="to" type="date" aria-describedby="f-to-hint" defaultValue={filter.to ?? ""} className="tabular-nums" />
            <p id="f-to-hint" className="text-credit">
              Format: YYYY-MM-DD
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit">Apply filters</Button>
          {filtered ? (
            <Button asChild variant="outline">
              <Link href="/admin/audit">Clear filters</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {page.rows.length === 0 ? (
        <Empty>{filtered ? "No entries match these filters." : "No entries yet."}</Empty>
      ) : (
        <Table
          role="table"
          caption="Audit Entries"
          number={1}
          hoverRows
          className={STACK.table}
          note={`Entries ${first} to ${last}, newest first, ${AUDIT_PAGE_SIZE} per page${filtered ? ", filtered" : ""}. Times are UTC.`}
        >
          <TableHeader role="rowgroup">
            <TableRow role="row">
              <TableHead role="columnheader" scope="col">
                When (UTC)
              </TableHead>
              <TableHead role="columnheader" scope="col">
                Actor
              </TableHead>
              <TableHead role="columnheader" scope="col">
                Action
              </TableHead>
              <TableHead role="columnheader" scope="col">
                Entity
              </TableHead>
              <TableHead role="columnheader" scope="col">
                Reason and data
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody role="rowgroup">
            {page.rows.map((r) => (
              <TableRow role="row" key={r.id} className={`align-top ${STACK.row}`}>
                <TableCell role="cell" className={`${STACK.cell} align-top sm:py-3`}>
                  <CellLabel>when</CellLabel>
                  <When iso={r.occurredAt} />
                </TableCell>
                <TableCell role="cell" className={`${STACK.cell} align-top sm:py-3`}>
                  <CellLabel>actor</CellLabel>
                  <span className="min-w-0">
                    <span className="block text-ink">{r.actorName ?? r.actorId ?? "—"}</span>
                    <span className="text-credit block">
                      {r.actorKind}
                      {r.actorName && r.actorId ? (
                        <>
                          {", "}
                          <Mono className="text-ink-3">{r.actorId}</Mono>
                        </>
                      ) : null}
                    </span>
                  </span>
                </TableCell>
                <TableCell role="cell" className={`${STACK.cell} align-top sm:min-w-[14rem] sm:py-3`}>
                  <CellLabel>action</CellLabel>
                  <Mono className="text-ink">{r.action}</Mono>
                </TableCell>
                <TableCell role="cell" className={`${STACK.cell} align-top sm:min-w-[12rem] sm:py-3`}>
                  <CellLabel>entity</CellLabel>
                  <span className="min-w-0">
                    <span className="block text-ink">{r.entity}</span>
                    {r.entityId ? <Mono className="block text-ink-3">{r.entityId}</Mono> : null}
                  </span>
                </TableCell>
                <TableCell role="cell" className={`${STACK.cell} align-top sm:min-w-[16rem] sm:py-3`}>
                  <CellLabel>reason</CellLabel>
                  <span className="min-w-0">
                    {r.reason ? <span className="block text-ink">{r.reason}</span> : <span className="block text-ink-3">No reason recorded</span>}
                    <DataChange row={r} />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {page.page > 1 || page.hasNext ? (
        <nav aria-label="Audit log pages" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-ui">
          {page.page > 1 ? (
            <Link className={BLOCK_LINK} href={hrefFor(filter, page.page - 1)}>
              Newer entries
            </Link>
          ) : null}
          <span className="text-ink-2 tabular-nums">Page {page.page}</span>
          {page.hasNext ? (
            <Link className={BLOCK_LINK} href={hrefFor(filter, page.page + 1)}>
              Older entries
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
