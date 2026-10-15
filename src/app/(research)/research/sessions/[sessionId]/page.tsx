import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { InteractionTimeline } from "@/components/analytics/charts";
import { conditionKind } from "@/components/analytics/encoding";
import { ConsolePage } from "@/components/shell/gates";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/permissions/can";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { sessionTimeline } from "@/server/research/analytics";
import { EXCLUSION_CATEGORIES, getSession, integrityFlags, listAnnotations, listDeviations } from "@/server/research/sessions";

import { ActionForm } from "../../_components/action-form";
import { Empty, FieldLabel, FlagLine, LINK_44, ObservationalNotice, Section, StatRow, SummaryList, Timestamp } from "../../_components/common";
import { annotateAction, deviationAction, excludeAction } from "../../actions";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata: Metadata = { title: "Session" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ params }: PageProps<"/research/sessions/[sessionId]">) {
  return (
    <ConsolePage path="/research/sessions/[sessionId]" title="Session" description="Session detail: integrity, interaction timeline, derived metrics, annotations, deviations and exclusion.">
      <SessionView params={params} />
    </ConsolePage>
  );
}

/** A dated note in a list (annotations, deviations): a hairline above each, meta line in `text-credit`. */
function NoteList({ items }: { items: { key: string; meta: ReactNode; body: ReactNode }[] }) {
  return (
    <ol className="mb-6 flex max-w-[52rem] flex-col border-y border-rule">
      {items.map((it) => (
        <li key={it.key} className="flex flex-col gap-1 border-t border-rule py-3 first:border-t-0">
          <span className="text-credit">{it.meta}</span>
          <div className="text-body text-ink">{it.body}</div>
        </li>
      ))}
    </ol>
  );
}

async function SessionView({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!UUID_RE.test(sessionId)) notFound();
  const pool = getPool();
  const s = await getSession(pool, sessionId);
  if (!s) notFound();
  const [principal, timeline, annotations, deviations, metrics] = await Promise.all([
    getStaffPrincipal(),
    sessionTimeline(pool, sessionId),
    listAnnotations(pool, sessionId),
    listDeviations(pool, { sessionId }),
    pool.query<{ metric_name: string; metric_version: string; value: number | null; computed_at: string }>(
      `SELECT metric_name, metric_version, value, to_json(computed_at)#>>'{}' AS computed_at FROM derived_metrics WHERE session_id = $1 ORDER BY metric_name`,
      [sessionId],
    ),
  ]);
  const flags = integrityFlags(s);
  const device = Object.entries(s.device ?? {});
  const mayAnnotate = can(principal, "sessions.annotate");
  return (
    <>
      <SummaryList
        className="mb-10 max-w-[52rem]"
        items={[
          {
            label: "Study",
            value: (
              <Link className={LINK_44} href={`/research/sessions?study=${s.studyId}`}>
                {s.studySlug}
              </Link>
            ),
          },
          { label: "Participant", value: <span className="text-id">{s.participantCode}</span> },
          { label: "Condition", value: `${s.conditionCode} (${s.conditionInterface}), period ${s.period}` },
          { label: "Build", value: <span className="text-id">{s.appBuild}</span> },
          {
            label: "Started / completed (UTC)",
            value: (
              <>
                <Timestamp iso={s.startedAt} /> / <Timestamp iso={s.completedAt} />
              </>
            ),
          },
          {
            label: "Learning phase (server clock)",
            value: (
              <>
                <Timestamp iso={s.learningStartedAt} /> to <Timestamp iso={s.learningEndedAt} />, budget {s.learningBudgetSeconds ? `${s.learningBudgetSeconds / 60} min` : "self-paced"}
              </>
            ),
          },
          { label: "Last activity (UTC)", value: <Timestamp iso={s.lastActivityAt} /> },
          { label: "Device covariates", value: device.length ? device.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join("; ") : "None recorded" },
        ]}
      />
      <StatRow
        number={1}
        title="Session Integrity Counts"
        items={[
          { label: "Status", value: s.status.replace(/_/g, " ") },
          { label: "Events", value: s.events },
          { label: "Open gaps", value: s.openGaps },
          { label: "Quarantined", value: s.quarantined },
          { label: "Duplicates absorbed", value: s.duplicateEvents },
          { label: "Interruptions", value: s.interruptionCount, note: `${s.resumes} resume event(s)` },
        ]}
      />
      <Section demo={s.nonExperimental} id="integrity" title="Integrity">
        {flags.length === 0 ? (
          <Empty>No data-quality flags.</Empty>
        ) : (
          <ul className="flex max-w-[52rem] flex-col gap-2 font-sans text-[0.9375rem] leading-6">
            {flags.map((f, i) => (
              <li key={i}>
                <FlagLine level={f.level} text={f.text} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section demo={s.nonExperimental} id="timeline" title="Interaction timeline" description="Every event in sequence order; lanes are the condition-neutral analytic concepts, so 2D and 3D sessions read alike.">
        <ObservationalNotice />
        <InteractionTimeline
          number={1}
          title={`Events of ${s.participantCode} over time`}
          kind={conditionKind(s.conditionInterface)}
          points={timeline.map((p) => ({ seq: p.seq, tMs: p.tMs, lane: p.analyticConcept, label: `${p.type}${p.conceptTitle ? `: ${p.conceptTitle}` : ""}` }))}
        />
      </Section>

      <Section demo={s.nonExperimental} id="metrics" title="Derived metrics" description="Versioned behavioural metrics recomputed from this session's raw events (observational, not outcomes).">
        {metrics.rows.length === 0 ? (
          <Empty>Not computed yet. Recompute from the Analytics page.</Empty>
        ) : (
          <Table caption="Derived Metrics of This Session" number={2} hoverRows density="compact">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Metric</TableHead>
                <TableHead scope="col">Version</TableHead>
                <TableHead scope="col" numeric>
                  Value
                </TableHead>
                <TableHead scope="col">Computed (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.rows.map((m) => (
                <TableRow key={`${m.metric_name}@${m.metric_version}`}>
                  <TableCell className="text-id">{m.metric_name}</TableCell>
                  <TableCell>{m.metric_version}</TableCell>
                  <TableCell numeric>{m.value === null ? "–" : Number.isInteger(m.value) ? m.value : m.value.toFixed(3)}</TableCell>
                  <TableCell>
                    <Timestamp iso={m.computed_at} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section demo={s.nonExperimental} id="annotations" title="Annotations">
        {annotations.length === 0 ? (
          <Empty className="mb-6">No annotations.</Empty>
        ) : (
          <NoteList
            items={annotations.map((a) => ({
              key: a.id,
              meta: (
                <>
                  {a.kind.replace(/_/g, " ")}, <Timestamp iso={a.createdAt} />
                </>
              ),
              body: <p className="whitespace-pre-wrap">{a.body}</p>,
            }))}
          />
        )}
        {mayAnnotate ? (
          <ActionForm action={annotateAction.bind(null, s.id)} submitLabel="Add annotation" className="grid max-w-xl gap-4">
            <FieldLabel label="Kind">
              <NativeSelect name="kind" defaultValue="note">
                {["note", "observation", "technical_issue", "data_quality"].map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </option>
                ))}
              </NativeSelect>
            </FieldLabel>
            <FieldLabel label="Annotation (no participant-identifying details)">
              <Textarea name="body" required rows={3} maxLength={4000} />
            </FieldLabel>
          </ActionForm>
        ) : null}
      </Section>

      <Section demo={s.nonExperimental} id="deviations" title="Protocol deviations">
        {deviations.length === 0 ? (
          <Empty className="mb-6">No deviations recorded.</Empty>
        ) : (
          <NoteList
            items={deviations.map((d) => ({
              key: d.id,
              meta: (
                <>
                  {d.severity}, {d.category}, <Timestamp iso={d.reportedAt} />
                </>
              ),
              body: (
                <>
                  <p>{d.description}</p>
                  {d.resolution ? <p className="text-ink-2">Resolution: {d.resolution}</p> : null}
                </>
              ),
            }))}
          />
        )}
        {mayAnnotate ? (
          <ActionForm action={deviationAction.bind(null, s.studyId, s.id)} submitLabel="Record deviation" className="grid max-w-xl gap-4">
            <div className="grid gap-4 xs:grid-cols-2">
              <FieldLabel label="Category">
                <NativeSelect name="category" defaultValue="procedure">
                  {["procedure", "technical", "consent", "timing", "allocation", "content", "other"].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </NativeSelect>
              </FieldLabel>
              <FieldLabel label="Severity">
                <NativeSelect name="severity" defaultValue="minor">
                  <option value="minor">minor</option>
                  <option value="major">major</option>
                </NativeSelect>
              </FieldLabel>
            </div>
            <FieldLabel label="Description">
              <Textarea name="description" required rows={2} maxLength={4000} />
            </FieldLabel>
            <FieldLabel label="Resolution (optional)">
              <Input name="resolution" maxLength={4000} />
            </FieldLabel>
          </ActionForm>
        ) : null}
      </Section>

      {can(principal, "sessions.exclude") && !s.excluded ? (
        <Section demo={s.nonExperimental} id="exclude" title="Exclude from analysis" description="Flags the session; raw data is kept and exports carry the flag and its category. This cannot be undone here.">
          <ActionForm action={excludeAction.bind(null, s.id)} submitLabel="Exclude session" variant="destructive" className="grid max-w-xl gap-4">
            <FieldLabel label="Reason category">
              <NativeSelect name="category" defaultValue="technical_failure">
                {EXCLUSION_CATEGORIES.map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </option>
                ))}
              </NativeSelect>
            </FieldLabel>
            <FieldLabel label="Detail">
              <Input name="detail" required minLength={3} maxLength={2000} />
            </FieldLabel>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
