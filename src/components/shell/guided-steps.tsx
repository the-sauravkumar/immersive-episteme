import { CircleCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export interface GuideStep {
  readonly title: string;
  readonly body: ReactNode;
  readonly href?: string;
  readonly action?: string;
  readonly done?: boolean;
}

export function GuidedSteps({ id, title, intro, steps, className }: { id: string; title: string; intro?: ReactNode; steps: readonly GuideStep[]; className?: string }) {
  const next = steps.findIndex((s) => !s.done);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("flex min-w-0 scroll-mt-(--sticky-chrome) flex-col gap-4 border border-lime-dim bg-vat p-4 xs:p-6", className)}>
      <header className="flex max-w-[40rem] flex-col gap-1">
        <h2 id={`${id}-title`} className="t-label text-lime">
          {titleCase(title)}
        </h2>
        {intro ? <div className="t-b text-lime-dim">{intro}</div> : null}
      </header>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === next ? "step" : undefined}
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-start"
          >
            <span aria-hidden="true" className={cn("t-label tabular-nums", i === next ? "text-turmeric" : "text-lime-dim")}>
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="flex flex-wrap items-center gap-2 t-label text-lime">
                <span className="sr-only">Step {i + 1}: </span>
                {titleCase(s.title)}
                {s.done ? (
                  <Badge variant="ok">
                    <CircleCheck aria-hidden="true" />
                    Done
                  </Badge>
                ) : null}
              </h3>
              <div className="t-b text-lime-dim">{s.body}</div>
            </div>
            {s.href && s.action ? (
              <Button asChild variant={i === next ? "default" : "outline"} className="col-start-2 w-fit sm:col-start-3">
                <Link href={s.href}>{s.action}</Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
