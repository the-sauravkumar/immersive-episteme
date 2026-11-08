import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";

import { Empty, LINK, Section } from "@/components/cms/bits";
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { knowledgeBundleSchema, type KnowledgeBundle } from "@/features/knowledge/contracts";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { KNOWLEDGE_LAYERS, STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";
import { listSnapshotFigureAssets } from "@/server/cms/media/service";
import { buildReviewSnapshotFromDb } from "@/server/content/review-snapshot";
import type { Q } from "@/server/cms/core";
import { figureBalance, type FigureBalance } from "@/server/research/parity/engine";

export function rampStep(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  return Math.min(6, Math.max(1, Math.floor(n) + 1)) as 1 | 2 | 3 | 4 | 5 | 6;
}

const RAMP_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "bg-vat-2 text-lime",
  2: "bg-line text-lime",
  3: "bg-thread text-lime",
  4: "bg-turmeric-lo text-vat",
  5: "bg-turmeric text-vat",
  6: "bg-turmeric-hi text-vat",
};

const shortName = (slug: string) =>
  slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const UNBALANCED_TEXT = "Unbalanced";

export function FigureBalanceMatrix({ balance, caption }: { balance: FigureBalance; caption: string }) {
  const slugs = balance.traditionSlugs;
  const groups = KNOWLEDGE_LAYERS.map((layer) => ({
    layer,
    rows: balance.rows.filter((r) => r.layer === layer.id),
  })).filter((g) => g.rows.length > 0);
  const totals = Object.fromEntries(slugs.map((s) => [s, balance.rows.reduce((n, r) => n + (r.counts[s] ?? 0), 0)]));
  const totalBalanced = slugs.every((s) => totals[s] === totals[slugs[0]!]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="font-sans t-s text-lime">{caption}</p>
      <FigureBalanceStacked balance={balance} groups={groups} totals={totals} totalBalanced={totalBalanced} />
      <div className="hidden min-w-0 xs:block">
        <Table label={caption} density="compact" data-slot="figure-balance">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Section</TableHead>
              {slugs.map((s) => (
                <TableHead key={s} scope="col" numeric className="w-20 whitespace-normal sm:w-36">
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
              <TableRow className="border-b-lime">
                <TableHead scope="colgroup" colSpan={slugs.length + 2} className="h-9 pt-3 align-bottom">
                  {g.layer.label} layer
                </TableHead>
              </TableRow>
              {g.rows.map((r) => (
                <TableRow key={r.sectionId} data-balanced={r.balanced ? "true" : "false"}>
                  <TableHead scope="row" className="t-b h-9 font-normal whitespace-normal text-lime">
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
            <TableRow className="border-t border-t-lime">
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
    <span className="inline-flex items-start gap-1.5 font-medium text-madder-text">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {UNBALANCED_TEXT}
    </span>
  );
}

function TotalStatus({ balanced }: { balanced: boolean }) {
  return balanced ? (
    <span className="inline-flex items-center gap-1.5 text-lime-dim">
      <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
      Equal totals
    </span>
  ) : (
    <span className="inline-flex items-start gap-1.5 font-medium text-madder-text">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Totals differ
    </span>
  );
}

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
            <dt className="t-b self-center text-lime-dim">
              <TraditionName traditionKey={s}>{shortName(s)}</TraditionName>
            </dt>
            <dd className={cn("min-w-12 px-3 py-1 text-right font-medium tabular-nums", RAMP_CLASS[rampStep(n)])}>{n}</dd>
          </div>
        );
      })}
    </dl>
  );
  return (
    <div className="flex min-w-0 flex-col border-y-[1.5px] border-lime xs:hidden" data-slot="figure-balance-stacked">
      {groups.map((g) => (
        <section key={g.layer.id} aria-label={`${g.layer.label} layer`} className="flex flex-col">
          <p className="t-label border-b border-lime pt-3 pb-1">{g.layer.label} layer</p>
          <ul className="flex flex-col">
            {g.rows.map((r) => (
              <li key={r.sectionId} className="border-b border-line py-2.5 last:border-b-0" data-balanced={r.balanced ? "true" : "false"}>
                <p className="t-b font-medium text-lime">{r.title}</p>
                <p className="t-b">
                  <RowStatus balanced={r.balanced} />
                </p>
                {counts((s) => r.counts[s] ?? 0)}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-label="Total" className="flex flex-col border-t border-lime py-2.5">
        <p className="t-b font-semibold text-lime">Total</p>
        <p className="t-b">
          <TotalStatus balanced={totalBalanced} />
        </p>
        {counts((s) => totals[s] ?? 0)}
      </section>
    </div>
  );
}

type Source = "release" | "review";

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
  "inline-flex min-h-11 min-w-11 items-center justify-center aria-[current=true]:font-semibold aria-[current=true]:no-underline aria-[current=true]:text-lime",
);

export async function FigureBalanceSection({ q, source, hrefFor }: { q: Q; source: Source; hrefFor: (v: { source: Source }) => string }) {
  const loaded = await loadBundle(q, source);
  const links = await listSnapshotFigureAssets(q, loaded?.snapshotId ?? null);
  const balance = loaded
    ? figureBalance(loaded.bundle, [...STUDY_TRADITION_SLUGS], {
        structureDiagrams: false,
        figureAssets: links,
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
          Approved photographs linked to concepts as illustrations, per section and study tradition: at most one per concept, each with its caption,
          credit and alt text. This is a curation check of the knowledge record. Learners do not see these figures: both doors show the six study
          photographs, one textile and one printing-blocks photograph per tradition (DR-118). It does not gate study activation.
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
          <span className="t-label">Bundle</span>
          <Link className={VIEW_LINK} aria-current={source === "release" ? "true" : undefined} href={hrefFor({ source: "release" })}>
            Latest release
          </Link>
          <Link className={VIEW_LINK} aria-current={source === "review" ? "true" : undefined} href={hrefFor({ source: "review" })}>
            Next release (review build)
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
            caption={`Figures per section in ${loaded.label}`}
          />
          <p className="t-s text-lime-dim">
            {balance.metrics.photos} photograph(s) counted; {balance.metrics.photosHeldBack} approved photograph(s) held back (a concept carries one
            figure). Counts are printed in every cell; brighter cells hold more figures.
          </p>
          {otherIssues.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="t-label">{titleCase("Other figure issues")}</h3>
              <ul className="flex flex-col gap-1">
                {otherIssues.slice(0, 50).map((i, n) => (
                  <li key={n} className="t-b flex items-start gap-2 text-lime">
                    <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-madder-text" />
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
