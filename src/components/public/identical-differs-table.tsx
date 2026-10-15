/**
 * "Identical in Both Conditions" and "Differs by Design" (DESIGN.md 11.1, under Figure 1; 12.1
 * rule 3). A two-column booktabs table grouped under those two heads. The wording restates the
 * condition-parity rules of DESIGN.md 12; it describes the interface, not the craft.
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const IDENTICAL: readonly [string, string][] = [
  ["Claims", "The same cited claims, in the same order, from one knowledge snapshot"],
  ["Citations", "The same source note under every claim, opening the same record and verbatim quote"],
  ["Figures", "The same figures, in the same fixed 3:2 slot, with the same captions and credits"],
  ["Typefaces and sizes", "The same faces, sizes, line lengths and colours for every knowledge text"],
  ["Controls", "The same top bar, buttons and 44 px targets"],
  ["Timer", "The same fixed learning time, shown the same way"],
  ["Hints", "The same hint control and the same hint wording"],
];

const DIFFERS: readonly [string, string][] = [
  ["Spatial organisation", "2D: pages and sections. 3D: rooms of a walkable museum"],
  ["Navigation", "2D: contents and links. 3D: walking, the plan and links that walk to exhibits"],
];

function Group({ head, rows }: { head: string; rows: readonly [string, string][] }) {
  return (
    <TableBody>
      <TableRow className="border-b border-b-rule">
        <TableHead scope="colgroup" colSpan={2} className="h-11 pt-4 text-ink">
          {head}
        </TableHead>
      </TableRow>
      {rows.map(([aspect, how]) => (
        <TableRow key={aspect}>
          <TableHead scope="row" className="h-11 py-2 align-top font-sans text-sm font-medium tracking-normal text-ink normal-case whitespace-normal">
            {aspect}
          </TableHead>
          <TableCell className="align-top whitespace-normal text-ink-2">{how}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

/**
 * Un-numbered by default: it is the tabular companion of Figure 1, so the home page's numbered
 * table is the dataset table ("Table 1", 11.1). The caption is in Title Case already.
 */
export function IdenticalDiffersTable({ number }: { number?: number }) {
  return (
    <Table caption="What Is Identical and What Differs" number={number} className="table-fixed">
      <colgroup>
        <col className="w-[38%] xs:w-[30%]" />
        <col />
      </colgroup>
      <TableHeader className="sr-only">
        <TableRow>
          <TableHead scope="col">Aspect</TableHead>
          <TableHead scope="col">In the two conditions</TableHead>
        </TableRow>
      </TableHeader>
      <Group head="Identical in Both Conditions" rows={IDENTICAL} />
      <Group head="Differs by Design" rows={DIFFERS} />
    </Table>
  );
}
