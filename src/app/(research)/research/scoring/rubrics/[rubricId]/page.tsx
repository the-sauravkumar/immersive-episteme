import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm, checkBoxClass, checkRowClass, Field, fieldClass } from "@/components/assessment/action-form";
import { ConsolePage } from "@/components/shell/gates";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { titleCase } from "@/lib/text/title-case";
import { AssessmentError } from "@/server/assessment/common";
import { rateResponseAction } from "@/server/assessment/research-actions";
import { rubricAgreement, rubricQueue } from "@/server/assessment/scoring";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

import { Empty, FIELD_LABEL, LINK_44, Notice, PublishedBadge, Section, StatRow, SummaryList } from "../../../_components/common";

export const metadata: Metadata = { title: "Rubric rating" };

/** Three decimals; undefined statistics print as an en dash. */
const fmt = (x: number | null) => (x === null || !Number.isFinite(x) ? "–" : x.toFixed(3));

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ params }: PageProps<"/research/scoring/rubrics/[rubricId]">) {
  return (
    <ConsolePage path="/research/scoring/rubrics/[rubricId]" title="Rubric rating" description="Blind rating of free-text answers against a published rubric, with inter-rater agreement.">
      <Rating params={params} />
    </ConsolePage>
  );
}

async function Rating({ params }: { params: Promise<{ rubricId: string }> }) {
  const { rubricId } = await params;
  const me = await requirePermission("assessments.score");
  const pool = getPool();
  let data;
  try {
    data = await rubricQueue(pool, rubricId, me.userId);
  } catch (err) {
    if (err instanceof AssessmentError) notFound();
    throw err;
  }
  const { rubric, items } = data;
  const agreement = await rubricAgreement(pool, rubricId);
  const mine = items.filter((i) => i.myRating !== null).length;

  return (
    <>
      <p className="mb-4">
        <Link href="/research/scoring" className={LINK_44}>
          Back to scoring
        </Link>
      </p>
      <SummaryList
        className="mb-6 max-w-[52rem]"
        items={[
          {
            label: "Rubric",
            value: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">
                  {rubric.assessmentTitle}: rubric <span className="tabular-nums">v{rubric.version}</span>
                </span>
                <PublishedBadge published={rubric.status === "locked"} />
              </span>
            ),
          },
          { label: "Item prompt", value: <span className="whitespace-pre-line">{rubric.itemPrompt}</span> },
          {
            label: "Levels",
            value: (
              <dl className="flex flex-col gap-1">
                {rubric.levels.map((l) => (
                  <div key={l.value} className="grid gap-x-3 xs:grid-cols-[2rem_minmax(0,1fr)]">
                    <dt className="font-semibold tabular-nums xs:text-right">{l.value}</dt>
                    <dd>
                      <span className="font-medium">{l.label}:</span> {l.descriptor}
                    </dd>
                  </div>
                ))}
              </dl>
            ),
          },
          { label: "Your progress", value: <span className="tabular-nums">Rated {mine} of {items.length}</span> },
        ]}
      />
      <p className="text-body mb-8 max-w-[52rem] text-ink-2">
        Answers are shown without participant or condition, in a fixed order. You see only your own ratings; a rating cannot be changed once saved.
      </p>
      {rubric.status !== "locked" ? (
        <Notice tone="warn" title="Warning">
          Publish this rubric before rating.
        </Notice>
      ) : null}

      <Section id="agreement" title="Agreement" description="Unweighted; the rubric levels are treated as categories.">
        <StatRow
          number={1}
          title="Rating Agreement"
          items={[
            { label: "Raters", value: agreement.raters },
            { label: "Answers rated", value: agreement.responsesRated, note: `${agreement.completeItems} by every rater` },
            { label: "Exact agreement", value: fmt(agreement.percentAgreement) },
            { label: "Fleiss’ κ", value: fmt(agreement.fleissKappa) },
          ]}
        />
        {agreement.pairwise.length > 0 ? (
          <Table caption="Pairwise Rater Agreement" number={2} note="Raters are shown by the last six characters of their account id.">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Rater Pair</TableHead>
                <TableHead scope="col" numeric>
                  Shared Answers
                </TableHead>
                <TableHead scope="col" numeric>
                  Agreement
                </TableHead>
                <TableHead scope="col" numeric>
                  Cohen’s κ
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agreement.pairwise.map((p) => (
                <TableRow key={`${p.raterA}-${p.raterB}`}>
                  <TableCell className="text-id">
                    {p.raterA.slice(-6)} / {p.raterB.slice(-6)}
                  </TableCell>
                  <TableCell numeric>{p.n}</TableCell>
                  <TableCell numeric>{fmt(p.percentAgreement)}</TableCell>
                  <TableCell numeric>{fmt(p.cohensKappa)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Section>

      <Section id="queue" title="Answers">
        {items.length === 0 ? <Empty>No answers yet.</Empty> : null}
        <ol className="flex max-w-[52rem] flex-col gap-6">
          {items.map((it) => (
            <li key={it.responseId}>
              <Card>
                <CardHeader>
                  <h3 className="text-h3 text-ink">{titleCase(it.label)}</h3>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-body whitespace-pre-line text-ink">{it.text}</p>
                  {it.myRating !== null ? (
                    <p className="text-body text-ink-2">
                      Your rating: <span className="font-semibold text-ink tabular-nums">{it.myRating}</span> ({rubric.levels.find((l) => l.value === it.myRating)?.label})
                    </p>
                  ) : rubric.status === "locked" ? (
                    <ActionForm action={rateResponseAction.bind(null, rubric.id, it.responseId)} submitLabel="Save rating" className="flex flex-col gap-4 border-t border-rule pt-4">
                      <fieldset className="flex min-w-0 flex-col">
                        <legend className={FIELD_LABEL}>Level</legend>
                        <div className="flex flex-col">
                          {rubric.levels.map((l) => (
                            <label key={l.value} className={checkRowClass}>
                              <input type="radio" name="value" value={l.value} required className={checkBoxClass} />
                              <span>
                                <span className="font-semibold tabular-nums">{l.value}</span> {l.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <Field label="Note (optional)">
                        <textarea name="note" rows={2} maxLength={2000} className={fieldClass} />
                      </Field>
                    </ActionForm>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
