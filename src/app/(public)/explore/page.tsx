/**
 * Explore (DESIGN.md 11.3): the public demo entry.
 *
 * PageHeader with the honest lede; a full-width "What Is the Same" strip above both cards; two
 * equal cards (2D always first and left, a fixed order documented on the Colophon), each with a
 * 16:10 line-art schematic (never a screenshot, so neither condition looks richer), a Source Serif
 * title, a description in a reserved three-line zone and a 44 px primary button pinned to the card
 * bottom; then "Before You Start" with the controls of each condition in two equal booktabs
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
    ["See the traditions and sections", "Contents, in the top bar"],
    ["Open a concept", "Select its link"],
    ["Related concepts", "Links at the end of each page"],
    ["Neighbouring concepts", "Previous and Next"],
    ["Open a source record", "Source, under a statement; Escape closes it"],
    ["Enlarge a figure", "Enlarge, under the figure; Close or Escape returns"],
  ],
  immersive: [
    ["See the rooms", "Plan, in the top bar"],
    ["Walk", "W and S, or ↑ and ↓"],
    ["Turn", "A and D, or ← and →"],
    ["Look around", "Drag with the mouse or a finger"],
    ["Open an exhibit", "A wall panel, or the “In this room” list"],
    ["Open a source record", "Source, under a statement; Escape closes it"],
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
 * Row height of the two side-by-side tables (md and wider): room for two lines in every row, so a
 * task that wraps in one condition's table never pushes its rows below the other's and both tables
 * end on one rule (no cell runs to three lines from 768 px; asserted in public-pages.spec.ts).
 */
const ROW_H = "h-11 md:h-14";

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
            <TableHead scope="row" className={`${ROW_H} py-2 align-top font-sans text-sm font-medium tracking-normal text-ink normal-case whitespace-normal`}>
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
        eyebrow="Explore"
        title="Explore the demo"
        description="Try both ways of learning with demonstration content. This is not part of a study and nothing you do is recorded as study data."
      />
      <Suspense fallback={null}>
        <UnavailableNotice searchParams={searchParams} />
      </Suspense>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="same-heading" data-slot="same-strip" className="border border-l-4 border-rule border-l-indigo bg-surface px-5 py-4 xs:px-6">
          {/* A lead-in, not a heading: the strip is a callout above the cards, and a third h2 size
              would put the card titles (26 px, 11.3) above a smaller section h2 of the same level. */}
          <p id="same-heading" className="text-h3 text-ink">
            {titleCase("What is the same")}
          </p>
          <p className="text-body mt-1 text-ink-2">
            Same claims, citations, figures, typefaces, controls and timer. Different: how you move through the knowledge.
          </p>
        </section>

        <ul className="grid gap-6 md:grid-cols-2" aria-label="The two conditions">
          {OPTIONS.map((o) => (
            <li key={o.condition} className="flex">
              <Card parallel className="w-full">
                <CardContent>
                  <ConditionSchematic condition={o.condition} />
                </CardContent>
                <CardHeader>
                  <CardTitle className="font-serif text-[1.625rem] leading-8 font-semibold">
                    <h2>{titleCase(o.title)}</h2>
                  </CardTitle>
                  <CardDescription className="min-h-[3lh]">{o.description}</CardDescription>
                </CardHeader>
                {/* mt-auto (CardFooter) pins the action to the card bottom, so both buttons line up. */}
                <CardFooter>
                  <form action={startPublicDemo}>
                    <input type="hidden" name="condition" value={o.condition} />
                    <Button type="submit">Open {o.title.toLowerCase()}</Button>
                  </form>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <section aria-labelledby="before-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 border-t-2 border-madder pt-4 hc:border-ink">
          <h2 id="before-heading" className="text-h2 text-ink">
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
