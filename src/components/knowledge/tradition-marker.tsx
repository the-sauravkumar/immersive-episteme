/**
 * Tradition name (DESIGN.md 12.3 rule 13; parity check P17, DR-022).
 *
 * A tradition is named in words only. The Apparatus neutral square marker is removed for all six
 * keys ("If a dot requires explanation, a text label was probably the right call"), so P17 is
 * now "no marker on any key". There are no tradition colours, icons or motifs anywhere (R-C16);
 * the component takes no styling input that could vary by tradition, and `traditionKey` only
 * adds a data attribute for tests.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A tradition name, kept on one line where it fits. */
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
    <span data-slot="tradition-name" data-tradition-key={traditionKey} className={cn("inline", className)}>
      {children}
    </span>
  );
}
