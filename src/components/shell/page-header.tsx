import type { ReactNode } from "react";

/** Page title block shared by every shell. Exactly one h1 per page. */
export function PageHeader({
  title,
  kicker,
  description,
  actions,
}: {
  title: string;
  kicker?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-prose flex-col gap-2">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1 className="font-display text-title font-medium text-balance">{title}</h1>
        {description ? <div className="text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Marks a route that exists and is guarded but whose feature is not built yet. */
export function PlaceholderNotice({ children }: { children?: ReactNode }) {
  return (
    <section
      aria-label="Not yet implemented"
      className="rounded-lg border border-dashed border-input bg-card px-5 py-6 text-sm text-muted-foreground"
    >
      {children ?? "This screen is a placeholder. The route and its access rules are in place."}
    </section>
  );
}
