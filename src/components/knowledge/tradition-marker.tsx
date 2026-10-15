/**
 * Neutral tradition marker (DESIGN.md 7.7, 12.3 rule 13; parity check P17).
 *
 * Every tradition named in text may carry this marker, and it is IDENTICAL for all six keys: a
 * 10 x 10 px square, 1.5 px `--ink` border, no fill, `margin-inline-end: 6px`,
 * `vertical-align: -1px`, `aria-hidden` (globals.css `.ie-marker`). There are no tradition
 * colours, icons or motifs anywhere (R-C16), so the component deliberately takes no styling
 * input that could vary by tradition. `traditionKey` only adds a data attribute for tests.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function TraditionMarker({ traditionKey }: { traditionKey?: string }) {
  return <span aria-hidden="true" data-slot="tradition-marker" data-tradition-key={traditionKey} className="ie-marker" />;
}

/** A tradition name preceded by the marker, kept on one line. */
export function TraditionName({
  children,
  traditionKey,
  className,
}: {
  children: ReactNode;
  traditionKey?: string;
  className?: string;
}) {
  return (
    <span data-slot="tradition-name" className={cn("inline-flex items-baseline", className)}>
      <TraditionMarker traditionKey={traditionKey} />
      <span>{children}</span>
    </span>
  );
}
