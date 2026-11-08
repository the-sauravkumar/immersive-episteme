import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConsolePage } from "@/components/shell/gates";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inCanonicalOrder } from "@/features/learning/labels";
import { can } from "@/lib/permissions/can";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { listParityReports } from "@/server/research/parity/store";
import { assessmentOptions, getStudy, pinOptions, snapshotTraditions, studyHistory, type StudyDetail } from "@/server/research/studies";
import { CONSOLE_ALLOCATION_ALGORITHMS, questionnaireInstruments, type QuestionnaireInstrument, type QuestionnaireSlot } from "@/server/research/study-form";
import { DEFAULT_QUESTIONNAIRES } from "@/server/study/config";
import { listRetentionDue } from "@/server/study/purge";

import { ActionForm } from "../../_components/action-form";
import { CHECK_BOX, CHECK_ROW, DemoBadge, Empty, FieldLabel, FIELD_LABEL, LINK_44, Notice, PublishedBadge, Section, StatusBadge, SummaryList, TEXTAREA, Timestamp } from "../../_components/common";
import { activateStudyAction, attachDesignedBatteryAction, closeStudyAction, newVersionAction, purgeParticipantAction, purgeRetentionAction, runParityAction, setBatteryAction, updateStudyAction } from "../../actions";
import { NativeSelect } from "@/components/ui/native-select";
import { Disclosure } from "@/components/ui/disclosure";

export const metadata: Metadata = { title: "Study" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const instant = false;

export default function Page({ params }: PageProps<"/research/studies/[studyId]">) {
  return (
    <ConsolePage path="/research/studies/[studyId]" title="Study" description="Protocol, conditions, pinned content and layout, assessment battery, parity and activation.">
      <StudyView params={params} />
    </ConsolePage>
  );
}

const DESIGN_LABEL: Record<string, string> = { between: "Between subjects", within: "Within subjects" };

async function StudyView({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  if (!UUID_RE.test(studyId)) notFound();
  const pool = getPool();
  const study = await getStudy(pool, studyId);
  if (!study) notFound();
  const principal = await getStaffPrincipal();
  const [pins, assessments, traditions, history, parity] = await Promise.all([
    pinOptions(pool, study.isDemo),
    assessmentOptions(pool, study.isDemo),
    study.snapshotId ? snapshotTraditions(pool, study.snapshotId) : Promise.resolve([]),
    studyHistory(pool, studyId),
    listParityReports(pool, studyId, 1),
  ]);
  const draft = study.status === "draft";
  const mayConfigure = draft && can(principal, "study.configure");
  const latest = parity[0] ?? null;

  return (
    <>
      <SummaryList
        className="mb-10 max-w-[52rem]"
        items={[
          {
            label: "Study",
            value: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{study.title}</span>
                {study.isDemo ? <DemoBadge label="Demo: never experimental" /> : null}
              </span>
            ),
          },
          { label: "Slug", value: <span className="t-table font-semibold wrap-anywhere">{study.slug}</span> },
          { label: "Status", value: <StatusBadge status={study.status} /> },
          { label: "Protocol version", value: <span className="tabular-nums">{study.protocolVersion}</span> },
          { label: "Design", value: DESIGN_LABEL[study.design] ?? study.design },
          { label: "Activated (UTC)", value: <Timestamp iso={study.activatedAt} /> },
        ]}
      />
      {study.configIssues.length ? (
        <Notice tone="error" title="Error">
          The stored configuration does not validate: {study.configIssues.join("; ")}
        </Notice>
      ) : null}

      <ParityAndActivation study={study} latest={latest} principalCan={(p) => can(principal, p)} />

      <Section
        id="protocol"
        title="Protocol configuration"
        
        description={draft ? "Saved changes are recorded in the history below." : "Frozen: this study is no longer a draft. Create a new version to change the protocol."}
      >
        <ConfigForm study={study} pins={pins} traditions={inCanonicalOrder(traditions)} instruments={questionnaireInstruments(assessments, study.config.questionnaires ?? DEFAULT_QUESTIONNAIRES)} disabled={!mayConfigure} />
      </Section>

      <Section demo={study.isDemo} id="conditions" title="Conditions" description="Both conditions share every protocol setting; only the interface differs. Allocation weights set the assignment ratio.">
        <Table caption="Conditions" number={2}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Code</TableHead>
              <TableHead scope="col">Label</TableHead>
              <TableHead scope="col">Interface</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {study.conditions.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="t-table font-semibold wrap-anywhere">{c.code}</TableCell>
                <TableCell>{c.label}</TableCell>
                <TableCell className="t-table font-semibold wrap-anywhere">{c.interface}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section demo={study.isDemo} id="battery" title="Assessment battery and order" description="The same battery, in the same order, for both conditions. Only locked assessments can be used by an active study. Required: every question must be answered before the participant goes on; otherwise questions may be left blank and are stored as skipped.">
        {mayConfigure ? (
          <ActionForm action={attachDesignedBatteryAction.bind(null, study.id)} submitLabel="Attach the designed test battery" variant="outline" className="mb-8 flex max-w-[52rem] flex-col gap-3">
            <p className="t-b text-lime-dim">
              Adds the designed pre-test, post-tests, transfer task, concept map, layout sketch and delayed tests, and the questionnaires of the saved configuration, at their designed phases and positions. Missing ones are loaded first as drafts. Other assessments in the battery are kept after them.
            </p>
          </ActionForm>
        ) : null}
        <BatteryForm study={study} assessments={assessments} disabled={!mayConfigure} />
      </Section>

      {!draft && can(principal, "study.configure") ? (
        <Section demo={study.isDemo} id="new-version" title="New protocol version" description="Copies this study's conditions, battery, configuration and pins into a new draft.">
          <ActionForm action={newVersionAction.bind(null, study.id)} submitLabel="Create new version" className="grid max-w-xl gap-4">
            <FieldLabel label="New slug" hint="Lowercase letters, digits and hyphens.">
              <Input name="slug" required defaultValue={`${study.slug}-v2`} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            </FieldLabel>
            <FieldLabel label="New protocol version">
              <Input name="protocolVersion" required maxLength={64} />
            </FieldLabel>
          </ActionForm>
        </Section>
      ) : null}

      {study.status === "active" && can(principal, "study.activate") ? (
        <Section demo={study.isDemo} id="close" title="Close study" description="Ends recruitment. A closed study cannot be reopened.">
          <ActionForm action={closeStudyAction.bind(null, study.id)} submitLabel="Close study" variant="destructive" className="grid max-w-xl gap-4">
            <FieldLabel label="Reason">
              <Input name="reason" required maxLength={500} />
            </FieldLabel>
          </ActionForm>
        </Section>
      ) : null}

      {can(principal, "participants.purge") && !draft ? <ParticipantData study={study} /> : null}

      <Section demo={study.isDemo} id="history" title="History" description="Append-only audit trail of this study (configuration versions, parity runs, activation).">
        {history.length === 0 ? (
          <Empty>No entries.</Empty>
        ) : (
          <ol className="flex max-w-[52rem] flex-col border-y border-line">
            {history.map((h, i) => (
              <li key={i} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="t-b font-medium text-lime">{h.action.replace(/_/g, " ")}</span>
                  <Timestamp iso={h.occurredAt} />
                </span>
                {h.reason ? <span className="t-b text-lime-dim">{h.reason}</span> : null}
                {h.before !== null || h.after !== null ? (
                  <Disclosure className="min-w-0" summary={<>Change</>}>
                    <pre className="t-table font-semibold wrap-anywhere mt-1 max-h-64 overflow-auto bg-vat-2 p-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify({ before: h.before, after: h.after }, null, 2)}</pre>
                  </Disclosure>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

async function ParticipantData({ study }: { study: StudyDetail }) {
  const { retentionDays, due } = await listRetentionDue(getPool(), study.id);
  return (
    <Section
      demo={study.isDemo}
      id="participant-data"
      title="Participant data"
      description="Removes a participant's answers, concept maps, activity records and session rows. The participant code, consent records, allocation and audit journal are kept as the record that the study was run correctly. Removal cannot be undone."
    >
      <SummaryList
        className="mb-6 max-w-[52rem]"
        items={[
          { label: "Retention period", value: retentionDays ? `${retentionDays} days after a participant's participation ends` : "Not set in the protocol" },
          {
            label: "Past the retention period",
            value: due.length === 0 ? "No participant" : due.map((d) => d.participantCode).join(", "),
          },
        ]}
      />
      <div className="grid max-w-[60rem] gap-x-10 gap-y-8 md:grid-cols-2">
        <ActionForm action={purgeRetentionAction.bind(null, study.id)} submitLabel="Remove data past the retention period" variant="destructive" className="flex flex-col gap-4">
          <p className="t-b text-lime-dim">Removes the data of every participant listed above, one by one, with the retention period as the recorded reason.</p>
          <label className={CHECK_ROW}>
            <input type="checkbox" name="confirm" value="yes" className={CHECK_BOX} />
            I confirm the removal
          </label>
        </ActionForm>
        <ActionForm action={purgeParticipantAction.bind(null, study.id)} submitLabel="Remove this participant's data" variant="destructive" className="flex flex-col gap-4">
          <FieldLabel label="Participant code" hint="The code the participant gave the facilitator, for example P-ABC123DEFG.">
            <Input name="participant" required maxLength={64} autoComplete="off" />
          </FieldLabel>
          <FieldLabel label="Reason" hint="For example: participant asked for removal on 16 October.">
            <Input name="reason" required minLength={5} maxLength={500} />
          </FieldLabel>
          <label className={CHECK_ROW}>
            <input type="checkbox" name="confirm" value="yes" className={CHECK_BOX} />
            I confirm the removal
          </label>
        </ActionForm>
      </div>
    </Section>
  );
}

function ParityAndActivation({
  study,
  latest,
  principalCan,
}: {
  study: StudyDetail;
  latest: Awaited<ReturnType<typeof listParityReports>>[number] | null;
  principalCan: (p: "parity.run" | "study.activate") => boolean;
}) {
  return (
    <Section
      id="parity"
      demo={study.isDemo}
      title="Parity and activation"
      description="Activation generates a fresh parity report and is refused unless every critical check passes, including the information sheet and versioned consent text. The database separately requires a published release snapshot and, for a non-demo study, a locked battery."
    >
      <SummaryList
        className="mb-6 max-w-[52rem]"
        items={[
          {
            label: "Latest content parity",
            value: latest ? (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{latest.report.passed ? "Passed" : `Failed: ${latest.report.criticalFailures} critical check(s)`}</span>
                {latest.report.warnings ? <span className="text-lime-dim">{latest.report.warnings} warning(s)</span> : null}
                <Timestamp iso={latest.createdAt} />
                {principalCan("parity.run") ? (
                  <Link className={LINK_44} href={`/research/parity?study=${study.id}`}>
                    Open the report
                  </Link>
                ) : null}
              </span>
            ) : (
              "No parity report yet."
            ),
          },
        ]}
      />
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        {principalCan("parity.run") ? <ActionForm action={runParityAction.bind(null, study.id)} submitLabel="Run parity check" variant="outline" /> : null}
        {study.status === "draft" && principalCan("study.activate") ? <ActionForm action={activateStudyAction.bind(null, study.id)} submitLabel="Activate study" /> : null}
      </div>
    </Section>
  );
}

const words = (code: string) => code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, " ");

function ConfigForm({
  study,
  pins,
  traditions,
  instruments,
  disabled,
}: {
  study: StudyDetail;
  pins: Awaited<ReturnType<typeof pinOptions>>;
  traditions: { slug: string; name: string }[];
  instruments: QuestionnaireInstrument[];
  disabled: boolean;
}) {
  const c = study.config;
  const body = (
    <fieldset disabled={disabled} className="grid max-w-[60rem] min-w-0 gap-x-6 gap-y-5 md:grid-cols-2">
      <FieldLabel label="Title">
        <Input name="title" required defaultValue={study.title} />
      </FieldLabel>
      <FieldLabel label="Protocol version">
        <Input name="protocolVersion" required defaultValue={study.protocolVersion} />
      </FieldLabel>
      <FieldLabel label="Description" className="md:col-span-2">
        <textarea name="description" rows={2} defaultValue={study.description ?? ""} className={TEXTAREA} />
      </FieldLabel>
      <FieldLabel label="Content snapshot (release)">
        <NativeSelect name="snapshotId" defaultValue={study.snapshotId ?? ""}>
          <option value="">None</option>
          {pins.snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.versionLabel} ({s.kind}, {s.status})
            </option>
          ))}
        </NativeSelect>
      </FieldLabel>
      <input type="hidden" name="manifestId" value={study.manifestId ?? ""} />
      <fieldset className="flex min-w-0 flex-col gap-1 md:col-span-2">
        <legend className={FIELD_LABEL}>Traditions</legend>
        {traditions.length === 0 ? <span className="t-s text-lime-dim">Pin a snapshot first.</span> : null}
        <div className="flex flex-wrap gap-x-6">
          {traditions.map((t) => (
            <label key={t.slug} className={CHECK_ROW}>
              <input type="checkbox" name="traditions" value={t.slug} defaultChecked={c.traditionSlugs.includes(t.slug)} className={CHECK_BOX} />
              {t.name}
            </label>
          ))}
        </div>
      </fieldset>
      <FieldLabel label="Allocation algorithm">
        <NativeSelect name="allocationAlgorithm" defaultValue={c.allocation.algorithm}>
          {CONSOLE_ALLOCATION_ALGORITHMS.map((a) => (
            <option key={a} value={a}>
              {words(a)}
            </option>
          ))}
        </NativeSelect>
      </FieldLabel>
      <FieldLabel label="Block size">
        <Input name="blockSize" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={c.allocation.blockSize ?? ""} />
      </FieldLabel>
      <FieldLabel label="Learning cap (min)" hint="Learning is self-paced in both conditions (Concept Note rev2, Section 9). Every stage must be visited, and the learner may finish before the cap only after that.">
        <Input name="exposureMinutes" type="text" inputMode="numeric" pattern="[0-9]*" required defaultValue={c.exposure.minutes ?? ""} />
      </FieldLabel>
      <FieldLabel label="Stall cue after (s)" hint="Active seconds without reaching a new stage before both doors offer the hint (D6; a pilot parameter, 10 to 1800).">
        <Input name="stallSeconds" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={c.guidance.stallSeconds ?? ""} />
      </FieldLabel>
      <FieldLabel label="Hint text" className="md:col-span-2" hint="The on-demand hint both doors show behind a Hint button. Needed when the hint and stall cue are on.">
        <textarea name="hintText" rows={3} maxLength={2000} defaultValue={c.guidance.hintText ?? ""} className={TEXTAREA} />
      </FieldLabel>
      <FieldLabel label="WebGL failure policy">
        <NativeSelect name="webglFailurePolicy" defaultValue={c.webglFailurePolicy}>
          {["retry", "exclude", "reassign"].map((m) => (
            <option key={m} value={m}>
              {words(m)}
            </option>
          ))}
        </NativeSelect>
      </FieldLabel>
      <FieldLabel label="Data retention (days)" hint="After a participant's participation ends. The principal investigator removes the data once it has passed (Participant data section); it is not deleted automatically.">
        <Input name="retentionDays" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={c.retentionDays ?? ""} />
      </FieldLabel>
      <FieldLabel label="Participant information sheet" className="md:col-span-2" hint="Shown verbatim on the consent page, before the consent text. The study cannot be activated without it.">
        <textarea name="participantInformation" rows={8} maxLength={20000} defaultValue={c.participantInformation ?? ""} className={TEXTAREA} />
      </FieldLabel>
      <FieldLabel label="Consent version" hint="Recorded with every consent decision. Give a new version whenever the consent text or the information sheet changes.">
        <Input name="consentVersion" maxLength={64} defaultValue={c.consent?.version ?? ""} />
      </FieldLabel>
      <FieldLabel label="Consent text" className="md:col-span-2" hint="Shown verbatim above the agreement; its SHA-256 is stored with each decision. The study cannot be activated without it.">
        <textarea name="consentText" rows={8} maxLength={20000} defaultValue={c.consent?.text ?? ""} className={TEXTAREA} />
      </FieldLabel>
      <fieldset className="flex min-w-0 flex-col gap-1 md:col-span-2">
        <legend className={FIELD_LABEL}>Shared switches (apply to both conditions)</legend>
        <div className="flex flex-wrap gap-x-6">
          <label className={CHECK_ROW}>
            <input type="checkbox" name="cueEnabled" defaultChecked={c.guidance.cueEnabled} className={CHECK_BOX} />
            Hint and stall cue on (both doors, every use logged)
          </label>
          <label className={CHECK_ROW}>
            <input type="checkbox" name="nonExperimental" defaultChecked={c.nonExperimental} className={CHECK_BOX} />
            Non-experimental (a pilot: its data are never analysed as observations)
          </label>
        </div>
      </fieldset>
      <QuestionnaireFields instruments={instruments} />
      <FieldLabel label="Notes" className="md:col-span-2">
        <textarea name="notes" rows={2} maxLength={4000} defaultValue={c.notes ?? ""} className={TEXTAREA} />
      </FieldLabel>
    </fieldset>
  );
  if (disabled) return body;
  return (
    <ActionForm action={updateStudyAction.bind(null, study.id)} submitLabel="Save configuration" className="flex flex-col gap-6">
      {body}
    </ActionForm>
  );
}

const QUESTIONNAIRE_STEP_LABEL: Record<QuestionnaireSlot, string> = {
  pre: "Before the pre-test",
  postLearning: "Straight after learning",
  end: "At the end",
};

function QuestionnaireFields({ instruments }: { instruments: QuestionnaireInstrument[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 md:col-span-2">
      <input type="hidden" name="questionnaireCodes" value={instruments.map((q) => q.code).join(",")} />
      {instruments.length === 0 ? (
        <span className="t-s text-lime-dim">No questionnaire instruments exist yet. Attaching the designed test battery below loads the seeded instruments.</span>
      ) : (
        <Table caption="Questionnaires" number={1}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Instrument</TableHead>
              <TableHead scope="col">Given</TableHead>
              <TableHead scope="col">For</TableHead>
              <TableHead scope="col">Version</TableHead>
              <TableHead scope="col" numeric>
                Order
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instruments.map((q) => (
              <TableRow key={q.code}>
                <TableCell className="min-w-40 whitespace-normal">
                  <span className="font-medium">{q.title}</span>
                  <span className="t-table font-semibold wrap-anywhere block text-lime-dim">{q.code}</span>
                </TableCell>
                <TableCell>
                  <NativeSelect name={`questionnaireStep:${q.code}`} defaultValue={q.slot ?? ""} className="w-full min-w-40" aria-label={`When ${q.title} is given`}>
                    <option value="">Not used</option>
                    {(Object.keys(QUESTIONNAIRE_STEP_LABEL) as QuestionnaireSlot[]).map((slot) => (
                      <option key={slot} value={slot}>
                        {QUESTIONNAIRE_STEP_LABEL[slot]}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <NativeSelect name={`questionnaireFor:${q.code}`} defaultValue={q.audience ?? ""} className="w-full min-w-36" aria-label={`Who answers ${q.title}`}>
                    <option value="">Both conditions</option>
                    <option value="2d">Conventional 2D only</option>
                    <option value="immersive">Immersive 3D only</option>
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <NativeSelect name={`questionnaireVersion:${q.code}`} defaultValue={q.version ? String(q.version) : ""} className="w-full min-w-32" aria-label={`Version of ${q.title}`}>
                    <option value="">Highest in the battery</option>
                    {q.versions.map((v) => (
                      <option key={v} value={String(v)}>
                        v{v}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell numeric>
                  <Input name={`questionnaireOrder:${q.code}`} type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={q.slot ? q.order : ""} className="ml-auto w-16 text-right tabular-nums" aria-label={`Order of ${q.title}`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <span className="t-s text-lime-dim">
        Each instrument used here must also be in the assessment battery below; the parity check refuses the study otherwise. Before the pre-test no condition is known yet, so an instrument given then is for both conditions.
      </span>
    </div>
  );
}

const PHASES = ["pre", "post", "follow_up"];

function BatteryForm({ study, assessments, disabled }: { study: StudyDetail; assessments: Awaited<ReturnType<typeof assessmentOptions>>; disabled: boolean }) {
  const inBattery = new Map(study.battery.map((b) => [b.assessmentId, b]));
  if (assessments.length === 0) return <Empty>No assessments exist yet (authored under Assessments).</Empty>;
  const table = (
    <Table caption="Assessment Battery" number={3} hoverRows>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Use</TableHead>
          <TableHead scope="col">Assessment</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col">Phase</TableHead>
          <TableHead scope="col" numeric>
            Position
          </TableHead>
          <TableHead scope="col">Required</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assessments.map((a) => {
          const b = inBattery.get(a.id);
          return (
            <TableRow key={a.id}>
              <TableCell>
                <label className="flex size-11 cursor-pointer items-center justify-center">
                  <input type="checkbox" name="item" value={a.id} defaultChecked={!!b} disabled={disabled} aria-label={`Use ${a.title}`} className={CHECK_BOX} />
                </label>
              </TableCell>
              <TableCell className="min-w-56 whitespace-normal">
                <span className="font-medium">{a.title}</span>
                <span className="t-table font-semibold wrap-anywhere block text-lime-dim">
                  {a.code} v{a.version}, {a.kind}
                </span>
              </TableCell>
              <TableCell>
                <PublishedBadge published={a.status === "locked"} label={words(a.status)} />
              </TableCell>
              {a.kind === "questionnaire" ? (
                <TableCell colSpan={2} className="whitespace-normal text-lime-dim">
                  <input type="hidden" name={`phase:${a.id}`} value={b?.phase ?? "post"} />
                  <input type="hidden" name={`position:${a.id}`} value={b?.position ?? 0} />
                  When and in what order it is given is set in Table 1.
                </TableCell>
              ) : (
                <>
                  <TableCell>
                    <NativeSelect name={`phase:${a.id}`} defaultValue={b?.phase ?? (a.kind === "pretest" ? "pre" : "post")} className="w-40" disabled={disabled} aria-label={`Phase of ${a.title}`}>
                      {PHASES.map((p) => (
                        <option key={p} value={p}>
                          {words(p)}
                        </option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell numeric>
                    <Input name={`position:${a.id}`} type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={b?.position ?? 0} className="ml-auto w-20 text-right tabular-nums" disabled={disabled} aria-label={`Position of ${a.title}`} />
                  </TableCell>
                </>
              )}
              <TableCell>
                <label className="flex size-11 cursor-pointer items-center justify-center">
                  <input type="checkbox" name={`required:${a.id}`} defaultChecked={b?.required ?? true} disabled={disabled} aria-label={`${a.title} required: every question must be answered`} className={CHECK_BOX} />
                </label>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
  if (disabled) return table;
  return (
    <ActionForm action={setBatteryAction.bind(null, study.id)} submitLabel="Save battery" className="flex flex-col gap-6">
      {table}
    </ActionForm>
  );
}
