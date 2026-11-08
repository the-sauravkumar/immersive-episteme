import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export type StateMessageTone = "info" | "error" | "done";

const TONE_ICONS: Record<StateMessageTone, LucideIcon> = { info: Info, error: CircleAlert, done: CircleCheck };

export interface StateMessageProps {
  id: string;
  title: string;
  level?: 1 | 2;
  tone?: StateMessageTone;
  icon?: LucideIcon;
  children?: ReactNode;
  detail?: ReactNode;
  extra?: ReactNode;
  action?: ReactNode;
  actionAlign?: "start" | "end";
  live?: "alert" | "status" | "region";
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
      className={cn("flex flex-col items-start text-lime", column && "mx-auto w-full max-w-[40rem]", className)}
    >
      <div className="flex items-start gap-3">
        {tone === "error" ? <Icon aria-hidden="true" strokeWidth={1.75} className={cn("size-6 shrink-0 text-madder-text", level === 1 ? "mt-2.5" : "mt-1")} /> : null}
        <Heading id={id} className={cn("text-lime", level === 1 ? "t-h3" : "t-h4")}>
          {titleCase(title)}
        </Heading>
      </div>
      {children ? <div className="t-b mt-3 max-w-[34rem] text-lime-dim">{children}</div> : null}
      {detail ? <p className="t-s text-lime-dim mt-3 max-w-[34rem] break-words">{detail}</p> : null}
      {extra ? <div className="w-full">{extra}</div> : null}
      {action ? <div className={cn("mt-8 flex w-full flex-wrap gap-3", actionAlign === "end" && "justify-end")}>{action}</div> : null}
    </section>
  );
}
