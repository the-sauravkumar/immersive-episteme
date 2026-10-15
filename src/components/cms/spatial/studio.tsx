/**
 * Spatial studio (/cms/spatial) server components: compile form, manifest list, manifest detail
 * with the validation report, traceability inspector, overrides and publishing.
 *
 * Staff console only. Controls the viewer lacks are not rendered, and every action re-checks the
 * permission on the server (src/server/cms/spatial/actions.ts).
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { CircleAlert, CircleCheck, CircleDashed, Clock } from "lucide-react";

import { FieldMessage } from "@/components/cms/action-form";
import { BLOCK_LINK, CHECK_BOX, CHECK_ROW, LINK, Mono, ROW_LINK, Section as ConsoleSection, Disclosure } from "@/components/cms/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SPATIAL_ELEMENT_KINDS } from "@/lib/validation/enums";
import {
  compileManifestAction,
  compileWithOverridesAction,
  createOverrideAction,
  publishManifestAction,
  revokeOverrideAction,
} from "@/server/cms/spatial/actions";
import {
  explainElement,
  filterElements,
  traceabilityGaps,
  type CompilableSnapshot,
  type ManifestDetail,
  type ManifestSummary,
} from "@/server/cms/spatial/queries";
import { PROTECTED_ELEMENT_FIELDS } from "@/server/cms/spatial/pointer";

import { ManifestActionForm } from "./manifest-action-form";
import { ActionForm } from "@/components/cms/action-form";
import { inCanonicalOrder } from "@/features/learning/labels";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/native-select";

export interface StudioPermissions {
  compile: boolean;
  override: boolean;
  publish: boolean;
}


/** The console section (bits.tsx); the studio's anchors (#inspector-heading ...) name the section. */
function Section({ title, id, children, description }: { title: string; id: string; children: ReactNode; description?: ReactNode }) {
  return (
    <ConsoleSection id={id} title={title} description={description}>
      {children}
    </ConsoleSection>
  );
}

const MANIFEST_STATUS: Record<string, { label: string; variant: "neutral" | "ok" | "warn" | "danger"; Icon: typeof CircleCheck }> = {
  published: { label: "Published", variant: "ok", Icon: CircleCheck },
  valid: { label: "Valid", variant: "ok", Icon: CircleCheck },
  invalid: { label: "Invalid", variant: "danger", Icon: CircleAlert },
  superseded: { label: "Superseded", variant: "neutral", Icon: Clock },
};

/** Manifest status as a word plus an icon (never colour alone). */
function StatusBadge({ status }: { status: string }) {
  const s = MANIFEST_STATUS[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), variant: "neutral" as const, Icon: CircleDashed };
  return (
    <Badge variant={s.variant}>
      <s.Icon aria-hidden="true" />
      {s.label}
    </Badge>
  );
}

const shortHash = (h: string) => h.slice(0, 12);
const json = (v: unknown) => JSON.stringify(v);

// =========================================================================================
// Compile
// =========================================================================================

export function CompilePanel({ snapshots, selected, traditions }: { snapshots: CompilableSnapshot[]; selected: string | null; traditions: { slug: string; name: string }[] }) {
  const snap = snapshots.find((s) => s.id === selected) ?? null;
  return (
    <Section
      id="compile-heading"
      title="Compile a manifest"
      description="Choose a stored snapshot and the traditions to lay out. The compiler is deterministic: the same snapshot, rule set, compiler version, seed and traditions always give the same manifest, so recompiling opens the existing one."
    >
      {snapshots.length === 0 ? (
        <p className="text-body text-ink-2">No snapshot can be compiled yet: publish a release snapshot or build a review snapshot first.</p>
      ) : (
        <form method="get" action="/cms/spatial" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-64 flex-col gap-2">
            <Label htmlFor="snapshot-pick">Snapshot</Label>
            <NativeSelect id="snapshot-pick" name="snapshot" defaultValue={selected ?? ""}>
              <option value="" disabled>
                Choose a snapshot
              </option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.versionLabel} — {s.publishable ? "published release" : `${s.kind} (not publishable)`}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline">
            Show traditions
          </Button>
        </form>
      )}
      {snap ? (
        <ManifestActionForm action={compileManifestAction} submitLabel="Compile" pendingLabel="Compiling…">
          <input type="hidden" name="snapshotId" value={snap.id} />
          {!snap.publishable ? (
            <p className="text-body text-ink-2">
              {snap.versionLabel} is a review snapshot: its manifests are for inspection and the demo only and can never be published for a study.
            </p>
          ) : null}
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-label mb-1">Traditions</legend>
            {traditions.length === 0 ? <p className="text-body text-ink-2">This snapshot has no traditions.</p> : null}
            <div className="flex flex-wrap gap-x-6">
              {inCanonicalOrder(traditions).map((t) => (
                <label key={t.slug} className={CHECK_ROW}>
                  <input type="checkbox" name="traditions" value={t.slug} className={CHECK_BOX} />
                  {t.name} <Mono>{t.slug}</Mono>
                </label>
              ))}
            </div>
            <FieldMessage name="traditions" />
          </fieldset>
          <div className="flex max-w-xs flex-col gap-2">
            <Label htmlFor="compile-seed">Seed</Label>
            <Input id="compile-seed" name="seed" defaultValue="default" aria-describedby="compile-seed-help" />
            <p id="compile-seed-help" className="text-body text-ink-2">
              Only breaks ties in the layout; keep &quot;default&quot; unless a study protocol names another.
            </p>
            <FieldMessage name="seed" />
          </div>
        </ManifestActionForm>
      ) : null}
    </Section>
  );
}

// =========================================================================================
// Manifest list
// =========================================================================================

export function ManifestList({ manifests, selected }: { manifests: ManifestSummary[]; selected: string | null }) {
  return (
    <Section id="manifests-heading" title="Manifests">
      {manifests.length === 0 ? (
        <p className="text-body text-ink-2">No manifest has been compiled yet.</p>
      ) : (
        <div>
          <Table label="Stored spatial manifests, newest first" density="compact" hoverRows>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Manifest</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Snapshot</TableHead>
                <TableHead scope="col">Rule set</TableHead>
                <TableHead scope="col">Traditions</TableHead>
                <TableHead scope="col">Coverage</TableHead>
                <TableHead scope="col" numeric>Overrides</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manifests.map((m) => (
                <TableRow key={m.id} aria-current={m.id === selected ? "true" : undefined} data-state={m.id === selected ? "selected" : undefined}>
                  <TableCell>
                    <Link href={`/cms/spatial?manifest=${m.id}`} className={cn(ROW_LINK, "text-id")}>
                      {shortHash(m.manifestHash)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell>
                    {m.snapshotLabel} <span className="text-ink-3">({m.snapshotKind === "release" ? m.snapshotStatus : "review, not publishable"})</span>
                  </TableCell>
                  <TableCell>
                    {m.ruleSetName} v{m.ruleSetVersion}
                  </TableCell>
                  <TableCell>{m.traditions.join(", ")}</TableCell>
                  <TableCell>
                    {m.coverage
                      ? `${m.coverage.concepts.placed}/${m.coverage.concepts.total} concepts, ${m.coverage.relationships.encoded}/${m.coverage.relationships.total} relationships`
                      : "—"}
                  </TableCell>
                  <TableCell numeric>{m.overridesApplied}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

// =========================================================================================
// Manifest detail
// =========================================================================================

function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-label pt-0.5">{k}</dt>
          <dd className="text-value min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ManifestOverview({ d }: { d: ManifestDetail }) {
  const s = d.summary;
  return (
    <Section id="manifest-heading" title={`Manifest ${shortHash(s.manifestHash)}`}>
      <Dl
        items={[
          ["Status", <StatusBadge key="s" status={s.status} />],
          ["Snapshot", `${s.snapshotLabel} (${s.snapshotKind}, ${s.snapshotStatus})${s.snapshotKind === "review" ? " — not publishable" : ""}`],
          ["Rule set", `${s.ruleSetName} v${s.ruleSetVersion} (${s.ruleSetStatus})`],
          ["Compiler", s.compilerVersion],
          ["Seed", s.seed],
          ["Traditions", s.traditions.join(", ")],
          ["Manifest hash (sha256 of stored jsonb)", <Mono key="h">{s.manifestHash}</Mono>],
          [
            "Coverage",
            s.coverage
              ? `${s.coverage.concepts.placed} of ${s.coverage.concepts.total} concepts placed; ${s.coverage.relationships.encoded} of ${s.coverage.relationships.total} relationships encoded`
              : "—",
          ],
          ["Elements", String(d.manifest.elements.length)],
          ...(d.validation.baseManifestId
            ? ([["Compiled with overrides from", <Link key="b" className={LINK} href={`/cms/spatial?manifest=${d.validation.baseManifestId}`}>base manifest</Link>]] as [string, ReactNode][])
            : []),
        ]}
      />
      {!d.bundle ? <p className="text-body flex items-start gap-2 text-danger"><CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />The snapshot payload could not be read; concept and relationship titles are not resolved.</p> : null}
    </Section>
  );
}

export function ValidationReport({ d }: { d: ManifestDetail }) {
  const checks = d.validation.checks ?? [];
  const failed = checks.filter((c) => !c.passed);
  return (
    <Section
      id="validation-heading"
      title="Validation report"
      description={`${d.validation.passed ? "Passed" : "Failed"}: ${checks.length - failed.length} of ${checks.length} checks passed. The manifest passes when every error-severity check passes.`}
    >
      <ul className="flex flex-col border-t border-rule">
        {[...failed, ...checks.filter((c) => c.passed)].map((c) => {
          const severity = c.details?.severity ?? "error";
          const issues = c.details?.issues ?? [];
          return (
            <li key={c.id} className="text-body border-b border-rule py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {c.passed ? (
                  <Badge variant="ok">
                    <CircleCheck aria-hidden="true" />
                    Passed
                  </Badge>
                ) : (
                  <Badge variant={severity === "error" ? "danger" : "warn"}>
                    <CircleAlert aria-hidden="true" />
                    Failed ({severity})
                  </Badge>
                )}
                <Mono>{c.id}</Mono>
                <span className="text-ink-2">{c.label}</span>
              </div>
              {issues.length > 0 ? (
                <Disclosure className="mt-2" summary={<>{issues.length} issue(s)</>}>
                  <ul className="mt-1 list-disc pl-5 text-ink-3">
                    {issues.slice(0, 50).map((i, n) => (
                      <li key={n}>{i}</li>
                    ))}
                  </ul>
                </Disclosure>
              ) : null}
            </li>
          );
        })}
      </ul>
      {(d.validation.overrides?.length || d.validation.skippedOverrides?.length) ? (
        <div className="text-body flex flex-col gap-1">
          <h3 className="text-label">Overrides in This Manifest</h3>
          <ul className="list-disc pl-5 text-ink-3">
            {(d.validation.overrides ?? []).map((o) => (
              <li key={o.id}>
                Applied: <code className="text-id">{o.elementId}</code> <code className="text-id">{o.field}</code> {json(o.before)} to {json(o.after)}: {o.reason}
              </li>
            ))}
            {(d.validation.skippedOverrides ?? []).map((o) => (
              <li key={o.id}>
                Skipped: <code className="text-id">{o.elementId}</code> <code className="text-id">{o.field}</code> — {o.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

// =========================================================================================
// Traceability inspector
// =========================================================================================

export function TraceabilityInspector({
  d,
  filter,
  elementId,
  canOverride,
}: {
  d: ManifestDetail;
  filter: { kind?: string; room?: string; q?: string };
  elementId: string | null;
  canOverride: boolean;
}) {
  const rooms = d.manifest.elements.filter((e) => e.kind === "room");
  const { items, total } = filterElements(d.manifest, filter);
  const ex = elementId ? explainElement(d, elementId) : null;
  const gaps = traceabilityGaps(d);
  const base = `/cms/spatial?manifest=${d.summary.id}`;
  const qs = (el: string) => {
    const p = new URLSearchParams({ manifest: d.summary.id, element: el });
    if (filter.kind) p.set("kind", filter.kind);
    if (filter.room) p.set("room", filter.room);
    if (filter.q) p.set("q", filter.q);
    return `/cms/spatial?${p.toString()}#inspector-heading`;
  };
  return (
    <Section
      id="inspector-heading"
      title="Traceability inspector"
      description="Why each element is where it is: the rule that placed it, the concepts and relationships it presents, how each relationship is encoded and what the visitor does there."
    >
      <form method="get" action="/cms/spatial" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="manifest" value={d.summary.id} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-kind">Kind</Label>
          <NativeSelect id="f-kind" name="kind" defaultValue={filter.kind ?? ""}>
            <option value="">All kinds</option>
            {SPATIAL_ELEMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-room">Room</Label>
          <NativeSelect id="f-room" name="room" defaultValue={filter.room ?? ""}>
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label ?? r.id}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-q">Label or id contains</Label>
          <Input id="f-q" name="q" defaultValue={filter.q ?? ""} />
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        <Link href={base} className={BLOCK_LINK}>
          Clear
        </Link>
      </form>

      <div className="grid gap-5 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <nav aria-label="Manifest elements" className="max-h-[32rem] overflow-y-auto border-y-[1.5px] border-ink">
          <p className="text-credit border-b border-ink px-3 py-2" role="status">
            {total} element(s){total > items.length ? `, first ${items.length} shown` : ""}
          </p>
          <ul>
            {items.map((e) => (
              <li key={e.id}>
                <Link
                  href={qs(e.id)}
                  aria-current={e.id === elementId ? "true" : undefined}
                  className={cn(
                    "text-body flex min-h-11 items-center gap-2 border-b border-rule px-3 py-1 text-indigo hover:bg-sunk",
                    e.id === elementId && "bg-wash font-bold text-ink",
                  )}
                >
                  <span className="text-label">{e.kind}</span> <span className="min-w-0 underline decoration-1 underline-offset-[0.2em]">{e.label ?? e.id}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {ex ? (
            <article aria-labelledby="element-heading" className="text-body flex flex-col gap-4">
              <h3 id="element-heading" className="text-h3">
                {ex.element.label ? titleCase(ex.element.label) : ex.element.id} <span className="text-ink-3">({ex.element.kind})</span>
              </h3>
              <Dl
                items={[
                  ["Element id", <code key="i">{ex.element.id}</code>],
                  ["Inside", ex.parent ? `${ex.parent.label ?? ex.parent.id} (${ex.parent.kind})` : "—"],
                  [
                    "Placed by rule",
                    ex.rule ? (
                      <span key="r">
                        <code className="text-id">{ex.rule.id}</code>
                        {ex.rule.strategy ? ` (strategy ${ex.rule.strategy})` : ""}: {ex.rule.description}
                      </span>
                    ) : (
                      <code key="r">{ex.element.ruleId}</code>
                    ),
                  ],
                  ...(ex.otherRuleIds.length ? ([["Other rules involved", ex.otherRuleIds.join(", ")]] as [string, ReactNode][]) : []),
                  ["Rationale", ex.element.rationale],
                ]}
              />
              <div>
                <h4 className="text-label mb-1">Concepts Presented</h4>
                {ex.concepts.length === 0 ? (
                  <p className="text-ink-3">None (structural element).</p>
                ) : (
                  <ul className="list-disc pl-5">
                    {ex.concepts.map((c) => (
                      <li key={c.id}>
                        {c.title ?? c.id} {c.key ? <code className="text-id text-ink-3">{c.key}</code> : null} {c.type ? `(${c.type})` : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="text-label mb-1">Relationships</h4>
                {ex.relationships.length === 0 ? (
                  <p className="text-ink-3">None.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {ex.relationships.map((r) => (
                      <li key={r.id} className="border-t border-rule py-1 first:border-t-0">
                        <p>
                          <span className="font-medium">{r.source ?? "?"}</span> <code className="text-id">{r.type}</code> <span className="font-medium">{r.target ?? "?"}</span>
                        </p>
                        {r.explanation ? <p className="text-ink-3">{r.explanation}</p> : null}
                        {r.sources.length ? (
                          <p className="text-ink-3">Sources: {r.sources.map((s) => `${s.title}${s.locator ? `, ${s.locator}` : ""}`).join("; ")}</p>
                        ) : null}
                        {r.trace ? (
                          <p className="text-ink-3">
                            {r.trace.status === "encoded"
                              ? `Encoded as ${r.trace.encodings.map((e) => `${e.encoding} (rule ${e.ruleId})`).join(", ")}`
                              : `Not encoded: ${r.trace.reason ?? "no reason recorded"}`}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {ex.encodes.length ? (
                <div>
                  <h4 className="text-label mb-1">This Element Encodes</h4>
                  <ul className="list-disc pl-5">
                    {ex.encodes.map((e) => (
                      <li key={`${e.relationshipId}|${e.ruleId}`}>
                        {e.encoding} of relationship <code className="text-id">{e.relationshipId.slice(0, 8)}</code> by rule <code className="text-id">{e.ruleId}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <h4 className="text-label mb-1">Visitor Interactions</h4>
                <ul className="list-disc pl-5">
                  {ex.interactions.map((i, n) => (
                    <li key={n}>
                      {i.action} <code className="text-id text-ink-3">{i.event}</code>
                    </li>
                  ))}
                </ul>
              </div>
              {ex.overridesApplied.length ? (
                <div>
                  <h4 className="text-label mb-1">Manual Overrides Applied Here</h4>
                  <ul className="list-disc pl-5">
                    {ex.overridesApplied.map((o) => (
                      <li key={o.id}>
                        <code className="text-id">{o.field}</code>: {json(o.before)} to {json(o.after)}: {o.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {canOverride && d.summary.status !== "published" && d.summary.status !== "superseded" ? <OverrideForm d={d} elementId={ex.element.id} /> : null}
            </article>
          ) : (
            <p className="text-body text-ink-2">Select an element to see why it is where it is.</p>
          )}
        </div>
      </div>

      <Disclosure summary={<>Gaps: {gaps.concepts.length} concept(s) not placed, {gaps.relationships.length} relationship(s) not encoded</>}>
        <div className="text-body mt-2 grid gap-4 md:grid-cols-2">
          <ul className="list-disc pl-5">
            {gaps.concepts.map((c) => (
              <li key={c.conceptId}>
                <code className="text-id">{c.key}</code> — {c.status}
                {c.reason ? `: ${c.reason}` : ""}
              </li>
            ))}
          </ul>
          <ul className="list-disc pl-5">
            {gaps.relationships.map((r) => (
              <li key={r.relationshipId}>
                <code className="text-id">{r.type}</code> {r.relationshipId.slice(0, 8)} — {r.reason ?? "no reason recorded"}
              </li>
            ))}
          </ul>
        </div>
      </Disclosure>
    </Section>
  );
}

function OverrideForm({ d, elementId }: { d: ManifestDetail; elementId: string }) {
  return (
    <div className="flex flex-col gap-3 border-t border-rule-strong pt-3">
      <h4 className="text-label">Record a Manual Override</h4>
      <ActionForm action={createOverrideAction} submitLabel="Record override" resetOnSuccess>
        <input type="hidden" name="manifestId" value={d.summary.id} />
        <input type="hidden" name="targetElementId" value={elementId} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="ov-field">Field (JSON pointer)</Label>
          <Input id="ov-field" name="field" placeholder="/position/x" required aria-describedby="ov-field-help" />
          <p id="ov-field-help" className="text-body text-ink-2">
            Must already exist on the element, and the value must keep its JSON type. Not editable: {PROTECTED_ELEMENT_FIELDS.join(", ")}.
          </p>
          <FieldMessage name="field" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ov-value">New value (JSON)</Label>
          <Input id="ov-value" name="value" placeholder="12.5" required />
          <FieldMessage name="value" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ov-reason">Reason</Label>
          <Textarea id="ov-reason" name="reason" required minLength={3} rows={2} />
          <FieldMessage name="reason" />
        </div>
      </ActionForm>
    </div>
  );
}

// =========================================================================================
// Overrides and publishing
// =========================================================================================

export function OverridesPanel({ d, perms }: { d: ManifestDetail; perms: StudioPermissions }) {
  const draft = d.overrides.filter((o) => o.ruleSetStatus === "draft");
  return (
    <Section
      id="overrides-heading"
      title="Manual overrides"
      description={
        <>
          Overrides are recorded on a draft version of <code className="text-id">{d.overridesRuleSetName}</code>. Compiling with overrides freezes that version, so every manifest
          names the exact rules and overrides it came from. Overrides are never deleted; a revoked override stays in the record.
        </>
      }
    >
      {d.overrides.length === 0 ? (
        <p className="text-body text-ink-2">No override has been recorded for this lineage. Select an element in the inspector to record one.</p>
      ) : (
        <div>
          <Table label="Manual overrides by rule-set version" density="compact">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Version</TableHead>
                <TableHead scope="col">Element</TableHead>
                <TableHead scope="col">Field</TableHead>
                <TableHead scope="col">Value</TableHead>
                <TableHead scope="col">Reason</TableHead>
                <TableHead scope="col">By</TableHead>
                <TableHead scope="col">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.overrides.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    v{o.ruleSetVersion} ({o.ruleSetStatus})
                  </TableCell>
                  <TableCell>
                    <code className="text-id">{o.targetElementId}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-id">{o.field}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-id">{json(o.value)}</code>
                  </TableCell>
                  <TableCell className="whitespace-normal">{o.reason}</TableCell>
                  <TableCell>{o.createdByName ?? o.createdBy}</TableCell>
                  <TableCell className="whitespace-normal">
                    {o.revokedAt ? (
                      `Revoked: ${o.revokeReason ?? ""}`
                    ) : perms.override && o.ruleSetStatus === "draft" ? (
                      <ActionForm action={revokeOverrideAction} submitLabel="Revoke" submitVariant="outline" className="gap-2">
                        <input type="hidden" name="overrideId" value={o.id} />
                        <Label htmlFor={`rv-${o.id}`} className="sr-only">
                          Reason for revoking
                        </Label>
                        <Input id={`rv-${o.id}`} name="reason" placeholder="Reason" required minLength={3} />
                      </ActionForm>
                    ) : (
                      "Active"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {perms.compile && perms.override && d.overrides.length > 0 ? (
        <ManifestActionForm action={compileWithOverridesAction} submitLabel="Compile with overrides" pendingLabel="Compiling…" submitVariant="outline">
          <input type="hidden" name="manifestId" value={d.validation.baseManifestId ?? d.summary.id} />
          <p className="text-body text-ink-2">
            {draft.length > 0
              ? `Freezes the draft version (${draft.filter((o) => !o.revokedAt).length} active override(s)) and compiles this manifest's snapshot, traditions and seed with it.`
              : "Compiles this manifest's snapshot, traditions and seed with the latest frozen override version."}
          </p>
        </ManifestActionForm>
      ) : null}
    </Section>
  );
}

export function PublishPanel({ d }: { d: ManifestDetail }) {
  const s = d.summary;
  const blockers: string[] = [];
  if (s.status === "published" || s.status === "superseded") blockers.push(`This manifest is already ${s.status}.`);
  if (!s.passed || s.status !== "valid") blockers.push("Its validation did not pass.");
  if (s.snapshotKind !== "release" || s.snapshotStatus !== "published") blockers.push("It was not compiled from a published release snapshot.");
  if (s.ruleSetStatus !== "frozen") blockers.push("Its rule set is not frozen.");
  return (
    <Section
      id="publish-heading"
      title="Publish for study use"
      description="Publishing re-validates the manifest against its snapshot and rule set first. A published manifest is immutable; a study pins it."
    >
      {blockers.length ? (
        <ul className="list-disc pl-5 text-body text-ink-2">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <ActionForm action={publishManifestAction} submitLabel="Publish manifest" pendingLabel="Publishing…">
          <input type="hidden" name="manifestId" value={s.id} />
          <label className={CHECK_ROW}>
            <input type="checkbox" name="supersede" className={CHECK_BOX} />
            Mark other published manifests of this snapshot and these traditions as superseded
          </label>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pub-reason">Note (optional)</Label>
            <Textarea id="pub-reason" name="reason" rows={2} />
          </div>
        </ActionForm>
      )}
    </Section>
  );
}
