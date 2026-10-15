/**
 * The study-flow state message (DESIGN.md 9.7, 11.7): the shared `StateMessage`
 * (src/components/knowledge/state-message.tsx), the one layout the learning surfaces of both
 * conditions use too, with the study flow's defaults: an h2 (study pages already carry the page
 * h1 in PageHeader), the parent's width (the study column) and the action row on the right
 * (Continue is right, 11.7).
 */
import type { ReactNode } from "react";

import { StateMessage, type StateMessageTone } from "@/components/knowledge/state-message";

export type StudyMessageTone = StateMessageTone;

export function StudyStateMessage({
  id,
  title,
  tone = "info",
  level = 2,
  children,
  detail,
  action,
  live,
  className,
}: {
  /** Heading id; the region is labelled by it. */
  id: string;
  title: string;
  tone?: StudyMessageTone;
  level?: 1 | 2;
  /** One sentence for the participant. */
  children: ReactNode;
  /** Optional line for the research team (protocol detail), set smaller in ink-3. */
  detail?: ReactNode;
  /** One 44 px action (a Button or a link styled as one). */
  action?: ReactNode;
  /** Announce the message: `alert` for errors that interrupt, `status` for outcomes. */
  live?: "alert" | "status";
  className?: string;
}) {
  return (
    <StateMessage id={id} title={title} tone={tone} level={level} detail={detail} action={action} actionAlign="end" live={live} column={false} slot="study-state-message" className={className}>
      {children}
    </StateMessage>
  );
}
