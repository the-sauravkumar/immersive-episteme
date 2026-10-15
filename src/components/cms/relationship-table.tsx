import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RelationshipRow } from "@/server/cms/queries";

import { Empty, Mono, ROW_LINK, StateBadge } from "./bits";

/** Typed relationships of a concept as a dense booktabs table (DESIGN.md 9.3, 11.10). */
export function RelationshipTable({ rows, perspective, labelledBy }: { rows: RelationshipRow[]; perspective: "outgoing" | "incoming" | "both"; labelledBy?: string }) {
  if (!rows.length) return <Empty>None.</Empty>;
  return (
    <Table density="compact" hoverRows aria-labelledby={labelledBy} label={labelledBy ? undefined : "Relationships"}>
      <TableHeader>
        <TableRow>
          {perspective !== "outgoing" ? <TableHead scope="col">From</TableHead> : null}
          <TableHead scope="col">Type</TableHead>
          {perspective !== "incoming" ? <TableHead scope="col">To</TableHead> : null}
          <TableHead scope="col">Explanation</TableHead>
          <TableHead scope="col">Evidence</TableHead>
          <TableHead scope="col">State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            {perspective !== "outgoing" ? (
              <TableCell className="min-w-40 whitespace-normal">
                <Link className={ROW_LINK} href={`/cms/concepts/${r.sourceId}`}>
                  {r.sourceTitle}
                </Link>
              </TableCell>
            ) : null}
            <TableCell className="whitespace-nowrap">
              <Mono>{r.typeCode}</Mono>
              {r.ordinal !== null ? <span className="tabular-nums text-ink-2"> #{r.ordinal}</span> : null}
            </TableCell>
            {perspective !== "incoming" ? (
              <TableCell className="min-w-40 whitespace-normal">
                <Link className={ROW_LINK} href={`/cms/concepts/${r.targetId}`}>
                  {r.targetTitle}
                </Link>
              </TableCell>
            ) : null}
            <TableCell className="min-w-56 whitespace-normal">
              {r.explanation ?? <span className="text-ink-3">None</span>}
              {r.conditions ? <span className="text-credit block">Conditions: {r.conditions}</span> : null}
            </TableCell>
            <TableCell className="text-credit min-w-40 whitespace-normal">
              {r.sources.length ? r.sources.map((s) => `${s.label.split(": ")[0]}, ${s.locator ?? "no locator"}`).join("; ") : "None"}
            </TableCell>
            <TableCell>
              <StateBadge state={r.state} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
