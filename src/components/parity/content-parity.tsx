import { CircleCheck, CircleX, Minus } from "lucide-react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContentParityRow } from "@/server/research/parity/summary";
import { cn } from "@/lib/utils";

function ParityStatus({ passed }: { passed: boolean | null }) {
  const Icon = passed === null ? Minus : passed ? CircleCheck : CircleX;
  const colour = passed === null ? "text-ink" : passed ? "text-ok" : "text-danger";
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium whitespace-nowrap", colour)}>
      <Icon aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
      {passed === null ? "Not run" : passed ? "Pass" : "Fail"}
    </span>
  );
}

export function ContentParity({ rows, number, studyHref }: { rows: ContentParityRow[]; number?: number; studyHref?: (studyId: string) => string }) {
  if (rows.length === 0) return <p className="text-body text-ink-2">No studies yet, so no content parity report exists.</p>;
  return (
    <Table caption="Content Parity by Study" number={number} label={number === undefined ? "Content parity by study" : undefined}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Study</TableHead>
          <TableHead scope="col">Snapshot</TableHead>
          <TableHead scope="col" numeric>
            Checks Passed
          </TableHead>
          <TableHead scope="col" numeric>
            Critical
          </TableHead>
          <TableHead scope="col">Recorded (UTC)</TableHead>
          <TableHead scope="col">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.studyId}>
            <TableCell className="min-w-48 whitespace-normal">
              {studyHref ? (
                <Link className="inline-flex min-h-11 items-center text-indigo underline underline-offset-[0.2em] hover:text-indigo-hover hover:decoration-2" href={studyHref(r.studyId)}>
                  {r.title}
                </Link>
              ) : (
                r.title
              )}
              <span className="text-id block text-ink-3">{r.slug}</span>
            </TableCell>
            <TableCell>{r.latest?.snapshotLabel ?? "–"}</TableCell>
            <TableCell numeric className="whitespace-nowrap">
              {r.latest ? `${r.latest.passedChecks} of ${r.latest.checks}` : "–"}
            </TableCell>
            <TableCell numeric>{r.latest ? r.latest.criticalFailures : "–"}</TableCell>
            <TableCell className="text-id whitespace-nowrap">{r.latest ? r.latest.createdAt.replace("T", " ").slice(0, 16) : "–"}</TableCell>
            <TableCell>
              <ParityStatus passed={r.latest ? r.latest.passed : null} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
