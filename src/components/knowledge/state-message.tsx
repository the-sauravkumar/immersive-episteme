/**
 * StateMessage (DESIGN.md 9.7): the ONE error, empty, unavailable and loading layout of the study
 * surfaces, imported by both conditions (12.1 rule 1) and by the study flow: the 2D
 * content-unavailable and practice-unavailable pages, every 3D screen (help, paused, context lost,
 * failed, no WebGL, loading) and the /study state messages.
 *
 * Layout: a 40rem column on opaque `--ground`, the h1 or h2 in `text-title` (h1) or `text-h2` (h2),
 * one sentence in `text-reading`, then at most one row of 44 px actions. No hero icon (DR-022):
 * only the error tone carries a 24 px `--danger` icon, beside the heading's words (R-A4). No
 * motion. Loading is a static line, never a pulse.
 *
 * Server-safe (no hooks): a caller that needs focus management passes refs to its own actions.
 */
import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export type StateMessageTone = "info" | "error" | "done";

const TONE_ICONS: Record<StateMessageTone, LucideIcon> = { info: Info, error: CircleAlert, done: CircleCheck };

export interface StateMessageProps {
  /** Heading id; the region is labelled by it. */
  id: string;
  title: string;
  /** h1 when the message is the view's only heading, else h2. */
  level?: 1 | 2;
  tone?: StateMessageTone;
  /** An icon for the error tone (24 px, beside the heading); other tones show none. */
  icon?: LucideIcon;
  /** The one sentence (or a short paragraph group) for the reader. */
  children?: ReactNode;
  /** Optional secondary line (protocol or technical detail), in `text-source`. */
  detail?: ReactNode;
  /** Content between the body and the actions (a static progress line, a controls table). */
  extra?: ReactNode;
  /** 44 px actions. */
  action?: ReactNode;
  /** Where the action row sits: start (default) or end (the study flow puts Continue on the right, 11.7). */
  actionAlign?: "start" | "end";
  /** Announce the message: `alert` for errors that interrupt, `status` for outcomes. */
  live?: "alert" | "status" | "region";
  /** Column width: the 40rem study column (default) or the full width of the parent. */
  column?: boolean;
  slot?: string;
  className?: string;
}

export function StateMessage({ id, title, level = 1, tone = "info", icon, children, detail, extra, action, actionAlign = "start", live, column = true, slot = "state-message", className }: StateMessageProps) {
  const Icon = icon ?? TONE_ICONS[tone];
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section
      aria-labelledby={id}
      role={live}
      data-slot={slot}
      data-tone={tone}
      className={cn("flex flex-col items-start text-ink", column && "mx-auto w-full max-w-[40rem]", className)}
    >
      <div className="flex items-start gap-3">
        {tone === "error" ? <Icon aria-hidden="true" strokeWidth={1.75} className={cn("size-6 shrink-0 text-danger", level === 1 ? "mt-2.5" : "mt-1")} /> : null}
        <Heading id={id} className={cn("text-ink", level === 1 ? "text-title" : "text-h2")}>
          {titleCase(title)}
        </Heading>
      </div>
      {children ? <div className="text-reading mt-3 max-w-[34rem] text-ink-2">{children}</div> : null}
      {detail ? <p className="text-source mt-3 max-w-[34rem] break-words">{detail}</p> : null}
      {extra ? <div className="w-full">{extra}</div> : null}
      {action ? <div className={cn("mt-8 flex w-full flex-wrap gap-3", actionAlign === "end" && "justify-end")}>{action}</div> : null}
    </section>
  );
}
