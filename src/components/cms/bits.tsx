/**
 * Small presentational pieces shared by the CMS pages (server-safe), in the Apparatus console skin
 * (DESIGN.md 9.1-9.5, 11.10):
 *  - status badges always carry a word and an icon (R-A4), coloured ok / warn / danger only in the
 *    console; no madder anywhere in the CMS;
 *  - every control is 44 px (inputs, native selects, buttons); links inside dense tables keep a
 *    44 x 44 hit area (`hit-44`) on a 36 px row;
 *  - sections are --surface cards (the "CMS form pane" of 4.2) with Title Case headings;
 *  - empty states are a plain sentence, never a dashed box (9.16: PlaceholderNotice removed).
 */
import { Archive, CircleCheck, CircleDashed, CircleX, Clock, FileSearch, PencilLine } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
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

/** Review state as a word plus an icon (never colour alone). */
export function StateBadge({ state, className }: { state: string; className?: string }) {
  const s = STATE_STYLE[state] ?? { variant: "neutral" as const, Icon: CircleDashed };
  return (
    <Badge variant={s.variant} className={className} data-state-badge={state}>
      <s.Icon aria-hidden="true" />
      {STATE_LABELS[state] ?? state.replace(/_/g, " ")}
    </Badge>
  );
}

/** Indigo underlined text link (links are never colour alone, R-A4). */
export const LINK = "text-indigo underline decoration-1 underline-offset-[3px] hover:text-indigo-hover hover:decoration-2";
/** A link inside a dense table cell: same look, a 44 x 44 hit area on a 36 px row. */
export const ROW_LINK = cn(LINK, "hit-44 inline-block");
/** A free-standing link: a 44 px target on its own line. */
export const BLOCK_LINK = cn(LINK, "inline-flex min-h-11 items-center");

/** A native checkbox or radio inside a full-row 44 px label (9.5); the indigo fill marks the checked state. */
export const CHECK_ROW = "flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink";
export const CHECK_BOX = "size-5 shrink-0 accent-(--indigo)";

/** Provenance kinds as words (server-safe, so server components can read it). */
export const PROVENANCE_LABELS: Record<string, string> = {
  practitioner_testimony: "Practitioner testimony",
  historical_documentation: "Historical documentation",
  scientific_evidence: "Scientific evidence",
  researcher_interpretation: "Researcher interpretation",
  hypothesis: "Hypothesis",
  unverified: "Unverified",
};

/** A <summary> as a 44 px disclosure control (indigo, underlined, never colour alone). */
export const SUMMARY = cn(LINK, "inline-flex min-h-11 cursor-pointer items-center");

/**
 * Native select in the Input skin (DESIGN.md 9.5): 44 px, rule-strong border, surface fill, 16 px
 * text. No `outline-none`: the global :focus-visible ring (9.1, R-A5) must reach it.
 */
export const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-control border border-rule-strong bg-surface px-3 font-sans text-base leading-6 text-ink disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink-3 aria-invalid:border-danger";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(SELECT_CLASS, className)} {...props} />;
}

/**
 * Line-break opportunities for a mono identifier: after ".", "-", "_", "/" and ":" only, so a key
 * such as `ajrakh.process.double-sided-registration` never splits mid-word; a separator-free run
 * longer than 16 characters (a hex hash) may break every 16 characters.
 */
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

/**
 * Mono identifier (keys, ids, hashes): breaks only at separators (`breakableKey`), never mid-word.
 * `overflow-wrap: break-word` is a last resort that does not shrink the column's min-content width,
 * so table columns keep room for whole key segments (unlike `break-all`).
 */
export function Mono({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <code title={title} className={cn("text-mono [overflow-wrap:break-word] text-ink-2", className)}>
      {typeof children === "string" ? breakableKey(children) : children}
    </code>
  );
}

/** Label + control + hint + validation message, wired with ids for assistive tech. */
export function FormField({ id, name, label, hint, children, className }: { id: string; name: string; label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-credit">
          {hint}
        </p>
      ) : null}
      <FieldMessage name={name} id={`${id}-error`} />
    </div>
  );
}

/** A console section: a --surface card with a Title Case h2, an optional lead and actions. */
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
      className={cn("flex min-w-0 scroll-mt-(--sticky-chrome) flex-col gap-4 rounded-card border border-rule bg-surface p-4 xs:p-6", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex max-w-[40rem] min-w-0 flex-col gap-1">
          <h2 id={id ? `${id}-title` : undefined} className="text-h3 text-ink">
            {titleCase(title)}
          </h2>
          {description ? <div className="text-body text-ink-2">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A running head inside a section (`text-eyebrow`), for grouped content. */
export function RunningHead({ children, id, as: Tag = "h3" }: { children: ReactNode; id?: string; as?: "h3" | "h4" | "p" }) {
  return (
    <Tag id={id} className="text-eyebrow border-b border-rule pb-1">
      {typeof children === "string" ? titleCase(children) : children}
    </Tag>
  );
}

/** Empty state: one plain sentence (no dashed box). */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-body text-ink-3">{children}</p>;
}

/** A GET filter bar: labelled 44 px controls on one wrapping row, the button on their baseline. */
export function FilterBar({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <form method="get" aria-label={label} className={cn("flex flex-wrap items-end gap-x-4 gap-y-3", className)}>
      {children}
    </form>
  );
}

/** Previous / next links that keep the other query parameters. */
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
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-ui text-ink">
      {page > 1 ? (
        <Link className={BLOCK_LINK} href={href(page - 1)}>
          Previous page
        </Link>
      ) : null}
      <span className="tabular-nums text-ink-2">
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

/** UTC timestamp in mono, tabular figures. */
const fmtStamp = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const fmtDay = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });

/** "2026-10-14 09:30" (UTC) as ISO-like text, so columns of times line up. */
export function stamp(at: string | Date, withTime = true): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const parts = Object.fromEntries((withTime ? fmtStamp : fmtDay).formatToParts(d).map((p) => [p.type, p.value]));
  return withTime ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : `${parts.year}-${parts.month}-${parts.day}`;
}

export function Stamp({ at, withTime = true }: { at: string | Date; withTime?: boolean }) {
  const d = typeof at === "string" ? new Date(at) : at;
  return (
    <time dateTime={d.toISOString()} className="text-mono tabular-nums whitespace-nowrap text-ink-2">
      {stamp(d, withTime)}
    </time>
  );
}

export function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export type SearchParams = Record<string, string | string[] | undefined>;
