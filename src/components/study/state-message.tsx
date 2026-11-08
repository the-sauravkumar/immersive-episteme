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
  id: string;
  title: string;
  tone?: StudyMessageTone;
  level?: 1 | 2;
  children: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  live?: "alert" | "status";
  className?: string;
}) {
  return (
    <StateMessage id={id} title={title} tone={tone} level={level} detail={detail} action={action} actionAlign="end" live={live} column={false} slot="study-state-message" className={className}>
      {children}
    </StateMessage>
  );
}
