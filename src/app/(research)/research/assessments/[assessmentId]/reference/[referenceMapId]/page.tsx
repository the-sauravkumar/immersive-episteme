import { ChevronRight, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton, ActionForm, Field, fieldClass } from "@/components/assessment/action-form";
import { RaterEditor } from "@/components/assessment/rater-editor";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plural } from "@/lib/text/plural";
import { AssessmentError } from "@/server/assessment/common";
import { getReferenceWorkspace } from "@/server/assessment/reference-maps";
import { adjudicateAction, finaliseReferenceAction, lockReferenceAction } from "@/server/assessment/research-actions";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

import { DemoBadge, Empty, LINK_44, Section, StatRow, SummaryList } from "../../../../_components/common";

export const metadata: Metadata = { title: "Reference map" };

/** Fixed decimals; "undefined" is printed as an en dash (no more precision than the measure supports). */
const fmt = (x: number | null | undefined, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(d));

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ params }: PageProps<"/research/assessments/[assessmentId]/reference/[referenceMapId]">) {
  return (
    <ConsolePage
      path="/research/assessments/[assessmentId]/reference/[referenceMapId]"
      title="Expert reference map"
      description="Independent rater maps, their agreement, the majority consensus and its adjudication into the reference that participant maps are scored against."
    >
      <Workspace params={params} />
    </ConsolePage>
  );
}

const DECISION_LABEL: Record<string, string> = { expected: "Expected", optional: "Optional", excluded: "Excluded", disputed: "Tie: adjudicate" };

async function Workspace({ params }: { params: Promise<{ assessmentId: string; referenceMapId: string }> }) {
  const { assessmentId, referenceMapId } = await params;
  const me = await requirePermission("assessments.author");
  let ws;
  try {
    ws = await getReferenceWorkspace(getPool(), referenceMapId, me.userId);
  } catch (err) {
    if (err instanceof AssessmentError) notFound();
    throw err;
  }
  if (ws.map.assessmentId !== assessmentId) notFound();
  const open = ws.map.status === "draft" && !ws.map.adjudicatedAt;
  const label = new Map(ws.set.concepts.map((c) => [c.conceptId, c.label]));
  const typeLabel = (code: string | null) => (code === null ? "is linked to" : (ws.set.relationshipTypes.find((t) => t.code === code)?.label ?? code));
  const sentence = (e: { source: string; target: string; type: string | null; directed: boolean }) =>
    `${label.get(e.source) ?? e.source} ${typeLabel(e.type)} ${label.get(e.target) ?? e.target}${e.directed ? "" : " (both ways)"}`;
  const iSubmitted = ws.raters.some((r) => r.raterId === me.userId);
  const mySubmittedAt = ws.raters.find((r) => r.raterId === me.userId)?.submittedAt.toISOString() ?? "none";
  const showResults = iSubmitted || !open;
  const state = ws.map.status === "locked" ? "Locked" : ws.map.adjudicatedAt ? "Adjudicated" : "Collecting rater maps";

  return (
    <>
      <p className="mb-4">
        <Link href={`/research/assessments/${assessmentId}`} className={LINK_44}>
          <span aria-hidden="true">←&nbsp;</span>Back to the assessment
        </Link>
      </p>
      <SummaryList
        className="mb-12 max-w-[52rem]"
        items={[
          {
            label: "Reference map",
            value: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">
                  <span className="tabular-nums">v{ws.map.version}</span>: {ws.map.title}
                </span>
                <Badge variant={ws.map.adjudicatedAt ? "ok" : "neutral"}>{state}</Badge>
                {ws.map.isDemo ? <DemoBadge label="Demo (stays draft)" /> : null}
              </span>
            ),
          },
          { label: "Concept set", value: ws.set.concepts.map((c) => c.label).join(", ") },
          { label: "Relationship types", value: ws.set.relationshipTypes.map((t) => t.label).join(", ") || "Untyped links" },
          { label: "Rater maps", value: <span className="tabular-nums">{ws.raters.length}</span> },
          ...(ws.adjudicator ? [{ label: "Adjudicator", value: ws.adjudicator.name }] : []),
        ]}
      />

      {open ? (
        <Section
          id="my-map"
          title="Your rater map"
          description="Draw the relationships you consider supported by the content, and tick “Expected” for those a learner must produce for full credit. Raters work independently: agreement and the consensus appear here after you submit."
        >
          <RaterEditor
            key={mySubmittedAt}
            referenceMapId={referenceMapId}
            concepts={ws.set.concepts}
            relationshipTypes={ws.set.relationshipTypes}
            directedLinks={ws.set.directedLinks}
            initial={ws.ownSubmission}
          />
        </Section>
      ) : null}

      {showResults ? (
        <>
          <Section demo={ws.map.isDemo} id="agreement" title="Inter-rater agreement" description="Agreement over the candidate edges proposed by any rater.">
            {ws.agreement ? (
              <>
                <StatRow
                  number={1}
                  title="Agreement Summary"
                  items={[
                    { label: "Raters", value: ws.agreement.raters.length },
                    { label: "Candidate edges", value: ws.agreement.items, note: `${String(ws.agreement.parameters.level)}, ${String(ws.agreement.parameters.universe)} universe` },
                    { label: "Percent agreement", value: fmt(ws.agreement.percentAgreement) },
                    { label: "Fleiss’ κ", value: fmt(ws.agreement.fleissKappa) },
                  ]}
                />
                <Table caption="Pairwise Agreement" number={2}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Rater A</TableHead>
                      <TableHead scope="col">Rater B</TableHead>
                      <TableHead scope="col" numeric>
                        Items
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
                    {ws.agreement.pairwise.map((p) => (
                      <TableRow key={`${p.raterA}-${p.raterB}`}>
                        <TableCell>{ws.raters.find((r) => r.raterId === p.raterA)?.name ?? p.raterA}</TableCell>
                        <TableCell>{ws.raters.find((r) => r.raterId === p.raterB)?.name ?? p.raterB}</TableCell>
                        <TableCell numeric>{p.n}</TableCell>
                        <TableCell numeric>{fmt(p.percentAgreement)}</TableCell>
                        <TableCell numeric>{fmt(p.cohensKappa)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <Empty>Agreement needs at least two rater maps.</Empty>
            )}
          </Section>

          {ws.consensus ? (
            <Section demo={ws.map.isDemo} id="consensus" title="Consensus" description="Strict majority of the rater maps; ties need an adjudication decision.">
              <p className="text-body mb-4 inline-flex items-center gap-2 text-ink" role="status">
                {ws.consensus.isComplete ? (
                  "No ties remain."
                ) : (
                  <>
                    <CircleAlert aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-warn" />
                    <span>
                      <span className="font-semibold text-warn">Warning:</span> {plural(ws.consensus.unresolved.length, "tied edge")} {ws.consensus.unresolved.length === 1 ? "needs" : "need"} an adjudication decision.
                    </span>
                  </>
                )}
              </p>
              <ul className="mb-8 flex max-w-[60rem] flex-col border-y border-rule">
                {ws.consensus.edges.map((e) => (
                  <li key={e.key} className="flex flex-col gap-1 border-t border-rule py-3 first:border-t-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-body font-medium text-ink">{sentence(e)}</span>
                      <Badge variant={e.decision === "disputed" ? "warn" : "neutral"}>
                        {e.decision === "disputed" ? <CircleAlert aria-hidden="true" /> : null}
                        {DECISION_LABEL[e.decision] ?? e.decision}
                      </Badge>
                    </div>
                    <span className="text-credit tabular-nums">
                      Proposed by {e.support} of {ws.consensus!.raterCount}, expected by {e.expectedSupport}; majority: {e.majorityDecision}
                      {e.decidedBy === "adjudication" ? ` · adjudicated${e.adjudication?.note ? `: ${e.adjudication.note}` : ""}` : ""}
                    </span>
                    {open ? (
                      <details open={e.decision === "disputed"} className="group/adj min-w-0">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-sans text-[0.9375rem] leading-5 font-medium text-ink [&::-webkit-details-marker]:hidden">
                          <ChevronRight aria-hidden="true" className="size-5 shrink-0 stroke-[1.75] group-open/adj:rotate-90" />
                          {e.decision === "disputed" ? "Adjudication decision" : "Override the majority decision"}
                        </summary>
                        <ActionForm action={adjudicateAction.bind(null, referenceMapId)} submitLabel="Record decision" className="mt-2 flex flex-col gap-4 sm:max-w-xl">
                          <input type="hidden" name="key" value={e.key} />
                          <Field label="Decision">
                            <select name="decision" required className={fieldClass} defaultValue={e.adjudication?.decision ?? ""}>
                              <option value="" disabled>
                                Choose…
                              </option>
                              <option value="expected">Expected</option>
                              <option value="optional">Optional</option>
                              <option value="excluded">Exclude</option>
                            </select>
                          </Field>
                          <Field label="Reason">
                            <textarea name="note" rows={2} maxLength={2000} defaultValue={e.adjudication?.note ?? ""} className={fieldClass} />
                          </Field>
                        </ActionForm>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
              {open ? (
                ws.consensus.isComplete ? (
                  <ActionForm action={finaliseReferenceAction.bind(null, referenceMapId)} submitLabel="Finalise reference map" className="flex max-w-xl flex-col gap-4">
                    <Field label="Adjudication notes (optional)">
                      <textarea name="notes" rows={2} className={fieldClass} />
                    </Field>
                  </ActionForm>
                ) : (
                  <Empty>Finalising is possible once every tie has a decision.</Empty>
                )
              ) : null}
            </Section>
          ) : null}
        </>
      ) : (
        <Empty className="mb-12">Submit your own map to see agreement and the consensus.</Empty>
      )}

      {ws.map.adjudicatedAt ? (
        <Section demo={ws.map.isDemo} id="final" title="Adjudicated reference" description={`${ws.finalEdges.length} edge${ws.finalEdges.length === 1 ? "" : "s"}; participant maps are scored against these.`}>
          {ws.map.adjudicationNotes ? <p className="text-body mb-4 max-w-[52rem] whitespace-pre-line text-ink-2">{ws.map.adjudicationNotes}</p> : null}
          <Table caption="Reference Edges" number={ws.agreement ? 3 : 1} className="mb-6">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Relationship</TableHead>
                <TableHead scope="col">Role</TableHead>
                <TableHead scope="col" numeric>
                  Agreement
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ws.finalEdges.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="min-w-64 whitespace-normal">{sentence({ source: e.sourceConceptId, target: e.targetConceptId, type: e.relationshipTypeCode, directed: e.directed })}</TableCell>
                  <TableCell>{e.required ? "Expected" : "Optional"}</TableCell>
                  <TableCell numeric>{fmt(e.agreement, 2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {ws.map.status === "adjudicated" ? (
              <ActionButton action={lockReferenceAction.bind(null, referenceMapId)} label="Lock this version" confirm="Lock this reference map? The database will refuse any later change." />
            ) : null}
            <Link href={`/research/scoring?ref=${referenceMapId}`} className={LINK_44}>
              Score participant maps against this reference
            </Link>
          </div>
        </Section>
      ) : null}
    </>
  );
}
