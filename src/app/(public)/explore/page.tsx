/**
 * Explore (DESIGN.md 11.3): the public demo entry.
 *
 * PageHeader with the honest lede; the "What is the same" note as an unboxed lead (DR-022); two
 * equal panels (2D always first and left, a fixed order documented on the Colophon), each with a
 * 16:10 line-art schematic (never a screenshot, so neither condition looks richer), a title, a
 * description in a reserved three-line zone and a 44 px primary button pinned to the bottom
 * (`mt-auto`); then "Before You Start" with the controls of each condition in two equal booktabs
 * tables, and the Display Settings button.
 *
 * Starting a demo sets a signed, non-experimental demo cookie (startPublicDemo): nothing done in a
 * demo counts as study data. Refused while a participant study session is open, and whenever the
 * server-side demo policy is off (by default while a real study is running).
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import { ConditionSchematic } from "@/components/public/condition-schematic";
import { PageHeader } from "@/components/shell/page-header";
import { DisplaySettings } from "@/components/shell/display-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { startPublicDemo } from "@/server/auth/actions";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Explore" };

const OPTIONS = [
  {
    condition: "2d",
    title: "Conventional pages",
    description: "Browse the demo knowledge base as pages: traditions, their sections and concepts, each concept a column of numbered, cited claims.",
  },
  {
    condition: "immersive",
    title: "Immersive museum",
    description: "Walk through the same demo knowledge base arranged as a museum: traditions as wings, sections as rooms, concepts as exhibits.",
  },
] as const;

/** The controls of each condition, from the shared onboarding wording (strings.ts) and the museum's controls help. */
const CONTROLS: Record<"2d" | "immersive", readonly [string, string][]> = {
  "2d": [
    ["See where you are", "In This Section, in the top bar"],
    ["See every section", "The index, on the left"],
    ["Go to another section", "Its row in the index"],
    ["Open a concept", "Select its link"],
    ["Close a concept", "Close, at the top of the concept"],
    ["Related concepts", "Links at the end of each page"],
    ["Neighbouring concepts", "Previous and Next"],
    ["Open a source record", "The number in brackets after a statement; Escape closes it"],
    ["Enlarge a figure", "Enlarge, under the figure; Close or Escape returns"],
  ],
  immersive: [
    ["See the rooms", "Plan, in the top bar"],
    ["See this room's exhibits", "In This Room, in the top bar"],
    ["Walk", "W and S, or the Up and Down arrow keys"],
    ["Turn", "A and D, or the Left and Right arrow keys"],
    ["Look around", "Drag, hold the right button, or press L"],
    ["Open an exhibit", "A wall panel, or the In This Room list"],
    ["Close an exhibit", "Close, at the top of the panel, or Escape"],
    ["Open a source record", "The number in brackets after a statement; Escape closes it"],
    ["Enlarge a figure", "Enlarge, under the figure; Close or Escape returns"],
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

/**
 * Row height of the two side-by-side tables (md and wider): room for two lines in every row (two
 * 20 px lines, 16 px of padding and the 1 px row rule), so a task that wraps in one condition's
 * table never pushes its rows below the other's and both tables end on one rule. Only the shared
 * rows (the source record and the figure, worded identically in both tables) run to three lines at
 * 768 px, and they do so in both (asserted in public-pages.spec.ts).
 */
const ROW_H = "h-11 md:h-[3.625rem]";

function ControlsTable({ condition, number }: { condition: "2d" | "immersive"; number: number }) {
  const title = condition === "2d" ? "Controls of the Conventional Pages" : "Controls of the Immersive Museum";
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
            <TableHead scope="row" className={`${ROW_H} py-2 align-top text-table font-bold text-ink whitespace-normal`}>
              {task}
            </TableHead>
            <TableCell className={`${ROW_H} align-top whitespace-normal text-ink-2`}>{how}</TableCell>
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
          {/* A lead-in, not a heading: an unboxed note above the panels, and a third h2 size would
              put the panel titles above a smaller section h2 of the same level. */}
          <p id="same-heading" className="text-h3 text-ink">
            {titleCase("What is the same")}
          </p>
          <p className="text-lead mt-1">
            Same claims, citations, figures, type and timer. Only how you move through the knowledge differs.
          </p>
        </section>

        <ul className="grid gap-6 md:grid-cols-2" aria-label="The two conditions">
          {OPTIONS.map((o) => (
            <li key={o.condition} data-slot="card" data-parallel="true" className="flex flex-col gap-4 border-t-[1.5px] border-ink pt-4">
              <div className="bg-sunk p-4">
                <ConditionSchematic condition={o.condition} />
              </div>
              <h2 className="text-display-3 text-ink">{titleCase(o.title)}</h2>
              <p className="text-body min-h-[3lh] text-ink-2">{o.description}</p>
              {/* mt-auto pins the action to the panel bottom, so both buttons line up. */}
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
          <h2 id="before-heading" className="text-display-3 text-ink">
            {titleCase("Before you start")}
          </h2>
          <p className="text-body max-w-[40rem] text-ink-2">
            Both conditions share the same top bar: Time left, Hint and Finish where a task sets them. These are the controls that differ.
          </p>
        </div>
        <div className="grid gap-10 md:grid-cols-2 md:gap-6">
          <ControlsTable condition="2d" number={1} />
          <ControlsTable condition="immersive" number={2} />
        </div>
        <div className="flex flex-col items-start gap-3 border-t border-rule pt-6 xs:flex-row xs:items-center">
          <p className="text-body text-ink-2">Change the theme, the contrast or the motion on this device:</p>
          <DisplaySettings zone="public" />
        </div>
      </section>
    </div>
  );
}
