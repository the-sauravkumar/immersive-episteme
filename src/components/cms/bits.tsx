import { Archive, CircleCheck, CircleDashed, CircleX, Clock, FileSearch, PencilLine } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { CHECK_CLASS } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { FieldMessage } from "./action-form";

export const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  under_review: "Under review",
  verified: "Verified",
  published: "Published",
  rejected: "Rejected",
  needs_evidence: "Needs evidence",
  archived: "Archived",
};

const STATE_STYLE: Record<string, { variant: "neutral" | "ok" | "warn" | "danger"; Icon: typeof CircleCheck }> = {
  draft: { variant: "neutral", Icon: PencilLine },
  under_review: { variant: "warn", Icon: Clock },
  needs_evidence: { variant: "warn", Icon: FileSearch },
  verified: { variant: "ok", Icon: CircleCheck },
  published: { variant: "ok", Icon: CircleCheck },
  rejected: { variant: "danger", Icon: CircleX },
  archived: { variant: "neutral", Icon: Archive },
};

export function StateBadge({ state, className }: { state: string; className?: string }) {
  const s = STATE_STYLE[state] ?? { variant: "neutral" as const, Icon: CircleDashed };
  return (
    <Badge variant={s.variant} className={className} data-state-badge={state}>
      <s.Icon aria-hidden="true" />
      {STATE_LABELS[state] ?? state.replace(/_/g, " ")}
    </Badge>
  );
}

export const LINK = "text-turmeric underline decoration-1 underline-offset-[0.2em] hover:text-turmeric-hi hover:decoration-2";
export const ROW_LINK = cn(LINK, "hit-44 inline-block");
export const BLOCK_LINK = cn(LINK, "inline-flex min-h-11 items-center");

export const CHECK_ROW = "flex min-h-11 cursor-pointer items-center gap-3 t-b text-lime";
export const CHECK_BOX = CHECK_CLASS;

export const PROVENANCE_LABELS: Record<string, string> = {
  practitioner_testimony: "Practitioner testimony",
  historical_documentation: "Historical documentation",
  scientific_evidence: "Scientific evidence",
  researcher_interpretation: "Researcher interpretation",
  hypothesis: "Hypothesis",
  unverified: "Unverified",
};

export { NativeSelect } from "@/components/ui/native-select";
export { Disclosure } from "@/components/ui/disclosure";

export function breakableKey(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(?<=[._\-/:])/).forEach((part, i) => {
    if (i > 0) out.push(<wbr key={`s${i}`} />);
    for (let j = 0; j < part.length; j += 16) {
      if (j > 0) out.push(<wbr key={`c${i}-${j}`} />);
      out.push(part.slice(j, j + 16));
    }
  });
  return out;
}

export function Mono({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <code title={title} className={cn("t-table font-semibold wrap-anywhere [overflow-wrap:break-word] text-lime-dim", className)}>
      {typeof children === "string" ? breakableKey(children) : children}
    </code>
  );
}

export function FormField({ id, name, label, hint, children, className }: { id: string; name: string; label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="t-s text-lime-dim">
          {hint}
        </p>
      ) : null}
      <FieldMessage name={name} id={`${id}-error`} />
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  actions,
  id,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id ? `${id}-title` : undefined}
      id={id}
      className={cn("flex min-w-0 scroll-mt-(--sticky-chrome) flex-col gap-4 border border-lime-dim bg-vat p-4 xs:p-6", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex max-w-[40rem] min-w-0 flex-col gap-1">
          <h2 id={id ? `${id}-title` : undefined} className="t-label text-lime">
            {titleCase(title)}
          </h2>
          {description ? <div className="t-b text-lime-dim">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function RunningHead({ children, id, as: Tag = "h3" }: { children: ReactNode; id?: string; as?: "h3" | "h4" | "p" }) {
  return (
    <Tag id={id} className="t-label border-b border-line pb-1">
      {typeof children === "string" ? titleCase(children) : children}
    </Tag>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="t-b text-lime-dim">{children}</p>;
}

export function FilterBar({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <form method="get" aria-label={label} className={cn("flex flex-wrap items-end gap-x-4 gap-y-3", className)}>
      {children}
    </form>
  );
}

export function Pager({ base, params, page, total, pageSize }: { base: string; params: Record<string, string | undefined>; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${base}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-x-6 gap-y-1 t-label text-lime">
      {page > 1 ? (
        <Link className={BLOCK_LINK} href={href(page - 1)}>
          Previous page
        </Link>
      ) : null}
      <span className="tabular-nums text-lime-dim">
        Page {page} of {pages} ({total} items)
      </span>
      {page < pages ? (
        <Link className={BLOCK_LINK} href={href(page + 1)}>
          Next page
        </Link>
      ) : null}
    </nav>
  );
}

const fmtStamp = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const fmtDay = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });

export function stamp(at: string | Date, withTime = true): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const parts = Object.fromEntries((withTime ? fmtStamp : fmtDay).formatToParts(d).map((p) => [p.type, p.value]));
  return withTime ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : `${parts.year}-${parts.month}-${parts.day}`;
}

export function Stamp({ at, withTime = true }: { at: string | Date; withTime?: boolean }) {
  const d = typeof at === "string" ? new Date(at) : at;
  return (
    <time dateTime={d.toISOString()} className="t-table font-semibold wrap-anywhere tabular-nums whitespace-nowrap text-lime-dim">
      {stamp(d, withTime)}
    </time>
  );
}

export function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export type SearchParams = Record<string, string | string[] | undefined>;
