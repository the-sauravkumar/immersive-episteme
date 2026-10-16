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
import { listRetentionDue } from "@/server/study/purge";

import { ActionForm } from "../../_components/action-form";
import { CHECK_BOX, CHECK_ROW, DemoBadge, Empty, FieldLabel, FIELD_LABEL, LINK_44, Notice, PublishedBadge, Section, StatusBadge, SummaryList, TEXTAREA, Timestamp } from "../../_components/common";
import { activateStudyAction, closeStudyAction, newVersionAction, purgeParticipantAction, purgeRetentionAction, runParityAction, setBatteryAction, updateStudyAction } from "../../actions";
import { NativeSelect } from "@/components/ui/native-select";
import { Disclosure } from "@/components/ui/disclosure";

export const metadata: Metadata = { title: "Study" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
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
          { label: "Slug", value: <span className="text-id">{study.slug}</span> },
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
        eyebrow="Protocol"
        title="Protocol configuration"
        
        description={draft ? "Saved changes are recorded in the history below." : "Frozen: this study is no longer a draft. Create a new version to change the protocol."}
      >
        <ConfigForm study={study} pins={pins} traditions={inCanonicalOrder(traditions)} disabled={!mayConfigure} />
      </Section>

      <Section demo={study.isDemo} id="conditions" title="Conditions" description="Both conditions share every protocol setting; only the interface differs. Allocation weights set the assignment ratio.">
        <Table caption="Conditions" number={1}>
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
                <TableCell className="text-id">{c.code}</TableCell>
                <TableCell>{c.label}</TableCell>
                <TableCell className="text-id">{c.interface}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section demo={study.isDemo} id="battery" title="Assessment battery and order" description="The same battery, in the same order, for both conditions. Only locked assessments can be used by an active study.">
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
          <ol className="flex max-w-[52rem] flex-col border-y border-rule">
            {history.map((h, i) => (
              <li key={i} className="flex flex-col gap-1 border-t border-rule py-3 first:border-t-0">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-body font-medium text-ink">{h.action.replace(/_/g, " ")}</span>
                  <Timestamp iso={h.occurredAt} />
                </span>
                {h.reason ? <span className="text-body text-ink-2">{h.reason}</span> : null}
                {h.before !== null || h.after !== null ? (
                  <Disclosure className="min-w-0" summary={<>Change</>}>
                    <pre className="text-id mt-1 max-h-64 overflow-auto bg-sunk p-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify({ before: h.before, after: h.after }, null, 2)}</pre>
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

/**
 * Removal of participant data (DR-030): on a participant's request, and after the retention
 * period. Principal investigator only (participants.purge); every removal is journalled.
 */
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
          <p className="text-body text-ink-2">Removes the data of every participant listed above, one by one, with the retention period as the recorded reason.</p>
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
      eyebrow="Confound control"
      title="Parity and activation"
      description="Activation generates a fresh parity report and is refused unless every critical check passes; the database separately requires a published release snapshot, a published manifest compiled from it and a locked battery."
    >
      <SummaryList
        className="mb-6 max-w-[52rem]"
        items={[
          {
            label: "Latest content parity",
            value: latest ? (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{latest.report.passed ? "Passed" : `Failed: ${latest.report.criticalFailures} critical check(s)`}</span>
                {latest.report.warnings ? <span className="text-ink-2">{latest.report.warnings} warning(s)</span> : null}
                <Timestamp iso={latest.createdAt} />
                <Link className={LINK_44} href={`/research/parity?study=${study.id}`}>
                  Open the report
                </Link>
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

const ALLOCATION = ["simple", "block", "stratified_block", "counterbalanced", "manual"];
const GUIDANCE = ["none", "exploration_first", "guided", "hybrid"];
const words = (code: string) => code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, " ");

function ConfigForm({
  study,
  pins,
  traditions,
  disabled,
}: {
  study: StudyDetail;
  pins: Awaited<ReturnType<typeof pinOptions>>;
  traditions: { slug: string; name: string }[];
  disabled: boolean;
}) {
  const c = study.config;
  const manifests = pins.manifests.filter((m) => m.snapshotId === study.snapshotId);
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
      <FieldLabel label="Design">
        <NativeSelect name="design" defaultValue={study.design}>
          <option value="between">Between subjects</option>
          <option value="within">Within subjects</option>
        </NativeSelect>
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
      <FieldLabel label="Spatial manifest" className="md:col-span-2" hint="Manifests compiled from the selected snapshot. Save after changing the snapshot to refresh this list.">
        <NativeSelect name="manifestId" defaultValue={study.manifestId ?? ""}>
          <option value="">None</option>
          {manifests.map((m) => (
            <option key={m.id} value={m.id}>
              {m.traditions.join(", ")} ({m.status}, compiler {m.compilerVersion})
            </option>
          ))}
        </NativeSelect>
      </FieldLabel>
      <fieldset className="flex min-w-0 flex-col gap-1 md:col-span-2">
        <legend className={FIELD_LABEL}>Traditions</legend>
        {traditions.length === 0 ? <span className="text-credit">Pin a snapshot first.</span> : null}
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
          {ALLOCATION.map((a) => (
            <option key={a} value={a}>
              {words(a)}
            </option>
          ))}
        </NativeSelect>
      </FieldLabel>
      <FieldLabel label="Block size">
        <Input name="blockSize" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={c.allocation.blockSize ?? ""} />
      </FieldLabel>
      <FieldLabel label="Strata" hint="Comma-separated.">
        <Input name="strata" defaultValue={c.allocation.strata.join(", ")} />
      </FieldLabel>
      <FieldLabel label="Exposure">
        <NativeSelect name="exposureMode" defaultValue={c.exposure.mode}>
          <option value="fixed_time">Fixed time (equal for both conditions)</option>
          <option value="self_paced">Self-paced</option>
        </NativeSelect>
      </FieldLabel>
      <FieldLabel label="Exposure (min)">
        <Input name="exposureMinutes" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={c.exposure.minutes ?? ""} />
      </FieldLabel>
      <FieldLabel label="Guidance policy">
        <NativeSelect name="guidancePolicy" defaultValue={c.guidance.policy}>
          {GUIDANCE.map((g) => (
            <option key={g} value={g}>
              {words(g)}
            </option>
          ))}
        </NativeSelect>
      </FieldLabel>
      <FieldLabel label="Stall cue after (s)" hint="Active seconds without a newly opened concept before the cue shows (D6; a pilot parameter, 10 to 1800).">
        <Input name="stallSeconds" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={c.guidance.stallSeconds ?? ""} />
      </FieldLabel>
      <FieldLabel label="Hint text" className="md:col-span-2" hint="The on-demand hint both conditions show. Needed when the policy is hybrid and guidance cues are on.">
        <textarea name="hintText" rows={3} maxLength={2000} defaultValue={c.guidance.hintText ?? ""} className={TEXTAREA} />
      </FieldLabel>
      <FieldLabel label="Mini-map (3D)">
        <NativeSelect name="minimap" defaultValue={c.minimap}>
          {["toggle", "on", "off"].map((m) => (
            <option key={m} value={m}>
              {words(m)}
            </option>
          ))}
        </NativeSelect>
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
      <FieldLabel label="Consent version">
        <Input name="consentVersion" maxLength={64} defaultValue={c.consentVersion ?? ""} />
      </FieldLabel>
      <FieldLabel label="Inclusion criteria" hint="One per line.">
        <textarea name="inclusion" rows={3} defaultValue={c.eligibility.inclusion.join("\n")} className={TEXTAREA} />
      </FieldLabel>
      <FieldLabel label="Exclusion criteria" hint="One per line.">
        <textarea name="exclusion" rows={3} defaultValue={c.eligibility.exclusion.join("\n")} className={TEXTAREA} />
      </FieldLabel>
      <fieldset className="flex min-w-0 flex-col gap-1 md:col-span-2">
        <legend className={FIELD_LABEL}>Shared switches (apply to both conditions)</legend>
        <div className="flex flex-wrap gap-x-6">
          <label className={CHECK_ROW}>
            <input type="checkbox" name="allowEarlyFinish" defaultChecked={c.exposure.allowEarlyFinish} className={CHECK_BOX} />
            Allow finishing the learning phase early (a fixed-time study with early finish fails the parity check and cannot be activated)
          </label>
          <label className={CHECK_ROW}>
            <input type="checkbox" name="cueEnabled" defaultChecked={c.guidance.cueEnabled} className={CHECK_BOX} />
            Guidance cues on
          </label>
          <label className={CHECK_ROW}>
            <input type="checkbox" name="searchEnabled" defaultChecked={c.searchEnabled} className={CHECK_BOX} />
            Concept search on
          </label>
        </div>
      </fieldset>
      <FieldLabel label="Matched content sets" className="md:col-span-2" hint="JSON, within-subjects designs only.">
        <textarea name="contentSets" rows={3} defaultValue={c.contentSets ? JSON.stringify(c.contentSets, null, 2) : ""} className={`${TEXTAREA} font-mono text-[0.875rem]`} />
      </FieldLabel>
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

const PHASES = ["pre", "learning", "post", "follow_up"];

function BatteryForm({ study, assessments, disabled }: { study: StudyDetail; assessments: Awaited<ReturnType<typeof assessmentOptions>>; disabled: boolean }) {
  const inBattery = new Map(study.battery.map((b) => [b.assessmentId, b]));
  if (assessments.length === 0) return <Empty>No assessments exist yet (authored under Assessments).</Empty>;
  const table = (
    <Table caption="Assessment Battery" number={2} hoverRows>
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
                <span className="text-id block text-ink-3">
                  {a.code} v{a.version}, {a.kind}
                </span>
              </TableCell>
              <TableCell>
                <PublishedBadge published={a.status === "locked"} label={words(a.status)} />
              </TableCell>
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
              <TableCell>
                <label className="flex size-11 cursor-pointer items-center justify-center">
                  <input type="checkbox" name={`required:${a.id}`} defaultChecked={b?.required ?? true} disabled={disabled} aria-label={`${a.title} required`} className={CHECK_BOX} />
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
