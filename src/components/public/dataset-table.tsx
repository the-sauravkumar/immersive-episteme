/**
 * The dataset at a glance (DESIGN.md 11.1 "Dataset at a Glance", 11.2 "Dataset and Citation
 * Standard"): a booktabs table of live counts by tradition, in the canonical order, numbers
 * right-aligned in tabular lining figures (R-T5, R-T11). Public pages.
 *
 * Seven rows or fewer, so no row rules (9.3: omitted for 6 rows or fewer on public pages; the
 * shared-concept row and the total sit in the footer). Every value comes from `DatasetStats`,
 * read from the database at request time.
 */
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DatasetStats } from "@/server/public/dataset-stats";
import { titleCase } from "@/lib/text/title-case";

import { formatCount } from "./figure-one";

/**
 * Fits 358 px (390 px viewport) without scrolling its region: headers may wrap, and under 520 px
 * the cells keep 8 px instead of 12 px of horizontal padding (asserted in public-pages.spec.ts).
 */
const HEAD = "whitespace-normal max-xs:px-2 max-xs:first:pl-0 max-xs:last:pr-0";
const CELL = "max-xs:px-2 max-xs:first:pl-0 max-xs:last:pr-0";

export function DatasetTable({ stats, number, title = "Knowledge Dataset by Tradition" }: { stats: DatasetStats; number: number; title?: string }) {
  const { totals, shared } = stats;
  return (
    <Table
      caption={title}
      number={number}
      rowRules={false}
      note={
        <>
          Live counts of the records in the platform database, demonstration records excluded. Sources: the distinct sources cited by the
          claims. Concepts verified or published by curators:{" "}
          <span className="tabular-nums">{formatCount(totals.verifiedConcepts)}</span> of <span className="tabular-nums">{formatCount(totals.concepts)}</span>; the rest are under
          review. A source cited by several traditions is counted once in the total.
        </>
      }
    >
      <TableHeader>
        <TableRow>
          <TableHead className={HEAD}>Tradition</TableHead>
          <TableHead numeric className={HEAD}>
            Concepts
          </TableHead>
          <TableHead numeric className={HEAD}>
            Claims
          </TableHead>
          <TableHead numeric className={HEAD}>
            Sources
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stats.traditions.map((t) => (
          <TableRow key={t.slug} data-tradition-key={t.slug}>
            <TableCell className={`whitespace-normal ${CELL}`}>
              <TraditionName traditionKey={t.slug}>{titleCase(t.shortName)}</TraditionName>
            </TableCell>
            <TableCell numeric className={CELL}>{formatCount(t.concepts)}</TableCell>
            <TableCell numeric className={CELL}>{formatCount(t.claims)}</TableCell>
            <TableCell numeric className={CELL}>{formatCount(t.sourcesCited)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        {shared.concepts > 0 ? (
          <TableRow className="font-normal">
            <TableCell className={`whitespace-normal ${CELL}`}>Shared (no single tradition)</TableCell>
            <TableCell numeric className={CELL}>{formatCount(shared.concepts)}</TableCell>
            <TableCell numeric className={CELL}>{formatCount(shared.claims)}</TableCell>
            <TableCell numeric className={CELL}>{formatCount(shared.sourcesCited)}</TableCell>
          </TableRow>
        ) : null}
        <TableRow className="border-t border-t-ink">
          <TableCell className={`font-semibold ${CELL}`}>Total</TableCell>
          <TableCell numeric className={`font-semibold ${CELL}`}>
            {formatCount(totals.concepts)}
          </TableCell>
          <TableCell numeric className={`font-semibold ${CELL}`}>
            {formatCount(totals.claims)}
          </TableCell>
          <TableCell numeric className={`font-semibold ${CELL}`}>
            {formatCount(totals.sourcesCited)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
