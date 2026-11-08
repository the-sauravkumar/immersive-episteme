import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startPublicDemo } from "@/server/auth/actions";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Explore" };

const LIST = "t-b flex list-disc flex-col gap-2 pl-6 text-lime-dim marker:text-lime-dim";

async function UnavailableNotice({ searchParams }: { searchParams: PageProps<"/explore">["searchParams"] }) {
  const { demo } = await searchParams;
  if (demo !== "unavailable") return null;
  return (
    <Alert className="mb-8">
      <Info aria-hidden="true" />
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>
        The demo is not available at the moment, for example while a study is running. Please try again later.
      </AlertDescription>
    </Alert>
  );
}

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        title="Explore the demo"
        description="Try the learning task with demonstration content. This is not part of a study and nothing you do is recorded as study data."
      />
      <Suspense fallback={null}>
        <UnavailableNotice searchParams={searchParams} />
      </Suspense>

      <section aria-labelledby="demo-heading" data-slot="demo-entry" className="flex max-w-[48rem] flex-col gap-4 bg-vat-2 p-4 xs:p-8">
        <h2 id="demo-heading" className="t-h4 text-lime">
          {titleCase("The learning task")}
        </h2>
        <p className="t-b text-lime-dim">
          The demo opens the learning task the way a study participant meets it: the stages of each study tradition in order, with the sources
          behind every caption. Your browser keeps the same task until you end the demo.
        </p>
        <form action={startPublicDemo} className="mt-2">
          <Button type="submit">Open the demo</Button>
        </form>
      </section>

      <section aria-labelledby="before-heading" className="flex max-w-[48rem] flex-col gap-4">
        <h2 id="before-heading" className="t-h4 text-lime">
          {titleCase("Before you start")}
        </h2>
        <ul className={LIST}>
          <li>Go through every stage in order. Back returns to any stage you have reached.</li>
          <li>Each caption has its sources behind it. Open them to see where the words come from.</li>
          <li>Help explains how to go on, and Pause keeps your place.</li>
          <li>Finish appears at the last stop. End demo, at the top of the page, closes the demo at any time.</li>
        </ul>
      </section>
    </div>
  );
}
