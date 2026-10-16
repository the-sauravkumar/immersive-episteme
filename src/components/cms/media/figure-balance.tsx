/**
 * Figure Balance (DESIGN.md 11.10, 12.3 rule 9; DR-018, DR-020): the CMS review gate that shows,
 * per tradition-page section (grouped under its knowledge layer), how many figures each study
 * tradition would show learners, in the canonical order (Ajrakh, Machilipatnam Kalamkari,
 * Sanganeri).
 *
 * The numbers are not computed here: they come from `figureBalance()` in the content parity engine,
 * the same function the study activation runs (check `a.figures`, critical). The matrix only
 * displays them, so the CMS can never disagree with the gate that blocks a study.
 *
 * Presentation: a booktabs table with counts on the sequential indigo ramp (`--viz-seq-1..6`), the
 * value always printed in the cell (ink on steps 1-3, on-indigo on 4-6, as 4.3 computes). A row
 * whose counts differ carries a danger icon and the words "Unbalanced: blocks publication to a
 * study" (never colour alone, R-A4). No madder anywhere in the CMS.
 */
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";

import { Empty, LINK, Section } from "@/components/cms/bits";
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { knowledgeBundleSchema, type KnowledgeBundle } from "@/features/knowledge/contracts";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { KNOWLEDGE_LAYERS, STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { STUDY_FIGURE_CAP } from "@/features/media/contracts";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";
import { listSnapshotFigureAssets } from "@/server/cms/media/service";
import { buildReviewSnapshotFromDb } from "@/server/content/review-snapshot";
import type { Q } from "@/server/cms/core";
import { figureBalance, type FigureBalance } from "@/server/research/parity/engine";

/** Ramp step for a count: 0 -> 1 ... 5 or more -> 6. */
export function rampStep(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  return Math.min(6, Math.max(1, Math.floor(n) + 1)) as 1 | 2 | 3 | 4 | 5 | 6;
}

const RAMP_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "bg-viz-seq-1 text-ink",
  2: "bg-viz-seq-2 text-ink",
  3: "bg-viz-seq-3 text-ink",
  4: "bg-viz-seq-4 text-on-indigo",
  5: "bg-viz-seq-5 text-on-indigo",
  6: "bg-viz-seq-6 text-on-indigo",
};

/** "machilipatnam-kalamkari" -> "Machilipatnam Kalamkari": the short display name the learner lists use. */
const shortName = (slug: string) =>
  slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const UNBALANCED_TEXT = "Unbalanced: blocks publication to a study";

/** The matrix itself (presentational; unit-tested with engine output). */
export function FigureBalanceMatrix({ balance, caption }: { balance: FigureBalance; caption: string }) {
  const slugs = balance.traditionSlugs;
  const groups = KNOWLEDGE_LAYERS.map((layer) => ({
    layer,
    rows: balance.rows.filter((r) => r.layer === layer.id),
  })).filter((g) => g.rows.length > 0);
  const totals = Object.fromEntries(slugs.map((s) => [s, balance.rows.reduce((n, r) => n + (r.counts[s] ?? 0), 0)]));
  const totalBalanced = slugs.every((s) => totals[s] === totals[slugs[0]!]);
  return (
    // The caption sits above both forms of the matrix (not inside the table), so it reads the same
    // on a phone (stacked blocks) and from 520 px up (the table in its own labelled region, 9.3).
    <div className="flex min-w-0 flex-col gap-3">
      <p className="font-sans text-[0.9375rem] leading-6 text-ink">{caption}</p>
      {/* Under 520 px the matrix becomes label/value blocks (9.3), so a phone compares all three traditions without scrolling sideways. */}
      <FigureBalanceStacked balance={balance} groups={groups} totals={totals} totalBalanced={totalBalanced} />
      <div className="hidden min-w-0 xs:block">
        <Table label={caption} density="compact" data-slot="figure-balance">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Section</TableHead>
              {slugs.map((s) => (
                <TableHead key={s} scope="col" numeric className="w-20 whitespace-normal sm:w-36">
                  {/* Marker and name in one flex row: a two-line name wraps inside its own box, never the marker alone. */}
                  <TraditionName traditionKey={s} className="justify-end text-right">
                    <span title={balance.traditionNames[s] ?? s}>{shortName(s)}</span>
                  </TraditionName>
                </TableHead>
              ))}
              <TableHead scope="col">Status</TableHead>
            </TableRow>
          </TableHeader>
          {groups.map((g) => (
            <TableBody key={g.layer.id} data-layer={g.layer.id}>
              <TableRow className="border-b-ink">
                <TableHead scope="colgroup" colSpan={slugs.length + 2} className="h-9 pt-3 align-bottom">
                  {g.layer.label} layer
                </TableHead>
              </TableRow>
              {g.rows.map((r) => (
                <TableRow key={r.sectionId} data-balanced={r.balanced ? "true" : "false"}>
                  <TableHead scope="row" className="text-body h-9 font-normal whitespace-normal text-ink">
                    {r.title}
                  </TableHead>
                  {slugs.map((s) => {
                    const n = r.counts[s] ?? 0;
                    return (
                      <TableCell key={s} numeric className={cn("px-3 last:pr-3 font-medium", RAMP_CLASS[rampStep(n)])}>
                        {n}
                      </TableCell>
                    );
                  })}
                  <TableCell className="whitespace-normal">
                    <RowStatus balanced={r.balanced} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          ))}
          <TableBody>
            <TableRow className="border-t border-t-ink">
              <TableHead scope="row" className="h-9">
                Total
              </TableHead>
              {slugs.map((s) => (
                <TableCell key={s} numeric className="px-3 last:pr-3 font-semibold">
                  {totals[s]}
                </TableCell>
              ))}
              <TableCell>
                <TotalStatus balanced={totalBalanced} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RowStatus({ balanced }: { balanced: boolean }) {
  return balanced ? (
    <span className="inline-flex items-center gap-1.5 text-ok">
      <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
      Balanced
    </span>
  ) : (
    <span className="inline-flex items-start gap-1.5 font-medium text-danger">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {UNBALANCED_TEXT}
    </span>
  );
}

/** The total row's status, styled like a row status (icon plus word). */
function TotalStatus({ balanced }: { balanced: boolean }) {
  return balanced ? (
    <span className="inline-flex items-center gap-1.5 text-ink-2">
      <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
      Equal totals
    </span>
  ) : (
    <span className="inline-flex items-start gap-1.5 font-medium text-danger">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Totals differ
    </span>
  );
}

/**
 * The same matrix as label/value blocks for viewports under 520 px: per section, its status and one
 * row per study tradition (canonical order) with the count on the same ramp. Hidden from 520 px up,
 * where the table shows instead (display:none also removes it from the accessibility tree).
 */
function FigureBalanceStacked({
  balance,
  groups,
  totals,
  totalBalanced,
}: {
  balance: FigureBalance;
  groups: { layer: (typeof KNOWLEDGE_LAYERS)[number]; rows: FigureBalance["rows"] }[];
  totals: Record<string, number>;
  totalBalanced: boolean;
}) {
  const slugs = balance.traditionSlugs;
  const counts = (values: (slug: string) => number) => (
    <dl className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
      {slugs.map((s) => {
        const n = values(s);
        return (
          <div key={s} className="contents">
            <dt className="text-body self-center text-ink-2">
              <TraditionName traditionKey={s}>{shortName(s)}</TraditionName>
            </dt>
            <dd className={cn("min-w-12 px-3 py-1 text-right font-medium tabular-nums", RAMP_CLASS[rampStep(n)])}>{n}</dd>
          </div>
        );
      })}
    </dl>
  );
  return (
    <div className="flex min-w-0 flex-col border-y-[1.5px] border-ink xs:hidden" data-slot="figure-balance-stacked">
      {groups.map((g) => (
        <section key={g.layer.id} aria-label={`${g.layer.label} layer`} className="flex flex-col">
          <p className="text-label border-b border-ink pt-3 pb-1">{g.layer.label} layer</p>
          <ul className="flex flex-col">
            {g.rows.map((r) => (
              <li key={r.sectionId} className="border-b border-rule py-2.5 last:border-b-0" data-balanced={r.balanced ? "true" : "false"}>
                <p className="text-body font-medium text-ink">{r.title}</p>
                <p className="text-body">
                  <RowStatus balanced={r.balanced} />
                </p>
                {counts((s) => r.counts[s] ?? 0)}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-label="Total" className="flex flex-col border-t border-ink py-2.5">
        <p className="text-body font-semibold text-ink">Total</p>
        <p className="text-body">
          <TotalStatus balanced={totalBalanced} />
        </p>
        {counts((s) => totals[s] ?? 0)}
      </section>
    </div>
  );
}

type Source = "release" | "review";

/** Loads the bundle a study would pin (latest published release) or the next release (review). */
async function loadBundle(q: Q, source: Source): Promise<{ bundle: KnowledgeBundle; label: string; snapshotId: string | null } | null> {
  if (source === "release") {
    const r = await q.query<{ id: string; payload: unknown; version_label: string }>(
      `SELECT id, payload, version_label FROM content_snapshots
        WHERE kind = 'release' AND status = 'published' AND NOT is_demo
        ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return null;
    const parsed = knowledgeBundleSchema.safeParse(row.payload);
    return parsed.success ? { bundle: parsed.data, label: row.version_label, snapshotId: row.id } : null;
  }
  const built = await buildReviewSnapshotFromDb(q, {
    hasher: nodeSha256,
    generatedAt: new Date().toISOString(),
  }).catch(() => null);
  return built?.ok ? { bundle: built.envelope.payload, label: built.envelope.versionLabel, snapshotId: null } : null;
}

const VIEW_LINK = cn(
  LINK,
  "inline-flex min-h-11 min-w-11 items-center justify-center aria-[current=true]:font-semibold aria-[current=true]:no-underline aria-[current=true]:text-ink",
);

/**
 * The Figure Balance section of /cms/media: loads the bundle, the illustration links with their
 * licence governance, and runs the engine's balance with today's date.
 *  - `source`: the latest published release (what a study pins) or the review build (what the next
 *    release would carry);
 *  - `diagrams`: the protocol switch `figures.structureDiagrams` (on by default), both settings shown
 *    so researchers can see what each protocol would give learners.
 */
export async function FigureBalanceSection({
  q,
  source,
  diagrams,
  hrefFor,
}: {
  q: Q;
  source: Source;
  diagrams: boolean;
  hrefFor: (v: { source: Source; diagrams: boolean }) => string;
}) {
  const day = new Date().toISOString().slice(0, 10);
  const loaded = await loadBundle(q, source);
  // A published release is judged on the figures frozen into it (DR-037); the review build on the live links.
  const links = await listSnapshotFigureAssets(q, loaded?.snapshotId ?? null);
  const balance = loaded
    ? figureBalance(loaded.bundle, [...STUDY_TRADITION_SLUGS], {
        structureDiagrams: diagrams,
        figureAssets: links,
        asOf: day,
      })
    : null;
  const otherIssues = balance?.issues.filter((i) => i.code !== "figures_unbalanced") ?? [];
  const unbalanced = balance?.rows.filter((r) => !r.balanced).length ?? 0;

  return (
    <Section
      id="figure-balance"
      title="Figure balance"
      description={
        <>
          Figures each study tradition shows learners, per section, exactly as both conditions resolve them: at most one per concept, the structure diagram
          first while the protocol shows diagrams, then an approved, licence-valid photograph that reaches the {STUDY_FIGURE_CAP} px lightbox cap. Study
          activation runs the same check and is refused while any row is unbalanced.
        </>
      }
      actions={
        balance ? (
          unbalanced === 0 && otherIssues.length === 0 ? (
            <Badge variant="ok">
              <CircleCheck aria-hidden="true" />
              Balanced
            </Badge>
          ) : (
            <Badge variant="danger">
              <CircleAlert aria-hidden="true" />
              {unbalanced > 0 ? "Unbalanced" : "Issues"}
            </Badge>
          )
        ) : null
      }
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-8">
        <nav aria-label="Bundle" className="flex flex-wrap items-center gap-x-4">
          <span className="text-label">Bundle</span>
          <Link className={VIEW_LINK} aria-current={source === "release" ? "true" : undefined} href={hrefFor({ source: "release", diagrams })}>
            Latest release
          </Link>
          <Link className={VIEW_LINK} aria-current={source === "review" ? "true" : undefined} href={hrefFor({ source: "review", diagrams })}>
            Next release (review build)
          </Link>
        </nav>
        <nav aria-label="Structure diagrams" className="flex flex-wrap items-center gap-x-4">
          <span className="text-label">Structure diagrams</span>
          <Link className={VIEW_LINK} aria-current={diagrams ? "true" : undefined} href={hrefFor({ source, diagrams: true })}>
            On
          </Link>
          <Link className={VIEW_LINK} aria-current={!diagrams ? "true" : undefined} href={hrefFor({ source, diagrams: false })}>
            Off
          </Link>
        </nav>
      </div>
      {!loaded || !balance ? (
        <Empty>
          {source === "release"
            ? "No release has been published yet, so no study bundle exists. Choose the review build to see what the next release would carry."
            : "The review build does not validate right now (see Dataset Versions), so its figures cannot be counted."}
        </Empty>
      ) : (
        <>
          <FigureBalanceMatrix
            balance={balance}
            caption={`Figures per section in ${loaded.label}, structure diagrams ${diagrams ? "on" : "off"}, licences judged on ${day}`}
          />
          <p className="text-credit">
            {balance.metrics.diagrams} diagram(s) and {balance.metrics.photos} photograph(s) shown; {balance.metrics.photosHeldBack} approved photograph(s) held
            back (a concept shows one figure). Counts are printed in every cell; darker cells hold more figures.
          </p>
          {otherIssues.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-label">{titleCase("Other figure issues")}</h3>
              <ul className="flex flex-col gap-1">
                {otherIssues.slice(0, 50).map((i, n) => (
                  <li key={n} className="text-body flex items-start gap-2 text-ink">
                    <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-danger" />
                    <span className="min-w-0">
                      <span className="sr-only">Error: </span>
                      {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}
