import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startPublicDemo } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Explore" };

const OPTIONS = [
  {
    condition: "2d",
    title: "Conventional pages",
    description: "Browse the demo knowledge base through structured pages and links.",
  },
  {
    condition: "immersive",
    title: "Immersive museum",
    description: "Walk through the demo knowledge base arranged as a museum.",
  },
] as const;

async function UnavailableNotice({ searchParams }: { searchParams: PageProps<"/explore">["searchParams"] }) {
  const { demo } = await searchParams;
  if (demo !== "unavailable") return null;
  return (
    <Alert className="mb-6">
      <AlertDescription>
        The demo is not available at the moment, for example while a study is running. Please try again later.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Public demo entry. Starting a demo sets a signed, non-experimental demo cookie: nothing done
 * in a demo counts as study data. Refused while a participant study session is open, and
 * whenever the server-side demo policy is off (by default while a real study is running).
 */
export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <>
      <PageHeader
        kicker="Explore"
        title="Explore the demo"
        description="Try both ways of learning with demonstration content. This is not part of a study and nothing you do is recorded as study data."
      />
      <Suspense fallback={null}>
        <UnavailableNotice searchParams={searchParams} />
      </Suspense>
      <div className="grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <Card key={o.condition} className="shadow-card">
            <CardHeader>
              <CardTitle className="font-display text-2xl font-medium">
                <h2>{o.title}</h2>
              </CardTitle>
              <CardDescription>{o.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={startPublicDemo}>
                <input type="hidden" name="condition" value={o.condition} />
                <Button type="submit" size="lg" className="min-h-11 px-5">
                  Open {o.title.toLowerCase()}
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
