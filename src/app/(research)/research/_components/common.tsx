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

export const FIELD_LABEL = "t-label text-lime";
const FIELD_HINT = "t-s text-lime-dim";
const CONTROL =
  "w-full min-w-0 border border-lime-dim bg-vat px-3 t-b text-lime placeholder:text-lime-dim hover:not-disabled:border-lime-dim disabled:cursor-not-allowed disabled:border-line disabled:bg-vat-2 disabled:text-lime-dim aria-invalid:border-madder-text";
export const TEXTAREA = cn(CONTROL, "min-h-24 py-2.5");
export const CHECK_ROW = "flex min-h-11 cursor-pointer items-center gap-3 t-b text-lime";
export const CHECK_BOX = "ie-check";
const LINK = "text-turmeric underline decoration-1 underline-offset-[0.2em] hover:text-turmeric-hi hover:decoration-2";
export const LINK_44 = cn(LINK, "inline-flex min-h-11 min-w-11 items-center");
export const LINK_BUTTON =
  "inline-flex h-11 shrink-0 items-center gap-2 border-[1.5px] border-lime bg-vat px-5 t-b font-semibold text-lime hover:bg-vat-2 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]";

export function Disclosure({ summary, detail, children, open, className }: { summary: ReactNode; detail?: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <SharedDisclosure
      defaultOpen={open}
      className={cn("min-w-0", className)}
      summary={
        <span className="t-b block min-w-0 py-2.5 text-lime [overflow-wrap:anywhere]">
          <span className="font-semibold">{summary}</span>
          {detail ? <span className="text-lime-dim"> {detail}</span> : null}
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

export function StudyPicker({ studies, current, extra }: { studies: StudySummary[]; current: string | null; extra?: Record<string, string> }) {
  const chosen = studies.find((s) => s.id === current) ?? null;
  if (studies.length === 0) {
    return (
      <p className="t-b mb-8 text-lime-dim">
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
          <p className="t-b font-bold text-lime [overflow-wrap:anywhere]">{chosen.title}</p>
          <p className="t-s text-lime-dim">
            Key <span className="t-table font-semibold wrap-anywhere">{chosen.slug}</span>. State: {chosen.status.replace(/_/g, " ")}.{chosen.isDemo ? " Demo data." : ""}
          </p>
        </div>
      ) : null}
    </form>
  );
}

export const isTestFixtureStudy = (s: Pick<StudySummary, "slug">) => /(^|-)e2e(-|$)/.test(s.slug) || /^demo-(audit-map|rev-map|w4-onb|parity)-/.test(s.slug);

export function pickStudy(studies: StudySummary[], requested: string | string[] | undefined): StudySummary | null {
  const id = typeof requested === "string" ? requested : null;
  return studies.find((s) => s.id === id) ?? studies.find((s) => !s.isDemo) ?? studies.find((s) => !isTestFixtureStudy(s)) ?? studies[0] ?? null;
}

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

export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return (
    <Badge variant="warn">
      <FlaskConical aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function PublishedBadge({ published, label }: { published: boolean; label?: string }) {
  return (
    <Badge variant={published ? "ok" : "neutral"}>
      {published ? <Lock aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
      {label ?? (published ? "Published" : "Draft")}
    </Badge>
  );
}

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
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  demo?: boolean;
  id?: string;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("mb-12 min-w-0 border-t border-lime-dim pt-5", className)}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id={headingId} className="t-h4 text-lime">
              {titleCase(title)}
            </h2>
            {demo ? <DemoBadge /> : null}
          </div>
          {description ? <div className="t-b max-w-[40rem] text-lime-dim">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SubHeading({ children, id, className }: { children: string; id?: string; className?: string }) {
  return (
    <h3 id={id} className={cn("t-label mb-3 text-lime", className)}>
      {titleCase(children)}
    </h3>
  );
}

export function SummaryList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("border-y border-line [overflow-wrap:anywhere]", className)}>
      {items.map((it) => (
        <div key={it.label} className="grid min-w-0 gap-1 border-t border-line py-3 first:border-t-0 xs:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] xs:gap-6">
          <dt className="t-label">{it.label}</dt>
          <dd className="t-b min-w-0 text-lime">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface StatItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}

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

export function StatRow({ number, title, items, aside, className }: { number?: number; title: string; items: StatItem[]; aside?: ReactNode; className?: string }) {
  return (
    <figure className={cn("mb-10 min-w-0", className)}>
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <span className={cn("t-b text-lime", aside ? "flex min-h-11 items-center" : null)}>
          <span>
            {number !== undefined ? <span className="font-bold tabular-nums">Table {number}. </span> : null}
            {titleCase(title)}
          </span>
        </span>
        {aside}
      </figcaption>
      <dl className={cn("grid grid-cols-2 gap-x-6 border-y-[1.5px] border-lime", STAT_COLUMNS[items.length] ?? "sm:grid-cols-4")}>
        {items.map((it) => (
          <div
            key={it.label}
            className="grid min-w-0 grid-rows-[2.5rem_auto_auto] content-start gap-1 border-b border-line py-3 last:odd:col-span-2 sm:border-b-0 sm:last:odd:col-span-1"
          >
            <dt className="t-label line-clamp-2 self-end">{it.label}</dt>
            <dd className="t-h3 tabular-nums text-lime tabular-nums lining-nums">{it.value}</dd>
            <dd className="t-s text-lime-dim min-h-5 tabular-nums [overflow-wrap:anywhere]">{it.note ?? ""}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("t-b text-lime-dim", className)}>{children}</p>;
}

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

export function FlagLine({ level, text }: { level: string; text: string }) {
  const word = level === "error" ? "Error" : level === "warning" ? "Warning" : "Note";
  const Icon = level === "error" || level === "warning" ? CircleAlert : Info;
  return (
    <span className={cn("inline-flex items-start gap-1.5", level === "error" ? "text-madder-text" : level === "warning" ? "text-turmeric" : "text-lime-dim")}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[1.75]" />
      <span>
        <span className="font-semibold">{word}:</span> <span className="text-lime">{text}</span>
      </span>
    </span>
  );
}

const fmtTime = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "–");

export function Timestamp({ iso }: { iso: string | null }) {
  if (!iso) return <span className="t-table font-semibold wrap-anywhere">–</span>;
  return (
    <time dateTime={iso} className="t-table font-semibold wrap-anywhere whitespace-nowrap tabular-nums">
      {fmtTime(iso)}
    </time>
  );
}
