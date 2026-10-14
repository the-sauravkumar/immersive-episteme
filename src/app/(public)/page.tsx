import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const conditions = [
  {
    key: "2d",
    title: "Conventional pages",
    description: "Linear, text-and-image learning pages.",
  },
  {
    key: "immersive",
    title: "Immersive museum",
    description: "A navigable 3D gallery compiled from the same knowledge model.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 py-8">
      <header className="flex flex-col gap-4">
        <p className="kicker">Research platform</p>
        <h1 className="font-display text-hero font-light text-balance">Immersive Episteme</h1>
        <p className="max-w-prose text-reading text-ink-soft">
          Two experimentally controlled learning conditions share one knowledge model, one study
          engine and one set of assessments.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="min-h-11 px-5">
            <Link href="/study">Take part in a study</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-11 px-5">
            <Link href="/explore">Explore the demo</Link>
          </Button>
        </div>
      </header>

      <section aria-labelledby="conditions-heading" className="flex flex-col gap-4">
        <h2 id="conditions-heading" className="kicker">
          Learning conditions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {conditions.map((c) => (
            <Card key={c.key} className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-2xl font-medium">{c.title}</CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">In development</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
