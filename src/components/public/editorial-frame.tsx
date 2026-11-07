import type { ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export function EditorialFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-slot="editorial-frame" className={cn("flex w-full max-w-[52rem] flex-col gap-16", className)}>
      {children}
    </div>
  );
}

export function EditorialRow({ children, note, className }: { children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div data-slot="editorial-row" className={cn("lg:grid lg:grid-cols-[minmax(0,34rem)_15rem] lg:gap-x-12", className)}>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
      {note ? <div className="mt-3 lg:mt-0">{note}</div> : null}
    </div>
  );
}

export function EditorialSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} data-slot="editorial-section" className={cn("flex scroll-mt-8 flex-col gap-6", className)}>
      <header className="flex max-w-[34rem] flex-col gap-2 pt-2">
        <h2 id={headingId} className="t-h4 text-lime">
          {titleCase(title)}
        </h2>
      </header>
      {children}
    </section>
  );
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("t-b text-lime", className)}>{children}</p>;
}
