import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton, ActionForm, checkBoxClass, checkRowClass, Field, fieldClass } from "@/components/assessment/action-form";
import { ItemForm } from "@/components/assessment/item-form";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardEyebrow, CardHeader } from "@/components/ui/card";
import { configParameters, resolveConfig } from "@/features/assessment/scoring";
import { plural } from "@/lib/text/plural";
import { getAssessment, listRelationshipTypes } from "@/server/assessment/definitions";
import { listReferenceMaps } from "@/server/assessment/reference-maps";
import {
  createReferenceMapAction,
  createRubricAction,
  deleteItemAction,
  lockRubricAction,
  newVersionAction,
  publishAssessmentAction,
  saveItemAction,
  updateAssessmentMetaAction,
} from "@/server/assessment/research-actions";
import { getPool } from "@/server/db/client";
import { titleCase } from "@/lib/text/title-case";

import { DemoBadge, Empty, LINK_44, PublishedBadge, Section, SubHeading, SummaryList } from "../../_components/common";

export const metadata: Metadata = { title: "Assessment" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ params }: PageProps<"/research/assessments/[assessmentId]">) {
  return (
    <ConsolePage path="/research/assessments/[assessmentId]" title="Assessment" description="One version of an instrument: its definition, items and answer keys, rubrics and expert reference maps.">
      <Detail params={params} />
    </ConsolePage>
  );
}

const KIND_LABEL: Record<string, string> = {
  pretest: "Pre-test",
  posttest: "Post-test",
  reconstruction: "Concept-map reconstruction",
  transfer: "Transfer task",
  questionnaire: "Questionnaire",
};

const ITEM_KIND_LABEL: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  short_text: "Short text",
  long_text: "Long text",
  likert: "Rating scale",
  numeric: "Number",
  ranking: "Ranking",
  concept_map: "Concept map",
};

/** A JSON block: mono on --sunk, wrapping, never widening the page. */
function JsonBlock({ value }: { value: unknown }) {
  return <pre className="text-id max-h-80 overflow-auto bg-sunk p-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(value, null, 2)}</pre>;
}

async function Detail({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const pool = getPool();
  const a = await getAssessment(pool, assessmentId).catch(() => null);
  if (!a) notFound();
  const types = await listRelationshipTypes(pool);
  const refs = a.kind === "reconstruction" ? await listReferenceMaps(pool, a.id) : [];
  const draft = a.status === "draft";
  const scoring = (a.config.scoring as Record<string, unknown> | undefined) ?? configParameters(resolveConfig({}));
  const nextPosition = a.items.reduce((m, i) => Math.max(m, i.position + 1), 0);
  const textItems = a.items.filter((i) => i.kind === "short_text" || i.kind === "long_text");

  return (
    <>
      <SummaryList
        className="mb-6 max-w-[52rem]"
        items={[
          {
            label: "Instrument",
            value: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{a.title}</span>
                <PublishedBadge published={!draft} />
                {a.isDemo ? <DemoBadge label="Demo" /> : null}
              </span>
            ),
          },
          { label: "Code", value: <span className="text-id">{a.code}</span> },
          { label: "Version", value: <span className="tabular-nums">v{a.version}</span> },
          { label: "Kind", value: KIND_LABEL[a.kind] ?? a.kind },
          { label: "Published (UTC)", value: a.lockedAt ? <span className="text-id">{a.lockedAt.toISOString().slice(0, 10)}</span> : "Not published" },
        ]}
      />
      <nav aria-label="Versions" className="mb-6 flex flex-wrap items-center gap-x-1 border-b border-rule">
        <span className="text-label mr-3">Versions</span>
        {a.versions.map((v) =>
          v.id === a.id ? (
            <span key={v.id} aria-current="page" className="inline-flex min-h-11 items-center border-b-[3px] border-indigo px-3 font-sans text-[0.9375rem] leading-5 font-medium text-ink tabular-nums">
              v{v.version}
            </span>
          ) : (
            <Link key={v.id} href={`/research/assessments/${v.id}`} className="inline-flex min-h-11 items-center border-b-[3px] border-transparent px-3 font-sans text-[0.9375rem] leading-5 font-medium text-ink-3 tabular-nums hover:text-ink">
              v{v.version} ({v.status === "locked" ? "published" : "draft"})
            </Link>
          ),
        )}
      </nav>
      <div className="mb-12 flex flex-wrap gap-3">
        {draft ? (
          <ActionButton
            action={publishAssessmentAction.bind(null, a.id)}
            label="Publish this version"
            variant="default"
            confirm="Publish this version? Its items, keys and configuration can never change afterwards."
          />
        ) : (
          <ActionButton action={newVersionAction.bind(null, a.id)} label="Create new draft version" redirectTo="/research/assessments/{id}" />
        )}
      </div>

      <Section demo={a.isDemo} id="definition" title="Definition" description={draft ? undefined : "Published: the definition is fixed. Create a new draft version to change it."}>
        {draft ? (
          <ActionForm action={updateAssessmentMetaAction.bind(null, a.id)} submitLabel="Save definition" className="flex max-w-2xl flex-col gap-4">
            <Field label="Title">
              <input name="title" required defaultValue={a.title} className={fieldClass} />
            </Field>
            <Field label="Description">
              <textarea name="description" rows={2} defaultValue={a.description ?? ""} className={fieldClass} />
            </Field>
            <Field label="Instrument name (if an established instrument)">
              <input name="instrumentName" defaultValue={a.instrumentName ?? ""} className={fieldClass} />
            </Field>
            <Field label="Instrument citation">
              <textarea name="instrumentCitation" rows={2} defaultValue={a.instrumentCitation ?? ""} className={fieldClass} />
            </Field>
            <label className={checkRowClass}>
              <input type="checkbox" name="isValidatedInstrument" defaultChecked={a.isValidatedInstrument} className={checkBoxClass} /> Validated instrument (needs name and citation)
            </label>
            {a.kind === "reconstruction" ? (
              <Field label="Concept-map scoring configuration (JSON)" hint="Parameters of docs/research/concept-map-scoring.md. Stored resolved, and copied into every score.">
                <textarea name="scoring" rows={12} defaultValue={JSON.stringify(scoring, null, 2)} className={fieldClass} />
              </Field>
            ) : null}
          </ActionForm>
        ) : (
          <SummaryList
            className="max-w-[52rem]"
            items={[
              { label: "Description", value: a.description ?? "–" },
              { label: "Instrument", value: a.instrumentName ? `${a.instrumentName}${a.isValidatedInstrument ? " (validated)" : ""}` : "–" },
              { label: "Citation", value: a.instrumentCitation ?? "–" },
              ...(a.kind === "reconstruction" ? [{ label: "Scoring configuration", value: <JsonBlock value={scoring} /> }] : []),
            ]}
          />
        )}
      </Section>

      <Section demo={a.isDemo} id="items" title="Items" description={`${a.items.length} item${a.items.length === 1 ? "" : "s"}, in the order participants see them.`}>
        {a.items.length === 0 ? <Empty className="mb-6">No items yet.</Empty> : null}
        <ol className="flex flex-col gap-6">
          {a.items.map((item, index) => (
            <li key={item.id}>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    {/* Items are numbered from 1 in the order participants see them; the stored (zero-based) position is on the key line. */}
                    <h3 className="text-h3 text-ink tabular-nums">{titleCase(`Item ${index + 1}: ${ITEM_KIND_LABEL[item.kind] ?? item.kind}`)}</h3>
                    <p className="text-id break-all text-ink-3">
                      {item.itemKey}, position {item.position}
                    </p>
                  </div>
                  {draft ? <ActionButton action={deleteItemAction.bind(null, a.id, item.id)} label="Delete item" variant="destructive" confirm="Delete this item?" /> : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {draft ? (
                    <ItemForm action={saveItemAction.bind(null, a.id)} value={item} relationshipTypes={types} submitLabel="Save item" />
                  ) : (
                    <>
                      <p className="text-body whitespace-pre-line text-ink">{item.prompt}</p>
                      <JsonBlock value={{ config: item.config, answerKey: item.answerKey ?? null }} />
                    </>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
        {draft ? (
          <Card plate className="mt-6">
            <CardHeader>
              <CardEyebrow>New item</CardEyebrow>
              <SubHeading className="mb-0">Add an item</SubHeading>
            </CardHeader>
            <CardContent>
              <ItemForm
                action={saveItemAction.bind(null, a.id)}
                value={{ itemKey: "", position: nextPosition, kind: "", prompt: "", config: {}, answerKey: null }}
                relationshipTypes={types}
                submitLabel="Add item"
              />
            </CardContent>
          </Card>
        ) : null}
      </Section>

      {textItems.length > 0 ? (
        <Section demo={a.isDemo} id="rubrics" title="Rubrics for free-text items" description="Raters score free-text answers against a published rubric; each rubric version is fixed once published.">
          <div className="flex flex-col gap-6">
            {textItems.map((item) => {
              const rubrics = a.rubrics.filter((r) => r.itemId === item.id);
              return (
                <Card key={item.id}>
                  <CardHeader>
                    <CardEyebrow>Free-text item</CardEyebrow>
                    <h3 className="text-h3 text-ink tabular-nums">{titleCase(`Rubrics for item ${a.items.findIndex((x) => x.id === item.id) + 1}`)}</h3>
                    <p className="text-id break-all text-ink-3">
                      {item.itemKey}, position {item.position}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    {rubrics.length === 0 ? <Empty>No rubric yet.</Empty> : null}
                    {rubrics.map((r) => (
                      <div key={r.id} className="flex flex-col gap-3 border-t border-rule pt-4">
                        <p className="flex flex-wrap items-center gap-3 font-sans text-[0.9375rem] leading-5 font-medium text-ink">
                          Rubric <span className="tabular-nums">v{r.version}</span>
                          <PublishedBadge published={r.status === "locked"} />
                        </p>
                        <dl className="border-y border-rule">
                          {r.levels.map((l) => (
                            <div key={l.value} className="grid min-w-0 gap-x-4 border-t border-rule py-2 first:border-t-0 xs:grid-cols-[3rem_minmax(0,10rem)_minmax(0,1fr)]">
                              <dt className="text-body font-semibold text-ink tabular-nums xs:text-right">{l.value}</dt>
                              <dd className="text-body font-medium text-ink">{l.label}</dd>
                              <dd className="text-body text-ink-2">{l.descriptor}</dd>
                            </div>
                          ))}
                        </dl>
                        {r.status === "draft" ? (
                          <ActionButton action={lockRubricAction.bind(null, r.id)} label="Publish rubric" confirm="Publish this rubric? It cannot change afterwards." />
                        ) : (
                          <Link href={`/research/scoring/rubrics/${r.id}`} className={LINK_44}>
                            Rate answers with this rubric
                          </Link>
                        )}
                      </div>
                    ))}
                    <ActionForm action={createRubricAction.bind(null, a.id, item.id)} submitLabel="Create rubric version" resetOnSuccess className="flex flex-col gap-4 border-t border-rule pt-4">
                      <Field label="Levels" hint="One per line as 'value | label | descriptor', e.g. '2 | Full | Explains the mechanism completely'.">
                        <textarea name="levels" required rows={4} className={fieldClass} />
                      </Field>
                    </ActionForm>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}

      {a.kind === "reconstruction" ? (
        <Section demo={a.isDemo} id="refs" title="Expert reference maps" description="Independent rater maps are adjudicated into one reference map per version; participant maps are scored against it.">
          {refs.length === 0 ? (
            <Empty className="mb-6">No reference map versions yet.</Empty>
          ) : (
            <ul className="mb-8 flex max-w-[52rem] flex-col border-y border-rule">
              {refs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule py-1 first:border-t-0">
                  <Link href={`/research/assessments/${a.id}/reference/${r.id}`} className={LINK_44}>
                    <span className="tabular-nums">v{r.version}</span>: {r.title}
                  </Link>
                  <Badge variant={r.status === "locked" || r.adjudicatedAt ? "ok" : "neutral"}>{r.status === "locked" ? "Locked" : r.adjudicatedAt ? "Adjudicated" : "Collecting rater maps"}</Badge>
                  <span className="text-credit tabular-nums">
                    {plural(r.raterCount, "rater map")}{r.adjudicatedAt ? `, ${plural(r.edgeCount, "reference edge")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {draft ? (
            <Empty>Publish this version first: a reference map needs a fixed concept set.</Empty>
          ) : (
            <ActionForm action={createReferenceMapAction.bind(null, a.id)} submitLabel="Create reference map version" className="flex max-w-xl flex-col gap-4" redirectTo={`/research/assessments/${a.id}/reference/{id}`}>
              <Field label="Title">
                <input name="title" required maxLength={300} className={fieldClass} />
              </Field>
              <Field label="Description (optional)">
                <textarea name="description" rows={2} className={fieldClass} />
              </Field>
            </ActionForm>
          )}
          <p className="text-credit mt-4">
            Scoring against an adjudicated map runs on{" "}
            <Link className={LINK_44} href="/research/scoring">
              Scoring
            </Link>
            .
          </p>
        </Section>
      ) : null}
    </>
  );
}
