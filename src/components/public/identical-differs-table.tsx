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
  ["Spatial organisation", "2D: a sequence of panels. 3D: a route of working yards"],
  ["Navigation", "2D: Next, Back and the woven strip. 3D: walking along a one-way route, with back allowed"],
];

function Group({ head, rows }: { head: string; rows: readonly [string, string][] }) {
  return (
    <TableBody>
      <TableRow className="border-b border-b-line">
        <TableHead scope="colgroup" colSpan={2} className="h-11 pt-4 text-lime">
          {head}
        </TableHead>
      </TableRow>
      {rows.map(([aspect, how]) => (
        <TableRow key={aspect}>
          <TableHead scope="row" className="h-11 py-2 align-top t-table font-bold text-lime whitespace-normal">
            {aspect}
          </TableHead>
          <TableCell className="align-top whitespace-normal text-lime-dim">{how}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

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
