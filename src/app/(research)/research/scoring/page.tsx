import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/assessment/action-form";
import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { scoreKeyedAction, scoreMapsAction } from "@/server/assessment/research-actions";
import { listKeyedAssessments, listMapScores, listRubricsForScoring, listScorableReferences, SUMMARY_METRICS } from "@/server/assessment/scoring";
import { getPool } from "@/server/db/client";

import { DemoBadge, Empty, LINK_44, LINK_BUTTON, PublishedBadge, Section } from "../_components/common";

export const metadata: Metadata = { title: "Scoring" };

const METRIC_LABEL: Record<(typeof SUMMARY_METRICS)[number], string> = {
  "cmap.valid_relationships": "Valid",
  "cmap.incorrect_relationships": "Incorrect",
  "cmap.missing_expected_relationships": "Missing",
  "cmap.f1.dl": "F1 (typed, directed)",
  "cmap.causal_chain_depth": "Causal depth",
  "cmap.degree_profile_similarity": "Structural similarity",
  "cmap.cross_category.valid": "Cross-category valid",
};

/** Counts as integers, rates with 3 decimals; "–" when not scored, "n/a" when the metric is undefined for the map. */
const fmt = (v: number | null | undefined) => (v === undefined ? "–" : v === null ? "n/a" : Number.isInteger(v) ? String(v) : v.toFixed(3));

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/scoring">) {
  return (
    <ConsolePage
      path="/research/scoring"
      title="Scoring"
      description="Score concept maps against an adjudicated expert reference, score keyed answers, and rate free-text answers with rubrics. Every score is stored as a versioned derived score next to the raw data."
    >
      <Scoring searchParams={searchParams} />
    </ConsolePage>
  );
}

async function Scoring({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const refs = await listScorableReferences(pool);
  const refParam = typeof sp.ref === "string" ? sp.ref : undefined;
  const selected = refs.find((r) => r.id === refParam) ?? null;
  const rows = selected ? await listMapScores(pool, selected.id) : [];
  const keyed = await listKeyedAssessments(pool);
  const rubrics = await listRubricsForScoring(pool);
  let table = 0;

  return (
    <>
      <Section id="maps" title="Concept maps" demo={selected?.isDemo} description="Choose an adjudicated reference map; participant maps of its assessment are scored against it.">
        {refs.length === 0 ? (
          <Empty>No adjudicated reference map yet. Build one under Assessments.</Empty>
        ) : (
          <nav aria-label="Reference maps" className="mb-6 max-w-[52rem]">
            <ul className="flex flex-col border-y border-rule">
              {refs.map((r) => {
                const current = selected?.id === r.id;
                return (
                  <li key={r.id} className="border-t border-rule first:border-t-0">
                    <Link
                      href={`/research/scoring?ref=${r.id}`}
                      aria-current={current ? "page" : undefined}
                      className="group/ref flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-l-[3px] border-transparent py-2 pl-3 font-sans text-[0.9375rem] leading-5 text-indigo hover:text-indigo-hover aria-[current=page]:border-indigo aria-[current=page]:font-semibold aria-[current=page]:text-ink"
                    >
                      {/* Only the text is underlined (a link is never colour alone, R-A4); the badge is not. */}
                      <span className="underline decoration-1 underline-offset-[3px] group-hover/ref:decoration-2 group-aria-[current=page]/ref:no-underline">
                        {r.assessmentTitle} <span className="tabular-nums">v{r.assessmentVersion}</span> · reference <span className="tabular-nums">v{r.version}</span>
                      </span>
                      {current ? <span className="text-credit">Selected</span> : null}
                      {r.isDemo ? <DemoBadge label="Demo" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
        {selected ? (
          <>
            <div className="mb-6 flex flex-col gap-2">
              <ActionButton action={scoreMapsAction.bind(null, selected.id)} label="Score all submitted maps" variant="default" />
              <span className="text-credit">Scores are appended; maps already scored with the same metric versions are skipped.</span>
            </div>
            {rows.length === 0 ? (
              <Empty>No submitted maps for this assessment.</Empty>
            ) : (
              <Table caption="Concept-Map Scores" number={++table} hoverRows density="compact" note="– not scored yet; n/a the metric is undefined for this map.">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Participant</TableHead>
                    <TableHead scope="col">Condition</TableHead>
                    <TableHead scope="col">Phase</TableHead>
                    <TableHead scope="col" numeric>
                      Edges
                    </TableHead>
                    {SUMMARY_METRICS.map((m) => (
                      <TableHead key={m} scope="col" numeric>
                        {METRIC_LABEL[m]}
                      </TableHead>
                    ))}
                    <TableHead scope="col">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.conceptMapId}>
                      <TableCell className="text-mono">{r.participantCode}</TableCell>
                      <TableCell>{r.condition === "immersive_3d" ? "3D" : "2D"}</TableCell>
                      <TableCell>{r.phase}</TableCell>
                      <TableCell numeric>{r.edgeCount}</TableCell>
                      {SUMMARY_METRICS.map((m) => (
                        <TableCell key={m} numeric>
                          {r.scored ? fmt(r.scores[m]) : "–"}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Link href={`/research/scoring/maps/${r.conceptMapId}?ref=${selected.id}`} className={LINK_44}>
                          Breakdown<span className="sr-only"> for {r.participantCode}, {r.phase}</span>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        ) : null}
      </Section>

      <Section id="keyed" title="Keyed items" description="Auto-scoring of choice and numeric items against their answer keys.">
        {keyed.length === 0 ? (
          <Empty>No assessment has items with an answer key.</Empty>
        ) : (
          <Table caption="Keyed Assessments" number={++table}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Assessment</TableHead>
                <TableHead scope="col" numeric>
                  Keyed Answers
                </TableHead>
                <TableHead scope="col" numeric>
                  Scored
                </TableHead>
                <TableHead scope="col">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keyed.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="min-w-48 whitespace-normal">
                    {k.title} <span className="tabular-nums">v{k.version}</span>
                  </TableCell>
                  <TableCell numeric>{k.responses}</TableCell>
                  <TableCell numeric>{k.scored}</TableCell>
                  <TableCell>
                    <ActionButton action={scoreKeyedAction.bind(null, k.id)} label="Score keyed answers" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section id="rubrics" title="Rubric rating (transfer and free-text answers)">
        {rubrics.length === 0 ? (
          <Empty>No rubrics yet. Create one on a free-text item under Assessments.</Empty>
        ) : (
          <Table caption="Rubrics" number={++table} hoverRows>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Rubric</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" numeric>
                  Ratings
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rubrics.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link href={`/research/scoring/rubrics/${r.id}`} className={LINK_44}>
                      {r.assessmentTitle}: rubric v{r.version}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PublishedBadge published={r.status === "locked"} />
                  </TableCell>
                  <TableCell numeric>{r.ratings}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section id="export" title="Export" description="Pseudonymised, long format, joinable on participant code, session and condition. Demo and non-experimental rows are flagged, not removed.">
        <div className="flex flex-wrap gap-3">
          <a className={LINK_BUTTON} href="/research/scoring/export?dataset=scores&format=csv" download>
            <Download aria-hidden="true" />
            Derived scores (CSV)
          </a>
          <a className={LINK_BUTTON} href="/research/scoring/export?dataset=scores&format=json" download>
            <Download aria-hidden="true" />
            Derived scores (JSON)
          </a>
          <a className={LINK_BUTTON} href="/research/scoring/export?dataset=map-edges&format=csv" download>
            <Download aria-hidden="true" />
            Raw concept-map edges (CSV)
          </a>
        </div>
      </Section>
    </>
  );
}
