/**
 * Research console building blocks (DESIGN.md 11.8, 9.3-9.5, 10). Console pages are "results
 * sections of a paper": sections under rules and running heads, booktabs tables, two-column
 * <dl> summaries, stat rows set as numbered tables, status badges with words and icons.
 * Headings pass through titleCase(); numbers are tabular and right-aligned.
 */
import { CircleAlert, CircleCheck, CircleDashed, FlaskConical, Info, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure as SharedDisclosure } from "@/components/ui/disclosure";
import { NativeSelect } from "@/components/ui/native-select";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";
import type { StudySummary } from "@/server/research/studies";

// ---------------------------------------------------------------------------------------------
// Form field classes (DESIGN.md 9.6): 44 px, 1 px --rule-strong, 4 px radius, paper, 16 px.
// Native controls are kept where a plain GET form must work without JavaScript; selects are the
// shared NativeSelect (9.2) and checkboxes and radios the shared `ie-check` skin.
// ---------------------------------------------------------------------------------------------

export const FIELD_LABEL = "font-sans text-[0.9375rem] leading-5 font-bold text-ink";
export const FIELD_HINT = "text-credit";
export const CONTROL =
  "w-full min-w-0 rounded-control border border-rule-strong bg-ground px-3 font-sans text-base leading-6 text-ink placeholder:text-ink-3 hover:not-disabled:border-ink-2 disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink-3 aria-invalid:border-danger";
export const TEXTAREA = cn(CONTROL, "min-h-24 py-2.5");
/** A full-row label (44 px) holding a 20 px checkbox or radio (DESIGN.md 9.6). */
export const CHECK_ROW = "flex min-h-11 cursor-pointer items-center gap-3 font-sans text-base leading-6 text-ink";
export const CHECK_BOX = "ie-check";
/** An inline indigo link, underlined (indigo vs ink is 1.62:1, so never colour alone, R-A4). */
export const LINK = "text-indigo underline decoration-1 underline-offset-[0.2em] hover:text-indigo-hover hover:decoration-2";
/** A text link that is also a 44 px target (rows, navigation lists). */
export const LINK_44 = cn(LINK, "inline-flex min-h-11 min-w-11 items-center");
/** A link styled as the 44 px outline button (downloads; DESIGN.md 9.1 outline variant). */
export const LINK_BUTTON =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-control border-[1.5px] border-ink bg-ground px-5 font-sans text-base leading-6 font-semibold text-ink hover:bg-sunk [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]";

/**
 * The shared disclosure (DESIGN.md 9.5) with an optional detail after the summary: a 44 px row
 * with the designed chevron and the state words "Show" and "Hide". Opens instantly; server-safe,
 * so it works without JavaScript.
 */
export function Disclosure({ summary, detail, children, open, className }: { summary: ReactNode; detail?: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <SharedDisclosure
      defaultOpen={open}
      className={cn("min-w-0", className)}
      summary={
        <span className="text-body block min-w-0 py-2.5 text-ink [overflow-wrap:anywhere]">
          <span className="font-semibold">{summary}</span>
          {detail ? <span className="text-ink-2"> {detail}</span> : null}
        </span>
      }
    >
      {children}
    </SharedDisclosure>
  );
}

export function FieldLabel({ label, hint, className, children, htmlFor }: { label: string; hint?: ReactNode; className?: string; children: ReactNode; htmlFor?: string }) {
  if (htmlFor)
    return (
      <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        <label htmlFor={htmlFor} className={FIELD_LABEL}>
          {label}
        </label>
        {children}
        {hint ? <span className={FIELD_HINT}>{hint}</span> : null}
      </div>
    );
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className={FIELD_LABEL}>{label}</span>
      {children}
      {hint ? <span className={FIELD_HINT}>{hint}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// Study picker
// ---------------------------------------------------------------------------------------------

/**
 * Chooses a study (DESIGN.md 9.2): the shared NativeSelect joined to a labelled action button,
 * "Show study" (WCAG SC 3.2.2 and technique H84: the view never changes on input), and a two-line
 * readout of the current study under it (the full title, then the key and state as words), so a
 * long title is never only truncated. A plain GET form: it works without JavaScript and keeps the
 * choice in the URL.
 */
export function StudyPicker({ studies, current, extra }: { studies: StudySummary[]; current: string | null; extra?: Record<string, string> }) {
  const chosen = studies.find((s) => s.id === current) ?? null;
  if (studies.length === 0) {
    return (
      <p className="text-body mb-8 text-ink-2">
        No studies yet.{" "}
        <Link className={LINK_44} href="/research/studies">
          Create one
        </Link>
        .
      </p>
    );
  }
  return (
    <form method="get" className="mb-10 flex max-w-[48rem] flex-col gap-2">
      <label htmlFor="study-picker" className={FIELD_LABEL}>
        Study
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          id="study-picker"
          name="study"
          defaultValue={current ?? undefined}
          aria-describedby={chosen ? "study-picker-readout" : undefined}
          className="w-full sm:w-auto sm:min-w-[22rem] sm:flex-1"
        >
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.isDemo ? " (demo)" : ""}
            </option>
          ))}
        </NativeSelect>
        {Object.entries(extra ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Button type="submit" variant="outline">
          Show study
        </Button>
      </div>
      {chosen ? (
        <div id="study-picker-readout" data-slot="study-picker-readout" className="flex flex-col">
          <p className="text-body font-bold text-ink [overflow-wrap:anywhere]">{chosen.title}</p>
          <p className="text-credit">
            Key <span className="text-id">{chosen.slug}</span>. State: {chosen.status.replace(/_/g, " ")}.{chosen.isDemo ? " Demo data." : ""}
          </p>
        </div>
      ) : null}
    </form>
  );
}

/** The study chosen by `?study=` or the first non-demo study. */
/**
 * A study inserted by automated tests or audit scripts, never the default view (it stays
 * selectable): any slug with an `e2e` part, and the fixture families "demo-audit-map-…",
 * "demo-rev-map-…", "demo-w4-onb-…" and "demo-parity-…".
 */
export const isTestFixtureStudy = (s: Pick<StudySummary, "slug">) => /(^|-)e2e(-|$)/.test(s.slug) || /^demo-(audit-map|rev-map|w4-onb|parity)-/.test(s.slug);

/**
 * The study a research page shows: the requested one; else the newest real study; else the newest
 * demo study that is not an automated-test fixture; else the newest study of any kind. `studies`
 * comes newest first.
 */
export function pickStudy(studies: StudySummary[], requested: string | string[] | undefined): StudySummary | null {
  const id = typeof requested === "string" ? requested : null;
  return studies.find((s) => s.id === id) ?? studies.find((s) => !s.isDemo) ?? studies.find((s) => !isTestFixtureStudy(s)) ?? studies[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Badges: always a word, status ones with a 12 px icon (DESIGN.md 9.4)
// ---------------------------------------------------------------------------------------------

const STUDY_STATUS: Record<string, { label: string; variant: "ok" | "neutral" | "warn"; icon: typeof CircleCheck }> = {
  active: { label: "Active", variant: "ok", icon: CircleCheck },
  draft: { label: "Draft", variant: "neutral", icon: CircleDashed },
  closed: { label: "Closed", variant: "neutral", icon: Lock },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STUDY_STATUS[status] ?? { label: status.replace(/_/g, " "), variant: "neutral" as const, icon: CircleDashed };
  const Icon = s.icon;
  return (
    <Badge variant={s.variant}>
      <Icon aria-hidden="true" />
      {s.label}
    </Badge>
  );
}

/** The "Demo data" badge shown on every panel while demo records are on screen (DESIGN.md 11.8). */
export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return (
    <Badge variant="warn">
      <FlaskConical aria-hidden="true" />
      {label}
    </Badge>
  );
}

/** Published / Draft badge for versioned instruments. */
export function PublishedBadge({ published, label }: { published: boolean; label?: string }) {
  return (
    <Badge variant={published ? "ok" : "neutral"}>
      {published ? <Lock aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
      {label ?? (published ? "Published" : "Draft")}
    </Badge>
  );
}

// ---------------------------------------------------------------------------------------------
// Sections, summaries, stat rows
// ---------------------------------------------------------------------------------------------

/**
 * A console section: a 1 px --rule-strong rule, an h2 in `text-h2` (Title Case; no eyebrow,
 * DR-022), a description in `text-body` --ink-2, actions right-aligned on the heading row
 * (wrapping under it below 768 px), then the content. 48 px between sections.
 */
export function Section({
  title,
  description,
  children,
  actions,
  demo = false,
  id,
  className,
}: {
  title: string;
  /** @deprecated Not rendered (DR-022: no eyebrows). */
  eyebrow?: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Shows the "Demo data" badge beside the heading. */
  demo?: boolean;
  id?: string;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("mb-12 min-w-0 border-t border-rule-strong pt-5", className)}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id={headingId} className="text-h2 text-ink">
              {titleCase(title)}
            </h2>
            {demo ? <DemoBadge /> : null}
          </div>
          {description ? <div className="text-body max-w-[40rem] text-ink-2">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A sub-heading inside a section (h3, `text-h3`, Title Case). */
export function SubHeading({ children, id, className }: { children: string; id?: string; className?: string }) {
  return (
    <h3 id={id} className={cn("text-h3 mb-3 text-ink", className)}>
      {titleCase(children)}
    </h3>
  );
}

/** Two-column <dl> summary (DESIGN.md 11.8): labels in `text-label`, values in `text-value`; stacks under 520 px. */
export function SummaryList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("border-y border-rule [overflow-wrap:anywhere]", className)}>
      {items.map((it) => (
        <div key={it.label} className="grid min-w-0 gap-1 border-t border-rule py-3 first:border-t-0 xs:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] xs:gap-6">
          <dt className="text-label">{it.label}</dt>
          <dd className="text-value min-w-0 text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface StatItem {
  label: string;
  value: ReactNode;
  /** Comparator line in `text-credit`, e.g. "2D 41, 3D 39" or "of 120 target". */
  note?: ReactNode;
}

/**
 * Column counts that divide the number of figures, so no row ends with an orphan (one row of
 * figures where it fits; otherwise equal rows). Under `sm` two columns, with an odd last figure
 * spanning both.
 */
const STAT_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-3 xl:grid-cols-6",
  7: "sm:grid-cols-7",
  8: "sm:grid-cols-4",
  9: "sm:grid-cols-3",
};

/**
 * A booktabs row of figures (DESIGN.md 10 "Stat tiles"): "Table n. Title" above, then label
 * (`text-label`, two lines reserved), value (`text-stat`, tabular) and comparator line on a
 * three-row grid so every value sits on one baseline. 1.5 px ink rules above and below.
 */
export function StatRow({ number, title, items, aside, className }: { number?: number; title: string; items: StatItem[]; aside?: ReactNode; className?: string }) {
  return (
    <figure className={cn("mb-10 min-w-0", className)}>
      {/* With an aside (the dashboard's live status), the caption sits on the 44 px row of the
          aside's first line, so caption, status and Refresh share one line; the aside's note runs
          under it. */}
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <span className={cn("font-sans text-base leading-6 text-ink", aside ? "flex min-h-11 items-center" : null)}>
          <span>
            {number !== undefined ? <span className="font-bold tabular-nums">Table {number}. </span> : null}
            {titleCase(title)}
          </span>
        </span>
        {aside}
      </figcaption>
      <dl className={cn("grid grid-cols-2 gap-x-6 border-y-[1.5px] border-ink", STAT_COLUMNS[items.length] ?? "sm:grid-cols-4")}>
        {items.map((it) => (
          <div
            key={it.label}
            className="grid min-w-0 grid-rows-[2.5rem_auto_auto] content-start gap-1 border-b border-rule py-3 last:odd:col-span-2 sm:border-b-0 sm:last:odd:col-span-1"
          >
            <dt className="text-label line-clamp-2 self-end">{it.label}</dt>
            <dd className="text-stat text-ink tabular-nums lining-nums">{it.value}</dd>
            {/* The comparator wraps rather than truncating, so the 3D value is never cut off. */}
            <dd className="text-credit min-h-5 tabular-nums [overflow-wrap:anywhere]">{it.note ?? ""}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

/** Plain empty-state line (no box, no placeholder art). */
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-body text-ink-2", className)}>{children}</p>;
}

/** Notice for every analytics view: what the numbers are and are not. */
export function ObservationalNotice() {
  return (
    <Alert variant="info" role="note" className="mb-8 max-w-[52rem]">
      <Info aria-hidden="true" />
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>
        Observational and exploratory. These are descriptive summaries of recorded behaviour and scores; they do not show that a condition caused any difference, and
        no analysis here is confirmatory until the researchers approve the analysis plan.
      </AlertDescription>
    </Alert>
  );
}

/** A warning or error notice in the console (icon plus a bold word, DESIGN.md 9.7). */
export function Notice({ tone, title, children, className }: { tone: "warn" | "error" | "info"; title: string; children: ReactNode; className?: string }) {
  const Icon = tone === "info" ? Info : CircleAlert;
  return (
    <Alert variant={tone === "error" ? "destructive" : tone} role={tone === "info" ? "note" : "alert"} className={cn("mb-8 max-w-[52rem]", className)}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** "Error:" / "Warning:" / "Note:" integrity flag with an icon (R-A4). */
export function FlagLine({ level, text }: { level: string; text: string }) {
  const word = level === "error" ? "Error" : level === "warning" ? "Warning" : "Note";
  const Icon = level === "error" || level === "warning" ? CircleAlert : Info;
  return (
    <span className={cn("inline-flex items-start gap-1.5", level === "error" ? "text-danger" : level === "warning" ? "text-warn" : "text-ink-2")}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[1.75]" />
      <span>
        <span className="font-semibold">{word}:</span> <span className="text-ink">{text}</span>
      </span>
    </span>
  );
}

export const fmtTime = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "–");

/** A timestamp in tabular figures (DESIGN.md 5.2 `text-id`; no monospace). */
export function Timestamp({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-id">–</span>;
  return (
    <time dateTime={iso} className="text-id whitespace-nowrap tabular-nums">
      {fmtTime(iso)}
    </time>
  );
}
