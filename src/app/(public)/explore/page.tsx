import type { Metadata } from "next";
import { Suspense } from "react";

import { ConditionSchematic } from "@/components/public/condition-schematic";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { startPublicDemo } from "@/server/auth/actions";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Explore" };

const OPTIONS = [
  {
    condition: "2d",
    title: "Visual course",
    description: "Go through each tradition as a sequence of panels, one per stage, with Next and Back.",
  },
  {
    condition: "immersive",
    title: "Walkthrough",
    description: "Walk the same stages as a route of working yards, with the same words and images.",
  },
] as const;

const CONTROLS: Record<"2d" | "immersive", readonly [string, string][]> = {
  "2d": [
    ["Go on", "Next, at the bottom right"],
    ["Go back", "Back, or a woven part of the strip"],
    ["Open the sources", "Sources Behind This Caption, under the caption"],
    ["Help or pause", "The buttons at the top of the panel"],
  ],
  immersive: [
    ["Go on", "Walk On, or W and the Up arrow key"],
    ["Go back", "Back, or the B key"],
    ["Open the sources", "Sources, at the top right"],
    ["Help or pause", "The buttons at the top right"],
  ],
};

async function UnavailableNotice({ searchParams }: { searchParams: PageProps<"/explore">["searchParams"] }) {
  const { demo } = await searchParams;
  if (demo !== "unavailable") return null;
  return (
    <Alert className="mb-8">
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>
        The demo is not available at the moment, for example while a study is running. Please try again later.
      </AlertDescription>
    </Alert>
  );
}

const ROW_H = "h-11 md:h-[3.625rem]";

function ControlsTable({ condition, number }: { condition: "2d" | "immersive"; number: number }) {
  const title = condition === "2d" ? "Controls of the Visual Course" : "Controls of the Walkthrough";
  return (
    <Table caption={title} number={number} rowRules className="table-fixed">
      <colgroup>
        <col className="w-[45%]" />
        <col />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">To</TableHead>
          <TableHead scope="col">Use</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {CONTROLS[condition].map(([task, how]) => (
          <TableRow key={task}>
            <TableHead scope="row" className={`${ROW_H} py-2 align-top t-table font-bold text-lime whitespace-normal`}>
              {task}
            </TableHead>
            <TableCell className={`${ROW_H} align-top whitespace-normal text-lime-dim`}>{how}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        title="Explore the demo"
        description="Try both ways of learning with demonstration content. This is not part of a study and nothing you do is recorded as study data."
      />
      <Suspense fallback={null}>
        <UnavailableNotice searchParams={searchParams} />
      </Suspense>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="same-heading" data-slot="same-strip" className="max-w-[48rem]">
          <p id="same-heading" className="t-label text-lime">
            {titleCase("What is the same")}
          </p>
          <p className="t-l text-lime-dim mt-1">
            Same claims, citations, figures, type and timer. Only how you move through the knowledge differs.
          </p>
        </section>

        <ul className="grid gap-6 md:grid-cols-2" aria-label="The two conditions">
          {OPTIONS.map((o) => (
            <li key={o.condition} data-slot="card" data-parallel="true" className="flex flex-col gap-4 border-t-[1.5px] border-lime pt-4">
              <div className="bg-vat-2 p-4">
                <ConditionSchematic condition={o.condition} />
              </div>
              <h2 className="t-h4 text-lime">{titleCase(o.title)}</h2>
              <p className="t-b min-h-[3lh] text-lime-dim">{o.description}</p>
              <form action={startPublicDemo} className="mt-auto" data-slot="card-footer">
                <input type="hidden" name="condition" value={o.condition} />
                <Button type="submit">Open {o.title.toLowerCase()}</Button>
              </form>
            </li>
          ))}
        </ul>
      </div>

      <section aria-labelledby="before-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 pt-2">
          <h2 id="before-heading" className="t-h4 text-lime">
            {titleCase("Before you start")}
          </h2>
          <p className="t-b max-w-[40rem] text-lime-dim">
            Both conditions share the same top bar: Time left, Hint and Finish where a task sets them. These are the controls that differ.
          </p>
        </div>
        <div className="grid gap-10 md:grid-cols-2 md:gap-6">
          <ControlsTable condition="2d" number={1} />
          <ControlsTable condition="immersive" number={2} />
        </div>
      </section>
    </div>
  );
}
