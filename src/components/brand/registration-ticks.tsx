/**
 * Registration ticks (DESIGN.md 7.3): four L-shaped corner marks after the printer's corner
 * registration marks that align successive blocks (R-C9). Public plates, the Colophon and the CMS
 * proof frame ONLY. Never in study mode, in either condition: the study figure frame is a plain
 * 1 px `--rule` box in both.
 *
 * Each tick is a 12 x 12 px L, 1.5 px `--ink` stroke with square caps, its corner 6 px outside the
 * framed box's corner (globals.css `.ie-tick*`). Hidden in high contrast and forced colours.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function RegistrationTicks() {
  return (
    <span className="ie-ticks" aria-hidden="true" data-slot="registration-ticks">
      <svg className="ie-tick ie-tick--tl" width="12" height="12" viewBox="0 0 12 12" focusable="false">
        <path d="M0.75 12 V0.75 H12" />
      </svg>
      <svg className="ie-tick ie-tick--tr" width="12" height="12" viewBox="0 0 12 12" focusable="false">
        <path d="M0 0.75 H11.25 V12" />
      </svg>
      <svg className="ie-tick ie-tick--bl" width="12" height="12" viewBox="0 0 12 12" focusable="false">
        <path d="M0.75 0 V11.25 H12" />
      </svg>
      <svg className="ie-tick ie-tick--br" width="12" height="12" viewBox="0 0 12 12" focusable="false">
        <path d="M0 11.25 H11.25 V0" />
      </svg>
    </span>
  );
}

/**
 * A box framed by registration ticks. The ticks sit 6 px outside the box, so callers keep at
 * least 6 px of space around it (the page gutter is 16 px or more, so a full-width frame never
 * causes horizontal scroll).
 */
export function TickedFrame({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "figure" | "section";
}) {
  return (
    <Tag data-slot="ticked-frame" className={cn("relative", className)}>
      {children}
      <RegistrationTicks />
    </Tag>
  );
}
